import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// API inteiramente simulada (em memória). Materiais e serviços: o material marca a família (não
// escreve); família nova só com todas as informações do mostruário; bordas e acabamentos com os
// serviços (preços) que os cobram: novo preço e ligar um serviço já cadastrado; o serviço indica a
// borda que cobra. Celular sem rolagem lateral.
const output = resolve(import.meta.dirname, '../../.test-artifacts/catalogo-familias-acabamentos');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));

let contador = 0;
const novoId = prefixo => `c${prefixo}${String(++contador).padStart(10, '0')}`;
const notas = { scratchResistance: 5, stainResistance: 4, heatResistance: 5, aesthetics: 3, maintenance: 'Baixa', costLevel: 2 };
const familias = [
  { id: 'cfamiliagranito', name: 'Granito', plural: 'Granitos', summary: 'Rocha natural dura, de grãos visíveis.', style: 'Rústico', advantages: ['Resistente'], care: ['Selar'], uses: ['cozinha'], desempenho: notas, sortOrder: 0, materialCount: 1 },
  { id: 'cfamiliaultracompacto', name: 'Ultracompacto', plural: 'Ultracompactos', summary: 'Superfície industrial de altíssima densidade.', style: 'Tecnológico', advantages: ['Sem poros'], care: ['Bordas lascam'], uses: ['cozinha', 'painel'], desempenho: notas, sortOrder: 1, materialCount: 1 },
];
const materiais = [
  { id: 'cmaterial0000000001', name: 'Branco Dallas', category: 'Granito', familyId: 'cfamiliagranito', billingUnit: 'SQUARE_METER', currentPrice: 600, isActive: true, images: [] },
  { id: 'cmaterial0000000002', name: 'Preto Absoluto', category: 'Ultracompacto', familyId: 'cfamiliaultracompacto', billingUnit: 'SQUARE_METER', currentPrice: 2200, isActive: true, images: [] },
];
const servicos = [
  { id: 'cservico00000000045', name: 'Acabamento 45°', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 60, isActive: true, finishId: 'cacabamentomeia' },
  { id: 'cservico0000000duplo', name: 'Acabamento Duplo', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 50, isActive: true, finishId: null },
  { id: 'cservicoinstalacao01', name: 'Instalação', category: 'Geral', billingUnit: 'FIXED', currentPrice: 300, isActive: true, finishId: null },
];
const acabamentos = [
  { id: 'cacabamentomeia', kind: 'EDGE', name: 'Meia-esquadria', appearance: 'meia-esquadria', description: 'Duas peças unidas a 45°.', uses: 'Cozinha, ilha e balcão', perceivedValue: 'Alto', sortOrder: 0, isActive: true },
  { id: 'cacabamentobisote', kind: 'EDGE', name: 'Bisotê', appearance: 'bisote', description: 'Bisel mais largo que o chanfro.', uses: 'Lavatório, soleira e peitoril', perceivedValue: 'Médio', sortOrder: 1, isActive: true },
  { id: 'cacabamentopolido', kind: 'SURFACE', name: 'Polido', appearance: 'polido', description: 'Brilho intenso.', uses: 'Bancadas', perceivedValue: null, sortOrder: 0, isActive: true },
];
const comServicos = acabamento => ({ ...acabamento, services: servicos.filter(servico => servico.finishId === acabamento.id).map(({ id, name, billingUnit, currentPrice, isActive }) => ({ id, name, billingUnit, currentPrice, isActive })) });
const enviados = [];

