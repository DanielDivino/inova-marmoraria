import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/config/prisma.js';

/**
 * Orçamento do cliente Davis (projetos da residência), a partir da planilha
 * Davis_lista_completa_final.xlsx (as linhas citadas abaixo são as da planilha).
 *
 * Passa pela própria API (dentro do processo, com as mesmas validações, preços, cartões do fluxo e
 * auditoria da tela): cliente, orçamento com os projetos e peças (numa transação), aprovação e
 * início, e a situação de cada peça no fluxo de trabalho:
 * - "Entregue" na planilha → "Feito" = coluna "Produzido – entrega/montagem" (DONE). Não vira
 *   "Entregue" (DELIVERED): a entrega ao cliente é registrada depois, pela nota de entrega.
 * - O resto → "Em produção" = coluna "Em andamento" (IN_PROGRESS).
 * - Linha com parte entregue: as unidades se separam (1 de 2 no "Feito", 1 em "Em andamento").
 *
 * Idempotente: o orçamento importado fica marcado na auditoria (IMPORTED, chave abaixo); rodar de
 * novo não cria nada repetido e só completa os passos que faltaram.
 */
export const CHAVE_IMPORTACAO = 'davis-projetos-da-residencia';
export const TITULO = 'Davis — Projetos da residência';
const CLIENTE = 'Davis';
const MATERIAL = 'Preto São Gabriel';

type Lado = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';
type Situacao = 'FEITO' | 'EM_PRODUCAO';
type Peca = {
  /** Tipo do sistema: tampo, rodabanca, saia, lateral, peitoril, soleira, degrau ou componente. */
  tipo: 'TOP' | 'BACKSPLASH' | 'SKIRT' | 'SIDE_LEFT' | 'SIDE_RIGHT' | 'SILL' | 'THRESHOLD' | 'STEP' | 'OTHER';
  descricao?: string;
  /** Metros, como na planilha (guardados em milímetros, sem arredondar: 1,705 m → 1705 mm). */
  comprimento: number; largura: number; quantidade: number;
  /** Acabamento simples (reta) ou 45° (meia-esquadria) nos lados indicados. */
  acabamento?: { servico: 'Acabamento Simples' | 'Acabamento 45° — Granito/Mármore'; lados: Lado[] };
  /** Peça presa a outra deste projeto (rodabanca, saia, lateral, acabamento do nicho), pelo índice. */
  presaA?: number; lado?: Lado;
  /** Quantas unidades estão "Feito" (o resto fica "Em produção"). */
  feitas?: number;
  /** Medida provisória (falta informar): sem valor no orçamento. */
  semValor?: boolean;
};
type Recorte = { tipo: 'COOKTOP' | 'SINK' | 'SCULPTED_SINK'; descricao: string; peca: number };
type Projeto = { nome: string; ambiente?: string; tipoDoProduto: string; materialInformado: boolean; situacao: Situacao; pecas: Peca[]; recortes?: Recorte[] };

const mm = (metros: number) => Math.round(metros * 1000);
const simples = (...lados: Lado[]) => ({ servico: 'Acabamento Simples' as const, lados });
const rodabancas = (indice: number, fundo: number, lateral: number, descricaoLateral?: string, feitas?: number): Peca[] => [
  { tipo: 'BACKSPLASH', descricao: 'Rodabanca do fundo', comprimento: fundo, largura: 0.1, quantidade: 1, presaA: indice, lado: 'BACK', feitas },
  { tipo: 'BACKSPLASH', descricao: descricaoLateral ?? 'Rodabanca lateral', comprimento: lateral, largura: 0.1, quantidade: 1, presaA: indice, lado: 'LEFT', feitas },
];
const repetir = <T extends Peca>(pecas: T[], quantidade: number): T[] => pecas.map((peca) => ({ ...peca, quantidade: peca.quantidade * quantidade }));
const lista = (tipo: 'SILL' | 'THRESHOLD', linhas: [number, number, number, string?][]): Peca[] =>
  linhas.map(([quantidade, comprimento, largura, descricao]) => ({ tipo, comprimento, largura, quantidade, descricao }));

