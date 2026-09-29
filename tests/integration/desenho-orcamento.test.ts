import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arredondarMoeda, calcularAcabamentoBorda, calcularLinha, calcularTotalOrcamento, medidaM2Fechado, calcularAreaRetangularM2, type SavedQuoteItem } from '@inova/domain';
import { contornoDosParametros, emptyTechnicalDocument, estimarDesenho, featureSchema, makePiece, type CatalogoEstimativa, type Feature, type TechnicalDocument } from '@inova/domain/technical';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { projetoDoDesenho } from '../../front/utilitarios/desenho-orcamento.js';
import { itemSalvoParaRascunho, rascunhoParaEntradaItem } from '../../front/utilitarios/saved-quote.js';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
type Auth = Record<string, string>;
let admin: Auth, vendedor: Auth, outro: Auth, catalogo: CatalogoEstimativa, produto: string, cliente: any, sequencia = 0;
const request = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, auth: Auth, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
async function login(email: string, password = process.env.SEED_PASSWORD!) {
  const response = await request('POST', '/auth/login', {}, { email, password });
  expect(response.statusCode, response.body).toBe(200);
  return { authorization: `Bearer ${response.json().accessToken}` };
}
async function novoVendedor(nome: string) {
  const email = `desenho-${Date.now()}-${++sequencia}@example.test`;
  const criado = await request('POST', '/users', admin, { name: nome, email, password: 'Desenho@2026', role: 'SELLER', maxDiscountPercent: 10 });
  expect(criado.statusCode, criado.body).toBe(201);
  return login(email, 'Desenho@2026');
}
const servico = (nome: string) => catalogo.services.find((entrada) => entrada.name === nome)!;
const recurso = (dados: Partial<Feature> & Pick<Feature, 'id' | 'type' | 'pieceId'>) => featureSchema.parse({ x: 0, y: 0, ...dados });

/** Cozinha em U + soleira fora do múltiplo de 5 cm (para o M² fechado fazer diferença), na pedra Branco Dallas. */
function cozinha(): TechnicalDocument {
  const pedra = { id: catalogo.materials.find((material) => material.name === 'Branco Dallas')!.id, textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 };
  const doc = emptyTechnicalDocument();
  const soleira = makePiece('s', 'RECTANGLE', 1);
  const medidas = { ...soleira.parameters!, width: 837, length: 143 };
  doc.pieces.push({ ...makePiece('u', 'U'), name: 'Bancada', material: pedra }, { ...soleira, name: 'Soleira', parameters: medidas, contour: contornoDosParametros('s', medidas), x: 3200, material: pedra });
  doc.features.push(
    recurso({ id: 'cuba', type: 'SINK', pieceId: 'u', x: 1300, y: 1200, widthMm: 500, lengthMm: 400 }),
    recurso({ id: 'furo', type: 'HOLE', pieceId: 'u', x: 1300, y: 1440, diameterMm: 35 }),
    recurso({ id: 'saia', type: 'SKIRT', pieceId: 'u', edgeId: 'u-v7', extentMm: 1500, heightMm: 45 }),
    recurso({ id: 'borda', type: 'EDGE_FINISH', pieceId: 'u', edgeId: 'u-v2', extentMm: 1400, profile: 'MITER45' }),
    recurso({ id: 'roda', type: 'BACKSPLASH', pieceId: 'u', edgeId: 'u-v6', extentMm: 2600, heightMm: 75 }),
  );
  return doc;
}
/** O que o Novo orçamento grava com M² fechado (prepareDraftForSave): valor da peça com a pedra fechada + bordas. */
function comValorM2Fechado(projeto: ReturnType<typeof projetoDoDesenho>) {
  const preco = catalogo.materials.find((material) => material.id === projeto.materialId)!.currentPrice!;
  return { ...projeto, drawingData: { ...projeto.drawingData, m2Fechado: true }, components: projeto.components.map((componente) => {
    const [comprimento, largura] = [Math.round(Number(componente.lengthCm) * 10), Math.round(Number(componente.widthCm) * 10)];
    const pedra = calcularLinha({ billingUnit: 'SQUARE_METER', unitPrice: preco, billedQuantity: calcularAreaRetangularM2(medidaM2Fechado(comprimento), medidaM2Fechado(largura)) }).subtotal;
    const bordas = componente.edges.map((borda) => {
      const nome = catalogo.services.find((entrada) => entrada.id === borda.serviceId)!.name;
      const lengthMm = borda.lengthCm ? Math.round(Number(borda.lengthCm) * 10) : borda.side === 'FRONT' || borda.side === 'BACK' ? comprimento : largura;
      return calcularAcabamentoBorda({ name: nome, lengthMm, heightMm: borda.heightCm ? Math.round(Number(borda.heightCm) * 10) : undefined, quantity: 1, materialPrice: preco, servicePrice: servico(nome).currentPrice }).subtotal;
    });
    return { ...componente, appliedTotal: arredondarMoeda(pedra + calcularTotalOrcamento(bordas)).toFixed(2).replace('.', ',') };
  }) };
}

