import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Medidas digitadas (peça em U pelo painel, lado travado
// que impede fechar a forma), estimativa pelo desenho com o catálogo simulado
// (mesmas regras do orçamento) e o layout do celular (ferramentas embaixo, folhas).
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor-medidas');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

let savedDocument = emptyTechnicalDocument();
let version = 1;
const catalog = {
  productTypes: [],
  materials: [{ id: 'mat-1', name: 'Granito Branco Dallas', category: 'Granito', billingUnit: 'SQUARE_METER', currentPrice: 600, images: [] }],
  services: [{ id: 's-cuba', name: 'Recorte de cuba', category: 'Recortes', billingUnit: 'UNIT', currentPrice: 180 }, { id: 's-montagem', name: 'Instalação/Montagem', category: 'Serviços', billingUnit: 'FIXED', currentPrice: 300 }],
};
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-1', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'GET') return route.fulfill({ json: { design: { id: 'design-1', name: 'Desenho técnico', project: { id: 'project-1', name: 'Cozinha Silva', job: { customer: { name: 'Maria Silva', phone: '' } } } }, draft: { id: 'draft-1', version, document: savedDocument, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === '/api/designs/design-1' && method === 'GET') return route.fulfill({ json: { revisions: [] } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id: 'mat-1', name: 'Granito Branco Dallas', category: 'Granito', imageUrl: null }] });
  // M² fechado desligado: aqui se confere a geometria (a área nova entra exata); o M² fechado tem roteiro próprio.
  if (path === '/api/catalog') return route.fulfill({ json: { ...catalog, settings: { closedSquareMeter: false } } });
  if (path === '/api/designs/design-1/draft' && method === 'PUT') {
    savedDocument = technicalDocumentSchema.parse(route.request().postDataJSON().document); version += 1;
    return route.fulfill({ json: { id: 'draft-1', version, schemaVersion: 1, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  return route.fulfill({ status: 404, json: { message: 'not mocked' } });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const botao = name => page.getByRole('button', { name, exact: true });
const campo = async (rotulo, valor) => { const entrada = page.locator('.tec-painel').getByLabel(rotulo, { exact: true }); await entrada.fill(valor); await entrada.press('Enter'); await page.waitForTimeout(120); };
const clicarNoCentro = async locator => { const box = await locator.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(150); };

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/project-1/desenhos/design-1');
  await page.locator('.tec-editor').waitFor();
  await botao('📐 Manual').click();

  // Peça em U com braços e larguras diferentes, digitados no painel.
  await botao('Em U').click();
  // Só números: a vírgula entra sozinha (180 → 1,80 m), como no Orçamento Rápido.
  const braco = page.locator('.tec-painel').getByLabel('Braço esquerdo', { exact: true });
  await braco.click(); await braco.press('Control+a'); await page.keyboard.type('180');
  assert.equal(await braco.inputValue(), '1,80');
  await braco.press('Enter'); await page.waitForTimeout(120);
  await campo('Largura braço dir.', '55');
  // Soma das larguras maior que o comprimento: avisa e não aplica.
  await campo('Largura braço esq.', '230');
  assert.match(await page.locator('.tec-painel .tec-aviso').innerText(), /larguras dos braços/);
  await page.locator('.tec-painel').getByLabel('Pedra (visual e estimativa)').selectOption('mat-1');

  // Reta: com os outros três lados travados, mudar o primeiro não fecha a forma.
  await botao('Reta').click();
  for (const indice of [1, 2, 3]) {
    await page.locator('.tec-lados .tec-lado-botao').nth(indice).click();
    await page.getByRole('dialog', { name: new RegExp(`^Lado ${indice + 1}`) }).getByRole('button', { name: /Travar este lado/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pronto' }).click();
  }
  await page.locator('.tec-lados .tec-lado-botao').nth(0).click();
  const janela = page.getByRole('dialog', { name: /^Lado 1/ });
  await janela.getByLabel('Medida do lado').fill('300');
  await janela.getByLabel('Medida do lado').press('Enter');
  assert.match(await janela.getByRole('alert').innerText(), /travados/);
  await shot('01-lado-travado');
  await janela.getByRole('button', { name: 'Pronto' }).click();
  await page.locator('.tec-painel').getByLabel('Pedra (visual e estimativa)').selectOption('mat-1');
  await botao('Cuba').click();

  // Estimativa: começa fechada (só o total na barra); um clique abre. U + reta de Granito a R$ 600/m² e o recorte de cuba (R$ 180).
  const estimativa = page.locator('.tec-lateral-estimativa');
  const resumo = estimativa.locator('.tec-so-desktop .tec-resumo-estimativa');
  assert.equal(await resumo.getAttribute('aria-expanded'), 'false', 'estimativa fechada por padrão');
  assert.equal(await estimativa.locator('.tec-totais').count(), 0, 'sem o corpo da estimativa até abrir');
  await resumo.click();
  await page.getByText('Estimativa com as regras do orçamento. Não muda o valor de nenhum orçamento.').waitFor();
  const total = await estimativa.locator('.tec-totais div').first().locator('dd').innerText();
  await estimativa.getByLabel('Adicionar serviço do projeto').selectOption('s-montagem');
  const comMontagem = await estimativa.locator('.tec-totais div').first().locator('dd').innerText();
  const numero = texto => Number(texto.replace(/[^\d,]/g, '').replace(',', '.'));
  assert.equal(Math.round((numero(comMontagem) - numero(total)) * 100), 30000, 'montagem soma R$ 300');
  await shot('02-estimativa');

  await botao('Salvar agora').click();
  await page.getByText('Salvo', { exact: true }).waitFor();
  const [pecaU, reta] = savedDocument.pieces;
  const bracos = pecaU.parameters;
  assert.equal(bracos.shape, 'U');
  assert.equal(bracos.leftArm, 1800);
  assert.equal(bracos.rightArmWidth, 550);
  assert.equal(bracos.leftArmWidth, 600, 'largura inválida não foi aplicada');
  assert.equal(reta.lockedEdges.length, 3);
  assert.equal(Math.round(Math.hypot(reta.contour[1].x - reta.contour[0].x, reta.contour[1].y - reta.contour[0].y)), 2440, 'lado 1 não mudou');
  // Mesma conta do orçamento: área do contorno × R$ 600 + cuba (R$ 180).
  const areaU = (2600 * 600 + 600 * (1800 - 600) + 550 * (1500 - 600)) / 1e6, areaReta = 2440 * 650 / 1e6;
  assert.equal(numero(total), Math.round((areaU * 600 + areaReta * 600 + 180) * 100) / 100, 'total da estimativa');

  // Puxar um lado inteiro: os dois cantos andam juntos e os lados vizinhos esticam.
  const puxar = async (lado, dx, dy) => {
    const caixa = await lado.boundingBox();
    const x = caixa.x + caixa.width / 2, y = caixa.y + caixa.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200);
  };
  const medida = (contorno, i) => { const a = contorno[i], b = contorno[(i + 1) % contorno.length]; return Math.round(Math.hypot(b.x - a.x, b.y - a.y)); };
  // Reta com os lados 2 e 4 travados: puxar o lado 1 mudaria os dois, então avisa e não mexe.
  await puxar(page.locator('.tec-peca').nth(1).locator('.tec-lado').nth(0), 0, 40);
  assert.match(await page.locator('.tec-mensagem').innerText(), /lados vizinhos estão travados/);
  // U: puxar o lado de fora do braço direito para a direita alarga a peça.
  const antes = savedDocument.pieces[0].contour.map((vertice) => ({ ...vertice }));
  await puxar(page.locator('.tec-peca').nth(0).locator('.tec-lado').nth(5), 45, 0);
  await shot('03-lado-puxado');
  await botao('Salvar agora').click();
  await page.getByText('Salvo', { exact: true }).waitFor();
  const depois = savedDocument.pieces[0].contour;
  const avanco = depois[5].x - antes[5].x;
  assert(avanco >= 100 && avanco % 10 === 0, 'lado andou para fora em centímetros inteiros: ' + avanco);
  assert.equal(depois[6].x - antes[6].x, avanco, 'os dois cantos do lado andam juntos');
  assert.equal(medida(depois, 5), medida(antes, 5), 'o lado puxado mantém a medida');
  assert.equal(medida(depois, 4), medida(antes, 4) + avanco, 'lado de baixo do braço direito esticou junto');
  assert.equal(medida(depois, 6), medida(antes, 6) + avanco, 'fundo esticou junto');
  assert.equal(savedDocument.pieces[0].geometryMode, 'FREE');
  assert.deepEqual(savedDocument.pieces[1].contour.map((v) => [v.x, v.y]), reta.contour.map((v) => [v.x, v.y]), 'a reta travada não mudou');
  // A estimativa acompanha o desenho: entra a área acrescentada (avanço × 1m50 do braço) a R$ 600/m².
  const totalDepois = await estimativa.locator('.tec-totais div').first().locator('dd').innerText();
  assert.equal(Math.round((numero(totalDepois) - numero(comMontagem)) * 100), Math.round(avanco * 1500 / 1e6 * 600 * 100), 'estimativa com a área nova');

  // Celular: desenho ocupando a tela, ferramentas embaixo com botões grandes e folhas que sobem.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral no celular');
  const alturas = await page.locator('.tec-ferramenta').evaluateAll(els => els.filter(el => el.getBoundingClientRect().width > 0).map(el => el.getBoundingClientRect().height));
  assert(alturas.length > 5 && alturas.every(altura => altura >= 44), 'botões das ferramentas com pelo menos 44 px: ' + alturas.join(','));
  const barra = page.locator('.tec-barra-estimativa .tec-resumo-estimativa');
  assert.equal(await barra.locator('strong').innerText(), totalDepois, 'barra da estimativa no rodapé');
  await barra.click();
  await page.locator('.tec-lateral .tec-totais').waitFor();
  await shot('03-celular-estimativa');
  await page.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await shot('04-celular');
  assert.deepEqual(errors, []);
  console.log('OK: medidas só com números (vírgula automática), U pelo painel, aviso de medida impossível, lado travado, puxar lado inteiro (vizinhos acompanham; bloqueio com vizinho travado), estimativa com as regras do orçamento e layout do celular.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
