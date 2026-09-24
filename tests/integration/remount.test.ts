import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
let headers: Record<string, string>, catalog: any, quote: any;
const request = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: any, auth = headers) => app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
beforeAll(async () => {
  await app.ready();
  const login = await request('POST', '/auth/login', { email: 'admin@inovamarmoraria.local', password: process.env.SEED_PASSWORD }, {});
  headers = { authorization: `Bearer ${login.json().accessToken}` };
  catalog = (await request('GET', '/catalog')).json();
  const customer = (await request('POST', '/customers', { name: 'Remontagem integração', phone: '92977661002' })).json();
  const created = await request('POST', '/quotes', { customerId: customer.id, items: [item()] });
  expect(created.statusCode, created.body).toBe(201); quote = created.json();
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
function item() {
  return { id: 'remount-materials', projectName: 'Cozinha', productTypeId: catalog.productTypes[0].id, materialId: catalog.materials.find((m: any) => m.name === 'Verde Ubatuba').id,
    components: [{ id: 'new-stone', label: 'Reposição', componentType: 'OTHER', orientation: 'HORIZONTAL', lengthMm: 1150, widthMm: 600, quantity: 2 }], services: [], cutouts: [] };
}
const body = () => ({ expectedVersion: 0, items: [item()], assembly: 250, disassembly: 450, cardOverride: 5500, pixPercent: 5, notes: 'Conferir no local.', itemNotes: { 'new-stone': 'Peça nova.' } });
describe('Remontagem persistida e independente', () => {
  it('protege operações, verifica origem e valida preços, medidas e desconto', async () => {
    const path = `/quotes/${quote.id}/remontagem`;
    expect((await request('GET', path, undefined, {})).statusCode).toBe(401);
    expect((await request('PUT', path, body(), {})).statusCode).toBe(401);
    expect((await request('GET', `${path}/delivery-pdf`, undefined, {})).statusCode).toBe(401);
    expect((await request('GET', '/quotes/cm00000000000000000000000/remontagem')).statusCode).toBe(404);
    expect((await request('GET', `${path}/pdf`)).statusCode).toBe(404);
    for (const patch of [{ assembly: -1 }, { disassembly: -1 }, { cardOverride: -1 }, { pixPercent: 7 }, { assembly: 2.345 }, { itemNotes: { invalid: 'Órfão' } }]) expect((await request('PUT', path, { ...body(), ...patch })).statusCode).toBe(422);
    for (const patch of [{ lengthMm: 0 }, { widthMm: -1 }, { quantity: 0 }, { quantity: 1.5 }]) {
      const payload = body(); Object.assign(payload.items[0].components[0], patch);
      expect((await request('PUT', path, payload)).statusCode).toBe(422);
    }
  });
  it('calcula, salva, reabre e gera documentos sem modificar a origem', async () => {
    const path = `/quotes/${quote.id}/remontagem`;
    const preview = await request('POST', `${path}/calculate`, body());
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({ assemblyDiscount: 50, disassemblyDiscount: 0, cardTotal: 5500, pixTotal: 1528, cashDiscount: 3972 });
    expect((await prisma.remount.count({ where: { quoteId: quote.id } }))).toBe(0);
    const response = await request('PUT', path, body());
    expect(response.statusCode, response.body).toBe(200);
    const saved = response.json();
    expect(saved.items[0].components[0]).toMatchObject({ lengthMm: 1150, widthMm: 600, billableArea: 1.38, appliedTotal: 828 });
    expect((await request('GET', path)).json().remount).toEqual(saved);
    expect((await request('GET', `/quotes/${quote.id}`)).json()).toEqual(quote);
    for (const suffix of ['pdf?individualPrices=true', 'pdf?individualPrices=false', 'delivery-pdf']) {
      const pdf = await request('GET', `${path}/${suffix}`); expect(pdf.statusCode).toBe(200); expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    }
    expect((await request('PUT', path, body())).statusCode).toBe(409);
    const update = await request('PUT', path, { ...body(), expectedVersion: saved.version, pixPercent: 25 });
    expect(update.statusCode, update.body).toBe(200); expect(update.json()).toMatchObject({ pixTotal: 1528, cashDiscount: 3972 });
    expect((await request('GET', `/quotes/${quote.id}`)).json()).toEqual(quote);
  });
  it('mantém preços registrados ao mudar o catálogo e permite remover todos os materiais', async () => {
    const path = `/quotes/${quote.id}/remontagem`;
    const previous = (await request('GET', path)).json().remount;
    const materialId = item().materialId;
    const price = await prisma.materialPrice.findFirstOrThrow({ where: { materialId, validTo: null }, orderBy: { validFrom: 'desc' } });
    await prisma.materialPrice.update({ where: { id: price.id }, data: { amount: 900 } });
    try {
      const result = await request('PUT', path, { ...body(), expectedVersion: previous.version });
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json().items[0].components[0].unitPriceSnapshot).toBe(600);
      const concurrent = await Promise.all([1, 2].map(() => request('PUT', path, { ...body(), expectedVersion: result.json().version })));
      expect(concurrent.map(r => r.statusCode).sort()).toEqual([200, 409]);
      const current = (await request('GET', path)).json().remount;
      const empty = await request('PUT', path, { ...body(), expectedVersion: current.version, items: [], itemNotes: {}, cardOverride: null, assembly: 300, disassembly: 300 });
      expect(empty.statusCode, empty.body).toBe(200); expect(empty.json()).toMatchObject({ subtotal: 600, cardTotal: 600, pixTotal: 600, cashDiscount: 0, items: [] });
    } finally { await prisma.materialPrice.update({ where: { id: price.id }, data: { amount: price.amount } }); }
  });
});
