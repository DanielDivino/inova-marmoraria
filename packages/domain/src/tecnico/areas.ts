import { sampleContour } from './geometry.js';
import type { Piece, ZonaSecaMolhada } from './schema.js';

/**
 * Área seca e área molhada de um balcão: trechos ao longo do comprimento (eixo
 * x da peça), marcados no desenho com início e fim (clicar, puxar e clicar).
 * Um trecho novo toma o lugar do que já estava marcado ali; trechos iguais que
 * se encostam viram um só. Só marca o desenho: não entra em valor nenhum.
 */
export type AreaDoBalcao = { indice: number; tipo: ZonaSecaMolhada['kind']; inicioMm: number; fimMm: number; x0: number; x1: number; comprimentoMm: number };
export const NOME_AREA: Record<ZonaSecaMolhada['kind'], string> = { DRY: 'Área seca', WET: 'Área molhada' };
/** Menor trecho aceito (1 cm). */
const MINIMO = 10;

const extremos = (peca: Piece) => {
  const xs = sampleContour(peca.contour, 2).map((p) => p.x);
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
};
/** Comprimento da peça no eixo x dela (onde se marcam as áreas). */
export const comprimentoDoBalcao = (peca: Piece) => { const { minX, maxX } = extremos(peca); return maxX - minX; };

/**
 * Posição no balcão (mm a partir da ponta esquerda) de um ponto x no eixo da
 * peça: sempre dentro dela e no passo (1 cm); perto das pontas, cola nelas.
 */
export function posicaoNoBalcao(peca: Piece, xLocal: number, passo = MINIMO) {
  const { minX, maxX } = extremos(peca);
  const total = maxX - minX, bruto = xLocal - minX;
  if (bruto <= passo / 2) return 0;
  if (bruto >= total - passo / 2) return Math.round(total * 10) / 10;
  return Math.round(bruto / passo) * passo;
}

/** Áreas marcadas, da esquerda para a direita, cortadas ao tamanho atual da peça. */
export function areasDaPeca(peca: Piece): AreaDoBalcao[] {
  if (!peca.wetDryZones.length) return [];
  const { minX, maxX } = extremos(peca);
  const total = maxX - minX;
  return peca.wetDryZones.map((zona, indice) => ({ indice, tipo: zona.kind, inicioMm: Math.min(zona.startMm, total), fimMm: Math.min(zona.endMm, total) }))
    .filter((area) => area.fimMm - area.inicioMm > .5).sort((a, b) => a.inicioMm - b.inicioMm)
    .map((area) => ({ ...area, x0: minX + area.inicioMm, x1: minX + area.fimMm, comprimentoMm: area.fimMm - area.inicioMm }));
}

/** Em ordem, sem sobreposição, juntando as iguais que se encostam. */
function organizar(zonas: ZonaSecaMolhada[]): ZonaSecaMolhada[] {
  return [...zonas].sort((a, b) => a.startMm - b.startMm).reduce<ZonaSecaMolhada[]>((lista, zona) => {
    const anterior = lista[lista.length - 1];
    if (anterior && anterior.kind === zona.kind && zona.startMm <= anterior.endMm + .5) anterior.endMm = Math.max(anterior.endMm, zona.endMm);
    else lista.push({ ...zona });
    return lista;
  }, []);
}

/** Marca o trecho [início, fim] (em qualquer ordem) como seco ou molhado. */
export function marcarArea(peca: Piece, inicioMm: number, fimMm: number, kind: ZonaSecaMolhada['kind']): ZonaSecaMolhada[] {
  const total = comprimentoDoBalcao(peca);
  const a = Math.max(0, Math.min(inicioMm, fimMm)), b = Math.min(total, Math.max(inicioMm, fimMm));
  if (b - a < MINIMO) return peca.wetDryZones;
  const restantes = peca.wetDryZones.flatMap((zona) => [
    ...(zona.startMm < a ? [{ ...zona, endMm: Math.min(zona.endMm, a) }] : []),
    ...(zona.endMm > b ? [{ ...zona, startMm: Math.max(zona.startMm, b) }] : []),
  ]).filter((zona) => zona.endMm - zona.startMm >= 1);
  return organizar([...restantes, { kind, startMm: a, endMm: b }]);
}

/** Troca seca ↔ molhada de uma área (índice em wetDryZones). */
export const trocarTipoArea = (peca: Piece, indice: number): ZonaSecaMolhada[] =>
  organizar(peca.wetDryZones.map((zona, i): ZonaSecaMolhada => i === indice ? { ...zona, kind: zona.kind === 'WET' ? 'DRY' : 'WET' } : zona));

/** Tira uma área (índice em wetDryZones); o trecho fica sem marcação. */
export const tirarArea = (peca: Piece, indice: number): ZonaSecaMolhada[] => peca.wetDryZones.filter((_, i) => i !== indice);

/** Trecho vertical dentro da peça na posição x (o maior, se a peça tiver vão, como um U). */
export function faixaDentroDaPeca(peca: Piece, x: number): { y0: number; y1: number } | null {
  const pontos = sampleContour(peca.contour, 2);
  const ys = pontos.flatMap((a, i) => {
    const b = pontos[(i + 1) % pontos.length];
    if ((a.x - x) * (b.x - x) >= 0 && !(a.x === x && b.x !== x)) return [];
    return [a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)];
  }).sort((a, b) => a - b);
  let melhor: { y0: number; y1: number } | null = null;
  for (let i = 0; i + 1 < ys.length; i += 2) if (!melhor || ys[i + 1] - ys[i] > melhor.y1 - melhor.y0) melhor = { y0: ys[i], y1: ys[i + 1] };
  return melhor;
}
