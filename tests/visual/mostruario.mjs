import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Teste exclusivamente visual: todas as chamadas de API são interceptadas (nenhum backend, nenhum dado
// gravado). Mostruário: coleção com filtro de família (ultracompacto), sem favoritos nem frases
// repetidas; a ficha que cresce do cartão (Esc fecha, setas trocam de pedra) com exemplos de
// aplicação; o simulador aplicando a pedra só nos planos de pedra (pixels conferidos) e comparando
// com o original; bordas, inspirações e guia; celular sem rolagem lateral.
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
page.on('console', mensagem => { if (mensagem.type() === 'error') erros.push(mensagem.text()); });
// Famílias, bordas e acabamentos como vêm do catálogo (Materiais e serviços).
const notas = (scratchResistance, stainResistance, maintenance) => ({ scratchResistance, stainResistance, heatResistance: 4, aesthetics: 4, maintenance, costLevel: 3 });
const familia = (id, name, plural, uses, desempenho = null) => ({ id, name, plural, summary: `Resumo da família ${name}, como no guia.`, style: 'Elegante', advantages: [`Vantagem do ${name}`], care: [`Cuidado com o ${name}`], uses, desempenho, sortOrder: 0, materialCount: 1 });
const familias = [
  familia('cfgranito', 'Granito', 'Granitos', ['cozinha', 'banheiro', 'gourmet', 'lavanderia', 'piso'], notas(5, 4, 'Baixa')),
  familia('cfmarmore', 'Mármore', 'Mármores', ['banheiro', 'painel'], notas(3, 2, 'Alta')),
  familia('cfquartzito', 'Quartzito', 'Quartzitos', ['cozinha', 'banheiro', 'gourmet', 'painel'], notas(5, 3, 'Média')),
  familia('cfultra', 'Ultracompacto', 'Ultracompactos', ['cozinha', 'banheiro', 'gourmet', 'painel'], notas(5, 5, 'Muito baixa')),
  familia('cfindus', 'Industrializado', 'Industrializados', ['banheiro', 'painel']),
];
const servico = (name, currentPrice, billingUnit = 'LINEAR_METER') => ({ id: name, name, billingUnit, currentPrice, isActive: true });
const acabamentos = [
  { id: 'cbreta', kind: 'EDGE', name: 'Reta', appearance: 'reta', description: 'Corte a 90°, limpa e econômica.', uses: 'Uso geral', perceivedValue: 'Baixo', isActive: true, services: [servico('Acabamento Simples', 50)] },
  { id: 'cbmeia', kind: 'EDGE', name: 'Meia-esquadria', appearance: 'meia-esquadria', description: 'Duas peças unidas a 45°.', uses: 'Cozinha, ilha e balcão', perceivedValue: 'Alto', isActive: true, services: [servico('Acabamento 45° — Importado', 100), servico('Acabamento 45° — Granito', 70)] },
  { id: 'cbsaia', kind: 'EDGE', name: 'Saia', appearance: 'saia', description: 'Faixa vertical na frente da bancada.', uses: 'Bancada, ilha e balcão', perceivedValue: 'Alto', isActive: true, services: [] },
  { id: 'cbinativa', kind: 'EDGE', name: 'Borda inativa', appearance: 'reta', description: 'Não aparece no mostruário.', uses: 'Nenhum', perceivedValue: 'Baixo', isActive: false, services: [] },
  { id: 'cspolido', kind: 'SURFACE', name: 'Polido', appearance: 'polido', description: 'Brilho intenso.', uses: 'Bancadas e painéis', perceivedValue: null, isActive: true, services: [servico('Acabamento Polimento', 100, 'SQUARE_METER')] },
  { id: 'csflameado', kind: 'SURFACE', name: 'Flameado', appearance: 'flameado', description: 'Rústica e antiderrapante.', uses: 'Áreas externas', perceivedValue: null, isActive: true, services: [] },
];
const materiais = [
  { id: 'branco-dallas', name: 'Branco Dallas', familyId: 'cfgranito', cor: '#ddd9d4', preco: 600 },
  { id: 'preto-sao-gabriel', name: 'Preto São Gabriel', familyId: 'cfgranito', cor: '#27292b', preco: 700 },
  { id: 'calacata', name: 'Calacata', familyId: 'cfindus', cor: '#f3f0ec', preco: 1800 },
  { id: 'grey-claro', name: 'Grey Claro', familyId: 'cfultra', cor: '#b9bab6', preco: 2200 },
  { id: 'grey-escuro', name: 'Grey Escuro', familyId: 'cfultra', cor: '#5b5f60', preco: 2200 },
].map(({ preco, ...item }) => ({ ...item, category: familias.find(entrada => entrada.id === item.familyId).name, isActive: true, currentPrice: preco, billingUnit: 'SQUARE_METER', images: [{ url: '/uploads/materials/' + item.id + '.png', isPrimary: true }] }));
await page.route('**/api/**', async route => {
  const caminho = new URL(route.request().url()).pathname;
  // Fotos das pedras (miniaturas da API): amostra lisa da cor da pedra, com um veio.
  const foto = caminho.match(/^\/api\/miniaturas\/\d+\/materials\/(.+)\.png$/);
  if (foto) {
    const material = materiais.find(item => item.id === foto[1]);
    assert(material, 'Somente amostras conhecidas: ' + caminho);
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="' + material.cor + '"/><path d="M0 160L290 220 600 530" fill="none" stroke="#999" stroke-width="4"/></svg>' });
  }
  if (caminho === '/api/auth/me') return route.fulfill({ json: { user: { id: 'visual', name: 'Teste visual', role: 'SUPER_ADMIN' } } });
  if (caminho === '/api/notifications/deadlines') return route.fulfill({ json: { alerts: [] } });
  if (caminho === '/api/catalog/materials') return route.fulfill({ json: materiais });
  if (caminho === '/api/catalog/families') return route.fulfill({ json: familias });
  if (caminho === '/api/catalog/finishes') return route.fulfill({ json: acabamentos });
  throw new Error('API não prevista no teste visual: ' + caminho);
});

const cenas = [
  { nome: 'Cozinha', arquivo: 'cozinha', planos: 9, pedra: [[500,350],[500,475],[500,487],[700,600],[700,670],[105,850],[130,850],[1345,850],[1320,850]], intactos: [[700,200],[500,800],[700,1020],[1400,300],[900,517]] },
  { nome: 'Banheiro', arquivo: 'banheiro', planos: 3, pedra: [[400,430],[350,510],[700,600]], intactos: [[730,475],[733,390],[800,370],[500,750],[700,950],[300,320]] },
  { nome: 'Escada', arquivo: 'escada', planos: 11, pedra: [[700,250],[700,299],[700,340],[700,392],[700,450],[700,505],[700,550],[700,630],[700,700],[700,792],[700,880]], intactos: [[700,190],[100,400],[1370,700],[700,1010]] },
  { nome: 'Janela / Peitoril', arquivo: 'janela', planos: 2, pedra: [[700,570],[700,655]], intactos: [[700,480],[700,350],[700,800],[100,350],[700,1000]] },
  { nome: 'Porta / Soleira', arquivo: 'porta', planos: 2, pedra: [[700,630],[700,735]], intactos: [[700,500],[1100,300],[1400,600],[700,900],[120,600]] },
];

// Amostra pixels em pontos definidos sobre as fotos, independentemente das máscaras.
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
const semRolagemLateral = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://127.0.0.1:3001') + '/mostruario');
  const colecao = page.locator('#colecao');
  const cartao = nome => colecao.locator('.vitrine-cartao').filter({ has: page.locator(`strong:text-is("${nome}")`) });
  await cartao('Branco Dallas').waitFor();

  // 1) Coleção: famílias com contagem (inclui ultracompacto), sem favoritos nem frases repetidas.
  const familias = colecao.getByRole('group', { name: 'Família da pedra' });
  await familias.getByRole('button', { name: /Ultracompactos/ }).click();
  assert.deepEqual(await colecao.locator('.vitrine-cartao strong').allInnerTexts(), ['Grey Claro', 'Grey Escuro']);
  await familias.getByRole('button', { name: /Ultracompactos/ }).click();
  assert.equal(await page.getByText(/favorit/i).count(), 0, 'sem pedras favoritas');
  const texto = await page.locator('main').innerText();
  for (const frase of ['Escolha sua pedra', 'Veja a pedra no ambiente', 'Simulação ilustrativa']) assert.equal(texto.split(frase).length - 1, 1, `"${frase}" aparece uma vez só`);
  await colecao.getByLabel('Buscar pedra').fill('sao gab');
  assert.deepEqual(await colecao.locator('.vitrine-cartao strong').allInnerTexts(), ['Preto São Gabriel']);
  await colecao.getByRole('button', { name: 'Limpar', exact: true }).click();

  // 2) Ficha: abre pelo cartão (a foto cresce até ela), mostra tudo sobre a pedra e os exemplos
  //    aplicados; setas trocam de pedra e Esc fecha.
  await cartao('Preto São Gabriel').click();
  const ficha = page.getByRole('dialog', { name: 'Preto São Gabriel' });
  await ficha.waitFor();
  for (const trecho of ['Granito · Escura', 'R$ 700,00 / m²', 'Resistência a riscos', 'Onde usar', 'Exemplos de aplicação', 'Vantagens', 'Cuidados', 'Bordas para cozinha']) await ficha.getByText(trecho).first().waitFor();
  assert.deepEqual(await ficha.locator('.vitrine-exemplo strong').allInnerTexts(), ['Cozinha', 'Área gourmet', 'Banheiro']);
  await ficha.locator('.vitrine-exemplo svg[data-estavel="true"]').nth(2).waitFor();
  await ficha.screenshot({ path: resolve(saida, 'ficha-1440.png') });
  // Última da grade: só há a anterior (a amostra visual Nero Marquina, fora do catálogo).
  assert.equal(await ficha.getByRole('button', { name: /Próxima pedra/ }).count(), 0);
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('dialog', { name: 'Nero Marquina' }).getByText('Amostra visual · fora do catálogo').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  // 3) Simulador (sem animações, para conferir pixels): a pedra muda só os planos de pedra; puxar a
  //    comparação até o começo mostra o original.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const area = page.locator('#ambientes');
  const palco = area.locator('.vitrine-palco-area');
  const foto = palco.locator('svg.cena-foto');
  const comparar = area.getByLabel('Comparar com o ambiente original');
  const escolherPedra = nome => area.locator('.vitrine-amostras button').filter({ has: page.locator(`span:text-is("${nome}")`) }).first().click();
  const estavel = () => palco.locator('svg[data-estavel="true"]').waitFor();
  await escolherPedra('Preto São Gabriel');
  await page.waitForFunction(() => document.querySelector('#ambientes .cena-foto')?.getAttribute('aria-label')?.includes('Preto São Gabriel'));
  for (const largura of [1440, 768, 390]) {
    await page.setViewportSize({ width: largura, height: 1050 });
    for (const cena of cenas) {
      await area.locator('.vitrine-cenas button').filter({ hasText: new RegExp(`^${cena.nome.replace('/', '\\/')}$`) }).click();
      await page.waitForFunction(() => document.querySelector('#ambientes .cena-foto')?.getAttribute('aria-busy') === 'false');
      // Usar a comparação some com o aviso "arraste…" (que cobre o pé da foto).
      await comparar.focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('End');
      await estavel();
      assert.equal(await foto.locator('[data-camada="atual"] [data-superficie]').count(), cena.planos);
      const aplicada = await foto.screenshot();
      await area.screenshot({ path: resolve(saida, cena.arquivo + '-' + largura + '.png') });
      await page.keyboard.press('Home');
      await page.waitForFunction(() => document.querySelector('#ambientes .cena-foto')?.getAttribute('aria-label')?.endsWith(' original'));
      const semTextura = await foto.screenshot();
      const pontos = [...cena.pedra, ...cena.intactos];
      const antes = await pixels(semTextura, pontos);
      const depois = await pixels(aplicada, pontos);
      for (let i = 0; i < pontos.length; i++) {
        const diferenca = Math.max(...antes[i].map((valor, canal) => Math.abs(valor - depois[i][canal])));
        if (i < cena.pedra.length) assert(diferenca > 20, cena.nome + ': pedra deve mudar em ' + pontos[i]);
        else assert(diferenca <= 3, cena.nome + ': elemento não mineral deve permanecer em ' + pontos[i] + ', delta=' + diferenca);
      }
      assert(await area.evaluate(el => el.scrollWidth <= el.clientWidth), 'Simulador sem overflow');
      await page.keyboard.press('End');
    }
    assert(await semRolagemLateral(), `sem rolagem lateral em ${largura}`);
  }
  await area.locator('.vitrine-cenas button').filter({ hasText: /^Cozinha$/ }).click();
  await escolherPedra('Calacata');
  await page.waitForFunction(() => document.querySelector('#ambientes .cena-foto')?.getAttribute('aria-label')?.includes('Calacata'));
  await estavel();
  await area.screenshot({ path: resolve(saida, 'cozinha-clara-mobile.png') });
  assert.equal(await area.locator('.vitrine-amostras button[aria-pressed="true"] span').first().evaluate(el => el.firstChild.textContent), 'Calacata');
  await area.getByLabel('Buscar pedra no simulador').fill('sao');
  assert.equal(await area.locator('.vitrine-amostras li').count(), 1);
  await area.getByLabel('Buscar pedra no simulador').fill('nao-existe');
  assert.equal(await area.getByText('Nenhuma pedra com esse nome.').count(), 1);

  // 4) Celular: ficha em tela cheia; bordas, inspirações e guia sem rolagem lateral.
  await cartao('Calacata').click();
  await page.getByRole('dialog', { name: 'Calacata' }).getByText('Confirme na ficha antes de indicar para cozinha', { exact: false }).waitFor();
  await page.screenshot({ path: resolve(saida, 'ficha-390.png') });
  await page.keyboard.press('Escape');
  // Bordas e acabamentos do catálogo (os ativos); tocar amplia a imagem com descrição e preço.
  const bordas = page.locator('#bordas');
  assert.deepEqual(await bordas.locator('.vitrine-acabamento-titulo strong').allInnerTexts(), ['Reta', 'Meia-esquadria', 'Saia']);
  await bordas.getByRole('button', { name: 'Ampliar: Meia-esquadria' }).click();
  const ampliada = page.getByRole('dialog', { name: /Meia-esquadria/ });
  await ampliada.getByText('A partir de R$ 70,00 / m').waitFor();
  assert.equal(await ampliada.locator('.perfil-borda.grande').count(), 1);
  await page.screenshot({ path: resolve(saida, 'borda-ampliada-390.png') });
  await page.keyboard.press('ArrowRight');
  await page.getByRole('dialog', { name: /Saia/ }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await bordas.getByRole('button', { name: /Acabamentos de superfície/ }).click();
  assert.equal(await bordas.locator('.amostra-superficie').count(), 2);
  await bordas.getByRole('button', { name: 'Ampliar: Flameado' }).click();
  await page.getByRole('dialog', { name: /Flameado/ }).getByText('Áreas externas').waitFor();
  assert.equal(await page.getByRole('dialog', { name: /Flameado/ }).getByText(/A partir de/).count(), 0, 'sem preço, não mostra preço');
  await page.keyboard.press('Escape');
  await page.locator('#inspiracoes').getByRole('button', { name: 'Ampliar: Lavanderia' }).click();
  await page.getByRole('dialog', { name: 'Lavanderia' }).getByRole('button', { name: 'Pedras para lavanderia' }).click();
  await page.getByText('pedras para lavanderia').waitFor();
  await page.locator('#guia').getByRole('button', { name: /Comparar materiais/ }).click();
  assert.deepEqual(await page.locator('#guia tbody th').allInnerTexts(), ['Granito', 'Mármore', 'Quartzito', 'Ultracompacto']);
  assert(await semRolagemLateral(), 'sem rolagem lateral no celular');
  assert.deepEqual(erros, []);
  console.log('OK: coleção com filtro de ultracompacto, sem favoritos nem frases repetidas; ficha da pedra com exemplos aplicados, setas e Esc; bordas e acabamentos do catálogo ampliando com preço; 5 cenas em 3 larguras com pedra só nos planos de pedra e comparação com o original; bordas, inspirações e guia; celular sem rolagem lateral. Nenhuma API real chamada.');
} finally {
  await browser.close();
}
