'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ROLE_LABELS, type UserRole } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { useSession } from '../../componentes/ApplicationShell';
import { CabecalhoEquipe } from '../../componentes/equipe/CabecalhoEquipe';
import { AbasFiltro, Icone, type NomeIcone } from '../../componentes/filtros/Filtros';
import '../dashboard/dashboard.css';

type ManagedUser = { id: string; name: string; email: string; role: UserRole; isActive: boolean; maxDiscountPercent: number | string };
const empty = { name: '', email: '', password: '', role: 'SELLER' as UserRole, maxDiscountPercent: '0', isActive: true };
type AbaUsuarios = 'TODOS' | UserRole | 'INATIVOS';
const ICONE_PERFIL: Record<UserRole, NomeIcone> = { SUPER_ADMIN: 'escudo', ADMIN: 'equipe', SELLER: 'vendedor' };
const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export default function UsersPage() {
  const session = useSession();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState(empty);
  // null: janela fechada; '': novo cadastro; id: editando.
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [aba, setAba] = useState<AbaUsuarios>('TODOS');
  const [busca, setBusca] = useState('');
  // Filtra a lista já carregada: por perfil ou inativos, e por nome ou e-mail.
  const visiveis = useMemo(() => users.filter((user) => (aba === 'TODOS' || (aba === 'INATIVOS' ? !user.isActive : user.role === aba))
    && normalizar(`${user.name} ${user.email}`).includes(normalizar(busca.trim()))), [users, aba, busca]);
  const load = () => api<ManagedUser[]>('/users').then(setUsers);
  useEffect(() => { load().catch(cause => setError(cause.message)); }, []);
  const closeForm = () => { setEditing(null); setForm(empty); setError(''); };
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { password, isActive, ...rest } = form;
      await api(editing ? `/users/${editing}` : '/users', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ ...rest, maxDiscountPercent: Number(form.maxDiscountPercent), ...(password ? { password } : {}), ...(editing ? { isActive } : {}) }) });
      await load(); closeForm(); setNotice('Usuário salvo. As permissões valem também para sessões já abertas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o usuário.'); }
    finally { setBusy(false); }
  }
  return <main className="list-page"><CabecalhoEquipe />
    <div className="barra-lista">
      <button className="botao-destaque" type="button" onClick={() => { setForm(empty); setEditing(''); setError(''); setNotice(''); }}><Icone nome="mais" />Cadastrar vendedor</button>
    </div>
    {error && editing === null && <p className="form-error" role="alert">{error}</p>}{notice && <p className="catalog-notice" role="status">{notice}</p>}
    <div className="barra-filtros" role="search" aria-label="Buscar usuários">
      <label className="barra-filtros-busca"><Icone nome="buscar" tamanho={20} /><input type="search" aria-label="Buscar usuários" placeholder="Nome ou e-mail" value={busca} onChange={(event) => setBusca(event.target.value)} /></label>
      {/* Abas e "Limpar" juntos: se não couberem ao lado da busca, descem para a linha de baixo. */}
      <div className="barra-filtros-abas">
        <AbasFiltro rotulo="Filtrar usuários" valor={aba} aoEscolher={(valor) => setAba(valor === aba ? 'TODOS' : valor)} grupos={[{ opcoes: [
          { valor: 'TODOS', rotulo: 'Todos', icone: 'todos', total: users.length },
          ...(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => ({ valor: role, rotulo: ROLE_LABELS[role], icone: ICONE_PERFIL[role], total: users.filter((user) => user.role === role).length })),
          { valor: 'INATIVOS', rotulo: 'Inativos', icone: 'inativo', total: users.filter((user) => !user.isActive).length },
        ] }]} />
        <i className="barra-filtros-separador" aria-hidden="true" />
        <button type="button" className="botao-contorno" disabled={aba === 'TODOS' && !busca} onClick={() => { setAba('TODOS'); setBusca(''); }}><Icone nome="limpar" />Limpar</button>
      </div>
    </div>
    <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Desconto autorizado</th><th>Ações</th></tr></thead><tbody>{visiveis.map(user => <tr key={user.id}><td>{user.name}<small>{user.email}</small></td><td>{ROLE_LABELS[user.role]}</td><td>{user.isActive ? 'Ativo' : 'Inativo'}</td><td>{Number(user.maxDiscountPercent).toLocaleString('pt-BR')}%</td><td><button className="text-button" disabled={busy} onClick={() => { setEditing(user.id); setForm({ name: user.name, email: user.email, role: user.role, isActive: user.isActive, maxDiscountPercent: String(user.maxDiscountPercent), password: '' }); setError(''); setNotice(''); }}>Editar</button></td></tr>)}{!visiveis.length && <tr><td colSpan={5}>Nenhum usuário com esses filtros.</td></tr>}</tbody></table></div>
    {editing !== null && <div className="catalog-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeForm(); }}>
      <section className="catalog-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Editar usuário' : 'Cadastrar vendedor'}>
        <header><div><span className="catalog-eyebrow">{editing ? 'EDITAR' : 'NOVO CADASTRO'}</span><h2>{editing ? 'Usuário' : 'Vendedor'}</h2></div><button type="button" aria-label="Fechar" onClick={closeForm}>×</button></header>
        <form className="admin-form" onSubmit={save}>
          <label>Nome<input required minLength={2} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label>E-mail<input required type="email" autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label>{editing ? 'Nova senha (deixe vazio para manter)' : 'Senha'}<input type="password" required={!editing} minLength={8} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
          <label>Perfil<select disabled={editing === session?.id} value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
          <label>Desconto final autorizado (%)<input type="number" min={0} max={100} step="0.01" required value={form.maxDiscountPercent} onChange={event => setForm({ ...form, maxDiscountPercent: event.target.value })} /></label>
          {editing && <label>Situação<select disabled={editing === session?.id} value={form.isActive ? 'active' : 'inactive'} onChange={event => setForm({ ...form, isActive: event.target.value === 'active' })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar vendedor'}</button>
        </form>
      </section>
    </div>}
  </main>;
}
