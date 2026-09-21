import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.INOVA_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#project-name')).toBeVisible();
  await page.getByRole('button', { name: 'Orçamento com Desenho / Detalhado', exact: true }).click();
}
async function api(page: Page, method: string, path: string, data?: unknown) {
  const token = await page.evaluate(() => localStorage.getItem('inova_access_token'));
  return page.request.fetch(`/api${path}`, { method, headers: { authorization: `Bearer ${token}` }, data });
}
async function client(page: Page, name: string) {
  const result = await api(page, 'POST', '/customers', { name, phone: `929${String(Date.now()).slice(-8)}` });
  expect(result.status()).toBe(201); return result.json();
}
async function configure(page: Page, name: string) {
  const customer = await client(page, name);
  await page.getByRole('button', { name: 'Selecionar cliente', exact: true }).click();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill(name);
  await page.locator('.customer-result').filter({ hasText: name }).click();
  await page.locator('#project-name').fill(name);
  await page.locator('.material-picker summary').click();
  await page.locator('.material-search-inline').fill('Verde Ubatuba');
  await page.locator('.material-picker-panel button.material').filter({ hasText: 'Verde Ubatuba' }).click();
  const component = page.locator('.component-card').first();
  await component.getByLabel('Comprimento (cm)', { exact: true }).fill('200');
  await component.getByLabel('Largura / altura (cm)', { exact: true }).fill('60');
  await page.getByLabel('Validade do orçamento', { exact: true }).fill('2026-12-20');
  return customer;
}
async function save(page: Page) {
  const concluir = page.getByRole('button', { name: 'Concluir detalhamento', exact: true });
  if (await concluir.isVisible()) await concluir.click();
  const response = page.waitForResponse((response) => response.url().endsWith('/api/quotes') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click();
  const result = await response; expect(result.status(), await result.text()).toBe(201);
  await expect(page).toHaveURL(/\/orcamentos$/);
  return result.json();
}
async function openQuote(page: Page, id: string) { await page.goto(`/orcamentos/${id}`); await expect(page.getByRole('link', { name: 'Editar orçamento', exact: true })).toBeVisible(); }
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replaceAll('\u00a0', ' ');
async function expectTotal(page: Page, value: number) {
  const row = page.locator('.quote-summary-card .summary-grand-total');
  const desconto = page.locator('.discount input');
  if (await desconto.count()) value += Number((await desconto.inputValue()).replace(',', '.')) || 0;
  await expect.poll(async () => (await row.innerText()).replaceAll('\u00a0', ' ')).toContain(money(value));
}
test.beforeEach(async ({ page }) => {
  // Estes cenários de cálculo/edição usam o modo expandido; a navegação por
  // etapas é exercitada separadamente em tests/visual/novo-projeto.mjs.
  await page.addLocatorHandler(page.getByRole('button', { name: 'Ver tudo', exact: true }), async button => { await button.click(); });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  (page as Page & { applicationErrors?: string[] }).applicationErrors = errors;
});
test.afterEach(async ({ page }) => expect((page as Page & { applicationErrors?: string[] }).applicationErrors).toEqual([]));

test('login inválido, login real, menus e saída', async ({ page }) => {
  await page.goto('/orcamentos'); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaIncorreta');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.login-card .form-error')).toContainText('E-mail ou senha inválidos');
  await login(page);
  for (const [label, path] of [['Mostruário', '/mostruario'], ['Clientes', '/clientes'], ['Orçamentos', '/orcamentos'], ['Histórico', '/historico'], ['Materiais e serviços', '/administracao']]) {
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('main')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Sair', exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('inova_access_token'))).toBeNull();
  expect((await page.request.post('/api/auth/refresh')).status()).toBe(401);
});

test('cadastro rápido, validação do orçamento e edição do cliente', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click();
  await expect(page.locator('.form-error')).toContainText('Selecione o cliente');
  await page.getByRole('dialog').getByRole('button', { name: 'Novo cliente', exact: true }).click();
  const form = page.locator('.customer-form');
  const name = `Cliente rápido ${Date.now()}`;
  await form.getByPlaceholder('Nome', { exact: true }).fill(name);
  await form.getByPlaceholder('Telefone', { exact: true }).fill('(92) 98800-2200');
  await form.getByRole('button', { name: 'Salvar e selecionar cliente' }).click();
  await expect(page.locator('.compact-customer')).toContainText(name);
  const result = await api(page, 'GET', `/customers?search=${encodeURIComponent(name)}`); expect((await result.json()).data).toHaveLength(1);
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByPlaceholder('Nome', { exact: true }).fill(`${name} atualizado`);
  await form.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.compact-customer')).toContainText(`${name} atualizado`);
});

