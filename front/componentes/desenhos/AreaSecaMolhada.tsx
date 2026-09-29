'use client';

import { faixaDentroDaPeca, formatMeasure, sampleContour, type Piece, type ZonaSecaMolhada } from '@inova/domain/technical';
import { Texto, pontosSvg } from './svg';

/** Trecho sendo marcado (ou já marcado, esperando seco/molhado), em mm a partir da ponta esquerda da peça. */
export type MarcacaoArea = { pecaId: string; inicio: number; fim: number };

/**
 * Prévia da área enquanto puxa: a faixa entre o começo e o ponto atual, só
 * dentro da pedra, com o tamanho calculado na hora.
 */
export function PreviaArea({ peca, marcacao, escala }: { peca: Piece; marcacao: MarcacaoArea; escala: number }) {
  const px = (valor: number) => valor / escala;
  const pontos = sampleContour(peca.contour, Math.max(1, px(1.5)));
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  const [minX, minY, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...ys)];
  const a = minX + Math.min(marcacao.inicio, marcacao.fim), b = minX + Math.max(marcacao.inicio, marcacao.fim);
  const faixa = faixaDentroDaPeca(peca, (a + b) / 2) ?? { y0: minY, y1: maxY };
  return <g transform={`translate(${peca.x} ${peca.y}) rotate(${-peca.rotationDeg})`} className="tec-area-previa" pointerEvents="none">
    <defs><clipPath id={`previa-area-${peca.id}`}><polygon points={pontosSvg(pontos)} /></clipPath></defs>
    <rect x={a} y={minY} width={Math.max(b - a, px(1))} height={maxY - minY} clipPath={`url(#previa-area-${peca.id})`} className="tec-area-previa-faixa" />
    <line x1={minX + marcacao.inicio} y1={minY - px(12)} x2={minX + marcacao.inicio} y2={maxY + px(12)} className="tec-area-previa-marca" strokeWidth={px(2.5)} />
    <line x1={minX + marcacao.fim} y1={minY - px(12)} x2={minX + marcacao.fim} y2={maxY + px(12)} className="tec-area-previa-marca" strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(4)}`} />
    <Texto x={(a + b) / 2} y={(faixa.y0 + faixa.y1) / 2} tamanho={px(15)} className="tec-area-previa-rotulo">{formatMeasure(b - a)}</Texto>
  </g>;
}

/** Depois do segundo clique: a área é seca ou molhada? */
export function JanelaArea({ peca, marcacao, aoEscolher, aoCancelar }: {
  peca: Piece | undefined; marcacao: MarcacaoArea | null; aoEscolher: (tipo: ZonaSecaMolhada['kind']) => void; aoCancelar: () => void;
}) {
  if (!peca || !marcacao) return null;
  const inicio = Math.min(marcacao.inicio, marcacao.fim), fim = Math.max(marcacao.inicio, marcacao.fim);
  return <section className="tec-folha-traco" role="dialog" aria-label="Tipo da área">
    <strong>Área de {formatMeasure(fim - inicio)} em {peca.name}</strong>
    <p>De {formatMeasure(inicio)} a {formatMeasure(fim)} a partir da ponta esquerda. É área seca ou molhada?</p>
    <div className="tec-acoes">
      <button type="button" className="botao-destaque tec-botao-molhada" onClick={() => aoEscolher('WET')}>💧 Área molhada</button>
      <button type="button" className="botao-contorno" onClick={() => aoEscolher('DRY')}>Área seca</button>
      <button type="button" className="botao-contorno" onClick={aoCancelar}>Cancelar</button>
    </div>
  </section>;
}