beforeAll(async () => {
  await app.ready();
  admin = await login('admin@inovamarmoraria.local');
  vendedor = await novoVendedor('Vendedor do desenho'); outro = await novoVendedor('Outro vendedor');
  const resposta = (await request('GET', '/catalog', vendedor)).json();
  catalogo = { materials: resposta.materials, services: resposta.services.map((entrada: any) => ({ ...entrada, currentPrice: Number(entrada.currentPrice) })) };
  produto = resposta.productTypes[0].id;
  const criado = await request('POST', '/customers', vendedor, { quick: true });
  expect(criado.statusCode, criado.body).toBe(201);
  cliente = criado.json();
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('Desenho técnico dentro do Novo orçamento', () => {
  it('o vendedor desenha para o próprio cliente; conferência e clientes de outros continuam fechados', async () => {
    const criado = await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Cozinha' });
    expect(criado.statusCode, criado.body).toBe(201);
    const { designId } = criado.json();
    const rascunho = await request('GET', `/designs/${designId}/draft`, vendedor);
    expect(rascunho.statusCode, rascunho.body).toBe(200);
    const salvo = await request('PUT', `/designs/${designId}/draft`, vendedor, { baseVersion: rascunho.json().draft.version, document: cozinha() });
    expect(salvo.statusCode, salvo.body).toBe(200);
    expect((await request('GET', `/customers/${cliente.id}/designs`, vendedor)).json().designs).toEqual([expect.objectContaining({ id: designId, nome: 'Cozinha', pecas: 2, usadoEm: [] })]);
    for (const url of [`/designs/${designId}/draft`, `/customers/${cliente.id}/designs`]) expect((await request('GET', url, outro)).statusCode).toBe(404);
    expect((await request('POST', `/designs/${designId}/revisions`, vendedor)).statusCode).toBe(403);
    expect((await request('POST', '/jobs', vendedor, {})).statusCode).toBe(403);
  });

  it.each([false, true])('o total salvo no orçamento é o mesmo do desenho (M² fechado: %s)', async (m2Fechado) => {
    const doc = cozinha();
    const estimativa = estimarDesenho(doc, catalogo, { m2Fechado, servicosGerais: [{ serviceId: servico('Acabamento Jateado').id }] });
    expect(estimativa.problemas).toEqual([]);
    const projeto = projetoDoDesenho(estimativa.item, { id: `projeto-${m2Fechado}`, projectName: 'Cozinha', productTypeId: produto, m2Fechado,
      vinculo: { designId: 'cm0000000000000000000desenho', nome: 'Cozinha', versao: 2, total: estimativa.total, aceitoEm: new Date().toISOString() } });
    const entrada = rascunhoParaEntradaItem(m2Fechado ? comValorM2Fechado(projeto) : projeto);
    const criado = await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [entrada] });
    expect(criado.statusCode, criado.body).toBe(201);
    const orcamento = criado.json();
    expect(Number(orcamento.items[0].total)).toBe(estimativa.total);
    expect(Number(orcamento.netTotal)).toBe(estimativa.total);
    if (m2Fechado) {
      // Reaberto no Novo orçamento, o valor da pedra volta a ser calculado (não fica preso como valor digitado).
      const rascunho = itemSalvoParaRascunho(orcamento.items[0] as SavedQuoteItem);
      expect(rascunho.arredondarM2).toBe(true);
      expect(rascunho.components.every((componente) => componente.appliedTotal === undefined)).toBe(true);
    }
  });

  it('lista em que orçamento o desenho foi usado e separa os clientes sem cadastro', async () => {
    const designId = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, {})).json().designId;
    const projeto = projetoDoDesenho(estimarDesenho(cozinha(), catalogo).item, { id: 'p', projectName: 'Cozinha', productTypeId: produto, m2Fechado: false,
      vinculo: { designId, nome: 'Desenho 2', versao: 1, total: 1, aceitoEm: new Date().toISOString() } });
    const orcamento = (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [rascunhoParaEntradaItem(projeto)] })).json();
    const desenhos = (await request('GET', `/customers/${cliente.id}/designs`, vendedor)).json().designs;
    expect(desenhos.find((desenho: any) => desenho.id === designId)).toMatchObject({ nome: 'Desenho 2', usadoEm: [{ quoteId: orcamento.id, number: orcamento.number }] });

    await request('POST', '/customers', vendedor, { name: 'Cliente cadastrado', phone: '92955550001' });
    const sem = (await request('GET', '/customers?tipo=sem-cadastro', vendedor)).json();
    expect(sem.data.map((entrada: any) => entrada.id)).toEqual([cliente.id]);
    expect(sem.counts).toEqual({ cadastrados: 1, semCadastro: 1 });
    expect((await request('GET', '/customers?tipo=cadastrados', vendedor)).json().data.map((entrada: any) => entrada.name)).toEqual(['Cliente cadastrado']);
  });

  it('recusa vínculo com desenho malformado no projeto', async () => {
    const projeto = projetoDoDesenho(estimarDesenho(cozinha(), catalogo).item, { id: 'x', projectName: 'Cozinha', productTypeId: produto, m2Fechado: false,
      vinculo: { designId: 'nao-e-um-id', nome: 'X', versao: 1, total: 1, aceitoEm: '' } });
    expect((await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [rascunhoParaEntradaItem(projeto)] })).statusCode).toBe(422);
  });
});
