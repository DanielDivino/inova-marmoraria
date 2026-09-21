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
const step = number => page.locator('.project-step').nth(number - 1).getByRole('button').click();
const screenshot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('#project-step-4').isVisible(), false);
  await screenshot('01-inicial');
  await page.locator('.customer-section .search').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Bancada da cozinha');
  await page.locator('.material-picker summary').click();
  await page.locator('.material-picker-panel button').click();
  await page.locator('.environment-picker summary').click();
  await page.locator('.environment-picker-panel button').filter({ hasText: /^Cozinha$/ }).click();
  const component = page.locator('.component-card').first();
  assert.equal(await component.getByLabel('Orientação', { exact: true }).count(), 0);
  await component.locator('.component-fields').first().getByLabel('Comprimento (cm)', { exact: true }).fill('250');
  await component.getByLabel('Largura / altura (cm)', { exact: true }).fill('60');
  await component.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).click();
  const edge = component.getByRole('combobox', { name: 'Adicionar acabamento — Inferior', exact: true });
  await edge.selectOption({ label: 'Acabamento 45°' });
  await edge.selectOption({ label: 'Saia' });
  await component.getByLabel('Altura da saia (cm)', { exact: true }).fill('10');
  const finish = component.locator('.edge-finish').first();
  await finish.locator('.edge-length-editor summary').click();
  assert.equal(await finish.locator('small').count(), 0, 'Sem regras de cálculo no acabamento');
  assert((await finish.getByLabel('Comprimento aplicado (cm)', { exact: true }).boundingBox()).width <= 80, 'Comprimento compacto');
  await finish.getByLabel('Comprimento aplicado (cm)', { exact: true }).fill('200');
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.190,00/);
  await finish.getByLabel('Comprimento aplicado (cm)', { exact: true }).fill('');
  await screenshot('02-acabamentos-compactos');
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.225,00/);
  await component.getByRole('button', { name: 'Fechar edição do lado', exact: true }).click();
  await screenshot('02-medidas');
  await component.locator('.component-card-title').click();
  assert.equal(await component.locator('.component-fields').first().getByLabel('Comprimento (cm)', { exact: true }).isVisible(), false);
  await component.locator('.component-card-title').click();
  await component.getByRole('button', { name: '+ Adicionar recorte/cuba', exact: true }).click();
  assert.equal(await page.locator('#project-step-4').isVisible(), false);
  assert.equal(await page.locator('#project-step-3').isVisible(), true);
  const cutout = component.locator('.cutout-row');
  await cutout.getByLabel('Descrição', { exact: true }).fill('Recorte para cuba de embutir');
  await cutout.getByLabel('Comprimento (cm)', { exact: true }).fill('56');
  await cutout.getByLabel('Largura (cm)', { exact: true }).fill('34');
  await cutout.getByLabel('Serviço de recorte ou cuba').selectOption('sink');
  assert.equal(await cutout.locator('option').filter({ hasText: 'Cuba Grande 56 x 34' }).count(), 0);
  await cutout.getByLabel('Tipo de recorte ou cuba').selectOption({ label: 'Cuba oval' });
  assert.equal(await cutout.getByLabel('Serviço de recorte ou cuba').inputValue(), 'oval-cut');
  assert.equal(await component.locator('.map-stone ellipse').count(), 1);
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.375,00/);
  await cutout.getByLabel('Tipo de recorte ou cuba').selectOption('SINK');
  assert.equal(await component.locator('.map-stone ellipse').count(), 0);
  assert.equal(await cutout.getByLabel('Serviço de recorte ou cuba').inputValue(), 'sink');
  await cutout.getByLabel('Tipo de recorte ou cuba').selectOption('OVAL_SINK');
  await page.getByLabel('Observações do orçamento', { exact: true }).fill('Conferir medidas antes de fabricar.');
  await screenshot('03-recortes');
  await page.getByRole('button', { name: 'Revisar valores e serviços' }).click();
  assert.equal(await page.locator('#project-step-4').isVisible(), true);
  assert.equal(await page.locator('.general-services-menu').isVisible(), true);
  assert.equal(await page.locator('.general-services-menu').getByText('Corte de cuba oval', { exact: true }).count(), 0);
  const sinkProduct = page.locator('.general-services-menu .service-main').filter({ hasText: 'Cuba Grande 56 x 34' });
  await sinkProduct.click();
  await page.getByLabel('Quantidade — Cuba Grande 56 x 34', { exact: true }).fill('1');
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.725,00/);
  await sinkProduct.click();
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.375,00/);
  const installation = page.locator('.general-services-menu .service-main').filter({ hasText: 'Instalação' });
  await installation.click();
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.475,00/);
  await installation.click();
  await page.getByLabel('Desconto autorizado', { exact: true }).fill('25');
  assert.match(await page.locator('.summary-grand-total').innerText(), /1\.350,00/);
  await screenshot('04-valores');
  await page.getByRole('button', { name: 'Conferir desenho técnico' }).click();
  assert.equal(await page.locator('#project-step-5').isVisible(), true);
  assert.equal(await page.locator('ellipse.drawing-cutout').count(), 1);
  assert.match(await page.locator('.manufacturing-description').innerText(), /Saia no lado Inferior/);
  assert.match(await page.locator('.manufacturing-description').innerText(), /56 × 34 cm/);
  await screenshot('05-desenho');
  await step(3);
  assert.equal(await component.locator('.component-fields').first().getByLabel('Comprimento (cm)', { exact: true }).inputValue(), '250');
  await page.getByRole('button', { name: 'Ver tudo', exact: true }).click();
  for (const number of [1, 2, 3, 4, 5]) assert.equal(await page.locator('#project-step-' + number).isVisible(), true);
  await page.getByRole('button', { name: 'Ver por etapas', exact: true }).click();
  for (const width of [1920, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const stage of [3, 4, 5]) {
      await step(stage);
      if (stage === 3) {
        const boxes = await Promise.all([1, 2, 3].map(number => page.locator('#project-step-' + number).boundingBox()));
        const [client, project, measures] = boxes;
        if (width >= 1100) {
          const summary = await page.locator('.quote-summary-card').boundingBox();
          assert(Math.abs(summary.x - measures.x - measures.width - (width === 1100 ? 12 : 18)) <= 2, 'Resumo sem espaço vazio em ' + width);
          if (width === 1920) assert(summary.width > 300, 'Resumo ampliado');
        }
        assert(Math.abs(client.x - measures.x) <= 1, 'Cliente alinhado aos componentes em ' + width);
        assert(Math.abs(project.x + project.width - measures.x - measures.width) <= 1, 'Projeto alinhado ao limite dos componentes em ' + width);
        if (measures.width > 680) {
          assert(Math.abs(client.y - project.y) <= 1, 'Cliente e Projeto lado a lado em ' + width);
          assert(project.x > client.x + client.width, 'Colunas sem sobreposição em ' + width);
        } else {
          assert(project.y > client.y, 'Empilhados em telas pequenas');
          assert(Math.abs(client.width - measures.width) <= 1, 'Largura completa no celular');
        }
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sem overflow: ' + width + ', etapa ' + stage);
    }
    await screenshot('06-responsivo-' + width);
    await step(3);
    await component.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Acabamentos sem overflow em ' + width);
    await component.locator('.component-edge-layout').screenshot({ path: resolve(output, 'acabamentos-' + width + '.png') });
    await component.getByRole('button', { name: 'Fechar edição do lado', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await step(3);
  await page.reload();
  await page.locator('#project-name').waitFor();
  assert.equal(await component.locator('.component-fields').first().getByLabel('Comprimento (cm)', { exact: true }).inputValue(), '250');
  await page.getByRole('button', { name: '+ Adicionar outro projeto', exact: true }).click();
  await page.locator('#project-name').fill('Segundo projeto');
  await step(5);
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  assert.equal(saved, undefined, 'Não envia orçamento com projeto incompleto');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('#project-name').inputValue(), 'Segundo projeto');
  assert.equal(await page.locator('#project-step-2').isVisible(), true);
  await page.getByLabel('Projeto em edição', { exact: true }).selectOption('0');
  assert.equal(await component.locator('.component-fields').first().getByLabel('Comprimento (cm)', { exact: true }).inputValue(), '250');
  await page.getByLabel('Projeto em edição', { exact: true }).selectOption('1');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Excluir este projeto', exact: true }).click();
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
  console.log('OK: etapas, recolher componente, preços independentes, recorte, desconto, desenho, Ver tudo, rascunho, salvamento e 5 larguras com blocos alinhados e sem campo Orientação. Nenhuma API real chamada.');
} finally {
  await browser.close();
}
