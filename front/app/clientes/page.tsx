'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { nomeProjeto } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { AtalhosCabecalho, CampoFiltro, Icone, PainelFiltros } from '../../componentes/filtros/Filtros';
import { OpcaoSemCadastro, contatoCliente, payloadCliente } from '../../componentes/clientes/SemCadastro';

type Customer = { id: string; name: string; phone: string | null; isQuick?: boolean; document?: string | null; email?: string | null; address?: string | null; quotes?: { number: string; createdAt: string; status: string; items: { materialNameSnapshot: string; projectName?: string | null; components: { label: string; componentType: string }[] }[] }[] };
type CustomerForm = { name: string; phone: string; document: string; email: string; address: string; neighborhood: string; city: string; postalCode: string; complement: string; notes: string };
const empty: CustomerForm = { name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  /** Cadastrados e sem cadastro (orçamento sem cadastro) separados, para achar mais rápido. */
  const [tipo, setTipo] = useState<'cadastrados' | 'sem-cadastro'>('cadastrados');
  const [contagem, setContagem] = useState({ cadastrados: 0, semCadastro: 0 });
  const [form, setForm] = useState<CustomerForm>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  /** Novo cadastro como orçamento sem cadastro (nada obrigatório). */
  const [rapido, setRapido] = useState(false);
  /** Editando um cliente sem cadastro: pode continuar sem telefone. */
  const [editandoRapido, setEditandoRapido] = useState(false);
  const [error, setError] = useState('');
  type Lista = { data: Customer[]; counts?: { cadastrados: number; semCadastro: number } };
  const url = () => `/customers?search=${encodeURIComponent(search)}&limit=100&tipo=${tipo}`;
  const receber = (result: Lista) => { setCustomers(result.data); if (result.counts) setContagem(result.counts); };
  const load = () => api<Lista>(url()).then(receber).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar clientes.'));
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setError('');
      api<Lista>(url(), { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) receber(result); })
        .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar clientes.'); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (customer: Customer) => { setEditing(customer.id); setRapido(false); setEditandoRapido(!!customer.isQuick); setForm({ ...empty, ...customer, phone: customer.phone ?? '', document: customer.document ?? '', email: customer.email ?? '', address: customer.address ?? '' }); setOpenForm(true); };
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); try { const payload = payloadCliente(form, rapido && !editing); if (editing) await api(`/customers/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) }); else await api('/customers', { method: 'POST', body: JSON.stringify(payload) }); const criouSemCadastro = rapido && !editing; setEditing(null); setRapido(false); setEditandoRapido(false); setForm(empty); setOpenForm(false); if (criouSemCadastro && tipo !== 'sem-cadastro') setTipo('sem-cadastro'); else await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.'); } }
  return <main className="list-page"><header className="list-header"><h1 className="titulo-no-topo">Clientes</h1><AtalhosCabecalho /></header><div className="barra-lista"><button type="button" className="botao-destaque" onClick={() => { setEditing(null); setRapido(false); setEditandoRapido(false); setForm(empty); setOpenForm(true); }}><Icone nome="mais" />Novo cliente</button></div><PainelFiltros rotulo="Buscar clientes" ativos={search ? 1 : 0} aoLimpar={() => setSearch('')} aoBuscar={() => void load()}><CampoFiltro rotulo="Cliente" icone="pessoa"><input type="search" aria-label="Buscar clientes" placeholder="Nome, telefone ou CPF" value={search} onChange={(event) => setSearch(event.target.value)} /></CampoFiltro></PainelFiltros>{openForm && <form className="inline-form customer-form" onSubmit={submit}><strong>{editing ? 'Editar cliente' : 'Novo cliente'}</strong>{!editing && <OpcaoSemCadastro ativo={rapido} aoMudar={setRapido} />}{editandoRapido && <p className="cliente-rapido-aviso">Sem cadastro: informe o telefone para completar o cadastro.</p>}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={rapido ? 'Nome (opcional)' : 'Nome'} aria-label="Nome" required={!rapido} /><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={rapido || editandoRapido ? 'Telefone (opcional)' : 'Telefone'} aria-label="Telefone" required={!rapido && !editandoRapido} />{!rapido && <><input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} placeholder="CPF (opcional)" /><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="E-mail" /><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Endereço" /><input value={form.neighborhood} onChange={(event) => setForm({ ...form, neighborhood: event.target.value })} placeholder="Bairro" /><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Cidade" /><input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} placeholder="CEP" /><input value={form.complement} onChange={(event) => setForm({ ...form, complement: event.target.value })} placeholder="Complemento" /><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Observações" /></>}<button className="primary-button">{rapido ? 'Criar sem cadastro' : 'Salvar'}</button></form>}{error && <p className="form-error">{error}</p>}<div className="admin-tabs clientes-abas" role="tablist" aria-label="Tipo de cliente"><button type="button" role="tab" aria-selected={tipo === 'cadastrados'} className={tipo === 'cadastrados' ? 'selected' : ''} onClick={() => setTipo('cadastrados')}>Cadastrados <b>{contagem.cadastrados}</b></button><button type="button" role="tab" aria-selected={tipo === 'sem-cadastro'} className={tipo === 'sem-cadastro' ? 'selected' : ''} onClick={() => setTipo('sem-cadastro')}>Sem cadastro <b>{contagem.semCadastro}</b></button></div><div className="admin-rows">{customers.map((customer) => { const last = customer.quotes?.[0]; const lastItem = last?.items?.[0]; return <article key={customer.id}><div><Link className="quote-link" href={`/clientes/${customer.id}`}><strong>{customer.name}</strong></Link><small>{contatoCliente(customer)}</small><small>{last && lastItem ? `Último serviço: ${nomeProjeto(lastItem)} · ${lastItem.materialNameSnapshot} · ${new Date(last.createdAt).toLocaleDateString('pt-BR')}` : 'Sem orçamento registrado'}</small></div><Link className="text-button" href={`/clientes/${customer.id}`}>Detalhes</Link><button className="text-button" onClick={() => edit(customer)}>Editar</button></article>; })}</div>{!customers.length && <p className="empty">{tipo === 'sem-cadastro' ? 'Nenhum cliente sem cadastro.' : 'Nenhum cliente encontrado.'}</p>}</main>;
}
