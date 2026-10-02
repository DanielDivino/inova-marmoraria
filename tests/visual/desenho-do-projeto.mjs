import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, sincronizarDesenho } from '../../packages/domain/dist/tecnico/index.js';

// API simulada (a sincronização é a do domínio, como no servidor). Projeto com 4 peças no Orçamento
// Rápido → "Desenho técnico" → "Criar desenho do projeto": o desenho já abre com as 4 peças, ligado
// ao projeto; depois de mudar uma medida no orçamento, "Abrir desenho do projeto" leva a mudança.
const output = resolve(import.meta.dirname, '../../.test-artifacts/desenho-do-projeto');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const catalogo = {
  materials: [{ id: 'cm0000000000000000000stone', name: 'Branco Dallas', category: 'Granitos', billingUnit: 'SQUARE_METER', currentPrice: 700, images: [] }],
  productTypes: [{ id: 'cm00000000000000000counter', name: 'Bancada' }],
  services: [{ id: 'cm00000000000000000000saia', name: 'Saia', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 0 }],
  settings: { closedSquareMeter: true },
};
const cliente = { id: 'cm00000000000000000cliente', name: 'Maria Silva', phone: '92981817980', isQuick: false };
const designId = 'cm0000000000000000projeto1';
const desenhos = [];
const criados = [];
const sincronizacoes = [];
let documento = emptyTechnicalDocument(), versao = 1, sequencia = 0;
const salvamentos = [];
let falharProximoSalvamento = false;

