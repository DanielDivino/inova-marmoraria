import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { orcamentoSalvo } from './apoio/orcamento-salvo.mjs';

// API simulada. "Confirmar aprovação" pergunta se o cliente aprovou todos os projetos; aprovando só
// alguns, os outros ficam "Não aprovado" (fora do valor e do fluxo). Os projetos aparecem em blocos
// compactos, em tons pastel, que abrem para os detalhes; no topo, o filtro separa aprovados e não aprovados.
const output = resolve(import.meta.dirname, '../../.test-artifacts/aprovacao-projetos');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const projeto = (id, projectName, total) => ({ id, projectName, declinedAt: null, materialNameSnapshot: 'Preto São Gabriel', unitPriceSnapshot: 600, billedQuantity: 1.2, materialSubtotal: total, total, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null,
  components: [{ id: `${id}-k1`, label: 'Bancada', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: total, calculatedTotal: total, appliedTotal: total, hasManualPriceOverride: false, edges: [] }] });
const orcamento = orcamentoSalvo('q1', { grossTotal: 2000, discountAmount: 100, netTotal: 1900, items: [projeto('i1', 'Cozinha', 1000), projeto('i2', 'Banheiro', 600), projeto('i3', 'Lavabo', 400)] });
// O servidor, simplificado: não aprovados fora do valor, desconto na mesma proporção.
const recalcular = naoAprovados => {
  const completo = orcamento.fullDiscountAmount ?? orcamento.discountAmount;
  orcamento.items = orcamento.items.map(item => ({ ...item, declinedAt: naoAprovados.includes(item.id) ? '2026-10-01T12:00:00.000Z' : null }));
  const bruto = orcamento.items.filter(item => !item.declinedAt).reduce((soma, item) => soma + item.total, 0);
  const desconto = naoAprovados.length ? Math.round(completo * bruto / 2000 * 100) / 100 : completo;
  Object.assign(orcamento, { grossTotal: bruto, discountAmount: desconto, netTotal: bruto - desconto, fullDiscountAmount: naoAprovados.length ? completo : null });
};
const situacoes = [];
const aprovacoes = [];
const retrabalhos = [];
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-aprovacao', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/quotes/q1' && method === 'GET') return route.fulfill({ json: orcamento });
  if (path === '/api/quotes/q1/status' && method === 'PATCH') {
    const corpo = route.request().postDataJSON();
    situacoes.push(corpo);
    recalcular(corpo.projetosNaoAprovados ?? []);
    Object.assign(orcamento, { status: 'APPROVED', executionStatus: corpo.executionStatus ?? 'NOT_STARTED', approvedAt: '2026-10-01T12:00:00.000Z' });
    return route.fulfill({ json: orcamento });
  }
  const aprovacao = path.match(/^\/api\/quotes\/q1\/items\/([^/]+)\/aprovacao$/);
  if (aprovacao && method === 'PATCH') {
    const { aprovado } = route.request().postDataJSON();
    aprovacoes.push({ id: aprovacao[1], aprovado });
    recalcular(orcamento.items.filter(item => item.id === aprovacao[1] ? !aprovado : item.declinedAt).map(item => item.id));
    return route.fulfill({ json: orcamento });
  }
  const retrabalho = path.match(/^\/api\/quotes\/q1\/items\/([^/]+)\/retrabalho$/);
  if (retrabalho && method === 'POST') {
    retrabalhos.push({ id: retrabalho[1], ...route.request().postDataJSON() });
    Object.assign(orcamento, { executionStatus: 'REWORK' });
    return route.fulfill({ json: orcamento });
  }
  if (path === '/api/quotes/q1/desenhos-tecnicos') return route.fulfill({ json: { projetos: [] } });
  if (path === '/api/quotes/q1/entregas') return route.fulfill({ json: { canDeliver: false, reason: null, projects: [] } });
  if (path === '/api/workers') return route.fulfill({ json: [] });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const shot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
