import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada. Resumo do Novo orçamento sem validade (sempre 10 dias úteis, no PDF),
// sem observações e sem a opção de valores no PDF; "Vincular projeto" lista só os orçamentos do
// cliente (ou avisa que não há). Na tela do orçamento, Equipe, Prazos e as Observações do orçamento
// (as do PDF, no lugar da antiga observação do prazo) ficam juntos numa aba só.
const output = resolve(import.meta.dirname, '../../.test-artifacts/resumo-e-acompanhamento');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const maria = { id: 'c1', name: 'Maria Silva', phone: '92981817980', isQuick: false };
const clientes = [maria, { id: 'c2', name: 'João Souza', phone: '92999990000', isQuick: false }];
const orcamentosDaMaria = [
  { id: 'q1', number: 'ORC-2026-30', customerId: 'c1', customer: maria, items: [{ projectName: 'Cozinha' }, { projectName: 'Lavabo' }] },
  { id: 'q2', number: 'ORC-2026-31', customerId: 'c1', customer: maria, items: [{ projectName: 'Banheiro' }] },
];
const buscasDeOrcamentos = [];
const acompanhamentos = [];
const orcamento = {
  id: 'q1', number: 'ORC-2026-30', customerId: 'c1', createdAt: '2026-09-29T14:00:00.000Z', status: 'APPROVED', executionStatus: 'IN_PROGRESS', approvedAt: '2026-09-29T15:00:00.000Z',
  validUntil: null, deliveryDeadline: null, installationDeadline: null, deadlineConfirmed: false, deadlineNote: 'observação antiga do prazo', notes: null,
  customerNameSnapshot: 'Maria Silva', customerPhoneSnapshot: '92981817980', discountAmount: 0, grossTotal: 720, netTotal: 720, workerAssignments: [],
  items: [{ id: 'i1', projectName: 'Cozinha', materialNameSnapshot: 'Branco Dallas', unitPriceSnapshot: 600, billedQuantity: 1.2, materialSubtotal: 720, total: 720, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null,
    components: [{ id: 'k1', label: 'Bancada', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: 720, calculatedTotal: 720, appliedTotal: 720, hasManualPriceOverride: false, edges: [] }] }],
};
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-resumo', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/quote-draft') return route.fulfill({ json: method === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: { materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }], productTypes: [{ id: 'counter', name: 'Bancada' }], services: [], settings: { closedSquareMeter: true } } });
  if (path === '/api/customers' && method === 'POST') return route.fulfill({ status: 201, json: { id: 'sc-1', name: 'Sem cadastro 1', phone: null, isQuick: true } });
  if (path === '/api/customers') return route.fulfill({ json: { data: clientes.filter(cliente => cliente.name.includes(url.searchParams.get('search') ?? '')) } });
  if (path === '/api/quotes' && method === 'GET') {
    buscasDeOrcamentos.push(Object.fromEntries(url.searchParams));
    const cliente = url.searchParams.get('customerId');
    return route.fulfill({ json: { data: orcamentosDaMaria.filter(entrada => entrada.customerId === cliente), meta: { page: 1, limit: 50, total: 2, pages: 1 } } });
  }
  if (path === '/api/quotes/q1' && method === 'GET') return route.fulfill({ json: orcamento });
  if (path === '/api/quotes/q1/tracking' && method === 'PATCH') {
    const corpo = route.request().postDataJSON();
    acompanhamentos.push(corpo);
    Object.assign(orcamento, corpo);
    return route.fulfill({ json: orcamento });
  }
  if (path === '/api/quotes/q1/entregas') return route.fulfill({ json: { canDeliver: true, reason: null, projects: [] } });
  if (path === '/api/workers') return route.fulfill({ json: [{ id: 'w1', name: 'Carlos', workColor: '#5b7f4a' }] });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const menuCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menu').waitFor(); };
const vincular = () => page.locator('.quote-summary-card .quote-linker');

