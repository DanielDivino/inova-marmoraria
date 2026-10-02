import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Rotas entre as telas: o orçamento volta para onde foi aberto (Fluxo,
// Orçamentos, Histórico, cliente, Dashboard), as listas reabrem com os filtros, as telas dentro do
// orçamento (editar, remontagem, desenho técnico) mostram o caminho, o cliente abre o Novo orçamento
// já escolhido, o celular tem a seta de voltar, o login volta para onde estava e existe a página
// "não encontrada".
const output = resolve(import.meta.dirname, '../../.test-artifacts/rotas');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const usuario = { id: 'visual-rotas', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 };
const maria = { id: 'c1', name: 'Maria Silva', phone: '92981817980', isQuick: false };
const joao = { id: 'c2', name: 'João Souza', phone: '92999990000', isQuick: false };
const item = { id: 'i1', projectName: 'Cozinha', productTypeId: 'counter', materialId: 'stone', materialNameSnapshot: 'Branco Dallas', unitPriceSnapshot: 600, billingUnitSnapshot: 'SQUARE_METER', billedQuantity: 1.2, materialSubtotal: 720, total: 720, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null,
  components: [{ id: 'k1c', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: 720, calculatedTotal: 720, appliedTotal: 720, hasManualPriceOverride: false, edges: [] }] };
const orcamento = (id, number, customer, extra = {}) => ({ id, number, customerId: customer.id, customer, createdAt: '2026-09-29T14:00:00.000Z', updatedAt: '2026-09-29T15:00:00.000Z', status: 'APPROVED', executionStatus: 'IN_PROGRESS', approvedAt: '2026-09-29T15:00:00.000Z',
  validUntil: '2026-10-13T00:00:00.000Z', deadlineConfirmed: false, notes: null, customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, discountAmount: 0, grossTotal: 720, netTotal: 720, workerAssignments: [], items: [item], ...extra });
const q1 = orcamento('q1', 'ORC-2026-30', maria);
const q3 = orcamento('q3', 'ORC-2026-12', joao, { status: 'CANCELLED', executionStatus: 'NOT_STARTED' });
const cartao = (id, status, materialMissing) => ({ id, name: id === 'k1' ? 'Cozinha' : 'Lavabo', status, position: 1, completedAt: null, pieces: 1, projectId: `p-${id}`, totalPieces: 1, pieceList: [], materialMissing,
  quote: { id: 'q1', number: 'ORC-2026-30', customerId: 'c1', customerName: 'Maria Silva', deadline: null, worker: null, phase: 'IN_EXECUTION' } });
const cartoes = [cartao('k1', 'IN_PROGRESS', true), cartao('k2', 'TODO', false)];
let documento = emptyTechnicalDocument();

await context.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: usuario } });
  // Projetos com desenho técnico (Exportar do orçamento): nenhum.
  if (/^\/api\/quotes\/[^/]+\/desenhos-tecnicos$/.test(path)) return route.fulfill({ json: { projetos: [] } });
  if (path === '/api/auth/login' && method === 'POST') return route.fulfill({ json: { accessToken: 'token-rotas', user: usuario } });
  if (path === '/api/quote-draft') return route.fulfill({ json: method === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: { materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }], productTypes: [{ id: 'counter', name: 'Bancada' }], services: [], settings: { closedSquareMeter: true } } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [] });
  if (path === '/api/workflow/projects') return route.fulfill({ json: cartoes });
  if (path === '/api/workers' || path === '/api/users') return route.fulfill({ json: [] });
  if (path === '/api/customers/c1') return route.fulfill({ json: maria });
  if (path === '/api/customers/c1/quotes') return route.fulfill({ json: [q1] });
  if (path === '/api/customers') return route.fulfill({ json: { data: [maria, joao].filter(cliente => cliente.name.includes(url.searchParams.get('search') ?? '')), counts: { todos: 2, ativos: 2, incompletos: 0, inativos: 0 } } });
  if (path === '/api/quotes' && method === 'GET') {
    const historico = url.searchParams.get('scope') === 'history';
    const lista = (historico ? [q3] : [q1]).filter(q => q.customerNameSnapshot.includes(url.searchParams.get('search') ?? ''));
    return route.fulfill({ json: { data: lista, meta: { page: 1, limit: 20, total: lista.length, pages: 1 }, counts: {} } });
  }
  if (path === '/api/quotes/q1') return route.fulfill({ json: q1 });
  if (path === '/api/quotes/q3') return route.fulfill({ json: q3 });
  if (path === '/api/quotes/q1/entregas') return route.fulfill({ json: { canDeliver: true, reason: null, projects: [] } });
  if (path === '/api/quotes/q1/remontagem') return route.fulfill({ json: { quote: { id: 'q1', number: 'ORC-2026-30', customerId: 'c1', status: 'APPROVED', executionStatus: 'IN_PROGRESS', customerNameSnapshot: 'Maria Silva', customerPhoneSnapshot: null, workAddressSnapshot: null, notes: null, createdAt: q1.createdAt }, remount: null } });
  // O cálculo da remontagem não interessa aqui: só o caminho da tela.
  if (path === '/api/quotes/q1/remontagem/calculate') return route.fulfill({ status: 422, json: { message: 'Cálculo não simulado neste teste.' } });
  if (path === '/api/dashboard') return route.fulfill({ json: { totals: Object.fromEntries(['issued', 'pending', 'sold', 'cancelled', 'rejected', 'expired', 'approved', 'production', 'waitingMaterial', 'pendingWork', 'rework', 'paused', 'ready', 'deliveryPending', 'installationPending', 'delivered', 'overdue', 'quotedValue', 'soldValue', 'conversion'].map(chave => [chave, 0])), sellers: [], overdueQuotes: [{ id: 'q1', number: 'ORC-2026-30', customerName: 'Maria Silva', sellerName: 'Administrador', deadline: '2026-09-20', deadlineSource: 'DELIVERY', netTotal: 720 }], generatedAt: new Date().toISOString() } });
  if (path === '/api/designs/d1/draft' && method === 'GET') return route.fulfill({ json: { design: { id: 'd1', name: 'Desenho técnico', project: { id: 'p1', name: 'Cozinha', job: { customer: { name: 'Maria Silva', phone: '' } } } }, draft: { id: 'r1', version: 1, document: documento, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === '/api/designs/d1' && method === 'GET') return route.fulfill({ json: { revisions: [] } });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const caminho = () => page.getByRole('navigation', { name: 'Caminho' }).getByRole('link');
const textos = async locator => (await locator.allInnerTexts()).map(texto => texto.replace(/\s+/g, ' ').trim());
const semBase = href => href.replace(base, '');
// Ações menos usadas do orçamento ficam no menu "⋯".
const acaoDoMenu = async nome => { await page.getByRole('button', { name: 'Mais ações do orçamento' }).click(); await page.getByRole('menu').getByRole('menuitem', { name: nome, exact: true }).click(); };
const menuCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menu').waitFor(); };

try {
  // 1) Fluxo (com filtro) → orçamento → caminho "Fluxo de trabalho": o filtro continua e o cartão fica em destaque.
  await page.goto(base + '/fluxo?material=FALTA');
  await page.locator('.fluxo-quadro [data-cartao="k1"]').waitFor();
  assert.equal(await page.locator('.fluxo-quadro [data-cartao="k2"]').count(), 0, 'filtro de falta de material vindo do endereço');
  await page.locator('.fluxo-quadro [data-cartao="k1"]').click();
  await page.waitForURL('**/orcamentos/q1?de=fluxo&cartao=k1#projeto-p-k1');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  assert.deepEqual(await textos(caminho()), ['Fluxo de trabalho']);
  assert.equal(semBase(await caminho().first().getAttribute('href')), '/fluxo?material=FALTA&cartao=k1');
  assert.equal(await page.getByRole('navigation', { name: 'Menu principal' }).locator('[aria-current="page"]').innerText(), 'Fluxo de trabalho', 'o menu marca a seção de onde veio');
  await shot('01-orcamento-aberto-pelo-fluxo');
  assert.equal(await page.getByRole('navigation', { name: 'Caminho' }).locator('[aria-current="page"]').innerText(), 'ORC-2026-30', 'o caminho termina no orçamento');
  await caminho().first().click();
  await page.waitForURL('**/fluxo?material=FALTA');
  await page.locator('.fluxo-quadro [data-cartao="k1"].fluxo-cartao-destaque').waitFor();
  assert.equal(await page.locator('.fluxo-quadro [data-cartao="k2"]').count(), 0, 'o filtro continua ao voltar');
  await shot('02-de-volta-ao-fluxo');

  // 2) Telas dentro do orçamento levam a origem: editar, remontagem e desenho técnico.
  await page.goto(base + '/orcamentos/q1?de=fluxo&cartao=k1');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  await acaoDoMenu('Editar orçamento');
  await page.waitForURL('**/orcamentos/q1/editar?de=fluxo&cartao=k1');
  await page.getByRole('heading', { name: 'Editar ORC-2026-30' }).waitFor();
  assert.deepEqual(await textos(caminho()), ['Fluxo de trabalho', 'ORC-2026-30']);
  assert.equal(semBase(await caminho().last().getAttribute('href')), '/orcamentos/q1?de=fluxo&cartao=k1');
  assert.equal(semBase(await page.getByRole('link', { name: 'Cancelar edição' }).getAttribute('href')), '/orcamentos/q1?de=fluxo&cartao=k1');
  await shot('03-editar-com-caminho');
  await caminho().last().click();
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  await acaoDoMenu('Desmontagem / Remontagem');
  await page.waitForURL('**/orcamentos/q1/remontagem?de=fluxo&cartao=k1');
  await page.getByRole('heading', { name: 'Desmontagem e Remontagem' }).waitFor();
  await caminho().nth(1).waitFor();
  assert.deepEqual(await textos(caminho()), ['Fluxo de trabalho', 'ORC-2026-30']);
  await page.goto(base + '/projetos/p1/desenhos/d1?orcamento=q1&numero=ORC-2026-30&de=fluxo&cartao=k1');
  const voltarDoDesenho = page.getByRole('link', { name: '← Orçamento ORC-2026-30' });
  await voltarDoDesenho.waitFor();
  assert.equal(semBase(await voltarDoDesenho.getAttribute('href')), '/orcamentos/q1?de=fluxo&cartao=k1');

  // 3) Orçamentos com busca → orçamento → voltar reabre a lista com a busca. Título e atalhos
  //    (Mostruário, Novo orçamento) na barra de cima, como nas outras telas.
  const tituloEAtalhos = async (titulo) => {
    await page.locator('.titulo-da-tela', { hasText: titulo }).waitFor();
    await page.locator('#application-header-tabs .atalhos-cabecalho').getByRole('link', { name: 'Novo orçamento' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Novo Projeto' }).count(), 0, 'sem o "+ Novo Projeto" debaixo do título');
  };
  await page.goto(base + '/orcamentos');
  await tituloEAtalhos('Orçamentos');
  await page.getByLabel('Buscar orçamentos').fill('Maria');
  await page.waitForURL('**/orcamentos?busca=Maria');
  await page.getByRole('link', { name: 'ORC-2026-30' }).first().click();
  await page.waitForURL('**/orcamentos/q1');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  assert.deepEqual(await textos(caminho()), ['Orçamentos']);
  await caminho().first().click();
  await page.waitForURL('**/orcamentos?busca=Maria');
  assert.equal(await page.getByLabel('Buscar orçamentos').inputValue(), 'Maria', 'a busca continua');

  // 4) Histórico → orçamento encerrado volta para o Histórico.
  await page.goto(base + '/historico');
  await tituloEAtalhos('Histórico');
  await page.getByRole('link', { name: 'ORC-2026-12' }).first().click();
  await page.waitForURL('**/orcamentos/q3?de=historico');
  await page.getByRole('heading', { name: 'ORC-2026-12' }).waitFor();
  assert.deepEqual(await textos(caminho()), ['Histórico']);
  // Sem origem, o encerrado também fica no Histórico.
  await page.goto(base + '/orcamentos/q3');
  await page.getByRole('heading', { name: 'ORC-2026-12' }).waitFor();
  await caminho().first().waitFor();
  assert.deepEqual(await textos(caminho()), ['Histórico']);

  // 5) Dashboard → orçamento → volta ao Dashboard.
  await page.goto(base + '/dashboard');
  await page.getByRole('link', { name: 'ORC-2026-30' }).click();
  await page.waitForURL('**/orcamentos/q1?de=dashboard');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  assert.deepEqual(await textos(caminho()), ['Dashboard']);

  // 6) Cliente: orçamento aberto pelo cliente volta ao cliente; "Novo orçamento para Maria" já abre com ela,
  //    num atendimento próprio, sem trocar o cliente que já estava aberto.
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('.titulo-da-tela').count(), 0, 'Novo orçamento sem título na barra (ela tem as abas dos atendimentos)');
  await menuCliente();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill('João');
  await page.locator('.customer-result').filter({ hasText: 'João Souza' }).click();
  await page.locator('#project-name').fill('Varanda do João');
  await page.goto(base + '/clientes?busca=Mar');
  await page.getByRole('link', { name: 'Maria Silva' }).click();
  await page.waitForURL('**/clientes/c1');
  await page.getByRole('heading', { name: 'Maria Silva' }).waitFor();
  assert.equal(semBase(await caminho().first().getAttribute('href')), '/clientes?busca=Mar', 'volta para a lista de clientes com a busca');
  await page.getByRole('link', { name: 'Abrir', exact: true }).first().click();
  await page.waitForURL('**/orcamentos/q1?de=cliente');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  assert.deepEqual(await textos(caminho()), ['Clientes', 'Maria Silva']);
  await caminho().last().click();
  await page.waitForURL('**/clientes/c1');
  await page.getByRole('link', { name: 'Novo orçamento para Maria' }).click();
  await page.getByRole('button', { name: 'Cliente: Maria Silva' }).waitFor();
  assert.equal(new URL(page.url()).search, '', 'o pedido sai do endereço (recarregar não repete)');
  await menuCliente();
  assert.deepEqual((await textos(page.getByRole('menu').getByRole('menuitemradio'))).map(texto => texto.replace(/^\S+\s+/, '')).sort(), ['João Souza', 'Maria Silva']);
  await page.keyboard.press('Escape');
  await page.getByRole('menu').getByRole('menuitemradio').first().waitFor({ state: 'detached' });
  await shot('04-novo-orcamento-para-o-cliente');

  // 7) Complemento: abre ao lado, sem mexer nos clientes abertos.
  await page.goto(base + '/orcamentos/q1');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  await acaoDoMenu('Vincular complemento');
  await page.locator('.quote-summary-card .quote-linker').getByText('ORC-2026-30 · Maria Silva').waitFor();
  await menuCliente();
  assert.equal(await page.getByRole('menu').getByRole('menuitemradio').count(), 3, 'João, Maria e o complemento da Maria');
  await page.keyboard.press('Escape');

  // 8) Celular: seta de voltar no topo, levando para onde o orçamento foi aberto (e para a etapa do cartão).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/orcamentos/q1?de=fluxo&cartao=k1');
  const seta = page.getByRole('link', { name: 'Voltar para Fluxo de trabalho' });
  await seta.waitFor();
  assert.equal(await page.locator('.titulo-da-tela').innerText(), 'Fluxo de trabalho');
  await shot('05-celular-seta-voltar');
  await seta.click();
  await page.waitForURL(/\/fluxo(\?|$)/);
  await page.locator('.fluxo-quadro [data-cartao="k1"].fluxo-cartao-destaque').waitFor();
  assert(await page.locator('.fluxo-quadro [data-cartao="k1"]').isVisible(), 'no celular abre a etapa do cartão');
  await page.waitForURL(/\/fluxo\?material=FALTA&coluna=IN_PROGRESS$/);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 9) Endereço inexistente: página em português com saídas.
  await page.goto(base + '/nao-existe');
  await page.getByRole('heading', { name: 'Página não encontrada' }).waitFor();
  await page.getByRole('link', { name: 'Ver orçamentos' }).waitFor();

  // 10) Sessão expirada: o login volta para onde estava.
  await page.goto(base + '/login?voltar=' + encodeURIComponent('/fluxo?material=FALTA'));
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill('qualquer');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/fluxo?material=FALTA');
  // Endereço de fora do sistema nunca é seguido.
  await page.goto(base + '/login?voltar=' + encodeURIComponent('https://outro.site/'));
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill('qualquer');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(base + '/');

  assert.deepEqual(errors, []);
  console.log('OK: orçamento volta para Fluxo (com filtro e cartão em destaque), Orçamentos (com busca), Histórico, cliente e Dashboard; editar, remontagem e desenho técnico com caminho; Novo orçamento já com o cliente e complemento ao lado; seta de voltar no celular; página não encontrada; login volta para onde estava.');
} catch (error) {
  console.error('FALHA:', error, errors);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