export const PROJETOS: Projeto[] = [
  // Linhas 3, 12, 13 e 14.
  {
    nome: 'Bancadas', tipoDoProduto: 'Bancada', materialInformado: true, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'TOP', descricao: 'Bancada 01', comprimento: 0.7, largura: 0.5, quantidade: 1 },
      ...rodabancas(0, 0.7, 0.5),
      { tipo: 'TOP', descricao: 'Bancada com cooktop', comprimento: 2.55, largura: 0.9, quantidade: 1, acabamento: simples('FRONT', 'BACK') },
      { tipo: 'SIDE_LEFT', descricao: 'Lateral esq. · bipolido · conferir', comprimento: 1.91, largura: 0.9, quantidade: 1, presaA: 3 },
      { tipo: 'SIDE_RIGHT', descricao: 'Lateral dir. · bipolido · conferir', comprimento: 1.91, largura: 0.9, quantidade: 1, presaA: 3 },
    ],
    recortes: [{ tipo: 'COOKTOP', descricao: 'Cooktop 4 bocas', peca: 3 }],
  },
  // Linha 15.
  {
    nome: 'Cuba esculpida', ambiente: 'Banheiro', tipoDoProduto: 'Bancada', materialInformado: true, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'TOP', descricao: 'Bancada com cuba esculpida', comprimento: 0.65, largura: 0.5, quantidade: 1, acabamento: simples('FRONT', 'RIGHT') },
      ...rodabancas(0, 0.65, 0.5),
    ],
    recortes: [{ tipo: 'SCULPTED_SINK', descricao: 'Cuba esculpida', peca: 0 }],
  },
  // Linha 16 (entregue).
  {
    nome: 'Banheiro master', ambiente: 'Banheiro master', tipoDoProduto: 'Bancada', materialInformado: false, situacao: 'FEITO', pecas: [
      { tipo: 'TOP', descricao: 'Bancada de sobrepor', comprimento: 1, largura: 0.55, quantidade: 1 },
      ...rodabancas(0, 1, 0.65, 'Rodabanca lateral · conferir 0,65'),
    ],
  },
  // Linhas 17 (2 bancadas, 1 entregue) e 18.
  {
    nome: 'WC', ambiente: 'WC', tipoDoProduto: 'Bancada', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'TOP', descricao: 'Bancada WC', comprimento: 0.6, largura: 0.5, quantidade: 2, acabamento: simples('FRONT', 'RIGHT'), feitas: 1 },
      ...repetir(rodabancas(0, 0.6, 0.5, undefined, 1), 2),
      { tipo: 'TOP', descricao: 'Bancada de sobrepor WC', comprimento: 0.6, largura: 0.5, quantidade: 1, acabamento: simples('FRONT', 'RIGHT') },
      ...rodabancas(3, 0.6, 0.5),
    ],
  },
  // Linha 19 (entregue).
  {
    nome: 'Cozinha — área seca', ambiente: 'Cozinha – área seca', tipoDoProduto: 'Bancada', materialInformado: false, situacao: 'FEITO', pecas: [
      { tipo: 'TOP', descricao: 'Bancada', comprimento: 3.1, largura: 0.65, quantidade: 1, acabamento: simples('FRONT', 'RIGHT') },
      ...rodabancas(0, 3.1, 0.65),
    ],
    recortes: [{ tipo: 'SINK', descricao: 'Cuba no meio', peca: 0 }],
  },
  // Linhas 5 e 6 (nichos filhos: 1 entregue, 1 falta).
  {
    nome: 'Nichos', ambiente: 'Banheiro', tipoDoProduto: 'Outro', materialInformado: true, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'OTHER', descricao: 'Nicho master · prof. 0,10 m', comprimento: 1.25, largura: 0.35, quantidade: 1 },
      { tipo: 'OTHER', descricao: 'Acabamento do nicho master', comprimento: 1.25, largura: 0.05, quantidade: 2, presaA: 0 },
      { tipo: 'OTHER', descricao: 'Acabamento do nicho master', comprimento: 0.35, largura: 0.05, quantidade: 2, presaA: 0 },
      { tipo: 'OTHER', descricao: 'Nicho filho · prof. 0,10 m', comprimento: 0.8, largura: 0.3, quantidade: 2, feitas: 1 },
      { tipo: 'OTHER', descricao: 'Acabamento do nicho filho', comprimento: 0.8, largura: 0.05, quantidade: 4, presaA: 3, feitas: 2 },
      { tipo: 'OTHER', descricao: 'Acabamento do nicho filho', comprimento: 0.3, largura: 0.05, quantidade: 4, presaA: 3, feitas: 2 },
    ],
  },
  // Linha 7.
  {
    nome: 'Chuveiro', ambiente: 'Chuveiro', tipoDoProduto: 'Outro', materialInformado: true, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'OTHER', descricao: 'Pedra para chuveiro', comprimento: 1.25, largura: 0.1, quantidade: 3 },
    ],
  },
  // Linhas 8 a 11.
  {
    nome: 'Escada', ambiente: 'Escada', tipoDoProduto: 'Escada', materialInformado: true, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'STEP', descricao: 'Degrau', comprimento: 1.06, largura: 0.35, quantidade: 14, acabamento: simples('FRONT', 'BACK', 'LEFT', 'RIGHT') },
      // Sem o comprimento: 1 mm provisório e sem valor, até a medida chegar.
      { tipo: 'OTHER', descricao: 'FALTA INFORMAR COMPRIMENTO', comprimento: 0.001, largura: 1.06, quantidade: 1, semValor: true },
      { tipo: 'OTHER', descricao: 'Peça especial · 45° em 3 arestas', comprimento: 1.15, largura: 1.29, quantidade: 1, acabamento: { servico: 'Acabamento 45° — Granito/Mármore', lados: ['FRONT', 'LEFT', 'RIGHT'] } },
      { tipo: 'SKIRT', descricao: 'Saia da escada', comprimento: 1.06, largura: 0.13, quantidade: 1, presaA: 0, lado: 'FRONT' },
    ],
  },
  // Linha 4 (citadas antes como vista; são soleiras).
  { nome: 'Soleiras iniciais', tipoDoProduto: 'Soleira', materialInformado: true, situacao: 'EM_PRODUCAO', pecas: lista('THRESHOLD', [[2, 0.8, 0.05]]) },
  // Linhas 24 a 27 (entregues).
  { nome: 'Soleiras — box dos banheiros', ambiente: 'Box banheiro', tipoDoProduto: 'Soleira', materialInformado: true, situacao: 'FEITO', pecas: lista('THRESHOLD', [[2, 0.9, 0.07], [2, 1.4, 0.07], [1, 1.45, 0.07], [1, 1.9, 0.07]]) },
  // Linhas 28 a 33 (entregues).
  { nome: 'Peitoris — 1º piso', ambiente: '1º piso', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'FEITO', pecas: lista('SILL', [[6, 1.04, 0.16], [1, 2.04, 0.16], [2, 2.9, 0.23], [2, 1.85, 0.16], [2, 1.1, 0.23], [1, 1, 0.16]]) },
  // Linhas 34 a 42 (entregues).
  {
    nome: 'Soleiras — 1º piso', ambiente: '1º piso', tipoDoProduto: 'Soleira', materialInformado: false, situacao: 'FEITO',
    pecas: lista('THRESHOLD', [[3, 0.74, 0.13], [1, 0.84, 0.14], [5, 0.84, 0.13], [1, 1, 0.15], [1, 1.04, 0.14], [1, 1.74, 0.13], [1, 2, 0.15], [1, 0.7, 0.13], [1, 1.65, 0.16]]),
  },
  // Linhas 43 a 52 (entregues).
  {
    nome: 'Peitoris — 2º piso', ambiente: '2º piso', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'FEITO',
    pecas: lista('SILL', [[5, 1.04, 0.16], [6, 0.62, 0.13], [1, 0.52, 0.16], [1, 1.84, 0.16], [2, 1.22, 0.23], [2, 1.44, 0.16],
      [2, 2.425, 0.23, 'Peitoril · metade de 4,85 m'], [2, 2.775, 0.23], [1, 0.84, 0.13], [1, 1.24, 0.16]]),
  },
  // Linhas 53 e 54 (entregues).
  { nome: 'Soleiras — 2º piso', ambiente: '2º piso', tipoDoProduto: 'Soleira', materialInformado: false, situacao: 'FEITO', pecas: lista('THRESHOLD', [[2, 0.82, 0.13], [2, 0.83, 0.13]]) },
  // Linhas 55 a 57.
  { nome: 'Cozinha — peitoris', ambiente: 'Cozinha', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: lista('SILL', [[1, 0.88, 0.23], [2, 2.44, 0.23, 'Peitoril · metade de 4,88 m'], [1, 1.21, 0.23]]) },
  // Linhas 58 a 60.
  { nome: 'Quarto filho — peitoris', ambiente: 'Quarto filho', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: lista('SILL', [[1, 1.705, 0.16], [2, 2.35, 0.16, 'Peitoril · metade de 4,70 m'], [1, 0.55, 0.16]]) },
  // Linha 61.
  { nome: 'Master — peitoril', ambiente: 'Master', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: lista('SILL', [[1, 2, 0.13]]) },
  // Linhas 62 e 63.
  { nome: 'Varandas — peitoris', ambiente: 'Varandas', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: lista('SILL', [[1, 3.57, 0.16], [1, 1.2, 0.16]]) },
  // Linha 64.
  { nome: 'Depósito — peitoril', ambiente: 'Depósito', tipoDoProduto: 'Peitoril', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: lista('SILL', [[1, 0.8, 0.13]]) },
  // Linhas 20 a 23.
  {
    nome: 'Edícula', ambiente: 'Edícula', tipoDoProduto: 'Outro', materialInformado: false, situacao: 'EM_PRODUCAO', pecas: [
      { tipo: 'OTHER', descricao: 'Peça edícula (principal)', comprimento: 4.7, largura: 1.67, quantidade: 1 },
      { tipo: 'OTHER', descricao: 'Peça edícula (complemento)', comprimento: 4.7, largura: 0.17, quantidade: 1 },
      { tipo: 'OTHER', descricao: 'Peça edícula (complemento)', comprimento: 4.45, largura: 0.17, quantidade: 1 },
      { tipo: 'OTHER', descricao: 'Peça edícula (complemento)', comprimento: 4.85, largura: 0.17, quantidade: 1 },
    ],
  },
];

