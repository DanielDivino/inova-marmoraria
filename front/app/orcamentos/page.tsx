'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { canEditQuote, getDeadlinePresentation, isClosedQuote, type QuoteProgress } from '@inova/domain';
import { QuoteStatus, StatusLegend } from '../../components/QuoteStatus';
import { SavedDrawings } from '../../components/quote-builder/SavedDrawings';
import { api } from '../../lib/api';

type Quote = QuoteProgress & {
  id: string; number: string; netTotal: number; createdAt: string;
  customer: { name: string; phone: string }; items?: { projectName?: string | null }[];
};
type QuotePage = { data: Quote[]; meta: { pages: number; total: number } };
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

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const query = new URLSearchParams({ search, page: String(page), scope: isHistory ? 'history' : 'active' });
      api<QuotePage>(`/quotes?${query}`, { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) { setQuotes(result.data); setPages(result.meta.pages); }
      }).catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os orçamentos.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, page, isHistory, attempt]);

  return <main className="list-page">
    <header className="list-header"><Link href="/">← Novo Projeto</Link><h1>{isHistory ? 'Histórico' : 'Orçamentos'}</h1><Link href={isHistory ? '/orcamentos' : '/historico'}>{isHistory ? 'Orçamentos' : 'Histórico'}</Link></header>
    <StatusLegend />
    <input className="search" aria-label="Buscar orçamentos" placeholder="Buscar por número, cliente ou telefone" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p>}
    {loading && <p role="status" className="customer-help">Carregando registros…</p>}
    <div className="cards" aria-busy={loading}>{quotes.map((quote) => {
      const deadline = !isClosedQuote(quote) && getDeadlinePresentation(quote.status === 'APPROVED' ? quote.dueDate : quote.validUntil);
      return <article className="saved-quote-card" key={quote.id}><Link className="quote-card quote-link" href={`/orcamentos/${quote.id}`}>
        <div><QuoteStatus quote={quote} /><strong>{quote.customer.name}</strong>
          <small>{quote.number} · {date(quote.createdAt)}</small>
          {quote.items?.some((item) => item.projectName) && <small>{quote.items.map((item) => item.projectName).filter(Boolean).join(' · ')}</small>}
          {quote.validUntil && <small>Validade: {date(quote.validUntil)}</small>}
          {quote.dueDate && <small>Entrega: {date(quote.dueDate)}</small>}
          {deadline && <small>{deadline.description}</small>}
        </div><b>{money.format(quote.netTotal)}</b>
      </Link><SavedDrawings quoteId={quote.id} /><div className="detail-actions"><Link className="secondary-button" href={`/orcamentos/${quote.id}`}>Ver detalhes</Link>{canEditQuote(quote) && <Link className="secondary-button" href={`/orcamentos/${quote.id}/editar`}>Editar orçamento</Link>}<Link className="text-button" href={`/?parent=${quote.id}`}>+ Vincular complemento</Link></div></article>;
    })}</div>
    {!loading && !error && !quotes.length && <p className="empty">Nenhum registro encontrado.</p>}
    {pages > 1 && <nav className="pagination" aria-label="Páginas de orçamentos">
      <button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button className="secondary-button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button>
    </nav>}
  </main>;
}
