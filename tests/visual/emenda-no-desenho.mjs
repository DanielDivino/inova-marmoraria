import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { contornoDosParametros, emptyTechnicalDocument, makePiece, partesDaPeca, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Emenda no desenho técnico: a ferramenta "Emenda" num lado reto divide
// a bancada de 4 m em pedras; a distância muda no painel, que mostra as pedras; o desenho salvo
// guarda a emenda (é dela que saem as pedras da OS, do fluxo e da entrega).
const output = resolve(import.meta.dirname, '../../.test-artifacts/emenda-no-desenho');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

const parameters = { ...makePiece('b').parameters, shape: 'RECTANGLE', width: 4000, length: 600 };
let documento = technicalDocumentSchema.parse({ ...emptyTechnicalDocument(), pieces: [{ ...makePiece('b'), name: 'Bancada', geometryMode: 'PARAMETRIC', parameters, contour: contornoDosParametros('b', parameters) }] });
let version = 1;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname, method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-emenda', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/designs/d1/draft' && method === 'GET') return route.fulfill({ json: { design: { id: 'd1', name: 'Cozinha', project: { id: 'p1', name: 'Cozinha', job: { customer: { name: 'Maria Silva', phone: null } } } }, draft: { id: 'r1', version, document: documento, updatedAt: new Date().toISOString() }, diagnostics: [] } });
  if (path === '/api/designs/d1/draft' && method === 'PUT') {
    documento = technicalDocumentSchema.parse(route.request().postDataJSON().document); version += 1;
    return route.fulfill({ json: { id: 'r1', version, schemaVersion: 1, document: documento, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(documento) } });
  }
  if (path === '/api/designs/d1') return route.fulfill({ json: { revisions: [] } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [] });
  if (path === '/api/catalog') return route.fulfill({ json: { productTypes: [], materials: [], services: [] } });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const botao = name => page.getByRole('button', { name, exact: true });

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/p1/desenhos/d1');
  await page.locator('.tec-pedra').first().waitFor();
  await page.locator('.tec-pedra').first().click();
  await botao('Emenda').click();
  // Toca no lado de baixo: a emenda nasce no meio dele e atravessa a peça.
  const lado = await page.locator('.tec-peca').first().locator('.tec-lado').nth(0).boundingBox();
  await page.mouse.click(lado.x + lado.width / 4, lado.y + lado.height / 2);
  const painel = page.getByRole('region', { name: 'Emenda' }).or(page.locator('section[aria-label="Emenda"]'));
  await painel.waitFor();
  await page.locator('.tec-recurso.tipo-seam').waitFor({ state: 'attached' });
  assert.match(await painel.locator('.tec-pedras').innerText(), /2 pedras[\s\S]*2m × 60cm[\s\S]*2m × 60cm/);
  // A 2m40 da ponta esquerda: uma pedra de 2m40 e outra de 1m60.
  await painel.getByLabel(/Distância da ponta esquerda/).fill('240');
  await painel.getByLabel(/Distância da ponta esquerda/).press('Enter');
  await page.waitForFunction(() => /2m40 × 60cm/.test(document.querySelector('.tec-pedras')?.textContent ?? ''));
  assert.match(await painel.locator('.tec-pedras').innerText(), /1\. 2m40 × 60cm[\s\S]*2\. 1m60 × 60cm/);
  await page.screenshot({ path: resolve(output, '01-emenda.png') });
  // Salvo com a emenda: a peça vira duas pedras.
  for (let tentativa = 0; tentativa < 40 && !documento.features.some(recurso => recurso.type === 'SEAM' && recurso.startMm === 2400); tentativa++) await page.waitForTimeout(250);
  const emenda = documento.features.find(recurso => recurso.type === 'SEAM');
  assert.equal(emenda?.startMm, 2400, 'emenda salva a 2m40');
  assert.deepEqual(partesDaPeca(documento.pieces[0], [emenda]).map(parte => [parte.comprimentoMm, parte.larguraMm]), [[2400, 600], [1600, 600]]);
  // Lado curvo não recebe emenda; Excluir tira.
  await painel.getByRole('button', { name: 'Excluir emenda' }).click();
  assert.equal(await page.locator('.tec-recurso.tipo-seam').count(), 0);
  assert.deepEqual(errors, []);
  console.log('OK: emenda no desenho técnico — ferramenta Emenda num lado reto, distância no painel, pedras com as medidas, salva no desenho e excluída pelo painel.');
} finally {
  await browser.close();
}
