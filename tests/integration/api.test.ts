import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { itemSalvoParaEntrada, validadeOrcamento } from '@inova/domain';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
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
const editInput = (quote: any) => ({ customerId: quote.customerId, expectedUpdatedAt: quote.updatedAt, discountAmount: quote.discountAmount, notes: quote.notes, validUntil: quote.validUntil, items: quote.items.map(itemSalvoParaEntrada) });
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
  it('cria cliente rápido sem nenhum dado, faz orçamento e completa o cadastro depois', async () => {
    const vazio = await request('POST', '/customers', { quick: true, name: '', phone: '' });
    expect(vazio.statusCode, vazio.body).toBe(201);
    const rapido = vazio.json();
    expect(rapido).toMatchObject({ isQuick: true, phone: null });
    expect(rapido.name).toMatch(/^Sem cadastro \d+$/);
    const segundo = (await request('POST', '/customers', { quick: true })).json();
    expect(Number(segundo.name.split(' ').pop())).toBe(Number(rapido.name.split(' ').pop()) + 1);
    const orcamento = await request('POST', '/quotes', { customerId: rapido.id, items: [item()] });
    expect(orcamento.statusCode, orcamento.body).toBe(201);
    const snapshot = () => prisma.quote.findUnique({ where: { id: orcamento.json().id }, select: { customerNameSnapshot: true, customerPhoneSnapshot: true, workAddressSnapshot: true } });
    expect(await snapshot()).toMatchObject({ customerNameSnapshot: rapido.name, customerPhoneSnapshot: null });
    // Renomear sem telefone continua rápido; com telefone vira cadastro completo e o orçamento passa a mostrar os dados.
    expect((await request('PATCH', `/customers/${rapido.id}`, { name: 'Dona Maria', phone: null })).json()).toMatchObject({ name: 'Dona Maria', isQuick: true, phone: null });
    const completo = await request('PATCH', `/customers/${rapido.id}`, { phone: '(92) 91234-0001', address: 'Rua das Flores, 10' });
    expect(completo.statusCode, completo.body).toBe(200);
    expect(completo.json()).toMatchObject({ isQuick: false, phone: '92912340001' });
    expect(await snapshot()).toEqual({ customerNameSnapshot: 'Dona Maria', customerPhoneSnapshot: '92912340001', workAddressSnapshot: 'Rua das Flores, 10' });
  });
  it('cliente comum continua exigindo nome e telefone', async () => {
    expect((await request('POST', '/customers', { name: 'Sem telefone' })).statusCode).toBe(422);
    expect((await request('POST', '/customers', { quick: false, phone: '92912340002' })).statusCode).toBe(422);
  });
});

describe('Ajustes da empresa', () => {
  it('M² fechado vem ligado no catálogo e só o administrador desliga', async () => {
    expect((await request('GET', '/catalog')).json().settings).toEqual({ closedSquareMeter: true });
    expect((await request('PATCH', '/catalog/settings', { closedSquareMeter: false }, attendant)).statusCode).toBe(403);
    const desligado = await request('PATCH', '/catalog/settings', { closedSquareMeter: false });
    expect(desligado.statusCode, desligado.body).toBe(200);
    expect((await request('GET', '/catalog/settings', undefined, attendant)).json()).toEqual({ closedSquareMeter: false });
    expect((await request('PATCH', '/catalog/settings', { closedSquareMeter: true })).json()).toEqual({ closedSquareMeter: true });
  });
});

