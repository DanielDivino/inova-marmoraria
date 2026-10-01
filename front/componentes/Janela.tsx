'use client';

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Icone, type NomeIcone } from './filtros/Filtros';

/**
 * Janela (modal) padrão do sistema: título com ícone, X para fechar, corpo e rodapé com a dica
 * à esquerda e os botões à direita. Fecha no Esc, no X ou clicando fora (se não estiver ocupada).
 * Com `aoEnviar`, corpo e rodapé viram um formulário (Enter envia).
 */
export function Janela({ aberta, aoFechar, titulo, subtitulo, icone, children, rodape, dica, largura = 'media', className, rotuloFechar = 'Fechar', alerta = false, ocupada = false, aoEnviar }: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icone?: NomeIcone;
  children?: ReactNode;
  rodape?: ReactNode;
  dica?: ReactNode;
  largura?: 'pequena' | 'media' | 'grande';
  className?: string;
  rotuloFechar?: string;
  /** Pergunta que exige resposta (confirmação): papel "alertdialog". */
  alerta?: boolean;
  /** Salvando: não fecha no Esc nem clicando fora. */
  ocupada?: boolean;
  aoEnviar?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const id = useId();
  // Ao fechar (ou sair da tela), o foco volta para quem abriu a janela, como na janela nativa.
  const quemAbriu = useRef<HTMLElement | null>(null);
  const devolverFoco = () => window.setTimeout(() => {
    // Ainda aberta (o React em desenvolvimento repete os efeitos): nada a devolver.
    if (dialogo.current?.isConnected && dialogo.current.open) return;
    const alvo = quemAbriu.current;
    quemAbriu.current = null;
    if (alvo?.isConnected && !document.querySelector('dialog[open]')) alvo.focus({ preventScroll: true });
  }, 0);
  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    if (aberta && !elemento.open) { quemAbriu.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; elemento.showModal(); }
    if (!aberta && elemento.open) { elemento.close(); devolverFoco(); }
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { devolverFoco(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fechar = () => { if (!ocupada) aoFechar(); };
  const conteudo = <>
    <div className="janela-corpo">{children}</div>
    {(rodape || dica) && <footer className="janela-rodape">{dica && <small><Icone nome="info" tamanho={14} />{dica}</small>}{rodape && <div className="janela-acoes">{rodape}</div>}</footer>}
  </>;
  return <dialog ref={dialogo} className={`janela janela-${largura}${className ? ` ${className}` : ''}`} role={alerta ? 'alertdialog' : undefined} aria-labelledby={`${id}-titulo`} aria-describedby={subtitulo ? `${id}-subtitulo` : undefined}
    onCancel={(event) => { event.preventDefault(); fechar(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) fechar(); }}>
    <header className="janela-cabecalho">
      <div>
        <h2 id={`${id}-titulo`}>{icone && <Icone nome={icone} tamanho={18} />}{titulo}</h2>
        {subtitulo && <p id={`${id}-subtitulo`}>{subtitulo}</p>}
      </div>
      <button type="button" className="janela-fechar" aria-label={rotuloFechar} title={rotuloFechar} disabled={ocupada} onClick={fechar}><Icone nome="fechar" /></button>
    </header>
    {aoEnviar ? <form className="janela-formulario" onSubmit={aoEnviar}>{conteudo}</form> : conteudo}
  </dialog>;
}
