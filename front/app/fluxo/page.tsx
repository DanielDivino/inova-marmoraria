'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectWorkflowStatus } from '@inova/domain';
import { QuadroProjetos } from '../../componentes/fluxo/QuadroProjetos';
import { ResumoOrcamentos } from '../../componentes/fluxo/ResumoOrcamentos';
import { api } from '../../utilitarios/api';
import { filtrarCartoes, moverCartaoLocal, nomeResponsavel, SEM_RESPONSAVEL, type CartaoFluxo, type FiltroFluxo } from '../../utilitarios/fluxo';
import '../../componentes/fluxo/fluxo.css';

type Aba = 'QUADRO' | 'RESUMO';

export default function FluxoTrabalhoPage() {
  const [cartoes, setCartoes] = useState<CartaoFluxo[] | null>(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [aba, setAba] = useState<Aba>('QUADRO');
  const [filtro, setFiltro] = useState<FiltroFluxo>({ customerId: '', quoteId: '', workerId: '' });
  // Só a resposta do último movimento de cada cartão atualiza a tela.
  const versoes = useRef<Record<string, number>>({});
  useEffect(() => {
    const controller = new AbortController();
    api<CartaoFluxo[]>('/workflow/projects', { signal: controller.signal }).then(setCartoes)
      .catch((cause) => { if (!controller.signal.aborted) setErro(cause instanceof Error ? cause.message : 'Não foi possível carregar o fluxo de trabalho.'); });
    return () => controller.abort();
  }, [tentativa]);

  const clientes = useMemo(() => [...new Map((cartoes ?? []).map((cartao) => [cartao.quote.customerId, cartao.quote.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [cartoes]);
  // Funcionários vêm dos próprios cartões: o filtro funciona também para quem não gerencia a equipe.
  const funcionarios = useMemo(() => [...new Map((cartoes ?? []).flatMap((cartao) => cartao.quote.worker ? [[cartao.quote.worker.id, cartao.quote.worker] as const] : [])).values()].sort((a, b) => nomeResponsavel(a).localeCompare(nomeResponsavel(b), 'pt-BR')), [cartoes]);
  const temSemResponsavel = useMemo(() => (cartoes ?? []).some((cartao) => !cartao.quote.worker), [cartoes]);
  const orcamentos = useMemo(() => [...new Map(filtrarCartoes(cartoes ?? [], { ...filtro, quoteId: '' }).map((cartao) => [cartao.quote.id, cartao.quote])).values()].sort((a, b) => a.number.localeCompare(b.number)), [cartoes, filtro]);
  const visiveis = useMemo(() => filtrarCartoes(cartoes ?? [], filtro), [cartoes, filtro]);

  async function mover(id: string, status: ProjectWorkflowStatus, idsDestino: string[]) {
    if (!cartoes) return;
    const { cartoes: atualizados, afterId, beforeId } = moverCartaoLocal(cartoes, id, status, idsDestino);
    setCartoes(atualizados); setErro('');
    const versao = (versoes.current[id] ?? 0) + 1;
    versoes.current[id] = versao;
    try {
      const salvo = await api<CartaoFluxo>(`/workflow/projects/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status, afterId, beforeId }) });
      if (versoes.current[id] === versao) setCartoes((atual) => atual?.map((cartao) => cartao.id === id ? salvo : cartao) ?? atual);
    } catch (cause) {
      // O quadro volta ao que está salvo para não mostrar uma ordem que não foi gravada.
      setErro(cause instanceof Error ? cause.message : 'Não foi possível mover o projeto.');
      setTentativa((valor) => valor + 1);
    }
  }

  return <main className="list-page fluxo-page">
    <header className="list-header"><h1>Fluxo de trabalho</h1></header>
    <div className="fluxo-barra">
      <div className="admin-tabs" role="tablist" aria-label="Visualização do fluxo">
        <button type="button" role="tab" aria-selected={aba === 'QUADRO'} className={aba === 'QUADRO' ? 'selected' : undefined} onClick={() => setAba('QUADRO')}>Quadro de projetos</button>
        <button type="button" role="tab" aria-selected={aba === 'RESUMO'} className={aba === 'RESUMO' ? 'selected' : undefined} onClick={() => setAba('RESUMO')}>Resumo por orçamento</button>
      </div>
      <div className="fluxo-filtros">
        <label>Funcionário<select value={filtro.workerId} onChange={(event) => setFiltro((atual) => ({ ...atual, workerId: event.target.value, quoteId: '' }))}><option value="">Todos os funcionários</option>{funcionarios.map((funcionario) => <option key={funcionario.id} value={funcionario.id}>{nomeResponsavel(funcionario)}</option>)}{temSemResponsavel && <option value={SEM_RESPONSAVEL}>Sem responsável</option>}</select></label>
        <label>Cliente<select value={filtro.customerId} onChange={(event) => setFiltro((atual) => ({ ...atual, customerId: event.target.value, quoteId: '' }))}><option value="">Todos os clientes</option>{clientes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
        <label>Orçamento<select value={filtro.quoteId} onChange={(event) => setFiltro((atual) => ({ ...atual, quoteId: event.target.value }))}><option value="">Todos os orçamentos</option>{orcamentos.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} · {quote.customerName}</option>)}</select></label>
      </div>
    </div>
    <p className="fluxo-legenda"><span className="legenda-vencido">Prazo vencido</span><span className="legenda-proximo">Vence em até 7 dias</span></p>
    {erro && <p role="alert" className="form-error">{erro} {!cartoes && <button type="button" className="text-button" onClick={() => { setErro(''); setTentativa((valor) => valor + 1); }}>Tentar novamente</button>}</p>}
    {!cartoes ? !erro && <p className="empty">Carregando projetos…</p>
      : aba === 'QUADRO' ? <QuadroProjetos cartoes={visiveis} onMover={mover} /> : <ResumoOrcamentos cartoes={visiveis} />}
  </main>;
}
