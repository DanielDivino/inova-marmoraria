'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PROJECT_WORKFLOW_LABELS, type ProjectWorkflowStatus } from '@inova/domain';
import { QuadroProjetos } from '../../componentes/fluxo/QuadroProjetos';
import { ResumoOrcamentos } from '../../componentes/fluxo/ResumoOrcamentos';
import { api } from '../../utilitarios/api';
import { entregaFinalDoOrcamento, filtrarCartoes, moverCartaoLocal, nomeResponsavel, SEM_RESPONSAVEL, type CartaoFluxo, type CartaoMovido, type FiltroFluxo } from '../../utilitarios/fluxo';
import { AbasFiltro, CampoFiltro, Icone, MenuSelecao, ModalFiltros, useCelular } from '../../componentes/filtros/Filtros';
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
  // O desfazer roda depois de outros movimentos: lê sempre a lista mais recente.
  const cartoesAtuais = useRef(cartoes);
  cartoesAtuais.current = cartoes;
  const [aviso, setAviso] = useState('');
  const temporizadorAviso = useRef<number | undefined>(undefined);
  const filtrosAtivos = [filtro.workerId, filtro.customerId, filtro.quoteId].filter(Boolean).length;
  const limparFiltros = () => setFiltro({ customerId: '', quoteId: '', workerId: '' });
  // Mesmo padrão de Orçamentos: menus na barra; no celular, janela de filtros.
  const celular = useCelular();
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  useEffect(() => () => window.clearTimeout(temporizadorAviso.current), []);
  /** Avisos de movimento somem sozinhos; o de entrega fica até ser fechado. */
  const avisar = (texto: string, temporario = false) => {
    window.clearTimeout(temporizadorAviso.current);
    setAviso(texto);
    if (temporario) temporizadorAviso.current = window.setTimeout(() => setAviso(''), 4000);
  };
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

  async function mover(id: string, status: ProjectWorkflowStatus, idsDestino: string[], origem?: 'menu') {
    const atuais = cartoesAtuais.current;
    const cartao = atuais?.find((entrada) => entrada.id === id);
    if (!atuais || !cartao) return;
    // Entregar o último projeto encerra o orçamento, que sai de Orçamentos para o Histórico: confirma antes.
    const entregaFinal = status === 'DELIVERED' && cartao.status !== 'DELIVERED' && entregaFinalDoOrcamento(atuais, id);
    if (entregaFinal && !window.confirm(`Com este, todos os projetos de ${cartao.quote.number} (${cartao.quote.customerName}) estarão entregues. O orçamento será marcado como entregue e vai de Orçamentos para o Histórico. Confirmar?`)) return;
    const { cartoes: atualizados, afterId, beforeId } = moverCartaoLocal(atuais, id, status, idsDestino);
    setCartoes(atualizados); setErro(''); avisar('');
    const versao = (versoes.current[id] ?? 0) + 1;
    versoes.current[id] = versao;
    try {
      const salvo = await api<CartaoMovido>(`/workflow/projects/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status, afterId, beforeId }) });
      if (salvo.quoteDelivered) {
        setCartoes((atual) => atual?.filter((entrada) => entrada.quote.id !== salvo.quote.id) ?? atual);
        avisar(`${salvo.quote.number} · ${salvo.quote.customerName} foi entregue e saiu do quadro. Ele está no Histórico; para reabrir, use "Marcar em retrabalho" no orçamento.`);
      } else {
        if (versoes.current[id] === versao) setCartoes((atual) => atual?.map((cartao) => cartao.id === id ? salvo : cartao) ?? atual);
        // Pelo menu do celular o cartão sai da etapa que está na tela: o aviso confirma para onde foi.
        if (origem === 'menu') avisar(`${cartao.name} foi para "${PROJECT_WORKFLOW_LABELS[status]}".`, true);
      }
    } catch (cause) {
      // O quadro volta ao que está salvo para não mostrar uma ordem que não foi gravada.
      setErro(cause instanceof Error ? cause.message : 'Não foi possível mover o projeto.');
      setTentativa((valor) => valor + 1);
    }
  }

  return <main className="list-page fluxo-page">
    <header className="list-header"><h1>Fluxo de trabalho</h1></header>
    <AbasFiltro rotulo="Visualização do fluxo" valor={aba} aoEscolher={setAba} grupos={[{ opcoes: [
      { valor: 'QUADRO', rotulo: 'Quadro de projetos', icone: 'camadas', total: visiveis.length },
      { valor: 'RESUMO', rotulo: 'Resumo por orçamento', icone: 'documento', total: new Set(visiveis.map((cartao) => cartao.quote.id)).size },
    ] }]} />
    <form className="barra-filtros" aria-label="Filtros do fluxo" onSubmit={(event) => event.preventDefault()}>
      {celular
        ? <button type="button" className="botao-contorno" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(true)}><Icone nome="filtro" />Filtros{filtrosAtivos ? <b>{filtrosAtivos}</b> : null}</button>
        : <>
          <MenuSelecao rotulo="Funcionário" icone="equipe" valor={filtro.workerId} aoEscolher={(valor) => setFiltro((atual) => ({ ...atual, workerId: valor, quoteId: '' }))}
            opcoes={[{ valor: '', rotulo: 'Todos os funcionários' }, ...funcionarios.map((funcionario) => ({ valor: funcionario.id, rotulo: nomeResponsavel(funcionario), cor: funcionario.color })), ...(temSemResponsavel ? [{ valor: SEM_RESPONSAVEL, rotulo: 'Sem responsável' }] : [])]} />
          <MenuSelecao rotulo="Cliente" icone="pessoa" valor={filtro.customerId} aoEscolher={(valor) => setFiltro((atual) => ({ ...atual, customerId: valor, quoteId: '' }))}
            opcoes={[{ valor: '', rotulo: 'Todos os clientes' }, ...clientes.map(([id, nome]) => ({ valor: id, rotulo: nome }))]} />
          <MenuSelecao rotulo="Orçamento" icone="documento" valor={filtro.quoteId} aoEscolher={(valor) => setFiltro((atual) => ({ ...atual, quoteId: valor }))}
            opcoes={[{ valor: '', rotulo: 'Todos os orçamentos' }, ...orcamentos.map((quote) => ({ valor: quote.id, rotulo: `${quote.number} · ${quote.customerName}` }))]} />
        </>}
      <button type="button" className="botao-contorno barra-filtros-fim" disabled={!filtrosAtivos} onClick={limparFiltros}><Icone nome="limpar" />Limpar</button>
    </form>
    {celular && <ModalFiltros aberto={filtrosAbertos} aoFechar={() => setFiltrosAbertos(false)} titulo="Filtros do fluxo"
      rodape={<><button type="button" className="botao-contorno" disabled={!filtrosAtivos} onClick={limparFiltros}><Icone nome="limpar" />Limpar</button><button type="button" className="botao-destaque" onClick={() => setFiltrosAbertos(false)}>Ver resultados</button></>}>
      <CampoFiltro rotulo="Funcionário" icone="equipe"><select value={filtro.workerId} onChange={(event) => setFiltro((atual) => ({ ...atual, workerId: event.target.value, quoteId: '' }))}><option value="">Todos os funcionários</option>{funcionarios.map((funcionario) => <option key={funcionario.id} value={funcionario.id}>{nomeResponsavel(funcionario)}</option>)}{temSemResponsavel && <option value={SEM_RESPONSAVEL}>Sem responsável</option>}</select></CampoFiltro>
      <CampoFiltro rotulo="Cliente" icone="pessoa"><select value={filtro.customerId} onChange={(event) => setFiltro((atual) => ({ ...atual, customerId: event.target.value, quoteId: '' }))}><option value="">Todos os clientes</option>{clientes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></CampoFiltro>
      <CampoFiltro rotulo="Orçamento" icone="documento"><select value={filtro.quoteId} onChange={(event) => setFiltro((atual) => ({ ...atual, quoteId: event.target.value }))}><option value="">Todos os orçamentos</option>{orcamentos.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} · {quote.customerName}</option>)}</select></CampoFiltro>
    </ModalFiltros>}
    <p className="fluxo-legenda"><span className="legenda-vencido">Prazo vencido</span><span className="legenda-proximo">Vence em até 7 dias</span></p>
    {aviso && <p role="status" className="fluxo-aviso">{aviso} <button type="button" className="text-button" aria-label="Fechar aviso" onClick={() => avisar('')}>✕</button></p>}
    {erro && <p role="alert" className="form-error">{erro} {!cartoes && <button type="button" className="text-button" onClick={() => { setErro(''); setTentativa((valor) => valor + 1); }}>Tentar novamente</button>}</p>}
    {!cartoes ? !erro && <p className="empty">Carregando projetos…</p>
      : aba === 'QUADRO' ? <QuadroProjetos cartoes={visiveis} onMover={mover} /> : <ResumoOrcamentos cartoes={visiveis} />}
  </main>;
}
