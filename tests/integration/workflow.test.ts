import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
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
const item = (projectName: string) => ({ projectName, productTypeId: catalog.productTypes[0].id, materialId: catalog.materials[0].id, components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 600, quantity: 1 }] });
/** Aprova e inicia a execução: só orçamentos em andamento entram no quadro. */
async function approvedQuote(auth: Auth, projects: string[], executionStatus = 'IN_PROGRESS') {
  const customer = await request('POST', '/customers', auth, { name: `Cliente fluxo ${++sequence}`, phone: `9298711${String(sequence).padStart(4, '0')}` });
  expect(customer.statusCode, customer.body).toBe(201);
  const created = await request('POST', '/quotes', auth, { customerId: customer.json().id, items: projects.map(item) });
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
