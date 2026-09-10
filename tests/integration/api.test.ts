import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { buildApp } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { savedItemInput } from '@inova/domain';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await buildApp();
let headers: Record<string, string>, attendant: Record<string, string>, catalog: any;
let counter = 0;
const request = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown, auth = headers) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
async function customer(extra = {}) {
  const response = await request('POST', '/customers', { name: `Cliente integração ${++counter}`, phone: `9298800${String(counter).padStart(4, '0')}`, ...extra });
  expect(response.statusCode, response.body).toBe(201); return response.json();
}
function item(extra = {}) {
  return { projectName: 'Bancada', materialId: catalog.materials.find((entry: any) => entry.name === 'Verde Ubatuba').id, productTypeId: catalog.productTypes[0].id,
    components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1 }], ...extra };
}
async function quote(extra = {}) {
  const client = await customer();
  const response = await request('POST', '/quotes', { customerId: client.id, items: [item()], ...extra });
  expect(response.statusCode, response.body).toBe(201); return response.json();
}
const editInput = (quote: any) => ({ customerId: quote.customerId, expectedUpdatedAt: quote.updatedAt, discountAmount: quote.discountAmount, notes: quote.notes, validUntil: quote.validUntil, items: quote.items.map(savedItemInput) });
beforeAll(async () => {
  await app.ready();
  const login = await request('POST', '/auth/login', { email: 'admin@inovamarmoraria.local', password: process.env.SEED_PASSWORD }, {});
  expect(login.statusCode).toBe(200); headers = { authorization: `Bearer ${login.json().accessToken}` };
  const other = await request('POST', '/auth/login', { email: 'atendente@inovamarmoraria.local', password: process.env.SEED_PASSWORD }, {});
  attendant = { authorization: `Bearer ${other.json().accessToken}` };
  catalog = (await request('GET', '/catalog')).json();
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('Sessão e permissões reais', () => {
  it.each(['/quotes', '/customers', '/catalog', '/users', '/audit', '/notifications/deadlines'])('protege %s sem sessão', async (path) => expect((await request('GET', path, undefined, {})).statusCode).toBe(401));
  it('recusa senha inválida sem expor dados do usuário', async () => { const result = await request('POST', '/auth/login', { email: 'admin@inovamarmoraria.local', password: 'SenhaIncorreta' }, {}); expect(result.statusCode).toBe(401); expect(result.json()).not.toHaveProperty('user'); });
  it.each(['/users', '/audit'])('não permite administração em %s para atendente', async (path) => expect((await request('GET', path, undefined, attendant)).statusCode).toBe(403));
  it('recusa cadastro de material pelo atendente', async () => expect((await request('POST', '/catalog/materials', { name: 'Proibido', category: 'Granito', billingUnit: 'SQUARE_METER', unitPrice: 10 }, attendant)).statusCode).toBe(403));
  it('não aceita refresh token como credencial de API', async () => {
    const login = await request('POST', '/auth/login', { email: 'admin@inovamarmoraria.local', password: process.env.SEED_PASSWORD }, {});
    const refresh = login.cookies.find((cookie) => cookie.name === 'inova_refresh')!;
    expect((await request('GET', '/quotes', undefined, { authorization: `Bearer ${refresh.value}` })).statusCode).toBe(401);
  });
});

describe('Clientes, validações e histórico', () => {
  it.each([{ name: '', phone: '92999999999' }, { name: 'Pessoa' }, { name: 'Pessoa', phone: 'abcdefghijk' }])('recusa cliente inválido %j', async (payload) => expect((await request('POST', '/customers', payload)).statusCode).toBe(422));
  it('permite homônimos sem duplicar telefone', async () => { const a = await customer({ name: 'Mesmo nome' }); const b = await customer({ name: 'Mesmo nome' }); expect(a.id).not.toBe(b.id); });
  it('encontra telefone e CPF com ou sem pontuação', async () => {
    const entry = await customer({ phone: '(92) 97777-4321', document: '123.456.789-00' });
    for (const search of ['92977774321', '12345678900']) expect((await request('GET', `/customers?search=${search}`)).json().data.map((row: any) => row.id)).toContain(entry.id);
  });
  it('impede duplicação por telefone com formatação diferente', async () => {
    await customer({ phone: '(92) 97777-5432' });
    expect((await request('POST', '/customers', { name: 'Outra pessoa', phone: '92977775432' })).statusCode).toBe(409);
  });
  it('retorna conflito, não erro 500, ao editar para telefone existente', async () => {
    const a = await customer(), b = await customer();
    expect((await request('PATCH', `/customers/${b.id}`, { phone: a.phone })).statusCode).toBe(409);
    expect((await request('GET', `/customers/${b.id}`)).json().phone).toBe(b.phone);
  });
  it('edita sem criar outro cliente e mantém histórico relacional', async () => {
    const q = await quote(); const count = await prisma.customer.count();
    expect((await request('PATCH', `/customers/${q.customerId}`, { name: 'Cliente atualizado' })).statusCode).toBe(200);
    expect(await prisma.customer.count()).toBe(count);
    const history = (await request('GET', `/customers/${q.customerId}/quotes`)).json();
    expect(history[0]).toMatchObject({ id: q.id, netTotal: q.netTotal });
  });
});

describe('Orçamento, snapshots, edição e relacionamentos', () => {
  it('aplica valores manuais em componentes, bordas, recortes e serviços, mais desconto global', async () => {
    const edge = catalog.services.find((entry: any) => entry.name.includes('Meia Cana'));
    const cut = catalog.services.find((entry: any) => entry.name === 'Furo de Cuba');
    const sink = catalog.services.find((entry: any) => entry.name === 'Cuba Média 47 x 30');
    const q = await quote({ discountAmount: 10, items: [item({ components: [
      { ...item().components[0], appliedTotal: 600, edges: [{ side: 'FRONT', serviceId: edge.id, appliedSubtotal: 10 }] },
      { ...item().components[0], label: 'Lateral', lengthMm: 1000, widthMm: 500, edges: [{ side: 'BACK', serviceId: edge.id, appliedSubtotal: 5 }] },
    ], cutouts: [{ cutoutType: 'SINK', componentIndex: 0, quantity: 1, serviceId: cut.id, appliedSubtotal: 50 }], services: [{ serviceId: sink.id, billedQuantity: 1, appliedSubtotal: 250 }] })] });
    expect(q.netTotal).toBe(1195); expect(q.grossTotal).toBe(1205);
    expect((await request('GET', `/quotes/${q.id}`)).json().netTotal).toBe(1195);
  });
  it('mantém área de saia e quantidade sem alterar o padrão do material', async () => {
    const skirt = catalog.services.find((entry: any) => entry.name === 'Saia');
    const q = await quote({ items: [item({ components: [{ ...item().components[0], quantity: 2, edges: [{ side: 'FRONT', serviceId: skirt.id, lengthMm: 1000, heightMm: 100, quantity: 2 }] }] })] });
    expect(q.items[0].components[0].edges[0].billedQuantity).toBe(0.4);
    expect(q.netTotal).toBe(1680);
    expect((await request('GET', '/catalog')).json().materials.find((row: any) => row.id === q.items[0].materialId).currentPrice).toBe(600);
  });
  it('recusa recorte vinculado a componente inexistente', async () => {
    const client = await customer();
    const before = await prisma.quote.count();
    expect((await request('POST', '/quotes', { customerId: client.id, items: [item({ cutouts: [{ cutoutType: 'SINK', componentIndex: 8 }] })] })).statusCode).toBe(422);
    expect(await prisma.quote.count()).toBe(before);
  });
  it('reverte tudo se um item do orçamento for inválido', async () => {
    const client = await customer(); const count = await prisma.quote.count(); const sequence = await prisma.quoteSequence.findMany();
    expect((await request('POST', '/quotes', { customerId: client.id, items: [item(), item({ materialId: 'cm00000000000000000000000' })] })).statusCode).toBe(422);
    expect(await prisma.quote.count()).toBe(count); expect(await prisma.quoteSequence.findMany()).toEqual(sequence);
  });
  it('respeita o desconto global máximo e m² manual por perfil', async () => {
    const client = await customer();
    expect((await request('POST', '/quotes', { customerId: client.id, discountAmount: 100, items: [item()] }, attendant)).statusCode).toBe(403);
    expect((await request('POST', '/quotes', { customerId: client.id, items: [item({ calculationMode: 'MANUAL_M2', components: [], billedQuantity: 2, manualJustification: 'Teste manual' })] }, attendant)).statusCode).toBe(403);
  });
  it('não recalcula valores antigos após aumento do catálogo; edição e restauração usam snapshot', async () => {
    let q = await quote({ items: [item({ components: [{ ...item().components[0], appliedTotal: 650 }] })], discountAmount: 20 });
    const materialId = q.items[0].materialId;
    await request('POST', `/catalog/materials/${materialId}/prices`, { amount: 900 });
    try {
      expect((await request('GET', `/quotes/${q.id}`)).json().netTotal).toBe(630);
      let payload = editInput(q); payload.items[0].components[0].lengthMm = 2200;
      const updated = await request('PUT', `/quotes/${q.id}`, payload); expect(updated.statusCode, updated.body).toBe(200); q = updated.json();
      expect(q.netTotal).toBe(630); expect(q.items[0].components[0].calculatedTotal).toBe(792);
      payload = editInput(q); delete payload.items[0].components[0].appliedTotal;
      q = (await request('PUT', `/quotes/${q.id}`, payload)).json(); expect(q.netTotal).toBe(772);
    } finally { await request('POST', `/catalog/materials/${materialId}/prices`, { amount: 600 }); }
  });
  it('rejeita edição concorrente sem sobrescrever a versão mais recente', async () => {
    const q = await quote(); const payload = editInput(q);
    const updates = await Promise.all([request('PUT', `/quotes/${q.id}`, { ...payload, notes: 'Edição A' }), request('PUT', `/quotes/${q.id}`, { ...payload, notes: 'Edição B' })]);
    expect(updates.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  });
  it('protege IDs de outros orçamentos e mantém dados após erro', async () => {
    const a = await quote(), b = await quote(); const payload = editInput(a); payload.items[0].id = b.items[0].id;
    expect((await request('PUT', `/quotes/${a.id}`, payload)).statusCode).toBe(422);
    expect((await request('GET', `/quotes/${a.id}`)).json().updatedAt).toBe(a.updatedAt);
  });
  it('vincula complementos sem somar no original e rejeita outro cliente', async () => {
    const parent = await quote(); const child = await quote({ customerId: parent.customerId, parentQuoteId: parent.id });
    expect(child.parentQuote.id).toBe(parent.id);
    const saved = (await request('GET', `/quotes/${parent.id}`)).json(); expect(saved.complements.map((entry: any) => entry.id)).toContain(child.id); expect(saved.netTotal).toBe(parent.netTotal);
    const other = await customer(); const count = await prisma.quote.count();
    expect((await request('POST', '/quotes', { customerId: other.id, parentQuoteId: parent.id, items: [item()] })).statusCode).toBe(422); expect(await prisma.quote.count()).toBe(count);
  });
  it('gera PDF real com total negociado e sem valores individuais', async () => {
    const q = await quote({ items: [item({ components: [{ ...item().components[0], appliedTotal: 987.65 }] })], discountAmount: 12.34 });
    const response = await request('GET', `/quotes/${q.id}/pdf`);
    expect(response.statusCode).toBe(200); expect(response.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const text = execFileSync('pdftotext', ['-', '-'], { input: response.rawPayload, encoding: 'utf8' });
    expect(text).toContain('975,31'); expect(text).not.toContain('987,65'); expect(text).not.toContain('600,00');
  });
});

describe('Status, histórico e notificações', () => {
  it('percorre aprovação, execução, entrega e retrabalho sem perder o total', async () => {
    const q = await quote();
    for (const payload of [{ status: 'SENT' }, { status: 'APPROVED' }, { status: 'APPROVED', executionStatus: 'IN_PROGRESS' }, { status: 'APPROVED', executionStatus: 'COMPLETED' }]) {
      const response = await request('PATCH', `/quotes/${q.id}/status`, payload); expect(response.statusCode).toBe(200); expect(response.json().netTotal).toBe(q.netTotal);
    }
    expect((await request('GET', `/quotes?scope=history&search=${q.number}`)).json().data.map((row: any) => row.id)).toContain(q.id);
    expect((await request('GET', `/quotes?scope=active&search=${q.number}`)).json().data).toHaveLength(0);
    expect((await request('PUT', `/quotes/${q.id}`, editInput(q))).statusCode).toBe(409);
    expect((await request('PATCH', `/quotes/${q.id}/status`, { status: 'APPROVED', executionStatus: 'REWORK' })).statusCode).toBe(200);
    expect((await request('GET', `/quotes?scope=active&search=${q.number}`)).json().data).toHaveLength(1);
  });
  it('envia recusado ao histórico e remove dos operacionais', async () => {
    const q = await quote(); await request('PATCH', `/quotes/${q.id}/status`, { status: 'REJECTED', reason: 'Cliente não aprovou' });
    expect((await request('GET', `/quotes?scope=history&search=${q.number}`)).json().data).toHaveLength(1);
    expect((await request('GET', `/quotes?scope=active&search=${q.number}`)).json().data).toHaveLength(0);
  });
  it('alerta somente aprovados abertos com prazo próximo, hoje ou atrasado', async () => {
    const overdue = await quote(), delivered = await quote(), sent = await quote();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 3);
    await prisma.quote.update({ where: { id: overdue.id }, data: { status: 'APPROVED', dueDate: yesterday } });
    await prisma.quote.update({ where: { id: delivered.id }, data: { status: 'APPROVED', executionStatus: 'COMPLETED', dueDate: yesterday } });
    await prisma.quote.update({ where: { id: sent.id }, data: { status: 'SENT', dueDate: yesterday } });
    const alerts = (await request('GET', '/notifications/deadlines')).json();
    expect(alerts.count).toBe(alerts.alerts.length); expect(alerts.alerts.map((row: any) => row.id)).toContain(overdue.id);
    expect(alerts.alerts.map((row: any) => row.id)).not.toContain(delivered.id); expect(alerts.alerts.map((row: any) => row.id)).not.toContain(sent.id);
  });
});