await page.route('**/api/**', async route => {
  const { pathname: path } = new URL(route.request().url());
  const method = route.request().method();
  const corpo = method === 'GET' ? undefined : route.request().postDataJSON();
  if (corpo) enviados.push([method, path, corpo]);
  if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual-catalogo', name: 'Administrador Inova', role: 'SUPER_ADMIN' } } });
  if (path === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (path === '/api/catalog/settings') return route.fulfill({ json: { closedSquareMeter: true } });
  if (path === '/api/catalog/families' && method === 'POST') {
    const familia = { ...corpo, id: novoId('familia'), sortOrder: familias.length, materialCount: 0 };
    familias.push(familia);
    return route.fulfill({ status: 201, json: familia });
  }
  if (path === '/api/catalog/families') return route.fulfill({ json: familias });
  if (path === '/api/catalog/finishes') return route.fulfill({ json: acabamentos.map(comServicos) });
  if (path === '/api/catalog/materials' && method === 'POST') {
    const familia = familias.find(item => item.id === corpo.familyId);
    const material = { ...corpo, id: novoId('material'), category: familia.name, currentPrice: corpo.unitPrice, images: [] };
    materiais.push(material);
    return route.fulfill({ status: 201, json: material });
  }
  if (path === '/api/catalog/materials') return route.fulfill({ json: materiais });
  if (path === '/api/catalog/services' && method === 'POST') {
    const servico = { ...corpo, id: novoId('servico') };
    servicos.push(servico);
    return route.fulfill({ status: 201, json: servico });
  }
  const servico = path.match(/^\/api\/catalog\/services\/(.+)$/);
  if (servico && method === 'PATCH') {
    const alvo = servicos.find(item => item.id === servico[1]);
    Object.assign(alvo, corpo);
    return route.fulfill({ json: alvo });
  }
  if (path === '/api/catalog/services') return route.fulfill({ json: servicos });
  errors.push('API não prevista: ' + method + ' ' + path);
  return route.fulfill({ status: 404, json: {} });
});
const base = process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001';
const shot = name => page.screenshot({ path: resolve(output, name + '.png') });
const janela = () => page.locator('dialog[open]').last();
const semRolagemLateral = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

try {
  await page.goto(base + '/administracao');
  // 1) Material: a família é marcada (não escrita); sem família, não salva.
  await page.locator('.material-admin-card').filter({ hasText: 'Preto Absoluto' }).getByText('Ultracompacto · m²').waitFor();
  await page.getByRole('button', { name: 'Criar novo material' }).click();
  assert.equal(await janela().getByLabel('Categoria').count(), 0, 'sem campo de categoria para escrever');
  await janela().getByLabel('Nome').fill('Calacatta Gold');
  await janela().getByLabel('Preço').fill('2000');
  await janela().getByRole('button', { name: 'Criar cadastro' }).click();
  await page.getByText('Marque a família do material.').waitFor();

  // 2) Nova família pelo próprio cadastro do material: exige as informações do mostruário.
  await janela().getByRole('button', { name: 'Nova família' }).click();
  const familia = page.getByRole('dialog', { name: 'Nova família' });
  await familia.getByRole('button', { name: 'Criar família' }).click();
  await familia.getByText('Informe o nome da família.').waitFor();
  await familia.getByLabel('Nome', { exact: true }).fill('Porcelanato');
  await familia.getByLabel('Plural (filtros)').fill('Porcelanatos');
  await familia.getByLabel('Resumo').fill('Placa cerâmica fina e leve, em grandes formatos que imitam pedras.');
  await familia.getByLabel('Estilo visual').fill('Versátil, contemporâneo');
  await familia.getByLabel('Vantagens 1').fill('Leve e fácil de transportar');
  await familia.getByRole('button', { name: 'Criar família' }).click();
  await familia.getByText('Informe ao menos um cuidado (com 3 letras ou mais).').waitFor();
  await familia.getByLabel('Cuidados 1').fill('Bordas podem lascar');
  await familia.getByRole('button', { name: 'Criar família' }).click();
  await familia.getByText('Marque ao menos um uso.').waitFor();
  await familia.getByText('Painéis e paredes', { exact: true }).click();
  await familia.getByText('Banheiro e lavabo', { exact: true }).click();
  await familia.getByRole('radiogroup', { name: 'Resistência a manchas' }).getByText('4', { exact: true }).click();
  await familia.getByRole('radiogroup', { name: 'Manutenção' }).getByText('Baixa', { exact: true }).click();
  await shot('01-nova-familia');
  await familia.getByRole('button', { name: 'Criar família' }).click();
  await familia.waitFor({ state: 'detached' });
  const criada = enviados.find(([method, path]) => method === 'POST' && path === '/api/catalog/families')[2];
  assert.deepEqual([criada.name, criada.uses, criada.advantages, criada.care, criada.desempenho], ['Porcelanato', ['banheiro', 'painel'], ['Leve e fácil de transportar'], ['Bordas podem lascar'],
    { scratchResistance: 3, stainResistance: 4, heatResistance: 3, aesthetics: 3, maintenance: 'Baixa', costLevel: 3 }]);
  // A família criada fica marcada no material; trocar para Ultracompacto e salvar.
  assert.equal(await janela().getByRole('radio', { name: /Porcelanato/ }).isChecked(), true);
  await janela().getByText('Ultracompacto', { exact: true }).click();
  await shot('02-material-com-familia');
  await janela().getByRole('button', { name: 'Criar cadastro' }).click();
  await page.getByText('Material cadastrado.').waitFor();
  assert.equal(enviados.find(([method, path]) => method === 'POST' && path === '/api/catalog/materials')[2].familyId, 'cfamiliaultracompacto');

  // 3) Famílias: cartões com as informações; a nova aparece.
  await page.getByRole('tab', { name: 'Famílias' }).click();
  assert.deepEqual(await page.locator('.catalogo-familias h2').allInnerTexts(), ['Granito', 'Ultracompacto', 'Porcelanato']);
  await page.locator('.catalogo-familias article').filter({ hasText: 'Porcelanato' }).getByText('Painéis e paredes').waitFor();
  await shot('03-familias');

  // 4) Bordas e acabamentos: preços pelos serviços; novo preço e ligar serviço existente.
  await page.getByRole('tab', { name: 'Bordas e acabamentos' }).click();
  await page.locator('.catalogo-acabamento').filter({ hasText: 'Meia-esquadria' }).getByText('R$ 60,00 / m').waitFor();
  const bisote = page.locator('.catalogo-acabamento').filter({ hasText: 'Bisotê' });
  await bisote.getByText('Sem preço: ligue um serviço para usar no orçamento.').waitFor();
  await bisote.getByRole('button', { name: 'Editar' }).click();
  const formulario = page.getByRole('dialog', { name: 'Editar Bisotê' });
  assert.equal(await formulario.getByRole('radio', { name: 'Bisotê' }).isChecked(), true, 'desenho do perfil marcado');
  await formulario.getByLabel('Nome do novo serviço').fill('Bisotê — Granito');
  await formulario.getByLabel('Preço do novo serviço').fill('85,50');
  await formulario.getByRole('button', { name: 'Novo preço' }).click();
  await formulario.locator('.catalogo-precos-editar li').filter({ hasText: 'Bisotê — Granito' }).waitFor();
  assert.deepEqual(enviados.find(([method, path]) => method === 'POST' && path === '/api/catalog/services')[2], { name: 'Bisotê — Granito', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 85.5, isActive: true, finishId: 'cacabamentobisote' });
  // Só serviços por metro linear podem ser ligados a uma borda.
  const ligar = formulario.getByLabel('Ou ligue um serviço já cadastrado');
  assert.deepEqual((await ligar.locator('option').allInnerTexts()).map(texto => texto.replace(/\s+/g, ' ').trim()), ['Escolher serviço…', 'Acabamento 45° · R$ 60,00 (ligado a outro)', 'Acabamento Duplo · R$ 50,00']);
  await ligar.selectOption({ label: 'Acabamento Duplo · R$ 50,00' });
  await formulario.locator('.catalogo-precos-editar li').filter({ hasText: 'Acabamento Duplo' }).waitFor();
  await shot('04-borda-com-precos');
  await formulario.getByRole('button', { name: 'Fechar' }).click();
  await page.locator('.catalogo-acabamento').filter({ hasText: 'Bisotê' }).getByText('R$ 85,50 / m').waitFor();

  // 5) Serviços: o serviço diz qual borda cobra; a escolha segue a unidade.
  await page.getByRole('tab', { name: 'Serviços', exact: true }).click();
  await page.locator('.admin-rows article').filter({ hasText: 'Acabamento Duplo' }).getByText(/cobra: Bisotê/).waitFor();
  await page.locator('.admin-rows article').filter({ hasText: 'Instalação' }).getByRole('button', { name: 'Editar' }).click();
  assert.equal(await janela().getByLabel('Borda ou acabamento que cobra').isDisabled(), true, 'valor fixo não cobra borda');
  await janela().getByLabel('Unidade').selectOption('SQUARE_METER');
  assert.deepEqual(await janela().getByLabel('Borda ou acabamento que cobra').locator('option').allInnerTexts(), ['Nenhum', 'Polido']);
  await janela().getByRole('button', { name: 'Cancelar' }).click();

  // 6) Celular: abas e formulários sem rolagem lateral.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const aba of ['Famílias', 'Bordas e acabamentos']) {
    await page.getByRole('tab', { name: aba }).click();
    assert(await semRolagemLateral(), `${aba} sem rolagem lateral no celular`);
  }
  await page.locator('.catalogo-acabamento').filter({ hasText: 'Meia-esquadria' }).getByRole('button', { name: 'Editar' }).click();
  assert(await semRolagemLateral(), 'formulário da borda sem rolagem lateral');
  await shot('05-celular-borda');
  assert.deepEqual(errors, []);
  console.log('OK: Materiais e serviços — material marca a família (sem escrever), família nova só com as informações do mostruário, famílias em cartões, bordas e acabamentos com preços (novo preço e serviço ligado, só da unidade certa), serviço mostra a borda que cobra; celular sem rolagem lateral.');
} finally {
  await browser.close();
}
