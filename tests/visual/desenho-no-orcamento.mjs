import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, estimarDesenho, featureSchema, makePiece } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Desenho técnico dentro do Novo orçamento (vendedor):
// sem cliente pede o cliente; com cliente lista os rascunhos dele, começa um
// desenho, mostra o valor (M² fechado ligado) e "Usar no orçamento" leva as
// peças e o mesmo valor para o resumo. Clientes: filtro por situação e arquivar/reativar.
const output = resolve(import.meta.dirname, '../../.test-artifacts/desenho-no-orcamento');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const catalogo = {
  materials: [{ id: 'cm0000000000000000000stone', name: 'Branco Dallas', category: 'Granitos', billingUnit: 'SQUARE_METER', currentPrice: 700, images: [] }],
  productTypes: [{ id: 'cm00000000000000000counter', name: 'Bancada' }],
  services: [
    { id: 'cm00000000000000000000saia', name: 'Saia', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 0 },
    { id: 'cm00000000000000000000cuba', name: 'Recorte de cuba', category: 'Recortes', billingUnit: 'UNIT', currentPrice: 180 },
    { id: 'cm00000000000000000000a45f', name: 'Acabamento 45° — Granito/Mármore', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70 },
  ],
  settings: { closedSquareMeter: true },
};
const cliente = { id: 'cm00000000000000000cliente', name: 'Maria Silva', phone: '92981817980', isQuick: false };
const semCadastro = { id: 'cm0000000000000000semcadas', name: 'Sem cadastro 1', phone: null, isQuick: true };
// O desenho que o vendedor "fez" (os traços têm roteiros próprios): U com cuba, saia, 45° e rodabanca, fora do múltiplo de 5 cm.
const recurso = dados => featureSchema.parse({ x: 0, y: 0, ...dados });
const documento = emptyTechnicalDocument();
documento.pieces.push({ ...makePiece('u', 'U'), name: 'Bancada', material: { id: catalogo.materials[0].id, name: 'Branco Dallas', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } });
documento.features.push(
  recurso({ id: 'cuba', type: 'SINK', pieceId: 'u', name: 'Cuba', x: 1300, y: 1200, widthMm: 500, lengthMm: 400 }),
  recurso({ id: 'saia', type: 'SKIRT', pieceId: 'u', name: 'Saia', edgeId: 'u-v7', extentMm: 1500, heightMm: 45 }),
  recurso({ id: 'borda', type: 'EDGE_FINISH', pieceId: 'u', name: 'Acabamento', edgeId: 'u-v2', extentMm: 1400, profile: 'MITER45' }),
  recurso({ id: 'roda', type: 'BACKSPLASH', pieceId: 'u', name: 'Rodabanca', edgeId: 'u-v6', extentMm: 2600, heightMm: 75 }),
);
const esperado = estimarDesenho(documento, { materials: catalogo.materials, services: catalogo.services }, { m2Fechado: true });
const reais = valor => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const desenhos = [{ id: 'cm000000000000000000banho', nome: 'Banheiro', atualizadoEm: '2026-09-20T12:00:00.000Z', pecas: 1, usadoEm: [{ quoteId: 'q1', number: 'ORC-0921' }] }];
let versao = 1, salvamentos = 0;
const copias = [];
const sincronizacoes = [];

