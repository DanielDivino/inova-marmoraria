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
const root = index => page.locator('.component-editor > .component-card').nth(index);
// O seletor de material deixou de existir por componente: agora há um único
// seletor no topo da etapa, que segue o componente com foco/clique mais recente
// (onFocusCapture/onClickCapture em cada .component-card). Por isso "escolher o
// material do componente N" primeiro precisa de uma interação dentro dele.
const material = async (index, name) => {
  await root(index).getByLabel('Nome', { exact: true }).click();
  await page.locator('.material-picker summary').click();
  await page.locator('.material-picker-panel button').filter({ hasText: name }).click();
};
const step = number => page.locator('.project-step').nth(number - 1).getByRole('button').click();
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  // Um projeto novo começa em "Orçamento Rápido" (sem stepper de etapas); o editor
  // detalhado com componentes por peça precisa ser selecionado explicitamente.
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
  await page.getByRole('button', { name: 'Orçamento com Desenho / Detalhado' }).click();
  await step(1);
  await expect(page.locator('.project-step')).toHaveCount(3);
  await page.locator('#project-name').fill('Cozinha');
  await material(0, 'Preto São Gabriel');
  await root(0).getByLabel('Comprimento (cm)', { exact: true }).fill('200');
  await root(0).getByLabel('Largura / altura (cm)', { exact: true }).fill('60');
  await page.getByRole('button', { name: '+ Adicionar componente', exact: true }).click();
  // O <select> de Tipo não usa exact:true: o nome acessível calculado para o
  // <label>Tipo<select> implícito acaba incluindo o texto de todas as <option>
  // (possível problema de acessibilidade real, não só do teste).
  await root(1).getByLabel('Tipo').selectOption('THRESHOLD');
  await material(1, 'Branco Itaúnas');
  await root(1).getByLabel('Comprimento (cm)', { exact: true }).fill('100');
  await root(1).getByLabel('Largura / altura (cm)', { exact: true }).fill('20');
  await root(1).getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).click();
  await root(1).getByLabel('Adicionar acabamento — Inferior', { exact: true }).selectOption('vista');
  await root(1).getByLabel('Largura da vista (cm)').fill('5');
  await expect(page.locator('.summary-grand-total')).toContainText('970,00');
  // Previous request: backsplash in the same finish menu, independently drawn.
  await root(1).getByLabel('Adicionar acabamento — Inferior', { exact: true }).selectOption({ label: 'Rodabanca' });
  await root(1).getByLabel('Altura da rodabanca (cm)').fill('10');
  await expect(page.locator('.summary-grand-total')).toContainText('1.070,00');
  await step(3);
  await expect(page.locator('.technical-drawing .drawing-description')).toHaveCount(3);
  await expect(page.locator('.technical-drawing')).toContainText('Branco Itaúnas');
  await expect(page.locator('.manufacturing-description')).toContainText('100 × 10 cm');
  await step(1);
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Projetos' }).getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Projeto 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  // Um projeto novo começa em Orçamento Rápido, então o campo vazio a conferir é o
  // do editor rápido (o editor detalhado com .component-editor ainda não existe).
  await expect(page.locator('#project-name')).toHaveValue('');
  await page.getByRole('button', { name: 'Excluir Projeto 2', exact: true }).click();
  assert.equal(confirmations, 0);
  await expect(page.getByRole('tab', { name: 'Cozinha', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.getByRole('button', { name: 'Orçamento com Desenho / Detalhado' }).click();
  await step(1);
  await page.locator('#project-name').fill('Janela');
  await material(0, 'Branco Itaúnas');
  await root(0).getByLabel('Comprimento (cm)', { exact: true }).fill('100');
  await root(0).getByLabel('Largura / altura (cm)', { exact: true }).fill('10');
  await page.getByRole('tab', { name: 'Cozinha', exact: true }).click();
  await expect(root(0).getByLabel('Comprimento (cm)', { exact: true })).toHaveValue('200');
  await expect(page.locator('.summary-grand-total')).toContainText('1.070,00');
  await page.getByRole('button', { name: 'Excluir Janela', exact: true }).click();
  assert.equal(confirmations, 1);
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.getByRole('button', { name: 'Orçamento com Desenho / Detalhado' }).click();
  await step(1);
  await page.locator('#project-name').fill('Banheiro');
  await material(0, 'Branco Itaúnas');
  await root(0).getByLabel('Comprimento (cm)', { exact: true }).fill('100');
  await root(0).getByLabel('Largura / altura (cm)', { exact: true }).fill('10');
  await page.getByRole('tab', { name: 'Cozinha', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('tablist', { name: 'Projetos' }).getByRole('tab')).toHaveCount(2);
  await expect(root(0).getByLabel('Comprimento (cm)', { exact: true })).toHaveValue('200');
  // O seletor de material é único por etapa, associado ao componente com foco mais
  // recente; para conferir o material da peça 2, é preciso focá-la primeiro.
  await root(1).getByLabel('Nome', { exact: true }).click();
  await expect(page.locator('.material-picker summary')).toContainText('Branco Itaúnas');
  mkdirSync('.test-artifacts/projeto-compacto', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `.test-artifacts/projeto-compacto/componentes-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
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
  console.log('OK: 3 etapas, cliente compacto, abas independentes, exclusão condicional, materiais e preços por componente, rodabanca no acabamento, desenho, rascunho e envio.');
} finally { await browser.close(); }
