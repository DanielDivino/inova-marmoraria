import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { centroDaPecaNoMundo, emptyTechnicalDocument, makePiece, technicalDocumentSchema, validateTechnicalDocument } from '../../packages/domain/dist/tecnico/index.js';

// API inteiramente simulada. Área seca/molhada marcada no desenho: clicar no começo,
// levar o mouse (a faixa e o tamanho acompanham) e clicar no fim; ou arrastar e
// soltar. Depois, escolher seca ou molhada. Delete apaga a peça selecionada.
const output = resolve(import.meta.dirname, '../../.test-artifacts/technical-editor-novas-opcoes');
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
  if (path === '/api/catalog/materials/visual') return route.fulfill({ json: [{ id:'pedra-sg', name:'São Gabriel', category:'Granito', imageUrl:null }, {id:'pedra-branca',name:'Branco Paraná',category:'Mármore',imageUrl:null}] });
  if (path === '/api/catalog') return route.fulfill({ json: { productTypes: [], materials: [], services: [] } });
  if (path === '/api/designs/design-1/draft' && method === 'PUT') {
    savedDocument = technicalDocumentSchema.parse(route.request().postDataJSON().document); version += 1;
    return route.fulfill({ json: { id: 'draft-1', version, schemaVersion: 1, document: savedDocument, updatedAt: new Date().toISOString(), diagnostics: validateTechnicalDocument(savedDocument) } });
  }
  return route.fulfill({ status: 404, json: { message: 'not mocked' } });
});
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const salvar = async () => { await page.getByRole('button', { name: 'Salvar agora', exact: true }).click(); await page.getByText('Salvo', { exact: true }).waitFor(); };



