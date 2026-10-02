import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { itemSalvoParaEntrada } from '@inova/domain';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
type Auth = Record<string, string>;
let admin: Auth, catalog: any, sequence = 0;
const request = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, auth: Auth, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
async function login(email: string, password = process.env.SEED_PASSWORD!) {
  const response = await request('POST', '/auth/login', {}, { email, password });
  expect(response.statusCode, response.body).toBe(200);
  return { authorization: `Bearer ${response.json().accessToken}` };
}
type Peca = { label: string; componentType: string; quantity: number };
const item = (projectName: string, pecas: Peca[] = [{ label: 'Tampo', componentType: 'TOP', quantity: 1 }]) => ({ projectName, productTypeId: catalog.productTypes[0].id, materialId: catalog.materials[0].id,
  components: pecas.map((peca) => ({ ...peca, orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 600 })) });
/** Aprova e inicia a execução: só orçamentos em andamento entram no quadro. Projetos com peças próprias vêm como [nome, peças]. */
async function approvedQuote(auth: Auth, projects: (string | [string, Peca[]])[], executionStatus = 'IN_PROGRESS') {
  const customer = await request('POST', '/customers', auth, { name: `Cliente fluxo ${++sequence}`, phone: `9298711${String(sequence).padStart(4, '0')}` });
  expect(customer.statusCode, customer.body).toBe(201);
  const created = await request('POST', '/quotes', auth, { customerId: customer.json().id, items: projects.map((project) => typeof project === 'string' ? item(project) : item(...project)) });
  expect(created.statusCode, created.body).toBe(201);
  const approved = await request('PATCH', `/quotes/${created.json().id}/status`, auth, { status: 'APPROVED' });
  expect(approved.statusCode, approved.body).toBe(200);
  if (executionStatus === 'NOT_STARTED') return approved.json();
  const started = await request('PATCH', `/quotes/${created.json().id}/status`, auth, { status: 'APPROVED', executionStatus });
  expect(started.statusCode, started.body).toBe(200);
  return started.json();
}
const board = async (auth: Auth, quoteId: string) => (await request('GET', '/workflow/projects', auth)).json().filter((card: any) => card.quote.id === quoteId);
const column = (cards: any[], status: string) => cards.filter((card) => card.status === status).map((card) => card.name);
const move = async (auth: Auth, id: string, payload: object) => {
  const response = await request('PATCH', `/workflow/projects/${id}/move`, auth, payload);
  expect(response.statusCode, response.body).toBe(200); return response.json();
};

