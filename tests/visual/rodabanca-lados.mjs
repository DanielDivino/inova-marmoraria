import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

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
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
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
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  return route.fulfill({ status: 404, json: {} });
});
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await page.locator('#project-name').waitFor();
  // A "compact-customer" bar opens a modal dialog for picking the customer; a fresh
  // project also starts in "Orçamento Rápido" mode, which is where all commercial
  // data (material, measurements, finishes, rodabanca) is entered now.
  await page.getByRole('button', { name: 'Selecionar cliente' }).click();
  await page.locator('.customer-dialog .search').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Rodabancas por lado');
  await page.locator('.material-picker summary').click();
  await page.locator('.material-picker-panel button').click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('0,70');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,50');
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('fieldset').filter({ hasText: 'Vista' }).getByLabel('Direito', { exact: true }).check();
  await dialog.locator('fieldset').filter({ hasText: 'Acabamento 45°' }).getByLabel('Direito', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByRole('button', { name: 'Detalhar', exact: true }).first().click();
  const sideGroup = label => page.locator('.quick-services .quick-sides > div').filter({ hasText: label });
  await sideGroup('Direito').locator('.quick-edge').filter({ hasText: 'Vista' }).getByLabel(/Altura do acabamento/).fill('5');
  await expect(sideGroup('Direito')).toContainText('Vista');
  await expect(sideGroup('Direito')).toContainText('Acabamento 45°');
  // "+ Rodabanca" anexa uma peça separada, com o comprimento copiado do lado
  // escolhido — Direito copia a largura (0,50 m); cobrada de forma independente.
  await sideGroup('Direito').getByRole('button', { name: '+ Rodabanca', exact: true }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(2);
  await expect(page.getByLabel('Comprimento da peça 2 (m)', { exact: true })).toHaveValue('0,5');
  await expect(page.locator('[data-quick-row]').nth(1)).toContainText('Peça principal');
  await expect(page.locator('[data-quick-row]').nth(1)).toContainText('Direito');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,10');
  await expect(page.locator('.quote-summary-card')).toContainText('R$ 35,00');
  // Uma segunda rodabanca no lado Superior copia o comprimento (0,70 m).
  await sideGroup('Superior').getByRole('button', { name: '+ Rodabanca', exact: true }).click();
  await expect(page.getByLabel('Comprimento da peça 3 (m)', { exact: true })).toHaveValue('0,7');
  await page.getByLabel('Largura da peça 3 (m)', { exact: true }).fill('0,10');
  await expect(page.locator('.quote-summary-card')).toContainText('R$ 49,00');
  // O usuário pode sobrescrever o comprimento copiado sem alterar a bancada.
  await page.getByLabel('Comprimento da peça 3 (m)', { exact: true }).fill('0,65');
  await expect(page.locator('.quote-summary-card')).toContainText('R$ 45,50');
  await page.getByLabel('Comprimento da peça 3 (m)', { exact: true }).fill('0,70');
  mkdirSync('.test-artifacts/rodabanca-lados', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.quick-quote').screenshot({ path: `.test-artifacts/rodabanca-lados/editor-${width}.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.locator('#project-name').waitFor();
  await expect(page.locator('[data-quick-row]')).toHaveCount(3);
  await expect(page.getByLabel('Comprimento da peça 2 (m)', { exact: true })).toHaveValue('0,5');
  await expect(page.getByLabel('Comprimento da peça 3 (m)', { exact: true })).toHaveValue('0,7');
  // A ordem de serviço mostra cada peça separadamente, com material e desenho
  // próprios, após o detalhamento (produção nunca altera o valor comercial).
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir detalhamento', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir detalhamento', exact: true }).click();
  await page.locator('.project-step').nth(2).getByRole('button').click();
  await expect(page.locator('.technical-drawing .drawing-description')).toHaveCount(3);
  await page.locator('.technical-drawing').screenshot({ path: '.test-artifacts/rodabanca-lados/desenho.png' });
  await page.getByRole('button', { name: 'Orçamento Rápido', exact: true }).click();
  // Remover a rodabanca do lado Superior mantém a do lado Direito intacta.
  await page.locator('[data-quick-row]').nth(2).getByRole('button', { name: /^Remover peça/ }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(2);
  await expect(page.locator('.quote-summary-card')).not.toContainText('R$ 49,00');
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await page.waitForURL('**/orcamentos');
  assert.equal(saved.items[0].components.length, 2);
  assert.equal(saved.items[0].components[0].edges.length, 2);
  assert.deepEqual(saved.items[0].drawingData.componentDetails, [{}, { parentComponentIndex: 0, parentSide: 'RIGHT' }]);
  assert.equal(saved.items[0].components[1].lengthMm, 500);
  assert.equal(saved.items[0].components[1].widthMm, 100);
  assert.deepEqual(errors, []);
  console.log('OK: rodabanca anexada pelo Orçamento Rápido, comprimento copiado e editável, preços separados, remoção seletiva, desenho por peça e salvamento.');
} finally {
  await browser.close();
}
