'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DesenhoNoOrcamento } from '../desenhos/EditorTecnico';
import { api } from '../../utilitarios/api';
import { Icone, ModalFiltros } from '../filtros/Filtros';
import { confirmar } from '../Confirmacao';
import './desenho-no-orcamento.css';

// O editor (e o three.js da vista 3D) só carrega quando um desenho é aberto.
const EditorTecnico = dynamic(() => import('../desenhos/EditorTecnico'), { ssr: false, loading: () => <p className="orc-desenho-carregando">Abrindo o desenho técnico…</p> });

export type DesenhoDoCliente = { id: string; nome: string; atualizadoEm: string; pecas: number; usadoEm: { quoteId: string; number: string }[] };
export type DesenhoUsado = Parameters<DesenhoNoOrcamento['aoUsar']>[0];

/**
 * Desenho técnico dentro do Novo orçamento. Em destaque, o desenho do projeto aberto: criado já com
 * as peças do Orçamento Rápido e ligado ao projeto (ou, se já existe, aberto). Abaixo, os outros
 * rascunhos do cliente e um desenho em branco; "Usar no orçamento" leva as peças e o valor para o
 * projeto do resumo. Sem cliente, pede para escolher um ou abrir um orçamento sem cadastro.
 */
export function DesenhoTecnicoNoOrcamento({ cliente, desenhosNoOrcamento, podeRevisar, aoEscolherCliente, aoSemCadastro, aoUsar, antesDeAbrir, projetoAtual, aoCriarDoProjeto, aoExcluir }: {
  cliente: { id: string; name: string } | null;
  /** Desenhos já usados em projetos deste orçamento (designId). */
  desenhosNoOrcamento: string[];
  podeRevisar: boolean;
  aoEscolherCliente: () => void;
  aoSemCadastro: () => void;
  aoUsar: (desenho: DesenhoUsado) => void;
  /** Antes de abrir: o desenho de um projeto deste orçamento recebe o que mudou no Orçamento Rápido. */
  antesDeAbrir?: (designId: string) => Promise<void>;
  /** Projeto aberto no orçamento: peças já medidas e o desenho dele, se já tiver. */
  projetoAtual?: { nome: string; pecas: number; designId?: string } | null;
  /** Cria o desenho do projeto aberto, já com as peças dele, e devolve o id. */
  aoCriarDoProjeto?: () => Promise<string>;
  /** Desenho excluído: os projetos deste orçamento ligados a ele ficam sem desenho técnico. */
  aoExcluir?: (designId: string) => void;
}) {
  const [janela, setJanela] = useState(false);
  const [desenhos, setDesenhos] = useState<DesenhoDoCliente[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const clienteId = cliente?.id;

  const carregar = useCallback(async () => {
    if (!clienteId) { setDesenhos(null); return; }
    try { setDesenhos((await api<{ designs: DesenhoDoCliente[] }>(`/customers/${clienteId}/designs`)).designs); }
    catch (causa) { setDesenhos([]); setErro(causa instanceof Error ? causa.message : 'Não foi possível carregar os desenhos do cliente.'); }
  }, [clienteId]);
  useEffect(() => { setErro(''); void carregar(); }, [carregar]);
  // Editor em tela cheia: a página de baixo não rola junto.
  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [aberto]);

  const [preparando, setPreparando] = useState<string | null>(null);
  const abrir = async (id: string) => {
    if (preparando) return;
    setErro(''); setPreparando(id);
    try { await antesDeAbrir?.(id); } finally { setPreparando(null); }
    setJanela(false); setAberto(id);
  };
  const criar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!clienteId || criando) return;
    setCriando(true); setErro('');
    try {
      const criado = await api<{ designId: string }>(`/customers/${clienteId}/designs`, { method: 'POST', body: JSON.stringify({ name: nome.trim() || undefined }) });
      setNome('');
      void abrir(criado.designId);
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível começar o desenho.'); }
    finally { setCriando(false); }
  };
  const criarDoProjeto = async () => {
    if (!aoCriarDoProjeto || criando) return;
    setCriando(true); setErro('');
    try { const id = await aoCriarDoProjeto(); setJanela(false); setAberto(id); }
    catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível criar o desenho do projeto.'); }
    finally { setCriando(false); }
  };
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const excluir = async (desenho: DesenhoDoCliente) => {
    if (excluindo) return;
    const neste = desenhosNoOrcamento.includes(desenho.id);
    const outros = desenho.usadoEm.map((uso) => uso.number);
    const efeitos = [
      neste ? 'O projeto deste orçamento que usa este desenho fica sem desenho técnico; as peças do Orçamento Rápido continuam.' : '',
      outros.length ? `Ele também está ligado a ${outros.join(', ')}: esses projetos ficam sem desenho técnico.` : '',
    ].filter(Boolean).join(' ');
    if (!await confirmar({ titulo: `Excluir o desenho “${desenho.nome}”?`, mensagem: `O desenho e as versões dele serão apagados. Esta ação não pode ser desfeita.${efeitos ? `\n\n${efeitos}` : ''}`, confirmar: 'Excluir desenho', perigo: true })) return;
    setExcluindo(desenho.id); setErro('');
    try {
      await api(`/designs/${desenho.id}`, { method: 'DELETE' });
      aoExcluir?.(desenho.id);
      setDesenhos((atual) => atual?.filter((entrada) => entrada.id !== desenho.id) ?? atual);
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível excluir o desenho.'); }
    finally { setExcluindo(null); }
  };
  const fechar = () => { setAberto(null); void carregar(); };
  const rascunhos = desenhos?.length ?? 0;
  const situacao = (desenho: DesenhoDoCliente) => desenhosNoOrcamento.includes(desenho.id) ? 'Neste orçamento'
    : desenho.usadoEm.length ? `Usado em ${desenho.usadoEm.map((uso) => uso.number).join(', ')}` : 'Rascunho';

  return <>
    <button type="button" className="botao-contorno orc-desenho-botao" onClick={() => { setErro(''); setJanela(true); void carregar(); }}>
      <Icone nome="esquadro" tamanho={16} />Desenho técnico{rascunhos > 0 && <b aria-label={`${rascunhos} ${rascunhos === 1 ? 'desenho' : 'desenhos'} deste cliente`}>{rascunhos}</b>}
    </button>
    <ModalFiltros aberto={janela} aoFechar={() => setJanela(false)} titulo={cliente ? `Desenho técnico · ${cliente.name}` : 'Desenho técnico'} rotuloFechar="Fechar" className="orc-desenho-janela"
      rodape={<button type="button" className="botao-contorno" onClick={() => setJanela(false)}>Fechar</button>}>
      {!cliente ? <div className="orc-desenho-sem-cliente">
        <p>O desenho é salvo como rascunho do cliente. Selecione primeiro o cliente deste orçamento.</p>
        <div className="orc-desenho-acoes">
          <button type="button" className="botao-destaque" onClick={() => { setJanela(false); aoEscolherCliente(); }}><Icone nome="pessoa" tamanho={16} />Escolher cliente</button>
          <button type="button" className="botao-contorno" onClick={() => { setJanela(false); aoSemCadastro(); }}><Icone nome="raio" tamanho={16} />Orçamento sem cadastro</button>
        </div>
      </div> : <>
        {projetoAtual && <section className="orc-desenho-projeto" aria-label="Desenho técnico deste projeto">
          <Icone nome="esquadro" tamanho={20} />
          <div><strong>{projetoAtual.nome}</strong><small>{projetoAtual.designId ? 'Este projeto já tem desenho técnico. Ao abrir, ele recebe o que mudou no Orçamento Rápido.'
            : projetoAtual.pecas ? `O desenho começa com ${projetoAtual.pecas === 1 ? 'a peça' : `as ${projetoAtual.pecas} peças`} do Orçamento Rápido e fica ligado a este projeto.` : 'O desenho fica ligado a este projeto; as peças que você medir no Orçamento Rápido entram nele.'}</small></div>
          {projetoAtual.designId
            ? <button type="button" className="botao-destaque" disabled={!!preparando} onClick={() => void abrir(projetoAtual.designId!)}>{preparando === projetoAtual.designId ? 'Abrindo…' : 'Abrir desenho do projeto'}</button>
            : <button type="button" className="botao-destaque" disabled={criando} onClick={() => void criarDoProjeto()}><Icone nome="mais" tamanho={16} />{criando ? 'Criando…' : 'Criar desenho do projeto'}</button>}
        </section>}
        <p className="orc-desenho-ajuda">Cada desenho fica salvo como rascunho de {cliente.name}. As mudanças feitas no desenho só entram no resumo do orçamento quando você clica em <strong>Usar no orçamento</strong>.</p>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        {desenhos === null ? <p className="orc-desenho-ajuda">Carregando…</p> : desenhos.length > 0 && <ul className="orc-desenho-lista" aria-label="Desenhos do cliente">
          {desenhos.map((desenho) => <li key={desenho.id}>
            <div><strong>{desenho.nome}</strong><small>{desenho.pecas} {desenho.pecas === 1 ? 'peça' : 'peças'} · atualizado em {new Date(desenho.atualizadoEm).toLocaleDateString('pt-BR')} · <span className={desenhosNoOrcamento.includes(desenho.id) ? 'no-orcamento' : undefined}>{situacao(desenho)}</span></small></div>
            <div className="orc-desenho-item-acoes">
              <button type="button" className="botao-contorno" disabled={!!preparando || !!excluindo} onClick={() => void abrir(desenho.id)}>{preparando === desenho.id ? 'Abrindo…' : 'Abrir'}</button>
              <button type="button" className="orc-desenho-excluir" aria-label={`Excluir o desenho ${desenho.nome}`} title="Excluir desenho" disabled={!!preparando || !!excluindo} onClick={() => void excluir(desenho)}>{excluindo === desenho.id ? '…' : '×'}</button>
            </div>
          </li>)}
        </ul>}
        <form className="orc-desenho-novo" onSubmit={(evento) => void criar(evento)}>
          <label>Desenho em branco, sem ligar a um projeto<input value={nome} maxLength={120} placeholder="Ex.: Cozinha, Banheiro social" onChange={(evento) => setNome(evento.target.value)} /></label>
          <button type="submit" className="botao-destaque" disabled={criando}><Icone nome="mais" tamanho={16} />{criando ? 'Criando…' : 'Começar em branco'}</button>
        </form>
      </>}
    </ModalFiltros>
    {aberto && <div className="orc-desenho-tela" role="dialog" aria-modal="true" aria-label="Desenho técnico do orçamento">
      <EditorTecnico designId={aberto} noOrcamento={{ podeRevisar, aoVoltar: fechar, aoUsar: (desenho) => { aoUsar(desenho); fechar(); } }} />
    </div>}
  </>;
}