try {
  // 1) Resumo do Novo orçamento: sem validade, sem observações e sem a opção de valores no PDF.
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  for (const campo of ['Validade do orçamento', 'Observações do orçamento', 'Valores no PDF']) assert.equal(await page.getByLabel(campo, { exact: true }).count(), 0, `${campo} saiu do resumo`);
  assert.equal(await page.getByText('PDF do orçamento', { exact: true }).count(), 0);

  // 2) Vincular sem cliente: pede o cliente. Com a Maria: só os orçamentos dela.
  await vincular().locator('summary').click();
  await vincular().getByText('Escolha o cliente para ver os projetos dele.').waitFor();
  await menuCliente();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill('Maria');
  await page.locator('.customer-result').filter({ hasText: 'Maria Silva' }).click();
  await vincular().getByRole('button', { name: /ORC-2026-30/ }).waitFor();
  assert.deepEqual(await vincular().locator('.customer-result').allInnerTexts().then(textos => textos.map(texto => texto.replace(/\s+/g, ' ').trim())), ['ORC-2026-30 Cozinha · Lavabo', 'ORC-2026-31 Banheiro']);
  assert(buscasDeOrcamentos.every(busca => busca.customerId === 'c1'), 'busca só pelo cliente: ' + JSON.stringify(buscasDeOrcamentos));
  await vincular().scrollIntoViewIfNeeded();
  await shot('01-vincular-projetos-do-cliente');

  // 3) Cliente sem orçamentos: avisa ao abrir.
  await menuCliente();
  await page.getByRole('menuitem', { name: 'Orçamento sem cadastro', exact: true }).click();
  await page.getByRole('button', { name: 'Cliente: Sem cadastro 1' }).waitFor();
  if (!(await vincular().evaluate(el => el.open))) await vincular().locator('summary').click();
  await vincular().getByText('Sem projetos ligados a esse cliente.').waitFor();
  await vincular().scrollIntoViewIfNeeded();
  await shot('02-vincular-sem-projetos');

  // 4) Tela do orçamento: três abas; Equipe, Prazos e Observações do orçamento juntos.
  await page.goto(base + '/orcamentos/q1');
  const abas = page.getByRole('navigation', { name: 'Seções do acompanhamento' }).getByRole('button');
  await abas.first().waitFor();
  assert.deepEqual(await abas.allInnerTexts().then(textos => textos.map(texto => texto.replace(/^\S+\s*/, '').trim())), ['Geral', 'Equipe, prazo e observação', 'Histórico']);
  await page.getByRole('button', { name: /Histórico/ }).click();
  await page.getByText('Orçamento válido até: 13/10/2026').waitFor(); // sem validade gravada: 10 dias úteis após a emissão
  await page.getByRole('button', { name: /Equipe, prazo e observação/ }).click();
  for (const bloco of ['Equipe', 'Prazos', 'Observações do orçamento']) await page.getByRole('region', { name: bloco }).waitFor();
  assert.equal(await page.getByText('Observação do prazo').count(), 0, 'a observação do prazo saiu');
  assert.equal(await page.getByText('observação antiga do prazo').count(), 0);
  await page.getByLabel('Entrega acordada').fill('2026-10-20');
  await page.getByLabel('Prazo confirmado com o cliente').check();
  await page.getByRole('textbox', { name: 'Observações do orçamento' }).fill('Conferir medidas no local.');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Salvo' }).waitFor();
  assert.deepEqual(acompanhamentos.at(-1), { deliveryDeadline: '2026-10-20', installationDeadline: null, deadlineConfirmed: true, notes: 'Conferir medidas no local.' });
  await shot('03-equipe-prazo-observacao');
  // Desmarcar a confirmação também é salvo (antes se perdia).
  await page.getByLabel('Prazo confirmado com o cliente').uncheck();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(acompanhamentos.at(-1).deadlineConfirmed, false);

  // 5) Celular e tema escuro, sem rolagem lateral.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral no celular');
  await page.locator('.quote-workbench').screenshot({ path: resolve(output, '04-celular.png') });
  await page.evaluate(() => document.documentElement.classList.add('inova-dark'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  await page.locator('.quote-workbench').screenshot({ path: resolve(output, '05-escuro.png') });
  assert.deepEqual(errors, []);
  console.log('OK: resumo sem validade, observações e opção de valores no PDF; vincular mostra só os orçamentos do cliente (ou "sem projetos"); Equipe, prazo e observação do orçamento numa aba só, no celular e no tema escuro.');
} catch (error) {
  console.error('FALHA:', error, errors);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
