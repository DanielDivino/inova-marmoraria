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
  if (path === '/api/designs/design-1/draft' && method === 'GET') return route.fulfill({ json: { design: { id: 'design-1', name: 'Desenho técnico', project: { id: 'project-1', name: 'Cozinha Silva', job: { customer: { name: 'Maria Silva', phone: '' } } } }, draft: { id: 'draft-1', version, document: savedDocument, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === '/api/designs/design-1' && method === 'GET') return route.fulfill({ json: { revisions: [] } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id: 'mat-1', name: 'Granito Branco Dallas', category: 'Granito', imageUrl: null }] });
  if (path === '/api/catalog') return route.fulfill({ json: catalog });
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
  await campo('Braço esquerdo', '1m80');
  await campo('Largura braço dir.', '55cm');
  // Soma das larguras maior que o comprimento: avisa e não aplica.
  await campo('Largura braço esq.', '2m30');
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
  await janela.getByLabel('Medida do lado').fill('3m');
  await janela.getByLabel('Medida do lado').press('Enter');
  assert.match(await janela.getByRole('alert').innerText(), /travados/);
  await shot('01-lado-travado');
  await janela.getByRole('button', { name: 'Pronto' }).click();
  await page.locator('.tec-painel').getByLabel('Pedra (visual e estimativa)').selectOption('mat-1');
  await botao('Cuba').click();

  // Estimativa: U + reta de Granito a R$ 600/m² e o recorte de cuba (R$ 180).
  await page.getByText('Estimativa pelo desenho. O valor do orçamento não muda.').waitFor();
  const estimativa = page.locator('.tec-lateral-estimativa');
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

  // Celular: desenho ocupando a tela, ferramentas embaixo com botões grandes e folhas que sobem.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral no celular');
  const alturas = await page.locator('.tec-ferramenta').evaluateAll(els => els.filter(el => el.getBoundingClientRect().width > 0).map(el => el.getBoundingClientRect().height));
  assert(alturas.length > 5 && alturas.every(altura => altura >= 44), 'botões das ferramentas com pelo menos 44 px: ' + alturas.join(','));
  const barra = page.locator('.tec-barra-estimativa .tec-resumo-estimativa');
  assert.equal(await barra.locator('strong').innerText(), comMontagem, 'barra da estimativa no rodapé');
  await barra.click();
  await page.locator('.tec-lateral .tec-totais').waitFor();
  await shot('03-celular-estimativa');
  await page.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await shot('04-celular');
  assert.deepEqual(errors, []);
  console.log('OK: medidas digitadas (U pelo painel, aviso de medida impossível, lado travado), estimativa com as regras do orçamento e layout do celular com ferramentas grandes e folhas.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
