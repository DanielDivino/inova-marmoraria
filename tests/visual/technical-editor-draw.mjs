import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Cobre a ferramenta "Desenhar peça": clique do primeiro ponto,
// entrada numérica de comprimento com Enter (estilo SketchUp), confirmação por clique usando
// o valor calculado pelo encaixe de ângulo (45°), e fechamento magnético perto do ponto inicial.
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

  await page.getByRole('button', { name: '✎ Desenhar peça' }).click();
  const svg = page.locator('.technical-canvas');
  const box = await svg.boundingBox();
  const start = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.65 };
  const dots = () => page.locator('.technical-draw-preview circle:not(.technical-draw-cursor):not(.technical-draw-close)').count();

  // primeiro ponto: mover e clicar como um usuário real faria (com tempo entre os dois)
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.mouse.up();
  await shot('01-primeiro-ponto');
  assert.equal(await dots(), 1, 'o primeiro ponto deveria ter sido adicionado');

  // aponta a direção e digita o comprimento exato; Enter confirma sem precisar clicar
  await page.mouse.move(start.x + 250, start.y);
  await page.keyboard.type('2000');
  await shot('02-digitando-comprimento');
  await page.keyboard.press('Enter');
  await shot('03-aresta-1-confirmada');
  assert.equal(await dots(), 2, 'a primeira aresta deveria ter sido confirmada por Enter');

  // segunda aresta com outro comprimento digitado, ângulo diferente
  await page.mouse.move(start.x + 250, start.y - 250);
  await page.keyboard.type('1500');
  await page.keyboard.press('Enter');
  await shot('04-aresta-2-confirmada');
  assert.equal(await dots(), 3, 'a segunda aresta deveria ter sido confirmada por Enter');

  // volta perto do ponto inicial: o encaixe magnético deve habilitar o fechamento
  await page.mouse.move(start.x + 2, start.y - 1);
  await page.waitForTimeout(80);
  await shot('05-perto-do-inicio');
  const closeButton = page.getByRole('button', { name: '✓ Concluir forma' });
  assert.equal(await closeButton.isEnabled(), true, 'perto do ponto inicial o botão de concluir deveria habilitar (encaixe magnético)');
  await closeButton.click();
  await page.waitForTimeout(300);
  await shot('06-forma-concluida');

  assert.equal(await page.locator('.technical-piece').count(), 1, 'a peça desenhada deveria aparecer no canvas');
  assert.equal(await page.getByRole('button', { name: '✎ Desenhar peça' }).getAttribute('aria-pressed'), 'false', 'a ferramenta de desenho deveria desativar após concluir a forma');
  await page.waitForTimeout(2200); // autosave
  assert.equal(savedDocument.pieces[0]?.contour?.length, 3, 'a peça salva deveria ter os 3 vértices desenhados');
  assert.equal(errors.length, 0, 'não deve haver erros de console/página: ' + errors.join('\n'));
  console.log('OK: ferramenta de desenho por comprimento — ponto inicial, comprimento digitado, encaixe de ângulo e fechamento magnético validados.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
