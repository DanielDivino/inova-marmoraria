'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ROLE_LABELS, type UserRole } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { useSession } from '../../componentes/ApplicationShell';
import '../dashboard/dashboard.css';

type ManagedUser = { id: string; name: string; email: string; role: UserRole; isActive: boolean; maxDiscountPercent: number | string };
const empty = { name: '', email: '', password: '', role: 'SELLER' as UserRole, maxDiscountPercent: '0', isActive: true };
export default function UsersPage() {
  const session = useSession();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<ManagedUser[]>('/users').then(setUsers);
  useEffect(() => { load().catch(cause => setError(cause.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { password, isActive, ...rest } = form;
      await api(editing ? `/users/${editing}` : '/users', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ ...rest, maxDiscountPercent: Number(form.maxDiscountPercent), ...(password ? { password } : {}), ...(editing ? { isActive } : {}) }) });
      await load(); setForm(empty); setEditing(null); setNotice('Usuário salvo. As permissões valem também para sessões já abertas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o usuário.'); }
    finally { setBusy(false); }
  }
  return <main className="list-page"><header className="list-header"><div><span className="catalog-eyebrow">ACESSOS DO SISTEMA</span><h1>Usuários e vendedores</h1></div><Link href="/dashboard">Dashboard</Link></header>
    <p className="customer-help">Vendedores acessam mostruário, novos projetos, seus clientes e seus orçamentos até a entrega. O super administrador acessa todas as áreas. O perfil Administrador mantém o acesso operacional existente.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="catalog-notice" role="status">{notice}</p>}
    <section className="detail-card"><h2 className="section-title">{editing ? 'Editar usuário' : 'Cadastrar vendedor'}</h2><form className="user-form" onSubmit={save}>
      <label>Nome<input required minLength={2} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>E-mail<input required type="email" autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <label>{editing ? 'Nova senha (deixe vazio para manter)' : 'Senha'}<input type="password" required={!editing} minLength={8} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
      <label>Perfil<select disabled={editing === session?.id} value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
      <label>Desconto final autorizado (%)<input type="number" min={0} max={100} step="0.01" required value={form.maxDiscountPercent} onChange={event => setForm({ ...form, maxDiscountPercent: event.target.value })} /></label>
      {editing && <label>Situação<select disabled={editing === session?.id} value={form.isActive ? 'active' : 'inactive'} onChange={event => setForm({ ...form, isActive: event.target.value === 'active' })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>}
      <div className="user-form-actions"><button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar usuário'}</button>{editing && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar edição</button>}</div>
    </form></section>
    <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Desconto autorizado</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.name}<small>{user.email}</small></td><td>{ROLE_LABELS[user.role]}</td><td>{user.isActive ? 'Ativo' : 'Inativo'}</td><td>{Number(user.maxDiscountPercent).toLocaleString('pt-BR')}%</td><td><button className="text-button" disabled={busy} onClick={() => { setEditing(user.id); setForm({ name: user.name, email: user.email, role: user.role, isActive: user.isActive, maxDiscountPercent: String(user.maxDiscountPercent), password: '' }); setError(''); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button></td></tr>)}</tbody></table></div>
  </main>;
}
