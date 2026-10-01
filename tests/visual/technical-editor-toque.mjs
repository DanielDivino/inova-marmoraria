import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Desenho com o dedo no celular (toques reais do Chromium
// via CDP, que viram Pointer Events "touch"): retângulo torto organizado em esquadro,
// escala pela medida digitada, segundo dedo cancelando o traço (palma apoiada),
// pinça fazendo zoom e cuba desenhada dentro da peça. Confere o contorno salvo.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor-toque');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

let savedDocument = emptyTechnicalDocument();
let version = 1;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-1', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
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
const cdp = await context.newCDPSession(page);
const toque = (type, pontos) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pontos.map(([x, y], id) => ({ x, y, id })) });
let semente = 3;
const tremor = () => { semente = (semente * 16807) % 2147483647; return (semente / 2147483647 - .5) * 6; };
async function tracar(cantos) {
  const caminho = [...cantos, [cantos[0][0] + 4, cantos[0][1] + 3]];
  await toque('touchStart', [caminho[0]]);
  for (let i = 0; i < caminho.length - 1; i++) {
    const [ax, ay] = caminho[i], [bx, by] = caminho[i + 1];
    for (let k = 1; k <= 14; k++) { const t = k / 14; await toque('touchMove', [[ax + (bx - ax) * t + tremor(), ay + (by - ay) * t + tremor()]]); }
  }
  await toque('touchEnd', []);
  await page.waitForTimeout(300);
}
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/project-1/desenhos/design-1');
  await page.locator('.tec-canvas').waitFor();
  await page.getByRole('button', { name: '✍ Desenho livre', exact: true }).tap();
  const area = await page.locator('.tec-canvas').boundingBox();
  const cx = area.x + area.width / 2, cy = area.y + area.height / 2;

  // Retângulo torto com o dedo.
  await tracar([[cx - 140, cy + 40], [cx + 140, cy + 36], [cx + 143, cy - 50], [cx - 138, cy - 46]]);
  await page.getByText('Qual a medida do lado destacado?').waitFor();
  await shot('01-traco-organizado');
  await page.getByLabel('Medida do lado destacado').fill('240');
  await page.getByRole('button', { name: 'Criar peça', exact: true }).tap();
  await page.waitForTimeout(300);

  // Segundo dedo durante o traço cancela (palma apoiada): nada é criado.
  await page.getByRole('button', { name: /Desenhar peça/ }).tap();
  await toque('touchStart', [[cx - 100, cy + 90]]);
  await toque('touchMove', [[cx - 60, cy + 90]]);
  // O segundo dedo chega como um novo touchStart com os dois pontos.
  await toque('touchStart', [[cx - 40, cy + 90], [cx + 80, cy + 130]]);
  await toque('touchMove', [[cx - 30, cy + 90], [cx + 90, cy + 130]]);
  await toque('touchEnd', []);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.tec-folha-traco').count(), 0, 'traço cancelado não pergunta nada');
  assert.match(await page.locator('.tec-mensagem').innerText(), /Traço cancelado/);

  // Pinça (dois dedos se afastando) aproxima a vista.
  await page.getByRole('button', { name: 'Selecionar', exact: true }).tap();
  const viewBoxAntes = await page.locator('.tec-canvas > svg').getAttribute('viewBox');
  await toque('touchStart', [[cx - 40, cy + 120], [cx + 40, cy + 120]]);
  for (let k = 1; k <= 8; k++) await toque('touchMove', [[cx - 40 - k * 10, cy + 120], [cx + 40 + k * 10, cy + 120]]);
  await toque('touchEnd', []);
  await page.waitForTimeout(200);
  const largura = viewBox => Number(viewBox.split(' ')[2]);
  const viewBoxDepois = await page.locator('.tec-canvas > svg').getAttribute('viewBox');
  assert(largura(viewBoxDepois) < largura(viewBoxAntes) * .7, `pinça aproximou (${largura(viewBoxAntes)} → ${largura(viewBoxDepois)})`);
  await page.getByRole('button', { name: 'Enquadrar o desenho', exact: true }).tap();

  // Cuba desenhada com o dedo dentro da peça.
  await page.getByRole('button', { name: /Desenhar recorte/ }).tap();
  const pedra = await page.locator('.tec-pedra').first().boundingBox();
  const px = pedra.x + pedra.width / 2, py = pedra.y + pedra.height / 2;
  await tracar([[px - 40, py + 15], [px + 40, py + 15], [px + 40, py - 15], [px - 40, py - 15]]);
  await page.getByText(/^Recorte (retangular|oval)/).waitFor();
  await page.getByRole('button', { name: 'É uma cuba', exact: true }).tap();
  await page.waitForTimeout(2600); // salvamento automático
  await shot('02-peca-e-cuba');

  const [peca] = savedDocument.pieces;
  const lados = peca.contour.map((v, i) => { const w = peca.contour[(i + 1) % peca.contour.length]; return [Math.round(Math.hypot(w.x - v.x, w.y - v.y)), ((Math.round(Math.atan2(w.y - v.y, w.x - v.x) * 180 / Math.PI) % 360) + 360) % 360]; });
  assert.deepEqual(errors, []);
  assert.equal(savedDocument.pieces.length, 1, 'só a peça desenhada (o traço cancelado não criou nada)');
  assert.equal(lados.length, 4, 'retângulo com 4 lados');
  assert(lados.every(([, angulo]) => angulo % 90 === 0), 'lados em esquadro: ' + JSON.stringify(lados));
  assert.equal(Math.max(...lados.map(([medida]) => medida)), 2400, 'escala pelo lado de 2m40');
  assert.deepEqual(savedDocument.features.map(recurso => [recurso.type, recurso.pieceId]), [['SINK', peca.id]]);
  assert.equal(validateTechnicalDocument(savedDocument).filter(d => d.severity !== 'WARNING').length, 0);

  // Girar com o dedo: tocar na peça, segurar a bolinha de cima e arrastar em arco até a direita (90°).
  await page.getByRole('button', { name: 'Selecionar', exact: true }).tap();
  await page.waitForTimeout(300);
  const pecaNaTela = await page.locator('.tec-pedra').first().boundingBox();
  const [tx, ty] = [pecaNaTela.x + pecaNaTela.width * .12, pecaNaTela.y + pecaNaTela.height * .5];
  await page.touchscreen.tap(tx, ty);
  await page.locator('.tec-girar-toque').waitFor();
  await page.waitForTimeout(300);
  const [bolinha, pecaSelecionada] = [await page.locator('.tec-girar-toque').boundingBox(), await page.locator('.tec-pedra').first().boundingBox()];
  const [gx, gy] = [pecaSelecionada.x + pecaSelecionada.width / 2, pecaSelecionada.y + pecaSelecionada.height / 2];
  const raio = gy - (bolinha.y + bolinha.height / 2);
  const topoAntes = (await page.locator('.tec-canvas').boundingBox()).y;
  await toque('touchStart', [[gx, gy - raio]]);
  for (let graus = 80; graus >= 0; graus -= 10) await toque('touchMove', [[gx + raio * Math.cos(graus * Math.PI / 180), gy - raio * Math.sin(graus * Math.PI / 180)]]);
  assert.equal((await page.locator('.tec-canvas').boundingBox()).y, topoAntes, 'o desenho não sai do lugar sob o dedo enquanto gira');
  await toque('touchEnd', []);
  await page.getByText('Peça girada para 90°. Use Ctrl+Z para desfazer.').waitFor();
  await page.waitForTimeout(2600); // salvamento automático
  await shot('03-girada-com-o-dedo');
  assert.equal(savedDocument.pieces[0].rotationDeg, 90, 'girada com o dedo');
  console.log('OK: desenho com o dedo no celular — traço organizado em esquadro, escala pela medida, dois dedos cancelam o traço, pinça aproxima, cuba desenhada dentro da peça e peça girada pela bolinha com o dedo; contorno salvo conferido.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
