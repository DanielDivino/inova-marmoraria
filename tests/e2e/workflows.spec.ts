import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.INOVA_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  // A new project always starts in Orçamento Rápido — the only place commercial
  // data (materials, measurements, finishes, values) is entered. Detalhado is
  // reached afterwards, via "Adicionar desenhos", purely for production division.
  await expect(page.locator('#project-name')).toBeVisible();
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
  await selecionarCliente(page);
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill(name);
  await page.locator('.customer-result').filter({ hasText: name }).click();
  await page.locator('#project-name').fill(name);
  await page.locator('.material-picker summary').click();
  await page.locator('.material-search-inline').fill('Verde Ubatuba');
  await page.locator('.material-picker-panel button.material').filter({ hasText: 'Verde Ubatuba' }).click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByLabel('Validade do orçamento', { exact: true }).fill('2026-12-20');
  return customer;
}
/** Abre o assistente "+ Acabamentos" (sempre a primeira peça) e marca `side`
 * para o serviço `serviceName`, deixando o modal aberto para novas marcações. */
async function checkFinish(page: Page, serviceName: string, side: string) {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  await dialog.locator('fieldset').filter({ hasText: serviceName }).getByLabel(side, { exact: true }).check();
}
async function closeFinishDialog(page: Page) { await page.getByRole('dialog').getByRole('button', { name: 'Concluir', exact: true }).click(); }
/** Linha de acabamento de uma peça (já expandida via "Detalhar"), localizada
 * pelo nome do serviço — evita depender do índice dentro de component.edges. */
function edgeRow(page: Page, serviceName: string) { return page.locator('.quick-edge').filter({ hasText: serviceName }); }
async function detailFirstRow(page: Page) { await page.getByRole('button', { name: 'Detalhar', exact: true }).first().click(); }
async function addDrawings(page: Page) {
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Concluir detalhamento', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir detalhamento', exact: true }).click();
}
async function save(page: Page) {
  const response = page.waitForResponse((response) => response.url().endsWith('/api/quotes') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click();
  const result = await response; expect(result.status(), await result.text()).toBe(201);
  await expect(page).toHaveURL(/\/orcamentos$/);
  return result.json();
}
async function openQuote(page: Page, id: string) { await page.goto(`/orcamentos/${id}`); await expect(page.getByRole('link', { name: 'Editar orçamento', exact: true })).toBeVisible(); }
const nbsp = String.fromCharCode(160);
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replaceAll(nbsp, ' ');
async function expectTotal(page: Page, value: number) {
  const row = page.locator('.quote-summary-card .summary-grand-total');
  const desconto = page.getByLabel('Desconto geral rápido', { exact: true });
  if (await desconto.count()) value += Number((await desconto.inputValue()).replace(',', '.')) || 0;
  await expect.poll(async () => (await row.innerText()).replaceAll(nbsp, ' ')).toContain(money(value));
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

// Barra do atendimento: menus "Cliente ▾" e "Projeto ▾" (substituíram as abas).
async function selecionarCliente(page: Page) { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click(); }
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
  await expect(page.locator('.atendimento-barra')).toContainText(name);
  const result = await api(page, 'GET', `/customers?search=${encodeURIComponent(name)}`); expect((await result.json()).data).toHaveLength(1);
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByPlaceholder('Nome', { exact: true }).fill(`${name} atualizado`);
  await form.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.atendimento-barra')).toContainText(`${name} atualizado`);
});

