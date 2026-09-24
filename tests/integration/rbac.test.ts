import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { itemSalvoParaEntrada } from '@inova/domain';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
type Auth = Record<string, string>;
let admin: Auth, a: Auth, b: Auth, catalog: any, ca: any, cb: any, qa: any, qb: any, userA: any, userB: any;
let sequence = 0;
const request = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, auth: Auth, payload?: any) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload }) });
async function login(email: string, password = process.env.SEED_PASSWORD!) {
  const response = await request('POST', '/auth/login', {}, { email, password });
  expect(response.statusCode, response.body).toBe(200);
  return { authorization: `Bearer ${response.json().accessToken}` };
}
async function seller(name: string, role = 'SELLER') {
  const response = await request('POST', '/users', admin, { name, email: `rbac-${++sequence}@example.test`, password: 'RbacTest@2026', role, maxDiscountPercent: 10 });
  expect(response.statusCode, response.body).toBe(201);
  const user = response.json();
  expect(user).not.toHaveProperty('passwordHash');
  return { user, auth: await login(user.email, 'RbacTest@2026') };
}
async function customer(auth: Auth) {
  const response = await request('POST', '/customers', auth, { name: `Cliente RBAC ${++sequence}`, phone: `1198111${String(sequence).padStart(4, '0')}` });
  expect(response.statusCode, response.body).toBe(201); return response.json();
}
const item = () => ({ projectName: 'Projeto RBAC', productTypeId: catalog.productTypes[0].id, materialId: catalog.materials[0].id, components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 600, quantity: 1 }] });
async function quote(auth: Auth, customerId: string, extra = {}) {
  const response = await request('POST', '/quotes', auth, { customerId, items: [item()], ...extra });
  expect(response.statusCode, response.body).toBe(201); return response.json();
}
beforeAll(async () => {
  await app.ready(); admin = await login('admin@inovamarmoraria.local');
  const first = await seller('Vendedor A'), second = await seller('Vendedor B');
  a = first.auth; userA = first.user; b = second.auth; userB = second.user;
  catalog = (await request('GET', '/catalog', a)).json();
  ca = await customer(a); cb = await customer(b);
  qa = await quote(a, ca.id); qb = await quote(b, cb.id);
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('RBAC comercial aplicado na API', () => {
  it('atribui proprietários no servidor e isola listas, buscas, contadores e histórico', async () => {
    expect(ca.ownerId).toBe(userA.id); expect(qa.createdById).toBe(userA.id);
    const clients = (await request('GET', '/customers', a)).json();
    expect(clients.data.map((row: any) => row.id)).toEqual([ca.id]);
    expect((await request('GET', `/customers?search=${cb.phone}`, a)).json().meta.total).toBe(0);
    for (const suffix of ['', '?scope=active', '?sellerId=' + userA.id]) {
      const response = await request('GET', '/quotes' + suffix, a);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.map((row: any) => row.id)).toEqual([qa.id]);
      expect(response.json().counts.ALL).toBe(1);
    }
    expect((await request('GET', `/quotes?sellerId=${userB.id}`, a)).json().meta.total).toBe(0);
    expect((await request('GET', `/quotes?search=${qb.number}`, a)).json().meta.total).toBe(0);
    expect((await request('GET', `/customers/${ca.id}/quotes`, a)).json().map((row: any) => row.id)).toEqual([qa.id]);
    expect((await request('GET', `/quotes/${qb.id}`, admin)).statusCode).toBe(200);
    expect((await request('GET', `/customers/${cb.id}`, admin)).statusCode).toBe(200);
  });
  it.each([
    ['GET', ''], ['PUT', ''], ['PATCH', ''], ['POST', '/items'], ['PATCH', '/items/cm00000000000000000000001'],
    ['POST', '/calculate'], ['PATCH', '/status'], ['PATCH', '/tracking'], ['PUT', '/worker'], ['POST', '/duplicate'],
    ['GET', '/pdf'], ['GET', '/remontagem'], ['PUT', '/remontagem'], ['POST', '/remontagem/calculate'],
    ['GET', '/remontagem/pdf'], ['GET', '/remontagem/delivery-pdf'],
  ] as const)('impede ID de outro vendedor em %s /quotes/:id%s', async (method, suffix) => {
    expect((await request(method, `/quotes/${qb.id}${suffix}`, a, method === 'GET' ? undefined : {})).statusCode).toBe(404);
  });
  it('protege dados do cliente por ID e vínculos cruzados na criação e edição', async () => {
    for (const path of [`/customers/${cb.id}`, `/customers/${cb.id}/quotes`]) expect((await request('GET', path, a)).statusCode).toBe(404);
    expect((await request('PATCH', `/customers/${cb.id}`, a, { name: 'Invadido' })).statusCode).toBe(404);
    expect((await request('POST', '/quotes', a, { customerId: cb.id, items: [item()] })).statusCode).toBe(422);
    expect((await request('POST', '/quotes', a, { customerId: ca.id, parentQuoteId: qb.id, items: [item()] })).statusCode).toBe(422);
    const response = await request('PUT', `/quotes/${qa.id}`, a, { customerId: cb.id, expectedUpdatedAt: qa.updatedAt, discountAmount: 0, items: qa.items.map(itemSalvoParaEntrada) });
    expect(response.statusCode, response.body).toBe(422);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: qa.id } })).customerId).toBe(ca.id);
  });
  it.each(['/users', '/audit', '/workers', '/dashboard'])('nega área administrativa %s', async path => {
    expect((await request('GET', path, a)).statusCode).toBe(403);
    expect((await request('GET', path, {})).statusCode).toBe(401);
  });
  it('nega escrita no catálogo, gestão de usuários, equipe e desenho técnico independente', async () => {
    for (const path of ['/users', '/catalog/materials', '/jobs', `/quotes/${qa.id}/technical-project`]) expect((await request('POST', path, a, {})).statusCode).toBe(403);
    expect((await request('PUT', `/quotes/${qa.id}/worker`, a, { workerId: null })).statusCode).toBe(403);
    expect((await request('PATCH', `/users/${userA.id}`, a, { role: 'SUPER_ADMIN' })).statusCode).toBe(403);
    expect((await request('PATCH', `/customers/${ca.id}/owner`, a, { ownerId: userB.id })).statusCode).toBe(403);
    for (const path of ['/catalog', '/catalog/materials/visual']) expect((await request('GET', path, a)).statusCode).toBe(200);
  });
  it('não revela complementos de outro responsável nem seu último orçamento no cliente', async () => {
    const adminComplement = await quote(admin, ca.id, { parentQuoteId: qa.id });
    const detail = (await request('GET', `/quotes/${qa.id}`, a)).json();
    expect(detail.complements).toEqual([]);
    expect((await request('GET', `/quotes/${qa.id}`, admin)).json().complements.map((row: any) => row.id)).toContain(adminComplement.id);
    const clients = (await request('GET', '/customers', a)).json();
    expect(clients.data[0].quotes[0].number).toBe(qa.number);
    expect((await request('GET', `/customers/${ca.id}`, a)).json()._count.quotes).toBe(1);
  });
  it('acompanha seu orçamento até a entrega, preserva o vendedor e gera os PDFs', async () => {
    for (const workStatus of ['APPROVED', 'IN_PRODUCTION', 'DELIVERY_PENDING', 'DELIVERED']) {
      const response = await request('PATCH', `/quotes/${qa.id}/status`, a, { workStatus });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().createdById).toBe(userA.id);
      if (workStatus === 'IN_PRODUCTION') expect(response.json().executionStatus).toBe('IN_PROGRESS');
      if (workStatus === 'DELIVERED') expect(response.json()).toMatchObject({ executionStatus: 'COMPLETED', completedAt: expect.any(String) });
    }
    expect((await request('GET', '/quotes?scope=history', a)).json().data.map((row: any) => row.id)).toContain(qa.id);
    const remount = await request('PUT', `/quotes/${qa.id}/remontagem`, a, { expectedVersion: 0, items: [] });
    expect(remount.statusCode, remount.body).toBe(200);
    for (const path of ['/pdf', '/remontagem/pdf', '/remontagem/delivery-pdf']) {
      const pdf = await request('GET', `/quotes/${qa.id}${path}`, a);
      expect(pdf.statusCode, pdf.body.slice(0, 100)).toBe(200); expect(pdf.headers['content-type']).toContain('application/pdf');
    }
  });
  it('isola notificações de prazo', async () => {
    await prisma.quote.update({ where: { id: qb.id }, data: { status: 'APPROVED', dueDate: new Date(Date.now() - 7 * 86400000), executionStatus: 'IN_PROGRESS' } });
    expect((await request('GET', '/notifications/deadlines', a)).json().alerts.some((row: any) => row.id === qb.id)).toBe(false);
    const response = await request('GET', '/notifications/deadlines', b);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().alerts.some((row: any) => row.id === qb.id)).toBe(true);
  });
  it('super administrador atribui cliente sem reescrever autoria de orçamentos antigos', async () => {
    const client = await customer(admin);
    const old = await quote(admin, client.id);
    const assigned = await request('PATCH', `/customers/${client.id}/owner`, admin, { ownerId: userA.id });
    expect(assigned.statusCode).toBe(200);
    expect((await request('GET', `/customers/${client.id}`, a)).statusCode).toBe(200);
    expect((await request('GET', `/customers/${client.id}/quotes`, a)).json()).toEqual([]);
    expect((await request('GET', `/quotes/${old.id}`, a)).statusCode).toBe(404);
    const own = await quote(a, client.id);
    expect(own.createdById).toBe(userA.id);
  });
  it('revoga sessão ativa e aplica mudança de perfil sem aguardar expiração do JWT', async () => {
    const delegated = await seller('Super temporário', 'SUPER_ADMIN');
    expect((await request('GET', '/dashboard', delegated.auth)).statusCode).toBe(200);
    expect((await request('PATCH', `/users/${delegated.user.id}`, admin, { role: 'SELLER' })).statusCode).toBe(200);
    expect((await request('GET', '/dashboard', delegated.auth)).statusCode).toBe(403);
    expect((await request('GET', '/quotes', delegated.auth)).json().data).toEqual([]);
    expect((await request('PATCH', `/users/${delegated.user.id}`, admin, { isActive: false })).statusCode).toBe(200);
    expect((await request('GET', '/catalog', delegated.auth)).statusCode).toBe(401);
    const me = (await request('GET', '/auth/me', admin)).json().user;
    expect((await request('PATCH', `/users/${me.id}`, admin, { isActive: false })).statusCode).toBe(409);
  });
});

