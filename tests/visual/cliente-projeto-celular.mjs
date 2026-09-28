import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// APIs simuladas: nenhum cadastro ou orçamento real é alterado.
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
page.setDefaultTimeout(15000);
const output = resolve('.test-artifacts/cliente-projeto-celular');
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
// Menu "Cliente ▾" da barra do atendimento (substituiu as abas de clientes).
const menuCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await expect(page.getByRole('menu')).toBeVisible(); };
const acao = name => page.getByRole('menu').getByRole('menuitem', { name, exact: true }).click();
const outroCliente = async () => { await menuCliente(); await acao('+ Outro cliente neste orçamento'); };
const clientesAbertos = async () => {
  await menuCliente();
  const nomes = await page.getByRole('menu').getByRole('menuitemradio').allTextContents();
  await page.keyboard.press('Escape');
  return nomes.length || 1;
};
const clienteAtivo = name => expect(page.getByRole('button', { name: /^Cliente:/ })).toHaveAccessibleName(`Cliente: ${name}`);
const escolherCliente = async name => { await menuCliente(); await page.getByRole('menu').getByRole('menuitemradio', { name: new RegExp(name) }).click(); };
let confirmar = true;
page.on('dialog', dialog => confirmar ? dialog.accept() : dialog.dismiss());
const choose = async name => {
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill(name);
  await page.locator('.customer-result').filter({ hasText: name }).click();
};
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await expect(page.locator('.quick-quote')).toBeVisible();
  await expect(page.locator('.atendimento-barra')).toBeVisible();
  await expect(page.locator('.client-tabs-bar, .project-tabs-bar')).toHaveCount(0);
  await menuCliente();
  await acao('Selecionar cliente existente');
  await choose('Ana Silva');
  assert.equal(await clientesAbertos(), 1);
  await clienteAtivo('Ana Silva');
  await page.locator('#project-name').fill('Cozinha');

  // Cancelar o cadastro não cria cliente vazio nem altera o projeto atual.
  await outroCliente();
  await page.getByRole('dialog').getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await clientesAbertos(), 1);
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');

  await outroCliente();
  await page.getByRole('dialog').getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByPlaceholder('Nome', { exact: true }).fill('Bruno Lima');
  await page.getByPlaceholder('Telefone', { exact: true }).fill('92999999992');
  await page.getByRole('button', { name: 'Salvar e selecionar cliente', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Novo cliente', exact: true }).getByRole('alert')).toContainText('Confira o telefone');
  // Com erro, a janela continua aberta para corrigir e nenhum cliente novo é aberto.
  await expect(page.getByRole('dialog', { name: 'Novo cliente', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar e selecionar cliente', exact: true }).click();
  assert.equal(await clientesAbertos(), 2);
  await clienteAtivo('Bruno Lima');
  await page.locator('#project-name').fill('Banheiro');

  // "Trocar cliente" troca só o cliente do atendimento aberto; os projetos continuam.
  await escolherCliente('Ana Silva');
  await menuCliente();
  await acao('Trocar cliente');
  await choose('Clara Souza');
  assert.equal(await clientesAbertos(), 2);
  await clienteAtivo('Clara Souza');
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');
  await escolherCliente('Bruno Lima');
  await expect(page.locator('#project-name')).toHaveValue('Banheiro');

  // Remover pede confirmação; cancelar mantém o cliente.
  confirmar = false;
  await menuCliente();
  await acao('Remover este cliente');
  assert.equal(await clientesAbertos(), 2);
  confirmar = true;
  await menuCliente();
  await acao('Remover este cliente');
  assert.equal(await clientesAbertos(), 1);
  await clienteAtivo('Clara Souza');
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');

  await page.reload();
  await clienteAtivo('Clara Souza');
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
  await expect(page.locator('.atendimento-barra')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar projeto', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await menuCliente();
  await acao('Remover este cliente');
  await expect(page.getByRole('button', { name: /^Cliente:/ })).toHaveAccessibleName('Cliente: selecionar');
  await expect(page.locator('#project-name')).toHaveValue('');
  assert(!requests.some(request => request.startsWith('DELETE ')), 'Excluir aba preserva o cadastro de clientes');
  assert.deepEqual(errors, []);
  console.log('OK: menu do cliente (existente, novo, outro cliente), erro e repetição do cadastro, cancelamento, troca só do atendimento aberto, remoção com confirmação, rascunho, desktop e quatro larguras em dois temas. APIs simuladas.');
} finally { await browser.close(); }
