import { describe, expect, it, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { mkdirSync, writeFileSync } from 'node:fs';
import { emptyTechnicalDocument, makePiece, type Feature } from '@inova/domain/technical';
import { renderizarPdfTecnico } from './technical.pdf.js';

function documentoComComponentesECota() {
  const document = emptyTechnicalDocument();
  const piece = makePiece('p1', 'RECTANGLE', 0);
  document.pieces.push(piece);
  const hole: Feature = { id: 'f1', type: 'HOLE', pieceId: piece.id, name: 'Furo', x: 1000, y: 300, rotationDeg: 0, widthMm: 500, lengthMm: 300, diameterMm: 35, depthMm: 20, heightMm: 100, thicknessMm: 20, radiusMm: 0, shape: 'RECTANGLE', installation: 'UNDERMOUNT', startMm: 0, extentMm: 600, offsetMm: 0, profile: 'SIMPLE', layerId: 'features', wallMm: 20, bottomMm: 20, slopePercent: 0, drainX: 0, drainY: 0, drainDiameterMm: 40 };
  const skirt: Feature = { ...hole, id: 'f2', type: 'SKIRT', name: 'Saia', edgeId: piece.contour[0].id, startMm: 0, extentMm: 600, heightMm: 100 };
  document.features.push(hole, skirt);
  document.dimensions.push({ id: 'd1', from: { pieceId: piece.id, vertexId: piece.contour[0].id }, to: { pieceId: piece.id, vertexId: piece.contour[1].id }, offsetMm: 150, layerId: 'dimensions' });
  document.annotations.push({ id: 'a1', text: 'Conferir caimento na cuba', x: 500, y: -200, layerId: 'annotations' });
  return document;
}

async function render(document: ReturnType<typeof documentoComComponentesECota>, artifact?: string) {
  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const printed = vi.spyOn(pdf, 'text');
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => { pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', resolve); pdf.on('error', reject); });
  renderizarPdfTecnico(pdf, document, { customer: 'Cliente Teste', project: 'Cozinha Teste', design: 'Desenho técnico', revision: 3, hash: 'abcdef123456' });
  pdf.end();
  await done;
  if (artifact) { mkdirSync('.test-artifacts/pdf', { recursive: true }); writeFileSync(`.test-artifacts/pdf/${artifact}.pdf`, Buffer.concat(chunks)); }
  return { texts: printed.mock.calls.map(call => call[0]) };
}

describe('PDF técnico reproduz o que está no desenho', () => {
  it('inclui nome e medidas amigáveis da peça, o texto livre, a cota e o resumo de saia/rodabanca', async () => {
    const { texts } = await render(documentoComComponentesECota(), 'desenho-tecnico-fidelidade');
    expect(texts.some(text => typeof text === 'string' && text.includes('Peça 1') && text.includes('2m44') && text.includes('65cm'))).toBe(true);
    expect(texts).toContain('Conferir caimento na cuba');
    expect(texts.some(text => typeof text === 'string' && text.includes('Saia') && text.includes('60cm'))).toBe(true);
  });

  it('imprime a medida de cada lado e o texto combinado no lugar do número', async () => {
    const document = documentoComComponentesECota();
    document.pieces[0] = { ...document.pieces[0], dimensionLabels: { [document.pieces[0].contour[1].id]: 'medir no local' } };
    const { texts } = await render(document, 'desenho-tecnico-medidas-dos-lados');
    expect(texts).toContain('medir no local');
    expect(texts.filter(text => text === '2m44').length).toBeGreaterThanOrEqual(2);
    expect(texts).toContain('65cm');
  });

  it('não gera páginas nem quebra quando não há peças', async () => {
    const { texts } = await render(emptyTechnicalDocument());
    expect(texts).toContain('Nenhuma peça foi adicionada a esta revisão.');
  });

  it('reproduz um contorno com aresta curva (arco) sem quebrar', async () => {
    const document = documentoComComponentesECota();
    document.pieces[0].contour = document.pieces[0].contour.map((vertex, index) => index === 0 ? { ...vertex, bulge: 0.3 } : vertex);
    const { texts } = await render(document, 'desenho-tecnico-com-curva');
    expect(texts.some(text => typeof text === 'string' && text.includes('Peça 1'))).toBe(true);
  });
});
