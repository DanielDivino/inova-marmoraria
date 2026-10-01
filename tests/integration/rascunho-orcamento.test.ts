import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../../apps/api/src/app.js';
import { prisma } from '../../apps/api/src/config/prisma.js';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
type Auth = Record<string, string>;
let admin: Auth, vendedor: Auth;
const request = (method: 'GET' | 'POST' | 'PUT', url: string, auth: Auth, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
async function login(email: string, password = process.env.SEED_PASSWORD!) {
  const response = await request('POST', '/auth/login', {}, { email, password });
  expect(response.statusCode, response.body).toBe(200);
  return { authorization: `Bearer ${response.json().accessToken}` };
}
const atendimento = (id: string, projeto: string) => ({ id, customer: { id: `cliente-${id}`, name: `Cliente ${id}` }, items: [{ id: `p-${id}`, projectName: projeto }], discount: '0' });

beforeAll(async () => {
  await app.ready();
  admin = await login('admin@inovamarmoraria.local');
  const email = `rascunho-${Date.now()}@example.test`;
  const criado = await request('POST', '/users', admin, { name: 'Vendedor do rascunho', email, password: 'Rascunho@2026', role: 'SELLER', maxDiscountPercent: 10 });
  expect(criado.statusCode, criado.body).toBe(201);
  vendedor = await login(email, 'Rascunho@2026');
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('Rascunho do Novo orçamento no servidor (igual no celular e no computador)', () => {
  it('cada usuário tem o seu; grava por versão e devolve o atual quando outro aparelho gravou antes', async () => {
    expect((await request('GET', '/quote-draft', vendedor)).json()).toEqual({ version: null });

    const primeiro = await request('PUT', '/quote-draft', vendedor, { data: { workspaces: [atendimento('a', 'Cozinha')], removedWorkspaceIds: [] }, baseVersion: null });
    expect(primeiro.statusCode, primeiro.body).toBe(200);
    expect(primeiro.json()).toMatchObject({ saved: true, version: 1 });

    // Outro aparelho lê o mesmo rascunho, com os projetos do jeito que foram gravados.
    const lido = (await request('GET', '/quote-draft', vendedor)).json();
    expect(lido.version).toBe(1);
    expect(lido.draft.data.workspaces).toEqual([atendimento('a', 'Cozinha')]);
    // Sem mudança desde a versão conhecida, não reenvia os dados.
    expect((await request('GET', '/quote-draft?known=1', vendedor)).json()).toEqual({ version: 1 });

    const segundo = await request('PUT', '/quote-draft', vendedor, { data: { workspaces: [atendimento('a', 'Cozinha'), atendimento('b', 'Banheiro')], removedWorkspaceIds: [] }, baseVersion: 1 });
    expect(segundo.json()).toMatchObject({ saved: true, version: 2 });

    // Aparelho que ainda conhecia a versão 1: não sobrescreve; recebe a atual para juntar.
    const atrasado = await request('PUT', '/quote-draft', vendedor, { data: { workspaces: [atendimento('c', 'Lavabo')], removedWorkspaceIds: [] }, baseVersion: 1 });
    expect(atrasado.statusCode).toBe(200);
    expect(atrasado.json()).toMatchObject({ saved: false, draft: { version: 2 } });
    expect(atrasado.json().draft.data.workspaces.map((espaco: { id: string }) => espaco.id)).toEqual(['a', 'b']);
    // Criar de novo (sem versão) também não apaga o que já existe.
    expect((await request('PUT', '/quote-draft', vendedor, { data: { workspaces: [], removedWorkspaceIds: [] }, baseVersion: null })).json()).toMatchObject({ saved: false, draft: { version: 2 } });

    // O administrador tem o próprio rascunho, separado do vendedor.
    expect((await request('GET', '/quote-draft', admin)).json()).toEqual({ version: null });
  });

  it('exige login e recusa dados fora do formato', async () => {
    expect((await request('GET', '/quote-draft', {})).statusCode).toBe(401);
    expect((await request('PUT', '/quote-draft', vendedor, { data: { workspaces: [{ semId: true }], removedWorkspaceIds: [] }, baseVersion: null })).statusCode).toBe(422);
    expect((await request('PUT', '/quote-draft', vendedor, { data: { workspaces: [], outro: 1 }, baseVersion: null })).statusCode).toBe(422);
  });
});
