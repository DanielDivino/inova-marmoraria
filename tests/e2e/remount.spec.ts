import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

async function api(page: Page, method: string, path: string, data?: unknown) {
  const token = await page.evaluate(() => localStorage.getItem('inova_access_token'));
  return page.request.fetch(`/api${path}`, { method, headers: { authorization: `Bearer ${token}` }, data });
}

test('remontagem: serviços, materiais, pagamento, persistência e documentos em desktop e celular', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.INOVA_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#project-name')).toBeVisible();
  const catalog = await (await api(page, 'GET', '/catalog')).json();
  const customer = await (await api(page, 'POST', '/customers', { name: `Entrega remontagem ${Date.now()}`, phone: '92988775511' })).json();
  const created = await api(page, 'POST', '/quotes', { customerId: customer.id, notes: 'Projeto original preservado.', items: [{
    productTypeId: catalog.productTypes[0].id, materialId: catalog.materials.find((m: any) => m.name === 'Verde Ubatuba').id,
    components: [{ componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1 }],
  }] });
  expect(created.status()).toBe(201);
  const original = await created.json();
  await page.goto(`/orcamentos/${original.id}`);
  await page.getByRole('link', { name: 'Desmontagem / Remontagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Desmontagem e Remontagem', exact: true })).toBeVisible();
  await expect(page.getByText('Observações do projeto: Projeto original preservado.')).toBeVisible();
  const summary = page.locator('.quote-summary-card');
  const card = summary.locator('.summary-grand-total').filter({ hasText: 'Cartão' });
  const pix = summary.locator('.summary-grand-total').filter({ hasText: 'Pix' });
  await expect(card).toContainText('600,00');
  await expect(pix).toContainText('570,00');
  const assembly = page.getByLabel('Montagem (R$)', { exact: true });
  await assembly.fill('250');
  await expect(page.getByText('Desconto: R$ 50,00', { exact: true })).toBeVisible();
  await assembly.fill('450');
  await expect(card).toContainText('750,00');
  await expect(page.getByText(/Desconto: R\$/)).toHaveCount(0);
  await expect(page.getByText(/Acréscimo/)).toHaveCount(0);
  await page.getByLabel('Valor no cartão', { exact: false }).fill('5.000,00');
  await expect(pix).toContainText('4.750,00');
  await page.getByLabel('Desconto à vista', { exact: true }).selectOption('10');
  await expect(pix).toContainText('4.500,00');
  await page.getByLabel('Desconto à vista', { exact: true }).selectOption('5');
  await page.getByLabel('Valor no cartão', { exact: false }).fill('5.500,00');
  await expect(pix).toContainText('5.225,00');
  await page.locator('.material-picker summary').click();
  await page.getByLabel('Buscar material', { exact: true }).fill('Verde Ubatuba');
  await page.locator('.material-picker-panel button.material').filter({ hasText: 'Verde Ubatuba' }).click();
  await page.getByLabel('Tipo da peça 1', { exact: true }).selectOption('__ADD_DESCRIPTION__');
  await page.getByLabel('Novo tipo / descrição', { exact: true }).fill('Bancada de reposição');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,15');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByLabel('Quantidade da peça 1', { exact: true }).fill('2');
  await page.getByLabel('Observação da peça', { exact: true }).fill('Conferir acabamento.');
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('BACKSPLASH');
  await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).fill('1,15');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,10');
  await page.getByLabel('Observações da proposta e entrega', { exact: true }).fill('Entregar na cozinha.');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Remontagem salva.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Comprimento da peça 1 (m)', { exact: true })).toHaveValue('1,15');
  await expect(page.getByLabel('Quantidade da peça 1', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Observação da peça', { exact: true }).first()).toHaveValue('Conferir acabamento.');
  await expect(pix).toContainText('5.225,00');
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.test-artifacts/remontagem/tela-${width}.png`, fullPage: true });
  }
  for (const [detailed, suffix] of [[true, 'pdf?individualPrices=true'], [false, 'pdf?individualPrices=false'], [false, 'delivery-pdf']] as const) {
    const response = await api(page, 'GET', `/quotes/${original.id}/remontagem/${suffix}`);
    expect(response.status()).toBe(200);
    const text = execFileSync('pdftotext', ['-', '-'], { input: await response.body(), encoding: 'utf8' });
    expect(text).toContain('Bancada de reposição'); expect(text).toContain('Rodabanca'); expect(text).toContain('1,15');
    if (suffix === 'delivery-pdf') {
      expect(text).not.toContain('R$'); expect(text).not.toContain('5.500');
      expect(text).toContain('Conferido'); expect(text).toContain('Assinatura do cliente/recebedor:');
    } else {
      expect(text).toContain('5.500,00'); expect(text).toContain('5.225,00');
      expect(text.includes('828,00')).toBe(detailed);
    }
  }
  // O botão usa o mesmo fluxo de salvar e abrir/baixar PDF do sistema.
  const pdfResponse = page.waitForResponse(response => response.url().includes('/remontagem/delivery-pdf') && response.status() === 200);
  await page.getByRole('button', { name: 'Nota de Entrega', exact: true }).click();
  await pdfResponse;
  expect(await (await api(page, 'GET', `/quotes/${original.id}`)).json()).toEqual(original);
});
