'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ROLE_LABELS, type UserRole } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { useSession } from '../../componentes/ApplicationShell';
import { CabecalhoEquipe } from '../../componentes/equipe/CabecalhoEquipe';
import { AbasFiltro, Icone, type NomeIcone } from '../../componentes/filtros/Filtros';
import { Janela } from '../../componentes/Janela';
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
      await load(); closeForm(); setNotice('Usuário salvo. As permissões passam a valer imediatamente, inclusive para sessões já iniciadas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o usuário.'); }
    finally { setBusy(false); }
  }
  return <main className="list-page"><CabecalhoEquipe acoes={<button className="botao-destaque" type="button" onClick={() => { setForm(empty); setEditing(''); setError(''); setNotice(''); }}><Icone nome="mais" />Cadastrar vendedor</button>} />
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
    <div className="dashboard-table-wrap"><table className="dashboard-table mobile-data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Desconto autorizado</th><th>Ações</th></tr></thead><tbody>{visiveis.map(user => <tr key={user.id}><td>{user.name}<small>{user.email}</small></td><td data-rotulo="Perfil">{ROLE_LABELS[user.role]}</td><td data-rotulo="Situação">{user.isActive ? 'Ativo' : 'Inativo'}</td><td data-rotulo="Desconto autorizado">{Number(user.maxDiscountPercent).toLocaleString('pt-BR')}%</td><td data-rotulo="Ações"><button className="text-button" disabled={busy} onClick={() => { setEditing(user.id); setForm({ name: user.name, email: user.email, role: user.role, isActive: user.isActive, maxDiscountPercent: String(user.maxDiscountPercent), password: '' }); setError(''); setNotice(''); }}>Editar</button></td></tr>)}{!visiveis.length && <tr><td colSpan={5}>Nenhum usuário com esses filtros.</td></tr>}</tbody></table></div>
    {editing !== null && <Janela aberta aoFechar={closeForm} ocupada={busy} className="catalog-modal" icone="vendedor" titulo={editing ? 'Editar usuário' : 'Cadastrar vendedor'} aoEnviar={save}
      rodape={<><button type="button" className="botao-contorno" disabled={busy} onClick={closeForm}>Cancelar</button><button className="botao-principal" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar vendedor'}</button></>}>
        <div className="admin-form">
          <label>Nome<input required minLength={2} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label>E-mail<input required type="email" autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label>{editing ? 'Nova senha (deixe vazio para manter)' : 'Senha'}<input type="password" required={!editing} minLength={8} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
          <label>Perfil<select disabled={editing === session?.id} value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
          <label>Desconto final autorizado (%)<input type="number" min={0} max={100} step="0.01" required value={form.maxDiscountPercent} onChange={event => setForm({ ...form, maxDiscountPercent: event.target.value })} /></label>
          {editing && <label>Situação<select disabled={editing === session?.id} value={form.isActive ? 'active' : 'inactive'} onChange={event => setForm({ ...form, isActive: event.target.value === 'active' })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
    </Janela>}
  </main>;
}
