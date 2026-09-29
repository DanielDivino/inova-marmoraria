import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada (inclusive o rascunho no servidor, com versão e conflito como a API real).
// O Novo orçamento do mesmo usuário no computador e no celular: os clientes abertos e os seus
// projetos são os mesmos nos dois; o rascunho antigo do celular (só no aparelho) é juntado aos do
// computador; mudanças ao mesmo tempo nos dois se juntam; o cliente salvo ou removido some dos dois.
const output = resolve(import.meta.dirname, '../../.test-artifacts/rascunho-entre-aparelhos');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const errors = [];
const usuario = 'visual-aparelhos';

// Servidor simulado: um rascunho por usuário; grava só se a versão informada for a atual.
let servidor = null;
let foraDoAr = false;
let segurar = null;
let segurarLeitura = null;
let aoCriarCliente = null;
let clientesCriados = 0;
let salvo = null;
async function rotas(context, aparelho) {
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: usuario, name: 'Vendedor', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
    if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
    if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
    if (path === '/api/catalog') return route.fulfill({ json: { materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }], productTypes: [{ id: 'counter', name: 'Bancada' }], services: [], settings: { closedSquareMeter: true } } });
    if (path === '/api/customers' && method === 'POST') {
      if (aoCriarCliente) { const antes = aoCriarCliente; aoCriarCliente = null; await antes(); }
      clientesCriados += 1;
      return route.fulfill({ status: 201, json: { id: `sc-${clientesCriados}`, name: `Sem cadastro ${clientesCriados}`, phone: null, isQuick: true, quotes: [] } });
    }
    if (path === '/api/quote-draft') {
      if (foraDoAr) return route.fulfill({ status: 503, json: { message: 'Fora do ar.' } });
      if (method === 'GET') {
        if (segurarLeitura) await segurarLeitura;
        const known = Number(new URL(route.request().url()).searchParams.get('known'));
        if (!servidor) return route.fulfill({ json: { version: null } });
        return route.fulfill({ json: servidor.version === known ? { version: servidor.version } : { version: servidor.version, draft: servidor } });
      }
      if (segurar) await segurar;
      const { data, baseVersion } = route.request().postDataJSON();
      if ((servidor?.version ?? null) !== baseVersion) return route.fulfill({ json: { saved: false, draft: servidor } });
      servidor = { data, version: (servidor?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
      return route.fulfill({ json: { saved: true, version: servidor.version, updatedAt: servidor.updatedAt } });
    }
    if (path === '/api/quotes' && method === 'POST') { salvo = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 'salvo' } }); }
    if (path === '/api/quotes/salvo/status') return route.fulfill({ json: { status: 'SENT' } });
    // Tela Orçamentos (depois de salvar).
    if (path === '/api/users' || path === '/api/workers') return route.fulfill({ json: [] });
    if (path === '/api/quotes') return route.fulfill({ json: { data: [], total: 0, meta: { page: 1, limit: 20, total: 0, pages: 0 } } });
    errors.push(`${aparelho}: API não prevista: ${method} ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
}
const computadorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const celularCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await rotas(computadorCtx, 'computador');
await rotas(celularCtx, 'celular');
const abrir = async (context, nome) => {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(`${nome}: pageerror: ${error.message}`));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  return page;
};
const menuCliente = async page => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menu').waitFor(); };
const clientesAbertos = async page => {
  await menuCliente(page);
  const nomes = await page.getByRole('menu').getByRole('menuitemradio').allInnerTexts();
  await page.keyboard.press('Escape');
  return nomes.map(texto => texto.replace(/^\S+\s+/, '').replace(/\s+/g, ' ').trim()).sort();
};
const semCadastro = async page => { await menuCliente(page); await page.getByRole('menuitem', { name: 'Orçamento sem cadastro', exact: true }).click(); await page.getByRole('button', { name: /^Cliente: Sem cadastro/ }).waitFor(); };
const escolherCliente = async (page, nome) => { await menuCliente(page); await page.getByRole('menu').getByRole('menuitemradio', { name: new RegExp(nome) }).click(); await page.getByRole('button', { name: `Cliente: ${nome}` }).waitFor(); };
const noServidor = () => (servidor?.data.workspaces ?? []).map(espaco => espaco.customer?.name).sort();
async function esperar(condicao, mensagem) {
  const limite = Date.now() + 10_000;
  while (!condicao()) { if (Date.now() > limite) throw new Error(mensagem + ' — servidor: ' + JSON.stringify(noServidor())); await new Promise(r => setTimeout(r, 100)); }
}
// Volta para a tela (o que o navegador avisa ao trocar de app ou de aba).
const voltarParaTela = page => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const shot = (page, nome) => page.screenshot({ path: resolve(output, nome + '.png') });

let computador, celular;
try {
  // 1) Antes da sincronia: o celular tem um rascunho só dele (o servidor está fora do ar).
  foraDoAr = true;
  celular = await abrir(celularCtx, 'celular');
  await semCadastro(celular);
  await celular.locator('#project-name').fill('Lavabo do celular');
  await celular.waitForTimeout(600);
  // Rascunho de antes desta versão: só no aparelho, sem nenhuma informação de sincronia.
  await celular.evaluate(chave => localStorage.removeItem(chave), `inova_quote_draft_v2:${usuario}:sincronia`);
  await celular.close();
  foraDoAr = false;

  // 2) No computador: dois clientes sem cadastro, cada um com o seu projeto.
  computador = await abrir(computadorCtx, 'computador');
  await semCadastro(computador);
  await computador.locator('#project-name').fill('Cozinha 2');
  await computador.locator('.quick-project-fields .material-picker summary').click();
  await computador.locator('.quick-project-fields .material-picker-panel button').filter({ hasText: 'Branco Dallas' }).click();
  await computador.getByLabel('Comprimento da peça 1 (m)', { exact: true }).fill('2,00');
  await computador.getByLabel('Largura da peça 1 (m)', { exact: true }).fill('0,60');
  await semCadastro(computador);
  await computador.locator('#project-name').fill('Banheiro 3');
  await esperar(() => noServidor().length === 2, 'computador grava os 2 clientes no servidor');

  // 3) O celular abre: aparecem todos os clientes (os do computador + o que já estava nele).
  celular = await abrir(celularCtx, 'celular');
  await esperar(() => noServidor().length === 3, 'celular junta o rascunho dele com o do servidor');
  assert.deepEqual(await clientesAbertos(celular), ['Sem cadastro 1', 'Sem cadastro 2', 'Sem cadastro 3'], 'celular mostra todos os clientes');
  await menuCliente(celular);
  await celular.getByText('Clientes neste orçamento').waitFor();
  await shot(celular, '01-celular-todos-os-clientes');
  await celular.keyboard.press('Escape');
  await escolherCliente(celular, 'Sem cadastro 2');
  assert.equal(await celular.locator('#project-name').inputValue(), 'Cozinha 2', 'projeto feito no computador aparece no celular');

  // 4) O computador traz o cliente que estava só no celular.
  await voltarParaTela(computador);
  await computador.waitForTimeout(500);
  assert.deepEqual(await clientesAbertos(computador), ['Sem cadastro 1', 'Sem cadastro 2', 'Sem cadastro 3'], 'computador mostra o cliente do celular');
  await escolherCliente(computador, 'Sem cadastro 1');
  assert.equal(await computador.locator('#project-name').inputValue(), 'Lavabo do celular');
  await shot(computador, '02-computador-com-cliente-do-celular');

  // 5) Mudanças ao mesmo tempo nos dois aparelhos (as gravações chegam juntas ao servidor): junta as duas.
  let soltar;
  segurar = new Promise(r => { soltar = r; });
  await escolherCliente(celular, 'Sem cadastro 3');
  await celular.locator('#project-name').fill('Banheiro editado no celular');
  await semCadastro(computador);
  await computador.waitForTimeout(1500);
  segurar = null;
  soltar();
  await esperar(() => noServidor().length === 4 && JSON.stringify(servidor.data).includes('Banheiro editado no celular'), 'as duas mudanças ficam no servidor');
  for (const page of [computador, celular]) await voltarParaTela(page);
  await computador.waitForTimeout(800);
  const quatro = ['Sem cadastro 1', 'Sem cadastro 2', 'Sem cadastro 3', 'Sem cadastro 4'];
  assert.deepEqual(await clientesAbertos(computador), quatro, 'computador com as duas mudanças');
  assert.deepEqual(await clientesAbertos(celular), quatro, 'celular com as duas mudanças');
  await escolherCliente(computador, 'Sem cadastro 3');
  assert.equal(await computador.locator('#project-name').inputValue(), 'Banheiro editado no celular');

  // 6) Removido no celular: some do computador.
  await escolherCliente(celular, 'Sem cadastro 4');
  await menuCliente(celular);
  await celular.getByRole('menuitem', { name: 'Remover este cliente' }).click();
  await esperar(() => noServidor().length === 3, 'remoção chega ao servidor');
  await voltarParaTela(computador);
  await computador.waitForTimeout(800);
  assert.deepEqual(await clientesAbertos(computador), ['Sem cadastro 1', 'Sem cadastro 2', 'Sem cadastro 3']);

  // 7) Orçamento salvo no computador: o cliente sai do atendimento também no celular.
  await escolherCliente(computador, 'Sem cadastro 2');
  await computador.getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await computador.waitForURL('**/orcamentos');
  assert.equal(salvo.customerId, 'sc-2');
  assert.deepEqual(noServidor(), ['Sem cadastro 1', 'Sem cadastro 3'], 'o salvo sai do rascunho no servidor');
  await voltarParaTela(celular);
  await celular.waitForTimeout(800);
  assert.deepEqual(await clientesAbertos(celular), ['Sem cadastro 1', 'Sem cadastro 3'], 'o salvo some do celular');
  await shot(celular, '03-celular-depois-de-salvar-no-computador');

  // 8) O computador volta ao Novo orçamento com os que continuam abertos.
  await computador.goto(base + '/');
  await computador.locator('#project-name').waitFor();
  await computador.waitForTimeout(500);
  assert.deepEqual(await clientesAbertos(computador), ['Sem cadastro 1', 'Sem cadastro 3']);

  // 9) Aparelho novo: o rascunho do servidor chega enquanto cria um orçamento sem cadastro.
  //    O cliente novo vai para um atendimento próprio; nenhum cliente aberto é trocado.
  const tabletCtx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  await rotas(tabletCtx, 'tablet');
  let soltarLeitura;
  segurarLeitura = new Promise(r => { soltarLeitura = r; });
  aoCriarCliente = async () => { segurarLeitura = null; soltarLeitura(); await new Promise(r => setTimeout(r, 700)); };
  const tablet = await abrir(tabletCtx, 'tablet');
  await menuCliente(tablet);
  await tablet.getByRole('menuitem', { name: 'Orçamento sem cadastro', exact: true }).click();
  await tablet.getByRole('button', { name: 'Cliente: Sem cadastro 5' }).waitFor();
  assert.deepEqual(await clientesAbertos(tablet), ['Sem cadastro 1', 'Sem cadastro 3', 'Sem cadastro 5'], 'o novo fica ao lado dos que vieram do servidor');
  await escolherCliente(tablet, 'Sem cadastro 1');
  assert.equal(await tablet.locator('#project-name').inputValue(), 'Lavabo do celular', 'cliente vindo do servidor continua com o projeto dele');
  await esperar(() => noServidor().length === 3, 'o novo também vai ao servidor');
  assert.deepEqual(errors, []);
  console.log('OK: Novo orçamento igual no celular e no computador — rascunho antigo do celular juntado, clientes e projetos dos dois aparelhos, mudanças ao mesmo tempo juntadas, removido e salvo somem dos dois, e o rascunho que chega durante um orçamento sem cadastro não troca nenhum cliente.');
} catch (error) {
  console.error('FALHA:', error, errors);
  for (const [page, nome] of [[computador, 'erro-computador'], [celular, 'erro-celular']]) if (page && !page.isClosed()) await shot(page, nome).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
