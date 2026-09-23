import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
let saved;
let confirmations = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'compact-test', name: 'Teste', role: 'SUPER_ADMIN' } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: {
    materials: [{ id: 'stone-a', name: 'Preto São Gabriel', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }, { id: 'stone-b', name: 'Branco Itaúnas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 1000, images: [] }],
    productTypes: [{ id: 'counter', name: 'Bancada' }],
    services: [{ id: 'vista', name: 'Vista', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 0 }],
  } });
  if (path === '/api/customers') return route.fulfill({ json: route.request().method() === 'POST' ? { id: 'new-customer', ...route.request().postDataJSON() } : { data: [{ id: 'customer', name: 'João da Silva', phone: '00000000000' }] } });
  if (path === '/api/quotes' && route.request().method() === 'POST') { saved = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 'saved' } }); }
  if (path === '/api/quotes/saved/status') return route.fulfill({ json: { status: 'SENT' } });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  return route.fulfill({ status: 404, json: {} });
});
// Material do projeto (topo) vs. material desta peça (dentro de "Detalhar",
// sobrescreve o do projeto só para aquela peça).
const projectMaterial = async name => {
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-picker-panel button').filter({ hasText: name }).click();
};
const rowMaterial = async name => {
  await page.locator('.quick-services .quick-material-override .material-picker summary').click();
  await page.locator('.quick-services .quick-material-override .material-picker-panel button').filter({ hasText: name }).click();
};
const step = number => page.locator('.project-step').nth(number - 1).getByRole('button').click();
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  // Um projeto novo começa em "Orçamento Rápido" — é onde todo dado comercial
  // (material, medidas, acabamentos, rodabanca) é sempre criado; "Detalhado" só
  // divide as peças já orçadas em produção, nunca recalcula o valor.
  await expect(page.getByRole('button', { name: 'Orçamento Rápido' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Projetos' }).getByRole('tab')).toHaveCount(1);
  await page.getByRole('button', { name: 'Selecionar cliente', exact: true }).click();
  await page.getByRole('dialog').getByPlaceholder('Digite nome, telefone ou CPF').fill('João');
  await page.locator('.customer-result').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.compact-customer')).toContainText('Cliente: João da Silva');
  await page.getByRole('button', { name: 'Trocar cliente' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.compact-customer')).toContainText('João da Silva');
  await page.locator('#project-name').fill('Cozinha');
  await projectMaterial('Preto São Gabriel');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(2);
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('THRESHOLD');
  await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,20');
  await page.getByRole('button', { name: 'Detalhar', exact: true }).nth(1).click();
  await rowMaterial('Branco Itaúnas');
  await page.getByRole('button', { name: '+ Acabamentos desta peça', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('fieldset').filter({ hasText: 'Vista' }).getByLabel('Inferior', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.locator('.quick-services .quick-edge').filter({ hasText: 'Vista' }).getByLabel(/Altura do acabamento/).fill('5');
  await expect(page.locator('.summary-grand-total')).toContainText('970,00');
  // Rodabanca no mesmo menu de acabamentos, desenhada de forma independente.
  await page.locator('.quick-services .quick-sides > div').filter({ hasText: 'Inferior' }).getByRole('button', { name: '+ Rodabanca', exact: true }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(3);
  await page.getByLabel('Largura da peça 3 (m)', { exact: true }).fill('0,10');
  await expect(page.locator('.summary-grand-total')).toContainText('1.070,00');
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).click();
  await step(3);
  await expect(page.locator('.technical-drawing .drawing-description')).toHaveCount(3);
  await expect(page.locator('.technical-drawing')).toContainText('Branco Itaúnas');
  await expect(page.locator('.manufacturing-description')).toContainText('100 × 10 cm');
  await step(1);
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Projetos' }).getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Projeto 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  // Um projeto novo começa em Orçamento Rápido, então o campo vazio a conferir é o
  // do editor rápido.
  await expect(page.locator('#project-name')).toHaveValue('');
  await page.getByRole('button', { name: 'Excluir Projeto 2', exact: true }).click();
  assert.equal(confirmations, 0);
  await expect(page.getByRole('tab', { name: 'Cozinha', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.locator('#project-name').fill('Janela');
  await projectMaterial('Branco Itaúnas');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,10');
  await page.getByRole('tab', { name: 'Cozinha', exact: true }).click();
  // Cozinha já está em Detalhado (produção) desde o passo anterior — a etapa 1
  // agora mostra as peças de produção (medidas em cm), não mais o Orçamento
  // Rápido; o valor comercial continua o mesmo, definido lá.
  await step(1);
  const root = index => page.locator('.component-editor > .component-card').nth(index);
  await expect(root(0).getByLabel('Comprimento (cm)', { exact: true })).toHaveValue('200');
  await expect(page.locator('.summary-grand-total')).toContainText('1.070,00');
  await page.getByRole('button', { name: 'Excluir Janela', exact: true }).click();
  assert.equal(confirmations, 1);
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.locator('#project-name').fill('Banheiro');
  await projectMaterial('Branco Itaúnas');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,10');
  await page.getByRole('tab', { name: 'Cozinha', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('tablist', { name: 'Projetos' }).getByRole('tab')).toHaveCount(2);
  await step(1);
  await expect(root(0).getByLabel('Comprimento (cm)', { exact: true })).toHaveValue('200');
  // O material por peça (definido no Orçamento Rápido) aparece na legenda do
  // desenho de cada peça de produção — a divisão nunca o altera.
  await expect(root(1).locator('.map-caption')).toContainText('Branco Itaúnas');
  mkdirSync('.test-artifacts/projeto-compacto', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `.test-artifacts/projeto-compacto/componentes-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await expect(page.locator('#project-step-1')).toBeVisible();
  await step(2);
  await expect(page.locator('#project-step-2')).toBeVisible();
  await step(3);
  await expect(page.locator('#project-step-3')).toBeVisible();
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await page.waitForURL('**/orcamentos');
  assert.equal(saved.items.length, 2);
  assert.deepEqual(saved.items[0].components.map(piece => piece.materialId), ['stone-a', 'stone-b', 'stone-b']);
  assert.equal(saved.items[1].components[0].materialId, 'stone-b');
  assert.equal(saved.items[0].environment, null);
  assert.equal(saved.customerId, 'customer');
  assert.deepEqual(errors, []);
  console.log('OK: cliente compacto, abas independentes, exclusão condicional, materiais e preços por peça, rodabanca no acabamento, desenho por peça, rascunho e envio pelo Orçamento Rápido.');
} finally { await browser.close(); }