test('valor da tela corresponde ao salvo com desconto de acabamento; desenhos e PDF', async ({ page }) => {
  await login(page); const name = `Acabamento ${Date.now()}`; await configure(page, name);
  const component = page.locator('.component-card').first();
  await component.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).click();
  await component.getByRole('combobox', { name: 'Adicionar acabamento — Inferior', exact: true }).selectOption({ label: 'Acabamento Meia Cana' });
  await expectTotal(page, 780);
  const edgeValue = page.locator('.quote-value-row').filter({ hasText: 'Acabamento Meia Cana' }).locator('input');
  await edgeValue.fill('20,00');
  await expectTotal(page, 740);
  await page.locator('.discount input').fill('10');
  await expectTotal(page, 730);
  const saved = await save(page);
  const record = await (await api(page, 'GET', `/quotes/${saved.id}`)).json();
  expect(record.netTotal).toBe(730); expect(record.status).toBe('SENT');
  await page.getByRole('searchbox').count();
  await page.getByRole('textbox', { name: 'Buscar orçamentos' }).fill(saved.number);
  await expect(page.locator('.saved-quote-card').filter({ hasText: saved.number }).locator('.technical-drawing')).toBeVisible();
  await openQuote(page, saved.id);
  await expect(page.locator('.technical-drawing')).toBeVisible();
  const discounts = page.locator('.detail-total');
  await expect(discounts.locator('span').filter({ hasText: /^Desconto total dado$/ }).locator('+ strong')).toContainText('50,00');
  const pdf = await api(page, 'GET', `/quotes/${saved.id}/pdf`); expect(pdf.status()).toBe(200); expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
});

test('45 graus e saia coexistem com preços independentes e descrição completa ao reabrir', async ({ page }) => {
  await login(page); await configure(page, `Fabricação ${Date.now()}`);
  const component = page.locator('.component-card').first();
  for (const side of ['Superior', 'Inferior', 'Esquerdo', 'Direito']) await expect(component.getByRole('button', { name: `Editar acabamentos — ${side}`, exact: true })).toBeVisible();
  await component.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).click();
  const add = component.getByRole('combobox', { name: 'Adicionar acabamento — Inferior', exact: true });
  await add.selectOption({ label: 'Acabamento 45° — Granito/Mármore' });
  await expectTotal(page, 860);
  await add.selectOption({ label: 'Saia' });
  await component.getByLabel('Altura da saia (cm)', { exact: true }).fill('10');
  await expectTotal(page, 980);
  const description = page.locator('.manufacturing-description');
  await expect(description).toContainText('Acabamento 45° — Granito/Mármore no lado Inferior');
  await expect(description).toContainText('no lado Inferior - 2 m');
  await expect(description).not.toContainText('frontal');
  await expect(description).not.toContainText('linear por aplicação');
  await expect(page.locator('.quote-value-row').filter({ hasText: 'Acabamento 45°' })).toContainText('Inferior');
  await expect(description).toContainText('Saia no lado Inferior');
  await expect(description).toContainText('altura 10 cm');
  await component.getByLabel('Altura da saia (cm)', { exact: true }).fill('20');
  await expectTotal(page, 1100);
  await component.getByRole('button', { name: '+ Adicionar recorte/cuba', exact: true }).click();
  await expect(page.locator('.cutouts-menu')).toHaveAttribute('open', '');
  const cutout = page.locator('.cutout-row');
  await cutout.getByPlaceholder('Descrição', { exact: true }).fill('Cuba de embutir');
  await cutout.getByPlaceholder('Comprimento (cm)', { exact: true }).fill('56');
  await cutout.getByPlaceholder('Largura (cm)', { exact: true }).fill('34');
  await expect(description).toContainText('56 × 34 cm');
  await expect(description).toContainText('0,1904 m²');
  const saved = await save(page);
  expect(saved.items[0].components[0].edges).toHaveLength(2);
  await page.goto(`/orcamentos/${saved.id}/editar`);
  await expectTotal(page, 1100);
  await expect(description).toContainText('Cuba de embutir');
  await expect(component.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await component.getByRole('button', { name: 'Remover Acabamento 45° — Granito/Mármore — Inferior', exact: true }).click();
  await expectTotal(page, 960);
  await expect(description).not.toContainText('45°');
  await expect(description).toContainText('Saia no lado Inferior');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/acabamentos-multiplos.png', fullPage: true });
});

