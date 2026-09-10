'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

export type QuoteLink = { id: string; number: string; customerId: string; customer: { id: string; name: string; phone: string }; items?: { projectName?: string | null }[] };
export function QuoteLinker({ value, onChange }: { value: QuoteLink | null; onChange: (value: QuoteLink | null) => void }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<QuoteLink[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || value) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      api<{ data: QuoteLink[] }>(`/quotes?limit=20&search=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((result) => setResults(result.data))
        .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível buscar os orçamentos.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, open, value]);
  return <details className="quote-linker" open={open || Boolean(value)} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Vincular projeto a um orçamento existente (opcional)</summary>
    <p className="customer-help">Para algo que não foi orçado: crie um complemento com valor próprio, sem alterar o orçamento original.</p>
    {value ? <div><Link href={`/orcamentos/${value.id}`}>{value.number} · {value.customer.name}</Link> <button className="text-button" type="button" onClick={() => onChange(null)}>Remover vínculo</button></div> : <>
      <input className="search" aria-label="Buscar orçamento para vincular" placeholder="Número, cliente ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} />
      {error && <p role="alert" className="form-error">{error}</p>}
      {loading ? <p role="status">Buscando orçamentos…</p> : <div className="customer-results">{results.map((quote) => <button type="button" className="customer-result" key={quote.id} onClick={() => onChange(quote)}><strong>{quote.number} · {quote.customer.name}</strong><small>{quote.items?.map((item) => item.projectName).filter(Boolean).join(' · ') || quote.customer.phone}</small></button>)}{!results.length && !error && <p className="customer-help">Nenhum orçamento encontrado.</p>}</div>}
    </>}
  </details>;
}
