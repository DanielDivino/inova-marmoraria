'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { QuoteStatus } from '../../../components/QuoteStatus';
import { api, apiFile } from '../../../lib/api';

type Customer = { id: string; name: string; phone: string; document?: string | null; email?: string | null; address?: string | null; neighborhood?: string | null; city?: string | null; postalCode?: string | null; complement?: string | null; notes?: string | null };
type Quote = { id: string; number: string; status: string; executionStatus?: string; dueDate?: string; validUntil?: string; createdAt: string; netTotal: number; items: { materialNameSnapshot: string; productType: { name: string }; components: { label: string }[] }[] };
export default function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null); const [quotes, setQuotes] = useState<Quote[]>([]); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api<Customer>(`/customers/${id}`), api<Quote[]>(`/customers/${id}/quotes`)]).then(([detail, history]) => { setCustomer(detail); setQuotes(history); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o cliente.')); }, [id]);
  async function openPdf(quoteId: string, number: string) { const blob = await apiFile(`/quotes/${quoteId}/pdf`); const url = URL.createObjectURL(blob); const tab = window.open(url, '_blank', 'noopener,noreferrer'); if (!tab) { const link = document.createElement('a'); link.href = url; link.download = `${number}.pdf`; document.body.appendChild(link); link.click(); link.remove(); } window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  if (error) return <main className="list-page"><p className="form-error">{error}</p></main>;
  if (!customer) return <main className="list-page"><p className="empty">Carregando cliente…</p></main>;
  return <main className="list-page"><header className="list-header"><Link href="/clientes">← Clientes</Link><h1>{customer.name}</h1><Link href="/">Novo orçamento</Link></header><section className="detail-card"><span>CONTATO</span><strong>{customer.phone}</strong>{customer.document && <small>CPF: {customer.document}</small>}{customer.email && <small>{customer.email}</small>}{customer.address && <small>{customer.address}{customer.complement ? ` · ${customer.complement}` : ''}</small>}{(customer.neighborhood || customer.city || customer.postalCode) && <small>{[customer.neighborhood, customer.city, customer.postalCode].filter(Boolean).join(' · ')}</small>}{customer.notes && <small>{customer.notes}</small>}</section><h2 className="section-title">Histórico de orçamentos</h2><div className="cards">{quotes.map((quote) => <article className="quote-card" key={quote.id}><div><QuoteStatus quote={quote} /><strong>{quote.number}</strong><small>{new Date(quote.createdAt).toLocaleDateString('pt-BR')} · {quote.items.map((item) => `${item.productType.name} · ${item.materialNameSnapshot}`).join(' | ')}</small></div><div className="customer-history-actions"><b>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.netTotal)}</b><Link className="text-button" href={`/orcamentos/${quote.id}`}>Abrir</Link><button className="text-button" onClick={() => void openPdf(quote.id, quote.number)}>PDF</button></div></article>)}</div>{!quotes.length && <p className="empty">Nenhum orçamento vinculado a este cliente.</p>}</main>;
}
