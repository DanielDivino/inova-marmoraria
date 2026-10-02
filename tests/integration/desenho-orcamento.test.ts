import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { arredondarMoeda, calcularAcabamentoBorda, calcularLinha, calcularTotalOrcamento, medidaM2Fechado, calcularAreaRetangularM2, itemSalvoParaEntrada, type SavedQuoteItem } from '@inova/domain';
import { contornoDosParametros, emptyTechnicalDocument, estimarDesenho, featureSchema, makePiece, type CatalogoEstimativa, type Feature, type TechnicalDocument } from '@inova/domain/technical';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';
import { projetoDoDesenho } from '../../front/utilitarios/desenho-orcamento.js';
import { itemSalvoParaRascunho, rascunhoParaEntradaItem } from '../../front/utilitarios/saved-quote.js';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de testes isolado obrigatório.');
const app = await criarAplicacao();
type Auth = Record<string, string>;
let admin: Auth, vendedor: Auth, outro: Auth, catalogo: CatalogoEstimativa, produto: string, cliente: any, sequencia = 0;
const request = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, auth: Auth, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
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

  it('lista em que orçamento o desenho foi usado; clientes por situação (ativos, cadastro incompleto, arquivados)', async () => {
    const designId = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, {})).json().designId;
    const projeto = projetoDoDesenho(estimarDesenho(cozinha(), catalogo).item, { id: 'p', projectName: 'Cozinha', productTypeId: produto, m2Fechado: false,
      vinculo: { designId, nome: 'Desenho 2', versao: 1, total: 1, aceitoEm: new Date().toISOString() } });
    const orcamento = (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [rascunhoParaEntradaItem(projeto)] })).json();
    const desenhos = (await request('GET', `/customers/${cliente.id}/designs`, vendedor)).json().designs;
    expect(desenhos.find((desenho: any) => desenho.id === designId)).toMatchObject({ nome: 'Desenho 2', usadoEm: [{ quoteId: orcamento.id, number: orcamento.number }] });

    await request('POST', '/customers', vendedor, { name: 'Cliente cadastrado', phone: '92955550001' });
    const nomes = async (url: string) => (await request('GET', url, vendedor)).json().data.map((entrada: any) => entrada.name);
    const sem = (await request('GET', '/customers?situacao=incompletos', vendedor)).json();
    expect(sem.data.map((entrada: any) => entrada.id)).toEqual([cliente.id]);
    expect(sem.counts).toEqual({ todos: 2, ativos: 1, incompletos: 1, inativos: 0 });
    const [cadastrado] = (await request('GET', '/customers?situacao=ativos', vendedor)).json().data;
    expect(cadastrado.name).toBe('Cliente cadastrado');

    // Arquivado: sai da busca do Novo orçamento (sem situação) e fica em "Inativos"; reativar devolve.
    const arquivar = async (arquivado: boolean) => {
      const resposta = await request('PATCH', `/customers/${cadastrado.id}/arquivo`, vendedor, { arquivado });
      expect(resposta.statusCode, resposta.body).toBe(200);
    };
    await arquivar(true);
    const padrao = (await request('GET', '/customers', vendedor)).json();
    expect(padrao.data.map((entrada: any) => entrada.name)).not.toContain('Cliente cadastrado');
    expect(padrao.counts).toEqual({ todos: 2, ativos: 0, incompletos: 1, inativos: 1 });
    expect(await nomes('/customers?situacao=inativos')).toEqual(['Cliente cadastrado']);
    expect(await nomes('/customers?situacao=todos')).toHaveLength(2);
    await arquivar(false);
    expect(await nomes('/customers?situacao=ativos')).toEqual(['Cliente cadastrado']);
    expect(await nomes('/customers?situacao=inativos')).toEqual([]);
  });

  it('imprime o desenho técnico de cada projeto: só o dele (o antigo do orçamento vale sozinho num orçamento de um projeto)', async () => {
    const texto = (resposta: { rawPayload: Buffer }) => execFileSync('pdftotext', ['-', '-'], { input: resposta.rawPayload, encoding: 'utf8' });
    const salvarDesenho = async (designId: string, auth: Auth) => {
      const atual = (await request('GET', `/designs/${designId}/draft`, auth)).json().draft;
      expect((await request('PUT', `/designs/${designId}/draft`, auth, { baseVersion: atual.version, document: cozinha() })).statusCode).toBe(200);
    };
    const vinculo = (designId: string) => ({ designId, nome: 'Cozinha impressa', versao: 1, total: 1, aceitoEm: new Date().toISOString() });
    const doDesenho = (id: string, designId: string) => rascunhoParaEntradaItem(projetoDoDesenho(estimarDesenho(cozinha(), catalogo).item, { id, projectName: 'Cozinha', productTypeId: produto, m2Fechado: false, vinculo: vinculo(designId) }));
    const avulso = { projectName: 'Lavabo', productTypeId: produto, materialId: catalogo.materials.find((material) => material.name === 'Branco Dallas')!.id, components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 500, quantity: 1 }] };
    const designId = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Cozinha impressa' })).json().designId;
    const orcamento = (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [doDesenho('impresso', designId), avulso] })).json();
    const [cozinhaItem, lavabo] = orcamento.items;
    const imprimir = (itemId: string, auth: Auth = vendedor) => request('GET', `/quotes/${orcamento.id}/items/${itemId}/technical-pdf`, auth);

    // Desenho ainda vazio e projeto sem desenho: avisa, sem PDF.
    expect((await imprimir(cozinhaItem.id)).json()).toMatchObject({ error: 'EMPTY_TECHNICAL_DESIGN' });
    expect((await imprimir(lavabo.id)).json()).toMatchObject({ error: 'NO_TECHNICAL_DESIGN' });
    await salvarDesenho(designId, vendedor);
    const pdf = await imprimir(cozinhaItem.id);
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    // No padrão das folhas de OS: data de entrega, cliente, número da OS, projeto e pedra.
    expect(texto(pdf)).toContain('DATA DE ENTREGA');
    expect(texto(pdf)).toContain(orcamento.number);
    expect(texto(pdf)).toContain('Desenho técnico · Cozinha');
    expect(texto(pdf)).toContain('Versão 2 · Página 1 de 1');
    expect(texto(pdf)).not.toContain('INOVA MARMORARIA');
    // Outro vendedor não imprime o orçamento de quem não é dele.
    expect((await imprimir(cozinhaItem.id, outro)).statusCode).toBe(404);

    // O desenho antigo do orçamento (um só para todo o orçamento) não passa para outro projeto.
    const antigo = (await request('POST', `/quotes/${orcamento.id}/technical-project`, admin)).json();
    await salvarDesenho(antigo.designId, admin);
    expect((await imprimir(lavabo.id)).json()).toMatchObject({ error: 'NO_TECHNICAL_DESIGN' });
    // Num orçamento de um projeto só, ele continua valendo para esse projeto.
    const sozinho = (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [avulso] })).json();
    await salvarDesenho((await request('POST', `/quotes/${sozinho.id}/technical-project`, admin)).json().designId, admin);
    expect((await request('GET', `/quotes/${sozinho.id}/items/${sozinho.items[0].id}/technical-pdf`, vendedor)).statusCode).toBe(200);

    // Vínculo com desenho de outro cliente (enviado à mão) não imprime o desenho alheio.
    const outroCliente = (await request('POST', '/customers', admin, { quick: true })).json();
    const alheio = (await request('POST', `/customers/${outroCliente.id}/designs`, admin, {})).json().designId;
    await salvarDesenho(alheio, admin);
    const desviado = (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [doDesenho('desviado', alheio)] })).json();
    expect((await request('GET', `/quotes/${desviado.id}/items/${desviado.items[0].id}/technical-pdf`, vendedor)).json()).toMatchObject({ error: 'NO_TECHNICAL_DESIGN' });
  });

  it('Exportar: orçamento e ordem de serviço no mesmo PDF — a planta do desenho técnico no projeto que tem, as peças do orçamento no que não tem', async () => {
    const texto = (resposta: { rawPayload: Buffer }) => execFileSync('pdftotext', ['-layout', '-', '-'], { input: resposta.rawPayload, encoding: 'utf8' });
    const tamanhos = (resposta: { rawPayload: Buffer }) => execFileSync('pdfinfo', ['-f', '1', '-l', '99', '-'], { input: resposta.rawPayload, encoding: 'utf8' }).match(/Page +\d+ size: +[\d.]+ x [\d.]+/g)!.map((linha) => linha.includes('595.') ? 'A4' : 'carta');
    const designId = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Cozinha exportada' })).json().designId;
    const atual = (await request('GET', `/designs/${designId}/draft`, vendedor)).json().draft;
    expect((await request('PUT', `/designs/${designId}/draft`, vendedor, { baseVersion: atual.version, document: cozinha() })).statusCode).toBe(200);
    const vinculo = { designId, nome: 'Cozinha exportada', versao: 2, total: 1, aceitoEm: new Date().toISOString() };
    const cozinhaProjeto = rascunhoParaEntradaItem(projetoDoDesenho(estimarDesenho(cozinha(), catalogo).item, { id: 'exportado', projectName: 'Cozinha', productTypeId: produto, m2Fechado: false, vinculo }));
    const avulso = { projectName: 'Lavabo', productTypeId: produto, materialId: catalogo.materials.find((material) => material.name === 'Branco Dallas')!.id, components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 500, quantity: 1 }] };
    const orcamento = (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [cozinhaProjeto, avulso] })).json();
    const [cozinhaItem, lavabo] = orcamento.items;
    const exportar = (caminho: string, partes: string) => request('GET', `/quotes/${orcamento.id}${caminho}?${partes}`, vendedor);

    // Projeto com desenho técnico: o orçamento (carta) e a planta dele na OS (A4).
    const completo = await exportar(`/items/${cozinhaItem.id}/pdf`, 'commercial=true&drawings=true');
    expect(completo.statusCode, completo.body).toBe(200);
    const paginas = texto(completo).split('\f').filter((pagina) => pagina.trim());
    expect(paginas[0]).toContain('TOTAL DO PROJETO');
    expect(paginas[0]).not.toContain('LAVABO');
    expect(paginas[1]).toMatch(/Versão 2 · Página 1 de \d/);
    expect(tamanhos(completo)).toEqual(['carta', ...paginas.slice(1).map(() => 'A4')]);
    // Só a OS: começa em A4, sem a folha do orçamento.
    const soOs = await exportar(`/items/${cozinhaItem.id}/pdf`, 'commercial=false&drawings=true');
    expect(texto(soOs)).not.toContain('TOTAL DO PROJETO');
    expect(new Set(tamanhos(soOs))).toEqual(new Set(['A4']));
    // Projeto sem desenho técnico: a OS sai com as peças do orçamento.
    const osLavabo = texto(await exportar(`/items/${lavabo.id}/pdf`, 'commercial=false&drawings=true'));
    expect(osLavabo).toContain('Lavabo');
    expect(osLavabo).not.toMatch(/Versão \d+ · Página/);
    // Nada marcado: avisa, sem PDF.
    expect((await exportar('/pdf', 'commercial=false&drawings=false')).json()).toMatchObject({ error: 'NOTHING_TO_EXPORT' });
    // Orçamento todo: a planta da cozinha e a folha do lavabo; sem a OS, só o orçamento.
    const geral = texto(await exportar('/pdf', 'commercial=true&drawings=true'));
    expect(geral.match(/Versão \d+ · Página 1 de/g)).toHaveLength(1);
    expect(geral).toContain('LAVABO');
    expect(texto(await exportar('/pdf', 'commercial=true&drawings=false'))).not.toMatch(/Versão \d+ · Página/);
  });

  it('Emenda: as pedras do desenho técnico saem na OS, no fluxo e na nota de entrega; o valor não muda', async () => {
    const texto = (resposta: { rawPayload: Buffer }) => execFileSync('pdftotext', ['-layout', '-', '-'], { input: resposta.rawPayload, encoding: 'utf8' });
    // Bancada em U dividida no lado de cima a 1m30: duas pedras de 1m30 × 1m50.
    const documento = cozinha();
    documento.features.push(recurso({ id: 'emenda', type: 'SEAM', pieceId: 'u', edgeId: 'u-v6', startMm: 1300 }));
    const designId = (await request('POST', `/customers/${cliente.id}/designs`, admin, { name: 'Cozinha com emenda' })).json().designId;
    const atual = (await request('GET', `/designs/${designId}/draft`, admin)).json().draft;
    expect((await request('PUT', `/designs/${designId}/draft`, admin, { baseVersion: atual.version, document: documento })).statusCode).toBe(200);
    expect(estimarDesenho(documento, catalogo).total).toBe(estimarDesenho(cozinha(), catalogo).total);
    const vinculo = { designId, nome: 'Cozinha com emenda', versao: 2, total: 1, aceitoEm: new Date().toISOString() };
    const projeto = rascunhoParaEntradaItem(projetoDoDesenho(estimarDesenho(documento, catalogo).item, { id: 'emendado', projectName: 'Cozinha', productTypeId: produto, m2Fechado: false, vinculo }));
    const orcamento = (await request('POST', '/quotes', admin, { customerId: cliente.id, items: [projeto] })).json();
    for (const corpo of [{ status: 'APPROVED' }, { status: 'APPROVED', executionStatus: 'IN_PROGRESS' }]) {
      const mudou = await request('PATCH', `/quotes/${orcamento.id}/status`, admin, corpo);
      expect(mudou.statusCode, mudou.body).toBe(200);
    }
    // Fluxo: as pedras do desenho (duas partes, soleira, saia e rodabanca), não as linhas do orçamento.
    const [cartao] = (await request('GET', '/workflow/projects', admin)).json().filter((entrada: any) => entrada.quote.id === orcamento.id);
    expect(cartao.totalPieces).toBe(5);
    expect(cartao.pieceList.map((peca: any) => [peca.name, peca.lengthMm, peca.widthMm])).toEqual([
      ['Bancada · parte 1', 1300, 1500], ['Bancada · parte 2', 1300, 1500], ['Saia · Bancada', 1500, 45], ['Rodabanca · Bancada', 2600, 75], ['Soleira', 837, 143],
    ]);
    // Entregas: as mesmas pedras para conferir.
    const entregas = (await request('GET', `/quotes/${orcamento.id}/entregas`, admin)).json();
    expect(entregas.projects[0].pieces.map((peca: any) => peca.key)).toEqual(['u:1', 'u:2', 'saia', 'roda', 's']);
    // OS: a planta com a emenda e a tabela das pedras.
    const os = texto(await request('GET', `/quotes/${orcamento.id}/pdf?commercial=false&drawings=true`, admin));
    expect(os).toContain('Divisão em pedras (emendas)');
    expect(os.match(/1m30 × 1m50/g)).toHaveLength(2);
  });

  describe('cada projeto do orçamento tem o seu desenho técnico', () => {
    const salvarDesenho = async (designId: string) => {
      const atual = (await request('GET', `/designs/${designId}/draft`, admin)).json().draft;
      expect((await request('PUT', `/designs/${designId}/draft`, admin, { baseVersion: atual.version, document: cozinha() })).statusCode).toBe(200);
    };
    const projeto = (projectName: string) => ({ projectName, productTypeId: produto, materialId: catalogo.materials.find((material) => material.name === 'Branco Dallas')!.id, components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 500, quantity: 1 }] });
    const novoOrcamento = async (...nomes: string[]) => (await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: nomes.map(projeto) })).json();
    const abrir = (orcamento: any, itemId: string, corpo: object = {}) => request('POST', `/quotes/${orcamento.id}/items/${itemId}/technical-design`, admin, corpo);

    it('cria um desenho para cada projeto, abre sempre o mesmo e não empresta para o outro', async () => {
      const orcamento = await novoOrcamento('Cozinha', 'Banheiro');
      const [cozinhaItem, banheiro] = orcamento.items;
      const daCozinha = await abrir(orcamento, cozinhaItem.id);
      expect(daCozinha.statusCode, daCozinha.body).toBe(201);
      expect(daCozinha.json().editorUrl).toMatch(/^\/projetos\/[^/]+\/desenhos\/[^/]+$/);
      expect((await abrir(orcamento, cozinhaItem.id)).json().designId).toBe(daCozinha.json().designId);
      await salvarDesenho(daCozinha.json().designId);
      // Desenhar a cozinha não dá desenho técnico ao banheiro.
      expect((await request('GET', `/quotes/${orcamento.id}/desenhos-tecnicos`, vendedor)).json()).toEqual({ projetos: [cozinhaItem.id] });
      const doBanheiro = await abrir(orcamento, banheiro.id);
      expect(doBanheiro.statusCode).toBe(201);
      expect(doBanheiro.json().designId).not.toBe(daCozinha.json().designId);
      // O vínculo fica gravado no próprio projeto, com o nome do projeto e do orçamento.
      const salvo = (await request('GET', `/quotes/${orcamento.id}`, vendedor)).json();
      expect(salvo.items.find((item: any) => item.id === cozinhaItem.id).drawingData.desenhoTecnico).toMatchObject({ designId: daCozinha.json().designId, nome: `Cozinha · ${orcamento.number}` });
      // Aparece na linha do tempo do orçamento.
      expect((await request('GET', `/quotes/${orcamento.id}/historico`, admin)).json().eventos.map((evento: any) => evento.titulo)).toContain('Desenho técnico iniciado');
    });

    it('projeto duplicado: a cópia do desenho técnico é independente da original', async () => {
      const original = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Cozinha' })).json().designId;
      await salvarDesenho(original);
      const copia = await request('POST', `/designs/${original}/copy`, vendedor, { name: 'Cozinha (cópia)' });
      expect(copia.statusCode, copia.body).toBe(201);
      expect(copia.json()).toMatchObject({ nome: 'Cozinha (cópia)', versao: 1 });
      const [daOriginal, daCopia] = await Promise.all([original, copia.json().designId].map(async (designId) => (await request('GET', `/designs/${designId}/draft`, admin)).json().draft));
      expect(daCopia.document).toEqual(daOriginal.document);
      // Mexer na cópia não muda a original.
      const alterada = { ...daCopia.document, pieces: daCopia.document.pieces.map((peca: any) => ({ ...peca, name: 'Só na cópia' })) };
      const gravada = await request('PUT', `/designs/${copia.json().designId}/draft`, admin, { baseVersion: daCopia.version, document: alterada });
      expect(gravada.statusCode, gravada.body).toBe(200);
      expect((await request('GET', `/designs/${original}/draft`, admin)).json().draft.document.pieces.map((peca: any) => peca.name)).toEqual(daOriginal.document.pieces.map((peca: any) => peca.name));
      expect(daOriginal.document.pieces.map((peca: any) => peca.name)).not.toContain('Só na cópia');
      // A cópia é do mesmo cliente e aparece na lista dele; quem não vê o cliente não copia.
      expect((await request('GET', `/customers/${cliente.id}/designs`, vendedor)).json().designs.map((desenho: any) => desenho.nome)).toEqual(expect.arrayContaining(['Cozinha', 'Cozinha (cópia)']));
      expect((await request('POST', `/designs/${original}/copy`, outro, {})).statusCode).toBe(404);
    });

    it('Orçamento Rápido → desenho: um desenho novo recebe o projeto inteiro; depois vão só as mudanças', async () => {
      const bancada = { label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, edges: [{ side: 'FRONT', serviceId: servico('Saia').id, heightMm: 100 }] };
      const criado = await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [{ ...projeto('Cozinha'), components: [bancada], cutouts: [{ componentIndex: 0, cutoutType: 'SINK', label: 'Cuba', lengthMm: 500, widthMm: 400 }] }] });
      expect(criado.statusCode, criado.body).toBe(201);
      const orcamento = criado.json();
      const componente = orcamento.items[0].components[0].id;
      const aberto = await abrir(orcamento, orcamento.items[0].id);
      expect(aberto.statusCode, aberto.body).toBe(201);
      const { designId } = aberto.json();
      const documento = async () => (await request('GET', `/designs/${designId}/draft`, admin)).json().draft.document;
      const inicial = await documento();
      expect(inicial.pieces).toHaveLength(1);
      expect(inicial.pieces[0]).toMatchObject({ name: 'Bancada', parameters: { shape: 'RECTANGLE', width: 2000, length: 600 }, material: { name: 'Branco Dallas' } });
      expect(inicial.features.map((recurso: any) => recurso.type).sort()).toEqual(['SINK', 'SKIRT']);
      // O projeto guarda de onde veio cada parte no desenho.
      const salvo = (await request('GET', `/quotes/${orcamento.id}`, vendedor)).json();
      expect(salvo.items[0].drawingData.desenhoTecnico.sincronia.pecas[componente]).toMatchObject({ pecaId: inicial.pieces[0].id, forma: 'RETANGULO' });

      // Editar o orçamento salvo (medida e nome) e abrir o desenho de novo: o desenho acompanha.
      const entrada = { customerId: salvo.customerId, expectedUpdatedAt: salvo.updatedAt, discountAmount: salvo.discountAmount, notes: salvo.notes, validUntil: salvo.validUntil, items: salvo.items.map(itemSalvoParaEntrada) };
      entrada.items[0].components[0].lengthMm = 2400;
      entrada.items[0].projectName = 'Cozinha gourmet';
      const editado = await request('PUT', `/quotes/${orcamento.id}`, vendedor, entrada);
      expect(editado.statusCode, editado.body).toBe(200);
      const reaberto = await abrir(orcamento, orcamento.items[0].id);
      expect(reaberto.statusCode, reaberto.body).toBe(200);
      expect(reaberto.json().avisos).toEqual([]);
      const depois = await documento();
      expect(depois.pieces[0].parameters.width).toBe(2400);
      expect(depois.features.find((recurso: any) => recurso.type === 'SKIRT').extentMm).toBe(2400);
      expect((await request('GET', `/customers/${cliente.id}/designs`, vendedor)).json().designs.find((desenho: any) => desenho.id === designId).nome).toBe('Cozinha gourmet');
      // Sem nada novo no orçamento, abrir de novo não muda o desenho.
      const versao = (await request('GET', `/designs/${designId}/draft`, admin)).json().draft.version;
      await abrir(orcamento, orcamento.items[0].id);
      expect((await request('GET', `/designs/${designId}/draft`, admin)).json().draft.version).toBe(versao);
    });

    it('peça Arredondada salva, lida do banco e salva de novo (o banco devolve a curvatura com menos casas)', async () => {
      const designId = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Arredondada' })).json().designId;
      const rascunho = (await request('GET', `/designs/${designId}/draft`, vendedor)).json().draft;
      const parameters = { ...makePiece('r').parameters!, shape: 'ROUNDED' as const, width: 1300, length: 700, radius: 100 };
      const documento = { ...rascunho.document, pieces: [{ ...makePiece('r'), name: 'Tampo', geometryMode: 'PARAMETRIC', parameters, contour: contornoDosParametros('r', parameters) }] };
      const primeiro = await request('PUT', `/designs/${designId}/draft`, vendedor, { baseVersion: rascunho.version, document: documento });
      expect(primeiro.statusCode, primeiro.body).toBe(200);
      const lido = (await request('GET', `/designs/${designId}/draft`, vendedor)).json().draft;
      const segundo = await request('PUT', `/designs/${designId}/draft`, vendedor, { baseVersion: lido.version, document: { ...lido.document, pieces: [{ ...lido.document.pieces[0], name: 'Tampo da pia' }] } });
      expect(segundo.statusCode, segundo.body).toBe(200);
    });

    it('excluir desenho: os projetos ligados ficam sem desenho técnico; o que foi liberado para a produção não sai', async () => {
      const orcamento = await novoOrcamento('Cozinha');
      const { designId } = (await abrir(orcamento, orcamento.items[0].id)).json();
      expect((await request('DELETE', `/designs/${designId}`, outro)).statusCode).toBe(404);
      const excluido = await request('DELETE', `/designs/${designId}`, vendedor);
      expect(excluido.statusCode, excluido.body).toBe(204);
      expect((await request('GET', `/designs/${designId}/draft`, admin)).statusCode).toBe(404);
      expect((await request('GET', `/quotes/${orcamento.id}`, vendedor)).json().items[0].drawingData.desenhoTecnico).toBeUndefined();
      expect((await request('GET', `/customers/${cliente.id}/designs`, vendedor)).json().designs.map((desenho: any) => desenho.id)).not.toContain(designId);
      // As peças do orçamento continuam; abrir de novo cria outro desenho para o projeto.
      expect((await abrir(orcamento, orcamento.items[0].id)).statusCode).toBe(201);

      const liberado = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Liberado' })).json().designId;
      await salvarDesenho(liberado);
      const revisao = await request('POST', `/designs/${liberado}/revisions`, admin);
      expect(revisao.statusCode, revisao.body).toBe(201);
      expect((await request('POST', `/revisions/${revisao.json().id}/decisions`, admin, { decision: 'APPROVE', warningsAcknowledged: true })).statusCode).toBe(200);
      expect((await request('POST', `/revisions/${revisao.json().id}/release`, admin)).statusCode).toBe(200);
      const recusado = await request('DELETE', `/designs/${liberado}`, admin);
      expect(recusado.statusCode).toBe(409);
      expect(recusado.json()).toMatchObject({ error: 'DESIGN_IN_PRODUCTION' });
    });

    it('cantos arredondados: ficam no projeto salvo e o desenho recebe a peça Arredondada; raio maior que a peça é recusado', async () => {
      const criar = (raio: number) => request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [{ ...projeto('Lavabo'), drawingData: { componentDetails: [{ cornerRadiusMm: raio }] } }] });
      const grande = await criar(300);
      expect(grande.statusCode).toBe(422);
      expect(grande.body).toContain('raio dos cantos');
      const criado = await criar(100);
      expect(criado.statusCode, criado.body).toBe(201);
      const orcamento = criado.json();
      expect(orcamento.items[0].drawingData.componentDetails).toEqual([{ cornerRadiusMm: 100 }]);
      const aberto = await abrir(orcamento, orcamento.items[0].id);
      const desenho = (await request('GET', `/designs/${aberto.json().designId}/draft`, admin)).json().draft.document;
      expect(desenho.pieces[0].parameters).toMatchObject({ shape: 'ROUNDED', radius: 100, width: 1000, length: 500 });
    });

    it('Novo orçamento (antes de salvar): o desenho recebe o projeto e depois as mudanças; o que chega é validado', async () => {
      const designId = (await request('POST', `/customers/${cliente.id}/designs`, vendedor, { name: 'Lavabo' })).json().designId;
      const projetoRapido = { nome: 'Lavabo', pecas: [{ id: 'c1', label: 'Tampo', componentType: 'TOP', lengthMm: 1000, widthMm: 500, materialId: catalogo.materials[0].id, bordas: [] }], recortes: [] };
      const primeira = await request('POST', `/designs/${designId}/sincronizar`, vendedor, { projeto: projetoRapido });
      expect(primeira.statusCode, primeira.body).toBe(200);
      expect(primeira.json()).toMatchObject({ alterado: true, avisos: [], versao: 2, nome: 'Lavabo' });
      const mudado = { ...projetoRapido, nome: 'Lavabo social', pecas: [{ ...projetoRapido.pecas[0], widthMm: 550 }] };
      const segunda = await request('POST', `/designs/${designId}/sincronizar`, vendedor, { projeto: mudado, sincronia: primeira.json().sincronia });
      expect(segunda.json()).toMatchObject({ alterado: true, versao: 3, nome: 'Lavabo social' });
      expect((await request('GET', `/designs/${designId}/draft`, admin)).json().draft.document.pieces[0].parameters).toMatchObject({ width: 1000, length: 550 });
      expect((await request('POST', `/designs/${designId}/sincronizar`, vendedor, { projeto: { nome: 'x', pecas: [{ id: 'c1' }], recortes: [] } })).statusCode).toBe(422);
      expect((await request('POST', `/designs/${designId}/sincronizar`, outro, { projeto: projetoRapido })).statusCode).toBe(404);
    });

    it('o desenho antigo do orçamento vai para o projeto escolhido; num orçamento de um projeto só, sem perguntar', async () => {
      const orcamento = await novoOrcamento('Cozinha', 'Banheiro');
      const [cozinhaItem, banheiro] = orcamento.items;
      const antigo = (await request('POST', `/quotes/${orcamento.id}/technical-project`, admin)).json();
      const pergunta = await abrir(orcamento, cozinhaItem.id);
      expect(pergunta.statusCode).toBe(409);
      expect(pergunta.json()).toMatchObject({ error: 'UNASSIGNED_TECHNICAL_DESIGN' });
      // "Criar um novo" deixa o antigo livre para outro projeto.
      expect((await abrir(orcamento, banheiro.id, { usarDoOrcamento: false })).json().designId).not.toBe(antigo.designId);
      expect((await abrir(orcamento, cozinhaItem.id, { usarDoOrcamento: true })).json().designId).toBe(antigo.designId);
      await salvarDesenho(antigo.designId);
      // O desenho novo do banheiro já veio com as peças do orçamento.
      expect((await request('GET', `/quotes/${orcamento.id}/desenhos-tecnicos`, vendedor)).json().projetos.sort()).toEqual([cozinhaItem.id, banheiro.id].sort());

      const sozinho = await novoOrcamento('Lavabo');
      const doSozinho = (await request('POST', `/quotes/${sozinho.id}/technical-project`, admin)).json();
      expect((await abrir(sozinho, sozinho.items[0].id)).json().designId).toBe(doSozinho.designId);
    });
  });

  it('recusa vínculo com desenho malformado no projeto', async () => {
    const projeto = projetoDoDesenho(estimarDesenho(cozinha(), catalogo).item, { id: 'x', projectName: 'Cozinha', productTypeId: produto, m2Fechado: false,
      vinculo: { designId: 'nao-e-um-id', nome: 'X', versao: 1, total: 1, aceitoEm: '' } });
    expect((await request('POST', '/quotes', vendedor, { customerId: cliente.id, items: [rascunhoParaEntradaItem(projeto)] })).statusCode).toBe(422);
  });
});