describe('Orçamento, snapshots, edição e relacionamentos', () => {
  it('calcula materiais por componente e preserva seus preços ao editar e reabrir', async () => {
    const otherResponse = await request('POST', '/catalog/materials', { name: `Pedra por componente ${++counter}`, category: 'Granito', billingUnit: 'SQUARE_METER', unitPrice: 1000 });
    expect(otherResponse.statusCode, otherResponse.body).toBe(201);
    const secondMaterial = otherResponse.json();
    const vista = catalog.services.find((entry: any) => entry.name === 'Vista');
    const first = item().components[0];
    let q = await quote({ items: [item({ components: [
      { ...first, materialId: item().materialId, edges: [{ side: 'FRONT', serviceId: vista.id, heightMm: 50 }] },
      { ...first, componentType: 'THRESHOLD', label: 'Soleira', materialId: secondMaterial.id, lengthMm: 1000, widthMm: 200, edges: [{ side: 'FRONT', serviceId: vista.id, heightMm: 50 }] },
    ] })] });
    expect(q.items[0].materialSubtotal).toBe(920);
    expect(q.netTotal).toBe(1030);
    expect(q.items[0].components.map((piece: any) => piece.unitPriceSnapshot)).toEqual([600, 1000]);
    expect(q.items[0].components.map((piece: any) => piece.edges[0].appliedSubtotal)).toEqual([60, 50]);
    await request('POST', `/catalog/materials/${secondMaterial.id}/prices`, { amount: 1500 });
    const input = editInput(q);
    input.items[0].components[1].widthMm = 300;
    const response = await request('PUT', `/quotes/${q.id}`, input);
    expect(response.statusCode, response.body).toBe(200);
    q = response.json();
    expect(q.netTotal).toBe(1130);
    expect(q.items[0].components[1]).toMatchObject({ materialId: secondMaterial.id, unitPriceSnapshot: 1000, subtotal: 300 });
    const reopened = (await request('GET', `/quotes/${q.id}`)).json();
    expect(itemSalvoParaEntrada(reopened.items[0]).components.map((piece: any) => piece.materialId)).toEqual([item().materialId, secondMaterial.id]);
    const pdf = await request('GET', `/quotes/${q.id}/pdf?individualPrices=true`);
    expect(pdf.statusCode).toBe(200);
    const text = execFileSync('pdftotext', ['-', '-'], { input: pdf.rawPayload, encoding: 'utf8' });
    expect(text).toContain(secondMaterial.name);
    expect(text).toContain('MATERIAIS POR COMPONENTE');
    const duplicate = await request('POST', `/quotes/${q.id}/duplicate`);
    expect(duplicate.statusCode, duplicate.body).toBe(201);
    expect(duplicate.json().items[0].components[1]).toMatchObject({ materialId: secondMaterial.id, unitPriceSnapshot: 1500, subtotal: 450 });
    const invalid = editInput(q);
    invalid.items[0].components[1].materialId = 'cm00000000000000000000000';
    expect((await request('PUT', `/quotes/${q.id}`, invalid)).statusCode).toBe(422);
  });
  it('cobra vista pela pedra, edita pelo snapshot e duplica com as medidas e preço vigente', async () => {
    const vista = catalog.services.find((entry: any) => entry.name === 'Vista');
    const skirt = catalog.services.find((entry: any) => entry.name === 'Saia');
    const miter = catalog.services.find((entry: any) => entry.name.includes('45°') && entry.name.includes('Granito'));
    let q = await quote({ items: [item({ components: [{ ...item().components[0], quantity: 2, edges: [
      { side: 'FRONT', serviceId: vista.id, lengthMm: 1000, heightMm: 50, quantity: 2 },
      { side: 'FRONT', serviceId: skirt.id, heightMm: 100 },
      { side: 'FRONT', serviceId: miter.id },
    ] }] })] });
    const edges = () => q.items[0].components[0].edges;
    expect(edges().find((edge: any) => edge.serviceId === vista.id)).toMatchObject({ billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: 600, billedQuantity: 0.2, calculatedSubtotal: 120, heightMm: 50 });
    expect(q.netTotal).toBe(2080);
    const input = editInput(q);
    delete input.items[0].components[0].edges[0].heightMm;
    const invalid = await request('PUT', `/quotes/${q.id}`, input);
    expect(invalid.statusCode).toBe(422);
    expect(invalid.body).toContain('largura da vista');
    await request('POST', `/catalog/materials/${q.items[0].materialId}/prices`, { amount: 900 });
    try {
      input.items[0].components[0].edges[0].heightMm = 100;
      const response = await request('PUT', `/quotes/${q.id}`, input);
      expect(response.statusCode, response.body).toBe(200);
      q = response.json();
      expect(edges()).toHaveLength(3);
      expect(edges().find((edge: any) => edge.serviceId === vista.id)).toMatchObject({ unitPriceSnapshot: 600, calculatedSubtotal: 240 });
      expect(edges().find((edge: any) => edge.serviceId === skirt.id).calculatedSubtotal).toBe(240);
      expect(edges().find((edge: any) => edge.serviceId === miter.id).calculatedSubtotal).toBe(280);
      const duplicate = await request('POST', `/quotes/${q.id}/duplicate`);
      expect(duplicate.statusCode, duplicate.body).toBe(201);
      // Duplicating creates a new quote at current catalog prices; editing keeps the original snapshot.
      expect(duplicate.json().items[0].components[0].edges.find((edge: any) => edge.serviceId === vista.id)).toMatchObject({ heightMm: 100, billedQuantity: 0.4, unitPriceSnapshot: 900, calculatedSubtotal: 360 });
    } finally { await request('POST', `/catalog/materials/${q.items[0].materialId}/prices`, { amount: 600 }); }
  });
  it.each(['FRONT', 'LEFT'])('calcula e preserva 45 graus + saia no lado %s independentemente', async (side) => {
    const miter = catalog.services.find((entry: any) => entry.name.includes('45°') && entry.name.includes('Granito'));
    const skirt = catalog.services.find((entry: any) => entry.name === 'Saia');
    const lengthM = side === 'FRONT' ? 2 : 0.6;
    let q = await quote({ items: [item({ components: [{ ...item().components[0], quantity: 2, edges: [
      { side, serviceId: miter.id }, { side, serviceId: skirt.id, lengthMm: 500, heightMm: 100 },
    ] }] })] });
    const edges = () => q.items[0].components[0].edges;
    expect(edges().find((edge: any) => edge.serviceId === miter.id)).toMatchObject({ billingUnitSnapshot: 'LINEAR_METER', billedQuantity: lengthM * 2, calculatedSubtotal: lengthM * 2 * miter.currentPrice });
    expect(edges().find((edge: any) => edge.serviceId === skirt.id)).toMatchObject({ billingUnitSnapshot: 'SQUARE_METER', billedQuantity: 0.1, calculatedSubtotal: 60 });
    const input = editInput(q);
    input.items[0].components[0].edges.find((edge: any) => edge.serviceId === skirt.id)!.heightMm = 200;
    const response = await request('PUT', `/quotes/${q.id}`, input);
    expect(response.statusCode, response.body).toBe(200); q = response.json();
    expect(edges()).toHaveLength(2);
    expect(edges().find((edge: any) => edge.serviceId === miter.id).calculatedSubtotal).toBe(lengthM * 2 * miter.currentPrice);
    expect(edges().find((edge: any) => edge.serviceId === skirt.id).calculatedSubtotal).toBe(120);
    const duplicate = await request('POST', `/quotes/${q.id}/duplicate`);
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json().items[0].components[0].edges).toHaveLength(2);
  });
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
    expect(text).toContain('975,31'); expect(text).toContain('987,65'); expect(text).toContain('TOTAL DO PROJETO'); expect(text).not.toContain('600,00');
  });
  it('PDF de um projeto: só ele e o total dele; projeto de outro orçamento não sai', async () => {
    const q = await quote({ items: [item({ projectName: 'Cozinha' }), item({ projectName: 'Banheiro social', components: [{ ...item().components[0], appliedTotal: 432.1 }] })], discountAmount: 10 });
    const banheiro = q.items.find((entry: any) => entry.projectName === 'Banheiro social');
    const response = await request('GET', `/quotes/${q.id}/items/${banheiro.id}/pdf?drawings=false`);
    expect(response.statusCode, response.body).toBe(200); expect(response.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect(decodeURIComponent(String(response.headers['content-disposition']))).toContain(`${q.number} - Banheiro social`);
    const text = execFileSync('pdftotext', ['-', '-'], { input: response.rawPayload, encoding: 'utf8' });
    expect(text).toContain('BANHEIRO SOCIAL'); expect(text).toContain('432,10');
    expect(text).not.toContain('COZINHA'); expect(text).not.toContain('DESCONTO CONCEDIDO');
    const outro = await quote();
    expect((await request('GET', `/quotes/${outro.id}/items/${banheiro.id}/pdf`)).statusCode).toBe(404);
  });
  it('aprovação parcial: o projeto não aprovado sai do valor (desconto na mesma proporção), do fluxo e do PDF; aprovar de novo devolve', async () => {
    const q = await quote({ items: [item({ projectName: 'Cozinha' }), item({ projectName: 'Banheiro', components: [{ ...item().components[0], appliedTotal: 400 }] })], discountAmount: 100 });
    const [cozinha, banheiro] = q.items;
    const bruto = cozinha.total + banheiro.total;
    expect(q.grossTotal).toBe(bruto);
    const cartoes = async () => (await request('GET', '/workflow/projects')).json().filter((cartao: any) => cartao.quote.id === q.id).length;
    expect(await cartoes()).toBe(2);
    // Nenhum projeto aprovado não é aprovação.
    expect((await request('PATCH', `/quotes/${q.id}/status`, { status: 'APPROVED', projetosNaoAprovados: [cozinha.id, banheiro.id] })).json()).toMatchObject({ error: 'NO_APPROVED_PROJECT' });

    const aprovado = await request('PATCH', `/quotes/${q.id}/status`, { status: 'APPROVED', projetosNaoAprovados: [banheiro.id] });
    expect(aprovado.statusCode, aprovado.body).toBe(200);
    const desconto = Math.round(100 * cozinha.total / bruto * 100) / 100;
    expect(aprovado.json()).toMatchObject({ status: 'APPROVED', grossTotal: cozinha.total, discountAmount: desconto, netTotal: Math.round((cozinha.total - desconto) * 100) / 100 });
    expect(aprovado.json().items.find((entrada: any) => entrada.id === banheiro.id).declinedAt).toBeTruthy();
    expect(await cartoes()).toBe(1);
    const texto = execFileSync('pdftotext', ['-', '-'], { input: (await request('GET', `/quotes/${q.id}/pdf?drawings=false`)).rawPayload, encoding: 'utf8' });
    expect(texto).toContain('COZINHA');
    expect(texto).not.toContain('BANHEIRO');
    expect((await request('GET', `/quotes/${q.id}/historico`)).json().eventos.map((evento: any) => [evento.titulo, evento.detalhe])).toContainEqual(['Orçamento aprovado em parte', 'Não aprovado: Banheiro']);

    // O último projeto aprovado não pode ser retirado; aprovar o banheiro depois devolve o valor e o desconto.
    expect((await request('PATCH', `/quotes/${q.id}/items/${cozinha.id}/aprovacao`, { aprovado: false })).json()).toMatchObject({ error: 'NO_APPROVED_PROJECT' });
    const devolvido = await request('PATCH', `/quotes/${q.id}/items/${banheiro.id}/aprovacao`, { aprovado: true });
    expect(devolvido.statusCode, devolvido.body).toBe(200);
    expect(devolvido.json()).toMatchObject({ grossTotal: bruto, discountAmount: 100, netTotal: bruto - 100 });
    expect(await cartoes()).toBe(2);
    // Orçamento ainda aguardando aprovação: a aprovação dos projetos não muda por projeto.
    const pendente = await quote();
    expect((await request('PATCH', `/quotes/${pendente.id}/items/${pendente.items[0].id}/aprovacao`, { aprovado: false })).statusCode).toBe(409);
  });
  it('histórico do orçamento: linha do tempo com o que aconteceu, só para quem vê o orçamento', async () => {
    const q = await quote();
    expect((await request('PATCH', `/quotes/${q.id}/status`, { status: 'APPROVED' })).statusCode).toBe(200);
    expect((await request('PATCH', `/quotes/${q.id}/tracking`, { deliveryDeadline: '2030-02-01', deadlineConfirmed: true, notes: 'Conferir no local.' })).statusCode).toBe(200);
    const resposta = await request('GET', `/quotes/${q.id}/historico`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const { eventos, marcos } = resposta.json();
    expect(eventos.map((evento: any) => evento.titulo)).toEqual(['Prazos atualizados', 'Observações do orçamento atualizadas', 'Orçamento aprovado', 'Orçamento criado']);
    expect(eventos[0]).toMatchObject({ detalhe: 'Entrega acordada: 01/02/2030 · Prazo confirmado com o cliente', usuario: 'Administrador Inova' });
    expect(marcos.map((marco: any) => marco.rotulo)).toEqual(['Emissão', 'Validade', 'Aprovação', 'Data limite', 'Entrega']);
    expect(marcos[1].data).toBe(q.validUntil.slice(0, 10));
    const email = `historico-${Date.now()}@example.test`;
    expect((await request('POST', '/users', { name: 'Vendedor do histórico', email, password: 'Historico@2026', role: 'SELLER', maxDiscountPercent: 5 })).statusCode).toBe(201);
    const vendedor = { authorization: `Bearer ${(await request('POST', '/auth/login', { email, password: 'Historico@2026' }, {})).json().accessToken}` };
    expect([403, 404]).toContain((await request('GET', `/quotes/${q.id}/historico`, undefined, vendedor)).statusCode);
  });
  it('edita o contato pelo orçamento: o cliente, este orçamento e o PDF passam a mostrá-lo', async () => {
    const q = await quote();
    const nome = (await request('GET', `/customers/${q.customerId}`)).json().name;
    const editado = await request('PATCH', `/quotes/${q.id}/contact`, { name: '', phone: '(92) 98877-0001', address: 'Rua das Pedras, 10', email: null });
    expect(editado.statusCode, editado.body).toBe(200);
    // Nome vazio mantém o salvo; telefone vai só com números.
    expect(editado.json()).toMatchObject({ customerNameSnapshot: nome, customerPhoneSnapshot: '92988770001', workAddressSnapshot: 'Rua das Pedras, 10' });
    expect((await request('GET', `/customers/${q.customerId}`)).json()).toMatchObject({ name: nome, phone: '92988770001', address: 'Rua das Pedras, 10' });
    const pdf = execFileSync('pdftotext', ['-', '-'], { input: (await request('GET', `/quotes/${q.id}/pdf`)).rawPayload, encoding: 'utf8' });
    expect(pdf).toContain('Rua das Pedras, 10'); expect(pdf).toContain('92988770001');
    // Telefone de outro cliente é recusado; outro vendedor não edita o contato deste orçamento.
    const outro = await customer();
    expect((await request('PATCH', `/quotes/${q.id}/contact`, { phone: outro.phone })).statusCode).toBe(409);
    const email = `contato-${Date.now()}@example.test`;
    expect((await request('POST', '/users', { name: 'Vendedor do contato', email, password: 'Contato@2026', role: 'SELLER', maxDiscountPercent: 5 })).statusCode).toBe(201);
    const vendedor = { authorization: `Bearer ${(await request('POST', '/auth/login', { email, password: 'Contato@2026' }, {})).json().accessToken}` };
    expect([403, 404]).toContain((await request('PATCH', `/quotes/${q.id}/contact`, { phone: '92988770002' }, vendedor)).statusCode);
    expect((await request('GET', `/customers/${q.customerId}`)).json().phone).toBe('92988770001');
  });
  it('validade sempre 10 dias úteis após a emissão; observações do orçamento pela tela do orçamento, sem se perder ao editar', async () => {
    // A validade enviada é ignorada: vale sempre a regra dos 10 dias úteis.
    const q = await quote({ validUntil: '2030-01-01' });
    expect(q.validUntil.slice(0, 10)).toBe(validadeOrcamento(new Date(q.createdAt)));
    expect(q.notes).toBeNull();
    const salvo = await request('PATCH', `/quotes/${q.id}/tracking`, { notes: '  Conferir medidas no local.  ', deliveryDeadline: '2030-02-01', deadlineConfirmed: true });
    expect(salvo.statusCode, salvo.body).toBe(200);
    expect(salvo.json()).toMatchObject({ notes: 'Conferir medidas no local.', deadlineConfirmed: true });
    // Editar pelo Novo orçamento (que não manda observações nem validade) mantém as duas.
    const { notes: _notes, validUntil: _validUntil, ...semObservacoes } = editInput(salvo.json());
    const editado = await request('PUT', `/quotes/${q.id}`, semObservacoes);
    expect(editado.statusCode, editado.body).toBe(200);
    expect(editado.json()).toMatchObject({ notes: 'Conferir medidas no local.', validUntil: q.validUntil });
    const pdf = execFileSync('pdftotext', ['-', '-'], { input: (await request('GET', `/quotes/${q.id}/pdf`)).rawPayload, encoding: 'utf8' });
    expect(pdf).toContain(`VÁLIDO ATÉ: ${validadeOrcamento(new Date(q.createdAt)).split('-').reverse().join('/')}`);
    expect(pdf).toContain('Conferir medidas no local.');
    // Apagar as observações; texto longo demais é recusado.
    expect((await request('PATCH', `/quotes/${q.id}/tracking`, { notes: '' })).json().notes).toBeNull();
    expect((await request('PATCH', `/quotes/${q.id}/tracking`, { notes: 'x'.repeat(3001) })).statusCode).toBe(422);
  });
});

