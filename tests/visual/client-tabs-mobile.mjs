import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// APIs simuladas: nenhum cadastro ou orçamento real é alterado.
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
page.setDefaultTimeout(15000);
const output = resolve('.test-artifacts/mobile-client-tabs');
mkdirSync(output, { recursive: true });
const errors = [];
const requests = [];
let failCreate = true;
const customers = [
  { id: 'one', name: 'Ana Silva', phone: '92999999991' },
  { id: 'three', name: 'Clara Souza', phone: '92999999993' },
];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  requests.push(`${request.method()} ${url.pathname}`);
  if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user: { id: 'mobile-tabs-test', name: 'Teste', role: 'SELLER', maxDiscountPercent: 10 } } });
  if (url.pathname === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (url.pathname === '/api/catalog') return route.fulfill({ json: {
    materials: [{ id: 'stone', name: 'Branco Dallas', billingUnit: 'SQUARE_METER', currentPrice: 600, category: 'Granito', images: [] }],
    services: [], productTypes: [{ id: 'counter', name: 'Bancada' }],
  } });
  if (url.pathname === '/api/customers' && request.method() === 'POST') {
    if (failCreate) { failCreate = false; return route.fulfill({ status: 400, json: { message: 'Confira o telefone informado.' } }); }
    return route.fulfill({ status: 201, json: { id: 'two', ...request.postDataJSON() } });
  }
  if (url.pathname === '/api/customers') return route.fulfill({ json: { data: customers.filter(customer => customer.name.includes(url.searchParams.get('search') ?? '')) } });
  errors.push(`API inesperada: ${request.method()} ${url.pathname}`);
  return route.fulfill({ status: 404, json: {} });
});
const add = () => page.getByRole('button', { name: 'Adicionar cliente', exact: true }).click();
const choose = async name => {
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill(name);
  await page.locator('.customer-result').filter({ hasText: name }).click();
};
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await expect(page.locator('.quick-quote')).toBeVisible();
  await expect(page.locator('.project-title-client')).not.toBeVisible();
  await expect(page.locator('.desktop-client-close')).not.toBeVisible();
  await add();
  await page.getByRole('button', { name: 'Escolher cliente existente', exact: true }).click();
  await choose('Ana Silva');
  await expect(page.locator('.client-tab')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Ana Silva', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#project-name').fill('Cozinha');

  // Cancelar o cadastro não cria abas vazias nem altera o projeto atual.
  await add();
  await page.getByRole('button', { name: 'Cadastrar novo cliente', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.client-tab')).toHaveCount(1);
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');

  await add();
  await page.getByRole('button', { name: 'Cadastrar novo cliente', exact: true }).click();
  await page.getByPlaceholder('Nome', { exact: true }).fill('Bruno Lima');
  await page.getByPlaceholder('Telefone', { exact: true }).fill('92999999992');
  await page.getByRole('button', { name: 'Salvar e selecionar cliente', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Novo cliente', exact: true }).getByRole('alert')).toContainText('Confira o telefone');
  await expect(page.locator('.client-tab')).toHaveCount(1);
  await page.getByRole('button', { name: 'Salvar e selecionar cliente', exact: true }).click();
  await expect(page.locator('.client-tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Bruno Lima', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#project-name').fill('Banheiro');

  // O lápis de uma aba inativa troca somente o cliente daquela aba.
  await page.getByRole('button', { name: 'Opções de Ana Silva', exact: true }).click();
  await page.getByRole('button', { name: 'Trocar cliente', exact: true }).click();
  await choose('Clara Souza');
  await expect(page.locator('.client-tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Clara Souza', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');
  await page.getByRole('tab', { name: 'Bruno Lima', exact: true }).click();
  await expect(page.locator('#project-name')).toHaveValue('Banheiro');
  await page.getByRole('tab', { name: 'Clara Souza', exact: true }).click();
  await page.getByRole('button', { name: 'Opções de Bruno Lima', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.client-tab')).toHaveCount(2);
  await page.getByRole('button', { name: 'Opções de Bruno Lima', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir cliente e projetos', exact: true }).click();
  await expect(page.locator('.client-tab')).toHaveCount(1);
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Clara Souza', exact: true })).toBeVisible();
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');
  await page.locator('.quick-project-fields .picker-summary').click();
  const materialDialog = page.getByRole('dialog', { name: 'Escolher material', exact: true });
  await expect(materialDialog).toBeVisible();
  await materialDialog.getByRole('textbox', { name: 'Buscar material', exact: true }).fill('inexistente');
  await expect(materialDialog.getByRole('status')).toContainText('Nenhum material encontrado');
  await materialDialog.getByRole('textbox', { name: 'Buscar material', exact: true }).fill('Dallas');
  await materialDialog.getByRole('button', { name: /Branco Dallas/ }).click();
  await expect(materialDialog).not.toBeVisible();
  await expect(page.locator('.quick-project-fields .picker-summary')).toContainText('Branco Dallas');
  await expect(page.locator('.quick-project-fields .picker-summary')).toBeFocused();
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle('inova-dark', value), dark);
    for (const width of [320, 390, 490, 760]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Sem rolagem lateral em ${width}`);
      const name = await page.locator('#project-name').boundingBox();
      const material = await page.locator('.quick-project-fields .picker-summary').boundingBox();
      assert(name && material && Math.abs(name.y - material.y) < 3 && material.x >= name.x + name.width, 'Nome e material alinhados lado a lado');
      if (width === 390) await page.screenshot({ path: resolve(output, `mobile-${dark ? 'escuro' : 'claro'}.png`), fullPage: true });
      await page.locator('.quick-project-fields .picker-summary').click();
      await expect(materialDialog).toBeVisible();
      const dialogBox = await materialDialog.boundingBox();
      assert(dialogBox && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= width, 'Modal de materiais cabe na tela');
      if (width === 390) await page.screenshot({ path: resolve(output, `materiais-${dark ? 'escuro' : 'claro'}.png`) });
      await page.keyboard.press('Escape');
      await expect(materialDialog).not.toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.project-title-client')).toBeVisible();
  await expect(page.locator('.mobile-client-pencil')).not.toBeVisible();
  await expect(page.locator('.desktop-client-close')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Opções de Clara Souza', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir cliente e projetos', exact: true }).click();
  await expect(page.locator('.client-tab')).toHaveCount(1);
  await expect(page.locator('#project-name')).toHaveValue('');
  assert(!requests.some(request => request.startsWith('DELETE ')), 'Excluir aba preserva o cadastro de clientes');
  assert.deepEqual(errors, []);
  console.log('OK: clientes novos/existentes, erro e repetição do cadastro, cancelamento, troca na aba correta, exclusão, rascunho, desktop e quatro larguras em dois temas. APIs simuladas.');
} finally { await browser.close(); }