describe('Dashboard comercial e operacional', () => {
  it('conta cada etapa, vendas, cancelamentos, entregas e atrasos por responsável e período', async () => {
    const report = await seller('Vendedor indicadores');
    const client = await customer(report.auth);
    const states = [
      ['DRAFT', 'NOT_STARTED'], ['SENT', 'NOT_STARTED'], ['CANCELLED', 'NOT_STARTED'], ['REJECTED', 'NOT_STARTED'], ['EXPIRED', 'NOT_STARTED'],
      ...['NOT_STARTED', 'IN_PROGRESS', 'WAITING_MATERIAL', 'PENDING_WORK', 'REWORK', 'READY', 'DELIVERY_PENDING', 'INSTALLATION_PENDING', 'COMPLETED'].map(value => ['APPROVED', value]),
    ];
    for (const [status, executionStatus] of states) {
      const record = await quote(report.auth, client.id);
      await prisma.quote.update({ where: { id: record.id }, data: { status: status as any, executionStatus: executionStatus as any, createdAt: new Date('2026-01-15T12:00:00Z'), dueDate: new Date(Date.now() - 7 * 86400000), netTotal: 100 } });
    }
    const response = await request('GET', `/dashboard?sellerId=${report.user.id}&from=2026-01-01&to=2026-01-31`, admin);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().totals).toEqual({ issued: 14, pending: 2, sold: 9, cancelled: 1, rejected: 1, expired: 1, approved: 1, production: 1, waitingMaterial: 1, pendingWork: 1, rework: 1, ready: 1, deliveryPending: 1, installationPending: 1, delivered: 1, overdue: 8, quotedValue: 1400, soldValue: 900, conversion: 64.3 });
    expect(response.json().sellers).toHaveLength(1);
    expect(response.json().sellers[0]).toMatchObject({ id: report.user.id, ...response.json().totals });
    expect(response.json().overdueQuotes).toHaveLength(8);
    expect(response.json().overdueQuotes.every((row: any) => row.sellerName === report.user.name)).toBe(true);
    const outside = await request('GET', `/dashboard?sellerId=${report.user.id}&from=2026-02-01`, admin);
    expect(outside.json().totals.issued).toBe(0);
    expect((await request('GET', '/dashboard?from=2026-02-31', admin)).statusCode).toBe(422);
    expect((await request('GET', '/dashboard?from=2026-02-01&to=2026-01-01', admin)).statusCode).toBe(422);
    await request('PATCH', `/users/${report.user.id}`, admin, { isActive: false });
    expect((await request('GET', `/dashboard?sellerId=${report.user.id}`, admin)).json().sellers[0]).toMatchObject({ isActive: false, sold: 9 });
  });
});
