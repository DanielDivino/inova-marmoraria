import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { orcamentoSalvo } from './apoio/orcamento-salvo.mjs';

const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
let saved;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'compact-test', name: 'Teste', role: 'SUPER_ADMIN' } } });
  // Rascunho do Novo orçamento no servidor (vazio: vale o deste navegador).
  if (path === '/api/quote-draft') return route.fulfill({ json: route.request().method() === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: {
    materials: [{ id: 'stone-a', name: 'Preto São Gabriel', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }, { id: 'stone-b', name: 'Branco Itaúnas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 1000, images: [] }],
    productTypes: [{ id: 'counter', name: 'Bancada' }],
    services: [{ id: 'vista', name: 'Vista', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 0 }],
  } });
  if (path === '/api/customers') return route.fulfill({ json: route.request().method() === 'POST' ? { id: 'new-customer', ...route.request().postDataJSON() } : { data: [{ id: 'customer', name: 'João da Silva', phone: '00000000000' }] } });
  if (path === '/api/quotes' && route.request().method() === 'POST') { saved = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 'saved' } }); }
  if (path === '/api/quotes/saved/status') return route.fulfill({ json: { status: 'SENT' } });
  // Depois de salvar abre a tela do orçamento salvo.
  if (path === '/api/quotes/saved' && route.request().method() === 'GET') return route.fulfill({ json: orcamentoSalvo('saved') });
  if (path === '/api/workers') return route.fulfill({ json: [] });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  return route.fulfill({ status: 404, json: {} });
});
// Material do projeto (topo) vs. material desta peça (dentro de "Detalhar",
// sobrescreve o do projeto só para aquela peça).
const projectMaterial = async name => {
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-picker-panel button').filter({ hasText: name }).click();
};
// "Opções da peça N" abre a linha com a pedra só desta peça e os acabamentos dela.
const abrirOpcoes = async numero => {
  // No desktop o botão visível é o "Opções" da linha; o nomeado "Opções da peça N" é o do celular.
  const botao = page.locator('[data-quick-row]').nth(numero - 1).locator('.quick-options-button:visible').first();
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
  return page.locator('#' + await botao.getAttribute('aria-controls'));
};
const rowMaterial = async (numero, name) => {
  const opcoes = await abrirOpcoes(numero);
  await opcoes.locator('.quick-material-override .picker-summary').click();
  await page.getByRole('dialog', { name: 'Escolher material' }).getByRole('button').filter({ hasText: name }).click();
};
// Barra do atendimento: menus "Cliente ▾" e "Projeto ▾" (substituíram as abas).
const selecionarCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click(); };
const menuProjeto = async () => { await page.getByRole('button', { name: /^Projeto:/ }).click(); await expect(page.getByRole('menu')).toBeVisible(); };
const escolherProjeto = async name => { await menuProjeto(); await page.getByRole('menu').getByRole('menuitemradio', { name, exact: true }).click(); };
const contarProjetos = async () => { await menuProjeto(); const total = await page.getByRole('menu').getByRole('menuitemradio').count(); await page.keyboard.press('Escape'); return total; };
const excluirProjeto = async name => { await escolherProjeto(name); await menuProjeto(); await page.getByRole('menu').getByRole('menuitem', { name: `Excluir ${name}`, exact: true }).click(); };
const projetoAtivo = name => expect(page.getByRole('button', { name: /^Projeto:/ })).toHaveAccessibleName(`Projeto: ${name}`);
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  // Um projeto novo começa no Orçamento Rápido — é onde todo dado comercial
  // (material, medidas, acabamentos, rodabanca) é criado; o desenho é o técnico.
  await expect(page.getByRole('heading', { name: 'Orçamento Rápido' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  assert.equal(await contarProjetos(), 1);
  await selecionarCliente();
  await page.getByRole('dialog').getByPlaceholder('Digite nome, telefone ou CPF').fill('João');
  await page.locator('.customer-result').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.atendimento-barra')).toContainText('João da Silva');
  await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menuitem', { name: 'Trocar cliente', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.atendimento-barra')).toContainText('João da Silva');
  await page.locator('#project-name').fill('Cozinha');
  await projectMaterial('Preto São Gabriel');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(2);
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('THRESHOLD');
  await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,20');
  await rowMaterial(2, 'Branco Itaúnas');
  // Vista é uma peça própria (Tipo/descrição), presa ao lado Inferior da soleira: pega o comprimento
  // do lado e a pedra da soleira, e é cobrada pela área.
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 3', { exact: true }).focus();
  await page.getByLabel('Tipo da peça 3', { exact: true }).selectOption('VISTA');
  await page.getByLabel('Peça onde fica a vista 3', { exact: true }).selectOption({ label: 'Peça 2 · Soleira' });
  await expect(page.getByLabel('Comprimento da peça 3 (m)', { exact: true })).toHaveValue('1,00');
  await page.getByLabel('Largura da peça 3 (m)', { exact: true }).fill('0,05');
  await expect(page.locator('.summary-grand-total')).toContainText('970,00');
  // Rodabanca é uma peça própria (tipo "Rodabanca"), da mesma pedra da soleira e cobrada pela área.
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(4);
  await page.getByLabel('Tipo da peça 4', { exact: true }).selectOption('BACKSPLASH');
  await page.getByLabel('Comprimento da peça 4 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 4 (m)', { exact: true }).fill('0,10');
  await rowMaterial(4, 'Branco Itaúnas');
  await expect(page.locator('.summary-grand-total')).toContainText('1.070,00');
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  assert.equal(await contarProjetos(), 2);
  await projetoAtivo('Projeto 2');
  // Um projeto novo começa em Orçamento Rápido, então o campo vazio a conferir é o
  // do editor rápido.
  await expect(page.locator('#project-name')).toHaveValue('');
  await excluirProjeto('Projeto 2');
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'projeto vazio sai sem perguntar');
  await projetoAtivo('Cozinha');
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.locator('#project-name').fill('Janela');
  await projectMaterial('Branco Itaúnas');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,10');
  await escolherProjeto('Cozinha');
  await expect(page.getByLabel('Comprimento da peça 1 (m)', { exact: true })).toHaveValue('2,00');
  await expect(page.locator('.summary-grand-total')).toContainText('1.070,00');
  await excluirProjeto('Janela');
  await page.getByRole('alertdialog', { name: 'Excluir Janela?' }).getByRole('button', { name: 'Excluir projeto', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.locator('#project-name').fill('Banheiro');
  await projectMaterial('Branco Itaúnas');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,10');
  await escolherProjeto('Cozinha');
  await page.reload();
  assert.equal(await contarProjetos(), 2);
  await expect(page.getByLabel('Comprimento da peça 1 (m)', { exact: true })).toHaveValue('2,00');
  mkdirSync('.test-artifacts/projeto-compacto', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `.test-artifacts/projeto-compacto/componentes-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).first().click();
  await page.waitForURL('**/orcamentos/saved');
  assert.equal(saved.items.length, 2);
  assert.deepEqual(saved.items[0].components.map(piece => piece.materialId), ['stone-a', 'stone-b', 'stone-b', 'stone-b'], 'A vista pega a pedra da soleira');
  assert.deepEqual(saved.items[0].components.map(piece => [piece.componentType, piece.lengthMm, piece.widthMm]).slice(1, 3), [['THRESHOLD', 1000, 200], ['VISTA', 1000, 50]]);
  assert.deepEqual(saved.items[0].drawingData.componentDetails[2], { parentComponentIndex: 1, parentSide: 'FRONT' }, 'Vista presa ao lado Inferior da soleira');
  assert.equal(saved.items[1].components[0].materialId, 'stone-b');
  assert.equal(saved.items[0].environment, null);
  assert.equal(saved.customerId, 'customer');
  assert.deepEqual(errors, []);
  console.log('OK: cliente compacto, abas independentes, exclusão condicional, materiais e preços por peça, vista no Tipo/descrição presa à soleira, rodabanca, rascunho e envio pelo Orçamento Rápido.');
} finally { await browser.close(); }
