import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Teste exclusivamente visual: todas as chamadas de API sao interceptadas.
// Nao inicia backend nem grava dados no banco de uso real.
const raiz = resolve(import.meta.dirname, '../..');
const saida = resolve(raiz, '.test-artifacts/mostruario');
mkdirSync(saida, { recursive: true });
const instalado = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(instalado) ? instalado : undefined),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const erros = [];
page.on('pageerror', erro => erros.push(erro.message));
const materiais = [
  { id: 'branco-dallas', name: 'Branco Dallas', cor: '#ddd9d4' },
  { id: 'preto-sao-gabriel', name: 'Preto São Gabriel', cor: '#27292b' },
  { id: 'calacata', name: 'Calacata', cor: '#f3f0ec' },
].map(item => ({ ...item, category: 'Granito', isActive: true, images: [{ url: '/uploads/materials/' + item.id + '.png', isPrimary: true }] }));
await page.route('**/api/**', async route => {
  const caminho = new URL(route.request().url()).pathname;
  if (caminho.startsWith('/api/uploads/materials/')) {
    const material = materiais.find(item => '/api' + item.images[0].url === caminho);
    assert(material, 'Somente amostras conhecidas');
    const arquivo = resolve(raiz, 'back' + caminho.slice(4));
    if (process.env.INOVA_VISUAL_MATERIAIS_REAIS === '1' && existsSync(arquivo)) return route.fulfill({ path: arquivo });
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="' + material.cor + '"/><path d="M0 160L290 220 600 530" fill="none" stroke="#999" stroke-width="4"/></svg>' });
  }
  if (caminho === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual', name: 'Teste visual', role: 'SUPER_ADMIN' } } });
  if (caminho === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (caminho === '/api/catalog/materials') return route.fulfill({ json: materiais });
  throw new Error('API nao prevista no teste visual: ' + caminho);
});

const cenas = [
  { nome: 'Cozinha', arquivo: 'cozinha', planos: 9, pedra: [[500,350],[500,475],[500,487],[700,600],[700,670],[105,850],[130,850],[1345,850],[1320,850]], intactos: [[700,200],[500,800],[700,1020],[1400,300],[900,517]] },
  { nome: 'Banheiro', arquivo: 'banheiro', planos: 3, pedra: [[400,430],[350,510],[700,600]], intactos: [[730,475],[733,390],[800,370],[500,750],[700,950],[300,320]] },
  { nome: 'Escada', arquivo: 'escada', planos: 11, pedra: [[700,250],[700,299],[700,340],[700,392],[700,450],[700,505],[700,550],[700,630],[700,700],[700,792],[700,880]], intactos: [[700,190],[100,400],[1370,700],[700,1010]] },
  { nome: 'Janela / Peitoril', arquivo: 'janela', planos: 2, pedra: [[700,570],[700,655]], intactos: [[700,480],[700,350],[700,800],[100,350],[700,1000]] },
  { nome: 'Porta / Soleira', arquivo: 'porta', planos: 2, pedra: [[700,630],[700,735]], intactos: [[700,500],[1100,300],[1400,600],[700,900],[120,600]] },
];

// Amostra pixels em pontos definidos sobre as fotos, independentemente das mascaras.
async function pixels(buffer, pontos) {
  return page.evaluate(async ({ base64, pontos }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + base64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return pontos.map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x / 1448 * img.width), Math.floor(y / 1086 * img.height), 1, 1).data).slice(0, 3));
  }, { base64: buffer.toString('base64'), pontos });
}

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/mostruario');
  const area = page.locator('#ambientes');
  const foto = area.locator('.ambientes-photo');
  const original = area.getByLabel('Ver original', { exact: true });
  // Os cartões de pedra agora mostram nome + preço no mesmo botão, então o nome
  // acessível deixou de ser exato; localizamos pelo texto do <span> do nome.
  const escolher = nome => area.locator(`.ambientes-tabs button:text-is("${nome}"), .ambientes-swatches button:has(span:text-is("${nome}"))`).click();
  const pedraSelecionada = nome => area.locator('.ambientes-swatches button').filter({ has: page.locator(`span:text-is("${nome}")`) });
  await escolher('Preto São Gabriel');
  await page.waitForFunction(() => document.querySelector('.ambientes-photo')?.getAttribute('aria-label')?.includes('Preto São Gabriel'));
  for (const largura of [1440, 768, 390]) {
    await page.setViewportSize({ width: largura, height: 1050 });
    for (const cena of cenas) {
      await escolher(cena.nome);
      await page.waitForFunction(() => document.querySelector('.ambientes-photo')?.getAttribute('aria-busy') === 'false');
      await original.uncheck();
      assert.equal(await foto.locator('[data-superficie]').count(), cena.planos);
      const aplicada = await foto.screenshot();
      await area.screenshot({ path: resolve(saida, cena.arquivo + '-' + largura + '.png') });
      await original.check();
      const semTextura = await foto.screenshot();
      const pontos = [...cena.pedra, ...cena.intactos];
      const antes = await pixels(semTextura, pontos);
      const depois = await pixels(aplicada, pontos);
      for (let i = 0; i < pontos.length; i++) {
        const diferenca = Math.max(...antes[i].map((valor, canal) => Math.abs(valor - depois[i][canal])));
        if (i < cena.pedra.length) assert(diferenca > 20, cena.nome + ': pedra deve mudar em ' + pontos[i]);
        else assert(diferenca <= 3, cena.nome + ': elemento nao mineral deve permanecer em ' + pontos[i] + ', delta=' + diferenca);
      }
      assert(await area.evaluate(el => el.scrollWidth <= el.clientWidth), 'Visualizador sem overflow');
      await original.uncheck();
    }
  }
  await escolher('Cozinha');
  await escolher('Calacata');
  await page.waitForFunction(() => document.querySelector('.ambientes-photo')?.getAttribute('aria-label')?.includes('Calacata'));
  await area.screenshot({ path: resolve(saida, 'cozinha-clara-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await area.screenshot({ path: resolve(saida, 'cozinha-clara-desktop.png') });
  assert.equal(await pedraSelecionada('Calacata').getAttribute('aria-pressed'), 'true');
  await area.getByLabel('Buscar pedra', { exact: true }).fill('sao');
  assert.equal(await area.locator('.ambientes-swatches button').count(), 1);
  await area.getByLabel('Buscar pedra', { exact: true }).fill('nao-existe');
  assert.equal(await area.getByText('Nenhuma pedra encontrada.').count(), 1);
  assert.deepEqual(erros, []);
  console.log('OK: 5 cenas em 3 larguras; 27 pontos de pedra e 24 pontos preservados por largura; troca de material, comparacao e busca. Nenhuma API real chamada.');
} finally {
  await browser.close();
}