test('salvar, editar, restaurar valor, cancelar e preservar rascunho após atualizar', async ({ page }) => {
  await login(page); const name = `Edição ${Date.now()}`; await configure(page, name);
  const notes = 'Conferir medidas em obra.\nAlinhar os veios das peças.';
  await page.getByLabel('Observações do orçamento', { exact: true }).fill(notes);
  await page.locator('.quote-value-row').first().locator('input').fill('650,00');
  await expectTotal(page, 650);
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue(name); await expectTotal(page, 650);
  await expect(page.getByLabel('Observações do orçamento', { exact: true })).toHaveValue(notes);
  const saved = await save(page); await openQuote(page, saved.id);
  expect(saved.notes).toBe(notes);
  await page.getByRole('link', { name: 'Editar orçamento', exact: true }).click();
  await expect(page.getByLabel('Observações do orçamento', { exact: true })).toHaveValue(notes);
  const editedNotes = 'Instalar após conferir o nivelamento.';
  await page.getByLabel('Observações do orçamento', { exact: true }).fill(editedNotes);
  await page.reload();
  await expect(page.getByLabel('Observações do orçamento', { exact: true })).toHaveValue(editedNotes);
  await expect(page.locator('.quote-value-row').first().locator('input')).toHaveValue('650,00');
  await page.locator('.component-card').first().getByLabel('Comprimento (cm)', { exact: true }).fill('220');
  await expectTotal(page, 650);
  const updated = page.waitForResponse((response) => response.url().endsWith(`/api/quotes/${saved.id}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click(); expect((await updated).status()).toBe(200); await expect(page).toHaveURL(/\/orcamentos$/);
  await page.goto(`/orcamentos/${saved.id}/editar`); await expect(page.locator('#project-name')).toHaveValue(name);
  await expect(page.getByLabel('Observações do orçamento', { exact: true })).toHaveValue(editedNotes);
  const pdf = await api(page, 'GET', `/quotes/${saved.id}/pdf`);
  const pdfText = execFileSync('pdftotext', ['-', '-'], { input: await pdf.body(), encoding: 'utf8' });
  expect(pdfText).toContain(editedNotes); expect(pdfText).not.toContain(notes.split('\n')[0]);
  await page.locator('.quote-value-row').first().getByRole('button', { name: 'Restaurar cálculo' }).click(); await expectTotal(page, 792);
  await page.getByRole('link', { name: 'Cancelar edição', exact: true }).click();
  await page.getByRole('link', { name: 'Editar orçamento', exact: true }).click(); await expectTotal(page, 650);
  await page.getByLabel('Observações do orçamento', { exact: true }).fill('');
  const cleared = page.waitForResponse((response) => response.url().endsWith(`/api/quotes/${saved.id}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click();
  expect((await cleared).status()).toBe(200);
  await expect(page).toHaveURL(/\/orcamentos$/);
  expect((await (await api(page, 'GET', `/quotes/${saved.id}`)).json()).notes).toBeNull();
});

test('complemento abaixo da validade, cliente vinculado e total original intacto', async ({ page }) => {
  await login(page); const name = `Complemento ${Date.now()}`; await configure(page, name); const parent = await save(page);
  await openQuote(page, parent.id); await page.getByRole('link', { name: '+ Vincular complemento', exact: true }).click();
  await expect(page.locator('.quote-summary-card .quote-linker')).toBeVisible();
  await page.getByRole('button', { name: 'Orçamento com Desenho / Detalhado', exact: true }).click();
  await expect(page.locator('.quote-linker')).toContainText(parent.number); await expect(page.locator('.compact-customer')).toContainText(name);
  await page.locator('#project-name').fill('Saia adicional');
  await page.locator('.material-picker summary').click(); await page.locator('.material-search-inline').fill('Verde Ubatuba'); await page.locator('.material-picker-panel button.material').filter({ hasText: 'Verde Ubatuba' }).click();
  await page.locator('.component-card').first().getByLabel('Comprimento (cm)', { exact: true }).fill('100'); await page.locator('.component-card').first().getByLabel('Largura / altura (cm)', { exact: true }).fill('10');
  const child = await save(page); expect(child.parentQuote.id).toBe(parent.id); expect(child.netTotal).toBe(60);
  const original = await (await api(page, 'GET', `/quotes/${parent.id}`)).json(); expect(original.netTotal).toBe(parent.netTotal); expect(original.complements.map((item: any) => item.id)).toContain(child.id);
  await openQuote(page, child.id); await expect(page.getByRole('link', { name: `Complemento de ${parent.number}` })).toBeVisible();
});

test('nomes vazios, adicionais dentro da peça e detalhe do peitoril persistem no orçamento e PDF', async ({ page }) => {
  await login(page); await configure(page, `Peitoril ${Date.now()}`);
  const root = page.locator('.component-editor > .component-card').first();
  const fields = root.locator(':scope > .component-card-body > .component-fields');
  await expect(fields.getByLabel('Nome', { exact: true })).toHaveValue('');
  await fields.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('SILL');
  await root.getByLabel('Medida horizontal (cm)', { exact: true }).fill('12,5');
  await root.getByLabel('Medida vertical (cm)', { exact: true }).fill('4,5');
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('12,5 cm');
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('4,5 cm');
  await fields.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption({ label: 'Soleira' });
  await expect(page.locator('.sill-detail')).toHaveCount(0);
  await fields.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption({ label: 'Peitoril' });
  await expect(page.locator('.quick-components button')).toHaveCount(2);
  await expect(root.getByRole('combobox', { name: 'Adicionar peça', exact: true })).toBeVisible();
  await root.getByRole('combobox', { name: 'Adicionar peça', exact: true }).selectOption({ label: 'Rodabanca' });
  const child = root.locator('.attached-component');
  await expect(child.getByLabel('Nome', { exact: true })).toHaveValue('');
  await child.getByLabel('Comprimento (cm)', { exact: true }).fill('200');
  await child.getByLabel('Largura / altura (cm)', { exact: true }).fill('10');
  await expectTotal(page, 840);
  await page.screenshot({ path: '.test-artifacts/componentes-peitoril.png', fullPage: true });
  const saved = await save(page);
  expect(saved.items[0].components.map((entry: any) => entry.label)).toEqual(['', '']);
  expect(saved.items[0].drawingData.componentDetails).toEqual([{ sillDetailMm: 125, sillDetailHeightMm: 45 }, { parentComponentIndex: 0 }]);
  await page.goto(`/orcamentos/${saved.id}/editar`);
  await expect(root.getByLabel('Medida horizontal (cm)', { exact: true })).toHaveValue('12.5');
  await expect(root.getByLabel('Medida vertical (cm)', { exact: true })).toHaveValue('4.5');
  await expect(child).toHaveCount(1);
  await expectTotal(page, 840);
  const pdf = await api(page, 'GET', `/quotes/${saved.id}/pdf`);
  const text = execFileSync('pdftotext', ['-', '-'], { input: await pdf.body(), encoding: 'utf8' });
  expect(text).toContain('Medida horizontal: 12,5 cm');
  expect(text).toContain('4,5 cm');
  expect(text).toContain('Adicional de 1. Peitoril');
  const copied = await api(page, 'POST', `/quotes/${saved.id}/duplicate`);
  expect(copied.status()).toBe(201);
  expect((await copied.json()).items[0].drawingData.componentDetails).toEqual(saved.items[0].drawingData.componentDetails);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await fields.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption({ label: 'Soleira' });
  const changed = page.waitForResponse((response) => response.url().endsWith(`/api/quotes/${saved.id}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click();
  expect((await changed).status()).toBe(200);
  await expect(page).toHaveURL(/\/orcamentos$/);
  const record = await (await api(page, 'GET', `/quotes/${saved.id}`)).json();
  expect(record.items[0].components[0].componentType).toBe('THRESHOLD');
  expect(record.items[0].drawingData.componentDetails[0]).toEqual({});
  const thresholdPdf = await api(page, 'GET', `/quotes/${saved.id}/pdf`);
  expect(execFileSync('pdftotext', ['-', '-'], { input: await thresholdPdf.body(), encoding: 'utf8' })).not.toContain('Detalhe do peitoril');
});

test('aprovação, entrega, histórico, retrabalho e notificações em telas menores', async ({ page }) => {
  await login(page); const name = `Entrega ${Date.now()}`; await configure(page, name); const saved = await save(page); await openQuote(page, saved.id);
  await page.getByRole('button', { name: 'Confirmar aprovação' }).click(); await expect(page.getByRole('button', { name: 'Iniciar serviço' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar serviço' }).click(); await expect(page.locator('.list-header')).toContainText('Em produção');
  await page.getByRole('button', { name: 'Marcar como entregue' }).click(); await expect(page.locator('.list-header')).toContainText('Entregue');
  await expect(page.getByRole('link', { name: 'Editar orçamento', exact: true })).toHaveCount(0);
  await page.goto('/historico'); await page.getByRole('textbox', { name: 'Buscar orçamentos' }).fill(saved.number);
  const deliveredCard = page.locator('.saved-quote-card').filter({ hasText: saved.number });
  await expect(deliveredCard).toContainText(name);
  await deliveredCard.getByRole('link', { name: 'Ver detalhes' }).click();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Marcar em retrabalho' }).click();
  await expect(page.locator('.list-header')).toContainText('Retrabalho');
  await page.getByRole('link', { name: 'Editar orçamento', exact: true }).click(); await expect(page.locator('#project-name')).toBeVisible();
  for (const [width, height] of [[1440, 1000], [1024, 700], [768, 600], [390, 844], [360, 500]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Rolagem horizontal em ${width}`).toBe(true);
    await expect(page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Notificações de prazo', exact: true }).click(); await expect(page.locator('#deadline-notifications')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#deadline-notifications')).toHaveCount(0);
  }
});
