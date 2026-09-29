import { arc, edgeLength, edgePoint, sampleContour, signedArea, EPS } from './geometry.js';
import { formatMeasure, type Feature, type Piece, type Point } from './schema.js';

/** Cota de um lado da peça, em coordenadas locais da peça (mm, y para cima). */
export type CotaLado = {
  ladoId: string; indice: number; a: Point; b: Point; meio: Point;
  /** Direção para fora da peça (unitária). */
  normal: Point;
  comprimento: number; curvo: boolean;
  /** Texto livre do lado ("medir no local") ou a medida formatada. */
  texto: string; livre: boolean;
};

/** Cotas de todos os lados, sempre do lado de fora da peça (vale para contorno horário ou anti-horário). */
export function cotasDaPeca(peca: Piece): CotaLado[] {
  const sentido = signedArea(peca.contour) >= 0 ? 1 : -1;
  return peca.contour.map((a, indice) => {
    const b = peca.contour[(indice + 1) % peca.contour.length];
    const comprimento = edgeLength(peca, a.id);
    const curvo = Math.abs(a.bulge) > EPS;
    let normal = { x: 0, y: 0 };
    const meio = curvo ? edgePoint(peca, a.id, comprimento / 2) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (curvo) {
      const { center } = arc(a, b, a.bulge);
      const d = Math.hypot(meio.x - center.x, meio.y - center.y) || 1;
      // O arco pode ser para fora (convexo) ou para dentro: a normal aponta para longe do centro só no primeiro caso.
      const paraFora = sentido * a.bulge > 0 ? 1 : -1;
      normal = { x: (meio.x - center.x) / d * paraFora, y: (meio.y - center.y) / d * paraFora };
    } else if (comprimento > EPS) normal = { x: (b.y - a.y) / comprimento * sentido, y: -(b.x - a.x) / comprimento * sentido };
    normal = { x: normal.x || 0, y: normal.y || 0 }; // sem -0
    const livre = peca.dimensionLabels[a.id]?.trim() ?? '';
    return { ladoId: a.id, indice, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, meio, normal, comprimento, curvo, texto: livre || formatMeasure(comprimento), livre: !!livre };
  });
}

export type DistanciaBorda = { de: Point; ate: Point; distancia: number };
/**
 * Distâncias de uma cuba/recorte/furo até as bordas da peça, nas quatro
 * direções (esquerda, direita, abaixo, acima), medidas do lado do recorte até
 * o contorno. Só para componentes em 0°/90°/180°/270° (os demais ficam sem).
 */
export function distanciasAteBordas(recurso: Feature, peca: Piece): DistanciaBorda[] {
  if (!['SINK', 'SCULPTED_SINK', 'CUTOUT', 'HOLE'].includes(recurso.type)) return [];
  const giro = ((Math.round(recurso.rotationDeg) % 180) + 180) % 180;
  if (giro !== 0 && giro !== 90) return [];
  const [meiaLargura, meioComprimento] = recurso.type === 'HOLE' ? [recurso.diameterMm / 2, recurso.diameterMm / 2]
    : giro === 90 ? [recurso.lengthMm / 2, recurso.widthMm / 2] : [recurso.widthMm / 2, recurso.lengthMm / 2];
  const contorno = sampleContour(peca.contour, 1);
  const alcance = (origem: Point, direcao: Point) => {
    let menor = Infinity;
    for (let i = 0; i < contorno.length; i++) {
      const p = contorno[i], q = contorno[(i + 1) % contorno.length];
      const ex = q.x - p.x, ey = q.y - p.y, cruz = direcao.x * ey - direcao.y * ex;
      if (Math.abs(cruz) < EPS) continue;
      const t = ((p.x - origem.x) * ey - (p.y - origem.y) * ex) / cruz;
      const u = ((p.x - origem.x) * direcao.y - (p.y - origem.y) * direcao.x) / cruz;
      if (t > EPS && u >= -EPS && u <= 1 + EPS) menor = Math.min(menor, t);
    }
    return menor;
  };
  return [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }].flatMap((direcao) => {
    const de = { x: recurso.x + direcao.x * meiaLargura, y: recurso.y + direcao.y * meioComprimento };
    const distancia = alcance(de, direcao);
    return Number.isFinite(distancia) ? [{ de, ate: { x: de.x + direcao.x * distancia, y: de.y + direcao.y * distancia }, distancia }] : [];
  });
}
