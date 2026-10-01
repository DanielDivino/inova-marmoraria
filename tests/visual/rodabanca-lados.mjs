import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { orcamentoSalvo } from './apoio/orcamento-salvo.mjs';

// Exercises the real form with a mocked API, without changing customer records.
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
let saved;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'backsplash-test', name: 'Teste', role: 'SUPER_ADMIN' } } });
  // Rascunho do Novo orçamento no servidor (vazio: vale o deste navegador).
  if (path === '/api/quote-draft') return route.fulfill({ json: route.request().method() === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: {
    materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 700, images: [] }],
    productTypes: [{ id: 'counter', name: 'Bancada' }],
    services: [{ id: '45', name: 'Acabamento 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70 }, { id: 'vista', name: 'Vista', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 0 }],
  } });
  if (path === '/api/customers') return route.fulfill({ json: { data: [{ id: 'customer', name: 'Cliente teste', phone: '00000000000' }] } });
  if (path === '/api/quotes' && route.request().method() === 'POST') {
    saved = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { id: 'saved' } });
  }
  if (path === '/api/quotes/saved/status') return route.fulfill({ json: { status: 'SENT' } });
  // Depois de salvar abre a tela do orçamento salvo.
  if (path === '/api/quotes/saved' && route.request().method() === 'GET') return route.fulfill({ json: orcamentoSalvo('saved') });
  if (path === '/api/workers') return route.fulfill({ json: [] });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  return route.fulfill({ status: 404, json: {} });
});
// Barra do atendimento: menus "Cliente ▾" e "Projeto ▾" (substituíram as abas).
const selecionarCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click(); };
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await page.locator('#project-name').waitFor();
  // O menu "Cliente ▾" abre a janela de escolha do cliente; a fresh
  // project also starts in "Orçamento Rápido" mode, which is where all commercial
  // data (material, measurements, finishes, rodabanca) is entered now.
  await selecionarCliente();
  await page.locator('.customer-dialog .search').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Rodabancas por lado');
  // Pedra do projeto (cada peça também tem o seu seletor, nas opções).
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-picker-panel button').click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('0,70');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,50');
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Acabamentos da peça' });
  await dialog.locator('fieldset').filter({ hasText: 'Vista' }).getByLabel('Direito', { exact: true }).check();
  await dialog.locator('fieldset').filter({ hasText: 'Acabamento 45°' }).getByLabel('Direito', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  // Altura da vista nas opções da peça (lista compacta de acabamentos).
  const opcoes = page.locator('[data-quick-row]').first().locator('.quick-options-button:visible').first();
  await opcoes.click();
  const painel = page.locator('#' + await opcoes.getAttribute('aria-controls'));
  await painel.locator('.quick-acabamento').filter({ hasText: 'Vista' }).getByLabel(/Altura do acabamento/).fill('5');
  await expect(painel.locator('.quick-acabamento')).toHaveCount(2);
  await expect(page.locator('.quote-summary-card .summary-grand-total')).toContainText('297,50');
  // Rodabanca cobrada: peça própria no orçamento rápido (tipo "Rodabanca"), 0,50 × 0,10 m de Branco Dallas = R$ 35,00.
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('BACKSPLASH');
  await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).fill('0,50');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,10');
  await expect(page.locator('.quote-summary-card .summary-grand-total')).toContainText('332,50');

  // No desenho (produção), a rodabanca fica presa a um lado pelo mapa de lados da peça:
  // o comprimento vem do lado escolhido (Direito = largura 50 cm) e o valor do orçamento não muda.
  await page.locator('button[aria-label^="Orçamento com Desenho"]').click();
  const peca = page.locator('.component-editor > .component-card').first();
  const lado = async nome => {
    const botao = peca.getByRole('button', { name: `Editar acabamentos — ${nome}`, exact: true });
    if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
  };
  await lado('Direito');
  await expect(peca.locator('.map-edge-editor')).toContainText('Vista');
  await expect(peca.locator('.map-edge-editor')).toContainText('Acabamento 45°');
  await peca.getByLabel('Adicionar acabamento — Direito', { exact: true }).selectOption('__backsplash');
  await expect(peca.getByLabel('Editar comprimento — Rodabanca', { exact: true })).toContainText('50 cm');
  await peca.getByLabel('Altura da rodabanca (cm)', { exact: true }).fill('10');
  await expect(page.locator('.quote-summary-card .summary-grand-total')).toContainText('332,50');
  // Uma segunda rodabanca no lado Superior copia o comprimento (70 cm).
  await lado('Superior');
  await peca.getByLabel('Adicionar acabamento — Superior', { exact: true }).selectOption('__backsplash');
  await expect(peca.getByLabel('Editar comprimento — Rodabanca', { exact: true })).toContainText('70 cm');
  await peca.getByLabel('Altura da rodabanca (cm)', { exact: true }).last().fill('10');
  await expect(page.locator('.quote-summary-card .summary-grand-total')).toContainText('332,50');
  mkdirSync('.test-artifacts/rodabanca-lados', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `.test-artifacts/rodabanca-lados/editor-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Um desenho por peça: bancada, rodabanca cobrada e as duas rodabancas presas aos lados.
  await page.locator('.project-step').nth(1).getByRole('button').click();
  await expect(page.locator('.technical-drawing .drawing-description')).toHaveCount(4);
  await page.locator('.technical-drawing').screenshot({ path: '.test-artifacts/rodabanca-lados/desenho.png' });
  await page.locator('.project-step').nth(0).getByRole('button').click();
  // Remover a rodabanca do lado Superior mantém a do lado Direito intacta.
  await lado('Superior');
  await peca.getByRole('button', { name: 'Remover Rodabanca — Superior', exact: true }).click();
  await expect(peca.getByRole('button', { name: 'Remover Rodabanca — Superior', exact: true })).toHaveCount(0);
  await expect(page.locator('.quote-summary-card .summary-grand-total')).toContainText('332,50');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).first().click();
  await page.waitForURL('**/orcamentos/saved');
  const item = saved.items[0];
  assert.deepEqual(item.components.map((peca) => [peca.componentType, peca.lengthMm, peca.widthMm]), [['TOP', 700, 500], ['BACKSPLASH', 500, 100]], 'Bancada e rodabanca cobrada');
  assert.equal(item.components[0].edges.length, 2);
  // Produção: a rodabanca presa ao lado Direito (50 × 10 cm) fica no plano; a do lado Superior foi removida.
  const presas = item.drawingData.productionPlan.pieces.filter((peca) => peca.parentSide);
  assert.deepEqual(presas.map((peca) => [peca.componentType, peca.parentSide, peca.lengthMm, peca.widthMm]), [['BACKSPLASH', 'RIGHT', 500, 100]]);
  assert.deepEqual(errors, []);
  console.log('OK: acabamentos no Orçamento Rápido; rodabanca presa ao lado (modo com desenho) com comprimento copiado, preço separado, remoção seletiva, desenho por peça e salvamento.');
} finally {
  await browser.close();
}
