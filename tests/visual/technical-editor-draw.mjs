import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Desenho livre com o mouse: um L torto vira 6 lados em
// esquadro, a medida do lado mais comprido dá a escala; um traço aberto pergunta se
// deve fechar; um traço fechado dentro da peça vira cuba.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor-draw');
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
    const body = route.request().postDataJSON();
    savedDocument = technicalDocumentSchema.parse(body.document); version += 1;
    return route.fulfill({ json: { id: 'draft-1', version, schemaVersion: 1, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  return route.fulfill({ status: 404, json: { message: 'not mocked' } });
});

// Mouse passando pelos cantos com tremida (determinística) e sem voltar exatamente ao começo.
let semente = 7;
const tremor = () => { semente = (semente * 16807) % 2147483647; return (semente / 2147483647 - .5) * 5; };
async function tracar(cantos, fechar = true) {
  const caminho = fechar ? [...cantos, [cantos[0][0] + 4, cantos[0][1] - 3]] : cantos;
  await page.mouse.move(...caminho[0]);
  await page.mouse.down();
  for (let i = 0; i < caminho.length - 1; i++) {
    const [ax, ay] = caminho[i], [bx, by] = caminho[i + 1];
    for (let k = 1; k <= 16; k++) { const t = k / 16; await page.mouse.move(ax + (bx - ax) * t + tremor(), ay + (by - ay) * t + tremor()); }
  }
  await page.mouse.up();
  await page.waitForTimeout(250);
}
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const lados = contorno => contorno.map((v, i) => { const w = contorno[(i + 1) % contorno.length]; return [Math.round(Math.hypot(w.x - v.x, w.y - v.y)), ((Math.round(Math.atan2(w.y - v.y, w.x - v.x) * 180 / Math.PI) % 360) + 360) % 360]; });

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/project-1/desenhos/design-1');
  await page.locator('.tec-canvas').waitFor();
  await page.getByRole('button', { name: '✍ Desenho livre', exact: true }).click();
  const area = await page.locator('.tec-canvas').boundingBox();
  const x = area.x + area.width / 2 - 200, y = area.y + area.height / 2 + 120;

  // 1) L torto: 6 lados em esquadro; o lado mais comprido vira 2m40.
  await tracar([[x, y], [x + 400, y], [x + 400, y - 100], [x + 100, y - 100], [x + 100, y - 300], [x, y - 300]]);
  await page.getByText('Qual a medida do lado destacado?').waitFor();
  await shot('01-l-organizado');
  await page.getByLabel('Medida do lado destacado').fill('240');
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();
  await page.waitForTimeout(200);

  // 2) Traço aberto: pergunta se fecha.
  await page.getByRole('button', { name: /Desenhar peça/ }).click();
  await tracar([[x + 520, y - 300], [x + 520, y], [x + 820, y], [x + 820, y - 250]], false);
  await page.getByText('A forma não fechou.').waitFor();
  await shot('02-aberto');
  await page.getByRole('button', { name: 'Fechar a forma', exact: true }).click();
  await page.getByLabel('Medida do lado destacado').fill('150');
  await page.getByRole('button', { name: 'Criar peça', exact: true }).click();

  // 3) Recorte desenhado dentro do L vira cuba.
  await page.getByRole('button', { name: /Desenhar recorte/ }).click();
  const pedra = await page.locator('.tec-pedra').first().boundingBox();
  const cx = pedra.x + pedra.width * .7, cy = pedra.y + pedra.height * .82;
  await tracar([[cx - 45, cy - 12], [cx + 45, cy - 12], [cx + 45, cy + 12], [cx - 45, cy + 12]]);
  await page.getByText(/^Recorte (retangular|oval)/).waitFor();
  await page.getByRole('button', { name: 'É uma cuba', exact: true }).click();
  await shot('03-cuba');

  await page.getByRole('button', { name: 'Salvar agora', exact: true }).click();
  await page.getByText('Salvo', { exact: true }).waitFor();
  const [emL, aberta] = savedDocument.pieces;
  assert.deepEqual(errors, []);
  assert.equal(emL.contour.length, 6, 'L com 6 lados');
  assert(lados(emL.contour).every(([, angulo]) => angulo % 90 === 0), 'lados em esquadro: ' + JSON.stringify(lados(emL.contour)));
  assert.equal(Math.max(...lados(emL.contour).map(([medida]) => medida)), 2400, 'lado de referência com 2m40');
  assert(lados(emL.contour).every(([medida]) => medida % 10 === 0), 'medidas em centímetros inteiros');
  assert.equal(aberta.contour.length, 4, 'traço aberto fechado em 4 lados');
  assert.equal(savedDocument.features.length, 1);
  assert.equal(savedDocument.features[0].type, 'SINK');
  assert.equal(savedDocument.features[0].pieceId, emL.id, 'cuba dentro do L');
  assert.equal(validateTechnicalDocument(savedDocument).filter(d => d.severity !== 'WARNING').length, 0, 'sem problemas de geometria');
  console.log('OK: desenho livre com mouse — L organizado em esquadro com escala pela medida, forma aberta fechada a pedido e cuba desenhada dentro da peça.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