await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'vendedor', name: 'Vendedor Inova', role: 'SELLER', maxDiscountPercent: 10 } } });
  // Rascunho do Novo orçamento no servidor (vazio: vale o deste navegador).
  if (path === '/api/quote-draft') return route.fulfill({ json: route.request().method() === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: catalogo });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id: catalogo.materials[0].id, name: 'Branco Dallas', category: 'Granitos', description: null, imageUrl: null }] });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  if (path === `/api/customers/${cliente.id}/designs` && method === 'POST') {
    const body = route.request().postDataJSON();
    desenhos.unshift({ id: 'cm00000000000000000novo01', nome: body.name ?? 'Desenho 2', atualizadoEm: new Date().toISOString(), pecas: 1, usadoEm: [] });
    return route.fulfill({ status: 201, json: { designId: 'cm00000000000000000novo01', projectId: 'p', name: body.name } });
  }
  if (path === `/api/customers/${cliente.id}/designs`) return route.fulfill({ json: { designs: desenhos } });
  if (/^\/api\/customers\/[^/]+\/arquivo$/.test(path) && method === 'PATCH') {
    const alvo = [cliente, semCadastro].find(entrada => path.includes(entrada.id));
    alvo.archivedAt = route.request().postDataJSON().arquivado ? new Date().toISOString() : null;
    return route.fulfill({ json: alvo });
  }
  if (path === '/api/customers') {
    const todos = [cliente, semCadastro];
    const situacaoDe = entrada => entrada.archivedAt ? 'inativos' : entrada.isQuick ? 'incompletos' : 'ativos';
    const situacao = url.searchParams.get('situacao');
    const data = situacao && situacao !== 'todos' ? todos.filter(entrada => situacaoDe(entrada) === situacao) : situacao ? todos : todos.filter(entrada => !entrada.archivedAt);
    const contar = valor => todos.filter(entrada => situacaoDe(entrada) === valor).length;
    return route.fulfill({ json: { data: data.map(entrada => ({ ...entrada, quotes: [] })), meta: { page: 1, limit: 100, total: data.length, pages: 1 }, counts: { todos: todos.length, ativos: contar('ativos'), incompletos: contar('incompletos'), inativos: contar('inativos') } } });
  }
  if (path === '/api/designs/cm00000000000000000novo01/draft' && method === 'PUT') {
    salvamentos += 1; versao += 1;
    return route.fulfill({ json: { id: 'rascunho', version: versao, schemaVersion: 1, document: route.request().postDataJSON().document, updatedAt: new Date().toISOString(), diagnostics: [] } });
  }
  if (path === '/api/designs/cm00000000000000000novo01/draft') return route.fulfill({ json: { design: { id: 'cm00000000000000000novo01', name: 'Desenho técnico', project: { id: 'p', name: 'Cozinha', job: { customer: { name: cliente.name, phone: cliente.phone } } } }, draft: { id: 'rascunho', version: versao, schemaVersion: 1, document: documento, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === '/api/designs/cm00000000000000000novo01') return route.fulfill({ json: { revisions: [] } });
  // Antes de abrir o desenho de um projeto do orçamento, ele recebe o que mudou no Orçamento Rápido.
  if (/^\/api\/designs\/[^/]+\/sincronizar$/.test(path) && method === 'POST') {
    const body = route.request().postDataJSON();
    sincronizacoes.push({ path, ...body });
    return route.fulfill({ json: { sincronia: { ...body.sincronia, base: body.projeto }, avisos: ['Bancada · parte 1: a medida mudou no orçamento, mas peças em L, U, com curva ou em desenho livre mudam de medida só no desenho técnico.'], versao: versao + 1, nome: body.projeto.nome, alterado: false } });
  }
  // Projeto duplicado: o desenho técnico dele é copiado, e a cópia fica só com a cópia do desenho.
  if (path === '/api/designs/cm00000000000000000novo01/copy' && method === 'POST') {
    const body = route.request().postDataJSON();
    copias.push(body);
    desenhos.unshift({ id: 'cm0000000000000000copia01', nome: body.name, atualizadoEm: new Date().toISOString(), pecas: 1, usadoEm: [] });
    return route.fulfill({ status: 201, json: { designId: 'cm0000000000000000copia01', projectId: 'p2', nome: body.name, versao: 1 } });
  }
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';

try {
  assert.equal(esperado.problemas.length, 0, 'desenho completo');
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();

  // 1) Sem cliente: pede o cliente (ou um orçamento sem cadastro) antes de desenhar.
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  const janela = page.locator('.orc-desenho-janela');
  await janela.getByText('Selecione primeiro o cliente deste orçamento.', { exact: false }).waitFor();
  await janela.getByRole('button', { name: 'Escolher cliente' }).click();
  await page.locator('.customer-dialog .search').fill('Maria');
  await page.locator('.customer-result').filter({ hasText: 'Maria Silva' }).click();

  // 2) Com cliente: rascunhos dele e um desenho novo.
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  await janela.getByText('Banheiro', { exact: true }).waitFor();
  await janela.getByText(/Usado em ORC-0921/).waitFor();
  await shot('01-rascunhos-do-cliente');
  await janela.getByLabel('Desenho em branco, sem ligar a um projeto').fill('Cozinha');
  await janela.getByRole('button', { name: 'Começar em branco' }).click();

  // 3) Editor em tela cheia, sem conferência para o vendedor, com o valor pelas regras do orçamento.
  const tela = page.getByRole('dialog', { name: 'Desenho técnico do orçamento' });
  const usar = tela.getByRole('button', { name: /^Usar no orçamento/ });
  await usar.waitFor();
  await page.waitForFunction(() => /R\$/.test(document.querySelector('.tec-usar')?.textContent ?? ''));
  assert((await usar.innerText()).includes(reais(esperado.total)), `valor do desenho ${await usar.innerText()} × ${reais(esperado.total)}`);
  assert.equal(await tela.getByRole('button', { name: 'Enviar para conferência' }).count(), 0, 'vendedor não envia para conferência');
  // A estimativa começa fechada, com o total na barra; aberta, mostra o M² fechado.
  await tela.locator('.tec-lateral-estimativa .tec-so-desktop .tec-resumo-estimativa[aria-expanded="false"]').click();
  await tela.getByText(/M² fechado/).first().waitFor();
  await shot('02-desenho-no-orcamento');

  // 4) Usar no orçamento: salva o rascunho e o mesmo valor vai para o resumo.
  await usar.click();
  await tela.waitFor({ state: 'detached' });
  assert(salvamentos >= 1, 'rascunho salvo antes de usar');
  await page.getByText(/Cozinha: .* adicionado no resumo do orçamento/).waitFor();
  const total = await page.locator('.quote-summary-card .summary-grand-total').innerText();
  assert(total.includes(reais(esperado.total)), `resumo ${total} × desenho ${reais(esperado.total)}`);
  assert.equal(await page.locator('#project-name').inputValue(), 'Cozinha');
  await page.getByText(/Desenho técnico deste projeto: “Cozinha”/).waitFor();
  await shot('03-resumo-com-o-desenho');

  // 4b) O U vira três partes no orçamento: a medida delas muda no desenho (avisado em cada parte).
  await page.getByText('Parte de uma peça em L ou U do desenho técnico: a medida muda no desenho.').first().waitFor();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('3,00');

  // 5) De volta à lista: o desenho aparece como "Neste orçamento".
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  await janela.locator('li').filter({ hasText: 'Cozinha' }).getByText('Neste orçamento').waitFor();
  await janela.getByRole('button', { name: 'Fechar' }).last().click();

  // 6) Celular: o desenho abre em tela cheia, com o botão de usar à vista, e volta ao orçamento.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  await janela.locator('li').filter({ hasText: 'Cozinha' }).getByRole('button', { name: 'Abrir' }).click();
  await usar.waitFor();
  const caixa = await usar.boundingBox();
  assert(caixa && caixa.y >= 0 && caixa.y + caixa.height <= 844 && caixa.x >= 0 && caixa.x + caixa.width <= 390, 'botão de usar visível no celular: ' + JSON.stringify(caixa));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'sem rolagem lateral');
  await shot('05-celular-desenho');
  await tela.getByRole('button', { name: '← Voltar ao orçamento' }).click();
  await tela.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 950 });
  // Ao abrir, o desenho recebeu o projeto do orçamento como está agora e o vínculo guardado no "Usar no orçamento".
  assert.equal(sincronizacoes.length, 1, 'sincroniza antes de abrir o desenho do projeto');
  const [enviada] = sincronizacoes;
  assert.equal(enviada.path, '/api/designs/cm00000000000000000novo01/sincronizar');
  assert.equal(enviada.projeto.nome, 'Cozinha');
  assert.equal(enviada.projeto.pecas[0].lengthMm, 3000, 'medida de agora');
  assert.notEqual(enviada.sincronia.base.pecas[0].lengthMm, 3000, 'base: como estava ao usar o desenho');
  assert.deepEqual(new Set(Object.values(enviada.sincronia.pecas).map(origem => origem.forma)), new Set(['COMPOSTA']), 'as partes do U vieram marcadas');
  await page.getByText(/mudam de medida só no desenho técnico/).waitFor();

  // 6b) Duplicar o projeto: a cópia ganha uma cópia do desenho técnico, só dela.
  await page.getByRole('button', { name: 'Duplicar projeto', exact: true }).click();
  const janelaDuplicar = page.getByRole('dialog', { name: 'Duplicar projeto' });
  await janelaDuplicar.getByText('O desenho técnico do projeto também é copiado, com este nome.').waitFor();
  await janelaDuplicar.getByLabel('Nome do novo projeto').fill('Cozinha da varanda');
  await janelaDuplicar.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await janelaDuplicar.waitFor({ state: 'detached' });
  await page.getByText(/Desenho técnico deste projeto: “Cozinha da varanda”/).waitFor();
  assert.equal(await page.locator('#project-name').inputValue(), 'Cozinha da varanda');
  assert.deepEqual(copias, [{ name: 'Cozinha da varanda' }], 'o desenho copiado leva o nome do novo projeto');
  await page.getByRole('button', { name: /^Projeto:/ }).click();
  await page.getByRole('menu').getByRole('menuitemradio', { name: 'Cozinha', exact: true }).click();
  await page.getByText(/Desenho técnico deste projeto: “Cozinha”/).waitFor();
  // Na lista do cliente, os dois desenhos: cada projeto com o seu.
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  for (const nome of ['Cozinha', 'Cozinha da varanda']) await janela.locator('li').filter({ has: page.getByText(nome, { exact: true }) }).getByText('Neste orçamento').waitFor();
  await shot('06-projeto-duplicado-com-desenho');
  await janela.getByRole('button', { name: 'Fechar' }).last().click();

  // 7) Clientes: filtro por situação (como em Funcionários) e arquivar/reativar.
  await page.goto(base + '/clientes');
  const filtro = page.getByRole('group', { name: 'Filtrar clientes' });
  const lista = page.locator('.admin-rows');
  const linha = nome => lista.locator('article').filter({ has: page.getByText(nome, { exact: true }) });
  await linha('Maria Silva').getByText('Ativo', { exact: true }).waitFor();
  await linha('Sem cadastro 1').getByText('Cadastro incompleto', { exact: true }).waitFor();
  await filtro.getByRole('button', { name: /Cadastro incompleto/ }).click();
  await linha('Sem cadastro 1').waitFor();
  await linha('Maria Silva').waitFor({ state: 'detached' });
  await filtro.getByRole('button', { name: /Ativos/ }).click();
  await linha('Maria Silva').getByRole('button', { name: 'Arquivar', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Arquivar cliente', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Maria Silva foi arquivado.' }).waitFor();
  await page.getByText('Nenhum cliente encontrado.', { exact: true }).waitFor();
  assert.match(await filtro.getByRole('button', { name: /Inativos/ }).innerText(), /1/);
  await filtro.getByRole('button', { name: /Inativos/ }).click();
  await linha('Maria Silva').getByText('Inativo', { exact: true }).waitFor();
  await shot('04-clientes-arquivado');
  await linha('Maria Silva').getByRole('button', { name: 'Reativar', exact: true }).click();
  await page.getByText('Nenhum cliente arquivado.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await linha('Maria Silva').getByText('Ativo', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('OK: desenho técnico dentro do Novo orçamento — pede cliente, lista rascunhos do cliente, valor com M² fechado igual ao do domínio, usar no orçamento leva o mesmo valor ao resumo; projeto duplicado (com o nome escolhido) ganha uma cópia do desenho técnico com o mesmo nome, só dele; clientes filtrados por situação (ativo, cadastro incompleto, inativo), arquivar com confirmação e reativar.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
