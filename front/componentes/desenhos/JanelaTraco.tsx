'use client';

import { useEffect, useState } from 'react';
import { formatMeasure } from '@inova/domain/technical';
import type { CampoMetros } from '../../utilitarios/quick-quote';
import { EntradaMetros, metrosParaMm } from './CampoMedida';
import type { RecorteEmAndamento, TracoEmAndamento } from './useDesenhoLivre';

/**
 * Perguntas do desenho livre, numa folha que não cobre o traço: fechar a forma,
 * medida do lado de referência (dá a escala real) e o tipo do recorte desenhado.
 */
export function JanelaTraco({ traco, recorte, aoFechar, aoTrocarLado, aoCriarPeca, aoCriarRecorte, aoDescartar }: {
  traco: TracoEmAndamento | null; recorte: RecorteEmAndamento | null;
  aoFechar: () => void; aoTrocarLado: () => void; aoCriarPeca: (mm: number) => string | null; aoCriarRecorte: (tipo: 'SINK' | 'CUTOUT') => void; aoDescartar: () => void;
}) {
  const [campo, setCampo] = useState<CampoMetros>({ texto: '', livre: false });
  const [erro, setErro] = useState('');
  const lado = traco && traco.ladoReferencia !== null ? traco.pontos.length : 0;
  useEffect(() => { setErro(''); setCampo({ texto: '', livre: false }); }, [traco?.brutos, traco?.ladoReferencia]);
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
  const confirmar = () => {
    const mm = metrosParaMm(campo.texto);
    if (mm === null || mm < 10) { setErro('Informe a medida real do lado destacado, apenas com números (ex.: 240 para 2,40 m).'); return; }
    setErro(aoCriarPeca(mm) ?? '');
  };
  return <section className="tec-folha-traco" role="dialog" aria-label="Medida de referência">
    <strong>Qual a medida do lado destacado?</strong>
    <p>A escala de toda a peça é definida a partir dele ({lado} lados). Em seguida, toque nos demais lados para ajustá-los.</p>
    <form className="tec-referencia" onSubmit={(evento) => { evento.preventDefault(); confirmar(); }}>
      <span className="tec-campo-metros"><EntradaMetros autoFocus aria-label="Medida do lado destacado" valor={campo} aoMudar={setCampo} /><i aria-hidden="true">m</i></span>
      <button type="submit" className="botao-destaque">Criar peça</button>
    </form>
    {erro && <p role="alert" className="form-error">{erro}</p>}
    <div className="tec-acoes"><button type="button" className="botao-contorno" onClick={aoTrocarLado}>Medir outro lado</button><button type="button" className="botao-contorno" onClick={aoDescartar}>Descartar traço</button></div>
  </section>;
}
