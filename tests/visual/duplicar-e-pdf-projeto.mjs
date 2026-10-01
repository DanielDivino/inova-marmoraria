import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { orcamentoSalvo } from './apoio/orcamento-salvo.mjs';

// API inteiramente simulada. "Duplicar projeto" (ao lado do M² fechado, no Orçamento Rápido) cria
// outro projeto, cópia fiel do atual, logo depois dele; a cópia muda sem mexer no original e sai com
// ids próprios ao salvar. Na tela do orçamento, o Exportar (do topo e de cada projeto) tem caixinhas
// independentes — orçamento, valores individuais, desenhos em OS e desenho técnico — num PDF só. Cada
// projeto tem o seu desenho técnico (⋯ → Desenho técnico · projeto, ou "Adicionar desenho técnico").
const output = resolve(import.meta.dirname, '../../.test-artifacts/duplicar-e-pdf-projeto');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const item = (id, projectName, total) => ({ id, projectName, materialNameSnapshot: 'Preto São Gabriel', unitPriceSnapshot: 600, billedQuantity: 1.2, materialSubtotal: total, total, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null,
  components: [{ id: `${id}-k1`, label: 'Bancada', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: total, calculatedTotal: total, appliedTotal: total, hasManualPriceOverride: false, edges: [] }] });
