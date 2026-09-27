'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import './filtros.css';

/** Ícones de traço usados nas abas, nos campos e nos botões das listas. */
const ICONES = {
  todos: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  andamento: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M2.5 12h3M18.5 12h3M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  aprovado: <><circle cx="12" cy="12" r="9" /><path d="m8 12.2 2.8 2.8L16 9.2" /></>,
  recusado: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  prazo: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  entregue: <><path d="M3 6.5h11v9.5H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  aguardando: <path d="M7 3h10M7 21h10M8 3c0 4.5 8 5 8 9s-8 4.5-8 9M16 3c0 4.5-8 5-8 9s8 4.5 8 9" />,
  retrabalho: <><path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v4M12 17h.01" /></>,
  alerta: <><path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v4M12 17h.01" /></>,
  historico: <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  marcado: <path d="m5 12.5 4.5 4.5L19 7" />,
  ordenar: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
  rota: <><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
  material: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  pendente: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5h6M9 10h6M9 14h4" /></>,
  pronto: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12.2 2.8 2.8L16 9.2" /></>,
  montagem: <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.7-8.7a4 4 0 0 0-2-2Z" />,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  pessoa: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  equipe: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M18 14.5a5.5 5.5 0 0 1 3 5.5" /></>,
  vendedor: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12.5h18" /></>,
  escudo: <path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6l-7-3Z" />,
  inativo: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  incompleto: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  documento: <><path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  pedra: <><path d="M7 4h10l4 5-9 11L3 9l4-5Z" /><path d="M3 9h18M9.5 4 12 20M14.5 4 12 20" /></>,
  camadas: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5" /></>,
  foto: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 8" /></>,
  valor: <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  limpar: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  filtro: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  mais: <path d="M12 5v14M5 12h14" />,
  seta: <path d="m6 9 6 6 6-6" />,
} satisfies Record<string, ReactNode>;
export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }) {
  return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[nome]}</svg>;
}

export type OpcaoAba<T extends string> = { valor: T; rotulo: string; icone: NomeIcone; total?: number };

/**
 * Abas de filtro com ícone e contagem; só uma fica marcada. `grupos` separa as
 * abas com um título pequeno. Na variante "grade" cada grupo é uma linha com as
 * abas alinhadas em colunas.
 */
export function AbasFiltro<T extends string>({ rotulo, valor, aoEscolher, grupos, variante = 'linha' }: { rotulo: string; valor: T; aoEscolher: (valor: T) => void; grupos: { titulo?: string; opcoes: OpcaoAba<T>[] }[]; variante?: 'linha' | 'grade' }) {
  const botao = (opcao: OpcaoAba<T>) => <button type="button" key={opcao.valor} aria-pressed={valor === opcao.valor} onClick={() => aoEscolher(opcao.valor)}>
    <Icone nome={opcao.icone} /><span>{opcao.rotulo}</span>{opcao.total !== undefined && <b>{opcao.total}</b>}
  </button>;
  return <div className={`abas-filtro${variante === 'grade' ? ' abas-grade' : ''}`} role="group" aria-label={rotulo}>
    {grupos.map((grupo, indice) => variante === 'grade'
      ? <div className="abas-filtro-grupo" key={grupo.titulo ?? indice}>
        {grupo.titulo && <span className="abas-filtro-titulo">{grupo.titulo}</span>}
        <div className="abas-filtro-botoes">{grupo.opcoes.map((opcao) => botao(opcao))}</div>
      </div>
      : <div className="abas-filtro-grupo" key={grupo.titulo ?? indice}>
        {grupo.titulo && <span className="abas-filtro-titulo">{grupo.titulo}</span>}
        {grupo.opcoes.map((opcao) => botao(opcao))}
      </div>)}
  </div>;
}

/**
 * Painel de filtros: campos com ícone, "Limpar" e, quando há busca a aplicar,
 * "Buscar". No celular fica recolhido atrás do botão "Filtros".
 */
export function PainelFiltros({ rotulo, ativos, aoLimpar, aoBuscar, rotuloBuscar = 'Buscar', ocupado, children }: { rotulo: string; ativos: number; aoLimpar: () => void; aoBuscar?: () => void; rotuloBuscar?: string; ocupado?: boolean; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return <form className={`painel-filtros${aberto ? ' aberto' : ''}`} aria-label={rotulo} onSubmit={(event) => { event.preventDefault(); aoBuscar?.(); }}>
    <button type="button" className="painel-filtros-alternar" aria-expanded={aberto} onClick={() => setAberto((atual) => !atual)}>
      <Icone nome="filtro" />Filtros{ativos ? <b>{ativos}</b> : null}<Icone nome="seta" />
    </button>
    <div className="painel-filtros-campos">
      {children}
      <div className="painel-filtros-acoes">
        <button type="button" className="botao-contorno" disabled={!ativos} onClick={aoLimpar}><Icone nome="limpar" />Limpar</button>
        {aoBuscar && <button type="submit" className="botao-destaque" disabled={ocupado}><Icone nome="buscar" />{rotuloBuscar}</button>}
      </div>
    </div>
  </form>;
}

/** Campo do painel: título em cima e o controle com ícone à esquerda. Com dois controles (período), vira um grupo. */
export function CampoFiltro({ rotulo, icone, grupo, children }: { rotulo: string; icone: NomeIcone; grupo?: boolean; children: ReactNode }) {
  const conteudo = <><span className="campo-filtro-rotulo">{rotulo}</span><span className="campo-filtro-controle"><Icone nome={icone} />{children}</span></>;
  return grupo ? <div className="campo-filtro campo-filtro-grupo" role="group" aria-label={rotulo}>{conteudo}</div> : <label className="campo-filtro">{conteudo}</label>;
}

/** Mesma faixa de largura do mobile.css. */
export function useCelular() {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 760px)');
    const atualizar = () => setCelular(consulta.matches);
    atualizar();
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return celular;
}

