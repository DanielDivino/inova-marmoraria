'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFiltrosNaUrl } from '../../componentes/useFiltrosNaUrl';
import { nomeProjeto } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { AbasFiltro, AtalhosCabecalho, Icone } from '../../componentes/filtros/Filtros';
import { confirmar } from '../../componentes/Confirmacao';
import { OpcaoSemCadastro, contatoCliente, payloadCliente } from '../../componentes/clientes/SemCadastro';

type Customer = { id: string; name: string; phone: string | null; isQuick?: boolean; archivedAt?: string | null; document?: string | null; email?: string | null; address?: string | null; quotes?: { number: string; createdAt: string; status: string; items: { materialNameSnapshot: string; projectName?: string | null; components: { label: string; componentType: string }[] }[] }[] };
type CustomerForm = { name: string; phone: string; document: string; email: string; address: string; neighborhood: string; city: string; postalCode: string; complement: string; notes: string };
const empty: CustomerForm = { name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' };

export default function CustomersPage() { return <Suspense fallback={<main className="list-page">Carregando clientes…</main>}><ListaClientes /></Suspense>; }

type Situacao = 'todos' | 'ativos' | 'incompletos' | 'inativos';
type Contagem = Record<Situacao, number>;
/** Situação do cliente: arquivado (inativo), sem cadastro (cadastro incompleto) ou ativo. */
const situacaoDo = (customer: Customer): Exclude<Situacao, 'todos'> => customer.archivedAt ? 'inativos' : customer.isQuick ? 'incompletos' : 'ativos';
const SELO: Record<Exclude<Situacao, 'todos'>, [string, string]> = { ativos: ['active', 'Ativo'], incompletos: ['incomplete', 'Cadastro incompleto'], inativos: ['inactive', 'Inativo'] };

function ListaClientes() {
  const parametros = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  // Busca e situação ficam no endereço: ao voltar de um cliente, a lista reabre igual.
  const [search, setSearch] = useState(parametros.get('busca') ?? '');
  const inicial = parametros.get('situacao') ?? (parametros.get('tipo') === 'sem-cadastro' ? 'incompletos' : 'todos');
  const [situacao, setSituacao] = useState<Situacao>(['todos', 'ativos', 'incompletos', 'inativos'].includes(inicial) ? inicial as Situacao : 'todos');
  useFiltrosNaUrl('clientes', { busca: search, situacao }, { situacao: 'todos' });
  const [contagem, setContagem] = useState<Contagem>({ todos: 0, ativos: 0, incompletos: 0, inativos: 0 });
  const [form, setForm] = useState<CustomerForm>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  /** Novo cadastro como orçamento sem cadastro (nada obrigatório). */
  const [rapido, setRapido] = useState(false);
  /** Editando um cliente sem cadastro: pode continuar sem telefone. */
  const [editandoRapido, setEditandoRapido] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  type Lista = { data: Customer[]; counts?: Contagem };
  const url = () => `/customers?search=${encodeURIComponent(search)}&limit=100&situacao=${situacao}`;
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
  }, [search, situacao]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (customer: Customer) => { setEditing(customer.id); setRapido(false); setEditandoRapido(!!customer.isQuick); setForm({ ...empty, ...customer, phone: customer.phone ?? '', document: customer.document ?? '', email: customer.email ?? '', address: customer.address ?? '' }); setOpenForm(true); };
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); try { const payload = payloadCliente(form, rapido && !editing); if (editing) await api(`/customers/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) }); else await api('/customers', { method: 'POST', body: JSON.stringify(payload) }); setEditing(null); setRapido(false); setEditandoRapido(false); setForm(empty); setOpenForm(false); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.'); } }
  /** Arquivar (com confirmação) ou reativar: o arquivado sai da busca do Novo orçamento; os orçamentos dele continuam. */
  async function arquivar(customer: Customer, arquivado: boolean) {
    if (arquivado && !await confirmar({ titulo: `Arquivar ${customer.name}?`, mensagem: 'O cliente sai da busca do Novo orçamento e fica em “Inativos”. Os orçamentos dele continuam, e dá para reativar quando quiser.', confirmar: 'Arquivar cliente' })) return;
    setError(''); setAviso('');
    try {
      await api(`/customers/${customer.id}/arquivo`, { method: 'PATCH', body: JSON.stringify({ arquivado }) });
      setAviso(arquivado ? `${customer.name} foi arquivado.` : `${customer.name} foi reativado.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível arquivar o cliente.'); }
  }
  const novoCliente = () => { setEditing(null); setRapido(false); setEditandoRapido(false); setForm(empty); setOpenForm(true); };
  return <main className="list-page"><header className="list-header"><h1 className="titulo-no-topo">Clientes</h1><AtalhosCabecalho /></header>
    {/* Mesmo filtro de Funcionários: busca, situação (com as contagens) e Limpar; o "Novo cliente" no fim. */}
    <div className="barra-filtros" role="search" aria-label="Buscar clientes">
      <label className="barra-filtros-busca"><Icone nome="buscar" tamanho={20} /><input type="search" aria-label="Buscar clientes" placeholder="Nome, CPF ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="barra-filtros-abas">
        <AbasFiltro rotulo="Filtrar clientes" valor={situacao} aoEscolher={(valor) => setSituacao(valor === situacao ? 'todos' : valor)} grupos={[{ opcoes: [
          { valor: 'todos', rotulo: 'Todos', icone: 'todos', total: contagem.todos },
          { valor: 'ativos', rotulo: 'Ativos', icone: 'aprovado', total: contagem.ativos },
          { valor: 'incompletos', rotulo: 'Cadastro incompleto', icone: 'incompleto', total: contagem.incompletos },
          { valor: 'inativos', rotulo: 'Inativos', icone: 'inativo', total: contagem.inativos },
        ] }]} />
        <i className="barra-filtros-separador" aria-hidden="true" />
        <button type="button" className="botao-contorno" disabled={situacao === 'todos' && !search} onClick={() => { setSituacao('todos'); setSearch(''); }}><Icone nome="limpar" />Limpar</button>
        <button type="button" className="botao-destaque" onClick={novoCliente}><Icone nome="mais" />Novo cliente</button>
      </div>
    </div>
    {openForm && <form className="inline-form customer-form" onSubmit={submit}><strong>{editing ? 'Editar cliente' : 'Novo cliente'}</strong>{!editing && <OpcaoSemCadastro ativo={rapido} aoMudar={setRapido} />}{editandoRapido && <p className="cliente-rapido-aviso">Cliente sem cadastro: informe o telefone para concluir o cadastro.</p>}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={rapido ? 'Nome (opcional)' : 'Nome'} aria-label="Nome" required={!rapido} /><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={rapido || editandoRapido ? 'Telefone (opcional)' : 'Telefone'} aria-label="Telefone" required={!rapido && !editandoRapido} />{!rapido && <><input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} placeholder="CPF (opcional)" /><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="E-mail" /><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Endereço" /><input value={form.neighborhood} onChange={(event) => setForm({ ...form, neighborhood: event.target.value })} placeholder="Bairro" /><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Cidade" /><input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} placeholder="CEP" /><input value={form.complement} onChange={(event) => setForm({ ...form, complement: event.target.value })} placeholder="Complemento" /><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Observações" /></>}<button className="primary-button">{rapido ? 'Criar sem cadastro' : 'Salvar'}</button></form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {aviso && <p className="catalog-notice" role="status">{aviso}</p>}
    <div className="admin-rows clientes-linhas">{customers.map((customer) => {
      const last = customer.quotes?.[0]; const lastItem = last?.items?.[0];
      const [classe, rotulo] = SELO[situacaoDo(customer)];
      return <article key={customer.id}>
        <div><Link className="quote-link" href={`/clientes/${customer.id}`}><strong>{customer.name}</strong></Link><small>{contatoCliente(customer)}</small><small>{last && lastItem ? `Último serviço: ${nomeProjeto(lastItem)} · ${lastItem.materialNameSnapshot} · ${new Date(last.createdAt).toLocaleDateString('pt-BR')}` : 'Sem orçamento registrado'}</small></div>
        <span className={`worker-status-badge worker-status-badge-${classe}`}><i aria-hidden="true" />{rotulo}</span>
        <Link className="text-button" href={`/clientes/${customer.id}`}>Detalhes</Link>
        <button className="text-button" onClick={() => edit(customer)}>Editar</button>
        <button className="text-button" onClick={() => void arquivar(customer, !customer.archivedAt)}>{customer.archivedAt ? 'Reativar' : 'Arquivar'}</button>
      </article>;
    })}</div>
    {!customers.length && <p className="empty">{situacao === 'inativos' ? 'Nenhum cliente arquivado.' : situacao === 'incompletos' ? 'Nenhum cliente com cadastro incompleto.' : 'Nenhum cliente encontrado.'}</p>}
  </main>;
}
