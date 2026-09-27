'use client';

import { Fragment, Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { temPermissao, podeEditarOrcamento, DEADLINE_LABELS, prazoEfetivo, WORK_STATUS_LABELS, type QuoteProgress, type WorkStatus, type CustomerDeadlineStatus } from '@inova/domain';
import { SeloPrazo, SeloTrabalho, StatusLegend } from '../../componentes/QuoteStatus';
import { DesenhosSalvos } from '../../componentes/orcamento/SavedDrawings';
import { useSession } from '../../componentes/ApplicationShell';
import { api } from '../../utilitarios/api';
import { AbasFiltro, CampoFiltro, Icone, MenuSelecao, ModalFiltros, useCelular, type NomeIcone } from '../../componentes/filtros/Filtros';
import { intervaloDoPeriodo, OPCOES_PERIODO, periodoSelecionado, type OpcaoPeriodo } from '../../utilitarios/periodos';

type Quote = QuoteProgress & {
  id: string; number: string; netTotal: number; createdAt: string;
  customer: { name: string; phone: string }; items?: { projectName?: string | null }[]; createdBy?: { id: string; name: string };
  workerAssignments?: { id: string; releasedAt?: string | null; colorSnapshot: string; worker: { id: string; name: string; workColor: string } }[];
};
type QuotePage = { data: Quote[]; meta: { pages: number; total: number }; counts?: Record<string, number> };
type Worker = { id: string; name: string; workColor: string };
import { formatarMoeda } from '../../utilitarios/formatadores';
const date = (value: string | Date) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
/**
 * Abas de situação: só as que fazem sentido em cada tela. "Aguardando entrega /
 * montagem" junta as duas pendências; o Histórico mostra só os encerrados.
 */
type AbaStatus = 'TODOS' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_PRODUCTION' | 'PENDING_WORK' | 'REWORK' | 'READY' | 'AGUARDANDO_ENTREGA' | 'DELIVERED' | 'REJECTED';
const ABAS_STATUS: Record<Exclude<AbaStatus, 'TODOS'>, { rotulo: string; icone: NomeIcone; situacoes: WorkStatus[] }> = {
  PENDING_APPROVAL: { rotulo: WORK_STATUS_LABELS.PENDING_APPROVAL, icone: 'aguardando', situacoes: ['PENDING_APPROVAL'] },
  APPROVED: { rotulo: WORK_STATUS_LABELS.APPROVED, icone: 'aprovado', situacoes: ['APPROVED'] },
  IN_PRODUCTION: { rotulo: WORK_STATUS_LABELS.IN_PRODUCTION, icone: 'andamento', situacoes: ['IN_PRODUCTION'] },
  PENDING_WORK: { rotulo: WORK_STATUS_LABELS.PENDING_WORK, icone: 'pendente', situacoes: ['PENDING_WORK'] },
  REWORK: { rotulo: WORK_STATUS_LABELS.REWORK, icone: 'retrabalho', situacoes: ['REWORK'] },
  READY: { rotulo: WORK_STATUS_LABELS.READY, icone: 'pronto', situacoes: ['READY'] },
  AGUARDANDO_ENTREGA: { rotulo: 'Aguardando entrega / montagem', icone: 'entregue', situacoes: ['DELIVERY_PENDING', 'INSTALLATION_PENDING'] },
  DELIVERED: { rotulo: WORK_STATUS_LABELS.DELIVERED, icone: 'entregue', situacoes: ['DELIVERED'] },
  REJECTED: { rotulo: WORK_STATUS_LABELS.REJECTED, icone: 'recusado', situacoes: ['REJECTED'] },
};
const GRUPOS_ORCAMENTOS: { titulo: string; abas: AbaStatus[] }[] = [
  { titulo: 'Comercial', abas: ['TODOS', 'PENDING_APPROVAL', 'APPROVED'] },
  { titulo: 'Produção', abas: ['IN_PRODUCTION', 'PENDING_WORK', 'REWORK'] },
  { titulo: 'Finalização', abas: ['READY', 'AGUARDANDO_ENTREGA'] },
];
const GRUPOS_HISTORICO: { titulo: string; abas: AbaStatus[] }[] = [{ titulo: 'Situação', abas: ['TODOS', 'DELIVERED', 'REJECTED'] }];
type Ordem = 'recentes' | 'antigos' | 'prazo' | 'maior-valor' | 'cliente';
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'recentes', rotulo: 'Mais recentes' }, { valor: 'antigos', rotulo: 'Mais antigos' }, { valor: 'prazo', rotulo: 'Prazo mais próximo' },
  { valor: 'maior-valor', rotulo: 'Maior valor' }, { valor: 'cliente', rotulo: 'Cliente (A–Z)' },
];

