import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { orcamentoSalvo } from './apoio/orcamento-salvo.mjs';

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
  // Projetos com desenho técnico (Exportar do orçamento): nenhum.
  if (/^\/api\/quotes\/[^/]+\/desenhos-tecnicos$/.test(path)) return route.fulfill({ json: { projetos: [] } });
  // Rascunho do Novo orçamento no servidor (vazio: vale o deste navegador).
  if (path === '/api/quote-draft') return route.fulfill({ json: route.request().method() === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: catalog });
  if (path === '/api/customers') return route.fulfill({ json: { data: [customer] } });
  if (path === '/api/quotes' && route.request().method() === 'POST') {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { id: 'saved-test' }, status: 201 });
  }
  if (path === '/api/quotes/saved-test/status') return route.fulfill({ json: { status: 'SENT' } });
  // Depois de salvar abre a tela do orçamento salvo.
  if (path === '/api/quotes/saved-test' && route.request().method() === 'GET') return route.fulfill({ json: orcamentoSalvo('saved-test') });
  if (path === '/api/workers') return route.fulfill({ json: [] });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  errors.push('API não prevista: ' + path);
  return route.fulfill({ status: 404, json: {} });
});
// Todo dado comercial (material, medidas, acabamentos, recortes, valores,
// desconto) é criado no Orçamento Rápido; "Detalhado" só divide as peças já
// orçadas em produção — nunca recalcula nem edita valores.
const step = number => page.locator('.project-step').nth(number - 1).getByRole('button').click();
// Barra do atendimento: menus "Cliente ▾" e "Projeto ▾" (substituíram as abas).
const selecionarCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click(); };
const menuProjeto = async () => { await page.getByRole('button', { name: /^Projeto:/ }).click(); await expect(page.getByRole('menu')).toBeVisible(); };
const escolherProjeto = async name => { await menuProjeto(); await page.getByRole('menu').getByRole('menuitemradio', { name, exact: true }).click(); };
const contarProjetos = async () => { await menuProjeto(); const total = await page.getByRole('menu').getByRole('menuitemradio').count(); await page.keyboard.press('Escape'); return total; };
const excluirProjeto = async name => { await escolherProjeto(name); await menuProjeto(); await page.getByRole('menu').getByRole('menuitem', { name: `Excluir ${name}`, exact: true }).click(); };
const screenshot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Orçamento Rápido' }).getAttribute('aria-pressed'), 'true', 'Novo projeto começa no orçamento rápido');
  assert.equal(await page.getByLabel('Orientação', { exact: true }).count(), 0);
  await screenshot('01-inicial');
  await selecionarCliente();
  await page.locator('.customer-dialog .search').fill('Cliente');
  await page.locator('.customer-result').click();
  await page.locator('#project-name').fill('Bancada da cozinha');
  // Pedra do projeto (cada peça também tem o seu seletor, nas opções).
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-picker-panel button').click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,50');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Acabamentos da peça' });
  await dialog.locator('fieldset').filter({ hasText: 'Acabamento 45°' }).getByLabel('Inferior', { exact: true }).check();
  // Saia não é acabamento: fica no Tipo/descrição, cobrada pela área como as outras peças.
  assert.equal(await dialog.locator('fieldset').filter({ hasText: 'Saia' }).count(), 0, 'Saia saiu dos acabamentos');
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 2', { exact: true }).focus();
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('SKIRT');
  await page.getByLabel('Peça onde fica a saia 2', { exact: true }).selectOption({ label: 'Peça 1 · Tampo' });
  assert.equal(await page.getByLabel('Lado da saia 2', { exact: true }).inputValue(), 'FRONT');
  // Presa ao lado Inferior, a saia pega o comprimento dele (2,50 m); a altura vai na largura.
  assert.equal(await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).inputValue(), '2,50');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,10');
  const opcoes = page.locator('[data-quick-row]').first().locator('.quick-options-button:visible').first();
  await opcoes.click();
  const painel = page.locator('#' + await opcoes.getAttribute('aria-controls'));
  await screenshot('02-medidas');
  // 2,50 × 0,60 m (R$ 900) + 45° em 2,50 m (R$ 175) + saia de 10 cm (R$ 150).
  await assertTotalContains('1.225,00');
  // Recolher/reabrir as opções da peça.
  await opcoes.click();
  assert.equal(await painel.isVisible(), false, 'Opções recolhidas');
  // Cortes e furos entram como serviços do projeto (quantidade por unidade).
  await page.getByRole('button', { name: '+ Cortes e furos', exact: true }).click();
  const cortes = page.getByRole('dialog', { name: 'Cortes e furos' });
  assert.equal(await cortes.getByText('Cuba Grande 56 x 34', { exact: true }).count(), 0, 'A cuba (item) fica em Outros serviços');
  await cortes.locator('.quick-service-choice').filter({ hasText: 'Corte de cuba oval' }).locator('input[type="checkbox"]').check();
  await cortes.getByRole('button', { name: 'Concluir', exact: true }).click();
  await assertTotalContains('1.375,00');
  for (const campo of ['Validade do orçamento', 'Observações do orçamento', 'Valores no PDF']) assert.equal(await page.getByLabel(campo, { exact: true }).count(), 0, `${campo} saiu do resumo`);
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
  // Com desenho: o recorte de produção (cuba oval 56 × 34 cm) é definido na própria peça.
  await page.locator('button[aria-label^="Orçamento com Desenho"]').click();
  const root = page.locator('.component-editor > .component-card').first();
  await root.getByRole('button', { name: '+ Recorte / cuba', exact: true }).click();
  await root.getByLabel('Tipo do recorte 1', { exact: true }).selectOption('OVAL_SINK');
  await root.getByLabel('Medidas do recorte 1', { exact: true }).selectOption('DEFINED');
  await root.getByLabel('Comprimento do recorte 1 (cm)', { exact: true }).fill('56');
  await root.getByLabel('Largura do recorte 1 (cm)', { exact: true }).fill('34');
  await assertTotalContains('1.375,00');
  await step(2);
  assert.equal(await page.locator('#project-step-2').isVisible(), true);
  assert.equal(await page.locator('ellipse.drawing-cutout').count(), 1);
  assert.match(await page.locator('.manufacturing-description').innerText(), /Adicional de 1\. Tampo · lado Inferior/);
  assert.match(await page.locator('.manufacturing-description').innerText(), /56 × 34 cm/);
  await screenshot('05-desenho');
  await step(1);
  assert.equal(await root.getByLabel('Comprimento (m)', { exact: true }).first().inputValue(), '2,50');
  await page.getByRole('button', { name: 'Ver tudo', exact: true }).click();
  for (const number of [1, 2]) assert.equal(await page.locator('#project-step-' + number).isVisible(), true);
  await page.getByRole('button', { name: 'Ver por etapas', exact: true }).click();
  for (const width of [1920, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const stage of [1, 2]) {
      await step(stage);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sem overflow: ' + width + ', etapa ' + stage);
    }
    await screenshot('06-responsivo-' + width);
    await step(1);
    const inferiorButton = root.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).first();
    if ((await inferiorButton.getAttribute('aria-expanded')) !== 'true') await inferiorButton.click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Acabamentos sem overflow em ' + width);
    await root.locator('.component-edge-layout').first().screenshot({ path: resolve(output, 'acabamentos-' + width + '.png') });
    await root.getByRole('button', { name: 'Fechar edição do lado', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Orçamento Rápido', exact: true }).click();
  await page.reload();
  await page.locator('#project-name').waitFor();
  assert.equal(await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).inputValue(), '2,50');
  await page.getByRole('button', { name: 'Adicionar projeto', exact: true }).click();
  await page.locator('#project-name').fill('Segundo projeto');
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  assert.equal(saved, undefined, 'Não envia orçamento com projeto incompleto');
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('#project-name').inputValue(), 'Segundo projeto');
  await escolherProjeto('Bancada da cozinha');
  assert.equal(await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).inputValue(), '2,50');
  await escolherProjeto('Segundo projeto');
  await excluirProjeto('Segundo projeto');
  await page.getByRole('alertdialog', { name: 'Excluir Segundo projeto?' }).getByRole('button', { name: 'Excluir projeto', exact: true }).click();
  await page.locator('.quote-summary-actions').getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await page.waitForURL('**/orcamentos/saved-test');
  assert.equal(saved.items[0].components[0].edges.length, 1, 'Só o 45° é acabamento');
  assert.deepEqual([saved.items[0].components[1].componentType, saved.items[0].components[1].lengthMm, saved.items[0].components[1].widthMm], ['SKIRT', 2500, 100], 'Saia salva como peça');
  assert.deepEqual(saved.items[0].drawingData.componentDetails[1], { parentComponentIndex: 0, parentSide: 'FRONT' }, 'Saia presa ao lado Inferior');
  assert.equal(saved.items[0].components[0].orientation, 'HORIZONTAL', 'Orientação interna preservada');
  assert(saved.items[0].services.some((servico) => servico.serviceId === 'oval-cut'), 'Corte de cuba oval salvo como serviço do projeto');
  const recorte = saved.items[0].drawingData.productionPlan.cutouts[0];
  assert.deepEqual([recorte.cutoutType, recorte.lengthMm, recorte.widthMm], ['OVAL_SINK', 560, 340], 'Recorte de produção salvo no plano');
  assert.equal(saved.discountAmount, 25);
  assert.equal(saved.notes, undefined, 'observações se editam na tela do orçamento');
  assert.equal(saved.validUntil, undefined, 'validade calculada no servidor');
  assert.deepEqual(errors, []);
  console.log('OK: Orçamento Rápido, acabamentos, saia no Tipo/descrição presa ao lado, opções da peça, cortes e furos, outros serviços, desconto, recorte de produção no desenho, Ver tudo, rascunho, salvamento e 4 larguras sem overflow e sem campo Orientação. Nenhuma API real chamada.');
} finally {
  await browser.close();
}

async function assertTotalContains(text) {
  const total = await page.locator('.quote-summary-card .summary-grand-total').innerText();
  assert(total.includes(text), `Esperava "${text}" em "${total}"`);
}
