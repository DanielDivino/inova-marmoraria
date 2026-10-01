'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icone, type NomeIcone } from './filtros/Filtros';

export type AcaoMenu = { rotulo: string; icone: NomeIcone; href?: string; aoEscolher?: () => void; perigo?: boolean; desabilitada?: boolean };

/**
 * Botão "⋯" com as ações menos usadas (ex.: Editar, Desenho técnico, Cancelar). Os grupos são
 * separados por uma linha; setas navegam, Esc fecha e devolve o foco ao botão.
 */
export function MenuAcoes({ rotulo, titulo, grupos }: { rotulo: string; titulo?: string; grupos: AcaoMenu[][] }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const visiveis = grupos.filter((grupo) => grupo.length);
  useEffect(() => {
    if (!aberto) return;
    const itens = () => [...(caixa.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? [])];
    const fora = (event: PointerEvent) => { if (!caixa.current?.contains(event.target as Node)) setAberto(false); };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setAberto(false); botao.current?.focus(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const lista = itens(), atual = lista.indexOf(document.activeElement as HTMLElement);
      lista[(atual + (event.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length]?.focus();
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    itens()[0]?.focus();
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);
  if (!visiveis.length) return null;
  const fechar = () => setAberto(false);
  return <div className="menu-acoes" ref={caixa}>
    <button ref={botao} type="button" className="botao-contorno menu-acoes-botao" aria-haspopup="menu" aria-expanded={aberto} aria-label={rotulo} title={rotulo} onClick={() => setAberto((atual) => !atual)}><Icone nome="opcoes" /></button>
    {aberto && <div className="menu-acoes-lista" role="menu" aria-label={rotulo}>
      {titulo && <p className="menu-acoes-titulo" aria-hidden="true">{titulo}</p>}
      {visiveis.map((grupo, indice) => <Fragment key={indice}>
        {indice > 0 && <i className="menu-acoes-divisor" aria-hidden="true" />}
        {grupo.map((acao) => {
          const conteudo = <><Icone nome={acao.icone} tamanho={16} />{acao.rotulo}</>;
          const classe = acao.perigo ? 'perigo' : undefined;
          return acao.href && !acao.desabilitada
            ? <Link key={acao.rotulo} role="menuitem" className={classe} href={acao.href} onClick={fechar}>{conteudo}</Link>
            : <button key={acao.rotulo} type="button" role="menuitem" className={classe} aria-disabled={acao.desabilitada || undefined} disabled={acao.desabilitada} onClick={() => { fechar(); acao.aoEscolher?.(); }}>{conteudo}</button>;
        })}
      </Fragment>)}
    </div>}
  </div>;
}
