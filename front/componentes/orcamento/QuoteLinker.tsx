'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../utilitarios/api';

export type QuoteLink = { id: string; number: string; customerId: string; customer: { id: string; name: string; phone: string | null }; items?: { projectName?: string | null }[] };
/** Complemento de um orçamento já feito: ao abrir, mostra só os orçamentos do cliente deste atendimento. */
export function VincularOrcamento({ customer, value, onChange }: { customer: { id: string; name: string } | null; value: QuoteLink | null; onChange: (value: QuoteLink | null) => void }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<QuoteLink[] | null>(null);
  const [error, setError] = useState('');
  const customerId = customer?.id;
  useEffect(() => {
    setResults(null);
    if (!open || value || !customerId) return;
    const controller = new AbortController();
    setError('');
    api<{ data: QuoteLink[] }>(`/quotes?limit=50&customerId=${encodeURIComponent(customerId)}`, { signal: controller.signal })
      .then((result) => setResults(result.data))
      .catch((cause) => { if (!controller.signal.aborted) { setResults([]); setError(cause instanceof Error ? cause.message : 'Não foi possível buscar os orçamentos.'); } });
    return () => controller.abort();
  }, [customerId, open, value]);
  const projetos = (quote: QuoteLink) => quote.items?.map((item) => item.projectName).filter(Boolean).join(' · ');
  return <details className="quote-linker" open={open || Boolean(value)} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Vincular projeto a um orçamento existente (opcional)</summary>
    <p className="customer-help">Para algo que não foi orçado: crie um complemento com valor próprio, sem alterar o orçamento original.</p>
    {value ? <div><Link href={`/orcamentos/${value.id}`}>{value.number} · {value.customer.name}</Link> <button className="text-button" type="button" onClick={() => onChange(null)}>Remover vínculo</button></div>
      : !customerId ? <p className="customer-help">Escolha o cliente para ver os projetos dele.</p>
      : error ? <p role="alert" className="form-error">{error}</p>
      : !results ? <p role="status">Buscando projetos do cliente…</p>
      : !results.length ? <p className="quote-linker-vazio">Sem projetos ligados a esse cliente.</p>
      : <div className="customer-results">{results.map((quote) => <button type="button" className="customer-result" key={quote.id} onClick={() => onChange(quote)}><strong>{quote.number}</strong><small>{projetos(quote) || quote.customer.name}</small></button>)}</div>}
  </details>;
}
