import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada. Listas dos selects no estilo dos filtros (mouse, teclado, toque e dentro de
// janela), confirmações como janelas do sistema (no lugar do confirm do navegador) e as janelas antigas
// no mesmo padrão (título com ícone e X, corpo e rodapé com os botões).
const output = resolve(import.meta.dirname, '../../.test-artifacts/janelas-e-listas');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));
// Nenhum confirm/alert do navegador deve aparecer.
page.on('dialog', dialog => { errors.push('diálogo do navegador: ' + dialog.message()); void dialog.dismiss(); });

const maria = { id: 'c1', name: 'Maria Silva', phone: '92981817980', isQuick: false };
const item = { id: 'i1', projectName: 'Cozinha', productTypeId: 'counter', materialId: 'stone', materialNameSnapshot: 'Branco Dallas', unitPriceSnapshot: 600, billingUnitSnapshot: 'SQUARE_METER', billedQuantity: 1.2, materialSubtotal: 720, total: 720, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null,
  components: [{ id: 'k1', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: 720, calculatedTotal: 720, appliedTotal: 720, hasManualPriceOverride: false, edges: [] }] };
const orcamento = { id: 'q1', number: 'SET-2026-20', customerId: 'c1', customer: maria, createdAt: '2026-09-29T14:00:00.000Z', updatedAt: '2026-09-29T15:00:00.000Z', status: 'SENT', executionStatus: 'NOT_STARTED', approvedAt: null,
  validUntil: '2026-10-13T00:00:00.000Z', deadlineConfirmed: false, notes: null, customerNameSnapshot: 'BRITO', customerPhoneSnapshot: null, discountAmount: 0, grossTotal: 720, netTotal: 720, workerAssignments: [], items: [item] };