describe('Plano de produção (drawingData) nunca altera o comercial', () => {
  const plano = (componentId: string, pieces: any[]) => ({ entryMode: 'DETAILED', detailingStatus: 'COMPLETED', productionPlan: {
    version: 1,
    sources: [{ componentId, splitAxis: 'LENGTH', snapshotLengthMm: 2000, snapshotWidthMm: 600, snapshotQuantity: 1, snapshotComponentType: 'TOP' }],
    pieces, cutouts: [],
  } });
  it('o id do componente enviado pelo cliente vira definitivo já na criação, e o plano referencia esse mesmo id', async () => {
    const componentId = 'cliente-comp-criacao';
    const drawingData = plano(componentId, [{ id: 'peca-1', sourceComponentId: componentId, label: 'Peça 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, edges: [] }]);
    const q = await quote({ items: [item({ components: [{ ...item().components[0], id: componentId }], drawingData })] });
    expect(q.items[0].components[0].id).toBe(componentId);
    expect(q.items[0].drawingData.productionPlan.pieces[0].sourceComponentId).toBe(componentId);
  });
  it('editar só o plano de produção preserva grossTotal, netTotal, total do item, id do componente e valor aplicado (usa o mesmo atalho que já preserva drawingData)', async () => {
    const componentId = 'comp-financeiro-invariavel';
    let q = await quote({ items: [item({ components: [{ ...item().components[0], id: componentId, appliedTotal: 900 }] })], discountAmount: 30 });
    const before = { grossTotal: q.grossTotal, netTotal: q.netTotal, itemTotal: q.items[0].total, componentId: q.items[0].components[0].id, appliedTotal: q.items[0].components[0].appliedTotal, updatedAt: q.updatedAt };
    const payload = editInput(q);
    payload.items[0].drawingData = plano(componentId, [
      { id: 'p1', sourceComponentId: componentId, label: 'Bancada 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1200, widthMm: 600, quantity: 1, edges: [] },
      { id: 'p2', sourceComponentId: componentId, label: 'Bancada 2', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 800, widthMm: 600, quantity: 1, edges: [] },
    ]);
    const updated = await request('PUT', `/quotes/${q.id}`, payload);
    expect(updated.statusCode, updated.body).toBe(200);
    q = updated.json();
    expect(q.grossTotal).toBe(before.grossTotal);
    expect(q.netTotal).toBe(before.netTotal);
    expect(q.items[0].total).toBe(before.itemTotal);
    expect(q.items[0].components[0].id).toBe(before.componentId);
    expect(q.items[0].components[0].appliedTotal).toBe(before.appliedTotal);
    expect(q.updatedAt).not.toBe(before.updatedAt); // a linha foi tocada (drawingData mudou), só o financeiro que não recalcula
    expect(q.items[0].drawingData.productionPlan.pieces).toHaveLength(2);
    expect(q.items[0].drawingData.productionPlan.pieces.map((piece: any) => piece.lengthMm)).toEqual([1200, 800]);
  });
  it('gerar PDF comercial depois de anexar o plano de produção continua mostrando os valores antigos', async () => {
    const componentId = 'comp-pdf-invariavel';
    let q = await quote({ items: [item({ components: [{ ...item().components[0], id: componentId, appliedTotal: 987.65 }] })], discountAmount: 12.34 });
    const payload = editInput(q);
    payload.items[0].drawingData = plano(componentId, [{ id: 'p1', sourceComponentId: componentId, label: 'Peça 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, edges: [] }]);
    q = (await request('PUT', `/quotes/${q.id}`, payload)).json();
    const response = await request('GET', `/quotes/${q.id}/pdf`);
    expect(response.statusCode).toBe(200);
    const text = execFileSync('pdftotext', ['-', '-'], { input: response.rawPayload, encoding: 'utf8' });
    expect(text).toContain('975,31'); expect(text).toContain('987,65');
  });
  it('rejeita plano de produção cuja peça não referencia nenhum componente comercial do item', async () => {
    const drawingData = plano('componente-inexistente', [{ id: 'p1', sourceComponentId: 'componente-inexistente', label: 'Peça 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, edges: [] }]);
    const client = await customer();
    const response = await request('POST', '/quotes', { customerId: client.id, items: [item({ drawingData })] });
    expect(response.statusCode).toBe(422);
  });
  it('orçamento legado sem productionPlan continua sendo lido e editado normalmente', async () => {
    const q = await quote();
    expect(q.items[0].drawingData ?? null).toBeNull();
    const payload = editInput(q);
    const updated = await request('PUT', `/quotes/${q.id}`, { ...payload, notes: 'Sem plano de produção' });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().items[0].drawingData ?? null).toBeNull();
  });
  it('editar só o plano de produção preserva valores aplicados de bordas, recortes e serviços do item, mesmo com desconto global', async () => {
    const componentId = 'comp-financeiro-detalhado';
    const edge = catalog.services.find((entry: any) => entry.name.includes('Meia Cana'));
    const cut = catalog.services.find((entry: any) => entry.name === 'Furo de Cuba');
    const sink = catalog.services.find((entry: any) => entry.name === 'Cuba Média 47 x 30');
    let q = await quote({ discountAmount: 10, items: [item({ components: [
      { ...item().components[0], id: componentId, appliedTotal: 600, edges: [{ side: 'FRONT', serviceId: edge.id, appliedSubtotal: 10 }] },
    ], cutouts: [{ cutoutType: 'SINK', componentIndex: 0, quantity: 1, serviceId: cut.id, appliedSubtotal: 50 }], services: [{ serviceId: sink.id, billedQuantity: 1, appliedSubtotal: 250 }] })] });
    const before = { netTotal: q.netTotal, grossTotal: q.grossTotal, itemTotal: q.items[0].total,
      componentAppliedTotal: q.items[0].components[0].appliedTotal, edgeAppliedSubtotal: q.items[0].components[0].edges[0].appliedSubtotal,
      cutoutAppliedSubtotal: q.items[0].cutouts[0].appliedSubtotal, serviceAppliedSubtotal: q.items[0].services[0].appliedSubtotal };
    const payload = editInput(q);
    payload.items[0].drawingData = plano(componentId, [
      { id: 'p1', sourceComponentId: componentId, label: 'Peça 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1200, widthMm: 600, quantity: 1,
        edges: [{ side: 'FRONT', serviceId: edge.id, serviceName: edge.name, quantity: 1 }] },
      { id: 'p2', sourceComponentId: componentId, label: 'Peça 2', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 800, widthMm: 600, quantity: 1, edges: [] },
    ]);
    const updated = await request('PUT', `/quotes/${q.id}`, payload);
    expect(updated.statusCode, updated.body).toBe(200);
    // Confirma persistência de verdade — não só o corpo devolvido pelo PUT.
    const refetched = await request('GET', `/quotes/${q.id}`);
    expect(refetched.statusCode).toBe(200);
    q = refetched.json();
    expect(q.netTotal).toBe(before.netTotal);
    expect(q.grossTotal).toBe(before.grossTotal);
    expect(q.items[0].total).toBe(before.itemTotal);
    expect(q.items[0].components[0].appliedTotal).toBe(before.componentAppliedTotal);
    expect(q.items[0].components[0].edges[0].appliedSubtotal).toBe(before.edgeAppliedSubtotal);
    expect(q.items[0].cutouts[0].appliedSubtotal).toBe(before.cutoutAppliedSubtotal);
    expect(q.items[0].services[0].appliedSubtotal).toBe(before.serviceAppliedSubtotal);
    expect(q.items[0].drawingData.productionPlan.pieces).toHaveLength(2);
  });
  it('dividir peça, adicionar 45° e anexar rodabanca no desenho — via endpoint real — nunca dispara recálculo financeiro', async () => {
    const componentId = 'comp-fluxo-completo';
    const miter = catalog.services.find((entry: any) => entry.name.includes('45°') && entry.name.includes('Granito'));
    let q = await quote({ items: [item({ components: [{ ...item().components[0], id: componentId, lengthMm: 3600, appliedTotal: 2222 }] })] });
    const before = { netTotal: q.netTotal, grossTotal: q.grossTotal, componentId: q.items[0].components[0].id, appliedTotal: q.items[0].components[0].appliedTotal };
    // Simula exatamente o que o editor de detalhamento faz: dividir em 3, dar
    // 45° numa peça e anexar uma rodabanca seguindo a divisão — tudo dentro de
    // drawingData, sem tocar em item.components.
    const payload = editInput(q);
    payload.items[0].drawingData = {
      entryMode: 'DETAILED', detailingStatus: 'COMPLETED',
      productionPlan: {
        version: 1,
        sources: [{ componentId, splitAxis: 'LENGTH', snapshotLengthMm: 3600, snapshotWidthMm: 600, snapshotQuantity: 1, snapshotComponentType: 'TOP' }],
        pieces: [
          { id: 'p1', sourceComponentId: componentId, label: 'Bancada 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1400, widthMm: 600, quantity: 1, edges: [{ side: 'FRONT', serviceId: miter.id, serviceName: miter.name, quantity: 1 }] },
          { id: 'p2', sourceComponentId: componentId, label: 'Bancada 2', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 900, widthMm: 600, quantity: 1, edges: [] },
          { id: 'p3', sourceComponentId: componentId, label: 'Bancada 3', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1300, widthMm: 600, quantity: 1, edges: [] },
          { id: 'rb1', sourceComponentId: componentId, label: '', componentType: 'BACKSPLASH', orientation: 'VERTICAL', lengthMm: 1400, widthMm: 100, quantity: 1, edges: [], parentPieceId: 'p1', parentSide: 'FRONT' },
        ],
        cutouts: [],
      },
    };
    const updated = await request('PUT', `/quotes/${q.id}`, payload);
    expect(updated.statusCode, updated.body).toBe(200);
    const refetched = await request('GET', `/quotes/${q.id}`);
    q = refetched.json();
    expect(q.netTotal).toBe(before.netTotal);
    expect(q.grossTotal).toBe(before.grossTotal);
    expect(q.items[0].components).toHaveLength(1);
    expect(q.items[0].components[0].id).toBe(before.componentId);
    expect(q.items[0].components[0].appliedTotal).toBe(before.appliedTotal);
    expect(q.items[0].drawingData.productionPlan.pieces).toHaveLength(4);
  });
  it('a ordem de serviço mostra cada peça de produção separadamente, mesmo vindo de um único componente comercial', async () => {
    const componentId = 'comp-os-dividida';
    let q = await quote({ items: [item({ components: [{ ...item().components[0], id: componentId, lengthMm: 3600 }] })] });
    const payload = editInput(q);
    payload.items[0].drawingData = plano(componentId, [
      { id: 'p1', sourceComponentId: componentId, label: 'Bancada 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1400, widthMm: 600, quantity: 1, edges: [] },
      { id: 'p2', sourceComponentId: componentId, label: 'Bancada 2', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 900, widthMm: 600, quantity: 1, edges: [] },
      { id: 'p3', sourceComponentId: componentId, label: 'Bancada 3', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1300, widthMm: 600, quantity: 1, edges: [] },
    ]);
    const updated = await request('PUT', `/quotes/${q.id}`, payload);
    expect(updated.statusCode, updated.body).toBe(200);
    q = updated.json();
    expect(q.items[0].components).toHaveLength(1); // comercial continua um componente só
    const pdf = await request('GET', `/quotes/${q.id}/pdf?drawings=true`);
    expect(pdf.statusCode).toBe(200);
    const text = execFileSync('pdftotext', ['-', '-'], { input: pdf.rawPayload, encoding: 'utf8' });
    expect(text).toMatch(/\bOS\b/);
    expect(text).toContain('Bancada 1');
    expect(text).toContain('Bancada 2');
    expect(text).toContain('Bancada 3');
    // Prazo acordado deve acompanhar alterações salvas na OS, sem ficar preso ao automático.
    for (const [deliveryDeadline, expected] of [['2026-10-20', '20/10/2026'], ['2026-10-22', '22/10/2026']]) {
      const tracking = await request('PATCH', `/quotes/${q.id}/tracking`, { deliveryDeadline });
      expect(tracking.statusCode, tracking.body).toBe(200);
      const updatedPdf = await request('GET', `/quotes/${q.id}/pdf?drawings=true`);
      expect(updatedPdf.statusCode).toBe(200);
      const pages = execFileSync('pdftotext', ['-layout', '-', '-'], { input: updatedPdf.rawPayload, encoding: 'utf8' }).split('\f');
      const drawingPages = pages.filter(page => /\bOS\b/.test(page));
      expect(pages[0]).toContain(`ENTREGA: ${expected}`);
      expect(drawingPages.length).toBeGreaterThan(0);
      for (const page of drawingPages) expect(page).toContain(expected);
    }
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
