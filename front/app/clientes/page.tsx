'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

type Customer = { id: string; name: string; phone: string; document?: string | null; email?: string | null; address?: string | null; quotes?: { number: string; createdAt: string; status: string; items: { materialNameSnapshot: string; productType: { name: string } }[] }[] };
type CustomerForm = { name: string; phone: string; document: string; email: string; address: string; neighborhood: string; city: string; postalCode: string; complement: string; notes: string };
const empty: CustomerForm = { name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CustomerForm>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [error, setError] = useState('');
  const load = () => api<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(search)}&limit=100`).then((result) => setCustomers(result.data)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar clientes.'));
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setError('');
      api<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(search)}&limit=100`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setCustomers(result.data); })
        .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar clientes.'); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);
  const edit = (customer: Customer) => { setEditing(customer.id); setForm({ ...empty, ...customer, document: customer.document ?? '', email: customer.email ?? '', address: customer.address ?? '' }); setOpenForm(true); };
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); try { const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value || null])); if (editing) await api(`/customers/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) }); else await api('/customers', { method: 'POST', body: JSON.stringify(payload) }); setEditing(null); setForm(empty); setOpenForm(false); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.'); } }
  return <main className="list-page"><header className="list-header"><Link href="/">← Orçamento</Link><h1>Clientes</h1><Link href="/orcamentos">Orçamentos</Link></header><div className="customer-toolbar"><input className="search" placeholder="Buscar por nome, telefone ou CPF" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="primary-button" onClick={() => { setEditing(null); setForm(empty); setOpenForm(true); }}>+ Novo cliente</button></div>{openForm && <form className="inline-form customer-form" onSubmit={submit}><strong>{editing ? 'Editar cliente' : 'Novo cliente'}</strong><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome" required /><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Telefone" required /><input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} placeholder="CPF (opcional)" /><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="E-mail" /><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Endereço" /><input value={form.neighborhood} onChange={(event) => setForm({ ...form, neighborhood: event.target.value })} placeholder="Bairro" /><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Cidade" /><input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} placeholder="CEP" /><input value={form.complement} onChange={(event) => setForm({ ...form, complement: event.target.value })} placeholder="Complemento" /><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Observações" /><button className="primary-button">Salvar</button></form>}{error && <p className="form-error">{error}</p>}<div className="admin-rows">{customers.map((customer) => { const last = customer.quotes?.[0]; const lastItem = last?.items?.[0]; return <article key={customer.id}><div><Link className="quote-link" href={`/clientes/${customer.id}`}><strong>{customer.name}</strong></Link><small>{customer.phone}{customer.document ? ` · CPF ${customer.document}` : ''}</small><small>{last && lastItem ? `Último serviço: ${lastItem.productType.name} · ${lastItem.materialNameSnapshot} · ${new Date(last.createdAt).toLocaleDateString('pt-BR')}` : 'Sem orçamento registrado'}</small></div><Link className="text-button" href={`/clientes/${customer.id}`}>Detalhes</Link><button className="text-button" onClick={() => edit(customer)}>Editar</button></article>; })}</div>{!customers.length && <p className="empty">Nenhum cliente encontrado.</p>}</main>;
}
