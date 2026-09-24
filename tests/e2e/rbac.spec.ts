import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
}
test('super cadastra vendedor; vendedor vê só sua carteira e acompanha a entrega', async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await login(page, 'admin@inovamarmoraria.local', process.env.INOVA_E2E_PASSWORD!);
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Usuários e vendedores' }).click();
  const email = `e2e-vendedor-${Date.now()}@example.test`;
  await page.getByLabel('Nome', { exact: true }).fill('Vendedor navegador');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('BrowserRbac@2026');
  await page.getByRole('button', { name: 'Salvar usuário', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Usuário salvo');
  const token = await page.evaluate(() => localStorage.getItem('inova_access_token'));
  const adminHeaders = { authorization: `Bearer ${token}` };
  const privateClient = await page.request.post('/api/customers', { headers: adminHeaders, data: { name: 'Cliente reservado administrador', phone: `119${String(Date.now()).slice(-8)}` } });
  expect(privateClient.status()).toBe(201);
  const context = await browser.newContext({ baseURL: process.env.INOVA_E2E_URL });
  const sellerPage = await context.newPage();
  try {
    await login(sellerPage, email, 'BrowserRbac@2026');
    const nav = sellerPage.getByRole('navigation', { name: 'Menu principal' });
    for (const label of ['Dashboard', 'Usuários e vendedores', 'Materiais e serviços', 'Funcionários']) await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    await sellerPage.goto('/dashboard');
    await expect(sellerPage.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    await sellerPage.goto('/clientes');
    await expect(sellerPage.getByText('Nenhum cliente encontrado.')).toBeVisible();
    await sellerPage.getByRole('button', { name: '+ Novo cliente' }).click();
    await sellerPage.getByPlaceholder('Nome', { exact: true }).fill('Cliente do vendedor navegador');
    await sellerPage.getByPlaceholder('Telefone', { exact: true }).fill(`219${String(Date.now()).slice(-8)}`);
    const createdPromise = sellerPage.waitForResponse(response => response.url().endsWith('/api/customers') && response.request().method() === 'POST');
    await sellerPage.getByRole('button', { name: 'Salvar', exact: true }).click();
    const created = await createdPromise; expect(created.status()).toBe(201);
    const customer = await created.json();
    await expect(sellerPage.getByText('Cliente reservado administrador', { exact: true })).toHaveCount(0);
    await expect(sellerPage.getByRole('link', { name: 'Cliente do vendedor navegador', exact: true })).toBeVisible();
    const sellerToken = await sellerPage.evaluate(() => localStorage.getItem('inova_access_token'));
    const sellerHeaders = { authorization: `Bearer ${sellerToken}` };
    const catalog = await (await sellerPage.request.get('/api/catalog', { headers: sellerHeaders })).json();
    const quoteResponse = await sellerPage.request.post('/api/quotes', { headers: sellerHeaders, data: { customerId: customer.id, items: [{ projectName: 'Projeto do vendedor', productTypeId: catalog.productTypes[0].id, materialId: catalog.materials[0].id, components: [{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1500, widthMm: 600, quantity: 1 }] }] } });
    expect(quoteResponse.status()).toBe(201);
    const quote = await quoteResponse.json();
    await sellerPage.goto(`/orcamentos/${quote.id}`);
    await expect(sellerPage.getByRole('button', { name: 'Desenho técnico', exact: true })).toHaveCount(0);
    await sellerPage.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
    await expect(sellerPage.getByRole('button', { name: 'Iniciar serviço', exact: true })).toBeVisible();
    await sellerPage.getByRole('button', { name: 'Iniciar serviço', exact: true }).click();
    await expect(sellerPage.locator('.quote-workbench-general select')).toHaveValue('IN_PRODUCTION');
    await sellerPage.locator('.quote-workbench-general select').selectOption('DELIVERED');
    await expect(sellerPage.locator('.quote-workbench-general select')).toHaveValue('DELIVERED');
    await sellerPage.goto('/historico');
    await expect(sellerPage.getByText(quote.number, { exact: false }).first()).toBeVisible();
    await sellerPage.screenshot({ path: testInfo.outputPath('vendedor-historico.png'), fullPage: true });

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vendedor navegador', exact: true })).toBeVisible();
    const row = page.locator('tr').filter({ has: page.getByRole('link', { name: 'Vendedor navegador', exact: true }) });
    await expect(row.locator('td').nth(2)).toHaveText('1');
    await expect(row.locator('td').nth(4)).toHaveText('1');
    await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Vendedor navegador', exact: true }).click();
    await expect(page.getByText(quote.number, { exact: false }).first()).toBeVisible();
    await expect(page).toHaveURL(/sellerId=/);
  } finally { await context.close(); }
});
