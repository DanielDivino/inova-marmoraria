'use client';

import { useId, type MouseEvent, type ReactNode } from 'react';
import { Icone } from '../filtros/Filtros';
import { MenuAcoes, type AcaoMenu } from '../MenuAcoes';

/** Tons pastel dos blocos de projeto, um por projeto (repetem depois do sexto). */
export const TONS_DE_PROJETO = 6;

/**
 * Projeto na tela do orçamento: um bloco compacto, num tom pastel próprio, com nome, resumo, situação
 * e valor; clicando, abre os detalhes (impressões, entrega, desenho, peças e serviços). Ao lado da
 * situação, uma ação rápida (ex.: Retrabalho); o "⋯" traz as outras ações sem precisar abrir o bloco.
 */
export function BlocoProjeto({ id, tom, nome, resumo, valor, situacao, aberto, aoAlternar, acaoRapida, acoes, children }: {
  id: string; tom: number; nome: string; resumo: string; valor: string;
  /** Depois da aprovação: aprovado ou não aprovado pelo cliente. */
  situacao?: 'aprovado' | 'nao-aprovado';
  aberto: boolean; aoAlternar: () => void;
  /** Botão ao lado da situação, no bloco fechado. */
  acaoRapida?: ReactNode;
  /** Ações do projeto no "⋯" (grupos separados por uma linha). */
  acoes?: AcaoMenu[][];
  children: ReactNode;
}) {
  const corpo = useId();
  // Clicar na faixa (fora dos botões) também abre e fecha; o botão do nome é o que o teclado usa.
  const aoClicarNaFaixa = (evento: MouseEvent<HTMLDivElement>) => { if (!(evento.target as HTMLElement).closest('button, a, [role=menu]')) aoAlternar(); };
  return <article id={id} className={`projeto-bloco tom-${(tom % TONS_DE_PROJETO) + 1}${situacao === 'nao-aprovado' ? ' nao-aprovado' : ''}${aberto ? ' aberto' : ''}`}>
    <div className="projeto-bloco-topo" onClick={aoClicarNaFaixa}>
      <button type="button" className="projeto-bloco-cabeca" aria-expanded={aberto} aria-controls={corpo} onClick={aoAlternar}>
        <span className="projeto-bloco-nome"><strong>{nome}</strong><small>{resumo}</small></span>
      </button>
      <div className="projeto-bloco-lado">
        {acaoRapida}
        {situacao && <span className={`projeto-bloco-situacao ${situacao}`}>{situacao === 'aprovado' ? 'Aprovado' : 'Não aprovado'}</span>}
        <b className="projeto-bloco-valor">{valor}</b>
        <span className="projeto-bloco-seta" aria-hidden="true"><Icone nome="seta" tamanho={16} /></span>
        {acoes && <MenuAcoes rotulo={`Ações de ${nome}`} titulo={nome} grupos={acoes} />}
      </div>
    </div>
    {aberto && <div id={corpo} className="projeto-bloco-corpo">{children}</div>}
  </article>;
}
