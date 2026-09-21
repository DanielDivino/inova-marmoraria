'use client';

import { Fragment, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { podeEditarOrcamento, DEADLINE_LABELS, obterStatusPrazo, WORK_STATUS_LABELS, WORK_STATUSES, type QuoteProgress, type WorkStatus, type CustomerDeadlineStatus } from '@inova/domain';
import { StatusOrcamento, StatusLegend } from '../../componentes/QuoteStatus';
import { DesenhosSalvos } from '../../componentes/orcamento/SavedDrawings';
import { api } from '../../utilitarios/api';

type Quote = QuoteProgress & {
  id: string; number: string; netTotal: number; createdAt: string;
  customer: { name: string; phone: string }; items?: { projectName?: string | null }[];
  workerAssignments?: { id: string; releasedAt?: string | null; colorSnapshot: string; worker: { id: string; name: string; workColor: string } }[];
};
type QuotePage = { data: Quote[]; meta: { pages: number; total: number }; counts?: Record<string, number> };
type Worker = { id: string; name: string; workColor: string };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | Date) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export default function QuotesPage() {
  const isHistory = usePathname() === '/historico';
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [workStatus, setWorkStatus] = useState<WorkStatus | ''>('');
  const [situacaoPrazoInterno, setDeadlineStatus] = useState<CustomerDeadlineStatus | ''>('');
  const [responsibleId, setResponsibleId] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const query = new URLSearchParams({ search, page: String(page), scope: isHistory ? 'history' : 'active' });
      if (workStatus) query.set('workStatus', workStatus);
      if (situacaoPrazoInterno) query.set('deadlineStatus', situacaoPrazoInterno);
      if (responsibleId) query.set('responsibleId', responsibleId);
      api<QuotePage>(`/quotes?${query}`, { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) { setQuotes(result.data); setPages(result.meta.pages); setCounts(result.counts ?? {}); }
      }).catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os orçamentos.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, page, isHistory, attempt, workStatus, situacaoPrazoInterno, responsibleId]);
  useEffect(() => { api<Worker[]>('/users/workers').then(setWorkers).catch(() => setWorkers([])); }, []);
  const chooseWork = (value: WorkStatus | '') => { setWorkStatus(value); setPage(1); };
  const chooseDeadline = (value: CustomerDeadlineStatus | '') => { setDeadlineStatus(value); setPage(1); };
  const clearFilters = () => { setSearch(''); chooseWork(''); chooseDeadline(''); setResponsibleId(''); };
  const statusGroups: { label: string; statuses: WorkStatus[] }[] = [
    { label: 'Comercial', statuses: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'] },
    { label: 'Produção', statuses: ['IN_PRODUCTION', 'WAITING_MATERIAL', 'PENDING_WORK', 'REWORK', 'READY'] },
    { label: 'Finalização', statuses: ['DELIVERY_PENDING', 'INSTALLATION_PENDING', 'DELIVERED'] },
  ];

  return <main className="list-page">
    <header className="list-header"><Link href="/">← Novo Projeto</Link><h1>{isHistory ? 'Histórico' : 'Orçamentos'}</h1><Link href={isHistory ? '/orcamentos' : '/historico'}>{isHistory ? 'Orçamentos' : 'Histórico'}</Link></header>
    <section className="quote-filter-panel" aria-label="Filtros de orçamentos">
      <header><div><span>FILTROS</span><strong>Acompanhe a produção</strong></div><button type="button" className="text-button" disabled={!search && !workStatus && !situacaoPrazoInterno && !responsibleId} onClick={clearFilters}>Limpar filtros</button></header>
      <input className="search" aria-label="Buscar orçamentos" placeholder="Buscar por número, cliente ou telefone" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <div className="material-filter-bar" role="group" aria-label="Filtrar por status">
        <span>Visão geral</span>
        <button type="button" aria-pressed={!workStatus && !situacaoPrazoInterno && !responsibleId} className={!workStatus && !situacaoPrazoInterno && !responsibleId ? 'selected' : ''} onClick={() => { chooseWork(''); chooseDeadline(''); setResponsibleId(''); }}>Todos <b>{counts.ALL ?? 0}</b></button>
        <button type="button" aria-pressed={situacaoPrazoInterno === 'OVERDUE'} className={situacaoPrazoInterno === 'OVERDUE' ? 'selected overdue' : 'overdue'} onClick={() => chooseDeadline(situacaoPrazoInterno === 'OVERDUE' ? '' : 'OVERDUE')}>Atrasados <b>{counts.OVERDUE ?? 0}</b></button>
        {statusGroups.map(group => <Fragment key={group.label}><i className="material-filter-separator" aria-hidden="true" /><span>{group.label}</span>{group.statuses.map(status => <button type="button" key={status} aria-pressed={workStatus === status} className={workStatus === status ? 'selected' : ''} onClick={() => chooseWork(workStatus === status ? '' : status)}>{WORK_STATUS_LABELS[status]} <b>{counts[status] ?? 0}</b></button>)}</Fragment>)}
      </div>
      <div className="quote-filter-row"><label>Funcionário<select value={responsibleId} onChange={(event) => { setResponsibleId(event.target.value); setPage(1); }}><option value="">Todos os funcionários</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label><label>Status<select value={workStatus} onChange={(event) => chooseWork(event.target.value as WorkStatus | '')}><option value="">Todos os status</option>{WORK_STATUSES.map(status => <option key={status} value={status}>{WORK_STATUS_LABELS[status]}</option>)}</select></label><label>Prazo<select value={situacaoPrazoInterno} onChange={(event) => chooseDeadline(event.target.value as CustomerDeadlineStatus | '')}><option value="">Todos os prazos</option>{Object.entries(DEADLINE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <StatusLegend />
    </section>
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p>}
    {loading && <p role="status" className="customer-help">Carregando registros…</p>}
    <div className="cards" aria-busy={loading}>{quotes.map((quote) => {
      const deadline = obterStatusPrazo(quote);
      const worker = quote.workerAssignments?.find((assignment) => !assignment.releasedAt);
      return <article className="saved-quote-card" key={quote.id}><Link className="quote-card quote-link" href={`/orcamentos/${quote.id}`}>
        <div><StatusOrcamento quote={quote} /><strong>{quote.customer.name}</strong>
          <small>{quote.number} · {date(quote.createdAt)}</small>
          {quote.items?.some((item) => item.projectName) && <small>{quote.items.map((item) => item.projectName).filter(Boolean).join(' · ')}</small>}
          {quote.validUntil && <small>Validade: {date(quote.validUntil)}</small>}
          {quote.dueDate && <small>Entrega: {date(quote.dueDate)}</small>}
          <small>Prazo: {DEADLINE_LABELS[deadline]}</small>
          {worker && <small className="quote-worker"><i style={{ backgroundColor: worker.worker.workColor }} />{worker.worker.name}</small>}
        </div><b>{money.format(quote.netTotal)}</b>
      </Link><DesenhosSalvos quoteId={quote.id} /><div className="detail-actions"><Link className="secondary-button" href={`/orcamentos/${quote.id}`}>Ver detalhes</Link>{podeEditarOrcamento(quote) && <Link className="secondary-button" href={`/orcamentos/${quote.id}/editar`}>Editar orçamento</Link>}<Link className="text-button" href={`/?parent=${quote.id}`}>+ Vincular complemento</Link></div></article>;
    })}</div>
    {!loading && !error && !quotes.length && <p className="empty">Nenhum registro encontrado.</p>}
    {pages > 1 && <nav className="pagination" aria-label="Páginas de orçamentos">
      <button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button className="secondary-button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button>
    </nav>}
  </main>;
}