beforeAll(async () => {
  await app.ready();
  admin = await login('admin@inovamarmoraria.local');
  catalog = (await request('GET', '/catalog', admin)).json();
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('Fluxo de trabalho dos projetos', () => {
  it('põe os não iniciados em "Aguardando início", só move os em execução e deixa o histórico fora', async () => {
    const customer = (await request('POST', '/customers', admin, { name: 'Cliente rascunho fluxo', phone: '92987119999' })).json();
    const sent = (await request('POST', '/quotes', admin, { customerId: customer.id, items: [item('Aguardando aprovação')] })).json();
    expect((await board(admin, sent.id)).map((card: any) => card.quote.phase)).toEqual(['AWAITING_APPROVAL']);
    const notStarted = await approvedQuote(admin, ['Aprovado sem início'], 'NOT_STARTED');
    const waiting = (await board(admin, notStarted.id))[0];
    expect(waiting.quote.phase).toBe('AWAITING_START');
    expect((await request('PATCH', `/workflow/projects/${waiting.id}/move`, admin, { status: 'IN_PROGRESS' })).statusCode).toBe(404);
    const ready = await approvedQuote(admin, ['Pronto para entrega'], 'READY');
    expect((await board(admin, ready.id)).map((card: any) => card.quote.phase)).toEqual(['IN_EXECUTION']);
    const delivered = await request('PATCH', `/quotes/${ready.id}/status`, admin, { status: 'APPROVED', executionStatus: 'COMPLETED' });
    expect(delivered.statusCode, delivered.body).toBe(200);
    expect(await board(admin, ready.id)).toEqual([]);
    const rejected = await request('PATCH', `/quotes/${sent.id}/status`, admin, { status: 'REJECTED', reason: 'Cliente não aprovou' });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect(await board(admin, sent.id)).toEqual([]);
  });

  it('mostra o responsável do orçamento e as peças de cada projeto', async () => {
    const quote = await approvedQuote(admin, ['Bancada']);
    const worker = await request('POST', '/workers', admin, { name: 'Montador fluxo', workColor: '#aa5500' });
    expect(worker.statusCode, worker.body).toBe(201);
    expect((await board(admin, quote.id))[0]).toMatchObject({ pieces: 1, quote: { worker: null } });
    const assigned = await request('PUT', `/quotes/${quote.id}/worker`, admin, { workerId: worker.json().id });
    expect(assigned.statusCode, assigned.body).toBe(200);
    expect((await board(admin, quote.id))[0].quote.worker).toEqual({ id: worker.json().id, name: 'Montador fluxo', color: '#aa5500' });
  });

  it('guarda coluna, ordem e conclusão ao recarregar', async () => {
    const quote = await approvedQuote(admin, ['Cozinha', 'Banheiro', 'Lavanderia']);
    let cards = await board(admin, quote.id);
    expect(column(cards, 'TODO')).toEqual(['Cozinha', 'Banheiro', 'Lavanderia']);
    const id = (name: string) => cards.find((card: any) => card.name === name).id;
    const [cozinha, banheiro, lavanderia] = [id('Cozinha'), id('Banheiro'), id('Lavanderia')];

    await move(admin, banheiro, { status: 'IN_PROGRESS' });
    await move(admin, lavanderia, { status: 'IN_PROGRESS', afterId: banheiro });
    await move(admin, lavanderia, { status: 'IN_PROGRESS', beforeId: banheiro });
    const done = await move(admin, cozinha, { status: 'DONE' });
    expect(done.completedAt).toEqual(expect.any(String));

    cards = await board(admin, quote.id);
    expect(column(cards, 'IN_PROGRESS')).toEqual(['Lavanderia', 'Banheiro']);
    expect(column(cards, 'DONE')).toEqual(['Cozinha']);
    const reopened = await move(admin, cozinha, { status: 'TODO' });
    expect(reopened.completedAt).toBeNull();
    const conflict = await request('PATCH', `/workflow/projects/${cozinha}/move`, admin, { status: 'DONE', afterId: banheiro });
    expect(conflict.statusCode).toBe(409);
  });

  it('marca e tira a falta de material do projeto; ao produzir, a marca sai sozinha', async () => {
    const quote = await approvedQuote(admin, ['Cozinha', 'Banheiro']);
    let cards = await board(admin, quote.id);
    expect(cards.every((card: any) => card.materialMissing === false)).toBe(true);
    const cozinha = cards.find((card: any) => card.name === 'Cozinha').id;
    const marcar = async (faltaMaterial: boolean) => {
      const response = await request('PATCH', `/workflow/projects/${cozinha}/material`, admin, { faltaMaterial });
      expect(response.statusCode, response.body).toBe(200); return response.json();
    };
    expect((await marcar(true)).materialMissing).toBe(true);
    cards = await board(admin, quote.id);
    expect(cards.find((card: any) => card.id === cozinha).materialMissing).toBe(true);
    expect(cards.find((card: any) => card.name === 'Banheiro').materialMissing).toBe(false);
    // Marcar não muda etapa nem ordem.
    expect(column(cards, 'TODO')).toEqual(['Cozinha', 'Banheiro']);
    expect((await marcar(false)).materialMissing).toBe(false);
    await marcar(true);
    await move(admin, cozinha, { status: 'IN_PROGRESS' });
    expect((await board(admin, quote.id)).find((card: any) => card.id === cozinha).materialMissing).toBe(true);
    const produzido = await move(admin, cozinha, { status: 'DONE' });
    expect(produzido.materialMissing).toBe(false);
    const invalido = await request('PATCH', `/workflow/projects/${cozinha}/material`, admin, { faltaMaterial: 'sim' });
    expect(invalido.statusCode).toBe(422);
  });

  it('parar a produção tira os projetos das colunas (sem mover) e retomar devolve cada um para onde estava', async () => {
    const quote = await approvedQuote(admin, ['Cozinha', 'Banheiro']);
    let cards = await board(admin, quote.id);
    const cozinha = cards.find((card: any) => card.name === 'Cozinha').id;
    await move(admin, cozinha, { status: 'IN_PROGRESS' });
    const status = async (payload: object) => {
      const response = await request('PATCH', `/quotes/${quote.id}/status`, admin, payload);
      expect(response.statusCode, response.body).toBe(200); return response.json();
    };
    const parado = await status({ status: 'APPROVED', executionStatus: 'PAUSED', reason: 'Produção parada' });
    expect(parado.executionStatus).toBe('PAUSED');
    cards = await board(admin, quote.id);
    expect(cards.every((card: any) => card.quote.phase === 'PAUSED')).toBe(true);
    const bloqueado = await request('PATCH', `/workflow/projects/${cozinha}/move`, admin, { status: 'DONE' });
    expect(bloqueado.statusCode).toBe(404);
    // Continua em Orçamentos (não é histórico) e aparece no filtro "Produção parada".
    const ativos = (await request('GET', '/quotes?scope=active&workStatus=PAUSED&limit=100', admin)).json();
    expect(ativos.data.some((entrada: any) => entrada.id === quote.id)).toBe(true);
    await status({ status: 'APPROVED', executionStatus: 'IN_PROGRESS', reason: 'Produção retomada' });
    cards = await board(admin, quote.id);
    expect(cards.every((card: any) => card.quote.phase === 'IN_EXECUTION')).toBe(true);
    expect(column(cards, 'IN_PROGRESS')).toEqual(['Cozinha']);
    expect(column(cards, 'TODO')).toEqual(['Banheiro']);
  });

  it('cliente desistiu: orçamento em produção vai para o Histórico e sai do fluxo, sem apagar nada', async () => {
    const quote = await approvedQuote(admin, ['Cozinha']);
    const response = await request('PATCH', `/quotes/${quote.id}/status`, admin, { status: 'CANCELLED', reason: 'Cliente desistiu' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: 'CANCELLED', approvedAt: expect.any(String) });
    expect(await board(admin, quote.id)).toEqual([]);
    const historico = (await request('GET', '/quotes?scope=history&limit=100', admin)).json();
    expect(historico.data.some((entrada: any) => entrada.id === quote.id)).toBe(true);
    expect((await request('GET', `/quotes/${quote.id}`, admin)).statusCode).toBe(200);
  });

  it('leva até a entrega e, com o último projeto entregue, manda o orçamento para o Histórico', async () => {
    const quote = await approvedQuote(admin, ['Bancada', 'Soleira']);
    const cards = await board(admin, quote.id);
    const [bancada, soleira] = ['Bancada', 'Soleira'].map((name) => cards.find((card: any) => card.name === name).id);
    const concluido = await move(admin, bancada, { status: 'DONE' });
    expect(concluido.completedAt).toEqual(expect.any(String));
    const primeira = await move(admin, bancada, { status: 'DELIVERED' });
    expect(primeira).toMatchObject({ status: 'DELIVERED', quoteDelivered: false, completedAt: concluido.completedAt });
    expect((await request('GET', `/quotes/${quote.id}`, admin)).json().executionStatus).toBe('IN_PROGRESS');
    const ultima = await move(admin, soleira, { status: 'DELIVERED' });
    expect(ultima.quoteDelivered).toBe(true);
    const entregue = (await request('GET', `/quotes/${quote.id}`, admin)).json();
    expect(entregue).toMatchObject({ executionStatus: 'COMPLETED', completedAt: expect.any(String) });
    expect(await board(admin, quote.id)).toEqual([]);
    const ids = async (scope: string) => (await request('GET', `/quotes?scope=${scope}&search=${encodeURIComponent(quote.number)}`, admin)).json().data.map((entry: any) => entry.id);
    expect(await ids('history')).toContain(quote.id);
    expect(await ids('active')).not.toContain(quote.id);
  });

  it('mantém coluna e posição quando a edição do orçamento recria o projeto', async () => {
    const quote = await approvedQuote(admin, ['Escada', 'Soleira']);
    const cards = await board(admin, quote.id);
    const escada = cards.find((card: any) => card.name === 'Escada');
    const moved = await move(admin, escada.id, { status: 'IN_PROGRESS' });
    const saved = (await request('GET', `/quotes/${quote.id}`, admin)).json();
    const items = saved.items.map(itemSalvoParaEntrada);
    items.find((entry: any) => entry.projectName === 'Escada').components[0].lengthMm = 1500;
    const edited = await request('PUT', `/quotes/${quote.id}`, admin, { customerId: saved.customerId, expectedUpdatedAt: saved.updatedAt, discountAmount: saved.discountAmount, notes: saved.notes, validUntil: saved.validUntil, items });
    expect(edited.statusCode, edited.body).toBe(200);
    const after = (await board(admin, quote.id)).find((card: any) => card.id === escada.id);
    expect(after).toMatchObject({ status: 'IN_PROGRESS', position: moved.position });
  });

  it('o vendedor vê e move só os projetos dos próprios orçamentos', async () => {
    const created = await request('POST', '/users', admin, { name: 'Vendedor fluxo', email: 'fluxo-vendedor@example.test', password: 'FluxoTest@2026', role: 'SELLER', maxDiscountPercent: 10 });
    expect(created.statusCode, created.body).toBe(201);
    const seller = await login('fluxo-vendedor@example.test', 'FluxoTest@2026');
    const own = await approvedQuote(seller, ['Projeto do vendedor']);
    const other = await approvedQuote(admin, ['Projeto do administrador']);
    const visible = (await request('GET', '/workflow/projects', seller)).json();
    expect(visible.map((card: any) => card.quote.id)).toEqual([own.id]);
    const hidden = (await board(admin, other.id))[0];
    expect((await request('PATCH', `/workflow/projects/${hidden.id}/move`, seller, { status: 'DONE' })).statusCode).toBe(404);
    expect((await request('GET', '/workflow/projects', {})).statusCode).toBe(401);
  });
});

/** Chave de cada peça do projeto (id do componente), pelo nome. */
const chaves = (card: any) => Object.fromEntries(card.pieceList.map((peca: any) => [peca.name, peca.key]));
const pecasPorEtapa = (cards: any[]) => Object.fromEntries(cards.map((card: any) => [card.status, Object.fromEntries(card.pieceList.map((peca: any) => [peca.name, peca.quantity]))]));

describe('Produção e entrega por peças', () => {
  const soleiras: [string, Peca[]] = ['Soleiras', [{ label: 'Soleira', componentType: 'THRESHOLD', quantity: 3 }, { label: 'Peitoril', componentType: 'SILL', quantity: 1 }]];

  it('produziu só parte: as peças produzidas viram outro cartão e, quando o resto chega, voltam a ser um só', async () => {
    const quote = await approvedQuote(admin, [soleiras]);
    let [cartao] = await board(admin, quote.id);
    expect(cartao).toMatchObject({ pieces: 4, totalPieces: 4, projectId: cartao.id });
    const chave = chaves(cartao);
    await move(admin, cartao.id, { status: 'IN_PROGRESS' });

    const parte = await move(admin, cartao.id, { status: 'DONE', pieces: { [chave.Soleira]: 2, [chave.Peitoril]: 0 } });
    expect(parte).toMatchObject({ status: 'DONE', pieces: 2, totalPieces: 4, projectId: cartao.id, completedAt: expect.any(String) });
    expect(parte.id).not.toBe(cartao.id);
    expect(parte.projectCards).toHaveLength(2);
    expect(pecasPorEtapa(await board(admin, quote.id))).toEqual({ IN_PROGRESS: { Soleira: 1, Peitoril: 1 }, DONE: { Soleira: 2 } });

    // Seleção inválida: mais do que o cartão tem, nenhuma peça ou para a mesma etapa.
    for (const [pieces, status] of [[{ [chave.Soleira]: 2 }, 'DONE'], [{ [chave.Soleira]: 0 }, 'DONE'], [{ [chave.Soleira]: 1 }, 'IN_PROGRESS'], [{ outra: 1 }, 'DONE']] as const) {
      expect((await request('PATCH', `/workflow/projects/${cartao.id}/move`, admin, { status, pieces })).statusCode).toBe(422);
    }

    // Entregou 1 das 2 produzidas: a parte se divide de novo.
    const entregue = await move(admin, parte.id, { status: 'DELIVERED', pieces: { [chave.Soleira]: 1 } });
    expect(entregue).toMatchObject({ status: 'DELIVERED', pieces: 1, quoteDelivered: false });
    expect(pecasPorEtapa(await board(admin, quote.id))).toEqual({ IN_PROGRESS: { Soleira: 1, Peitoril: 1 }, DONE: { Soleira: 1 }, DELIVERED: { Soleira: 1 } });

    // O resto foi produzido: junta com o que já estava em "Produzido", no cartão principal.
    const junto = await move(admin, cartao.id, { status: 'DONE' });
    expect(junto).toMatchObject({ id: cartao.id, pieces: 3 });
    const cards = await board(admin, quote.id);
    expect(pecasPorEtapa(cards)).toEqual({ DONE: { Soleira: 2, Peitoril: 1 }, DELIVERED: { Soleira: 1 } });
    [cartao] = cards.filter((card: any) => card.status === 'DONE');
    expect(cartao.id).toBe(junto.id);
  });

  it('editar o orçamento não desfaz a divisão por peças', async () => {
    const quote = await approvedQuote(admin, [soleiras]);
    const [cartao] = await board(admin, quote.id);
    await move(admin, cartao.id, { status: 'DONE', pieces: { [chaves(cartao).Soleira]: 2 } });
    const saved = (await request('GET', `/quotes/${quote.id}`, admin)).json();
    const items = saved.items.map(itemSalvoParaEntrada);
    items[0].components[1].lengthMm = 1200;
    const edited = await request('PUT', `/quotes/${quote.id}`, admin, { customerId: saved.customerId, expectedUpdatedAt: saved.updatedAt, discountAmount: saved.discountAmount, notes: saved.notes, validUntil: saved.validUntil, items });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(pecasPorEtapa(await board(admin, quote.id))).toEqual({ TODO: { Soleira: 1, Peitoril: 1 }, DONE: { Soleira: 2 } });
  });

  it('nota de entrega: escolhe quantas peças entrega, marca quantas faltam e, na última, manda o orçamento para o Histórico', async () => {
    const quote = await approvedQuote(admin, [['Cozinha', [{ label: 'Bancada', componentType: 'COUNTER', quantity: 1 }, { label: 'Rodabanca', componentType: 'BACKSPLASH', quantity: 2 }]], 'Banheiro']);
    const entregas = async () => { const response = await request('GET', `/quotes/${quote.id}/entregas`, admin); expect(response.statusCode, response.body).toBe(200); return response.json(); };
    const entregar = (itemId: string, pieces: object) => request('POST', `/quotes/${quote.id}/items/${itemId}/entregas`, admin, { pieces });
    let situacao = await entregas();
    expect(situacao).toMatchObject({ canDeliver: true, reason: null });
    const cozinha = situacao.projects.find((projeto: any) => projeto.name === 'Cozinha');
    const banheiro = situacao.projects.find((projeto: any) => projeto.name === 'Banheiro');
    const chave = Object.fromEntries(cozinha.pieces.map((peca: any) => [peca.name, peca.key]));
    expect(cozinha.pieces.map((peca: any) => [peca.name, peca.quantity, peca.delivered, peca.ready, peca.inProduction])).toEqual([['Bancada', 1, 0, 0, 1], ['Rodabanca', 2, 0, 0, 2]]);
    await move(admin, cozinha.id, { status: 'DONE' });

    const primeira = await entregar(cozinha.id, { [chave.Rodabanca]: 1 });
    expect(primeira.statusCode, primeira.body).toBe(201);
    expect(primeira.json()).toMatchObject({ number: `ENT-${quote.number.replace(/^[A-Za-z]+-/, '')}.1`, quoteDelivered: false });
    situacao = await entregas();
    const depois = situacao.projects.find((projeto: any) => projeto.id === cozinha.id);
    expect(depois.pieces.map((peca: any) => [peca.name, peca.delivered, peca.ready])).toEqual([['Bancada', 0, 1], ['Rodabanca', 1, 1]]);
    expect(depois.notes).toEqual([expect.objectContaining({ id: primeira.json().id, number: primeira.json().number, pieces: 1 })]);
    expect(pecasPorEtapa((await board(admin, quote.id)).filter((card: any) => card.projectId === cozinha.id))).toEqual({ DONE: { Bancada: 1, Rodabanca: 1 }, DELIVERED: { Rodabanca: 1 } });

    const pdf = await request('GET', `/quotes/${quote.id}/entregas/${primeira.json().id}/pdf`, admin);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const dir = mkdtempSync(join(tmpdir(), 'nota-entrega-'));
    writeFileSync(join(dir, 'nota.pdf'), pdf.rawPayload);
    const texto = execFileSync('pdftotext', ['-layout', join(dir, 'nota.pdf'), '-'], { encoding: 'utf8', timeout: 10000 });
    rmSync(dir, { recursive: true, force: true });
    for (const trecho of ['NOTA DE ENTREGA E CONFERÊNCIA', primeira.json().number, 'Cozinha', 'Entrega parcial — 1 peça nesta nota. Ainda faltam 2 peças, listadas abaixo.', 'Peças que ainda faltam entregar', 'Conferido', 'Total de peças', `${primeira.json().number} · Página 1 de 1`]) expect(texto).toContain(trecho);

    expect((await entregar(cozinha.id, { [chave.Rodabanca]: 2 })).statusCode).toBe(422);
    const segunda = await entregar(cozinha.id, { [chave.Bancada]: 1, [chave.Rodabanca]: 1 });
    expect(segunda.json()).toMatchObject({ number: expect.stringMatching(/\.2$/), quoteDelivered: false });
    expect((await board(admin, quote.id)).filter((card: any) => card.projectId === cozinha.id)).toEqual([expect.objectContaining({ id: cozinha.id, status: 'DELIVERED', pieces: 3 })]);

    // O banheiro nem começou: a entrega tira direto de "A fazer" e fecha o orçamento.
    const ultima = await entregar(banheiro.id, { [banheiro.pieces[0].key]: 1 });
    expect(ultima.json()).toMatchObject({ quoteDelivered: true });
    expect((await request('GET', `/quotes/${quote.id}`, admin)).json().executionStatus).toBe('COMPLETED');
    expect(await entregas()).toMatchObject({ canDeliver: false, reason: 'Este orçamento já foi entregue.' });
    expect((await entregar(banheiro.id, { [banheiro.pieces[0].key]: 1 })).statusCode).toBe(409);
    // As notas continuam reimprimíveis.
    expect((await request('GET', `/quotes/${quote.id}/entregas/${ultima.json().id}/pdf`, admin)).statusCode).toBe(200);
  });

  it('só registra entrega de orçamento em execução e do próprio vendedor', async () => {
    const naoIniciado = await approvedQuote(admin, ['Lavabo'], 'NOT_STARTED');
    const situacao = (await request('GET', `/quotes/${naoIniciado.id}/entregas`, admin)).json();
    expect(situacao).toMatchObject({ canDeliver: false, reason: 'Inicie o serviço para registrar entregas.' });
    const projeto = situacao.projects[0];
    const bloqueada = await request('POST', `/quotes/${naoIniciado.id}/items/${projeto.id}/entregas`, admin, { pieces: { [projeto.pieces[0].key]: 1 } });
    expect(bloqueada.statusCode).toBe(409);
    const seller = await login('fluxo-vendedor@example.test', 'FluxoTest@2026');
    expect((await request('GET', `/quotes/${naoIniciado.id}/entregas`, seller)).statusCode).toBe(404);
  });
  it('retrabalho de um projeto: as peças voltam (para entregar de novo ou refazer) e o orçamento entregue reabre', async () => {
    const quote = await approvedQuote(admin, ['Cozinha', 'Banheiro']);
    const cozinha = quote.items.find((projeto: any) => projeto.projectName === 'Cozinha');
    const retrabalho = (corpo: object) => request('POST', `/quotes/${quote.id}/items/${cozinha.id}/retrabalho`, admin, corpo);
    // Ainda em produção: nada volta.
    expect((await retrabalho({ destino: 'DONE' })).json()).toMatchObject({ error: 'NOTHING_TO_REWORK' });
    for (const card of await board(admin, quote.id)) await move(admin, card.id, { status: 'DELIVERED' });
    expect((await request('GET', `/quotes/${quote.id}`, admin)).json()).toMatchObject({ executionStatus: 'COMPLETED' });

    const entregarDeNovo = await retrabalho({ destino: 'DONE', motivo: 'Peça entregue no endereço errado' });
    expect(entregarDeNovo.statusCode, entregarDeNovo.body).toBe(200);
    expect(entregarDeNovo.json()).toMatchObject({ executionStatus: 'REWORK', completedAt: null });
    const quadro = await board(admin, quote.id);
    expect([column(quadro, 'DONE'), column(quadro, 'DELIVERED')]).toEqual([['Cozinha'], ['Banheiro']]);
    expect((await retrabalho({ destino: 'IN_PROGRESS' })).statusCode).toBe(200);
    expect(column(await board(admin, quote.id), 'IN_PROGRESS')).toEqual(['Cozinha']);
    const eventos = (await request('GET', `/quotes/${quote.id}/historico`, admin)).json().eventos.map((evento: any) => [evento.titulo, evento.detalhe ?? '']);
    expect(eventos).toContainEqual(['Cozinha em retrabalho', 'Volta para “Produzido – entrega/montagem” · Peça entregue no endereço errado']);
    expect(eventos).toContainEqual(['Cozinha em retrabalho', 'Volta para “Em andamento”']);
    expect(eventos.filter(([titulo]: string[]) => titulo === 'Encaminhado para retrabalho')).toHaveLength(1);
    // Serviço ainda não iniciado: sem retrabalho.
    const naoIniciado = await approvedQuote(admin, ['Lavabo'], 'NOT_STARTED');
    expect((await request('POST', `/quotes/${naoIniciado.id}/items/${naoIniciado.items[0].id}/retrabalho`, admin, { destino: 'IN_PROGRESS' })).json()).toMatchObject({ error: 'REWORK_UNAVAILABLE' });
  });
});

describe('Não aprovado / alterar', () => {
  it('tira só as peças que o cliente não aprovou, sem mexer nas entregues, e o projeto inteiro quando são todas', async () => {
    const customer = (await request('POST', '/customers', admin, { name: 'Cliente peças não aprovadas', phone: '92987118888' })).json();
    const base = item('Cozinha', [{ label: 'Bancada', componentType: 'COUNTER', quantity: 2 }, { label: 'Rodabanca', componentType: 'BACKSPLASH', quantity: 2 }, { label: 'Soleira', componentType: 'THRESHOLD', quantity: 3 }]);
    const cozinha = { ...base, components: base.components.map((peca: any) => peca.label === 'Soleira' ? { ...peca, appliedTotal: 300 } : peca),
      drawingData: { componentDetails: [{}, { parentComponentIndex: 0, parentSide: 'BACK' }] }, cutouts: [{ cutoutType: 'SINK', componentIndex: 0, quantity: 2, label: 'Cuba' }] };
    const criado = await request('POST', '/quotes', admin, { customerId: customer.id, items: [cozinha, item('Lavabo')] });
    expect(criado.statusCode, criado.body).toBe(201);
    const quoteId = criado.json().id;
    expect((await request('PATCH', `/quotes/${quoteId}/status`, admin, { status: 'APPROVED' })).statusCode).toBe(200);
    const iniciado = await request('PATCH', `/quotes/${quoteId}/status`, admin, { status: 'APPROVED', executionStatus: 'IN_PROGRESS' });
    expect(iniciado.statusCode, iniciado.body).toBe(200);
    const antes = iniciado.json();
    const projeto = antes.items.find((entrada: any) => entrada.projectName === 'Cozinha'), lavabo = antes.items.find((entrada: any) => entrada.projectName === 'Lavabo');
    const id = Object.fromEntries(projeto.components.map((peca: any) => [peca.label, peca.id]));
    // Uma bancada já produzida e uma soleira entregue.
    await move(admin, projeto.id, { status: 'DONE', pieces: { [id.Bancada]: 1 } });
    expect((await request('POST', `/quotes/${quoteId}/items/${projeto.id}/entregas`, admin, { pieces: { [id.Soleira]: 1 } })).statusCode).toBe(201);

    const naoAprovar = (itemId: string, corpo: object) => request('POST', `/quotes/${quoteId}/items/${itemId}/nao-aprovar`, admin, corpo);
    expect((await naoAprovar(projeto.id, { pieces: { [id.Soleira]: 3 } })).statusCode).toBe(422);
    expect((await naoAprovar(projeto.id, { pieces: { [id.Soleira]: 1 }, todas: true })).statusCode).toBe(422);
    const parcial = await naoAprovar(projeto.id, { pieces: { [id.Bancada]: 1, [id.Rodabanca]: 1, [id.Soleira]: 2 } });
    expect(parcial.statusCode, parcial.body).toBe(200);
    const depois = parcial.json(), alterado = depois.items.find((entrada: any) => entrada.id === projeto.id);
    expect(alterado.declinedAt).toBeNull();
    expect(alterado.components.map((peca: any) => [peca.id, peca.label, peca.quantity])).toEqual([[id.Bancada, 'Bancada', 1], [id.Rodabanca, 'Rodabanca', 1], [id.Soleira, 'Soleira', 1]]);
    expect(Number(alterado.components[2].appliedTotal)).toBe(100);
    expect(alterado.cutouts).toEqual([expect.objectContaining({ componentId: id.Bancada, quantity: 1 })]);
    expect(alterado.drawingData.componentDetails[1]).toEqual({ parentComponentIndex: 0, parentSide: 'BACK' });
    expect(alterado.drawingData.pecasNaoAprovadas.map((peca: any) => [peca.nome, peca.quantidade])).toEqual([['Bancada', 1], ['Rodabanca', 1], ['Soleira', 2]]);
    expect(Number(alterado.total)).toBeLessThan(Number(projeto.total));
    expect(Number(depois.grossTotal)).toBeCloseTo(Number(antes.grossTotal) - (Number(projeto.total) - Number(alterado.total)), 2);
    // A bancada que saiu era a que ainda não tinha começado; a produzida e a soleira entregue ficam.
    expect(pecasPorEtapa((await board(admin, quoteId)).filter((card: any) => card.projectId === projeto.id))).toEqual({ TODO: { Rodabanca: 1 }, DONE: { Bancada: 1 }, DELIVERED: { Soleira: 1 } });
    const historico = (await request('GET', `/quotes/${quoteId}/historico`, admin)).json();
    expect(historico.eventos).toEqual(expect.arrayContaining([expect.objectContaining({ titulo: 'Cozinha: peças não aprovadas', detalhe: expect.stringContaining('Bancada, Rodabanca, 2× Soleira') })]));

    // Todas as que faltam: com uma entregue, o projeto continua só com ela; o lavabo inteiro sai e o orçamento fica entregue.
    const resto = await naoAprovar(projeto.id, { todas: true });
    expect(resto.statusCode, resto.body).toBe(200);
    expect(resto.json().items.find((entrada: any) => entrada.id === projeto.id).components.map((peca: any) => [peca.label, peca.quantity])).toEqual([['Soleira', 1]]);
    const inteiro = await naoAprovar(lavabo.id, { todas: true });
    expect(inteiro.statusCode, inteiro.body).toBe(200);
    expect(inteiro.json()).toMatchObject({ executionStatus: 'COMPLETED' });
    expect(inteiro.json().items.find((entrada: any) => entrada.id === lavabo.id).declinedAt).not.toBeNull();
    expect((await naoAprovar(projeto.id, { todas: true })).statusCode).toBe(409);
  });

  it('não deixa o orçamento sem nenhum projeto aprovado', async () => {
    const quote = await approvedQuote(admin, [['Só um', [{ label: 'Tampo', componentType: 'TOP', quantity: 2 }]]], 'NOT_STARTED');
    const unico = quote.items[0];
    expect((await request('POST', `/quotes/${quote.id}/items/${unico.id}/nao-aprovar`, admin, { todas: true })).statusCode).toBe(422);
    const metade = await request('POST', `/quotes/${quote.id}/items/${unico.id}/nao-aprovar`, admin, { pieces: { [unico.components[0].id]: 1 } });
    expect(metade.statusCode, metade.body).toBe(200);
    expect(metade.json().items[0].components[0].quantity).toBe(1);
    expect(Number(metade.json().netTotal)).toBeCloseTo(Number(quote.netTotal) / 2, 1);
  });
});
