'use client';

import { formatMeasure } from '@inova/domain/technical';
import type { RecorteEmAndamento, TracoEmAndamento } from './useDesenhoLivre';

/**
 * Perguntas do desenho livre, numa folha que não cobre o traço: fechar a forma,
 * correção de contorno inválido e tipo do recorte desenhado.
 */
export function JanelaTraco({ traco, recorte, aoFechar, aoCriarRecorte, aoDescartar }: {
  traco: TracoEmAndamento | null; recorte: RecorteEmAndamento | null;
  aoFechar: () => void; aoCriarRecorte: (tipo: 'SINK' | 'CUTOUT') => void; aoDescartar: () => void;
}) {
  if (recorte) return <section className="tec-folha-traco" role="dialog" aria-label="Recorte desenhado">
    <strong>Recorte {recorte.recorte.shape === 'OVAL' ? 'oval' : 'retangular'} · {formatMeasure(recorte.recorte.widthMm)} × {formatMeasure(recorte.recorte.lengthMm)}</strong>
    <p>As medidas podem ser ajustadas posteriormente no painel.</p>
    <div className="tec-acoes"><button type="button" className="botao-destaque" onClick={() => aoCriarRecorte('SINK')}>É uma cuba</button><button type="button" className="botao-contorno" onClick={() => aoCriarRecorte('CUTOUT')}>Cooktop / recorte</button><button type="button" className="botao-contorno" onClick={aoDescartar}>Descartar</button></div>
  </section>;
  if (!traco) return null;
  if (!traco.fechado) return <section className="tec-folha-traco" role="dialog" aria-label="Forma aberta">
    <strong>A forma não fechou.</strong><p>O final do traço ficou distante do início. Deseja fechar a forma ligando o final ao início?</p>
    <div className="tec-acoes"><button type="button" className="botao-destaque" onClick={aoFechar}>Fechar a forma</button><button type="button" className="botao-contorno" onClick={aoDescartar}>Desenhar de novo</button></div>
  </section>;
  if (!traco.valido) return <section className="tec-folha-traco erro" role="alert">
    <strong>O contorno se cruza.</strong><p>{traco.motivo ?? 'Desfaça o traço e desenhe novamente, sem cruzar as linhas.'}</p>
    <div className="tec-acoes"><button type="button" className="botao-destaque" onClick={aoDescartar}>Desfazer traço</button></div>
  </section>;
  return null;
}
