import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Exercises the real form with a mocked API, without changing customer records.
const browser = await chromium.launch({ executablePath: '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
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
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  return route.fulfill({ status: 404, json: {} });
});
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await page.locator('.customer-section .search').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Rodabancas por lado');
  await page.locator('.material-picker summary').click();
  await page.locator('.material-picker-panel button').click();
  const root = page.locator('.component-editor > .component-card').first();
  await root.getByLabel('Comprimento (cm)', { exact: true }).fill('70');
  await root.getByLabel('Largura / altura (cm)', { exact: true }).fill('50');
  await root.getByRole('button', { name: 'Editar acabamentos — Direito', exact: true }).click();
  const right = root.getByLabel('Adicionar acabamento — Direito', { exact: true });
  await right.selectOption({ label: 'Vista' });
  await root.getByLabel('Largura da vista (cm)').fill('5');
  await right.selectOption({ label: 'Acabamento 45°' });
  await right.selectOption({ label: 'Rodabanca' });
  await root.getByLabel('Altura da rodabanca (cm)').fill('10');
  await expect(root.locator('.edge-finish')).toHaveCount(3);
  await expect(root.locator('.attached-component')).toHaveCount(0);
  await expect(root.getByLabel('Editar comprimento — Rodabanca')).toContainText('50 cm');
  await expect(page.locator('.quote-summary-card')).toContainText('Rodabanca · Direito');
  await expect(page.locator('.quote-summary-card')).toContainText('R$ 35,00');
  await root.getByRole('button', { name: 'Editar acabamentos — Superior', exact: true }).click();
  await root.getByLabel('Adicionar acabamento — Superior', { exact: true }).selectOption({ label: 'Rodabanca' });
  await root.getByLabel('Altura da rodabanca (cm)').fill('10');
  await expect(root.getByLabel('Editar comprimento — Rodabanca')).toContainText('70 cm');
  await expect(page.locator('.quote-summary-card')).toContainText('R$ 49,00');
  // The user can override the copied length without changing the countertop.
  await root.getByLabel('Editar comprimento — Rodabanca').click();
  await root.getByLabel('Comprimento da rodabanca (cm)').fill('65');
  await expect(page.locator('.quote-summary-card')).toContainText('R$ 45,50');
  await root.getByLabel('Comprimento da rodabanca (cm)').fill('70');
  await root.getByRole('button', { name: 'Editar acabamentos — Direito', exact: true }).click();
  mkdirSync('.test-artifacts/rodabanca-lados', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await root.locator('.component-edge-layout').first().screenshot({ path: `.test-artifacts/rodabanca-lados/editor-${width}.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await root.getByRole('button', { name: 'Editar acabamentos — Direito', exact: true }).click();
  await expect(root.getByLabel('Altura da rodabanca (cm)')).toHaveValue('10');
  await expect(root.getByLabel('Editar comprimento — Rodabanca')).toContainText('50 cm');
  await page.locator('.project-step').nth(4).getByRole('button').click();
  await expect(page.locator('.technical-drawing .drawing-description')).toHaveCount(3);
  await expect(page.locator('.manufacturing-description')).toContainText('50 × 10 cm');
  await expect(page.locator('.manufacturing-description')).toContainText('70 × 10 cm');
  await page.locator('.technical-drawing').screenshot({ path: '.test-artifacts/rodabanca-lados/desenho.png' });
  await page.locator('.project-step').nth(2).getByRole('button').click();
  await root.getByRole('button', { name: 'Editar acabamentos — Superior', exact: true }).click();
  await root.getByRole('button', { name: 'Remover Rodabanca — Superior', exact: true }).click();
  await expect(page.locator('.quote-summary-card')).not.toContainText('Rodabanca · Superior');
  await expect(page.locator('.quote-summary-card')).toContainText('Rodabanca · Direito');
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await page.waitForURL('**/orcamentos');
  assert.equal(saved.items[0].components.length, 2);
  assert.equal(saved.items[0].components[0].edges.length, 2);
  assert.deepEqual(saved.items[0].drawingData.componentDetails, [{}, { parentComponentIndex: 0, parentSide: 'RIGHT' }]);
  assert.equal(saved.items[0].components[1].lengthMm, 500);
  assert.equal(saved.items[0].components[1].widthMm, 100);
  assert.deepEqual(errors, []);
  console.log('OK: rodabanca junto aos acabamentos, medidas editáveis, preços separados, desenho separado, rascunho, remoção e salvamento.');
} finally {
  await browser.close();
}
