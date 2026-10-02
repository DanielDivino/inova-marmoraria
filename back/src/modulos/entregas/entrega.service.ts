import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { alocarEntrega, conferirSelecaoPecas, distribuirPecas, nomeProjeto, numeroNotaEntrega, pecasDoProjeto, situacaoDasPecas, somarPecas, totalPecas, type MapaPecas, type PecaProjeto } from '@inova/domain';
import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import { AppError, type AuthUser } from '../../compartilhado/http.js';
import { entregarOrcamentoSeCompleto, entregarPecas, mapaPecasSchema, ordemDosCartoes, selectPecas } from '../fluxo/workflow.service.js';
import type { TechnicalDocument } from '@inova/domain/technical';
import { desenhosParaPecas } from '../desenhos/desenho-tecnico-do-orcamento.js';

type Tx = Prisma.TransactionClient;

export const novaEntregaSchema = z.object({ pieces: mapaPecasSchema });

/** Linha impressa na nota: a peça e a quantidade. */
export type LinhaNotaEntrega = { name: string; material: string | null; lengthMm: number | null; widthMm: number | null; quantity: number };
/** O que a nota imprime, guardado como foi gerado para reimprimir igual. */
export type DocumentoNotaEntrega = { projectName: string; delivered: LinhaNotaEntrega[]; remaining: LinhaNotaEntrega[]; deliveredBefore: number };
/** Nota geral (todos os projetos): de cada um, o entregue nesta nota, o já entregue antes e o que falta. */
export type ProjetoNotaGeral = { quoteItemId?: string; projectName: string; delivered: LinhaNotaEntrega[]; deliveredBefore: LinhaNotaEntrega[]; remaining: LinhaNotaEntrega[] };
export type DocumentoNotaEntregaGeral = { tipo: 'geral'; projects: ProjetoNotaGeral[] };
export const notaGeral = (documento: unknown): documento is DocumentoNotaEntregaGeral => (documento as DocumentoNotaEntregaGeral | null)?.tipo === 'geral';
/** Entrega geral: as peças entregues de cada projeto (projeto → peça → quantidade). */
export const entregaGeralSchema = z.object({ projects: z.record(z.string().cuid(), mapaPecasSchema) });

const selectProjetoEntrega = { ...selectPecas, workflowCards: { select: { id: true, pieces: true, status: true, position: true }, orderBy: ordemDosCartoes } } satisfies Prisma.QuoteItemSelect;
type ProjetoEntrega = Prisma.QuoteItemGetPayload<{ select: typeof selectProjetoEntrega }>;
type CartaoComPecas = { id: string; status: ProjetoEntrega['workflowCards'][number]['status']; position: number; mapa: MapaPecas };

function cartoesComPecas(projeto: ProjetoEntrega, desenho?: TechnicalDocument) {
  const pecas = pecasDoProjeto(projeto, desenho);
  const porCartao = distribuirPecas(pecas, projeto.workflowCards);
  const cartoes: CartaoComPecas[] = projeto.workflowCards.map((cartao) => ({ id: cartao.id, status: cartao.status, position: cartao.position, mapa: porCartao.get(cartao.id) ?? {} }));
  return { pecas, cartoes };
}
const somaDosCartoes = (cartoes: CartaoComPecas[], entregues: boolean) => cartoes.filter((cartao) => (cartao.status === 'DELIVERED') === entregues).reduce<MapaPecas>((soma, cartao) => somarPecas(soma, cartao.mapa), {});
const linhasDaNota = (pecas: PecaProjeto[], mapa: MapaPecas): LinhaNotaEntrega[] => pecas.filter((peca) => mapa[peca.chave])
  .map((peca) => ({ name: peca.nome, material: peca.material, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantity: mapa[peca.chave] }));

/** Por que o orçamento ainda não (ou já não) registra entregas; null quando pode. */
export function motivoSemEntrega(quote: { status: string; executionStatus: string }) {
  if (quote.status !== 'APPROVED') return 'A nota de entrega fica disponível depois que o orçamento é aprovado.';
  if (quote.executionStatus === 'NOT_STARTED') return 'Inicie o serviço para registrar entregas.';
  if (quote.executionStatus === 'PAUSED') return 'A produção está parada. Retome a produção para registrar entregas.';
  if (quote.executionStatus === 'COMPLETED') return 'Este orçamento já foi entregue.';
  return null;
}