const situacoes = [];
const catalogo = { materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }, { id: 'stone-2', name: 'Preto São Gabriel', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 700, images: [] }], productTypes: [{ id: 'counter', name: 'Bancada' }],
  services: [{ id: '45', name: 'Acabamento 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 70 }, { id: 'sink', name: 'Recorte de cuba', category: 'Recortes', billingUnit: 'UNIT', currentPrice: 150 }], settings: { closedSquareMeter: true } };
await context.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-janelas', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  // Projetos com desenho técnico (Exportar do orçamento): nenhum.
  if (/^\/api\/quotes\/[^/]+\/desenhos-tecnicos$/.test(path)) return route.fulfill({ json: { projetos: [] } });
  if (path === '/api/quote-draft') return route.fulfill({ json: method === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: catalogo });
  if (path === '/api/customers') return route.fulfill({ json: { data: [maria] } });
  if (path === '/api/customers/c1') return route.fulfill({ json: { ...maria, email: null, address: null } });
  if (path === '/api/quotes/q1' && method === 'GET') return route.fulfill({ json: orcamento });
  if (path === '/api/quotes/q1/status' && method === 'PATCH') { const corpo = route.request().postDataJSON(); situacoes.push(corpo); Object.assign(orcamento, { status: corpo.status, executionStatus: corpo.executionStatus ?? orcamento.executionStatus }); return route.fulfill({ json: orcamento }); }
  if (path === '/api/quotes/q1/entregas') return route.fulfill({ json: { canDeliver: true, reason: null, projects: [] } });
  if (path === '/api/workers') return route.fulfill({ json: [{ id: 'w1', name: 'Carlos', workColor: '#5b7f4a' }, { id: 'w2', name: 'Diego', workColor: '#a2653a' }] });
  if (path === '/api/users' && method === 'GET') return route.fulfill({ json: [] });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const shot = (nome, opcoes = {}) => page.screenshot({ path: resolve(output, nome + '.png'), ...opcoes });
const lista = () => page.getByRole('listbox');
const opcoes = async () => (await lista().getByRole('option').allInnerTexts()).map(texto => texto.trim());

try {
  // 1) Status no topo do orçamento: a lista abre no estilo dos filtros, com o escolhido marcado.
  await page.goto(base + '/orcamentos/q1');
  const status = page.getByRole('combobox', { name: 'Status do orçamento' });
  await status.click();
  await lista().waitFor();
  assert((await opcoes()).includes('Aguardando aprovação'), JSON.stringify(await opcoes()));
  assert.equal(await lista().getByRole('option', { selected: true }).innerText(), 'Aguardando aprovação');
  assert.equal(await status.getAttribute('aria-expanded'), 'true');
  await shot('01-lista-do-status', { clip: { x: 230, y: 60, width: 1050, height: 560 } });
  // Clique fora fecha sem mudar.
  await page.mouse.click(700, 600);
  await lista().waitFor({ state: 'detached' });
  assert.deepEqual(situacoes, []);
  // Teclado: seta abre, setas andam, Enter escolhe.
  await status.focus();
  await page.keyboard.press('ArrowDown');
  await lista().waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await lista().waitFor({ state: 'detached' });
  // De "aguardando" para aprovado, a janela de aprovação pergunta antes (quais projetos o cliente aprovou).
  const aprovacao = page.getByRole('dialog', { name: 'Confirmar aprovação' });
  await aprovacao.getByRole('button', { name: 'Confirmar aprovação' }).click();
  await aprovacao.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert.equal(situacoes.length, 1, 'escolher pelo teclado muda o status');
  assert.equal(situacoes[0].status, 'APPROVED');
  // Mouse: escolhe clicando na opção.
  await status.click();
  await lista().getByRole('option', { name: 'Aguardando aprovação' }).click();
  await page.waitForTimeout(300);
  assert.equal(situacoes.at(-1).status, 'SENT');
  // Esc fecha a lista sem mudar.
  await status.click();
  await page.keyboard.press('Escape');
  await lista().waitFor({ state: 'detached' });
  assert.equal(situacoes.length, 2);

  // 2) Confirmação como janela do sistema: "Cancelar orçamento" pergunta antes, com o botão vermelho.
  await page.getByRole('button', { name: 'Mais ações do orçamento' }).click();
  await page.getByRole('menuitem', { name: 'Cancelar orçamento' }).click();
  const pergunta = page.getByRole('alertdialog', { name: 'Cancelar orçamento?' });
  await pergunta.waitFor();
  await pergunta.getByText('O orçamento será cancelado e permanecerá disponível para consulta no Histórico.').waitFor();
  await shot('02-confirmacao');
  await pergunta.getByRole('button', { name: 'Voltar', exact: true }).click();
  await pergunta.waitFor({ state: 'detached' });
  assert.equal(situacoes.length, 2, 'voltar não cancela');
  await page.getByRole('button', { name: 'Mais ações do orçamento' }).click();
  await page.getByRole('menuitem', { name: 'Cancelar orçamento' }).click();
  await page.keyboard.press('Escape');
  await pergunta.waitFor({ state: 'detached' });
  assert.equal(situacoes.length, 2, 'Esc não cancela');
  await page.getByRole('button', { name: 'Mais ações do orçamento' }).click();
  await page.getByRole('menuitem', { name: 'Cancelar orçamento' }).click();
  await pergunta.getByRole('button', { name: 'Cancelar orçamento', exact: true }).click();
  await page.waitForTimeout(300);
  assert.deepEqual(situacoes.at(-1), { status: 'CANCELLED', reason: 'Cancelado no acompanhamento comercial' });

  // 3) Lista dentro de uma janela (Responsável da equipe fica na aba; Perfil no cadastro de vendedor).
  await page.goto(base + '/usuarios');
  await page.getByRole('button', { name: /Cadastrar vendedor|Novo vendedor|Novo usuário/ }).first().click();
  const cadastro = page.getByRole('dialog', { name: 'Cadastrar vendedor' });
  await cadastro.waitFor();
  const perfil = cadastro.getByLabel('Perfil');
  await perfil.click();
  await lista().waitFor();
  assert(await cadastro.locator('[role=listbox]').count() === 1, 'a lista fica dentro da janela (por cima dela)');
  await shot('03-janela-com-lista');
  const escolhido = (await opcoes()).at(-1);
  await lista().getByRole('option', { name: escolhido }).click();
  assert.equal(await perfil.evaluate(el => el.selectedOptions[0].text), escolhido);
  await cadastro.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await cadastro.waitFor({ state: 'detached' });

  // 4) Janelas do Novo orçamento no mesmo padrão: cliente e acabamentos.
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  await page.getByRole('button', { name: /^Cliente:/ }).click();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  const cliente = page.getByRole('dialog', { name: 'Selecionar cliente' });
  await cliente.locator('.janela-cabecalho').waitFor();
  await shot('04-janela-cliente');
  await cliente.getByRole('button', { name: 'Fechar seleção de cliente' }).click();
  await page.getByRole('button', { name: '+ Acabamentos', exact: true }).click();
  const acabamentos = page.getByRole('dialog', { name: 'Acabamentos da peça' });
  await acabamentos.getByRole('button', { name: 'Concluir', exact: true }).waitFor();
  await shot('05-janela-acabamentos');
  await acabamentos.getByRole('button', { name: 'Concluir', exact: true }).click();
  await acabamentos.waitFor({ state: 'detached' });

  // 5) Celular: tocar no select abre a nossa lista; a janela vira folha presa embaixo.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/orcamentos/q1');
  await status.waitFor();
  await status.click();
  await lista().waitFor();
  const caixa = await lista().boundingBox();
  assert(caixa.x >= 0 && caixa.x + caixa.width <= 390, 'a lista cabe na tela do celular');
  await shot('06-celular-lista');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Editar contato do cliente' }).click();
  const contato = page.getByRole('dialog', { name: 'Editar contato' });
  await contato.waitFor();
  const folha = await contato.boundingBox();
  assert(Math.abs(folha.y + folha.height - 844) < 2, 'no celular a janela fica presa embaixo');
  await shot('07-celular-janela');
  assert.deepEqual(errors, []);
  console.log('OK: listas dos selects no estilo dos filtros (mouse, teclado, Esc, clique fora, dentro de janela e no celular), confirmações como janelas do sistema (Voltar/Esc não fazem nada; confirmar faz) e janelas de cliente, acabamentos, cadastro e contato no mesmo padrão.');
} catch (error) {
  console.error('FALHA:', error, errors);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