const orcamentos = {
  q1: orcamentoSalvo('q1', { grossTotal: 1200, netTotal: 1200, items: [item('i1', 'Cozinha', 720), item('i2', 'Banheiro social', 480)] }),
  q2: orcamentoSalvo('q2', { number: 'ORC-2026-98', grossTotal: 720, netTotal: 720, items: [item('i3', 'Cozinha', 720)] }),
};
let salvo;
const pdfsPedidos = [];
const desenhosPedidos = [];
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-duplicar', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/quote-draft') return route.fulfill({ json: method === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: {
    materials: [{ id: 'stone-a', name: 'Preto São Gabriel', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }],
    productTypes: [{ id: 'counter', name: 'Bancada' }], services: [], settings: { closedSquareMeter: true },
  } });
  if (path === '/api/customers') return route.fulfill({ json: { data: [{ id: 'customer', name: 'João da Silva', phone: '92981817980' }] } });
  if (path === '/api/quotes' && method === 'POST') { salvo = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 'q1' } }); }
  if (path === '/api/quotes' && method === 'GET') return route.fulfill({ json: { data: [], total: 0 } });
  if (path === '/api/quotes/q1/status' && method === 'PATCH') return route.fulfill({ json: { status: 'SENT' } });
  if (/^\/api\/quotes\/q[12]$/.test(path) && method === 'GET') return route.fulfill({ json: orcamentos[path.split('/').at(-1)] });
  if (/^\/api\/quotes\/q[12](\/items\/[^/]+)?\/pdf$/.test(path)) { pdfsPedidos.push(path + url.search); return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' }); }
  // Só o Banheiro social (q1) tem desenho técnico.
  if (/^\/api\/quotes\/q[12]\/desenhos-tecnicos$/.test(path)) return route.fulfill({ json: { projetos: path.includes('/q1/') ? ['i2'] : [] } });
  if (/^\/api\/quotes\/q[12]\/entregas$/.test(path)) return route.fulfill({ json: { canDeliver: false, reason: null, projects: [] } });
  if (path === '/api/workers') return route.fulfill({ json: [] });
  // Desenho técnico de cada projeto: q1 ainda tem o desenho antigo do orçamento, sem projeto.
  if (/^\/api\/quotes\/q[12]\/items\/[^/]+\/technical-design$/.test(path) && method === 'POST') {
    const corpo = route.request().postDataJSON();
    desenhosPedidos.push({ path, corpo });
    if (path.startsWith('/api/quotes/q1/') && corpo.usarDoOrcamento === undefined) return route.fulfill({ status: 409, json: { error: 'UNASSIGNED_TECHNICAL_DESIGN', message: 'Este orçamento já tem um desenho técnico que ainda não foi ligado a nenhum projeto.' } });
    return route.fulfill({ status: 201, json: { designId: 'dz', editorUrl: '/projetos/pz/desenhos/dz' } });
  }
  // O editor técnico abre em seguida (fora deste teste).
  if (path.startsWith('/api/designs/')) return route.fulfill({ status: 404, json: {} });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const menuProjeto = async () => { await page.getByRole('button', { name: /^Projeto:/ }).click(); await expect(page.getByRole('menu')).toBeVisible(); };
const projetos = async () => { await menuProjeto(); const nomes = await page.getByRole('menu').getByRole('menuitemradio').allInnerTexts(); await page.keyboard.press('Escape'); return nomes.map(nome => nome.trim()); };
const escolherProjeto = async nome => { await menuProjeto(); await page.getByRole('menu').getByRole('menuitemradio', { name: nome, exact: true }).click(); };
const projetoAtivo = nome => expect(page.getByRole('button', { name: /^Projeto:/ })).toHaveAccessibleName(`Projeto: ${nome}`);
const medida = (campo, peca) => page.getByLabel(`${campo} da peça ${peca} (m)`, { exact: true });
const duplicar = page.getByRole('button', { name: 'Duplicar projeto', exact: true });
// A janela pergunta o nome do novo projeto (já vem com o do original, selecionado).
const janelaDuplicar = page.getByRole('dialog', { name: 'Duplicar projeto' });
const duplicarComo = async nome => {
  await duplicar.click();
  await janelaDuplicar.getByLabel('Nome do novo projeto').fill(nome);
  await janelaDuplicar.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await janelaDuplicar.waitFor({ state: 'detached' });
};

try {
  // 1) Projeto com duas peças no Orçamento Rápido.
  await page.goto(base + '/');
  await page.getByRole('button', { name: /^Cliente:/ }).click();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.getByRole('dialog').getByPlaceholder('Digite nome, telefone ou CPF').fill('João');
  await page.locator('.customer-result').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.locator('#project-name').fill('Cozinha');
  await page.locator('.quick-project-fields .material-picker summary').click();
  await page.locator('.quick-project-fields .material-picker-panel button').filter({ hasText: 'Preto São Gabriel' }).click();
  await medida('Comprimento', 1).fill('2,00');
  await medida('Largura', 1).fill('0,60');
  await page.getByRole('button', { name: '+ Adicionar item', exact: true }).click();
  await page.getByLabel('Tipo da peça 2', { exact: true }).selectOption('BACKSPLASH');
  await medida('Comprimento', 2).fill('2,00');
  await medida('Largura', 2).fill('0,10');
  // O botão fica ao lado do M² fechado, no topo do Orçamento Rápido.
  const acoes = page.locator('.quick-heading-acoes');
  await expect(acoes.locator('.quick-round-toggle')).toBeVisible();
  await expect(acoes.getByRole('button', { name: 'Duplicar projeto' })).toBeVisible();
  const [alturaToggle, alturaBotao] = await Promise.all([acoes.locator('.quick-round-toggle').boundingBox(), duplicar.boundingBox()]).then(caixas => caixas.map(caixa => Math.round(caixa.height)));
  assert.equal(alturaBotao, alturaToggle, 'mesma altura do M² fechado');
  await acoes.screenshot({ path: resolve(output, '01-botao-desktop.png') });
  const totalOriginal = await page.locator('.summary-grand-total').innerText(); // total do projeto

  // 2) Duplicar: a janela pede o nome (não aceita um que já existe; Cancelar não duplica).
  await duplicar.click();
  const campoNome = janelaDuplicar.getByLabel('Nome do novo projeto');
  await expect(campoNome).toHaveValue('Cozinha');
  assert.equal(await campoNome.evaluate(campo => campo.selectionEnd - campo.selectionStart), 'Cozinha'.length, 'nome do original selecionado, pronto para trocar');
  await janelaDuplicar.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await janelaDuplicar.getByRole('alert').filter({ hasText: 'Já existe um projeto com esse nome' }).waitFor();
  await page.screenshot({ path: resolve(output, '02a-janela-nome.png') });
  await janelaDuplicar.getByRole('button', { name: 'Cancelar' }).click();
  await janelaDuplicar.waitFor({ state: 'detached' });
  assert.deepEqual(await projetos(), ['Cozinha'], 'cancelar não duplica');
  // A cópia abre logo depois do original, igual a ele, com o nome escolhido.
  await duplicarComo('Cozinha gourmet');
  await projetoAtivo('Cozinha gourmet');
  await expect(page.locator('#project-name')).toHaveValue('Cozinha gourmet');
  await expect(page.locator('[data-quick-row]')).toHaveCount(2);
  await expect(medida('Comprimento', 1)).toHaveValue('2,00');
  await expect(medida('Largura', 1)).toHaveValue('0,60');
  await expect(page.getByLabel('Tipo da peça 2', { exact: true })).toHaveValue('BACKSPLASH');
  await expect(medida('Largura', 2)).toHaveValue('0,10');
  await expect(page.locator('.quick-project-fields .material-picker summary')).toContainText('Preto São Gabriel');
  await expect(page.locator('.summary-grand-total')).toHaveText(totalOriginal, { useInnerText: true });
  await shot('02-copia-aberta');

  // 3) Mudar a cópia não mexe no original.
  await medida('Comprimento', 1).fill('3,00');
  await escolherProjeto('Cozinha');
  await expect(medida('Comprimento', 1)).toHaveValue('2,00');
  await expect(page.locator('#project-name')).toHaveValue('Cozinha');

  // 4) Outra cópia do original entra logo depois dele, com o nome escolhido (Enter também duplica).
  await duplicar.click();
  await janelaDuplicar.getByLabel('Nome do novo projeto').fill('Cozinha externa');
  await page.keyboard.press('Enter');
  await projetoAtivo('Cozinha externa');
  assert.deepEqual(await projetos(), ['Cozinha', 'Cozinha externa', 'Cozinha gourmet']);

  // 5) No celular o botão continua ao lado do M² fechado, sem estourar a largura.
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(duplicar).toBeVisible();
  const [caixaToggle, caixaBotao] = await Promise.all([page.locator('.quick-round-toggle').boundingBox(), duplicar.boundingBox()]);
  assert(Math.abs(caixaToggle.y + caixaToggle.height / 2 - (caixaBotao.y + caixaBotao.height / 2)) < 4, 'na mesma linha do M² fechado');
  const caixaMaterial = await page.locator('.quick-project-fields .material-picker summary').boundingBox();
  assert(caixaBotao.x + caixaBotao.width <= caixaMaterial.x + caixaMaterial.width + 1.5, 'alinhado ao campo da pedra, sem passar da tela');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral');
  await page.locator('.quick-project-setup').screenshot({ path: resolve(output, '03-botao-celular.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 6) Ao salvar, cada projeto vai com ids próprios (peças e bordas), e as medidas da cópia alterada seguem só nela.
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).first().click();
  await page.waitForURL('**/orcamentos/q1');
  assert.deepEqual(salvo.items.map(projeto => projeto.projectName), ['Cozinha', 'Cozinha externa', 'Cozinha gourmet']);
  assert.deepEqual(salvo.items.map(projeto => projeto.components.map(peca => peca.lengthMm)), [[2000, 2000], [2000, 2000], [3000, 2000]]);
  const ids = salvo.items.flatMap(projeto => projeto.components.flatMap(peca => [peca.id, ...peca.edges.map(borda => borda.id)])).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'nenhum id repetido entre os projetos');

  // 7) Tela do orçamento: um Exportar em cada projeto, no lugar dos botões de PDF e de impressão.
  await page.getByRole('heading', { name: /ORC-2026-99/ }).waitFor();
  for (const antigo of ['PDF do projeto', 'Imprimir desenho', 'Imprimir desenho técnico']) await expect(page.getByRole('button', { name: antigo, exact: true })).toHaveCount(0);
  const cartao = nome => page.locator('.detail-card').filter({ has: page.locator('span', { hasText: nome.toUpperCase() }) });
  const opcoes = page.getByRole('region', { name: 'Opções do PDF' });
  const caixinha = rotulo => opcoes.getByLabel(rotulo, { exact: true });
  const gerar = async () => { const [popup] = await Promise.all([context.waitForEvent('page'), opcoes.getByRole('button', { name: 'Gerar PDF' }).click()]); await popup.close(); };
  // Cozinha não tem desenho técnico: opção apagada e, ao lado do Exportar, o botão para adicioná-lo.
  await expect(cartao('Cozinha').getByRole('button', { name: 'Adicionar desenho técnico' })).toBeVisible();
  await expect(cartao('Banheiro social').getByRole('button', { name: 'Adicionar desenho técnico' })).toHaveCount(0);
  await cartao('Cozinha').getByRole('button', { name: 'Exportar Cozinha' }).click();
  await expect(caixinha('Incluir desenho técnico')).toBeDisabled();
  await page.mouse.click(5, 5);
  await expect(opcoes).toHaveCount(0);

  // Banheiro social: só os desenhos (OS) e o desenho técnico, sem a folha do orçamento.
  await cartao('Banheiro social').getByRole('button', { name: 'Exportar Banheiro social' }).click();
  assert.deepEqual(await opcoes.locator('label').allInnerTexts(), ['Incluir orçamento', 'Exibir valores individuais', 'Incluir desenhos em ordem de serviço', 'Incluir desenho técnico']);
  assert.equal(await opcoes.locator('small').count(), 0, 'sem textos explicativos');
  await caixinha('Incluir orçamento').uncheck();
  await expect(caixinha('Exibir valores individuais')).toBeDisabled();
  await caixinha('Incluir desenho técnico').check();
  await cartao('Banheiro social').screenshot({ path: resolve(output, '04-exportar-do-projeto.png') });
  await page.screenshot({ path: resolve(output, '05-exportar-do-projeto-tela.png') });
  await gerar();
  // Nada marcado, nada para gerar.
  await caixinha('Incluir desenhos em ordem de serviço').uncheck();
  await caixinha('Incluir desenho técnico').uncheck();
  await expect(opcoes.getByRole('button', { name: 'Gerar PDF' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(opcoes).toHaveCount(0);

  // Exportar do topo: as mesmas caixinhas, para o orçamento todo (algum projeto tem desenho técnico).
  await page.locator('.orcamento-topo-acoes').getByRole('button', { name: 'Exportar', exact: true }).click();
  assert.equal(await opcoes.locator('small').count(), 0, 'sem textos explicativos');
  await caixinha('Exibir valores individuais').check();
  await caixinha('Incluir desenho técnico').check();
  await page.screenshot({ path: resolve(output, '06-exportar-geral.png') });
  await gerar();
  assert.deepEqual(pdfsPedidos, [
    '/api/quotes/q1/items/i2/pdf?commercial=false&individualPrices=false&drawings=true&technical=true',
    '/api/quotes/q1/pdf?commercial=true&individualPrices=true&drawings=true&technical=true',
  ]);

  // 8) Com um projeto só, o Exportar do projeto também aparece; sem desenho técnico, o botão para adicioná-lo.
  await page.goto(base + '/orcamentos/q2');
  await page.getByRole('heading', { name: /ORC-2026-98/ }).waitFor();
  await expect(page.getByRole('button', { name: 'Exportar Cozinha' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Adicionar desenho técnico' })).toHaveCount(1);

  // 9) Cada projeto tem o seu desenho técnico: no menu ⋯, um item por projeto.
  await page.goto(base + '/orcamentos/q1');
  await page.getByRole('heading', { name: /ORC-2026-99/ }).waitFor();
  await page.getByRole('button', { name: 'Mais ações do orçamento' }).click();
  const itens = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map(texto => texto.trim());
  assert(itens.includes('Desenho técnico · Cozinha') && itens.includes('Desenho técnico · Banheiro social'), JSON.stringify(itens));
  await page.getByRole('menuitem', { name: 'Desenho técnico · Cozinha' }).click();
  // O desenho antigo do orçamento (um só para todos): a pessoa decide se é deste projeto.
  const escolha = page.getByRole('alertdialog', { name: 'Usar o desenho técnico já feito neste orçamento?' });
  await escolha.waitFor();
  assert.deepEqual((await escolha.locator('.janela-acoes button').allInnerTexts()).map(texto => texto.trim()), ['Cancelar', 'Criar um novo', 'Usar este desenho']);
  await page.screenshot({ path: resolve(output, '07-desenho-antigo-do-orcamento.png') });
  await escolha.getByRole('button', { name: 'Cancelar' }).click();
  await escolha.waitFor({ state: 'detached' });
  assert.equal(desenhosPedidos.length, 1, 'cancelar não cria nem liga desenho');
  await cartao('Cozinha').getByRole('button', { name: 'Adicionar desenho técnico' }).click();
  await escolha.getByRole('button', { name: 'Criar um novo' }).click();
  await page.waitForURL('**/projetos/pz/desenhos/dz?**');
  assert.deepEqual(desenhosPedidos.map(({ path, corpo }) => [path, corpo]), [
    ['/api/quotes/q1/items/i1/technical-design', {}],
    ['/api/quotes/q1/items/i1/technical-design', {}],
    ['/api/quotes/q1/items/i1/technical-design', { usarDoOrcamento: false }],
  ]);
  assert(new URL(page.url()).searchParams.get('orcamento') === 'q1', 'o desenho volta para o orçamento');

  assert.deepEqual(errors, []);
  console.log('OK: Duplicar projeto (janela com o nome, sem repetir nome; cópia fiel, logo depois do original, independente e com ids próprios; no celular ao lado do M² fechado) e Exportar do orçamento e de cada projeto com caixinhas independentes (orçamento, valores, desenhos em OS e desenho técnico) num PDF só.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