/** Peças de cada projeto (entregues, prontas e em produção) e as notas já geradas. */
export async function listarEntregas(tx: Tx, quoteId: string, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: {
    number: true, status: true, executionStatus: true,
    items: { where: { declinedAt: null }, select: selectProjetoEntrega, orderBy: { id: 'asc' } },
    projectDeliveries: { orderBy: { sequence: 'asc' }, select: { id: true, quoteItemId: true, sequence: true, document: true, createdAt: true, createdBy: { select: { name: true } } } },
  } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  const reason = motivoSemEntrega(quote);
  const desenhos = await desenhosParaPecas(tx, quote.items);
  return { canDeliver: !reason, reason, projects: quote.items.map((projeto) => {
    const { pecas, cartoes } = cartoesComPecas(projeto, desenhos.get(projeto.id));
    return {
      id: projeto.id, name: nomeProjeto(projeto),
      pieces: situacaoDasPecas(pecas, cartoes).map((peca) => ({ key: peca.chave, name: peca.nome, material: peca.material, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantity: peca.quantidade, delivered: peca.entregues, ready: peca.prontas, inProduction: peca.emProducao })),
      notes: quote.projectDeliveries.filter((nota) => nota.quoteItemId === projeto.id).map((nota) => ({
        id: nota.id, number: numeroNotaEntrega(quote.number, nota.sequence), createdAt: nota.createdAt, createdBy: nota.createdBy.name,
        pieces: (nota.document as DocumentoNotaEntrega).delivered.reduce((total, linha) => total + linha.quantity, 0),
      })),
    };
  }),
  // Notas gerais (todos os projetos de uma vez), para reimprimir.
  generalNotes: quote.projectDeliveries.filter((nota) => nota.quoteItemId === null && notaGeral(nota.document)).map((nota) => {
    const documento = nota.document as unknown as DocumentoNotaEntregaGeral;
    return {
      id: nota.id, number: numeroNotaEntrega(quote.number, nota.sequence), createdAt: nota.createdAt, createdBy: nota.createdBy.name,
      pieces: documento.projects.reduce((total, projeto) => total + projeto.delivered.reduce((soma, linha) => soma + linha.quantity, 0), 0),
    };
  }) };
}

/**
 * Registra a entrega das peças escolhidas: elas vão para "Entregue" no fluxo
 * (dividindo o cartão quando é só parte) e a nota guarda o que foi entregue e o
 * que ainda falta. Entregue a última peça do orçamento, ele vai para o Histórico.
 */
