import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Ponta a ponta no sistema de verdade (tela + API + banco temporário): o caminho principal, do Novo
// orçamento ao fluxo de trabalho, à entrega e à ordem de serviço. Os detalhes de cada tela ficam nos
// testes visuais (API simulada) e as regras da API nos de integração; aqui só o que precisa dos dois.
async function api(page: Page, method: string, path: string, data?: unknown) {
  const token = await page.evaluate(() => localStorage.getItem('inova_access_token'));
  return page.request.fetch(`/api${path}`, { method, headers: { authorization: `Bearer ${token}` }, data });
}

test('Novo orçamento → salvar → aprovar e iniciar → fluxo, entrega e ordem de serviço', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('admin@inovamarmoraria.local');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.INOVA_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#project-name')).toBeVisible();
  const nome = `Cliente e2e ${Date.now()}`;
  const cliente = await api(page, 'POST', '/customers', { name: nome, phone: `929${String(Date.now()).slice(-8)}` });
  expect(cliente.status()).toBe(201);

  // Orçamento Rápido: bancada de 2 m e uma saia presa ao lado de baixo dela (Tipo/descrição).
  await page.getByRole('button', { name: /^Cliente:/ }).click();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill(nome);
  await page.locator('.customer-result').filter({ hasText: nome }).click();
  await page.locator('#project-name').fill('Cozinha e2e');
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-search-inline').fill('Verde Ubatuba');
  await page.locator('.quick-project-fields .material-picker-panel button.material').filter({ hasText: 'Verde Ubatuba' }).click();
  await page.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,00');
  await page.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 2', { exact: true }).focus();
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('SKIRT');
  await page.getByLabel('Peça onde fica a saia 2', { exact: true }).selectOption({ label: 'Peça 1 · Tampo' });
  await expect(page.getByLabel('Comprimento da peça 2 (m)', { exact: true })).toHaveValue('2,00');
  await page.getByLabel('Largura da peça 2 (m)', { exact: true }).fill('0,10');

  const salvo = page.waitForResponse((resposta) => resposta.url().endsWith('/api/quotes') && resposta.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  const criado = await salvo;
  expect(criado.status(), await criado.text()).toBe(201);
  const orcamento = await criado.json();
  await page.waitForURL(`**/orcamentos/${orcamento.id}`);
  expect(orcamento.items[0].components.map((peca: any) => [peca.componentType, peca.lengthMm, peca.widthMm])).toEqual([['TOP', 2000, 600], ['SKIRT', 2000, 100]]);

  // Aprovado e iniciado (a aprovação pela tela é coberta pelos testes visuais).
  for (const corpo of [{ status: 'APPROVED' }, { status: 'APPROVED', executionStatus: 'IN_PROGRESS' }]) {
    const mudou = await api(page, 'PATCH', `/quotes/${orcamento.id}/status`, corpo);
    expect(mudou.status(), await mudou.text()).toBe(200);
  }

  // Fluxo: o projeto em "A fazer" com as duas peças (a bancada e a saia).
  await page.goto('/fluxo');
  const cartao = page.locator('.fluxo-quadro [data-cartao]').filter({ hasText: 'Cozinha e2e' });
  await expect(cartao).toContainText('2 peças');
  await expect(page.locator('section[aria-labelledby="fluxo-TODO"]').locator('[data-cartao]').filter({ hasText: 'Cozinha e2e' })).toHaveCount(1);

  // Produzido: as duas peças ficam prontas para a nota de entrega.
  const cartaoId = await cartao.getAttribute('data-cartao');
  expect((await api(page, 'PATCH', `/workflow/projects/${cartaoId}/move`, { status: 'DONE' })).status()).toBe(200);
  const entregas = await (await api(page, 'GET', `/quotes/${orcamento.id}/entregas`)).json();
  expect(entregas.projects[0].pieces.map((peca: any) => [peca.name, peca.ready])).toEqual([['Tampo', 1], ['Saia', 1]]);

  // Ordem de serviço no PDF (sem desenho técnico: a folha com as peças do orçamento).
  const pdf = await api(page, 'GET', `/quotes/${orcamento.id}/pdf?commercial=true&drawings=true`);
  expect(pdf.status()).toBe(200);
  const texto = execFileSync('pdftotext', ['-', '-'], { input: await pdf.body() }).toString();
  expect(texto).toContain('VALOR DO ORÇAMENTO À VISTA');
  expect(texto).toContain('DATA DE ENTREGA');
  expect(texto).toContain('Cozinha e2e');
});