test('valor da tela corresponde ao salvo com desconto de acabamento; desenhos e PDF', async ({ page }) => {
  await login(page); const name = `Acabamento ${Date.now()}`; await configure(page, name);
  await checkFinish(page, 'Acabamento Meia Cana', 'Inferior');
  await closeFinishDialog(page);
  await expectTotal(page, 780);
  await detailFirstRow(page);
  await edgeRow(page, 'Acabamento Meia Cana').getByLabel('Valor final (R$)', { exact: true }).fill('20,00');
  await expectTotal(page, 740);
  await page.getByLabel('Desconto geral rápido', { exact: true }).fill('10');
  await expectTotal(page, 730);
  await addDrawings(page);
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

test('45 graus e saia coexistem com preços independentes e persistem ao reabrir', async ({ page }) => {
  await login(page); await configure(page, `Fabricação ${Date.now()}`);
  await checkFinish(page, 'Acabamento 45° — Granito/Mármore', 'Inferior');
  await closeFinishDialog(page);
  await expectTotal(page, 860);
  await checkFinish(page, 'Saia', 'Inferior');
  await closeFinishDialog(page);
  await detailFirstRow(page);
  await edgeRow(page, 'Saia').getByLabel(/Altura do acabamento/, { exact: false }).fill('10');
  await expectTotal(page, 980);
  await edgeRow(page, 'Saia').getByLabel(/Altura do acabamento/, { exact: false }).fill('20');
  await expectTotal(page, 1100);
  await page.getByRole('button', { name: '+ Recorte / cuba / furo', exact: true }).click();
  const cutout = page.locator('.cutout-row').first();
  await cutout.getByLabel('Definição das medidas do recorte', { exact: false }).selectOption('DEFINED').catch(() => {});
  await cutout.getByPlaceholder('Descrição', { exact: true }).fill('Cuba de embutir');
  await cutout.getByPlaceholder('Comprimento (cm)', { exact: true }).fill('56');
  await cutout.getByPlaceholder('Largura (cm)', { exact: true }).fill('34');
  const saved = await save(page);
  expect(saved.items[0].components[0].edges).toHaveLength(2);
  expect(saved.items[0].cutouts[0].label).toBe('Cuba de embutir');
  await page.goto(`/orcamentos/${saved.id}/editar`);
  await expectTotal(page, 1100);
  await detailFirstRow(page);
  await expect(edgeRow(page, 'Saia')).toBeVisible();
  await expect(edgeRow(page, 'Acabamento 45°')).toBeVisible();
  await edgeRow(page, 'Acabamento 45°').getByRole('button', { name: /^Remover acabamento/ }).click();
  await expectTotal(page, 960);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/acabamentos-multiplos.png', fullPage: true });
});

test('salvar, editar, restaurar valor, cancelar e preservar rascunho após atualizar', async ({ page }) => {
  await login(page); const name = `Edição ${Date.now()}`; await configure(page, name);
  const notes = 'Conferir medidas em obra.\nAlinhar os veios das peças.';
  await page.getByLabel('Observações do orçamento', { exact: true }).fill(notes);
  await detailFirstRow(page);
  await page.getByLabel('Valor final da peça (material + acabamentos)', { exact: true }).fill('650,00');
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
  await detailFirstRow(page);
  await expect(page.getByLabel('Valor final da peça (material + acabamentos)', { exact: true })).toHaveValue('650,00');
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,20');
  await expectTotal(page, 650);
  const updated = page.waitForResponse((response) => response.url().endsWith(`/api/quotes/${saved.id}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click(); expect((await updated).status()).toBe(200); await expect(page).toHaveURL(/\/orcamentos$/);
  await page.goto(`/orcamentos/${saved.id}/editar`); await expect(page.locator('#project-name')).toHaveValue(name);
  await expect(page.getByLabel('Observações do orçamento', { exact: true })).toHaveValue(editedNotes);
  const pdf = await api(page, 'GET', `/quotes/${saved.id}/pdf`);
  const pdfText = execFileSync('pdftotext', ['-', '-'], { input: await pdf.body(), encoding: 'utf8' });
  expect(pdfText).toContain(editedNotes); expect(pdfText).not.toContain(notes.split('\n')[0]);
  await detailFirstRow(page);
  await page.getByLabel('Valor final da peça (material + acabamentos)', { exact: true }).fill('');
  await expectTotal(page, 792);
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
  await expect(page.locator('.quote-linker')).toContainText(parent.number); await expect(page.locator('.atendimento-barra')).toContainText(name);
  await page.locator('#project-name').fill('Saia adicional');
  await page.locator('.material-picker summary').click(); await page.locator('.material-search-inline').fill('Verde Ubatuba'); await page.locator('.material-picker-panel button.material').filter({ hasText: 'Verde Ubatuba' }).click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,00'); await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,10');
  const child = await save(page); expect(child.parentQuote.id).toBe(parent.id); expect(child.netTotal).toBe(60);
  const original = await (await api(page, 'GET', `/quotes/${parent.id}`)).json(); expect(original.netTotal).toBe(parent.netTotal); expect(original.complements.map((item: any) => item.id)).toContain(child.id);
  await openQuote(page, child.id); await expect(page.getByRole('link', { name: `Complemento de ${parent.number}` })).toBeVisible();
});

test('nomes vazios, peça avulsa e detalhe do peitoril (definido no Detalhado) persistem no orçamento e PDF', async ({ page }) => {
  await login(page); await configure(page, `Peitoril ${Date.now()}`);
  await page.getByLabel('Tipo da peça 1', { exact: true }).selectOption('SILL');
  // Comprimento e largura são campos normais mesmo para peitoril — o detalhe
  // (duas pedras sobrepostas) só existe no desenho, em Detalhado.
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,12');
  // Peça avulsa: cobrada normalmente, sem vínculo visual de "anexada".
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('BACKSPLASH');
  await page.getByLabel('Comprimento da peça 2 (m)', { exact: true }).fill('2,00');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,10');
  const grandTotal = page.locator('.quote-summary-card .summary-grand-total');
  const baseline = await grandTotal.innerText();
  await page.screenshot({ path: '.test-artifacts/componentes-peitoril.png', fullPage: true });
  await addDrawings(page);
  const root = page.locator('.component-editor > .component-card').first();
  // Único painel de peitoril: duas pedras sobrepostas. Sem campo de nome (o
  // tipo já identifica a peça) e sem largura/sobreposição digitadas à mão —
  // a largura final é a da peça acima (12 cm) e cada pedra é calculada a
  // partir da sobreposição escolhida (2 cm): (12 + 2) / 2 = 7 cm cada.
  await expect(root.getByLabel('Nome', { exact: true })).toHaveCount(0);
  await root.getByRole('button', { name: '2 cm', exact: true }).click();
  await expect(grandTotal).toHaveText(baseline); // detalhe do peitoril nunca muda o valor
  await page.locator('.project-step').nth(2).getByRole('button').click();
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('7 cm');
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('2 cm');
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('12 cm total');
  const saved = await save(page);
  expect(saved.items[0].components.map((entry: any) => entry.label)).toEqual(['', '']);
  const sillPiece = saved.items[0].drawingData.productionPlan.pieces.find((piece: any) => piece.componentType === 'SILL');
  expect(sillPiece).toMatchObject({ sillTopWidthMm: 70, sillBottomWidthMm: 70, sillOverlapMm: 20, sillFinalWidthMm: 120 });
  await page.goto(`/orcamentos/${saved.id}/editar`);
  // O orçamento já foi detalhado (entryMode persistido), reabre direto em Detalhado.
  await expect(root.getByRole('button', { name: '2 cm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(grandTotal).toHaveText(baseline);
  const pdf = await api(page, 'GET', `/quotes/${saved.id}/pdf`);
  const text = execFileSync('pdftotext', ['-', '-'], { input: await pdf.body(), encoding: 'utf8' });
  expect(text).toContain('Pedra de cima:');
  expect(text).toContain('× 7,0 cm');
  expect(text).toContain('Sobreposição/encaixe: 2,0 cm');
  expect(text).toContain('Largura final montada: 12,0 cm');
  const copied = await api(page, 'POST', `/quotes/${saved.id}/duplicate`);
  expect(copied.status()).toBe(201);
  const copiedJson = await copied.json();
  const copiedSillPiece = copiedJson.items[0].drawingData.productionPlan.pieces.find((piece: any) => piece.componentType === 'SILL');
  expect(copiedSillPiece).toMatchObject({ sillTopWidthMm: 70, sillBottomWidthMm: 70, sillOverlapMm: 20, sillFinalWidthMm: 120 });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('aprovação, entrega, histórico, retrabalho e notificações em telas menores', async ({ page }) => {
  await login(page); const name = `Entrega ${Date.now()}`; await configure(page, name); const saved = await save(page); await openQuote(page, saved.id);
  await page.getByRole('button', { name: 'Confirmar aprovação' }).click(); await expect(page.getByRole('button', { name: 'Iniciar serviço' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar serviço' }).click(); await expect(page.locator('.quote-detail-heading')).toContainText('Em produção');
  await page.getByRole('button', { name: 'Marcar como entregue' }).click(); await expect(page.locator('.quote-detail-heading')).toContainText('Entregue');
  await expect(page.getByRole('link', { name: 'Editar orçamento', exact: true })).toHaveCount(0);
  await page.goto('/historico'); await page.getByRole('textbox', { name: 'Buscar orçamentos' }).fill(saved.number);
  const deliveredCard = page.locator('.saved-quote-card').filter({ hasText: saved.number });
  await expect(deliveredCard).toContainText(name);
  await deliveredCard.getByRole('link', { name: 'Ver detalhes' }).click();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Marcar em retrabalho' }).click();
  await expect(page.locator('.quote-detail-heading')).toContainText('Retrabalho');
  await page.getByRole('link', { name: 'Editar orçamento', exact: true }).click(); await expect(page.locator('#project-name')).toBeVisible();
  for (const [width, height] of [[1440, 1000], [1024, 700], [768, 600], [390, 844], [360, 500]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Rolagem horizontal em ${width}`).toBe(true);
    await expect(page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Notificações de prazo', exact: true }).click(); await expect(page.locator('#deadline-notifications')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#deadline-notifications')).toHaveCount(0);
  }
});

test('assistente de divisão, seguir divisão e valor comercial somente leitura no Detalhado', async ({ page }) => {
  await login(page); await configure(page, `Divisão ${Date.now()}`);
  const grandTotal = page.locator('.quote-summary-card .summary-grand-total');
  const baseline = await grandTotal.innerText();
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir detalhamento', exact: true })).toBeVisible();
  const assistant = page.locator('.split-assistant-card').first();
  await expect(assistant).toContainText('2,00 × 0,60 m');
  for (const n of [1, 2, 3, 4]) await expect(assistant.getByRole('button', { name: String(n), exact: true })).toBeVisible();
  await assistant.getByRole('button', { name: 'Manual', exact: true }).click();
  await assistant.getByLabel('Peça 1 (m)', { exact: true }).fill('1,20');
  await expect(assistant.locator('.split-assistant-status')).toContainText('Utilizado: 1,20 / 2,00 m');
  await expect(assistant.locator('.split-assistant-status')).toContainText('Restante: 0,80 m');
  await expect(assistant.getByRole('button', { name: 'Confirmar divisão', exact: true })).toBeDisabled();
  await assistant.getByLabel('Peça 2 (m)', { exact: true }).fill('1,50');
  await expect(assistant.locator('.split-assistant-status')).toContainText('Excedeu: 0,70 m');
  await expect(assistant.getByRole('button', { name: 'Confirmar divisão', exact: true })).toBeDisabled();
  await assistant.getByRole('button', { name: 'Usar restante', exact: true }).click();
  await expect(assistant.getByLabel('Peça 2 (m)', { exact: true })).toHaveValue('0,80');
  await expect(assistant.locator('.split-assistant-status')).toContainText('Utilizado: 2,00 / 2,00 m');
  await expect(assistant.locator('.split-assistant-status')).toContainText('Restante: 0,00 m');
  await assistant.getByRole('button', { name: 'Confirmar divisão', exact: true }).click();
  const pieces = assistant.locator('.split-assistant-pieces li');
  await expect(pieces).toHaveCount(2);
  await expect(pieces.nth(0)).toContainText('1,20 × 0,60 m');
  await expect(pieces.nth(1)).toContainText('0,80 × 0,60 m');
  // Nenhum valor comercial visível/editável no passo 1 (Divisão e peças) — a
  // divisão em si nunca altera o valor, verificado abaixo.
  await expect(page.locator('#project-step-1').getByText('R$', { exact: false })).toHaveCount(0);
  await expect(grandTotal).toHaveText(baseline);
  await page.locator('.project-stage-actions').getByRole('button', { name: 'Conferir produção', exact: true }).click();
  // A etapa 2 não mostra valores: o valor cobrado é só o do Orçamento Rápido.
  await expect(page.locator('#project-step-2').getByLabel(/Valor final/i)).toHaveCount(0);
  await expect(page.locator('#project-step-2').getByLabel(/Desconto/i)).toHaveCount(0);
  // A etapa 2 é só o desenho: as 2 peças da divisão aparecem nele.
  await expect(page.locator('.technical-drawing .drawing-description')).toHaveCount(2);
  await expect(grandTotal).toHaveText(baseline);
  const saved = await save(page);
  const record = await (await api(page, 'GET', `/quotes/${saved.id}`)).json();
  expect(record.items[0].components).toHaveLength(1); // divisão nunca cria/altera componentes comerciais
  expect(Number(record.netTotal)).toBeGreaterThan(0);
});

test('peitoril: largura é um campo normal no Orçamento Rápido; a sobreposição escolhida no Detalhado calcula as duas pedras, sem afetar o valor', async ({ page }) => {
  await login(page); await configure(page, `Peitoril duplo ${Date.now()}`);
  await page.getByLabel('Tipo da peça 1', { exact: true }).selectOption('SILL');
  await expect(page.locator('.quick-sill-cell')).toHaveCount(0); // sem painel especial na largura
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('1,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  const grandTotal = page.locator('.quote-summary-card .summary-grand-total');
  const baseline = await grandTotal.innerText();
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).click();
  const root = page.locator('.component-editor > .component-card').first();
  // Só a sobreposição é escolhida (1 ou 2 cm); a largura final vem da peça
  // (60 cm) e cada pedra é calculada: (60 + 2) / 2 = 31 cm.
  await root.getByRole('button', { name: '2 cm', exact: true }).click();
  await expect(grandTotal).toHaveText(baseline); // a escolha não muda o valor
  await page.locator('.project-step').nth(2).getByRole('button').click();
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toHaveCount(1);
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('duas pedras');
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('31 cm');
  await expect(page.locator('.technical-drawing .sill-drawing-detail')).toContainText('60 cm total');
});

test('fluxo completo: salvar rápido, dividir em 3, adicionar 45°, salvar de novo — comercial intacto e OS com as 3 peças', async ({ page }) => {
  await login(page); await configure(page, `Fluxo completo ${Date.now()}`);
  const initial = await save(page);
  await openQuote(page, initial.id);
  await page.getByRole('link', { name: 'Editar orçamento', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar desenhos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir detalhamento', exact: true })).toBeVisible();
  const assistant = page.locator('.split-assistant-card').first();
  await assistant.getByRole('button', { name: '3', exact: true }).click();
  await expect(assistant.locator('.split-assistant-pieces li')).toHaveCount(3);
  const root = page.locator('.component-editor > .component-card').first();
  await root.getByRole('button', { name: 'Editar acabamentos — Inferior', exact: true }).click();
  await root.getByRole('combobox', { name: 'Adicionar acabamento — Inferior', exact: true }).selectOption({ label: 'Acabamento 45° — Granito/Mármore' });
  await root.getByRole('button', { name: 'Fechar edição do lado', exact: true }).click();
  await page.locator('.project-stage-actions').getByRole('button', { name: 'Conferir produção', exact: true }).click();
  const grandTotal = page.locator('.quote-summary-card .summary-grand-total');
  await expect(grandTotal).toContainText('Total do projeto');
  await page.getByRole('button', { name: 'Concluir detalhamento', exact: true }).click();
  const updated = page.waitForResponse((response) => response.url().endsWith(`/api/quotes/${initial.id}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).last().click();
  expect((await updated).status()).toBe(200);
  await expect(page).toHaveURL(/\/orcamentos$/);
  const record = await (await api(page, 'GET', `/quotes/${initial.id}`)).json();
  expect(record.netTotal).toBe(initial.netTotal);
  expect(record.grossTotal).toBe(initial.grossTotal);
  expect(record.items[0].components).toHaveLength(1);
  expect(record.items[0].components[0].id).toBe(initial.items[0].components[0].id);
  const bancadaPieces = record.items[0].drawingData.productionPlan.pieces.filter((piece: any) => piece.componentType === 'TOP');
  expect(bancadaPieces).toHaveLength(3);
  const pdf = await api(page, 'GET', `/quotes/${initial.id}/pdf?drawings=true`);
  expect(pdf.status()).toBe(200);
  const text = execFileSync('pdftotext', ['-', '-'], { input: await pdf.body(), encoding: 'utf8' });
  expect(text).toContain('ORDEM DE SERVIÇO');
  // Peças de uma divisão em >1 ganham nome "Peça N" (dividirComponente, domínio).
  expect(text).toContain('Peça 1'); expect(text).toContain('Peça 2'); expect(text).toContain('Peça 3');
});
