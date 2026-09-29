'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { nomeArquivoPdf, nomeProjeto } from '@inova/domain';
import { abrirPdf } from '../../../utilitarios/abrir-pdf';
import Link from 'next/link';
import { CustomerOwner } from '../../../componentes/CustomerOwner';
import { StatusOrcamento } from '../../../componentes/QuoteStatus';
import { api, buscarArquivoApi } from '../../../utilitarios/api';
import { formatarMoeda } from '../../../utilitarios/formatadores';

type Customer = { owner?: { id: string; name: string } | null; id: string; name: string; phone: string | null; isQuick?: boolean; document?: string | null; email?: string | null; address?: string | null; neighborhood?: string | null; city?: string | null; postalCode?: string | null; complement?: string | null; notes?: string | null };
type Quote = { id: string; number: string; status: string; executionStatus?: string; dueDate?: string; validUntil?: string; createdAt: string; netTotal: number; items: { materialNameSnapshot: string; projectName?: string | null; components: { label: string; componentType: string }[] }[] };
export default function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null); const [quotes, setQuotes] = useState<Quote[]>([]); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api<Customer>(`/customers/${id}`), api<Quote[]>(`/customers/${id}/quotes`)]).then(([detail, history]) => { setCustomer(detail); setQuotes(history); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o cliente.')); }, [id]);
  async function abrirOrcamentoPdf(quoteId: string, number: string) {
    try { abrirPdf(await buscarArquivoApi(`/quotes/${quoteId}/pdf`), nomeArquivoPdf(customer?.name, number)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o PDF.'); }
  }
  if (error) return <main className="list-page"><p className="form-error">{error}</p></main>;
  if (!customer) return <main className="list-page"><p className="empty">Carregando cliente…</p></main>;
  return <main className="list-page"><header className="list-header"><Link href="/clientes">← Clientes</Link><h1>{customer.name}</h1><Link href="/">Novo orçamento</Link></header><section className="detail-card"><span>CONTATO</span><strong>{customer.phone || 'Sem telefone'}</strong>{customer.isQuick && <small className="cliente-rapido-aviso">Cliente rápido: complete o cadastro em Clientes → Editar.</small>}{customer.document && <small>CPF: {customer.document}</small>}{customer.email && <small>{customer.email}</small>}{customer.address && <small>{customer.address}{customer.complement ? ` · ${customer.complement}` : ''}</small>}{(customer.neighborhood || customer.city || customer.postalCode) && <small>{[customer.neighborhood, customer.city, customer.postalCode].filter(Boolean).join(' · ')}</small>}{customer.notes && <small>{customer.notes}</small>}</section><CustomerOwner customerId={id} owner={customer.owner} /><h2 className="section-title">Histórico de orçamentos</h2><div className="cards">{quotes.map((quote) => <article className="quote-card" key={quote.id}><div><StatusOrcamento quote={quote} /><strong>{quote.number}</strong><small>{new Date(quote.createdAt).toLocaleDateString('pt-BR')} · {quote.items.map((item) => `${nomeProjeto(item)} · ${item.materialNameSnapshot}`).join(' | ')}</small></div><div className="customer-history-actions"><b>{formatarMoeda(quote.netTotal)}</b><Link className="text-button" href={`/orcamentos/${quote.id}`}>Abrir</Link><button className="text-button" onClick={() => void abrirOrcamentoPdf(quote.id, quote.number)}>PDF</button></div></article>)}</div>{!quotes.length && <p className="empty">Nenhum orçamento vinculado a este cliente.</p>}</main>;
}