try {
  await page.goto('http://127.0.0.1:3001/projetos/project-1/desenhos/design-1');
  await page.locator('.tec-canvas').waitFor();
  assert.equal(await page.locator('.tec-mais-lado').count(), 4);
  await page.locator('.tec-mais-lado').first().click();
  await page.getByRole('button', {name: 'Acabamento · Boleado', exact: true}).click();
  await page.getByRole('button', {name:'Diminuir comprimento aplicado de Acabamento de borda', exact:true}).click();
  await page.getByRole('button', {name:'Rodabanca',exact:true}).last().click();
  await page.getByRole('button', {name:'Aumentar altura de Rodabanca',exact:true}).click();
  await shot('acabamentos-desktop');
  await page.getByRole('button', {name:'Pronto',exact:true}).click();
  await salvar();
  assert.equal(savedDocument.features[0].profile, 'ROUND');
  assert.equal(savedDocument.features[0].extentMm,2430);
  assert.equal(savedDocument.features[1].heightMm,110);
  await page.getByRole('button', {name: 'Linha', exact:true}).click();
  const canvas = await page.locator('.tec-canvas').boundingBox();
  const a = [canvas.x+canvas.width*.35,canvas.y+canvas.height*.45];
  const b = [canvas.x+canvas.width*.65, a[1]+3];
  await page.mouse.click(...a); await page.mouse.move(...b); await page.mouse.click(...b);
  await page.getByLabel('Descrição da linha').fill('Limite do acabamento');
  await salvar();
  assert.equal(savedDocument.annotations[0].text, 'Limite do acabamento');
  assert.ok(Math.abs(savedDocument.annotations[0].y-savedDocument.annotations[0].lineEnd.y)<.01);
  await page.getByRole('button', {name:'Seca / molhada', exact:true}).click();
  await page.getByLabel('Direção da área').selectOption('90');
  const pedra = await page.locator('.tec-pedra').boundingBox();
  const inicio=[pedra.x+pedra.width*.35,pedra.y+pedra.height*.15], fim=[inicio[0],pedra.y+pedra.height*.65];
  await page.mouse.click(...inicio); await page.mouse.move(...fim); await page.mouse.click(...fim);
  await page.getByRole('button', {name:'💧 Área molhada',exact:true}).click();
  await salvar(); assert.equal(savedDocument.pieces[0].wetDryZones[0].angleDeg,90);
  await shot('novas-opcoes-desktop');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Selecionar',exact:true}).click();
  await page.locator('.tec-mais-lado').first().click();
  await page.getByRole('button',{name:'Diminuir altura de Rodabanca',exact:true}).click();
  await page.getByRole('button',{name:'Aumentar comprimento aplicado de Acabamento de borda',exact:true}).click();
  await shot('novas-opcoes-mobile');
  await page.getByRole('button',{name:'Pronto',exact:true}).click();
  await page.setViewportSize({width:1500,height:1000});
  await salvar(); assert.equal(savedDocument.features[0].extentMm,2440); assert.equal(savedDocument.features[1].heightMm,100);
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:390,height:844});
  if (await page.getByRole('button',{name:'Fechar painel',exact:true}).isVisible()) await page.getByRole('button',{name:'Fechar painel',exact:true}).click();
  await page.getByRole('button',{name:'Opções do desenho',exact:true}).waitFor();
  assert.equal(await page.locator('.tec-cabecalho').isVisible(), false);
  const retrato = await page.locator('.tec-canvas').boundingBox();
  assert.ok(retrato.height > 600, `Canvas vertical: ${retrato.height}`);
  await shot('tela-vertical-compacta');
  await page.getByRole('button',{name:'Opções do desenho',exact:true}).click();
  await page.getByRole('button',{name:'Salvar agora',exact:true}).waitFor();
  await shot('opcoes-compactas');
  await page.getByRole('button',{name:'Voltar ao desenho',exact:true}).click();
  await page.setViewportSize({width:844,height:390});
  await page.getByRole('button',{name:'Opções do desenho',exact:true}).waitFor();
  const paisagem = await page.locator('.tec-canvas').boundingBox();
  assert.ok(paisagem.height > 280, `Canvas horizontal: ${paisagem.height}`);
  assert.ok(paisagem.width > 700, `Largura horizontal: ${paisagem.width}`);
  await shot('tela-horizontal-compacta');
  assert.equal(await page.locator('.tec-barra-estimativa').isVisible(),true);
  await page.setViewportSize({width:1500,height:1000});
  await page.getByRole('button',{name:'✍ Desenho livre',exact:true}).click();
  const livre = await page.locator('.tec-canvas').boundingBox();
  const mmPorPixel = await page.locator('.tec-canvas > svg').evaluate(svg => svg.viewBox.baseVal.width / svg.getBoundingClientRect().width);
  const origem = [livre.x+120, livre.y+160];
  const pontos = [origem, [origem[0]+140,origem[1]], [origem[0]+140,origem[1]+90], [origem[0],origem[1]+90], origem];
  await page.mouse.move(...origem); await page.mouse.down();
  for (const ponto of pontos.slice(1)) await page.mouse.move(...ponto,{steps:16});
  await page.mouse.up();
  await page.locator('.tec-pedra').nth(1).waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Medida de referência'}).count(),0);
  await salvar();
  const nova = savedDocument.pieces[1];
  const xs = nova.contour.map(p=>p.x);
  assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-140*mmPorPixel)<140*mmPorPixel*.1, 'tamanho deriva da escala atual');
  await page.getByRole('button',{name:'Escolher pedra: Sem pedra',exact:true}).click();
  await page.getByLabel('Buscar pedra',{exact:true}).fill('sao gabriel');
  assert.equal(await page.getByRole('button',{name:/Branco Paraná/}).count(),0);
  await page.getByRole('button',{name:/São Gabriel/}).click();
  await salvar(); assert.equal(savedDocument.pieces[1].material.id,'pedra-sg');
  const desenho = await page.locator('.tec-pedra').nth(1).boundingBox();
  await page.mouse.click(desenho.x + desenho.width/2, desenho.y + desenho.height/2);
  await page.keyboard.press('Delete');
  await page.getByText('Peça 2 excluída.',{exact:false}).waitFor();
  assert.equal(await page.locator('.tec-pedra').count(),1);
  await salvar(); assert.equal(savedDocument.pieces.length,1);
  await page.keyboard.press('Control+z');
  await page.locator('.tec-pedra').nth(1).waitFor();
  console.log('Desktop e mobile: +, acabamento, linha descrita, encaixe e área vertical OK');
} catch (e) { await shot('falha-novas-opcoes'); throw e; } finally { await browser.close(); }
