import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada. Orçamento sem cadastro: na tela Clientes, no
// cadastro de dentro do orçamento e no atalho do menu Cliente, nenhum dado é
// exigido. M² fechado: sempre marcado (travado) no orçamento; só se desliga em
// Materiais e serviços → Serviços e acabamentos.
const output = resolve(import.meta.dirname, '../../.test-artifacts/sem-cadastro-e-m2-fechado');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const clientes = [{ id: 'c1', name: 'Maria Silva', phone: '92981817980', isQuick: false, quotes: [] }];
const criados = [];
const ajustes = { closedSquareMeter: true };
const alteracoesAjuste = [];
const servicos = [{ id: 's1', name: 'Acabamento 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70, isActive: true }];
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-sem-cadastro', name: 'Administrador Inova', role: 'SUPER_ADMIN' } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: { materials: [], productTypes: [{ id: 'counter', name: 'Bancada' }], services: [], settings: { ...ajustes } } });
  if (path === '/api/catalog/materials') return route.fulfill({ json: [] });
  if (path === '/api/catalog/services') return route.fulfill({ json: servicos });
  if (path === '/api/catalog/settings' && method === 'PATCH') {
    const body = route.request().postDataJSON();
    alteracoesAjuste.push(body);
    Object.assign(ajustes, body);
    return route.fulfill({ json: { ...ajustes } });
  }
  if (path === '/api/catalog/settings') return route.fulfill({ json: { ...ajustes } });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  if (path === '/api/customers' && method === 'POST') {
    const body = route.request().postDataJSON();
    criados.push(body);
    const cliente = { id: `sem-cadastro-${criados.length}`, name: body.name || `Sem cadastro ${criados.length}`, phone: body.phone ?? null, isQuick: !body.phone, quotes: [] };
    clientes.push(cliente);
    return route.fulfill({ status: 201, json: cliente });
  }
  if (path === '/api/customers') return route.fulfill({ json: { data: clientes } });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const menuCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menu').waitFor(); };

try {
  // 1) Tela Clientes: marcar "Orçamento sem cadastro" deixa só nome e telefone, ambos opcionais.
  await page.goto(base + '/clientes');
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  const formulario = page.locator('form.customer-form');
  assert.equal(await formulario.getByLabel('Telefone', { exact: true }).getAttribute('required'), '', 'cliente comum exige telefone');
  await formulario.getByText('Orçamento sem cadastro', { exact: true }).click();
  assert.equal(await formulario.getByLabel('Nome', { exact: true }).getAttribute('required'), null, 'nome opcional');
  assert.equal(await formulario.getByLabel('Telefone', { exact: true }).getAttribute('required'), null, 'telefone opcional');
  assert.equal(await formulario.getByPlaceholder('E-mail').count(), 0, 'demais campos escondidos');
  await shot('01-clientes-opcao');
  await formulario.getByRole('button', { name: 'Criar sem cadastro' }).click();
  await page.getByText('Sem cadastro 1', { exact: true }).waitFor();
  const { quick, ...dados } = criados[0];
  assert.equal(quick, true);
  assert(Object.values(dados).every(valor => valor === null), 'cadastro sem nenhum dado: ' + JSON.stringify(dados));
  await page.getByText('Sem cadastro · sem telefone').waitFor();
  await shot('02-clientes-lista');

  // 2) Orçamento: "Cadastrar novo cliente" → sem cadastro, só com o nome → já fica selecionado.
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  const m2 = page.locator('.quick-round-toggle');
  assert.equal(await m2.locator('input').isChecked(), true, 'M² fechado já marcado');
  assert.equal(await m2.locator('input').isDisabled(), true, 'M² fechado não pode ser desmarcado no orçamento');
  await menuCliente();
  await page.getByRole('menuitem', { name: 'Cadastrar novo cliente' }).click();
  const janela = page.locator('.customer-dialog');
  await janela.getByText('Orçamento sem cadastro', { exact: true }).click();
  await janela.getByLabel('Nome', { exact: true }).fill('Seu João da obra');
  await shot('03-orcamento-opcao');
  await janela.getByRole('button', { name: 'Criar sem cadastro e selecionar' }).click();
  await janela.waitFor({ state: 'detached' });
  assert.equal(criados[1].quick, true);
  assert.equal(criados[1].name, 'Seu João da obra');
  assert.equal(criados[1].phone, null);
  await page.getByRole('button', { name: /^Cliente: Seu João da obra/ }).waitFor();

  // 3) Atalho no menu Cliente (com cliente já escolhido): abre outro atendimento sem cadastro, sem janela;
  //    o cliente anterior continua na lista, com o projeto dele, até ser salvo ou apagado.
  await page.locator('#project-name').fill('Cozinha do João');
  await menuCliente();
  await shot('04-menu-cliente');
  await page.getByRole('menuitem', { name: 'Orçamento sem cadastro' }).click();
  await page.getByRole('button', { name: /^Cliente: Sem cadastro 3/ }).waitFor();
  assert.deepEqual(criados[2], { quick: true }, 'atalho não pede nenhum dado');
  assert.equal(await page.locator('.customer-dialog').count(), 0, 'nenhuma janela aberta');
  assert.equal(await page.locator('#project-name').inputValue(), '', 'atendimento novo, com projeto em branco');
  await menuCliente();
  const abertos = page.getByRole('menu').getByRole('menuitemradio');
  assert.deepEqual(await abertos.allInnerTexts().then(textos => textos.map(texto => texto.replace(/\s+/g, ' ').trim())), ['SO Seu João da obra', 'S3 Sem cadastro 3'], 'os dois clientes abertos');
  await shot('05-clientes-neste-orcamento');
  await page.getByRole('menu').getByRole('menuitemradio', { name: /Seu João da obra/ }).click();
  assert.equal(await page.locator('#project-name').inputValue(), 'Cozinha do João', 'o projeto do primeiro cliente continua');

  // 4) Materiais e serviços → Serviços e acabamentos: o único lugar para desligar o M² fechado.
  await page.goto(base + '/administracao');
  await page.getByRole('tab', { name: 'Serviços e acabamentos' }).click();
  const chave = page.getByRole('switch', { name: 'M² fechado nos orçamentos' });
  assert.equal(await chave.isChecked(), true);
  await shot('06-servicos-m2-ligado');
  await chave.click();
  await page.getByText('Desligado', { exact: true }).waitFor();
  assert.deepEqual(alteracoesAjuste, [{ closedSquareMeter: false }]);
  await shot('07-servicos-m2-desligado');
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('.quick-round-toggle').count(), 0, 'desligado na empresa, some do orçamento');
  assert.deepEqual(errors, []);
  console.log('OK: orçamento sem cadastro (Clientes, cadastro do orçamento e atalho no menu Cliente) e M² fechado travado no orçamento, desligável só em Serviços e acabamentos.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
