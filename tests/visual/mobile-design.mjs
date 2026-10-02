import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';
import { orcamentoSalvo } from './apoio/orcamento-salvo.mjs';

// Todas as rotas usam dados em memória. Verifica limites da tela, orientação,
// folhas de ações, navegação, foco e formulário, sem escrever em dados reais.
const output = resolve('.test-artifacts/mobile-design');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const user = { id: 'u1', name: 'Ana Oliveira', email: 'ana@example.test', role: 'SUPER_ADMIN', maxDiscountPercent: 20, isActive: true };
const customer = { id: 'c1', name: 'Mariana Oliveira de Albuquerque', phone: '68999999999', email: 'mariana@example.test', address: 'Rua das Palmeiras, 123', isQuick: false };
const materials = ['Branco Dallas', 'Preto São Gabriel', 'Branco Prime', 'Verde Ubatuba'].map((name, i) => ({ id: `m${i}`, name, category: 'Granito', familyId: 'f1', billingUnit: 'SQUARE_METER', currentPrice: 600 + i * 100, images: [], isActive: true }));
const family = { id: 'f1', name: 'Granito', plural: 'Granitos', summary: 'Pedras naturais para cada ambiente.', style: 'Natural', advantages: ['Resistência'], care: ['Limpar com sabão neutro'], uses: ['cozinha'], desempenho: { scratchResistance: 5, stainResistance: 4, heatResistance: 5, aesthetics: 4, maintenance: 'Baixa', costLevel: 2 }, materialCount: 4, sortOrder: 0 };
const services = [{ id: 's1', name: 'Acabamento meia-esquadria 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70, isActive: true, finishId: 'f45' }];
const finishes = [{ id: 'f45', name: 'Meia-esquadria', kind: 'EDGE', appearance: 'meia-esquadria', description: 'Duas peças unidas a 45°.', uses: 'Bancadas e ilhas', perceivedValue: 'Alto', isActive: true, sortOrder: 0, services }];
const item = { id: 'i1', projectName: 'Cozinha e área gourmet', productTypeId: 'counter', materialId: 'm0', materialNameSnapshot: 'Branco Dallas', unitPriceSnapshot: 600, billingUnitSnapshot: 'SQUARE_METER', billedQuantity: 1.2, materialSubtotal: 720, total: 720, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null, components: [{ id: 'k1', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: 720, calculatedTotal: 720, appliedTotal: 720, hasManualPriceOverride: false, edges: [] }] };
const quote = orcamentoSalvo('q1', { customer, customerId: 'c1', customerNameSnapshot: customer.name, grossTotal: 720, netTotal: 720, items: [item], seller: user });
const workers = [{ id: 'w1', name: 'Carlos Eduardo da Silva', cpf: '123.456.789-00', phone: '68988888888', workColor: '#557663', isActive: true }];
const totals = Object.fromEntries(['issued', 'pending', 'sold', 'cancelled', 'rejected', 'expired', 'approved', 'production', 'waitingMaterial', 'pendingWork', 'rework', 'paused', 'ready', 'deliveryPending', 'installationPending', 'delivered', 'overdue', 'quotedValue', 'soldValue', 'conversion'].map(key => [key, 0]));
Object.assign(totals, { issued: 24, sold: 18, conversion: 75, quotedValue: 42500, soldValue: 32800, production: 8, overdue: 2 });
const dashboard = { totals, sellers: [{ ...user, issued: 24, sold: 18, production: 8, delivered: 10, cancelled: 0, overdue: 2, soldValue: 32800, conversion: 75 }], overdueQuotes: [{ id: 'q1', number: quote.number, customerName: customer.name, sellerName: user.name, deadline: '2026-09-30', deadlineSource: 'DELIVERY', netTotal: 720 }], generatedAt: '2026-10-02T12:00:00Z' };
const failures = [], errors = [], report = [];
let savedCustomer;

async function mock(context) {
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    const json = value => route.fulfill({ json: value });
    if (path === '/api/auth/me') return json({ user });
    if (path === '/api/notifications/deadlines') return json({ alerts: [] });
    if (path === '/api/quote-draft') return json(method === 'GET' ? { version: null } : { version: 1, saved: true });
    if (path === '/api/catalog') return json({ materials, services, productTypes: [{ id: 'counter', name: 'Bancada' }], settings: { closedSquareMeter: true } });
    if (path === '/api/catalog/materials' || path === '/api/catalog/materials/visual') return json(materials);
    if (path === '/api/catalog/families') return json([family]);
    if (path === '/api/catalog/finishes') return json(finishes);
    if (path === '/api/catalog/services') return json(services);
    if (path === '/api/catalog/settings') return json({ closedSquareMeter: true });
    if (path === '/api/workers') return json(workers);
    if (path === '/api/users') return json([user]);
    if (path === '/api/dashboard') return json(dashboard);
    if (path === '/api/customers' && method === 'POST') { savedCustomer = route.request().postDataJSON(); return json({ ...savedCustomer, id: 'new' }); }
    if (path === '/api/customers') return json({ data: [customer], counts: { todos: 1, ativos: 1, incompletos: 0, inativos: 0 } });
    if (path === '/api/customers/c1') return json(customer);
    if (path === '/api/customers/c1/quotes') return json([quote]);
    if (/\/customers\/[^/]+\/designs$/.test(path)) return json({ designs: [] });
    if (path === '/api/quotes') return json({ data: [quote], meta: { page: 1, pages: 1, total: 1, limit: 20 }, counts: {} });
    if (path === '/api/quotes/q1') return json(quote);
    if (path.endsWith('/desenhos-tecnicos')) return json({ projetos: [] });
    if (path.endsWith('/entregas')) return json({ canDeliver: true, reason: null, projects: [] });
    if (path.endsWith('/remontagem')) return json({ quote: { ...quote, number: quote.number }, remount: null });
    if (path.endsWith('/remontagem/calculate')) return route.fulfill({ status: 422, json: { message: 'Adicione uma peça para calcular.' } });
    if (path === '/api/workflow/projects') return json([{ id: 'k1', projectId: 'p1', name: item.projectName, status: 'TODO', position: 1, pieces: 1, totalPieces: 1, pieceList: [], materialMissing: false, quote: { id: 'q1', number: quote.number, customerId: 'c1', customerName: customer.name, deadline: null, worker: null, phase: 'IN_EXECUTION' } }]);
    if (path === '/api/designs/d1/draft') return json({ design: { id: 'd1', name: 'Desenho técnico', project: { id: 'p1', name: 'Cozinha', job: { customer } } }, draft: { id: 'draft', version: 1, document: emptyTechnicalDocument(), updatedAt: new Date().toISOString() }, diagnostics: [] });
    if (path === '/api/designs/d1') return json({ revisions: [] });
    errors.push(`${method} ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
}
const routes = [
  ['orcamentos', '/orcamentos', '.linha-orcamento'], ['clientes', '/clientes', '.clientes-linhas article'],
  ['cliente', '/clientes/c1', '.customer-history-actions'], ['fluxo', '/fluxo', '.fluxo-quadro'],
  ['dashboard', '/dashboard', '.dashboard-kpis'], ['funcionarios', '/funcionarios', '.worker-row'],
  ['usuarios', '/usuarios', '.dashboard-table tbody tr'], ['catalogo', '/administracao', '.material-admin-card'],
  ['historico', '/historico', '.linha-orcamento'], ['orcamento', '/orcamentos/q1', '.projetos-orcamento'],
  ['novo', '/', '.quick-quote'], ['editar', '/orcamentos/q1/editar', '.quick-quote'],
  ['remontagem', '/orcamentos/q1/remontagem', '.remount-page'], ['desenho', '/projetos/p1/desenhos/d1', '.tec-canvas'],
  ['mostruario', '/mostruario', '.vitrine-grade .vitrine-cartao'], ['login', '/login', '.login-card'],
];
async function bounds(page, label) {
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > innerWidth + 2 || r.left < -2) && getComputedStyle(el).position !== 'fixed' && !el.closest('svg, [role=tablist], .abas-filtro, .fluxo-atalhos, .vitrine-navegacao, .vitrine-inspiracoes, .vitrine-exemplos, .vitrine-pedras, .tec-canvas'); }).slice(0, 12).map(el => `${el.tagName}.${el.className}`) }));
  report.push({ label, ...overflow });
  if (overflow.scroll > overflow.width + 1) failures.push({ label, ...overflow });
}
try {
  for (const [name, width, height, touch] of [['compacto', 360, 800, true], ['celular', 390, 844, true], ['horizontal', 844, 390, true], ['desktop', 1440, 1000, false]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await mock(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    for (const [screen, path, ready] of routes) {
      await page.goto(base + path);
      try { await page.locator(ready).first().waitFor(); }
      catch (error) { console.log({ errors, body: await page.locator('body').innerText() }); await page.screenshot({ path: resolve(output, `${name}-${screen}-error.png`) }); throw error; }
      await page.evaluate(() => document.fonts.ready);
      await bounds(page, `${name}/${screen}`);
      await page.screenshot({ path: resolve(output, `${name}-${screen}.png`), animations: 'disabled' });
      console.log(`✓ ${name}/${screen}`);
    }
    if (touch) {
      await page.goto(base + '/clientes');
      await page.getByRole('button', { name: `Ações de ${customer.name}` }).click();
      const menu = page.getByRole('dialog', { name: customer.name });
      await expect(menu).toBeVisible();
      const rect = await menu.boundingBox();
      assert(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${name}: menu cabe na tela`);
      await page.screenshot({ path: resolve(output, `${name}-acoes.png`) });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: `Ações de ${customer.name}` })).toBeFocused();
      await page.getByRole('button', { name: 'Abrir todas as telas' }).click();
      const navigation = page.getByRole('dialog', { name: 'Navegação da Inova' });
      await expect(navigation).toBeVisible();
      await navigation.getByRole('button', { name: 'Tema escuro', exact: true }).click();
      await page.screenshot({ path: resolve(output, `${name}-menu-escuro.png`) });
      await page.keyboard.press('Escape');
      await page.screenshot({ path: resolve(output, `${name}-clientes-escuro.png`) });
      await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Novo cliente', exact: true });
      await form.getByRole('textbox', { name: 'Nome', exact: true }).fill('Cliente mobile');
      await form.getByRole('textbox', { name: 'Telefone', exact: true }).fill('68999990000');
      await form.locator('summary').click();
      await form.getByRole('textbox', { name: 'Endereço', exact: true }).fill('Rua das Pedras');
      await form.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(form).not.toBeVisible();
      assert.equal(savedCustomer.address, 'Rua das Pedras');
    }
    await context.close();
  }
  writeFileSync(resolve(output, 'layout.json'), JSON.stringify({ failures, errors, report }, null, 2));
  assert.deepEqual(errors, [], 'sem erros de execução ou APIs não previstas');
  assert.deepEqual(failures, [], 'todas as páginas cabem na largura da tela');
  console.log('✓ 64 telas, menus, temas, foco e cadastro verificados.');
} finally { await browser.close(); }
