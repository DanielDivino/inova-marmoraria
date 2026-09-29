import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada. Cliente rápido: na tela Clientes e no cadastro de
// dentro do orçamento, nenhum dado é exigido; o cliente criado já é selecionado.
const output = resolve(import.meta.dirname, '../../.test-artifacts/cliente-rapido');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const clientes = [{ id: 'c1', name: 'Maria Silva', phone: '92981817980', isQuick: false, quotes: [] }];
const criados = [];
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-rapido', name: 'Administrador Inova', role: 'SUPER_ADMIN' } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: { materials: [], productTypes: [{ id: 'counter', name: 'Bancada' }], services: [] } });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  if (path === '/api/customers' && method === 'POST') {
    const body = route.request().postDataJSON();
    criados.push(body);
    const cliente = { id: `rapido-${criados.length}`, name: body.name || `Cliente rápido ${criados.length}`, phone: body.phone, isQuick: !body.phone, quotes: [] };
    clientes.push(cliente);
    return route.fulfill({ status: 201, json: cliente });
  }
  if (path === '/api/customers') return route.fulfill({ json: { data: clientes } });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';

try {
  // 1) Tela Clientes: marcar "Cliente rápido" deixa só nome e telefone, ambos opcionais.
  await page.goto(base + '/clientes');
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  const formulario = page.locator('form.customer-form');
  assert.equal(await formulario.getByLabel('Telefone', { exact: true }).getAttribute('required'), '', 'cliente comum exige telefone');
  await formulario.getByText('Cliente rápido', { exact: true }).click();
  assert.equal(await formulario.getByLabel('Nome', { exact: true }).getAttribute('required'), null, 'nome opcional');
  assert.equal(await formulario.getByLabel('Telefone', { exact: true }).getAttribute('required'), null, 'telefone opcional');
  assert.equal(await formulario.getByPlaceholder('E-mail').count(), 0, 'demais campos escondidos');
  await shot('01-clientes-opcao');
  await formulario.getByRole('button', { name: 'Criar cliente rápido' }).click();
  await page.getByText('Cliente rápido 1', { exact: true }).waitFor();
  const { quick, ...dados } = criados[0];
  assert.equal(quick, true);
  assert(Object.values(dados).every(valor => valor === null), 'cadastro sem nenhum dado: ' + JSON.stringify(dados));
  await page.getByText('Cliente rápido · sem telefone').waitFor();
  await shot('02-clientes-lista');

  // 2) Orçamento: "Cadastrar novo cliente" → cliente rápido com só o nome → já fica selecionado.
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  await page.getByRole('button', { name: /^Cliente:/ }).click();
  await page.getByRole('menuitem', { name: 'Cadastrar novo cliente' }).click();
  const janela = page.locator('.customer-dialog');
  await janela.getByText('Cliente rápido', { exact: true }).click();
  await janela.getByLabel('Nome', { exact: true }).fill('Seu João da obra');
  await shot('03-orcamento-opcao');
  await janela.getByRole('button', { name: 'Criar cliente rápido e selecionar' }).click();
  await janela.waitFor({ state: 'detached' });
  assert.equal(criados[1].quick, true);
  assert.equal(criados[1].name, 'Seu João da obra');
  assert.equal(criados[1].phone, null);
  await page.getByRole('button', { name: /^Cliente: Seu João da obra/ }).waitFor();
  await shot('04-orcamento-selecionado');
  assert.deepEqual(errors, []);
  console.log('OK: cliente rápido criado sem nenhum dado em Clientes e, só com o nome, dentro do orçamento, já selecionado para os projetos.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
