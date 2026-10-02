import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { importarOrcamentoDavis, PROJETOS, TITULO } from '../../back/scripts/importacoes/orcamento-davis.js';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de teste isolado obrigatório.');
// Orçamento do Davis (planilha Davis_lista_completa_final.xlsx) importado pela API do sistema.
const app = await criarAplicacao();
let auth: Record<string, string>;
let quoteId = '';
const get = async (url: string) => (await app.inject({ method: 'GET', url, headers: auth })).json();
const usuario = async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@inovamarmoraria.local' } });
  return { id: admin.id, name: admin.name, role: admin.role, maxDiscountPercent: Number(admin.maxDiscountPercent) };
};

beforeAll(async () => {
  await app.ready();
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'admin@inovamarmoraria.local', password: process.env.SEED_PASSWORD } });
  auth = { authorization: `Bearer ${login.json().accessToken}` };
  quoteId = await importarOrcamentoDavis(app, await usuario(), () => undefined);
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('Importação do orçamento do Davis', () => {
  it('cliente sem telefone, orçamento aprovado e iniciado, com os 20 projetos da planilha', async () => {
    const quote = await get(`/quotes/${quoteId}`);
    expect(quote).toMatchObject({ status: 'APPROVED', executionStatus: 'IN_PROGRESS', customerNameSnapshot: 'Davis' });
    expect(quote.notes.split('\n')[0]).toBe(TITULO);
    expect(await prisma.customer.findFirst({ where: { name: 'Davis' } })).toMatchObject({ isQuick: true, phone: null });
    expect(quote.items.map((item: any) => item.projectName)).toEqual(PROJETOS.map((projeto) => projeto.nome));
    // Quantidade de peças de cada projeto igual à da planilha (rodabancas e acabamentos dos nichos à parte).
    for (const projeto of PROJETOS) {
      const item = quote.items.find((entrada: any) => entrada.projectName === projeto.nome);
      expect(item.components.map((peca: any) => peca.quantity), projeto.nome).toEqual(projeto.pecas.map((peca) => peca.quantidade));
      expect(item.materialNameSnapshot).toBe('Preto São Gabriel');
    }
  });

  it('medidas exatas em milímetros, rodabancas presas à bancada e acabamentos por lado', async () => {
    const quote = await get(`/quotes/${quoteId}`);
    const projeto = (nome: string) => quote.items.find((item: any) => item.projectName === nome);
    const medidas = (nome: string) => projeto(nome).components.map((peca: any) => [peca.quantity, peca.lengthMm, peca.widthMm]);
    expect(medidas('Quarto filho — peitoris')).toEqual([[1, 1705, 160], [2, 2350, 160], [1, 550, 160]]);
    expect(medidas('Peitoris — 2º piso')).toContainEqual([2, 2425, 230]);
    expect(medidas('Peitoris — 2º piso')).toContainEqual([2, 2775, 230]);
    const bancadas = projeto('Bancadas');
    expect(bancadas.components.map((peca: any) => [peca.componentType, peca.label])).toEqual([
      ['TOP', 'Bancada 01'], ['BACKSPLASH', 'Rodabanca do fundo'], ['BACKSPLASH', 'Rodabanca lateral'], ['TOP', 'Bancada com cooktop'],
      ['SIDE_LEFT', expect.stringContaining('bipolido')], ['SIDE_RIGHT', expect.stringContaining('bipolido')],
    ]);
    expect(bancadas.drawingData.componentDetails.slice(0, 6)).toEqual([{}, { parentComponentIndex: 0, parentSide: 'BACK' }, { parentComponentIndex: 0, parentSide: 'LEFT' }, {}, { parentComponentIndex: 3 }, { parentComponentIndex: 3 }]);
    expect(bancadas.cutouts).toEqual([expect.objectContaining({ cutoutType: 'COOKTOP', label: 'Cooktop 4 bocas', sizePending: true })]);
    const escada = projeto('Escada').components;
    expect(escada[0].edges.map((borda: any) => [borda.side, borda.serviceNameSnapshot])).toEqual(['FRONT', 'BACK', 'LEFT', 'RIGHT'].map((lado) => [lado, 'Acabamento Simples']));
    expect(escada[2].edges.map((borda: any) => borda.serviceNameSnapshot)).toEqual(Array(3).fill('Acabamento 45° — Granito/Mármore'));
    // Peça sem comprimento: medida provisória sem valor, com o aviso na descrição.
    expect(escada[1]).toMatchObject({ label: expect.stringContaining('FALTA INFORMAR COMPRIMENTO'), widthMm: 1060, appliedTotal: 0 });
  });

  it('Entregue vira Feito (Produzido), não Entregue; linhas com parte entregue separam as unidades', async () => {
    const cartoes = (await get('/workflow/projects')).filter((cartao: any) => cartao.quote.id === quoteId);
    expect(cartoes.some((cartao: any) => cartao.status === 'DELIVERED' || cartao.status === 'TODO')).toBe(false);
    const doProjeto = (nome: string) => Object.fromEntries(cartoes.filter((cartao: any) => cartao.name === nome).map((cartao: any) => [cartao.status, cartao.pieces]));
    expect(doProjeto('Banheiro master')).toEqual({ DONE: 3 });
    expect(doProjeto('Peitoris — 1º piso')).toEqual({ DONE: 14 });
    expect(doProjeto('Escada')).toEqual({ IN_PROGRESS: 17 });
    // WC: 1 bancada com as 2 rodabancas feita; a outra e a de sobrepor (com as rodabancas) em produção.
    expect(doProjeto('WC')).toEqual({ DONE: 3, IN_PROGRESS: 6 });
    // Nichos: 1 nicho filho com os 4 acabamentos dele feito; o outro e o master em produção.
    expect(doProjeto('Nichos')).toEqual({ DONE: 5, IN_PROGRESS: 10 });
    // Na nota de entrega, as feitas aparecem prontas para entregar (nada foi entregue ainda).
    const entregas = await get(`/quotes/${quoteId}/entregas`);
    const wc = entregas.projects.find((projeto: any) => projeto.name === 'WC');
    expect(wc.pieces.find((peca: any) => peca.name === 'Bancada WC')).toMatchObject({ quantity: 2, ready: 1, delivered: 0 });
    expect(entregas.projects.flatMap((projeto: any) => projeto.notes)).toEqual([]);
  });

  it('rodar de novo não duplica nada', async () => {
    const antes = { quotes: await prisma.quote.count(), componentes: await prisma.quoteItemComponent.count(), cartoes: await prisma.workflowCard.count() };
    expect(await importarOrcamentoDavis(app, await usuario(), () => undefined)).toBe(quoteId);
    expect({ quotes: await prisma.quote.count(), componentes: await prisma.quoteItemComponent.count(), cartoes: await prisma.workflowCard.count() }).toEqual(antes);
    expect(await prisma.customer.count({ where: { name: 'Davis' } })).toBe(1);
  });

  it('Marcar como entregue: nota de entrega geral com todos os projetos (o entregue, o já entregue e o que falta)', async () => {
    const enviar = (projects: object) => app.inject({ method: 'POST', url: `/quotes/${quoteId}/entregas`, headers: auth, payload: { projects } });
    const conferencia = async (url: string) => execFileSync('pdftotext', ['-layout', '-', '-'], { input: (await app.inject({ method: 'GET', url, headers: auth })).rawPayload }).toString();
    // Nota de conferência antes de qualquer entrega: nada entregue, tudo listado como falta.
    const antes = await conferencia(`/quotes/${quoteId}/conferencia/pdf`);
    for (const trecho of ['NOTA DE CONFERÊNCIA GERAL', 'Entregue 0 de 139 peças', 'Faltam entregar', '1 pronta', 'em produção']) expect(antes).toContain(trecho);
    const situacao = await get(`/quotes/${quoteId}/entregas`);
    expect(situacao.generalNotes).toEqual([]);
    const wc = situacao.projects.find((projeto: any) => projeto.name === 'WC');
    const bancadaWc = wc.pieces.find((peca: any) => peca.name === 'Bancada WC');
    // Recusas: nada marcado, projeto de outro orçamento e mais peças do que faltam.
    expect((await enviar({})).json()).toMatchObject({ message: 'Marque ao menos uma peça entregue.' });
    expect((await enviar({ cprojetoinexistente0001: { x: 1 } })).statusCode).toBe(404);
    expect((await enviar({ [wc.id]: { [bancadaWc.key]: 3 } })).statusCode).toBe(422);
    // Entrega das prontas (as feitas): elas vão para "Entregue" no fluxo; o resto continua.
    const prontas = Object.fromEntries(situacao.projects.map((projeto: any) => [projeto.id, Object.fromEntries(projeto.pieces.filter((peca: any) => peca.ready).map((peca: any) => [peca.key, peca.ready]))]));
    const primeira = await enviar(prontas);
    expect(primeira.statusCode, primeira.body).toBe(201);
    expect(primeira.json()).toMatchObject({ number: expect.stringMatching(/\.1$/), quoteDelivered: false });
    const depois = await get(`/quotes/${quoteId}/entregas`);
    expect(depois.generalNotes).toEqual([expect.objectContaining({ number: primeira.json().number, pieces: 76 })]);
    expect(depois.projects.find((projeto: any) => projeto.name === 'WC').pieces.find((peca: any) => peca.name === 'Bancada WC')).toMatchObject({ delivered: 1, ready: 0 });
    const cartoes = (await get('/workflow/projects')).filter((cartao: any) => cartao.quote.id === quoteId);
    expect(cartoes.some((cartao: any) => cartao.status === 'DONE')).toBe(false);
    // A conferência, gerada de novo, já mostra a entrega e a nota.
    const meio = await conferencia(`/quotes/${quoteId}/conferencia/pdf`);
    expect(meio).toContain('Entregue 76 de 139 peças em 1 nota de entrega');
    expect(meio).toContain(`Notas de entrega: ${primeira.json().number}`);
    // O PDF da nota geral traz todos os projetos.
    const pdf = await app.inject({ method: 'GET', url: `/quotes/${quoteId}/entregas/${primeira.json().id}/pdf`, headers: auth });
    expect(pdf.headers['content-disposition']).toContain('Nota de entrega geral');
    const texto = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf.rawPayload }).toString();
    for (const trecho of ['NOTA DE ENTREGA GERAL', '20 projetos', 'Entrega parcial', 'Peitoris — 1º piso', 'Edícula', 'Ainda faltam entregar']) expect(texto).toContain(trecho);
    // Entrega do resto: com tudo entregue, o orçamento vai para o Histórico.
    const resto = Object.fromEntries(depois.projects.map((projeto: any) => [projeto.id, Object.fromEntries(projeto.pieces.filter((peca: any) => peca.quantity > peca.delivered).map((peca: any) => [peca.key, peca.quantity - peca.delivered]))]));
    const final = await enviar(resto);
    expect(final.json()).toMatchObject({ quoteDelivered: true });
    expect(await get(`/quotes/${quoteId}`)).toMatchObject({ executionStatus: 'COMPLETED' });
    const ultimo = execFileSync('pdftotext', ['-layout', '-', '-'], { input: (await app.inject({ method: 'GET', url: `/quotes/${quoteId}/entregas/${final.json().id}/pdf`, headers: auth })).rawPayload }).toString();
    expect(ultimo).toContain('Entrega final');
    expect(ultimo).toContain('Já entregues antes');
  });

  it('projeto entregue: conferência por projeto e nomes corrigidos sem perder a entrega', async () => {
    const quote = await get(`/quotes/${quoteId}`);
    expect(quote.executionStatus).toBe('COMPLETED');
    const wc = quote.items.find((item: any) => item.projectName === 'WC');
    const doWc = await execFileSync('pdftotext', ['-layout', '-', '-'], { input: (await app.inject({ method: 'GET', url: `/quotes/${quoteId}/items/${wc.id}/conferencia/pdf`, headers: auth })).rawPayload }).toString();
    for (const trecho of ['NOTA DE CONFERÊNCIA', 'Tudo entregue', 'WC', '9 de 9 peças entregues', 'Notas de entrega:']) expect(doWc).toContain(trecho);
    expect(doWc).not.toContain('Faltam entregar');
    // Editar nomes num orçamento entregue: só os nomes mudam; o projeto continua entregue.
    const nomes = (corpo: object) => app.inject({ method: 'PATCH', url: `/quotes/${quoteId}/items/${wc.id}/nomes`, headers: auth, payload: corpo });
    expect((await nomes({ projectName: 'WC', components: [{ id: 'cpecainexistente000001', label: 'x' }] })).statusCode).toBe(422);
    const bancada = wc.components.find((peca: any) => peca.label === 'Bancada WC');
    const renomeado = await nomes({ projectName: 'WC social', components: [{ id: bancada.id, label: 'Bancada do WC social' }] });
    expect(renomeado.statusCode, renomeado.body).toBe(200);
    const item = renomeado.json().items.find((entrada: any) => entrada.id === wc.id);
    expect(item.projectName).toBe('WC social');
    expect(item.components.find((peca: any) => peca.id === bancada.id)).toMatchObject({ label: 'Bancada do WC social', lengthMm: 600, widthMm: 500, quantity: 2 });
    expect(renomeado.json()).toMatchObject({ executionStatus: 'COMPLETED', grossTotal: quote.grossTotal, netTotal: quote.netTotal });
    const entregas = await get(`/quotes/${quoteId}/entregas`);
    const social = entregas.projects.find((projeto: any) => projeto.id === wc.id);
    expect(social.name).toBe('WC social');
    expect(social.pieces.find((peca: any) => peca.key === bancada.id)).toMatchObject({ name: 'Bancada do WC social', delivered: 2 });
    expect(await prisma.workflowCard.findMany({ where: { quoteItemId: wc.id }, select: { status: true } })).toEqual([{ status: 'DELIVERED' }]);
  });
});