export default function QuotesPage() { return <Suspense fallback={<main className="list-page">Carregando orçamentos…</main>}><QuotesList /></Suspense>; }
function QuotesList() {
  const user = useSession();
  const canManage = !!user && temPermissao(user.role, 'administration');
  const canTeam = !!user && temPermissao(user.role, 'team');
  const params = useSearchParams();
  const [sellerId, setSellerId] = useState(params.get('sellerId') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  // Sem campo "Exibir": só o link do Dashboard (?scope=all) mostra todos, inclusive encerrados.
  const [allQuotes] = useState(params.get('scope') === 'all');
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (canManage) api<typeof sellers>('/users').then(setSellers).catch(() => setSellers([])); }, [canManage]);
  const isHistory = usePathname() === '/historico';
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [abaStatus, setAbaStatus] = useState<AbaStatus>('TODOS');
  const [situacaoPrazoInterno, setDeadlineStatus] = useState<CustomerDeadlineStatus | ''>('');
  const [responsibleId, setResponsibleId] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const [abertos, setAbertos] = useState<string[]>([]);
  const alternar = (id: string) => setAbertos((atual) => atual.includes(id) ? atual.filter((aberto) => aberto !== id) : [...atual, id]);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const celular = useCelular();
  const activeFilterCount = [search, abaStatus !== 'TODOS', situacaoPrazoInterno, responsibleId, sellerId, from, to].filter(Boolean).length;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const query = new URLSearchParams({ search, page: String(page), ...(allQuotes ? {} : { scope: isHistory ? 'history' : 'active' }) });
      if (sellerId && canManage) query.set('sellerId', sellerId);
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      if (abaStatus !== 'TODOS') query.set('workStatus', ABAS_STATUS[abaStatus].situacoes.join(','));
      if (situacaoPrazoInterno) query.set('situacaoPrazoInterno', situacaoPrazoInterno);
      if (responsibleId) query.set('responsibleId', responsibleId);
      if (ordem !== 'recentes') query.set('ordem', ordem);
      api<QuotePage>(`/quotes?${query}`, { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) { setQuotes(result.data); setPages(result.meta.pages); setTotal(result.meta.total); setCounts(result.counts ?? {}); }
      }).catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os orçamentos.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, page, isHistory, attempt, abaStatus, situacaoPrazoInterno, responsibleId, sellerId, from, to, allQuotes, canManage, ordem]);
  useEffect(() => { if (canTeam) api<Worker[]>('/workers?active=true').then(setWorkers).catch(() => setWorkers([])); }, [canTeam]);
  const chooseDeadline = (value: CustomerDeadlineStatus | '') => { setDeadlineStatus(value); setPage(1); };
  // Abas exclusivas; clicar de novo na marcada volta para "Todos".
  const escolherAba = (aba: AbaStatus) => { setAbaStatus(aba === abaStatus ? 'TODOS' : aba); setPage(1); };
  const rotuloAba = abaStatus === 'TODOS' ? 'Todos' : ABAS_STATUS[abaStatus].rotulo;
  const totalAba = (aba: AbaStatus) => aba === 'TODOS' ? counts.ALL ?? 0 : ABAS_STATUS[aba].situacoes.reduce((soma, situacao) => soma + (counts[situacao] ?? 0), 0);
  const clearFilters = () => { setSearch(''); setAbaStatus('TODOS'); chooseDeadline(''); setResponsibleId(''); setSellerId(''); setFrom(''); setTo(''); };

  // Período: atalhos preenchem as datas de emissão; "Personalizado" abre a janela de datas.
  const periodo = periodoSelecionado(from, to);
  const [periodoAberto, setPeriodoAberto] = useState(false);
  const [rascunhoPeriodo, setRascunhoPeriodo] = useState({ from: '', to: '' });
  const periodoInvalido = Boolean(rascunhoPeriodo.from && rascunhoPeriodo.to && rascunhoPeriodo.to < rascunhoPeriodo.from);
  const escolherPeriodo = (opcao: OpcaoPeriodo) => {
    if (opcao === 'PERSONALIZADO') { setRascunhoPeriodo({ from, to }); setPeriodoAberto(true); return; }
    const intervalo = opcao === 'TODOS' ? { from: '', to: '' } : intervaloDoPeriodo(opcao);
    setFrom(intervalo.from); setTo(intervalo.to); setPage(1);
  };
  const aplicarPeriodo = () => { setFrom(rascunhoPeriodo.from); setTo(rascunhoPeriodo.to); setPage(1); setPeriodoAberto(false); };
  // Personalizado mostra as próprias datas (dd/mm); os atalhos mostram o nome.
  const diaMes = (data: string) => data ? `${data.slice(8, 10)}/${data.slice(5, 7)}` : '…';
  const rotuloPeriodo = periodo === 'PERSONALIZADO' ? `${diaMes(from)} – ${diaMes(to)}` : OPCOES_PERIODO.find((opcao) => opcao.valor === periodo)!.rotulo;
  const seletorPeriodo = <select aria-label="Período de emissão" value={periodo} onChange={(event) => escolherPeriodo(event.target.value as OpcaoPeriodo)}>{OPCOES_PERIODO.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}</select>;
  // Cadastro sem nome (incompleto) não aparece no filtro.
  const comNome = workers.filter((worker) => worker.name?.trim());
  const seletorFuncionario = <select aria-label="Funcionário" value={responsibleId} onChange={(event) => { setResponsibleId(event.target.value); setPage(1); }}><option value="">Todos os funcionários</option>{comNome.map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select>;
  // No computador, Prazo e Vendedor usam o mesmo menu de Período e Funcionário; na janela do celular, o seletor do aparelho.
  const menusExtras = <>
    <MenuSelecao rotulo="Prazo" icone="prazo" valor={situacaoPrazoInterno} opcoes={[{ valor: '', rotulo: 'Todos os prazos' }, ...(Object.entries(DEADLINE_LABELS) as [CustomerDeadlineStatus, string][]).map(([valor, rotulo]) => ({ valor, rotulo }))]} aoEscolher={chooseDeadline} />
    {canManage && <MenuSelecao rotulo="Vendedor" icone="vendedor" valor={sellerId} opcoes={[{ valor: '', rotulo: 'Todos os responsáveis' }, ...sellers.map((seller) => ({ valor: seller.id, rotulo: seller.name }))]} aoEscolher={(valor) => { setSellerId(valor); setPage(1); }} />}
  </>;
  const camposExtras = <>
    <CampoFiltro rotulo="Prazo" icone="prazo"><select value={situacaoPrazoInterno} onChange={(event) => chooseDeadline(event.target.value as CustomerDeadlineStatus | '')}><option value="">Todos os prazos</option>{Object.entries(DEADLINE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></CampoFiltro>
    {canManage && <CampoFiltro rotulo="Vendedor" icone="vendedor"><select value={sellerId} onChange={event => { setSellerId(event.target.value); setPage(1); }}><option value="">Todos os responsáveis</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></CampoFiltro>}
  </>;
  const abasSituacao = <AbasFiltro variante="grade" rotulo="Filtrar por situação" valor={abaStatus} aoEscolher={escolherAba} grupos={(isHistory ? GRUPOS_HISTORICO : GRUPOS_ORCAMENTOS).map((grupo) => ({
    titulo: grupo.titulo,
    opcoes: grupo.abas.map((aba) => ({ valor: aba, rotulo: aba === 'TODOS' ? 'Todos' : ABAS_STATUS[aba].rotulo, icone: aba === 'TODOS' ? 'todos' as NomeIcone : ABAS_STATUS[aba].icone, total: totalAba(aba) })),
  }))} />;
  // Contador do botão: filtros que ficam escondidos (no celular, tudo que está na janela).
  const filtrosOcultos = [abaStatus !== 'TODOS', sellerId, situacaoPrazoInterno, ...(celular ? [periodo !== 'TODOS', responsibleId] : [])].filter(Boolean).length;
  return <main className="list-page">
    <header className="cabecalho-lista">
      <div className="titulo-no-topo"><h1>{isHistory ? 'Histórico' : 'Orçamentos'}</h1><p>{isHistory ? 'Orçamentos entregues, recusados, cancelados ou expirados.' : 'Gerencie e acompanhe todos os orçamentos da sua marmoraria.'}</p></div>
      <div className="cabecalho-lista-acoes">
        <Link className="botao-contorno botao-contorno-destaque" href="/"><Icone nome="mais" />Novo Projeto</Link>
        <Link className="botao-contorno" href={isHistory ? '/orcamentos' : '/historico'}><Icone nome={isHistory ? 'documento' : 'historico'} />{isHistory ? 'Orçamentos' : 'Histórico'}</Link>
      </div>
    </header>
    <form className="barra-filtros" role="search" aria-label="Filtros de orçamentos" onSubmit={(event) => { event.preventDefault(); setAttempt((value) => value + 1); }}>
      <label className="barra-filtros-busca"><Icone nome="buscar" tamanho={20} /><input type="search" aria-label="Buscar orçamentos" placeholder="Cliente, telefone ou nº do orçamento" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      {!celular && <>
        <i className="barra-filtros-separador" aria-hidden="true" />
        <MenuSelecao rotulo="Período" icone="calendario" valor={periodo} rotuloValor={rotuloPeriodo} opcoes={OPCOES_PERIODO} aoEscolher={escolherPeriodo} />
        {canTeam && <MenuSelecao rotulo="Funcionário" icone="equipe" valor={responsibleId} opcoes={[{ valor: '', rotulo: 'Todos os funcionários' }, ...comNome.map((worker) => ({ valor: worker.id, rotulo: worker.name, cor: worker.workColor }))]} aoEscolher={(valor) => { setResponsibleId(valor); setPage(1); }} />}
      </>}
      <button type="button" className="botao-contorno" aria-expanded={maisFiltros} onClick={() => setMaisFiltros((aberto) => !aberto)}><Icone nome="filtro" />{celular ? 'Filtros' : 'Mais filtros'}{filtrosOcultos ? <b>{filtrosOcultos}</b> : null}</button>
      <i className="barra-filtros-separador" aria-hidden="true" />
      <button type="button" className="botao-contorno" disabled={!activeFilterCount} onClick={clearFilters}><Icone nome="limpar" />Limpar</button>
      <button type="submit" className="botao-destaque" disabled={loading}><Icone nome="buscar" />Buscar</button>
      {!celular && maisFiltros && <div className="barra-filtros-mais">{abasSituacao}<div className="barra-filtros-mais-campos">{menusExtras}</div></div>}
    </form>
    {celular && <ModalFiltros aberto={maisFiltros} aoFechar={() => setMaisFiltros(false)} titulo="Filtros de orçamentos"
      rodape={<><button type="button" className="botao-contorno" disabled={!activeFilterCount} onClick={clearFilters}><Icone nome="limpar" />Limpar</button><button type="button" className="botao-destaque" onClick={() => setMaisFiltros(false)}>Ver resultados</button></>}>
      {abasSituacao}
      <CampoFiltro rotulo="Período" icone="calendario">{seletorPeriodo}</CampoFiltro>
      {periodo === 'PERSONALIZADO' && <button type="button" className="text-button" onClick={() => escolherPeriodo('PERSONALIZADO')}>Alterar datas ({rotuloPeriodo})</button>}
      {canTeam && <CampoFiltro rotulo="Funcionário" icone="equipe">{seletorFuncionario}</CampoFiltro>}
      {camposExtras}
    </ModalFiltros>}
    <ModalFiltros aberto={periodoAberto} aoFechar={() => setPeriodoAberto(false)} titulo="Período personalizado"
      rodape={<><button type="button" className="botao-contorno" onClick={() => setPeriodoAberto(false)}>Cancelar</button><button type="button" className="botao-destaque" disabled={(!rascunhoPeriodo.from && !rascunhoPeriodo.to) || periodoInvalido} onClick={aplicarPeriodo}>Aplicar</button></>}>
      <CampoFiltro rotulo="Data inicial" icone="calendario"><input type="date" value={rascunhoPeriodo.from} max={rascunhoPeriodo.to || undefined} onChange={(event) => setRascunhoPeriodo((atual) => ({ ...atual, from: event.target.value }))} /></CampoFiltro>
      <CampoFiltro rotulo="Data final" icone="calendario"><input type="date" value={rascunhoPeriodo.to} min={rascunhoPeriodo.from || undefined} onChange={(event) => setRascunhoPeriodo((atual) => ({ ...atual, to: event.target.value }))} /></CampoFiltro>
      {periodoInvalido && <p role="alert" className="form-error">A data final deve ser igual ou posterior à inicial.</p>}
    </ModalFiltros>
    <div className="lista-resumo"><div className="lista-resumo-filtros"><strong>{total} {isHistory ? (total === 1 ? 'registro' : 'registros') : (total === 1 ? 'orçamento' : 'orçamentos')}</strong>{abaStatus !== 'TODOS' && !(maisFiltros && !celular) && <button type="button" className="etiqueta-filtro" aria-label={`Remover filtro ${rotuloAba}`} onClick={() => escolherAba(abaStatus)}>{rotuloAba}<Icone nome="fechar" tamanho={14} /></button>}</div><div className="lista-resumo-ordem"><span>Ordenar:</span><MenuSelecao variante="linha" rotulo="Ordenar" icone="ordenar" valor={ordem} opcoes={ORDENS} aoEscolher={(valor) => { setOrdem(valor); setPage(1); }} /></div></div>
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p>}
    {loading && <p role="status" className="customer-help">Carregando registros…</p>}
    <div className="tabela-orcamentos" aria-busy={loading}>
      <table>
        <thead><tr><th>Nº orçamento</th><th>Cliente</th><th>Emissão</th><th>Funcionário</th><th>Vendedor</th><th>Prazo</th><th>Status</th><th className="valor">Valor</th><th><span className="sr-only">Projetos</span></th></tr></thead>
        <tbody>{quotes.map((quote) => {
          const worker = quote.workerAssignments?.find((assignment) => !assignment.releasedAt);
          const prazo = prazoEfetivo(quote);
          const projetos = quote.items?.map((item) => item.projectName).filter(Boolean) ?? [];
          const aberto = abertos.includes(quote.id);
          return <Fragment key={quote.id}>
            {/* Clicar na linha (fora de links e botões) abre os projetos do orçamento. */}
            <tr className={`linha-orcamento${aberto ? ' aberta' : ''}`} onClick={(event) => { if (!(event.target as HTMLElement).closest('a, button')) alternar(quote.id); }}>
              <td className="col-numero" data-rotulo="Nº orçamento"><Link href={`/orcamentos/${quote.id}`}>{quote.number}</Link></td>
              <td className="col-cliente" data-rotulo="Cliente"><span className="celula-cliente"><strong>{quote.customer.name}</strong>{projetos.length > 0 && <small title={projetos.join(' · ')}>{projetos.join(' · ')}</small>}</span></td>
              <td className="col-emissao" data-rotulo="Emissão">{date(quote.createdAt)}</td>
              <td className="col-funcionario" data-rotulo="Funcionário">{worker ? <span className="quote-worker"><i style={{ backgroundColor: worker.worker.workColor }} />{worker.worker.name}</span> : <span className="celula-vazia">—</span>}</td>
              <td className="col-vendedor" data-rotulo="Vendedor">{quote.createdBy?.name ?? <span className="celula-vazia">—</span>}</td>
              <td className="col-prazo" data-rotulo="Prazo"><span className="celula-prazo">{prazo ? date(prazo) : <span className="prazo-vazio">Sem prazo</span>}<SeloPrazo quote={quote} /></span></td>
              <td className="col-situacao" data-rotulo="Status"><SeloTrabalho quote={quote} /></td>
              <td data-rotulo="Valor" className="valor">{formatarMoeda(quote.netTotal)}</td>
              <td className="acao"><button type="button" className="botao-expandir" aria-expanded={aberto} aria-controls={`projetos-${quote.id}`} aria-label={`${aberto ? 'Esconder' : 'Ver'} projetos de ${quote.number}`} onClick={() => alternar(quote.id)}><Icone nome="seta" /></button></td>
            </tr>
            {aberto && <tr className="linha-projetos" id={`projetos-${quote.id}`}><td colSpan={9}>
              <DesenhosSalvos quoteId={quote.id} />
              <div className="detail-actions"><Link className="secondary-button" href={`/orcamentos/${quote.id}`}>Ver detalhes</Link>{podeEditarOrcamento(quote) && <Link className="secondary-button" href={`/orcamentos/${quote.id}/editar`}>Editar orçamento</Link>}<Link className="text-button" href={`/?parent=${quote.id}`}>+ Vincular complemento</Link></div>
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    {!loading && !error && !quotes.length && <p className="empty">Nenhum registro encontrado.</p>}
    {quotes.length > 0 && <StatusLegend />}
    {pages > 1 && <nav className="pagination" aria-label="Páginas de orçamentos">
      <button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button className="secondary-button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button>
    </nav>}
  </main>;
}
