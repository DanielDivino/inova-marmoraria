'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icone } from '../filtros/Filtros';
import './barra-atendimento.css';

/** Iniciais do nome (primeira e última palavra): "Aline Souza" → "AS". */
export const iniciaisDoNome = (nome?: string | null) => {
  const palavras = nome?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!palavras.length) return '';
  return (palavras[0][0] + (palavras.length > 1 ? palavras[palavras.length - 1][0] : palavras[0][1] ?? '')).toUpperCase();
};

/** Botão em forma de etiqueta que abre um menu logo abaixo; fecha ao escolher, com Esc ou clicando fora. */
function MenuAtendimento({ rotulo, destaque = false, gatilho, children }: { rotulo: string; destaque?: boolean; gatilho: ReactNode; children: (fechar: () => void) => ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (event: PointerEvent) => { if (!caixa.current?.contains(event.target as Node)) setAberto(false); };
    const tecla = (event: KeyboardEvent) => { if (event.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    caixa.current?.querySelector<HTMLElement>('[role=menu] button')?.focus();
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);
  return <div className="atendimento-menu" ref={caixa}>
    <button ref={botao} type="button" className={`atendimento-chip${destaque ? ' destaque' : ''}`} aria-haspopup="menu" aria-expanded={aberto} aria-label={rotulo} onClick={() => setAberto((atual) => !atual)}>
      {gatilho}<svg className="atendimento-chip-seta" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {aberto && <div className="atendimento-lista" role="menu" aria-label={rotulo}>{children(() => setAberto(false))}</div>}
  </div>;
}

type Props = {
  /** Clientes abertos neste orçamento (vazio ao editar um orçamento salvo: só há um cliente). */
  clientes: { id: string; nome: string | null }[];
  clienteAtivo: number;
  clienteNome: string | null;
  projetos: { id: string; nome: string }[];
  projetoAtivo: number;
  aoEscolherCliente: (index: number) => void;
  aoSelecionarCliente: () => void;
  aoCadastrarCliente: () => void;
  aoOutroCliente?: () => void;
  aoRemoverCliente?: () => void;
  aoEditarCliente?: () => void;
  aoEscolherProjeto: (index: number) => void;
  aoAdicionarProjeto: () => void;
  aoExcluirProjeto: () => void;
};

/**
 * Barra do atendimento: Cliente ▾ › Projeto ▾ · + Projeto · Editar cliente.
 * Substitui as abas de clientes, os botões de cliente e as abas de projetos.
 */
export function BarraAtendimento({ clientes, clienteAtivo, clienteNome, projetos, projetoAtivo, aoEscolherCliente, aoSelecionarCliente, aoCadastrarCliente, aoOutroCliente, aoRemoverCliente, aoEditarCliente, aoEscolherProjeto, aoAdicionarProjeto, aoExcluirProjeto }: Props) {
  const projeto = projetos[projetoAtivo];
  const nomeCliente = (nome: string | null, index: number) => nome || `Cliente ${index + 1}`;
  return <nav className="atendimento-barra" aria-label="Cliente e projeto">
    <MenuAtendimento rotulo={clienteNome ? `Cliente: ${clienteNome}` : 'Cliente: selecionar'} gatilho={<>
      <span className="atendimento-avatar" aria-hidden="true">{iniciaisDoNome(clienteNome) || <Icone nome="pessoa" tamanho={16} />}</span>
      <span className="atendimento-chip-texto"><small>Cliente</small><strong>{clienteNome || 'Selecionar cliente'}</strong></span>
    </>}>
      {(fechar) => <>
        {clientes.length > 1 && <>
          <p className="atendimento-lista-titulo">Clientes neste orçamento</p>
          {clientes.map((cliente, index) => <button type="button" role="menuitemradio" aria-checked={index === clienteAtivo} key={cliente.id} onClick={() => { fechar(); aoEscolherCliente(index); }}>
            <span className="atendimento-avatar pequeno" aria-hidden="true">{iniciaisDoNome(cliente.nome) || index + 1}</span>{nomeCliente(cliente.nome, index)}{index === clienteAtivo && <Icone nome="marcado" tamanho={16} />}
          </button>)}
          <i className="atendimento-lista-divisor" aria-hidden="true" />
        </>}
        {clienteNome
          ? <button type="button" role="menuitem" onClick={() => { fechar(); aoSelecionarCliente(); }}><Icone nome="pessoa" tamanho={16} />Trocar cliente</button>
          : <>
            <button type="button" role="menuitem" onClick={() => { fechar(); aoSelecionarCliente(); }}><Icone nome="buscar" tamanho={16} />Selecionar cliente existente</button>
            <button type="button" role="menuitem" onClick={() => { fechar(); aoCadastrarCliente(); }}><Icone nome="mais" tamanho={16} />Cadastrar novo cliente</button>
          </>}
        {aoOutroCliente && <button type="button" role="menuitem" onClick={() => { fechar(); aoOutroCliente(); }}><Icone nome="equipe" tamanho={16} />+ Outro cliente neste orçamento</button>}
        {aoRemoverCliente && <button type="button" role="menuitem" className="perigo" onClick={() => { fechar(); aoRemoverCliente(); }}><Icone nome="fechar" tamanho={16} />Remover este cliente</button>}
      </>}
    </MenuAtendimento>
    <span className="atendimento-seta" aria-hidden="true">›</span>
    <MenuAtendimento destaque rotulo={`Projeto: ${projeto?.nome ?? ''}`} gatilho={<>
      <span className="atendimento-icone" aria-hidden="true"><Icone nome="casa" tamanho={18} /></span>
      <span className="atendimento-chip-texto"><small>Projeto</small><strong>{projeto?.nome}</strong></span>
    </>}>
      {(fechar) => <>
        <p className="atendimento-lista-titulo">Projetos deste cliente</p>
        {projetos.map((entrada, index) => <button type="button" role="menuitemradio" aria-checked={index === projetoAtivo} key={entrada.id} onClick={() => { fechar(); aoEscolherProjeto(index); }}>
          <Icone nome="casa" tamanho={16} />{entrada.nome}{index === projetoAtivo && <Icone nome="marcado" tamanho={16} />}
        </button>)}
        <i className="atendimento-lista-divisor" aria-hidden="true" />
        <button type="button" role="menuitem" className="perigo" aria-label={`Excluir ${projeto?.nome ?? 'projeto'}`} onClick={() => { fechar(); aoExcluirProjeto(); }}><Icone nome="fechar" tamanho={16} />Excluir este projeto</button>
      </>}
    </MenuAtendimento>
    <button type="button" className="atendimento-link destaque" aria-label="Adicionar projeto" onClick={aoAdicionarProjeto}><Icone nome="mais" tamanho={16} />Projeto</button>
    {aoEditarCliente && <button type="button" className="atendimento-link" onClick={aoEditarCliente}><Icone nome="lapis" tamanho={16} />Editar cliente</button>}
  </nav>;
}
