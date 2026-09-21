import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada: não cria clientes, projetos nem desenhos reais.
// Cobre o editor técnico 2D: peças, arraste com encaixe, cubas, cuba esculpida, furo,
// saia (feature de borda), curvatura de vértice (arco) e cota entre dois vértices.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
page.setDefaultTimeout(15000);
const consoleErrors = [];
page.on('pageerror', error => consoleErrors.push('pageerror: ' + error.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });

let savedDocument = emptyTechnicalDocument();
let version = 1;
const revisions = [];

await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-1', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'GET') {
    return route.fulfill({ json: { design: { id: 'design-1', name: 'Desenho técnico', project: { id: 'project-1', name: 'Cozinha Silva', job: { customer: { name: 'Maria Silva', phone: '92999990000' } } } }, draft: { id: 'draft-1', version, document: savedDocument, updatedAt: new Date().toISOString() }, diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  if (path === '/api/designs/design-1' && method === 'GET') return route.fulfill({ json: { revisions } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id: 'mat-1', name: 'Granito Branco Dallas', category: 'Granito', imageUrl: null }] });
  if (path === '/api/designs/design-1/draft' && method === 'PUT') {
    const body = route.request().postDataJSON();
    if (body.baseVersion !== version) return route.fulfill({ status: 409, json: { code: 'DESIGN_VERSION_CONFLICT', message: 'conflito' } });
    savedDocument = body.document; version += 1;
    const diagnostics = validateTechnicalDocument(savedDocument);
    return route.fulfill({ json: { id: 'draft-1', version, schemaVersion: savedDocument.schemaVersion, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics } });
  }
  console.log('rota não simulada:', method, path);
  return route.fulfill({ status: 404, json: { message: 'not mocked' } });
});

const shot = name => page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
// Elementos SVG com stroke transparente (áreas de clique invisíveis) não passam na checagem de
// visibilidade do Playwright, embora recebam cliques reais de mouse normalmente; por isso
// clicamos pela coordenada central em vez de usar locator.click().
const clickAt = async locator => { const box = await locator.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); };

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/project-1/desenhos/design-1');
  await page.locator('.technical-editor').waitFor();
  await shot('01-vazio');

  await page.getByRole('button', { name: '＋ Bancada' }).click();
  await page.getByRole('button', { name: '⌞ Peça em L' }).click();
  await page.waitForTimeout(300);
  await shot('02-duas-pecas');

  // arrastar a primeira peça (retângulo) no canvas, testando o encaixe (snap)
  const firstPiece = page.locator('.technical-piece').first();
  const pieceBox = await firstPiece.boundingBox();
  const startX = pieceBox.x + pieceBox.width / 2, startY = pieceBox.y + pieceBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 18, startY - 22, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await shot('03-apos-arrastar');
  await firstPiece.click();
  await page.waitForTimeout(150);

  // adicionar cuba, cuba esculpida e furo na peça selecionada
  await page.getByRole('button', { name: '◯ Adicionar cuba' }).click();
  await page.getByRole('button', { name: '◐ Cuba esculpida' }).click();
  await page.getByRole('button', { name: '• Adicionar furo' }).click();
  await page.waitForTimeout(200);
  await shot('04-componentes-de-corpo');

  // adicionar saia (feature de borda): clicar no botão e depois numa aresta da peça ativa
  await page.getByRole('button', { name: '▭ Adicionar saia' }).click();
  await clickAt(page.locator('.technical-edge-hit').first());
  await page.waitForTimeout(200);
  await shot('05-saia-na-borda');

  // selecionar um vértice e aplicar curvatura (arco)
  await clickAt(page.locator('.technical-vertex').first());
  await page.waitForTimeout(150);
  const bulgeInput = page.getByLabel('Curvatura (arco)');
  await bulgeInput.fill('0.4');
  await bulgeInput.blur();
  await page.waitForTimeout(200);
  await shot('06-curvatura-no-vertice');

  // criar uma cota clicando em dois vértices
  await page.getByRole('button', { name: '📏 Cota (clique 2 vértices)' }).click();
  const vertices = page.locator('.technical-vertex');
  await clickAt(vertices.nth(0));
  await clickAt(vertices.nth(1));
  await page.waitForTimeout(300);
  await shot('07-cota-criada');

  await page.waitForTimeout(2200); // aguardar o autosave (debounce de 2s)
  await shot('08-final-apos-autosave');
  await page.getByText('Salvo', { exact: true }).waitFor();

  assert.equal(consoleErrors.length, 0, 'não deve haver erros de console/página: ' + consoleErrors.join('\n'));
  assert.equal(savedDocument.pieces.length, 2, 'as duas peças criadas devem ter sido salvas');
  assert.deepEqual(savedDocument.features.map(f => f.type).sort(), ['HOLE', 'SCULPTED_SINK', 'SINK', 'SKIRT'].sort(), 'cuba, cuba esculpida, furo e saia devem ter sido salvos');
  assert.equal(savedDocument.dimensions.length, 1, 'a cota criada deve ter sido salva');
  assert.ok(savedDocument.pieces.some(piece => piece.contour.some(vertex => vertex.bulge !== 0)), 'a curvatura aplicada ao vértice deve ter sido salva');
  console.log('OK: editor técnico 2D — peças, arraste com encaixe, componentes de corpo e de borda, curvatura e cota validados.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