await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'vendedor', name: 'Vendedor Inova', role: 'SELLER', maxDiscountPercent: 10 } } });
  if (path === '/api/quote-draft') return route.fulfill({ json: method === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: catalogo });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id: catalogo.materials[0].id, name: 'Branco Dallas', category: 'Granitos', description: null, imageUrl: null }] });
  if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0 } });
  if (path === '/api/customers') return route.fulfill({ json: { data: [{ ...cliente, quotes: [] }], meta: { page: 1, limit: 100, total: 1, pages: 1 }, counts: { todos: 1, ativos: 1, incompletos: 0, inativos: 0 } } });
  if (path === `/api/customers/${cliente.id}/designs` && method === 'POST') {
    const body = route.request().postDataJSON();
    criados.push(body);
    desenhos.unshift({ id: designId, nome: body.name, atualizadoEm: new Date().toISOString(), pecas: 0, usadoEm: [] });
    return route.fulfill({ status: 201, json: { designId, projectId: 'p', name: body.name } });
  }
  if (path === `/api/customers/${cliente.id}/designs`) return route.fulfill({ json: { designs: desenhos.map(desenho => ({ ...desenho, pecas: documento.pieces.length })) } });
  if (path === `/api/designs/${designId}/sincronizar` && method === 'POST') {
    const body = route.request().postDataJSON();
    sincronizacoes.push(body);
    const resultado = sincronizarDesenho(documento, body.projeto, body.sincronia, { materiais: catalogo.materials, servicos: catalogo.services }, () => `peca-${++sequencia}`);
    if (resultado.alterado) { documento = resultado.documento; versao += 1; }
    return route.fulfill({ json: { sincronia: resultado.sincronia, avisos: resultado.avisos, versao, nome: body.projeto.nome, alterado: resultado.alterado } });
  }
  if (path === `/api/designs/${designId}/draft` && method === 'PUT') {
    salvamentos.push(Date.now());
    if (falharProximoSalvamento) { falharProximoSalvamento = false; return route.fulfill({ status: 422, json: { error: 'INVALID_TECHNICAL_DOCUMENT', message: 'Contorno diverge dos parâmetros.' } }); }
    documento = route.request().postDataJSON().document; versao += 1;
    return route.fulfill({ json: { id: 'rascunho', version: versao, schemaVersion: 1, document: documento, updatedAt: new Date().toISOString(), diagnostics: [] } });
  }
  if (path === `/api/designs/${designId}/draft`) return route.fulfill({ json: { design: { id: designId, name: 'Desenho técnico', project: { id: 'p', name: 'Cozinha', job: { customer: { name: cliente.name, phone: cliente.phone } } } }, draft: { id: 'rascunho', version: versao, schemaVersion: 1, document: documento, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === `/api/designs/${designId}` && method === 'DELETE') { desenhos.splice(0, desenhos.length); return route.fulfill({ status: 204, body: '' }); }
  if (path === `/api/designs/${designId}`) return route.fulfill({ json: { revisions: [] } });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const medida = (campo, peca) => page.getByLabel(`${campo} da peça ${peca} (m)`, { exact: true });
// "Opções da peça N" (acabamentos desta peça) → janela "Acabamentos da peça" → Cantos arredondados.
const abrirOpcoes = async numero => {
  const botao = page.locator('[data-quick-row]').nth(numero - 1).locator('.quick-options-button:visible').first();
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
  return page.locator('#' + await botao.getAttribute('aria-controls'));
};
const arredondar = async numero => {
  const opcoes = await abrirOpcoes(numero);
  await opcoes.getByRole('button', { name: 'Adicionar acabamento', exact: true }).click();
  const janela = page.getByRole('dialog', { name: 'Acabamentos da peça' });
  await janela.getByLabel('Arredondar as 4 pontas').check();
  const raio = await janela.getByLabel('Raio dos cantos').inputValue();
  await janela.getByRole('button', { name: 'Concluir', exact: true }).click();
  await janela.waitFor({ state: 'detached' });
  return { opcoes, raio };
};

try {
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  await page.getByRole('button', { name: /^Cliente:/ }).click();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.locator('.customer-dialog .search').fill('Maria');
  await page.locator('.customer-result').filter({ hasText: 'Maria Silva' }).click();

  // 1) Projeto com 4 peças (tipo/descrição) no Orçamento Rápido.
  await page.locator('#project-name').fill('Cozinha');
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-picker-panel button').filter({ hasText: 'Branco Dallas' }).click();
  const pecas = [['TOP', '2,00', '0,60'], ['TOP', '1,20', '0,60'], ['THRESHOLD', '0,90', '0,15'], ['SILL', '1,00', '0,20']];
  for (const [indice, [tipo, comprimento, largura]] of pecas.entries()) {
    if (indice) await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
    await page.getByLabel(`Tipo da peça ${indice + 1}`, { exact: true }).selectOption(tipo);
    await medida('Comprimento', indice + 1).fill(comprimento);
    await medida('Largura', indice + 1).fill(largura);
  }

  // 1b) Cantos arredondados como acabamento: 10 cm na bancada; na soleira (15 cm de largura), no máximo metade.
  const bancada = await arredondar(1);
  assert.equal(bancada.raio, '10');
  await bancada.opcoes.locator('.quick-acabamento').filter({ hasText: 'Cantos arredondados' }).getByText('4 pontas').waitFor();
  await page.screenshot({ path: resolve(output, '00-cantos-arredondados.png') });
  assert.equal((await arredondar(3)).raio, '7,5');

  // 2) "Desenho técnico": o projeto aberto em destaque, com as 4 peças.
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  const doProjeto = page.getByRole('region', { name: 'Desenho técnico deste projeto' });
  await doProjeto.getByText('O desenho começa com as 4 peças do Orçamento Rápido e fica ligado a este projeto.').waitFor();
  await shot('01-janela-com-o-projeto');
  await doProjeto.getByRole('button', { name: 'Criar desenho do projeto' }).click();

  // 3) O editor abre já com as 4 peças, e o desenho tem o nome do projeto.
  const tela = page.getByRole('dialog', { name: 'Desenho técnico do orçamento' });
  await tela.getByRole('button', { name: /^Usar no orçamento/ }).waitFor();
  assert.deepEqual(criados, [{ name: 'Cozinha' }]);
  assert.equal(sincronizacoes.length, 1);
  assert.equal(sincronizacoes[0].sincronia, undefined, 'desenho novo: recebe o projeto inteiro');
  assert.equal(documento.pieces.length, 4, 'as 4 peças no desenho');
  assert.deepEqual(documento.pieces.map(peca => [peca.parameters.width, peca.parameters.length]), [[2000, 600], [1200, 600], [900, 150], [1000, 200]]);
  assert.deepEqual(documento.pieces.map(peca => [peca.parameters.shape, peca.parameters.radius]), [['ROUNDED', 100], ['RECTANGLE', 0], ['ROUNDED', 75], ['RECTANGLE', 0]], 'cantos arredondados viram a peça Arredondada');
  await page.waitForTimeout(400);
  await shot('02-desenho-com-as-pecas');

  // 3b) Salvar deu erro: o editor não fica tentando sozinho (a tela piscava); "Salvar agora" tenta de novo.
  falharProximoSalvamento = true;
  await tela.getByRole('button', { name: 'Tampo', exact: true }).first().click();
  await tela.getByLabel('Nome', { exact: true }).fill('Bancada da pia');
  await tela.getByText('Contorno diverge dos parâmetros.').waitFor();
  await page.waitForTimeout(5000);
  assert.equal(salvamentos.length, 1, 'depois do erro, nenhuma tentativa automática');
  await tela.getByText('Contorno diverge dos parâmetros.').waitFor();
  await tela.getByRole('button', { name: 'Salvar agora' }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('Contorno diverge dos parâmetros.'));
  assert.equal(salvamentos.length, 2);
  assert.equal(documento.pieces[0].name, 'Bancada da pia');
  await tela.getByRole('button', { name: '← Voltar ao orçamento' }).click();
  await tela.waitFor({ state: 'detached' });
  await page.getByText(/Desenho técnico deste projeto: “Cozinha”/).waitFor();

  // 4) Mudar uma medida e tirar os cantos arredondados da soleira no orçamento: o desenho acompanha ao abrir.
  await medida('Comprimento', 1).fill('2,40');
  const soleira = await abrirOpcoes(3);
  await soleira.getByRole('button', { name: 'Remover cantos arredondados' }).click();
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  await doProjeto.getByText('Este projeto já tem desenho técnico.', { exact: false }).waitFor();
  await doProjeto.getByRole('button', { name: 'Abrir desenho do projeto' }).click();
  await tela.getByRole('button', { name: /^Usar no orçamento/ }).waitFor();
  assert.equal(sincronizacoes.length, 2);
  assert.ok(sincronizacoes[1].sincronia, 'segunda vez: só o que mudou');
  assert.equal(documento.pieces[0].parameters.width, 2400);
  assert.deepEqual([documento.pieces[0].parameters.shape, documento.pieces[2].parameters.shape], ['ROUNDED', 'RECTANGLE']);
  assert.equal(criados.length, 1, 'não cria outro desenho');
  await tela.getByRole('button', { name: '← Voltar ao orçamento' }).click();
  await tela.waitFor({ state: 'detached' });

  // 5) O × da lista exclui o desenho: o projeto fica sem desenho técnico (as peças continuam no orçamento).
  await page.getByRole('button', { name: /^Desenho técnico/ }).click();
  const lista = page.getByRole('list', { name: 'Desenhos do cliente' });
  await lista.getByText('Neste orçamento').waitFor();
  await lista.getByRole('button', { name: 'Excluir o desenho Cozinha' }).click();
  const pergunta = page.getByRole('alertdialog', { name: 'Excluir o desenho “Cozinha”?' });
  await pergunta.getByText('O projeto deste orçamento que usa este desenho fica sem desenho técnico', { exact: false }).waitFor();
  await page.screenshot({ path: resolve(output, '03-excluir-desenho.png') });
  await pergunta.getByRole('button', { name: 'Excluir desenho' }).click();
  await doProjeto.getByRole('button', { name: 'Criar desenho do projeto' }).waitFor();
  assert.equal(await lista.locator('li').count(), 0, 'some da lista');
  await page.keyboard.press('Escape');
  await page.getByText(/Desenho técnico deste projeto/).waitFor({ state: 'detached' });
  assert.equal(await medida('Comprimento', 1).inputValue(), '2,40', 'as peças continuam');

  assert.deepEqual(errors, []);
  console.log('OK: desenho técnico do projeto aberto — criado já com as 4 peças do Orçamento Rápido (cantos arredondados viram a peça Arredondada) e ligado ao projeto; depois, abrir leva a medida mudada e os cantos retirados no orçamento; o × da lista exclui o desenho e o projeto fica sem ele.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
