import PDFDocument from 'pdfkit';
import { rotate, sampleContour, featureContour, edgePoint, formatMeasure, type TechnicalDocument, type Piece, type Feature } from '@inova/domain/technical';

type PdfDocument = InstanceType<typeof PDFDocument>;
type Point = { x: number; y: number };

// Mesma projeção 2D em planta usada no editor (front/componentes/desenhos/TechnicalEditor.tsx):
// rotação da peça em torno de seu próprio X/Y, sem considerar tiltDeg (peças verticais são P1).
const toWorld = (local: Point, piece: Piece): Point => { const v = rotate(local, piece.rotationDeg); return { x: v.x + piece.x, y: v.y + piece.y }; };

export function renderizarPdfTecnico(pdf: PdfDocument, document: TechnicalDocument, details: { customer: string; project: string; design: string; revision: number; hash: string }) {
  pdf.fontSize(18).fillColor('#354334').text('INOVA MARMORARIA');
  pdf.fontSize(14).fillColor('#202522').text('Desenho técnico');
  pdf.moveDown(0.5).fontSize(9).fillColor('#5d655c').text(`Cliente: ${details.customer}  •  Projeto: ${details.project}`);
  pdf.text(`Desenho: ${details.design}  •  Revisão ${details.revision}  •  Unidade: mm`);
  pdf.text(`Identificação: ${details.hash.slice(0, 12)}`);
  pdf.moveTo(40, 112).lineTo(555, 112).strokeColor('#c9d0c4').stroke();
  const pieces = document.pieces;
  if (!pieces.length) { pdf.moveDown(4).fontSize(12).fillColor('#5d655c').text('Nenhuma peça foi adicionada a esta revisão.', { align: 'center' }); return; }

  // Contorno de cada peça já amostrado (arcos viram polilinhas suaves), em coordenadas do mundo.
  const outlines = pieces.map(piece => ({ piece, outline: sampleContour(piece.contour, 2).map(vertex => toWorld(vertex, piece)) }));
  const dimensionPoints = document.dimensions.flatMap(dimension => {
    const fromPiece = pieces.find(piece => piece.id === dimension.from.pieceId); const toPiece = pieces.find(piece => piece.id === dimension.to.pieceId);
    const fromVertex = fromPiece?.contour.find(vertex => vertex.id === dimension.from.vertexId); const toVertex = toPiece?.contour.find(vertex => vertex.id === dimension.to.vertexId);
    if (!fromPiece || !toPiece || !fromVertex || !toVertex) return [];
    const a = toWorld(fromVertex, fromPiece); const b = toWorld(toVertex, toPiece);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1; const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
    return [a, b, { x: a.x + nx * dimension.offsetMm, y: a.y + ny * dimension.offsetMm }, { x: b.x + nx * dimension.offsetMm, y: b.y + ny * dimension.offsetMm }];
  });
  const allPoints = outlines.flatMap(entry => entry.outline).concat(dimensionPoints).concat(document.annotations.map(annotation => ({ x: annotation.x, y: annotation.y })));
  const minX = Math.min(...allPoints.map(p => p.x)); const maxX = Math.max(...allPoints.map(p => p.x));
  const minY = Math.min(...allPoints.map(p => p.y)); const maxY = Math.max(...allPoints.map(p => p.y));
  const scale = Math.min(460 / Math.max(1, maxX - minX), 280 / Math.max(1, maxY - minY));
  const originX = 70; const originY = 420;
  const point = (world: Point) => ({ x: originX + (world.x - minX) * scale, y: originY - (world.y - minY) * scale });
  const drawPolygon = (worldPoints: Point[]) => {
    if (worldPoints.length < 2) return;
    const first = point(worldPoints[0]); pdf.moveTo(first.x, first.y);
    worldPoints.slice(1).forEach(vertex => { const next = point(vertex); pdf.lineTo(next.x, next.y); });
    pdf.closePath();
  };

  for (const { piece, outline } of outlines) {
    drawPolygon(outline);
    pdf.fillAndStroke('#e9ede4', '#52654c');
    const box = { minX: Math.min(...outline.map(p => p.x)), maxX: Math.max(...outline.map(p => p.x)), minY: Math.min(...outline.map(p => p.y)), maxY: Math.max(...outline.map(p => p.y)) };
    const label = point({ x: box.minX, y: box.maxY });
    pdf.fontSize(8).fillColor('#273126').text(`${piece.name} · ${formatMeasure(box.maxX - box.minX)} × ${formatMeasure(box.maxY - box.minY)} · ${piece.thicknessMm} mm`, label.x, label.y + 7, { width: 240 });
  }

  const featureLabel: Record<Feature['type'], string> = { SINK: 'Cuba', SCULPTED_SINK: 'Cuba esculpida', CUTOUT: 'Recorte', HOLE: 'Furo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', EDGE_FINISH: 'Acabamento' };
  const edgeReport: string[] = [];
  for (const feature of document.features) {
    const piece = pieces.find(entry => entry.id === feature.pieceId); if (!piece) continue;
    if (['SKIRT', 'BACKSPLASH', 'EDGE_FINISH'].includes(feature.type) && feature.edgeId) {
      const a = point(toWorld(edgePoint(piece, feature.edgeId, feature.startMm), piece));
      const b = point(toWorld(edgePoint(piece, feature.edgeId, feature.startMm + feature.extentMm), piece));
      pdf.moveTo(a.x, a.y).lineTo(b.x, b.y).lineWidth(feature.type === 'BACKSPLASH' ? 3 : 2).strokeColor('#6f7d5f').stroke().lineWidth(1);
      edgeReport.push(`${featureLabel[feature.type]} · ${piece.name} · ${formatMeasure(feature.extentMm)} × altura ${feature.heightMm} mm`);
      continue;
    }
    const contour = sampleContour(featureContour(feature), 1).map(vertex => toWorld(vertex, piece));
    drawPolygon(contour);
    pdf.fillAndStroke('#ffffff', '#9a4e38');
  }

  for (const dimension of document.dimensions) {
    const fromPiece = pieces.find(piece => piece.id === dimension.from.pieceId); const toPiece = pieces.find(piece => piece.id === dimension.to.pieceId);
    const fromVertex = fromPiece?.contour.find(vertex => vertex.id === dimension.from.vertexId); const toVertex = toPiece?.contour.find(vertex => vertex.id === dimension.to.vertexId);
    if (!fromPiece || !toPiece || !fromVertex || !toVertex) continue;
    const a = toWorld(fromVertex, fromPiece); const b = toWorld(toVertex, toPiece);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1; const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length; const offset = dimension.offsetMm;
    const a2 = { x: a.x + nx * offset, y: a.y + ny * offset }; const b2 = { x: b.x + nx * offset, y: b.y + ny * offset };
    const pa = point(a); const pb = point(b); const pa2 = point(a2); const pb2 = point(b2);
    pdf.moveTo(pa.x, pa.y).lineTo(pa2.x, pa2.y).moveTo(pb.x, pb.y).lineTo(pb2.x, pb2.y).moveTo(pa2.x, pa2.y).lineTo(pb2.x, pb2.y).strokeColor('#7a6539').lineWidth(0.5).stroke();
    const mid = { x: (pa2.x + pb2.x) / 2, y: (pa2.y + pb2.y) / 2 };
    pdf.fontSize(7).fillColor('#7a6539').text(formatMeasure(length), mid.x - 30, mid.y - 8, { width: 60, align: 'center' });
  }

  for (const annotation of document.annotations) {
    const p = point({ x: annotation.x, y: annotation.y });
    pdf.fontSize(9).fillColor('#2f3a2c').text(annotation.text, p.x, p.y, { width: 200 });
  }

  let cursorY = originY + 40;
  if (edgeReport.length) {
    pdf.fontSize(9).fillColor('#354334').text('Saias, rodabancas e acabamentos de borda', 40, cursorY); cursorY += 14;
    for (const line of edgeReport) { pdf.fontSize(8).fillColor('#5d655c').text(`• ${line}`, 46, cursorY); cursorY += 12; }
  }
  pdf.fillColor('#5d655c').fontSize(8).text('Documento técnico. Medidas em milímetros. Sem valores comerciais.', 40, 760, { align: 'center', width: 515 });
}
