'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DesenhoNoOrcamento } from '../desenhos/EditorTecnico';
import { api } from '../../utilitarios/api';
import { Icone, ModalFiltros } from '../filtros/Filtros';
import './desenho-no-orcamento.css';

// O editor (e o three.js da vista 3D) só carrega quando um desenho é aberto.
const EditorTecnico = dynamic(() => import('../desenhos/EditorTecnico'), { ssr: false, loading: () => <p className="orc-desenho-carregando">Abrindo o desenho técnico…</p> });

export type DesenhoDoCliente = { id: string; nome: string; atualizadoEm: string; pecas: number; usadoEm: { quoteId: string; number: string }[] };
export type DesenhoUsado = Parameters<DesenhoNoOrcamento['aoUsar']>[0];

/**
 * Desenho técnico dentro do Novo orçamento. Cada desenho é um rascunho do
 * cliente (fica salvo mesmo sem ir para o orçamento); "Usar no orçamento"
 * leva as peças e o valor para o projeto do resumo. Sem cliente, pede para
 * escolher um ou abrir um orçamento sem cadastro.
 */
export function DesenhoTecnicoNoOrcamento({ cliente, desenhosNoOrcamento, podeRevisar, aoEscolherCliente, aoSemCadastro, aoUsar }: {
  cliente: { id: string; name: string } | null;
  /** Desenhos já usados em projetos deste orçamento (designId). */
  desenhosNoOrcamento: string[];
  podeRevisar: boolean;
  aoEscolherCliente: () => void;
  aoSemCadastro: () => void;
  aoUsar: (desenho: DesenhoUsado) => void;
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

  const abrir = (id: string) => { setJanela(false); setErro(''); setAberto(id); };
  const criar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!clienteId || criando) return;
    setCriando(true); setErro('');
    try {
      const criado = await api<{ designId: string }>(`/customers/${clienteId}/designs`, { method: 'POST', body: JSON.stringify({ name: nome.trim() || undefined }) });
      setNome('');
      abrir(criado.designId);
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível começar o desenho.'); }
    finally { setCriando(false); }
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
        <p>O desenho fica salvo como rascunho do cliente. Escolha o cliente deste orçamento primeiro.</p>
        <div className="orc-desenho-acoes">
          <button type="button" className="botao-destaque" onClick={() => { setJanela(false); aoEscolherCliente(); }}><Icone nome="pessoa" tamanho={16} />Escolher cliente</button>
          <button type="button" className="botao-contorno" onClick={() => { setJanela(false); aoSemCadastro(); }}><Icone nome="raio" tamanho={16} />Orçamento sem cadastro</button>
        </div>
      </div> : <>
        <p className="orc-desenho-ajuda">Cada desenho fica salvo como rascunho de {cliente.name}. As peças e o valor só entram no resumo do orçamento quando você clica em <strong>Usar no orçamento</strong>.</p>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        {desenhos === null ? <p className="orc-desenho-ajuda">Carregando…</p> : desenhos.length > 0 && <ul className="orc-desenho-lista" aria-label="Desenhos do cliente">
          {desenhos.map((desenho) => <li key={desenho.id}>
            <div><strong>{desenho.nome}</strong><small>{desenho.pecas} {desenho.pecas === 1 ? 'peça' : 'peças'} · atualizado em {new Date(desenho.atualizadoEm).toLocaleDateString('pt-BR')} · <span className={desenhosNoOrcamento.includes(desenho.id) ? 'no-orcamento' : undefined}>{situacao(desenho)}</span></small></div>
            <button type="button" className="botao-contorno" onClick={() => abrir(desenho.id)}>Abrir</button>
          </li>)}
        </ul>}
        <form className="orc-desenho-novo" onSubmit={(evento) => void criar(evento)}>
          <label>Novo desenho<input value={nome} maxLength={120} placeholder="Ex.: Cozinha, Banheiro social" onChange={(evento) => setNome(evento.target.value)} /></label>
          <button type="submit" className="botao-destaque" disabled={criando}><Icone nome="mais" tamanho={16} />{criando ? 'Criando…' : 'Começar desenho'}</button>
        </form>
      </>}
    </ModalFiltros>
    {aberto && <div className="orc-desenho-tela" role="dialog" aria-modal="true" aria-label="Desenho técnico do orçamento">
      <EditorTecnico designId={aberto} noOrcamento={{ podeRevisar, aoVoltar: fechar, aoUsar: (desenho) => { aoUsar(desenho); fechar(); } }} />
    </div>}
  </>;
}
