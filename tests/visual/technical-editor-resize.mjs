import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Cobre o redimensionamento de uma peça pelos cantos: a peça
// deve continuar um retângulo paramétrico (não virar contorno livre), o canto oposto ao
// arrastado deve permanecer fixo, e um rótulo com largura × comprimento (formato "1m75")
// deve aparecer no próprio desenho durante o arraste.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor-resize');
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
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: '1', name: 'Admin', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'GET') return route.fulfill({ json: { design: { id: 'design-1', name: 'Desenho técnico', project: { id: 'p1', name: 'Cozinha', job: { customer: { name: 'Cliente', phone: '1' } } } }, draft: { id: 'd1', version, document: savedDocument, updatedAt: new Date().toISOString() }, diagnostics: validateTechnicalDocument(savedDocument) } });
  if (path === '/api/designs/design-1' && method === 'GET') return route.fulfill({ json: { revisions: [] } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [] });
  if (path === '/api/designs/design-1/draft' && method === 'PUT') {
    const body = route.request().postDataJSON();
    if (body.baseVersion !== version) return route.fulfill({ status: 409, json: {} });
    savedDocument = body.document; version += 1;
    return route.fulfill({ json: { id: 'd1', version, schemaVersion: savedDocument.schemaVersion, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  return route.fulfill({ status: 404, json: {} });
});

const shot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/p1/desenhos/design-1');
  await page.locator('.technical-editor').waitFor();

  await page.getByRole('button', { name: '＋ Bancada' }).click();
  await page.locator('.technical-piece').first().click();
  await shot('01-peca-selecionada');
  assert.equal(await page.locator('.technical-resize-handle').count(), 4, 'a peça selecionada deve mostrar 4 pontos de redimensionamento');

  // arrasta um canto para dentro: a peça deve encolher mantendo o canto oposto fixo
  const handle = page.locator('.technical-resize-handle').first();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 40, handleBox.y - 20, { steps: 10 });
  await page.waitForTimeout(60);
  const labelDuringDrag = await page.locator('.technical-resize-label').textContent();
  await shot('02-durante-arraste');
  assert.match(labelDuringDrag, /^\d+(m\d{2}|cm) × \d+(m\d{2}|cm)$/, 'o rótulo ao vivo deve mostrar largura × comprimento no formato amigável: ' + labelDuringDrag);
  await page.mouse.up();
  await page.waitForTimeout(150);
  await shot('03-apos-arraste');

  assert.equal(await page.getByLabel('Formato').inputValue(), 'RECTANGLE', 'a peça deve continuar sendo um retângulo paramétrico, não virar contorno livre');
  assert.equal(await page.locator('.technical-vertex').count(), 4, 'o retângulo deve continuar com 4 vértices');
  assert.match(await page.getByLabel('Largura').inputValue(), /^\d+(m\d{2}|cm)$/, 'a largura deve ficar no formato amigável após o arraste');
  assert.match(await page.getByLabel('Comprimento').inputValue(), /^\d+(m\d{2}|cm)$/, 'o comprimento deve ficar no formato amigável após o arraste');
  assert.equal(errors.length, 0, 'não deve haver erros de console/página: ' + errors.join('\n'));
  console.log('OK: redimensionar pelos cantos mantém o retângulo, com rótulo de largura × comprimento ao vivo no desenho.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
