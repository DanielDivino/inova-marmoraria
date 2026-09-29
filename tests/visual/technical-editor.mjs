import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyTechnicalDocument, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada: não cria clientes, projetos nem desenhos reais.
// Modo manual do editor técnico: formas prontas (reta, L, U), arraste com encaixe,
// cubas e furo, saia no lado, curvatura no vértice, cota livre, medida digitada
// num lado (com texto livre e cadeado), vista 3D e revisão devolvida com motivo.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
page.setDefaultTimeout(15000);
const consoleErrors = [];
page.on('pageerror', error => consoleErrors.push('pageerror: ' + error.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });

let savedDocument = emptyTechnicalDocument();
let version = 1;
const revisions = [];
const decisions = [];

await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-1', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  // Desenhos técnicos do cliente (botão Desenho técnico do Novo orçamento).
  if (/^\/api\/customers\/[^/]+\/designs$/.test(path)) return route.fulfill({ json: { designs: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'GET') {
    return route.fulfill({ json: { design: { id: 'design-1', name: 'Desenho técnico', project: { id: 'project-1', name: 'Cozinha Silva', job: { customer: { name: 'Maria Silva', phone: '92999990000' } } } }, draft: { id: 'draft-1', version, document: savedDocument, updatedAt: new Date().toISOString() }, diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  if (path === '/api/designs/design-1' && method === 'GET') return route.fulfill({ json: { revisions } });
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id: 'mat-1', name: 'Granito Branco Dallas', category: 'Granito', imageUrl: null }] });
  if (path === '/api/catalog') return route.fulfill({ json: { productTypes: [], materials: [], services: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'PUT') {
    const body = route.request().postDataJSON();
    if (body.baseVersion !== version) return route.fulfill({ status: 409, json: { code: 'DESIGN_VERSION_CONFLICT', message: 'Este desenho foi alterado em outra sessão. Atualize para recuperar sua cópia.' } });
    savedDocument = technicalDocumentSchema.parse(body.document); version += 1;
    return route.fulfill({ json: { id: 'draft-1', version, schemaVersion: 1, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  if (path === '/api/designs/design-1/revisions' && method === 'POST') {
    revisions.unshift({ id: 'rev-1', number: 1, status: 'IN_REVIEW', contentHash: 'abc123def456', createdAt: new Date().toISOString(), createdBy: { name: 'Administrador Inova' }, decisions: [], releases: [], document: savedDocument });
    return route.fulfill({ status: 201, json: revisions[0] });
  }
  if (path === '/api/revisions/rev-1/decisions') {
    const body = route.request().postDataJSON(); decisions.push(body);
    if (body.decision === 'RETURN' && !body.note) return route.fulfill({ status: 422, json: { message: 'Informe o motivo da devolução.' } });
    revisions[0] = { ...revisions[0], status: body.decision === 'RETURN' ? 'RETURNED' : 'APPROVED', decisions: [{ decision: body.decision, note: body.note, decidedBy: { name: 'Administrador Inova' }, decidedAt: new Date().toISOString() }] };
    return route.fulfill({ json: revisions[0] });
  }
  console.log('rota não simulada:', method, path);
  return route.fulfill({ status: 404, json: { message: 'not mocked' } });
});

const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const clicarNoCentro = async locator => { const box = await locator.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(150); };
const botao = name => page.getByRole('button', { name, exact: true });

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/projetos/project-1/desenhos/design-1');
  await page.locator('.tec-editor').waitFor();
  await botao('📐 Manual').click();
  await shot('01-vazio');

  for (const forma of ['Reta', 'Em L', 'Em U']) await botao(forma).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.tec-pedra').count(), 3, 'três peças prontas');
  await shot('02-formas');

  // Arrastar a primeira peça (encaixe na grade de 1 cm e nas outras peças).
  const pedra = await page.locator('.tec-pedra').first().boundingBox();
  await page.mouse.move(pedra.x + pedra.width / 2, pedra.y + pedra.height / 2);
  await page.mouse.down();
  await page.mouse.move(pedra.x + pedra.width / 2 - 30, pedra.y + pedra.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  // Cubas e furo na peça selecionada (a que foi arrastada).
  for (const nome of ['Cuba', 'Cuba esculpida', 'Furo']) { await clicarNoCentro(page.locator('.tec-pedra').first()); await botao(nome).click(); }
  // Saia: escolher e tocar num lado da peça.
  await clicarNoCentro(page.locator('.tec-pedra').first());
  await botao('Saia').click();
  await clicarNoCentro(page.locator('.tec-peca').first().locator('.tec-lado').nth(0));
  await shot('03-componentes');

  // Curvatura no vértice selecionado.
  await clicarNoCentro(page.locator('.tec-pedra').first());
  await clicarNoCentro(page.locator('.tec-peca').first().locator('.tec-vertice').nth(1));
  await page.getByLabel('Curvatura do lado seguinte').fill('0.4');
  await page.waitForTimeout(150);

  // Cota livre entre dois vértices.
  await botao('Cota livre').click();
  const vertices = page.locator('.tec-peca').nth(1).locator('.tec-vertice');
  await clicarNoCentro(vertices.nth(0));
  await clicarNoCentro(vertices.nth(3));
  await botao('Selecionar').click();

  // Medida digitada no lado da peça em L (toque na cota), texto livre e cadeado.
  await clicarNoCentro(page.locator('.tec-peca').nth(1).locator('.tec-cota-fundo').first());
  const janela = page.getByRole('dialog', { name: /^Lado 1/ });
  await janela.getByLabel('Medida do lado').fill('260'); // só números: vira 2,60 m
  await janela.getByLabel('Medida do lado').press('Enter');
  await janela.getByLabel('Texto no lugar da medida').fill('encosto na parede');
  await janela.getByLabel('Texto no lugar da medida').press('Enter');
  await janela.getByRole('button', { name: /Travar este lado/ }).click();
  await shot('04-lado');
  await janela.getByRole('button', { name: 'Pronto' }).click();

  // Vista 3D (three.js) ao lado da planta.
  await botao('Lado a lado').click();
  await page.locator('.tec-3d canvas').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot('05-lado-a-lado');
  await botao('Planta 2D').click();

  // Salva agora (o automático também salva 2 s depois da última mudança; o "Salvo" some logo depois).
  await botao('Salvar agora').click();
  await page.getByText('Salvo', { exact: true }).waitFor();

  // Revisão: enviar, devolver pedindo o motivo.
  await botao('Enviar para conferência').click();
  await page.getByText('Em conferência', { exact: true }).waitFor();
  await botao('Devolver').click();
  await page.getByLabel('Motivo da devolução').fill('Conferir a medida do fundo');
  await botao('Devolver revisão').click();
  await page.getByText('Devolvida', { exact: true }).waitFor();
  await shot('06-revisao');

  const [reta, emL, emU] = savedDocument.pieces;
  assert.equal(consoleErrors.length, 0, 'sem erros de console/página: ' + consoleErrors.join('\n'));
  assert.deepEqual(savedDocument.pieces.map(peca => peca.parameters?.shape ?? 'LIVRE'), ['LIVRE', 'LIVRE', 'U'], 'reta (virou livre com a curvatura), L (virou livre com a medida digitada) e U');
  assert.notDeepEqual([reta.x, reta.y], [0, 0], 'a peça arrastada mudou de lugar');
  assert(reta.contour.some(vertice => vertice.bulge !== 0), 'curvatura salva');
  assert.deepEqual(savedDocument.features.map(recurso => recurso.type).sort(), ['HOLE', 'SCULPTED_SINK', 'SINK', 'SKIRT']);
  const lado1 = emL.contour[0], lado1Fim = emL.contour[1];
  assert.equal(Math.round(Math.hypot(lado1Fim.x - lado1.x, lado1Fim.y - lado1.y)), 2600, 'medida digitada no lado');
  assert.equal(emL.dimensionLabels[lado1.id], 'encosto na parede');
  assert.deepEqual(emL.lockedEdges, [lado1.id]);
  assert.equal(savedDocument.dimensions.length, 1, 'cota livre salva');
  assert.equal(emU.contour.length, 8, 'peça em U com 8 lados');
  assert.equal(validateTechnicalDocument(savedDocument).filter(d => d.severity === 'STRUCTURAL').length, 0);
  assert.deepEqual(decisions, [{ decision: 'RETURN', note: 'Conferir a medida do fundo' }]);
  console.log('OK: editor técnico manual — reta/L/U, arraste com encaixe, cubas, furo, saia, curvatura, cota livre, medida por lado com texto e cadeado, 3D, salvamento e revisão devolvida com motivo.');
} catch (error) {
  console.error('FALHA:', error);
  await shot('erro');
  process.exitCode = 1;
} finally {
  await browser.close();
}
