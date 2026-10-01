import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { centroDaPecaNoMundo, emptyTechnicalDocument, makePiece, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Área seca/molhada marcada no desenho: clicar no começo,
// levar o mouse (a faixa e o tamanho acompanham) e clicar no fim; ou arrastar e
// soltar. Depois, escolher seca ou molhada. Delete apaga a peça selecionada.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor-areas');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

let savedDocument = emptyTechnicalDocument();
savedDocument.pieces.push({ ...makePiece('balcao', 'RECTANGLE'), name: 'Balcão' });
savedDocument = technicalDocumentSchema.parse(savedDocument);
let version = 1;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-1', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'GET') return route.fulfill({ json: { design: { id: 'design-1', name: 'Desenho técnico', project: { id: 'project-1', name: 'Cozinha Silva', job: { customer: { name: 'Maria Silva', phone: '' } } } }, draft: { id: 'draft-1', version, document: savedDocument, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === '/api/designs/design-1' && method === 'GET') return route.fulfill({ json: { revisions: [] } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [] });
  if (path === '/api/catalog') return route.fulfill({ json: { productTypes: [], materials: [], services: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'PUT') {
    savedDocument = technicalDocumentSchema.parse(route.request().postDataJSON().document); version += 1;
    return route.fulfill({ json: { id: 'draft-1', version, schemaVersion: 1, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  return route.fulfill({ status: 404, json: { message: 'not mocked' } });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const salvar = async () => { await page.getByRole('button', { name: 'Salvar agora', exact: true }).click(); await page.getByText('Salvo', { exact: true }).waitFor(); };
const zonas = () => savedDocument.pieces[0]?.wetDryZones ?? [];

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/project-1/desenhos/design-1');
  await page.locator('.tec-canvas').waitFor();
  const pedra = await page.locator('.tec-pedra').first().boundingBox();
  // Ponto na tela a uma fração do comprimento do balcão (2m44), na altura do meio.
  const ponto = fracao => [pedra.x + pedra.width * fracao, pedra.y + pedra.height / 2];

  // 1) Clicar no começo, levar o mouse (a faixa mostra o tamanho) e clicar no fim.
  await page.getByRole('button', { name: 'Seca / molhada', exact: true }).click();
  await page.mouse.click(...ponto(.25));
  await page.mouse.move(...ponto(.5), { steps: 6 });
  await page.mouse.move(...ponto(.75), { steps: 6 });
  const previa = await page.locator('.tec-area-previa-rotulo').textContent();
  assert.match(previa, /^1m2\d$/, 'tamanho calculado enquanto puxa: ' + previa);
  await shot('01-puxando');
  await page.mouse.click(...ponto(.75));
  const janela = page.getByRole('dialog', { name: 'Tipo da área' });
  await janela.getByText(/^Área de 1m2\d em Balcão$/).waitFor();
  await shot('02-seca-ou-molhada');
  await janela.getByRole('button', { name: '💧 Área molhada' }).click();
  await page.locator('.tec-area-rotulo.molhada').waitFor();

  // 2) Arrastar e soltar até a ponta: área seca até o fim do balcão.
  await page.mouse.move(...ponto(.75));
  await page.mouse.down();
  await page.mouse.move(...ponto(.9), { steps: 5 });
  await page.mouse.move(pedra.x + pedra.width + 40, pedra.y + pedra.height / 2, { steps: 5 });
  await page.mouse.up();
  await janela.getByRole('button', { name: 'Área seca' }).click();
  await salvar();
  assert.equal(zonas().length, 2, JSON.stringify(zonas()));
  const [molhada, seca] = zonas();
  assert.equal(molhada.kind, 'WET');
  assert.equal(seca.kind, 'DRY');
  assert.equal(seca.endMm, 2440, 'arrastar além da ponta cola no fim do balcão');
  assert.equal(seca.startMm, molhada.endMm, 'a seca começa onde a molhada termina');
  assert(Math.abs(molhada.startMm - 610) <= 20 && molhada.startMm % 10 === 0, 'começo no centímetro: ' + molhada.startMm);
  await shot('03-areas-marcadas');

  // 3) Esc cancela uma área em andamento.
  await page.mouse.click(...ponto(.1));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Selecionar', exact: true }).waitFor();
  await page.locator('.tec-area-previa').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  assert.equal(await page.locator('.tec-area-previa').count(), 0, 'Esc cancela a área');

  // 4) Painel da peça: trocar a molhada para seca junta tudo numa área seca só.
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await page.mouse.click(pedra.x + pedra.width * .1, pedra.y + pedra.height * .8);
  const lista = page.getByRole('list', { name: 'Áreas do balcão' });
  await lista.getByText(/^Área molhada · 1m2\d$/).waitFor();
  await shot('04-painel-areas');
  await lista.getByRole('button', { name: 'Trocar para seca' }).click();
  await salvar();
  assert.deepEqual(zonas(), [{ kind: 'DRY', startMm: molhada.startMm, endMm: 2440 }]);

  // 5) Cuba: largura e comprimento lado a lado no painel; puxar a borda direita alarga só aquele lado.
  await page.getByRole('button', { name: 'Cuba', exact: true }).click();
  const painel = page.locator('.tec-painel');
  const [largura, comprimento] = [painel.getByLabel('Largura', { exact: true }), painel.getByLabel('Comprimento', { exact: true })];
  const [caixaLargura, caixaComprimento] = [await largura.boundingBox(), await comprimento.boundingBox()];
  assert(Math.abs(caixaLargura.y - caixaComprimento.y) < 2 && caixaComprimento.x > caixaLargura.x, 'largura e comprimento lado a lado');
  await salvar();
  const cubaAntes = savedDocument.features[0];
  const puxarBorda = async (lado, dx, dy) => {
    const alca = await page.locator(`.tec-alca-recurso[data-lado="${lado}"]`).boundingBox();
    const [x, y] = [alca.x + alca.width / 2, alca.y + alca.height / 2];
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
  };
  await puxarBorda('D', 60, 0);
  await shot('05-cuba-alargada');
  await salvar();
  const cubaDepois = savedDocument.features[0];
  assert(cubaDepois.widthMm > cubaAntes.widthMm && cubaDepois.widthMm % 10 === 0, 'cuba mais larga, no centímetro: ' + cubaDepois.widthMm);
  assert.equal(cubaDepois.lengthMm, cubaAntes.lengthMm, 'comprimento não mudou');
  assert.equal(cubaDepois.x - cubaDepois.widthMm / 2, cubaAntes.x - cubaAntes.widthMm / 2, 'a borda esquerda ficou parada');
  assert.equal(await largura.inputValue(), (cubaDepois.widthMm / 1000).toFixed(2).replace('.', ','), 'o painel acompanha');
  // Puxar a borda de cima para baixo encurta o comprimento; a de baixo fica parada.
  await puxarBorda('C', 0, 25);
  await salvar();
  const cubaFinal = savedDocument.features[0];
  assert(cubaFinal.lengthMm < cubaDepois.lengthMm, 'cuba mais curta: ' + cubaFinal.lengthMm);
  assert.equal(cubaFinal.y - cubaFinal.lengthMm / 2, cubaDepois.y - cubaDepois.lengthMm / 2, 'a borda de baixo ficou parada');

  // 6) Bolinha de girar: segurar e arrastar em arco gira a peça em volta do centro; o nome continua de pé.
  await page.mouse.click(pedra.x + pedra.width * .1, pedra.y + pedra.height * .8);
  const painelPeca = page.locator('section.tec-painel-secao[aria-label^="Peça"]');
  const [campoNome, campoPedra] = [await painelPeca.getByLabel('Nome', { exact: true }).boundingBox(), await painelPeca.getByLabel('Pedra (visual e estimativa)').boundingBox()];
  assert(campoPedra.y > campoNome.y && campoPedra.y - campoNome.y < 90, 'pedra logo abaixo do nome');
  const centroAntes = centroDaPecaNoMundo(savedDocument.pieces[0]);
  const bolinha = await page.locator('.tec-girar-toque').boundingBox();
  const [cx, cy] = [pedra.x + pedra.width / 2, pedra.y + pedra.height / 2];
  const raio = cy - (bolinha.y + bolinha.height / 2);
  await page.mouse.move(cx, cy - raio); await page.mouse.down();
  for (let graus = 80; graus >= -90; graus -= 10) await page.mouse.move(cx + raio * Math.cos(graus * Math.PI / 180), cy - raio * Math.sin(graus * Math.PI / 180));
  assert.equal(await page.locator('.tec-girar-graus').textContent(), '180°', 'ângulo ao lado da bolinha enquanto gira');
  await page.mouse.up();
  await page.getByText('Peça girada para 180°. Use Ctrl+Z para desfazer.').waitFor();
  await shot('06-girada');
  await salvar();
  assert.equal(savedDocument.pieces[0].rotationDeg, 180);
  const centroDepois = centroDaPecaNoMundo(savedDocument.pieces[0]);
  assert(Math.hypot(centroDepois.x - centroAntes.x, centroDepois.y - centroAntes.y) < 1, 'girou em volta do centro');
  await page.mouse.click(pedra.x + pedra.width / 2, pedra.y - 160); // desmarca: com a cuba no meio, o nome só aparece sem seleção
  // Nome e cuba na horizontal para quem olha: sem giro nem espelho na tela (a e d positivos, b e c zero).
  const naHorizontal = async (seletor) => {
    const [a, b, c, d] = await page.locator(seletor).first().evaluate((texto) => { const m = texto.getScreenCTM(); return [m.a, m.b, m.c, m.d]; });
    return a > 0 && d > 0 && Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3;
  };
  assert(await naHorizontal('.tec-peca-nome'), 'nome na horizontal com a peça a 180°');
  // A 45° (e a 90°) o nome e a cuba continuam na horizontal.
  const quadro = await page.locator('.tec-canvas').boundingBox();
  const desmarcar = () => page.mouse.click(quadro.x + 24, quadro.y + 24); // canto do quadro, sempre vazio
  const selecionarPelaLista = async () => { await desmarcar(); await page.locator('.tec-lista-pecas').getByRole('button', { name: 'Balcão' }).click(); };
  for (const graus of ['45', '90']) {
    await selecionarPelaLista();
    await painelPeca.getByLabel('Giro (graus)').fill(graus);
    await desmarcar();
    assert(await naHorizontal('.tec-peca-nome'), `nome na horizontal a ${graus}°`);
    assert(await naHorizontal('.tec-recurso-rotulo'), `nome da cuba na horizontal a ${graus}°`);
  }
  await shot('06b-girada-90');
  // Volta a 180° para os passos seguintes (a peça ocupa o mesmo lugar na tela).
  await selecionarPelaLista();
  await painelPeca.getByLabel('Giro (graus)').fill('180');
  await desmarcar();

  // 7) Nome da peça: apagar até a última letra deixa o campo vazio (não volta o nome) e salva sem nome.
  await page.mouse.click(pedra.x + pedra.width * .1, pedra.y + pedra.height * .8);
  const nome = page.locator('section.tec-painel-secao[aria-label^="Peça"]').getByLabel('Nome', { exact: true });
  await nome.click();
  await nome.press('End');
  for (let i = 0; i < 'Balcão'.length; i++) await nome.press('Backspace');
  assert.equal(await nome.inputValue(), '', 'campo do nome fica vazio');
  await salvar();
  assert.equal(savedDocument.pieces[0].name, '', 'salva sem nome');
  assert.equal(await page.locator('.tec-peca-nome').count(), 0, 'peça sem nome fica sem rótulo no desenho');

  // 8) Delete apaga a peça selecionada (com a cuba); Ctrl+Z traz de volta.
  await page.mouse.click(pedra.x + pedra.width * .1, pedra.y + pedra.height * .8);
  await page.keyboard.press('Delete');
  await page.getByText('Peça 1 excluída. Use Ctrl+Z para desfazer.').waitFor();
  assert.equal(await page.locator('.tec-pedra').count(), 0, 'peça apagada com Delete');
  await page.keyboard.press('Control+z');
  await page.locator('.tec-pedra').first().waitFor();
  await page.mouse.click(pedra.x + pedra.width * .1, pedra.y + pedra.height * .8);
  await page.keyboard.press('Delete');
  await salvar();
  assert.equal(savedDocument.pieces.length, 0, 'Delete de novo apaga e salva');
  assert.deepEqual(errors, []);
  console.log('OK: área seca/molhada marcada clicando e puxando (tamanho na hora) ou arrastando, escolha de seca ou molhada, Esc cancela, troca no painel; cuba redimensionada pelas bordas (largura e comprimento lado a lado no painel); pedra logo abaixo do nome; peça girada pela bolinha em volta do centro com o nome de pé; nome da peça pode ficar vazio; Delete apaga a peça (Ctrl+Z desfaz).');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
