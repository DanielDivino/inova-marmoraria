import { formatMeasure, type TechnicalDocument } from '@inova/domain/technical';
import { localParaMundo } from './operacoes';
import { anguloLegivel, Texto } from './svg';

/** Ponta de uma cota livre (vértice de uma peça) em mm do mundo; undefined se a peça/vértice não existe mais. */
export function pontoDaCota(documento: TechnicalDocument, ref: { pieceId: string; vertexId: string }) {
  const peca = documento.pieces.find((entrada) => entrada.id === ref.pieceId);
  const vertice = peca?.contour.find((entrada) => entrada.id === ref.vertexId);
  return peca && vertice ? localParaMundo(vertice, peca) : undefined;
}

/** Cotas livres entre dois vértices (as mesmas que saem no PDF técnico), em coordenadas do mundo. */
export function CotasLivres({ documento, escala }: { documento: TechnicalDocument; escala: number }) {
  const px = (valor: number) => valor / escala;
  return <g className="tec-cotas-livres" pointerEvents="none">
    {documento.dimensions.map((cota) => {
      const a = pontoDaCota(documento, cota.from), b = pontoDaCota(documento, cota.to);
      if (!a || !b) return null;
      const comprimento = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const n = { x: -(b.y - a.y) / comprimento, y: (b.x - a.x) / comprimento };
      const a2 = { x: a.x + n.x * cota.offsetMm, y: a.y + n.y * cota.offsetMm }, b2 = { x: b.x + n.x * cota.offsetMm, y: b.y + n.y * cota.offsetMm };
      const angulo = anguloLegivel(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
      // Cota livre só desenha: toque nela cai na peça de baixo.
      return <g key={cota.id} className="tec-cota" pointerEvents="none">
        <line className="tec-chamada" x1={a.x} y1={a.y} x2={a2.x} y2={a2.y} strokeWidth={px(1)} />
        <line className="tec-chamada" x1={b.x} y1={b.y} x2={b2.x} y2={b2.y} strokeWidth={px(1)} />
        <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} strokeWidth={px(1.2)} />
        <Texto x={(a2.x + b2.x) / 2 + n.x * px(9)} y={(a2.y + b2.y) / 2 + n.y * px(9)} tamanho={px(12)} angulo={angulo} className="tec-cota-texto">{formatMeasure(comprimento)}</Texto>
      </g>;
    })}
  </g>;
}