const bloco = nome => page.locator('.projeto-bloco').filter({ has: page.locator('.projeto-bloco-nome strong', { hasText: new RegExp(`^${nome}$`) }) });
const cabeca = nome => bloco(nome).locator('.projeto-bloco-cabeca');

try {
  await page.goto(base + '/orcamentos/q1');
  await page.getByRole('heading', { name: /ORC-2026-99/ }).waitFor();

  // 1) Projetos em blocos compactos, cada um num tom; fechados (mais de um projeto) e abrem ao clicar.
  await expect(page.locator('.projeto-bloco')).toHaveCount(3);
  assert.deepEqual(await page.locator('.projeto-bloco').evaluateAll(blocos => blocos.map(b => [...b.classList].find(c => c.startsWith('tom-')))), ['tom-1', 'tom-2', 'tom-3']);
  assert.equal(await page.locator('.projeto-bloco.aberto').count(), 0);
  await expect(bloco('Cozinha').locator('.projeto-bloco-valor')).toHaveText('R$ 1.000,00');
  await expect(page.getByRole('group', { name: 'Mostrar projetos' })).toHaveCount(0);
  await shot('01-blocos-fechados');
  await cabeca('Cozinha').click();
  await expect(cabeca('Cozinha')).toHaveAttribute('aria-expanded', 'true');
  await bloco('Cozinha').getByRole('button', { name: 'Exportar Cozinha' }).waitFor();
  await cabeca('Cozinha').click();
  await expect(bloco('Cozinha').locator('.projeto-bloco-corpo')).toHaveCount(0);
  // Dois blocos por linha.
  const [primeiro, segundo, terceiro] = await page.locator('.projeto-bloco').evaluateAll(blocos => blocos.map(b => b.getBoundingClientRect().top));
  assert(Math.abs(primeiro - segundo) < 2 && terceiro > segundo + 20, 'dois por linha: ' + JSON.stringify([primeiro, segundo, terceiro]));
  // "⋯" no bloco fechado: as ações do projeto; "Exportar PDF" abre o bloco com as opções à mostra.
  await bloco('Lavabo').getByRole('button', { name: 'Ações de Lavabo' }).click();
  assert.deepEqual((await page.getByRole('menu', { name: 'Ações de Lavabo' }).getByRole('menuitem').allInnerTexts()).map(texto => texto.trim()), ['Exportar PDF', 'Adicionar desenho técnico']);
  await page.screenshot({ path: resolve(output, '01b-menu-do-projeto.png') });
  await page.getByRole('menuitem', { name: 'Exportar PDF' }).click();
  await expect(cabeca('Lavabo')).toHaveAttribute('aria-expanded', 'true');
  await bloco('Lavabo').getByRole('region', { name: 'Opções do PDF' }).waitFor();
  await page.keyboard.press('Escape');
  await cabeca('Lavabo').click();

  // 2) "Confirmar aprovação": o cliente aprovou só a cozinha e o lavabo.
  await page.getByRole('button', { name: 'Confirmar aprovação' }).click();
  const janela = page.getByRole('dialog', { name: 'Confirmar aprovação' });
  await janela.getByText('O cliente aprovou todos os projetos?').first().waitFor();
  await expect(janela.locator('.aprovacao-valor strong')).toHaveText('R$ 1.900,00');
  await janela.getByText('Não, só alguns').click();
  await janela.getByRole('checkbox', { name: /Banheiro/ }).uncheck();
  await expect(janela.locator('.aprovacao-valor strong')).toHaveText('R$ 1.330,00');
  await expect(janela.getByRole('button', { name: 'Aprovar 2 de 3 projetos' })).toBeEnabled();
  await page.screenshot({ path: resolve(output, '02-janela-aprovacao.png') });
  await janela.getByRole('button', { name: 'Aprovar 2 de 3 projetos' }).click();
  await janela.waitFor({ state: 'detached' });
  assert.deepEqual(situacoes, [{ status: 'APPROVED', projetosNaoAprovados: ['i2'] }]);

  // 3) Aprovados e não aprovados: a situação em cada bloco e, no topo, o filtro.
  await expect(bloco('Banheiro').locator('.projeto-bloco-situacao')).toHaveText('Não aprovado');
  await expect(bloco('Cozinha').locator('.projeto-bloco-situacao')).toHaveText('Aprovado');
  const filtro = page.getByRole('group', { name: 'Mostrar projetos' });
  assert.deepEqual((await filtro.getByRole('button').allInnerTexts()).map(texto => texto.replace(/\s+/g, ' ').trim()), ['Todos 3', 'Aprovados 2', 'Não aprovados 1']);
  await expect(page.locator('.detail-total-fora')).toContainText('1 projeto não aprovado fica fora do valor: R$ 600,00');
  await shot('03-aprovacao-parcial');
  await filtro.getByRole('button', { name: /Não aprovados/ }).click();
  await expect(page.locator('.projeto-bloco')).toHaveCount(1);
  await filtro.getByRole('button', { name: /Aprovados/ }).first().click();
  await expect(page.locator('.projeto-bloco')).toHaveCount(2);
  await filtro.getByRole('button', { name: /Todos/ }).click();

  // 4) O cliente voltou atrás: aprovar o banheiro devolve o valor; o filtro some.
  await cabeca('Banheiro').click();
  await bloco('Banheiro').getByRole('button', { name: 'Aprovar projeto' }).click();
  await page.getByRole('alertdialog', { name: 'Aprovar “Banheiro”?' }).getByRole('button', { name: 'Aprovar projeto' }).click();
  await expect(bloco('Banheiro').locator('.projeto-bloco-situacao')).toHaveText('Aprovado');
  await expect(page.getByRole('group', { name: 'Mostrar projetos' })).toHaveCount(0);
  assert.deepEqual(aprovacoes, [{ id: 'i2', aprovado: true }]);

  // 5) Retrabalho: com o serviço iniciado, cada projeto tem o botão ao lado da situação.
  assert.equal(await page.locator('.projeto-bloco-retrabalho').count(), 0, 'antes de iniciar o serviço, sem retrabalho');
  await page.getByRole('button', { name: 'Iniciar serviço' }).click();
  await expect(page.locator('.projeto-bloco-retrabalho')).toHaveCount(3);
  await page.locator('.projetos-orcamento').screenshot({ path: resolve(output, '05-botao-retrabalho.png') });
  await bloco('Cozinha').getByRole('button', { name: 'Retrabalho' }).click();
  await expect(cabeca('Cozinha')).toHaveAttribute('aria-expanded', 'false');
  const janelaRetrabalho = page.getByRole('dialog', { name: 'Retrabalho' });
  await janelaRetrabalho.getByText('Para onde o projeto volta?').first().waitFor();
  await janelaRetrabalho.getByText('Entrega', { exact: true }).click();
  await janelaRetrabalho.getByLabel('Motivo (opcional)').fill('Peça entregue com medida errada');
  await page.screenshot({ path: resolve(output, '06-janela-retrabalho.png') });
  await janelaRetrabalho.getByRole('button', { name: 'Colocar em retrabalho' }).click();
  await janelaRetrabalho.waitFor({ state: 'detached' });
  assert.deepEqual(retrabalhos, [{ id: 'i1', destino: 'DONE', motivo: 'Peça entregue com medida errada' }]);
  await expect(page.locator('.orcamento-topo-nome')).toContainText('Retrabalho');

  // 6) Celular: blocos inteiros na tela, sem rolagem lateral.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral no celular');
  await page.locator('.projetos-orcamento').screenshot({ path: resolve(output, '04-celular.png') });

  assert.deepEqual(errors, []);
  console.log('OK: projetos em blocos compactos em tons pastel; "Confirmar aprovação" pergunta se todos foram aprovados e marca os não aprovados; filtro de aprovados e não aprovados; aprovar de novo um projeto.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
