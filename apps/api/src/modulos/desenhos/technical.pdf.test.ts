import { describe, expect, it, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { mkdirSync, writeFileSync } from 'node:fs';
import { contornoDosParametros, emptyTechnicalDocument, makePiece, type Feature, type TechnicalDocument } from '@inova/domain/technical';
import { renderizarPdfTecnico, type DadosPdfTecnico } from './technical.pdf.js';

const base: Feature = { id: 'f1', type: 'HOLE', pieceId: 'p1', name: 'Furo', x: 1000, y: 300, rotationDeg: 0, widthMm: 500, lengthMm: 300, diameterMm: 35, depthMm: 20, heightMm: 100, thicknessMm: 20, radiusMm: 0, shape: 'RECTANGLE', installation: 'UNDERMOUNT', startMm: 0, extentMm: 600, offsetMm: 0, profile: 'SIMPLE', layerId: 'features', wallMm: 20, bottomMm: 20, slopePercent: 0, drainX: 0, drainY: 0, drainDiameterMm: 40 };

function documentoComComponentesECota() {
  const document = emptyTechnicalDocument();
  const piece = makePiece('p1', 'RECTANGLE', 0);
  document.pieces.push(piece);
  const skirt: Feature = { ...base, id: 'f2', type: 'SKIRT', name: 'Saia', edgeId: piece.contour[0].id, startMm: 0, extentMm: 600, heightMm: 100 };
  document.features.push(base, skirt);
  document.dimensions.push({ id: 'd1', from: { pieceId: piece.id, vertexId: piece.contour[0].id }, to: { pieceId: piece.id, vertexId: piece.contour[1].id }, offsetMm: 150, layerId: 'dimensions' });
  document.annotations.push({ id: 'a1', text: 'Conferir caimento na cuba', x: 500, y: -200, layerId: 'annotations' });
  return document;
}

/** Cozinha em U com cuba, cooktop, rodabanca, acabamento e observações. */
function cozinhaCompleta() {
  const document = emptyTechnicalDocument();
  const u = { ...makePiece('p1', 'U', 0), name: 'Bancada em U', thicknessMm: 30, material: { name: 'Granito Preto São Gabriel', textureScaleMm: 600, veinRotationDeg: 0, roughness: .5 } };
  const ilha = { ...makePiece('p2', 'RECTANGLE', 1), name: 'Ilha', x: 500, y: -1400, contour: makePiece('p2', 'RECTANGLE', 1).contour.map((v) => ({ ...v, x: v.x * .6 })) };
  document.pieces.push(u, ilha);
  document.features.push(
    { ...base, id: 'f1', type: 'SINK', name: 'Cuba inox Tramontina', pieceId: 'p1', x: 1300, y: 1150, widthMm: 500, lengthMm: 400, depthMm: 180 },
    { ...base, id: 'f2', type: 'CUTOUT', name: 'Cooktop', pieceId: 'p2', x: 730, y: 325, widthMm: 560, lengthMm: 490 },
    { ...base, id: 'f3', type: 'BACKSPLASH', name: 'Rodabanca', pieceId: 'p1', edgeId: u.contour[6].id, startMm: 0, extentMm: 2600, heightMm: 100 },
    { ...base, id: 'f4', type: 'EDGE_FINISH', name: 'Acabamento', pieceId: 'p2', edgeId: ilha.contour[0].id, startMm: 0, extentMm: 1464, profile: 'MITER45' },
  );
  document.manufacturing = { notes: 'Conferir prumo da parede do fundo antes de cortar.', toleranceMm: 2, minimumClearanceMm: null };
  return document;
}

/** Como no desenho de um cliente: quatro peças retangulares com os cantos em arco, lado a lado. */
function quatroPecasComArco() {
  const document = emptyTechnicalDocument();
  // Lados retos de 1m30 × 70cm, 70 × 60cm, 1m20 × 1m20 e 1m60 × 80cm, com arco de 16cm nos cantos.
  const pecas: [string, number, number, number, number][] = [['Tampo 1', 1500, 900, 0, 0], ['Peça 2', 900, 800, 2000, 0], ['Peça 3', 1400, 1400, 0, -2000], ['Peça 4', 1800, 1000, 1800, -2000]];
  pecas.forEach(([name, width, length, x, y], index) => {
    const base = makePiece(`p${index + 1}`, 'ROUNDED', index);
    const parameters = { ...base.parameters!, width, length, radius: 100 };
    document.pieces.push({ ...base, name, x, y, parameters, contour: contornoDosParametros(base.id, parameters), material: { name: 'Mármore Carrara Gioia', textureScaleMm: 600, veinRotationDeg: 0, roughness: .5 } });
  });
  return document;
}

async function render(document: TechnicalDocument, artifact?: string, extra: Partial<DadosPdfTecnico> = {}) {
  const pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
  const printed = vi.spyOn(pdf, 'text');
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => { pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', resolve); pdf.on('error', reject); });
  renderizarPdfTecnico(pdf, document, { customer: 'Cliente Teste', project: 'Cozinha Teste', design: 'Desenho técnico', revision: 3, hash: 'abcdef1234567890', status: 'APPROVED', createdAt: '2026-09-28T15:00:00Z', ...extra });
  const pages = pdf.bufferedPageRange().count;
  pdf.end();
  await done;
  if (artifact) { mkdirSync('.test-artifacts/pdf', { recursive: true }); writeFileSync(`.test-artifacts/pdf/${artifact}.pdf`, Buffer.concat(chunks)); }
  const calls = printed.mock.calls;
  return { texts: calls.map(call => call[0]), positions: calls.map(call => ({ text: call[0], x: (call as unknown[])[1] as number | undefined, y: (call as unknown[])[2] as number | undefined })), pages };
}

describe('PDF técnico reproduz o que está no desenho', () => {
  it('segue o padrão dos PDFs da empresa: cabeçalho, dados da revisão e rodapé com página', async () => {
    const { texts, pages } = await render(documentoComComponentesECota(), 'desenho-tecnico-fidelidade');
    expect(texts).toEqual(expect.arrayContaining(['INOVA MARMORARIA', 'DESENHO TÉCNICO', 'REVISÃO 3', 'Cliente Teste', 'Cozinha Teste', 'Aprovada', '28/09/2026', 'abcdef123456']));
    expect(pages).toBe(1);
    expect(texts).toContain('Revisão 3 · Página 1 de 1');
  });

  it('inclui a peça com as medidas amigáveis, o texto livre, a cota e a tabela de saias', async () => {
    const { texts } = await render(documentoComComponentesECota());
    expect(texts).toContain('Peça 1');
    expect(texts).toContain('2m44 × 65cm');
    expect(texts).toContain('Conferir caimento na cuba');
    expect(texts).toEqual(expect.arrayContaining(['Saia', '60cm', 'Lado 1 (2m44)']));
    expect(texts).toContain('Escala 1:20 em A4');
  });

  it('imprime a medida de cada lado e o texto combinado no lugar do número', async () => {
    const document = documentoComComponentesECota();
    document.pieces[0] = { ...document.pieces[0], dimensionLabels: { [document.pieces[0].contour[1].id]: 'medir no local' } };
    const { texts } = await render(document, 'desenho-tecnico-medidas-dos-lados');
    expect(texts).toContain('medir no local');
    expect(texts.filter(text => text === '2m44').length).toBeGreaterThanOrEqual(2);
    expect(texts).toContain('65cm');
  });

  it('lista cubas e recortes com a distância até as bordas, rodabanca, acabamento e observações', async () => {
    const { texts, positions } = await render(cozinhaCompleta(), 'desenho-tecnico-cozinha');
    expect(texts).toEqual(expect.arrayContaining(['Bancada em U', 'Ilha', 'Granito Preto São Gabriel', '3cm', 'Cuba inox Tramontina', 'Recorte / cooktop', 'Acabamento de borda', '50cm × 40cm · prof. 18cm', 'Rodabanca', 'Meia-esquadria 45°']));
    expect(texts.some(text => typeof text === 'string' && text.startsWith('esq. ') && text.includes('dir. '))).toBe(true);
    expect(texts).toContain('Conferir prumo da parede do fundo antes de cortar.');
    expect(texts).toContain('Tolerância de fabricação: 2 mm.');
    // Nada escrito na faixa do rodapé além do próprio rodapé.
    expect(positions.filter(({ y }) => typeof y === 'number' && y > 790 && y !== 814)).toEqual([]);
  });

  it('continua em outra folha com o cabeçalho de continuação quando há muitas peças', async () => {
    const document = emptyTechnicalDocument();
    for (let index = 0; index < 24; index++) document.pieces.push({ ...makePiece(`p${index}`, 'RECTANGLE', index), x: (index % 4) * 2600, y: Math.floor(index / 4) * 800 });
    // Peças coladas: a medida do lado encostado vai para dentro da peça, sem cair sobre a vizinha.
    const { texts: coladas } = await render(document, 'desenho-tecnico-pecas-coladas');
    expect(coladas).toContain('Nº do item na tabela de peças');
    for (const [index, piece] of document.pieces.entries()) Object.assign(piece, { x: (index % 4) * 3000, y: Math.floor(index / 4) * 1500 });
    const { texts, pages } = await render(document, 'desenho-tecnico-varias-pecas');
    expect(pages).toBeGreaterThan(1);
    expect(texts).toContain('Desenho técnico · Revisão 3 · Continuação');
    expect(texts).toContain(`Revisão 3 · Página ${pages} de ${pages}`);
    expect(texts).toContain('Peça 24');
  });

  it('marca a área seca e a molhada do balcão na planta, na legenda e na tabela', async () => {
    const document = cozinhaCompleta();
    document.pieces[0] = { ...document.pieces[0], wetDryZones: [{ kind: 'DRY', startMm: 0, endMm: 900 }, { kind: 'WET', startMm: 900, endMm: 1900 }, { kind: 'DRY', startMm: 2000, endMm: 2600 }] };
    const { texts } = await render(document, 'desenho-tecnico-area-molhada');
    expect(texts).toEqual(expect.arrayContaining(['Área seca 90cm', 'Área molhada 1m', 'Área seca 60cm', 'Área molhada', 'Área seca', 'Áreas seca e molhada', 'de 90cm a 1m90', 'de 2m a 2m60']));
  });

  it('não quebra quando não há peças', async () => {
    const { texts, pages } = await render(emptyTechnicalDocument());
    expect(texts).toContain('Nenhuma peça foi adicionada a esta revisão.');
    expect(pages).toBe(1);
  });

  it('reproduz um contorno com aresta curva (arco) sem quebrar', async () => {
    const document = documentoComComponentesECota();
    document.pieces[0].contour = document.pieces[0].contour.map((vertex, index) => index === 0 ? { ...vertex, bulge: 0.3 } : vertex);
    const { texts } = await render(document, 'desenho-tecnico-com-curva');
    expect(texts).toContain('Peça 1');
    expect(texts.some(text => typeof text === 'string' && text.startsWith('arco '))).toBe(true);
  });
});

describe('Desenho técnico impresso pelo orçamento', () => {
  const os = { ordemServico: { numero: 'SET-2026-20', entrega: '20/10/2026' }, customer: 'SINOME', project: 'Marmore Carrara Gioia', revision: 'Versão 45' };

  it('segue o padrão das folhas de OS: data de entrega, cliente, OS, projeto e pedra, sem o cabeçalho da empresa', async () => {
    const { texts } = await render(quatroPecasComArco(), 'desenho-tecnico-os', os);
    expect(texts).toEqual(expect.arrayContaining(['DATA DE ENTREGA', '20/10/2026', 'SINOME', 'OS', 'SET-2026-20', 'Desenho técnico · Marmore Carrara Gioia', 'Pedra: Mármore Carrara Gioia']));
    for (const fora of ['INOVA MARMORARIA', 'DESENHO TÉCNICO', 'Cliente', 'Situação', 'Código', 'Versão 45']) expect(texts).not.toContain(fora);
    expect(texts.some((texto) => String(texto).includes('Medidas em metros'))).toBe(false);
    expect(texts).toContain('Versão 45 · Página 1 de 1');
  });

  it('a tabela de peças fica na mesma folha da planta', async () => {
    for (const extra of [os, {}]) {
      const { pages, texts } = await render(quatroPecasComArco(), undefined, extra);
      expect(pages).toBe(1);
      expect(texts).toContain('Peças');
      expect(texts.some((texto) => String(texto).includes('Continuação'))).toBe(false);
    }
  });

  it('o nome de cada peça fica no centro dela, alinhado com a medida do comprimento', async () => {
    const { positions } = await render(quatroPecasComArco(), undefined, os);
    const medir = new PDFDocument();
    const centros = (texto: string, fonte: string, tamanho: number) => positions.filter((entrada) => entrada.text === texto)
      .map((entrada) => entrada.x! + medir.font(fonte).fontSize(tamanho).widthOfString(texto) / 2);
    // A medida de cima fica no meio do lado; o nome da peça, no meio da peça: os dois no mesmo x.
    for (const [nome, comprimento] of [['Tampo 1', '1m30'], ['Peça 2', '70cm'], ['Peça 3', '1m20'], ['Peça 4', '1m60']]) {
      const [centroNome] = centros(nome, 'Helvetica-Bold', 8);
      expect(Math.min(...centros(comprimento, 'Helvetica-Bold', 7).map((centro) => Math.abs(centro - centroNome))), nome).toBeLessThan(1.5);
    }
  });
});