export async function registrarEntrega(tx: Tx, quoteId: string, quoteItemId: string, input: z.infer<typeof novaEntregaSchema>, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: { id: true, number: true, status: true, executionStatus: true, completedAt: true } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  const reason = motivoSemEntrega(quote);
  if (reason) throw new AppError(409, reason, 'DELIVERY_UNAVAILABLE');
  const projeto = await tx.quoteItem.findFirst({ where: { id: quoteItemId, quoteId }, select: selectProjetoEntrega });
  if (!projeto) throw new AppError(404, 'Projeto não encontrado.', 'NOT_FOUND');
  const desenho = (await desenhosParaPecas(tx, [projeto])).get(projeto.id);
  const { pecas, cartoes } = cartoesComPecas(projeto, desenho);
  const conferida = conferirSelecaoPecas(somaDosCartoes(cartoes, false), input.pieces);
  if ('erro' in conferida) throw new AppError(422, conferida.erro, 'INVALID_PIECES');
  const alocacao = alocarEntrega(cartoes, conferida.selecao);
  if (!alocacao) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');
  await entregarPecas(tx, projeto.id, alocacao);

  const depois = cartoesComPecas(await tx.quoteItem.findUniqueOrThrow({ where: { id: projeto.id }, select: selectProjetoEntrega }), desenho);
  const document: DocumentoNotaEntrega = {
    projectName: nomeProjeto(projeto),
    delivered: linhasDaNota(pecas, conferida.selecao),
    remaining: linhasDaNota(pecas, somaDosCartoes(depois.cartoes, false)),
    deliveredBefore: totalPecas(somaDosCartoes(cartoes, true)),
  };
  const sequence = ((await tx.projectDelivery.aggregate({ where: { quoteId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
  const nota = await tx.projectDelivery.create({ data: { quoteId, quoteItemId: projeto.id, sequence, document: document as unknown as Prisma.InputJsonObject, createdById: user.id }, select: { id: true } });
  const number = numeroNotaEntrega(quote.number, sequence);
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE_ITEM', entityId: projeto.id, action: 'PROJECT_DELIVERY_CREATED', current: { quoteId, number, pieces: conferida.selecao } } });
  const quoteDelivered = await entregarOrcamentoSeCompleto(tx, quote, user);
  return { id: nota.id, number, quoteDelivered };
}

/**
 * Entrega geral: registra de uma vez as peças entregues de vários projetos (elas vão para "Entregue"
 * no fluxo) e gera uma nota só, com todos os projetos: o que foi entregue nesta nota, o que já tinha
 * sido entregue e o que ainda falta. Entregue a última peça, o orçamento vai para o Histórico.
 */
export async function registrarEntregaGeral(tx: Tx, quoteId: string, input: z.infer<typeof entregaGeralSchema>, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: { id: true, number: true, status: true, executionStatus: true, completedAt: true } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  const reason = motivoSemEntrega(quote);
  if (reason) throw new AppError(409, reason, 'DELIVERY_UNAVAILABLE');
  const projetos = await tx.quoteItem.findMany({ where: { quoteId, declinedAt: null }, select: selectProjetoEntrega, orderBy: { id: 'asc' } });
  const desconhecido = Object.keys(input.projects).find((id) => !projetos.some((projeto) => projeto.id === id));
  if (desconhecido) throw new AppError(404, 'Projeto não encontrado neste orçamento.', 'NOT_FOUND');
  if (!Object.values(input.projects).some((pecas) => totalPecas(pecas) > 0)) throw new AppError(422, 'Marque ao menos uma peça entregue.', 'INVALID_PIECES');
  const desenhos = await desenhosParaPecas(tx, projetos);
  const projects: ProjetoNotaGeral[] = [];
  for (const projeto of projetos) {
    const desenho = desenhos.get(projeto.id);
    const { pecas, cartoes } = cartoesComPecas(projeto, desenho);
    const pedido = input.projects[projeto.id] ?? {};
    let entregues: MapaPecas = {};
    if (totalPecas(pedido) > 0) {
      const conferida = conferirSelecaoPecas(somaDosCartoes(cartoes, false), pedido);
      if ('erro' in conferida) throw new AppError(422, `${nomeProjeto(projeto)}: ${conferida.erro}`, 'INVALID_PIECES');
      const alocacao = alocarEntrega(cartoes, conferida.selecao);
      if (!alocacao) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');
      await entregarPecas(tx, projeto.id, alocacao);
      entregues = conferida.selecao;
    }
    const depois = totalPecas(entregues) > 0 ? cartoesComPecas(await tx.quoteItem.findUniqueOrThrow({ where: { id: projeto.id }, select: selectProjetoEntrega }), desenho).cartoes : cartoes;
    projects.push({
      quoteItemId: projeto.id, projectName: nomeProjeto(projeto),
      delivered: linhasDaNota(pecas, entregues),
      deliveredBefore: linhasDaNota(pecas, somaDosCartoes(cartoes, true)),
      remaining: linhasDaNota(pecas, somaDosCartoes(depois, false)),
    });
  }
  const document: DocumentoNotaEntregaGeral = { tipo: 'geral', projects };
  const sequence = ((await tx.projectDelivery.aggregate({ where: { quoteId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
  const nota = await tx.projectDelivery.create({ data: { quoteId, quoteItemId: null, sequence, document: document as unknown as Prisma.InputJsonObject, createdById: user.id }, select: { id: true } });
  const number = numeroNotaEntrega(quote.number, sequence);
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE', entityId: quoteId, action: 'QUOTE_DELIVERY_CREATED', current: { number, projects: input.projects } } });
  const quoteDelivered = await entregarOrcamentoSeCompleto(tx, quote, user);
  return { id: nota.id, number, quoteDelivered };
}

/** Peça na nota de conferência: a situação de quem ainda falta (pronta, em produção). */
export type LinhaConferencia = LinhaNotaEntrega & { situacao?: string };
export type ProjetoConferencia = { projectName: string; delivered: LinhaConferencia[]; remaining: LinhaConferencia[]; notas: { number: string; createdAt: Date; pieces: number }[] };
export type Conferencia = {
  quote: { number: string; customerNameSnapshot: string; customerPhoneSnapshot: string | null; workAddressSnapshot: string | null };
  projects: ProjetoConferencia[]; geral: boolean;
};

/**
 * Nota de conferência: a situação de agora (gerada na hora, muda a cada entrega), do orçamento todo
 * ou de um projeto: de cada projeto, o que já foi entregue, o que falta (pronta ou em produção) e as
 * notas de entrega emitidas com peças dele (as do projeto e as gerais).
 */
export async function montarConferencia(tx: Tx, quoteId: string, user: AuthUser, quoteItemId?: string): Promise<Conferencia> {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: {
    number: true, customerNameSnapshot: true, customerPhoneSnapshot: true, workAddressSnapshot: true, status: true,
    items: { where: { declinedAt: null, ...(quoteItemId ? { id: quoteItemId } : {}) }, select: selectProjetoEntrega, orderBy: { id: 'asc' } },
    projectDeliveries: { orderBy: { sequence: 'asc' }, select: { quoteItemId: true, sequence: true, document: true, createdAt: true } },
  } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  if (quoteItemId && !quote.items.length) throw new AppError(404, 'Projeto não encontrado.', 'NOT_FOUND');
  if (quote.status !== 'APPROVED') throw new AppError(409, 'A conferência de entregas fica disponível depois que o orçamento é aprovado.', 'DELIVERY_UNAVAILABLE');
  const desenhos = await desenhosParaPecas(tx, quote.items);
  const projects = quote.items.map((projeto) => {
    const { pecas, cartoes } = cartoesComPecas(projeto, desenhos.get(projeto.id));
    const situacao = situacaoDasPecas(pecas, cartoes);
    const linha = (peca: (typeof situacao)[number], quantidade: number, texto?: string): LinhaConferencia => ({ name: peca.nome, material: peca.material, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantity: quantidade, ...(texto ? { situacao: texto } : {}) });
    const comoEsta = (peca: (typeof situacao)[number]) => [peca.prontas ? `${peca.prontas} ${peca.prontas === 1 ? 'pronta' : 'prontas'}` : '', peca.emProducao ? `${peca.emProducao} em produção` : ''].filter(Boolean).join(' · ');
    const notas = quote.projectDeliveries.flatMap((nota) => {
      const pecasDaNota = nota.quoteItemId === projeto.id ? (nota.document as unknown as DocumentoNotaEntrega).delivered.reduce((total, l) => total + l.quantity, 0)
        // Nota geral: o projeto pelo id (ou, nas primeiras notas gerais, que não guardavam o id, pelo nome).
        : nota.quoteItemId === null && notaGeral(nota.document) ? (nota.document.projects.find((item) => item.quoteItemId ? item.quoteItemId === projeto.id : item.projectName === nomeProjeto(projeto))?.delivered ?? []).reduce((total, l) => total + l.quantity, 0) : 0;
      return pecasDaNota ? [{ number: numeroNotaEntrega(quote.number, nota.sequence), createdAt: nota.createdAt, pieces: pecasDaNota }] : [];
    });
    return {
      projectName: nomeProjeto(projeto),
      delivered: situacao.filter((peca) => peca.entregues).map((peca) => linha(peca, peca.entregues)),
      remaining: situacao.filter((peca) => peca.quantidade > peca.entregues).map((peca) => linha(peca, peca.quantidade - peca.entregues, comoEsta(peca))),
      notas,
    };
  });
  return { quote, projects, geral: !quoteItemId };
}

export async function buscarNotaEntrega(tx: Tx, quoteId: string, deliveryId: string, user: AuthUser) {
  const nota = await tx.projectDelivery.findFirst({ where: { id: deliveryId, quoteId, quote: escopoOrcamentos(user) }, select: {
    sequence: true, document: true, createdAt: true,
    quote: { select: { number: true, customerNameSnapshot: true, customerPhoneSnapshot: true, workAddressSnapshot: true } },
  } });
  if (!nota) throw new AppError(404, 'Nota de entrega não encontrada.', 'NOT_FOUND');
  return { number: numeroNotaEntrega(nota.quote.number, nota.sequence), createdAt: nota.createdAt, quote: nota.quote, document: nota.document as unknown as DocumentoNotaEntrega | DocumentoNotaEntregaGeral };
}
