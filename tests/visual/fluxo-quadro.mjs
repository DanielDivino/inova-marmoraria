import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada. Layout do Fluxo de trabalho: título na barra de cima do app, abas
// (Quadro / Resumo), filtros num bloco só e o botão "Filtros" que os recolhe (e lembra), colunas com
// contagem e "+ Adicionar projeto" no pé (abre o Novo orçamento); as 5 colunas cabem em 1280 e 1440,
// e no celular as abas cabem na largura.
const output = resolve(import.meta.dirname, '../../.test-artifacts/fluxo-quadro');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const usuario = { id: 'visual-fluxo', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 };
const frank = { id: 'w1', name: 'Frank - Corta/Monta', color: '#22c55e' };
let sequencia = 0;
const cartao = (status, name, number, customerName, pieces, quote = {}) => ({ id: 'k' + (++sequencia), name, status, position: sequencia, completedAt: null, pieces, totalPieces: pieces, projectId: 'p' + sequencia, pieceList: [], materialMissing: false,
  quote: { id: 'q-' + number, number, customerId: 'c-' + customerName, customerName, deadline: null, worker: null, phase: 'IN_EXECUTION', ...quote } });
const cartoes = [
  cartao('TODO', 'Prateleira', 'SET-2026-14', 'Cleiciane', 3, { phase: 'AWAITING_START', worker: frank }),
  cartao('TODO', 'Bancada cozinha', 'SET-2026-15', 'Pedro', 4),
  cartao('TODO', 'Soleira porta', 'SET-2026-16', 'Juliana', 2),
  cartao('IN_PROGRESS', 'Calçada da igreja', 'ORC-2026-20', 'Alcielia', 84, { worker: frank, deadline: '2026-09-25' }),
  cartao('IN_PROGRESS', 'Escada interna', 'SET-2026-18', 'Roberto', 6, { worker: frank, deadline: '2026-10-10' }),
  cartao('DELIVERED', 'Lavabo', 'SET-2026-08', 'Fran', 2, { worker: frank }),
];

await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ json: { user: usuario } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/workflow/projects') return route.fulfill({ json: cartoes });
  if (path === '/api/quote-draft') return route.fulfill({ json: { version: null } });
  errors.push('API não prevista: ' + route.request().method() + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const shot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
const botaoFiltros = () => page.getByRole('button', { name: /^Filtros/ });
const semRolagemLateral = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const quadroCabe = () => page.locator('.fluxo-quadro').evaluate(quadro => quadro.scrollWidth <= quadro.clientWidth + 1);

try {
  await page.goto(base + '/fluxo');
  await page.locator('.fluxo-quadro [data-cartao]').first().waitFor();
  // Título na barra de cima (ao lado do sino), uma vez só.
  await page.locator('.application-header-actions h1', { hasText: 'Fluxo de trabalho' }).waitFor();
  assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
  // Abas sem contagem, Quadro escolhido; filtros com "Todos" e "Todas as datas".
  assert.equal(await page.getByRole('button', { name: 'Quadro de projetos', exact: true }).getAttribute('aria-pressed'), 'true');
  for (const filtro of ['Funcionário: Todos', 'Cliente: Todos', 'Orçamento: Todos', 'Entrega: Todas as datas', 'Material: Todos']) await page.getByRole('button', { name: filtro, exact: true }).waitFor();
  assert.equal(await page.locator('.fluxo-legenda').count(), 0, 'sem a legenda de prazo: o cartão diz o prazo');
  // Colunas com contagem e "+ Adicionar projeto" (Novo orçamento) no pé de cada uma.
  assert.deepEqual(await page.locator('.fluxo-coluna > header span').allInnerTexts(), ['1', '2', '2', '0', '1']);
  const adicionar = page.getByRole('link', { name: 'Adicionar projeto' });
  assert.equal(await adicionar.count(), 5);
  for (const href of await adicionar.evaluateAll(links => links.map(link => link.getAttribute('href')))) assert.equal(href, '/');
  assert(await quadroCabe(), 'as 5 colunas cabem em 1440');
  await shot('01-quadro-1440');

  // "Filtros" recolhe e mostra os filtros, e lembra ao voltar.
  assert.equal(await botaoFiltros().getAttribute('aria-expanded'), 'true');
  await botaoFiltros().click();
  assert.equal(await page.locator('#fluxo-filtros').count(), 0);
  await page.reload();
  await page.locator('.fluxo-quadro [data-cartao]').first().waitFor();
  assert.equal(await botaoFiltros().getAttribute('aria-expanded'), 'false', 'continua recolhido');
  await botaoFiltros().click();
  // Filtro ativo: contagem no botão e "Limpar" ao lado.
  await page.getByRole('button', { name: 'Cliente: Todos', exact: true }).click();
  await page.getByRole('option', { name: 'Pedro', exact: true }).click();
  assert.equal(await page.locator('.fluxo-quadro [data-cartao]').count(), 1);
  assert.match(await botaoFiltros().innerText(), /Filtros\s*1/);
  await shot('02-filtrado');
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  assert.equal(await page.locator('.fluxo-quadro [data-cartao]').count(), cartoes.length);
  assert.equal(await page.getByRole('button', { name: 'Limpar', exact: true }).count(), 0, 'Limpar só aparece com filtro');

  // Resumo por orçamento.
  await page.getByRole('button', { name: 'Resumo por orçamento', exact: true }).click();
  await page.locator('.fluxo-resumo').waitFor();
  await page.getByRole('button', { name: 'Quadro de projetos', exact: true }).click();

  // Notebook: as 5 colunas continuam lado a lado, sem rolar para o lado.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  assert(await quadroCabe(), 'as 5 colunas cabem em 1280');
  assert(await semRolagemLateral());
  await shot('03-quadro-1280');

  // Celular: título no cabeçalho do app, as duas abas cabem e uma etapa por vez.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert(await semRolagemLateral(), 'sem rolagem lateral no celular');
  for (const aba of ['Quadro de projetos', 'Resumo por orçamento']) {
    const caixa = await page.getByRole('button', { name: aba, exact: true }).boundingBox();
    assert(caixa && caixa.x >= 0 && caixa.x + caixa.width <= 390, `aba ${aba} inteira na tela`);
  }
  await page.getByRole('navigation', { name: 'Etapas do fluxo' }).waitFor();
  await shot('04-celular');
  assert.deepEqual(errors, []);
  console.log('OK: Fluxo de trabalho no layout novo — título na barra de cima, abas e filtros numa linha, "Filtros" recolhe e lembra, Limpar com filtro ativo, contagem e "+ Adicionar projeto" em cada coluna, 5 colunas em 1440 e 1280, celular com as abas inteiras.');
} finally {
  await browser.close();
}
