import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada: não cria clientes nem orçamentos reais.
const output = resolve(import.meta.dirname, '../../.test-artifacts/novo-projeto');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const customer = { id: 'customer-test', name: 'Cliente de demonstração', phone: '00000000000' };
const catalog = {
  materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }],
  productTypes: [{ id: 'counter', name: 'Bancada' }],
  services: [
    { id: '45', name: 'Acabamento 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70 },
    { id: 'skirt', name: 'Saia', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 0 },
    { id: 'sink', name: 'Recorte de cuba', category: 'Recortes', billingUnit: 'UNIT', currentPrice: 150 },
    { id: 'oval-cut', name: 'Corte de cuba oval', category: 'Recortes', billingUnit: 'UNIT', currentPrice: 150 },
    { id: 'sink-product', name: 'Cuba Grande 56 x 34', category: 'Cubas / Itens', billingUnit: 'UNIT', currentPrice: 350 },
    { id: 'installation', name: 'Instalação', category: 'Serviços', billingUnit: 'FIXED', currentPrice: 100 },
  ],
};
let saved;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-project', name: 'Administrador Inova', role: 'SUPER_ADMIN' } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: catalog });
  if (path === '/api/customers') return route.fulfill({ json: { data: [customer] } });
  if (path === '/api/quotes' && route.request().method() === 'POST') {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { id: 'saved-test' }, status: 201 });
  }
  if (path === '/api/quotes/saved-test/status') return route.fulfill({ json: { status: 'SENT' } });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  errors.push('API não prevista: ' + path);
  return route.fulfill({ status: 404, json: {} });
});
// Todo dado comercial (material, medidas, acabamentos, recortes, valores,
// desconto) é criado no Orçamento Rápido; "Detalhado" só divide as peças já
// orçadas em produção — nunca recalcula nem edita valores.
const step = number => page.locator('.project-step').nth(number - 1).getByRole('button').click();
const screenshot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Orçamento Rápido' }).getAttribute('aria-pressed'), 'true', 'Novo projeto começa no orçamento rápido');
  assert.equal(await page.getByLabel('Orientação', { exact: true }).count(), 0);
  await screenshot('01-inicial');
  await page.getByRole('button', { name: 'Selecionar cliente' }).click();
  await page.locator('.customer-dialog .search').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Bancada da cozinha');
  await page.locator('.material-picker summary').click();
  await page.locator('.material-picker-panel button').click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,50');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('fieldset').filter({ hasText: 'Acabamento 45°' }).getByLabel('Inferior', { exact: true }).check();
  await dialog.locator('fieldset').filter({ hasText: 'Saia' }).getByLabel('Inferior', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByRole('button', { name: 'Detalhar', exact: true }).first().click();
  const saiaEdge = page.locator('.quick-edge').filter({ hasText: 'Saia' });
  await saiaEdge.getByLabel(/Altura do acabamento/).fill('10');
  await screenshot('02-medidas');
  // Valor final por acabamento: uma sobrescrita monetária direta (o mecanismo
  // do Orçamento Rápido), em vez do antigo "comprimento aplicado" do modo
  // Detalhado — o efeito testado é o mesmo: preço independente e reversível.
  const miterEdge = page.locator('.quick-edge').filter({ hasText: 'Acabamento 45°' });
  await miterEdge.getByLabel('Valor final (R$)', { exact: true }).fill('50,00');
  await assertTotalContains('1.100,00');
  await miterEdge.getByLabel('Valor final (R$)', { exact: true }).fill('');
  await assertTotalContains('1.225,00');
  // Recolher/reabrir a peça (equivalente ao antigo "Fechar edição do lado").
  await page.getByRole('button', { name: 'Detalhar', exact: true }).first().click();
  assert.equal(await page.locator('.quick-services').count(), 0, 'Peça recolhida');
  await page.getByRole('button', { name: 'Detalhar', exact: true }).first().click();
  await page.getByRole('button', { name: '+ Recorte / cuba / furo', exact: true }).click();
  const cutout = page.locator('.cutout-row');
  await cutout.getByLabel('Definição das medidas do recorte', { exact: false }).selectOption('DEFINED');
  await cutout.getByLabel('Descrição', { exact: true }).fill('Recorte para cuba de embutir');
  await cutout.getByLabel('Comprimento (cm)', { exact: true }).fill('56');
  await cutout.getByLabel('Largura (cm)', { exact: true }).fill('34');
  await cutout.getByLabel('Serviço de recorte ou cuba').selectOption('sink');
  assert.equal(await cutout.locator('option').filter({ hasText: 'Cuba Grande 56 x 34' }).count(), 0);
  await cutout.getByLabel('Tipo de recorte ou cuba').selectOption({ label: 'Cuba oval' });
  assert.equal(await cutout.getByLabel('Serviço de recorte ou cuba').inputValue(), 'oval-cut');
  await cutout.getByLabel('Tipo de recorte ou cuba').selectOption('OVAL_SINK');
  await page.getByLabel('Observações do orçamento', { exact: true }).fill('Conferir medidas antes de fabricar.');
  await screenshot('03-recortes');
  // Cuba Grande (item, não recorte) e Instalação vivem em "+ Outros serviços",
  // com quantidade por unidade (Instalação é valor fixo, sem quantidade).
  await page.getByRole('button', { name: '+ Outros serviços', exact: true }).click();
  const servicesDialog = page.getByRole('dialog', { name: 'Outros serviços' });
  assert.equal(await servicesDialog.getByText('Corte de cuba oval', { exact: true }).count(), 0);
  const sinkProduct = servicesDialog.locator('.quick-service-choice').filter({ hasText: 'Cuba Grande 56 x 34' });
  await sinkProduct.locator('input[type="checkbox"]').check();
  await assertTotalContains('1.725,00');
  await sinkProduct.locator('input[type="checkbox"]').uncheck();
  await assertTotalContains('1.375,00');
  const installation = servicesDialog.locator('.quick-service-choice').filter({ hasText: 'Instalação' });
  await installation.locator('input[type="checkbox"]').check();
  await assertTotalContains('1.475,00');
  await installation.locator('input[type="checkbox"]').uncheck();
  await servicesDialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByLabel('Desconto geral rápido', { exact: true }).fill('25');
  assert.equal(await page.getByLabel('Desconto geral rápido', { exact: true }).inputValue(), '25');
  await screenshot('04-valores');
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).click();
  await step(3);
  assert.equal(await page.locator('#project-step-3').isVisible(), true);
  assert.equal(await page.locator('ellipse.drawing-cutout').count(), 1);
  assert.match(await page.locator('.manufacturing-description').innerText(), /Saia no lado Inferior/);
  assert.match(await page.locator('.manufacturing-description').innerText(), /56 × 34 cm/);
  await screenshot('05-desenho');
  await step(1);
  const root = page.locator('.component-editor > .component-card').first();
  assert.equal(await root.getByLabel('Comprimento (cm)', { exact: true }).inputValue(), '250');
  await page.getByRole('button', { name: 'Ver tudo', exact: true }).click();
  for (const number of [1, 2, 3]) assert.equal(await page.locator('#project-step-' + number).isVisible(), true);
  await page.getByRole('button', { name: 'Ver por etapas', exact: true }).click();
  for (const width of [1920, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const stage of [1, 2, 3]) {
      await step(stage);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sem overflow: ' + width + ', etapa ' + stage);
    }
    await screenshot('06-responsivo-' + width);
    await step(1);
    const inferiorButton = root.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true });
    // "Inferior" já abre sozinho, pois é o primeiro lado com acabamento
    // (ComponentEdgeMap inicializa "active" com o lado do primeiro edge).
    if ((await inferiorButton.getAttribute('aria-expanded')) !== 'true') await inferiorButton.click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Acabamentos sem overflow em ' + width);
    await root.locator('.component-edge-layout').screenshot({ path: resolve(output, 'acabamentos-' + width + '.png') });
    await root.getByRole('button', { name: 'Fechar edição do lado', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Orçamento Rápido', exact: true }).click();
  await page.reload();
  await page.locator('#project-name').waitFor();
  await page.getByRole('button', { name: 'Detalhar', exact: true }).first().click();
  assert.equal(await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).inputValue(), '2,5');
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.locator('#project-name').fill('Segundo projeto');
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  assert.equal(saved, undefined, 'Não envia orçamento com projeto incompleto');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('#project-name').inputValue(), 'Segundo projeto');
  await page.getByLabel('Projeto em edição', { exact: true }).selectOption('0');
  assert.equal(await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).inputValue(), '2,5');
  await page.getByLabel('Projeto em edição', { exact: true }).selectOption('1');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Excluir Segundo projeto', exact: true }).click();
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await page.waitForURL('**/orcamentos');
  assert.equal(saved.items[0].components[0].edges.length, 2);
  assert.equal(saved.items[0].components[0].orientation, 'HORIZONTAL', 'Orientação interna preservada');
  assert.equal(saved.items[0].cutouts.length, 1);
  assert.equal(saved.items[0].cutouts[0].componentIndex, 0);
  assert.equal(saved.items[0].cutouts[0].cutoutType, 'OVAL_SINK');
  assert.equal(saved.discountAmount, 25);
  assert.equal(saved.notes, 'Conferir medidas antes de fabricar.');
  assert.deepEqual(errors, []);
  console.log('OK: Orçamento Rápido, acabamentos, valores independentes, recolher peça, recorte, outros serviços, desconto, desenho, Ver tudo, rascunho, salvamento e 4 larguras sem overflow e sem campo Orientação. Nenhuma API real chamada.');
} finally {
  await browser.close();
}

async function assertTotalContains(text) {
  const total = await page.locator('.quote-summary-card .summary-grand-total').innerText();
  assert(total.includes(text), `Esperava "${text}" em "${total}"`);
}
