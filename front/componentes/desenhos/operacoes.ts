import { bounds, edgeLength, featureSchema, makePiece, rotate, sampleContour, type Feature, type Piece, type PieceShape, type Point, type TechnicalDocument } from '@inova/domain/technical';
import { ROTULO_RECURSO, type TipoBorda, type TipoCorpo } from './tipos';

export const localParaMundo = (p: Point, peca: Piece): Point => { const v = rotate(p, peca.rotationDeg); return { x: v.x + peca.x, y: v.y + peca.y }; };
export const mundoParaLocal = (p: Point, peca: Piece): Point => rotate({ x: p.x - peca.x, y: p.y - peca.y }, -peca.rotationDeg);
export const arredondar = (valor: number, passo = 10) => Math.round(valor / passo) * passo;

/** Área ocupada pelo desenho (peças e textos), em mm do mundo; null quando está vazio. */
export function limitesDoDesenho(doc: TechnicalDocument) {
  const pontos = [
    ...doc.pieces.flatMap((peca) => sampleContour(peca.contour, 20).map((p) => localParaMundo(p, peca))),
    ...doc.annotations.map((texto) => ({ x: texto.x, y: texto.y })),
  ];
  return pontos.length ? bounds(pontos) : null;
}

/** Nova peça pronta (reta, L, U, circular, arredondada), à direita do que já existe. */
export function adicionarPeca(doc: TechnicalDocument, forma: PieceShape, id: string): TechnicalDocument {
  const peca = makePiece(id, forma, doc.pieces.length);
  const limites = limitesDoDesenho(doc);
  const posicionada = { ...peca, x: limites ? Math.ceil((limites.maxX + 300) / 100) * 100 : 0, y: limites ? Math.floor(limites.minY / 100) * 100 : 0 };
  return inserirPeca(doc, posicionada);
}
export const inserirPeca = (doc: TechnicalDocument, peca: Piece): TechnicalDocument => ({
  ...doc, pieces: [...doc.pieces, peca],
  assemblies: doc.assemblies.map((conjunto, indice) => indice === 0 ? { ...conjunto, pieceIds: [...conjunto.pieceIds, peca.id] } : conjunto),
});

/** Cuba, cuba esculpida, recorte (cooktop) ou furo no centro da peça (ou onde foi desenhado). */
export function novoRecursoCorpo(peca: Piece, tipo: TipoCorpo, id: string, dados: Partial<Feature> = {}): Feature {
  const caixa = bounds(peca.contour);
  const cuba = tipo === 'SINK' || tipo === 'SCULPTED_SINK';
  return featureSchema.parse({
    id, type: tipo, pieceId: peca.id, name: ROTULO_RECURSO[tipo], x: Math.round((caixa.minX + caixa.maxX) / 2), y: Math.round((caixa.minY + caixa.maxY) / 2),
    widthMm: tipo === 'CUTOUT' ? 560 : 500, lengthMm: tipo === 'CUTOUT' ? 490 : 400, depthMm: cuba ? 180 : 20, slopePercent: tipo === 'SCULPTED_SINK' ? 2 : 0, ...dados,
  });
}
/** Saia, rodabanca ou acabamento ao longo de um lado inteiro. */
export function novoRecursoBorda(peca: Piece, ladoId: string, tipo: TipoBorda, id: string): Feature {
  return featureSchema.parse({
    id, type: tipo, pieceId: peca.id, name: ROTULO_RECURSO[tipo], x: 0, y: 0, edgeId: ladoId, startMm: 0, extentMm: Math.round(edgeLength(peca, ladoId)),
    heightMm: tipo === 'BACKSPLASH' ? 100 : 40, depthMm: 20,
  });
}

/** Emenda no meio de um lado reto: divide a peça em pedras (a distância muda no painel). Lado curvo não recebe. */
export function novaEmenda(peca: Piece, ladoId: string, id: string): Feature | null {
  const vertice = peca.contour.find((entrada) => entrada.id === ladoId);
  if (!vertice || Math.abs(vertice.bulge) > 1e-6) return null;
  return featureSchema.parse({ id, type: 'SEAM', pieceId: peca.id, name: ROTULO_RECURSO.SEAM, x: 0, y: 0, edgeId: ladoId, startMm: Math.round(edgeLength(peca, ladoId) / 2) });
}

/** Peça (em mm do mundo) que contém o ponto, a de cima primeiro. */
export function pecaNoPonto(doc: TechnicalDocument, p: Point): Piece | undefined {
  for (const peca of [...doc.pieces].reverse()) {
    const poligono = sampleContour(peca.contour, 5);
    const local = mundoParaLocal(p, peca);
    let dentro = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const a = poligono[i], b = poligono[j];
      if ((a.y > local.y) !== (b.y > local.y) && local.x < (b.x - a.x) * (local.y - a.y) / (b.y - a.y) + a.x) dentro = !dentro;
    }
    if (dentro) return peca;
  }
  return undefined;
}

/** Fotos enviadas ficam na API (`/uploads/...`), que o front acessa por `/api`. */
export const urlImagem = (url?: string | null) => !url ? undefined : url.startsWith('/uploads/') ? `/api${url}` : url;