const semMaterial = PROJETOS.filter((projeto) => !projeto.materialInformado).map((projeto) => projeto.nome);
/** Observações do orçamento (saem no PDF): o título e o que falta conferir. */
export const OBSERVACOES = [
  TITULO,
  'A conferir: comprimento de uma peça da escada (largura 1,06 m); medida das laterais (bipolidas) da bancada com cooktop antes do corte: 1,91 × 0,90 ou 0,90 × 0,91; rodabanca lateral da bancada do banheiro master: 0,65 × 0,10, com a bancada de 0,55.',
  'Peitoris divididos em duas partes iguais: 2 × 2,425 (2º piso) de uma peça de 4,85 × 0,23; 2 × 2,44 (cozinha) de 4,88 × 0,23; 2 × 2,35 (quarto filho) de 4,70 m.',
  `Material não informado na lista para: ${semMaterial.join(', ')}. Cadastrados em ${MATERIAL}, o material do orçamento: confirmar.`,
].join('\n');

type Resposta = { id: string; [chave: string]: unknown };
export type Usuario = { id: string; name: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SELLER'; maxDiscountPercent: number };
type Registro = (mensagem: string) => void;

/** Orçamento já importado (pela marca na auditoria), se ainda existir. */
async function orcamentoImportado() {
  const marca = await prisma.auditLog.findFirst({ where: { entityType: 'QUOTE', action: 'IMPORTED', current: { path: ['importacao'], equals: CHAVE_IMPORTACAO } }, orderBy: { createdAt: 'desc' } });
  const id = marca?.entityId ?? (await prisma.quote.findFirst({ where: { customer: { name: CLIENTE }, notes: { startsWith: TITULO } }, select: { id: true } }))?.id;
  return id ? prisma.quote.findUnique({ where: { id }, include: { items: { include: { components: { orderBy: { sortOrder: 'asc' } }, workflowCards: true }, orderBy: { id: 'asc' } } } }) : null;
}

/** Monta o orçamento como a tela envia: projetos com peças, acabamentos, recortes e peças presas. */
function corpoDoOrcamento(customerId: string, catalogo: { productTypes: { id: string; name: string }[]; materials: { id: string; name: string }[]; services: { id: string; name: string }[] }) {
  const porNome = <T extends { name: string }>(lista: T[], nome: string) => {
    const achado = lista.find((item) => item.name.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'));
    if (!achado) throw new Error(`Cadastro não encontrado no catálogo: ${nome}`);
    return achado;
  };
  const material = porNome(catalogo.materials, MATERIAL);
  return {
    customerId, notes: OBSERVACOES,
    items: PROJETOS.map((projeto) => ({
      projectName: projeto.nome, environment: projeto.ambiente ?? null, productTypeId: porNome(catalogo.productTypes, projeto.tipoDoProduto).id, materialId: material.id,
      calculationMode: 'DIMENSIONS' as const,
      components: projeto.pecas.map((peca, indice) => ({
        label: peca.descricao ?? '', componentType: peca.tipo, orientation: peca.tipo === 'SIDE_LEFT' || peca.tipo === 'SIDE_RIGHT' ? 'VERTICAL' as const : 'HORIZONTAL' as const,
        lengthMm: mm(peca.comprimento), widthMm: mm(peca.largura), quantity: peca.quantidade, sortOrder: indice,
        ...(peca.semValor ? { appliedTotal: 0 } : {}),
        edges: (peca.acabamento?.lados ?? []).map((lado) => ({ side: lado, serviceId: porNome(catalogo.services, peca.acabamento!.servico).id })),
      })),
      cutouts: (projeto.recortes ?? []).map((recorte, indice) => ({ componentIndex: recorte.peca, cutoutType: recorte.tipo, label: recorte.descricao, sizePending: true, quantity: 1, sortOrder: indice })),
      drawingData: { componentDetails: projeto.pecas.map((peca) => peca.presaA === undefined ? {} : { parentComponentIndex: peca.presaA, ...(peca.lado && ['BACKSPLASH', 'SKIRT'].includes(peca.tipo) ? { parentSide: peca.lado } : {}) }) },
    })),
  };
}

/**
 * Importa (ou completa) o orçamento do Davis pela API do sistema. `app` pronto (criarAplicacao);
 * `usuario`, quem cadastra (aparece como criador e na auditoria).
 */
export async function importarOrcamentoDavis(app: FastifyInstance, usuario: Usuario, registrar: Registro = console.log) {
  const token = app.jwt.sign({ ...usuario, tokenUse: 'access' });
  const pedir = async <T = Resposta>(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown): Promise<T> => {
    const resposta = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload === undefined ? {} : { payload: payload as object }) });
    if (resposta.statusCode >= 400) throw new Error(`${method} ${url} → ${resposta.statusCode}: ${resposta.body}`);
    return resposta.json() as T;
  };

  // 1) Cliente (sem telefone: fica como cadastro incompleto até completar).
  const existente = await prisma.customer.findFirst({ where: { name: { equals: CLIENTE, mode: 'insensitive' } }, select: { id: true } });
  const cliente = existente ?? await pedir<Resposta>('POST', '/customers', { name: CLIENTE, quick: true });
  registrar(existente ? `Cliente ${CLIENTE} já existe.` : `Cliente ${CLIENTE} cadastrado (sem telefone: cadastro incompleto).`);

  // 2) Orçamento com os projetos e peças (uma transação, como o "Salvar orçamento").
  let orcamento = await orcamentoImportado();
  if (orcamento) registrar(`Orçamento ${orcamento.number} já importado: nada é criado de novo.`);
  else {
    const catalogo = await pedir<{ productTypes: { id: string; name: string }[]; materials: { id: string; name: string }[]; services: { id: string; name: string }[] }>('GET', '/catalog');
    const criado = await pedir('POST', '/quotes', corpoDoOrcamento(cliente.id, catalogo));
    await prisma.auditLog.create({ data: { userId: usuario.id, entityType: 'QUOTE', entityId: criado.id, action: 'IMPORTED', current: { importacao: CHAVE_IMPORTACAO, planilha: 'Davis_lista_completa_final.xlsx' } as Prisma.InputJsonValue } });
    orcamento = (await orcamentoImportado())!;
    registrar(`Orçamento ${orcamento.number} criado com ${orcamento.items.length} projetos.`);
  }

  // 3) Aprovado e iniciado (como pelo botão "Aprovar" e "Iniciar serviço").
  if (orcamento.status !== 'APPROVED') await pedir('PATCH', `/quotes/${orcamento.id}/status`, { status: 'APPROVED' });
  if (orcamento.executionStatus === 'NOT_STARTED') {
    await pedir('PATCH', `/quotes/${orcamento.id}/status`, { status: 'APPROVED', executionStatus: 'IN_PROGRESS' });
    registrar('Orçamento aprovado e serviço iniciado.');
  }

  // 4) Situação no fluxo, só nos projetos que ainda não foram mexidos (cartão principal em "A fazer").
  const projetos = [...orcamento.items].sort((a, b) => PROJETOS.findIndex((p) => p.nome === a.projectName) - PROJETOS.findIndex((p) => p.nome === b.projectName));
  let movidos = 0;
  for (const projeto of projetos) {
    const dados = PROJETOS.find((item) => item.nome === projeto.projectName);
    const cartoes = projeto.workflowCards;
    if (!dados || cartoes.length !== 1 || cartoes[0].status !== 'TODO') continue;
    const cartao = cartoes[0].id;
    if (dados.situacao === 'FEITO') await pedir('PATCH', `/workflow/projects/${cartao}/move`, { status: 'DONE' });
    else {
      await pedir('PATCH', `/workflow/projects/${cartao}/move`, { status: 'IN_PROGRESS' });
      const feitas = Object.fromEntries(dados.pecas.flatMap((peca, indice) => peca.feitas ? [[projeto.components[indice].id, peca.feitas]] : []));
      if (Object.keys(feitas).length) await pedir('PATCH', `/workflow/projects/${cartao}/move`, { status: 'DONE', pieces: feitas });
    }
    movidos++;
  }
  registrar(movidos ? `Situação aplicada em ${movidos} projetos no fluxo de trabalho.` : 'Fluxo de trabalho já estava com a situação das peças.');
  return orcamento.id;
}