export type OpcaoMenu<T extends string> = { valor: T; rotulo: string; cor?: string };

/**
 * Filtro compacto da barra: rótulo pequeno em cima, valor embaixo e um menu
 * próprio (a lista nativa do sistema não segue o tema e some no escuro).
 * Teclado: setas, Home/End, Enter ou Espaço escolhem; Esc fecha.
 */
export function MenuSelecao<T extends string>({ rotulo, icone, valor, opcoes, aoEscolher, rotuloValor, variante = 'barra' }: { rotulo: string; icone: NomeIcone; valor: T; opcoes: OpcaoMenu<T>[]; aoEscolher: (valor: T) => void; rotuloValor?: string; variante?: 'barra' | 'linha' }) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const selecionado = opcoes.find((opcao) => opcao.valor === valor);
  useEffect(() => {
    if (!aberto) return;
    setAtivo(Math.max(0, opcoes.findIndex((opcao) => opcao.valor === valor)));
    lista.current?.focus();
    const fora = (event: MouseEvent) => { if (!raiz.current?.contains(event.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (aberto) document.getElementById(`${id}-${ativo}`)?.scrollIntoView({ block: 'nearest' }); }, [aberto, ativo, id]);
  const fechar = () => { setAberto(false); botao.current?.focus(); };
  const escolher = (indice: number) => { aoEscolher(opcoes[indice].valor); fechar(); };
  const teclado = (event: KeyboardEvent) => {
    const mover: Record<string, number> = { ArrowDown: ativo + 1, ArrowUp: ativo - 1, Home: 0, End: opcoes.length - 1 };
    if (event.key in mover) { event.preventDefault(); setAtivo(Math.min(opcoes.length - 1, Math.max(0, mover[event.key]))); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); escolher(ativo); }
    else if (event.key === 'Escape') { event.preventDefault(); fechar(); }
    else if (event.key === 'Tab') setAberto(false);
  };
  return <div className={`menu-selecao ${variante}`} ref={raiz}>
    <button type="button" ref={botao} className={`seletor-compacto ${variante}${aberto ? ' aberto' : ''}`} aria-haspopup="listbox" aria-expanded={aberto} aria-controls={aberto ? id : undefined} aria-label={`${rotulo}: ${rotuloValor ?? selecionado?.rotulo ?? ''}`}
      onClick={() => setAberto((atual) => !atual)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setAberto(true); } }}>
      <Icone nome={icone} tamanho={variante === 'barra' ? 22 : 16} />
      <span>{variante === 'barra' && <small>{rotulo}</small>}<strong>{rotuloValor ?? selecionado?.rotulo}</strong></span>
    </button>
    {aberto && <ul id={id} ref={lista} className="menu-selecao-lista" role="listbox" tabIndex={-1} aria-label={rotulo} aria-activedescendant={`${id}-${ativo}`} onKeyDown={teclado}>
      {opcoes.map((opcao, indice) => <li key={opcao.valor} id={`${id}-${indice}`} role="option" aria-selected={opcao.valor === valor} className={indice === ativo ? 'ativo' : undefined}
        onMouseEnter={() => setAtivo(indice)} onClick={() => escolher(indice)}>
        {opcao.cor && <i style={{ backgroundColor: opcao.cor }} aria-hidden="true" />}<span>{opcao.rotulo}</span>{opcao.valor === valor && <Icone nome="marcado" tamanho={16} />}
      </li>)}
    </ul>}
  </div>;
}

/** Janela de filtros do celular (dialog nativo): fecha no Esc, no X ou tocando fora. */
export function ModalFiltros({ aberto, aoFechar, titulo, children, rodape }: { aberto: boolean; aoFechar: () => void; titulo: string; children: ReactNode; rodape: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    if (aberto && !elemento.open) elemento.showModal();
    if (!aberto && elemento.open) elemento.close();
  }, [aberto]);
  return <dialog ref={dialogo} className="modal-filtros" aria-label={titulo} onClose={aoFechar} onMouseDown={(event) => { if (event.target === event.currentTarget) aoFechar(); }}>
    <header><strong>{titulo}</strong><button type="button" className="modal-filtros-fechar" aria-label="Fechar filtros" onClick={aoFechar}><Icone nome="fechar" /></button></header>
    <div className="modal-filtros-campos">{children}</div>
    <footer>{rodape}</footer>
  </dialog>;
}

/** Atalhos no cabeçalho das páginas de cadastro. */
export function AtalhosCabecalho() {
  return <div className="atalhos-cabecalho">
    <Link className="botao-contorno" href="/mostruario"><Icone nome="camadas" />Mostruário</Link>
    <Link className="botao-contorno botao-contorno-destaque" href="/"><Icone nome="mais" />Novo orçamento</Link>
  </div>;
}
