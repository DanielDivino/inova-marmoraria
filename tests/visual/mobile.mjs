import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Intercepta todas as APIs: o fluxo de preenchimento/salvamento não altera dados reais.
const output = resolve('.test-artifacts/mobile');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const customer = { id: 'mobile-customer', name: 'Cliente do orçamento pelo celular', phone: '92999999999' };
const catalog = {
  materials: [{ id: 'stone', name: 'Granito Preto São Gabriel', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }],
  productTypes: [{ id: 'counter', name: 'Bancada' }],
  services: [
    { id: 'assembly', name: 'Montagem', category: 'Serviços', billingUnit: 'FIXED', currentPrice: 300 },
    { id: 'finish', name: 'Acabamento 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70 },
  ],
};
let saved;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'mobile-user', name: 'Vendedor de demonstração', role: 'SELLER', maxDiscountPercent: 10 } } });
  // Rascunho do Novo orçamento no servidor (vazio: vale o deste navegador).
  if (path === '/api/quote-draft') return route.fulfill({ json: route.request().method() === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: catalog });
  if (path === '/api/customers') return route.fulfill({ json: { data: [customer] } });
  if (path === '/api/quotes' && route.request().method() === 'POST') {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { id: 'mobile-saved' }, status: 201 });
  }
  if (path === '/api/quotes/mobile-saved/status') return route.fulfill({ json: { status: 'SENT' } });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], meta: { pages: 0 }, counts: {} } });
  errors.push('API não prevista: ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
async function noOverflow(label) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': página sem rolagem lateral');
  assert(await page.locator('.quick-table').evaluate(el => el.scrollWidth <= el.clientWidth + 1), label + ': peças sem rolagem lateral');
}
// Barra do atendimento: menus "Cliente ▾" e "Projeto ▾" (substituíram as abas).
const selecionarCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click(); };
try {
  await page.goto(base + '/');
  await expect(page.locator('.quick-quote')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Navegação da Inova' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Orçamentos', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeFocused();
  await selecionarCliente();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Cozinha no celular');
  await page.locator('.quick-project-fields .picker-summary').click();
  // O botão da pedra começa com o ícone da miniatura.
  await page.getByRole('button').filter({ hasText: /Granito Preto São Gabriel/ }).click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,00');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).press('Enter');
  await expect(page.getByLabel('Largura da peça 1 (m)', { exact: true })).toBeFocused();
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).press('Enter');
  await expect(page.getByLabel('Quantidade da peça 1', { exact: true })).toBeFocused();
  await expect(page.locator('.quick-item-total strong')).toContainText('720,00');
  await page.getByLabel('Montagem', { exact: true }).check();
  await expect(page.locator('.mobile-quote-bar strong')).toContainText('1.020,00');
  await page.getByLabel('Quantidade da peça 1', { exact: true }).press('Enter');
  await expect(page.getByLabel('Comprimento da peça 2 (m)', { exact: true })).toBeFocused();
  await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).fill('1,20');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,20');
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('__ADD_DESCRIPTION__');
  await page.getByLabel('Novo tipo / descrição', { exact: true }).fill('Complemento lateral');
  await page.locator('.type-description-form').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.locator('.mobile-quote-bar strong')).toContainText('1.164,00');
  // Opções da peça: pedra só desta peça e acabamentos (o valor manual da peça saiu da linha).
  await page.getByRole('button', { name: 'Opções da peça 1', exact: true }).click();
  await expect(page.locator('#' + (await page.getByRole('button', { name: 'Opções da peça 1', exact: true }).getAttribute('aria-controls'))).getByText('Material desta peça')).toBeVisible();
  await page.getByRole('button', { name: 'Opções da peça 1', exact: true }).click();
  await expect(page.locator('.mobile-quote-bar strong')).toContainText('1.164,00');
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  const services = page.getByRole('dialog', { name: /^Acabamentos de/ });
  await expect(services).toBeVisible();
  await services.getByLabel('Inferior', { exact: true }).check();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    // O Chromium pode levar o Tab à barra do navegador (activeElement = body),
    // mas o conteúdo da página deve continuar inerte atrás do diálogo nativo.
    assert(await services.evaluate(el => el.matches(':modal') && (el.contains(document.activeElement) || document.activeElement === document.body)), 'Foco não alcança controles da página atrás do diálogo');
  }
  await page.screenshot({ path: resolve(output, 'servicos.png') });
  await page.keyboard.press('Escape');
  await expect(services).not.toBeVisible();
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  await services.getByLabel('Inferior', { exact: true }).uncheck();
  await services.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByRole('button', { name: 'Remover peça 2', exact: true }).click();
  await expect(page.locator('[data-quick-row]')).toHaveCount(1);
  await expect(page.locator('.mobile-quote-bar strong')).toContainText('1.020,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).blur();
  for (const dark of [false, true]) {
    if (dark) await page.getByRole('button', { name: 'Ativar tema escuro', exact: true }).click();
    for (const width of [320, 360, 390, 430, 760]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(`${width}, ${dark ? 'escuro' : 'claro'}`);
      // Só os campos visíveis: a linha de opções da peça fica escondida até ser aberta.
      for (const input of await page.locator('[data-quick-row] input:visible').all()) {
        const box = await input.boundingBox();
        assert(box && box.width >= 70 && box.x >= 0 && box.x + box.width <= width, 'Campo de peça cabe na tela');
        assert(box.height >= 44, 'Campo acessível ao toque');
      }
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(output, `orcamento-${dark ? 'escuro' : 'claro'}.png`), fullPage: true });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.mobile-quote-bar').getByRole('button', { name: 'Ver resumo', exact: false }).click();
  await expect(page.locator('.quote-summary-card')).toBeFocused();
  // O resumo abre como janela sobre a página; a barra continua com "Fechar resumo".
  await expect(page.locator('.mobile-quote-bar').getByRole('button', { name: /Fechar resumo/ })).toHaveAttribute('aria-expanded', 'true');
  // Resumo sem validade (sempre 10 dias úteis, no PDF), sem observações (ficam na tela do orçamento) e sem a opção de valores no PDF.
  for (const campo of ['Validade do orçamento', 'Observações do orçamento', 'Valores no PDF']) assert.equal(await page.getByLabel(campo, { exact: true }).count(), 0, campo);
  await page.getByLabel('Desconto geral rápido', { exact: true }).fill('15');
  await page.reload();
  // Máscara de metros: o rascunho reabre com duas casas.
  await expect(page.getByLabel('Comprimento da peça 1 (m)', { exact: true })).toHaveValue('2,00');
  await expect(page.getByLabel('Desconto geral rápido', { exact: true })).toHaveValue('15');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).not.toBeVisible();
  assert.equal(await page.locator('.quick-table').evaluate(el => getComputedStyle(el).display), 'table');
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  // No celular o botão de salvar fica no resumo, que abre pela barra de baixo.
  await page.locator('.mobile-quote-bar').getByRole('button', { name: /Ver resumo/ }).click();
  await page.locator('.quote-summary-card').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await page.waitForURL('**/orcamentos');
  assert.equal(saved.items[0].components.length, 1);
  assert.equal(saved.items[0].components[0].lengthMm, 2000);
  assert.equal(saved.items[0].components[0].widthMm, 600);
  assert.equal(saved.discountAmount, 15);
  assert.equal(saved.notes, undefined, 'observações se editam na tela do orçamento');
  assert.equal(saved.validUntil, undefined, 'validade calculada no servidor');
  assert.deepEqual(errors, []);
  console.log('OK: menu por perfil, teclado, peças, descrição, cálculos, serviços, modais, resumo, rascunho e salvamento. Cinco larguras em dois temas; desktop preservado. APIs simuladas.');
} finally { await browser.close(); }
