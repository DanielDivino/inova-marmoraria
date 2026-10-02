import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada. Resumo do Novo orçamento sem validade (sempre 10 dias úteis, no PDF),
// sem observações e sem a opção de valores no PDF; "Vincular projeto" lista só os orçamentos do
// cliente (ou avisa que não há). Na tela do orçamento, Equipe, Prazos e as Observações do orçamento
// (as do PDF, no lugar da antiga observação do prazo) ficam juntos numa aba só.
const output = resolve(import.meta.dirname, '../../.test-artifacts/resumo-e-acompanhamento');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const maria = { id: 'c1', name: 'Maria Silva', phone: '92981817980', isQuick: false };
const clientes = [maria, { id: 'c2', name: 'João Souza', phone: '92999990000', isQuick: false }];
const orcamentosDaMaria = [
  { id: 'q1', number: 'ORC-2026-30', customerId: 'c1', customer: maria, items: [{ projectName: 'Cozinha' }, { projectName: 'Lavabo' }] },
  { id: 'q2', number: 'ORC-2026-31', customerId: 'c1', customer: maria, items: [{ projectName: 'Banheiro' }] },
];
const buscasDeOrcamentos = [];
const acompanhamentos = [];
const responsaveis = [];
const mudancasDeSituacao = [];
const contatos = [];
const orcamento = {
  id: 'q1', number: 'ORC-2026-30', customerId: 'c1', createdAt: '2026-09-29T14:00:00.000Z', status: 'APPROVED', executionStatus: 'IN_PROGRESS', approvedAt: '2026-09-29T15:00:00.000Z',
  validUntil: null, deliveryDeadline: null, installationDeadline: null, deadlineConfirmed: false, deadlineNote: 'observação antiga do prazo', notes: null,
  customerNameSnapshot: 'Maria Silva', customerPhoneSnapshot: '92981817980', discountAmount: 0, grossTotal: 720, netTotal: 720, workerAssignments: [],
  items: [{ id: 'i1', projectName: 'Cozinha', materialNameSnapshot: 'Branco Dallas', unitPriceSnapshot: 600, billedQuantity: 1.2, materialSubtotal: 720, total: 720, calculationMode: 'DIMENSIONS', productType: { name: 'Bancada' }, services: [], cutouts: [], drawingData: null,
    components: [{ id: 'k1', label: 'Bancada', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: 720, calculatedTotal: 720, appliedTotal: 720, hasManualPriceOverride: false, edges: [] }] }],
};
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-resumo', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/quote-draft') return route.fulfill({ json: method === 'GET' ? { version: null } : { saved: true, version: 1 } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/catalog') return route.fulfill({ json: { materials: [{ id: 'stone', name: 'Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }], productTypes: [{ id: 'counter', name: 'Bancada' }], services: [], settings: { closedSquareMeter: true } } });
  if (path === '/api/customers' && method === 'POST') return route.fulfill({ status: 201, json: { id: 'sc-1', name: 'Sem cadastro 1', phone: null, isQuick: true } });
  if (path === '/api/customers') return route.fulfill({ json: { data: clientes.filter(cliente => cliente.name.includes(url.searchParams.get('search') ?? '')) } });
  if (path === '/api/quotes' && method === 'GET') {
    buscasDeOrcamentos.push(Object.fromEntries(url.searchParams));
    const cliente = url.searchParams.get('customerId');
    return route.fulfill({ json: { data: orcamentosDaMaria.filter(entrada => entrada.customerId === cliente), meta: { page: 1, limit: 50, total: 2, pages: 1 } } });
  }
  if (path === '/api/quotes/q1' && method === 'GET') return route.fulfill({ json: orcamento });
  if (path === '/api/customers/c1') return route.fulfill({ json: { ...maria, email: null, address: null, document: null, neighborhood: null, city: null, postalCode: null, complement: null, notes: null } });
  if (path === '/api/quotes/q1/contact' && method === 'PATCH') {
    const dados = route.request().postDataJSON();
    contatos.push(dados);
    Object.assign(orcamento, { customerPhoneSnapshot: dados.phone, workAddressSnapshot: dados.address });
    return route.fulfill({ json: orcamento });
  }
  // Orçamento aguardando aprovação (outra ação principal e outro menu).
  if (path === '/api/quotes/q2' && method === 'GET') return route.fulfill({ json: { ...orcamento, id: 'q2', number: 'SET-2026-20', status: 'SENT', executionStatus: 'NOT_STARTED', approvedAt: null, customerNameSnapshot: 'BRITO' } });
  if (path === '/api/quotes/q2/status' && method === 'PATCH') { mudancasDeSituacao.push(route.request().postDataJSON()); return route.fulfill({ json: { ...orcamento, id: 'q2', number: 'SET-2026-20', status: 'APPROVED', executionStatus: 'NOT_STARTED', customerNameSnapshot: 'BRITO' } }); }
  if (path === '/api/quotes/q1/worker' && method === 'PUT') {
    const { workerId } = route.request().postDataJSON();
    responsaveis.push(workerId);
    orcamento.workerAssignments = workerId ? [{ id: 'a1', assignedAt: new Date().toISOString(), releasedAt: null, colorSnapshot: '#5b7f4a', worker: { id: 'w1', name: 'Carlos', workColor: '#5b7f4a' } }] : [];
    return route.fulfill({ json: orcamento });
  }
  if (path === '/api/quotes/q1/tracking' && method === 'PATCH') {
    const corpo = route.request().postDataJSON();
    acompanhamentos.push(corpo);
    Object.assign(orcamento, corpo);
    return route.fulfill({ json: orcamento });
  }
  // Nenhum projeto com desenho técnico: o Exportar deixa a opção apagada e o cartão oferece adicioná-lo.
  if (/^\/api\/quotes\/q[12]\/desenhos-tecnicos$/.test(path)) return route.fulfill({ json: { projetos: [] } });
  if (path === '/api/quotes/q2/entregas') return route.fulfill({ json: { canDeliver: true, reason: null, projects: [] } });
  if (path === '/api/quotes/q1/historico') {
    const agora = Date.now();
    return route.fulfill({ json: {
      marcos: [{ rotulo: 'Emissão', data: '2026-09-29' }, { rotulo: 'Validade', data: '2026-10-13' }, { rotulo: 'Aprovação', data: '2026-09-29' }, { rotulo: 'Data limite', data: null }, { rotulo: 'Entrega', data: null }],
      eventos: [
        { id: 'e5', data: new Date(agora - 60_000).toISOString(), titulo: 'Prazos atualizados', detalhe: 'Entrega acordada: 20/10/2026 · Prazo confirmado com o cliente', usuario: 'Ana', tom: 'azul', icone: 'prazo' },
        { id: 'e4', data: new Date(agora - 3_600_000).toISOString(), titulo: 'Carlos assumiu o serviço', tom: 'azul', icone: 'equipe' },
        { id: 'e3', data: new Date(agora - 86_400_000).toISOString(), titulo: 'Serviço iniciado', usuario: 'Ana', tom: 'azul', icone: 'situacao' },
        { id: 'e2', data: new Date(agora - 10 * 86_400_000 + 60_000).toISOString(), titulo: 'Orçamento aprovado', usuario: 'Ana', tom: 'verde', icone: 'situacao' },
        { id: 'e1', data: new Date(agora - 10 * 86_400_000).toISOString(), titulo: 'Orçamento criado', usuario: 'Ana', tom: 'neutro', icone: 'criado' },
      ],
    } });
  }
  if (path === '/api/quotes/q1/entregas') return route.fulfill({ json: { canDeliver: true, reason: null, projects: [] } });
  if (path === '/api/workers') return route.fulfill({ json: [{ id: 'w1', name: 'Carlos', workColor: '#5b7f4a' }] });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const menuCliente = async () => { await page.getByRole('button', { name: /^Cliente:/ }).click(); await page.getByRole('menu').waitFor(); };
