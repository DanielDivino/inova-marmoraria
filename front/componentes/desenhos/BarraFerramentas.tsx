'use client';

import type { ReactNode } from 'react';
import type { PieceShape } from '@inova/domain/technical';
import type { Ferramenta, Modo, TipoCorpo, TipoNoLado } from './tipos';

type Props = {
  modo: Modo; ferramenta: Ferramenta; pendenteBorda: TipoNoLado | null; temPeca: boolean;
  podeDesfazer: boolean; podeRefazer: boolean; temTraco: boolean; passoMm: number;
  aoFerramenta: (ferramenta: Ferramenta) => void; aoAdicionarForma: (forma: PieceShape) => void; aoAdicionarCorpo: (tipo: TipoCorpo) => void;
  aoEscolherBorda: (tipo: TipoNoLado) => void; aoDesfazer: () => void; aoRefazer: () => void;
  aoDesfazerTraco: () => void; aoLimpar: () => void; aoPasso: (mm: number) => void;
};

function Botao({ ativo, desativado, rotulo, icone, aoClicar }: { ativo?: boolean; desativado?: boolean; rotulo: string; icone: ReactNode; aoClicar: () => void }) {
  return <button type="button" className="tec-ferramenta" aria-pressed={ativo ?? undefined} disabled={desativado} onClick={aoClicar} title={rotulo}><span aria-hidden="true">{icone}</span>{rotulo}</button>;
}

/**
 * Ferramentas do modo escolhido. Manual: formas prontas, componentes e bordas.
 * Desenho livre: traço de peça ou de recorte, desfazer traço e limpar. Nos dois:
 * selecionar/mover, texto e desfazer/refazer.
 */
export function BarraFerramentas(props: Props) {
  const { modo, ferramenta, pendenteBorda, temPeca } = props;
  return <nav className="tec-ferramentas" aria-label="Ferramentas do desenho">
    <div className="tec-grupo">
      <Botao rotulo="Selecionar" icone="☝" ativo={ferramenta === 'SELECIONAR' && !pendenteBorda} aoClicar={() => props.aoFerramenta('SELECIONAR')} />
      {modo === 'LIVRE' && <>
        <Botao rotulo="Desenhar peça" icone="✍" ativo={ferramenta === 'TRACO_PECA'} aoClicar={() => props.aoFerramenta('TRACO_PECA')} />
        <Botao rotulo="Desenhar recorte" icone="◌" ativo={ferramenta === 'TRACO_RECORTE'} desativado={!temPeca} aoClicar={() => props.aoFerramenta('TRACO_RECORTE')} />
      </>}
      <Botao rotulo="Linha" icone="╱" ativo={ferramenta === 'LINHA'} aoClicar={() => props.aoFerramenta('LINHA')} />
      <Botao rotulo="Texto" icone="T" ativo={ferramenta === 'TEXTO'} aoClicar={() => props.aoFerramenta('TEXTO')} />
      <Botao rotulo="Cota livre" icone="↔" ativo={ferramenta === 'COTA'} desativado={!temPeca} aoClicar={() => props.aoFerramenta('COTA')} />
      <Botao rotulo="Seca / molhada" icone="💧" ativo={ferramenta === 'AREA'} desativado={!temPeca} aoClicar={() => props.aoFerramenta('AREA')} />
    </div>
    {modo === 'MANUAL' ? <div className="tec-grupo" aria-label="Formas prontas">
      <Botao rotulo="Reta" icone="▭" aoClicar={() => props.aoAdicionarForma('RECTANGLE')} />
      <Botao rotulo="Em L" icone="⌙" aoClicar={() => props.aoAdicionarForma('L')} />
      <Botao rotulo="Em U" icone="⊔" aoClicar={() => props.aoAdicionarForma('U')} />
      <Botao rotulo="Circular" icone="◯" aoClicar={() => props.aoAdicionarForma('CIRCLE')} />
      <Botao rotulo="Arredondada" icone="▢" aoClicar={() => props.aoAdicionarForma('ROUNDED')} />
    </div> : <div className="tec-grupo" aria-label="Traço">
      <Botao rotulo="Desfazer traço" icone="↺" desativado={!props.temTraco && !props.podeDesfazer} aoClicar={props.aoDesfazerTraco} />
      <Botao rotulo="Limpar" icone="⌫" aoClicar={props.aoLimpar} />
      <label className="tec-ferramenta tec-passo">Arredondar<select value={props.passoMm} onChange={(evento) => props.aoPasso(Number(evento.target.value))}><option value={10}>1 cm</option><option value={50}>5 cm</option></select></label>
    </div>}
    <div className="tec-grupo" aria-label="Componentes da peça">
      <Botao rotulo="Cuba" icone="◫" desativado={!temPeca} aoClicar={() => props.aoAdicionarCorpo('SINK')} />
      <Botao rotulo="Cuba esculpida" icone="◐" desativado={!temPeca} aoClicar={() => props.aoAdicionarCorpo('SCULPTED_SINK')} />
      <Botao rotulo="Cooktop" icone="▦" desativado={!temPeca} aoClicar={() => props.aoAdicionarCorpo('CUTOUT')} />
      <Botao rotulo="Furo" icone="•" desativado={!temPeca} aoClicar={() => props.aoAdicionarCorpo('HOLE')} />
      <Botao rotulo="Rodabanca" icone="▬" ativo={pendenteBorda === 'BACKSPLASH'} desativado={!temPeca} aoClicar={() => props.aoEscolherBorda('BACKSPLASH')} />
      <Botao rotulo="Saia" icone="▭" ativo={pendenteBorda === 'SKIRT'} desativado={!temPeca} aoClicar={() => props.aoEscolherBorda('SKIRT')} />
      <Botao rotulo="Acabamento" icone="╱" ativo={pendenteBorda === 'EDGE_FINISH'} desativado={!temPeca} aoClicar={() => props.aoEscolherBorda('EDGE_FINISH')} />
      <Botao rotulo="Emenda" icone="┆" ativo={pendenteBorda === 'SEAM'} desativado={!temPeca} aoClicar={() => props.aoEscolherBorda('SEAM')} />
    </div>
    <div className="tec-grupo tec-historico">
      <Botao rotulo="Desfazer" icone="↶" desativado={!props.podeDesfazer} aoClicar={props.aoDesfazer} />
      <Botao rotulo="Refazer" icone="↷" desativado={!props.podeRefazer} aoClicar={props.aoRefazer} />
    </div>
  </nav>;
}