const vincular = () => page.locator('.quote-summary-card .quote-linker');

try {
  // 1) Resumo do Novo orçamento: sem validade, sem observações e sem a opção de valores no PDF.
  await page.goto(base + '/');
  await page.locator('#project-name').waitFor();
  for (const campo of ['Validade do orçamento', 'Observações do orçamento', 'Valores no PDF']) assert.equal(await page.getByLabel(campo, { exact: true }).count(), 0, `${campo} saiu do resumo`);
  assert.equal(await page.getByText('PDF do orçamento', { exact: true }).count(), 0);

  // 2) Vincular sem cliente: pede o cliente. Com a Maria: só os orçamentos dela.
  await vincular().locator('summary').click();
  await vincular().getByText('Selecione o cliente para visualizar os orçamentos vinculados.').waitFor();
  await menuCliente();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill('Maria');
  await page.locator('.customer-result').filter({ hasText: 'Maria Silva' }).click();
  await vincular().getByRole('button', { name: /ORC-2026-30/ }).waitFor();
  assert.deepEqual(await vincular().locator('.customer-result').allInnerTexts().then(textos => textos.map(texto => texto.replace(/\s+/g, ' ').trim())), ['ORC-2026-30 Cozinha · Lavabo', 'ORC-2026-31 Banheiro']);
  assert(buscasDeOrcamentos.every(busca => busca.customerId === 'c1'), 'busca só pelo cliente: ' + JSON.stringify(buscasDeOrcamentos));
  await vincular().scrollIntoViewIfNeeded();
  await shot('01-vincular-projetos-do-cliente');

  // 3) Cliente sem orçamentos: avisa ao abrir.
  await menuCliente();
  await page.getByRole('menuitem', { name: 'Orçamento sem cadastro', exact: true }).click();
  await page.getByRole('button', { name: 'Cliente: Sem cadastro 1' }).waitFor();
  if (!(await vincular().evaluate(el => el.open))) await vincular().locator('summary').click();
  await vincular().getByText('Não há orçamentos vinculados a este cliente.').waitFor();
  await vincular().scrollIntoViewIfNeeded();
  await shot('02-vincular-sem-projetos');

  // 4) Topo: caminho até o orçamento, número com a situação, cliente, criação e validade; em produção,
  //    a ação principal é "Marcar como entregue" e as outras ficam no menu "⋯".
  await page.goto(base + '/orcamentos/q1');
  await page.getByRole('heading', { name: 'ORC-2026-30' }).waitFor();
  const topo = page.locator('.orcamento-topo');
  assert.equal((await topo.locator('.orcamento-topo-meta').innerText()).replace(/\s+/g, ' ').trim(), 'Cliente Maria Silva Criado em 29/09/2026 Validade 13/10/2026');
  await topo.getByRole('button', { name: 'Marcar como entregue' }).waitFor();
  // Status no topo, à esquerda do Exportar.
  const status = topo.getByRole('combobox', { name: 'Status do orçamento' });
  assert.equal(await status.inputValue(), 'IN_PRODUCTION');
  const [caixaStatus, caixaExportar] = await Promise.all([status.boundingBox(), topo.getByRole('button', { name: /Exportar/ }).boundingBox()]);
  assert(caixaStatus.x + caixaStatus.width <= caixaExportar.x && Math.abs(caixaStatus.y - caixaExportar.y) < 6, 'status à esquerda do Exportar');
  // Lápis ao lado do cliente: edita o contato (telefone, endereço…) e o orçamento passa a mostrá-lo.
  await topo.getByRole('button', { name: 'Editar contato do cliente' }).click();
  const janela = page.getByRole('dialog', { name: 'Editar contato' });
  await janela.getByLabel('Nome').waitFor();
  assert.equal(await janela.getByLabel('Nome').inputValue(), 'Maria Silva');
  await janela.getByLabel('Telefone').fill('92991234567');
  await janela.getByLabel('Endereço da obra').fill('Rua das Pedras, 10');
  await page.screenshot({ path: resolve(output, '08-editar-contato.png') });
  await janela.getByRole('button', { name: 'Salvar contato' }).click();
  await janela.waitFor({ state: 'detached' });
  assert.equal(contatos.at(-1).phone, '92991234567');
  assert.equal(contatos.at(-1).address, 'Rua das Pedras, 10');
  assert.equal(contatos.at(-1).email, null, 'campo vazio vai como não informado');
  // Esc fecha sem salvar.
  await topo.getByRole('button', { name: 'Editar contato do cliente' }).click();
  await janela.getByLabel('Nome').waitFor();
  await page.keyboard.press('Escape');
  await janela.waitFor({ state: 'detached' });
  assert.equal(contatos.length, 1);
  const itensDoMenu = async () => { await page.getByRole('button', { name: 'Mais ações do orçamento' }).click(); const itens = await page.getByRole('menu').getByRole('menuitem').allInnerTexts(); return itens.map(texto => texto.trim()); };
  assert.deepEqual(await itensDoMenu(), ['Editar orçamento', 'Desenho técnico', 'Vincular complemento', 'Desmontagem / Remontagem', 'Marcar em retrabalho', 'Parar produção', 'Cliente desistiu']);
  await page.keyboard.press('Escape');
  // Aguardando aprovação: "Confirmar aprovação" em destaque; não aprovado e cancelar no menu.
  await page.goto(base + '/orcamentos/q2');
  await page.getByRole('heading', { name: 'SET-2026-20' }).waitFor();
  assert.deepEqual(await itensDoMenu(), ['Editar orçamento', 'Desenho técnico', 'Vincular complemento', 'Desmontagem / Remontagem', 'Marcar como não aprovado', 'Cancelar orçamento']);
  await page.screenshot({ path: resolve(output, '06-topo-e-menu.png'), clip: { x: 230, y: 80, width: 1050, height: 420 } });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Confirmar aprovação' }).click();
  // A janela pergunta quais projetos o cliente aprovou (aqui, o único projeto).
  const aprovacao = page.getByRole('dialog', { name: 'Confirmar aprovação' });
  await aprovacao.getByText('Confirmar que o cliente aprovou o projeto “Cozinha”?').waitFor();
  await aprovacao.getByRole('button', { name: 'Confirmar aprovação' }).click();
  await aprovacao.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert.deepEqual(mudancasDeSituacao, [{ status: 'APPROVED' }]);
  await page.getByRole('button', { name: 'Iniciar serviço' }).waitFor();

  // 5) Histórico: botão ao lado dos selos da situação; a janela mostra os marcos e a linha do tempo por dia.
  await page.goto(base + '/orcamentos/q1');
  await page.getByRole('heading', { name: 'Equipe, prazo e observação' }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: 'Seções do acompanhamento' }).count(), 0, 'sem abas: Histórico virou botão');
  assert.equal(await page.locator('.quote-workbench').getByText('92981817980').count(), 0, 'cliente só no topo');
  const botaoHistorico = page.locator('.orcamento-topo-nome').getByRole('button', { name: 'Histórico' });
  await botaoHistorico.click();
  const historico = page.getByRole('dialog', { name: 'Histórico do orçamento' });
  await historico.getByText('13/10/2026').waitFor(); // validade: 10 dias úteis após a emissão
  const linha = historico.getByRole('list', { name: 'Linha do tempo' });
  const dezDiasAtras = new Date(Date.now() - 10 * 86_400_000).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Manaus' }).toUpperCase();
  assert.deepEqual(await linha.locator('h3').allInnerTexts(), ['HOJE', 'ONTEM', dezDiasAtras]);
  assert.deepEqual(await linha.locator('.historico-titulo strong').allInnerTexts(), ['Prazos atualizados', 'Carlos assumiu o serviço', 'Serviço iniciado', 'Orçamento aprovado', 'Orçamento criado']);
  await historico.getByText('Entrega acordada: 20/10/2026 · Prazo confirmado com o cliente').waitFor();
  await page.screenshot({ path: resolve(output, '09-historico.png') });
  await page.keyboard.press('Escape');
  await historico.waitFor({ state: 'detached' });

  // 6) Equipe, Prazos e Observações do orçamento juntos, salvos de uma vez.
  for (const bloco of ['Equipe', 'Prazos', 'Observações do orçamento']) await page.getByRole('region', { name: bloco }).waitFor();
  assert.equal(await page.getByText('Observação do prazo').count(), 0, 'a observação do prazo saiu');
  assert.equal(await page.getByText('observação antiga do prazo').count(), 0);
  const salvar = page.getByRole('button', { name: 'Salvar alterações', exact: true });
  assert.equal(await salvar.isDisabled(), true, 'sem mudanças, nada a salvar');
  // Descartar volta ao que está salvo.
  await page.getByRole('textbox', { name: 'Observações do orçamento' }).fill('rascunho qualquer');
  await page.getByRole('button', { name: 'Descartar', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Observações do orçamento' }).inputValue(), '');
  assert.equal(await salvar.isDisabled(), true);
  await page.getByLabel('Responsável pela execução').selectOption('w1');
  await page.getByLabel('Entrega acordada').fill('2026-10-20');
  await page.getByLabel('Prazo confirmado com o cliente').check();
  await page.getByRole('textbox', { name: 'Observações do orçamento' }).fill('Conferir medidas no local.');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Salvo' }).waitFor();
  assert.deepEqual(acompanhamentos.at(-1), { deliveryDeadline: '2026-10-20', installationDeadline: null, deadlineConfirmed: true, notes: 'Conferir medidas no local.' });
  assert.deepEqual(responsaveis, ['w1'], 'o responsável é salvo junto com a aba');
  assert.equal(await page.getByLabel('Responsável pela execução').inputValue(), 'w1');
  await shot('03-equipe-prazo-observacao');
  // Desmarcar a confirmação também é salvo (antes se perdia).
  await page.getByLabel('Prazo confirmado com o cliente').uncheck();
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(acompanhamentos.at(-1).deadlineConfirmed, false);

  // 7) Cada projeto: um Exportar só; sem desenho técnico, o botão para adicioná-lo fica ao lado.
  const impressoes = page.locator('#projeto-i1 .projeto-impressoes');
  assert.deepEqual((await impressoes.locator('a, button').allInnerTexts()).map(texto => texto.trim()), ['Exportar', 'Adicionar desenho técnico']);
  await impressoes.getByRole('button', { name: 'Exportar Cozinha' }).click();
  const opcoesDoProjeto = impressoes.getByRole('region', { name: 'Opções do PDF' });
  assert.equal(await opcoesDoProjeto.getByLabel('Incluir ordem de serviço').isEnabled(), true, 'a OS sai mesmo sem desenho técnico (com as peças)');
  await opcoesDoProjeto.scrollIntoViewIfNeeded();
  await shot('07-exportar-projeto');
  await page.keyboard.press('Escape');
  await opcoesDoProjeto.waitFor({ state: 'detached' });

  // 8) Celular e tema escuro, sem rolagem lateral.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral no celular');
  await page.locator('.quote-workbench').screenshot({ path: resolve(output, '04-celular.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(output, '04-celular-topo.png') });
  await page.evaluate(() => document.documentElement.classList.add('inova-dark'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  await page.locator('.quote-workbench').screenshot({ path: resolve(output, '05-escuro.png') });
  // Tema escuro de verdade: nenhum fundo claro no painel, nos blocos e nos campos.
  const fundosClaros = await page.evaluate(() => [...document.querySelectorAll('.quote-workbench, .quote-workbench-bloco, .quote-workbench-rodape, .quote-workbench :is(select, input:not([type=checkbox]), textarea)')].flatMap((elemento) => {
    const [r, g, b] = getComputedStyle(elemento).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? [`${elemento.className || elemento.tagName}: ${getComputedStyle(elemento).backgroundColor}`] : [];
  }));
  assert.deepEqual(fundosClaros, [], 'no tema escuro o painel não fica branco');
  assert.deepEqual(errors, []);
  console.log('OK: resumo sem validade, observações e opção de valores no PDF; vincular mostra só os orçamentos do cliente (ou "sem projetos"); topo com situação, ação principal e menu ⋯ conforme a situação; Equipe, prazo e observação do orçamento salvos juntos (com Descartar), no celular e no tema escuro.');
} catch (error) {
  console.error('FALHA:', error, errors);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
