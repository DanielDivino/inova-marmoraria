'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { apresentacaoPrazo, ROLE_LABELS, temPermissao } from '@inova/domain';
import { api, encerrarSessao, type SessionUser } from '../utilitarios/api';

const SessionContext = createContext<SessionUser | null>(null);
export function useSession() { return useContext(SessionContext); }

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    showcase: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    project: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8m-4-4h8" /></>,
    quotes: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8m-8 4h5" /></>,
    materials: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
    workers: <><path d="M4 15a8 8 0 0 1 16 0" /><rect x="3" y="15" width="18" height="3" rx="1" /><path d="M12 6v3" /></>,
    dashboard: <><path d="M4 20V10m8 10V4m8 16v-7M2 21h20" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function EstruturaAplicacao({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; number: string; customerName: string; projectName?: string | null; status: string; label: string; businessDays: number; dueDate: string }[]>([]);

  useEffect(() => {
    if (isLogin) { setUser(null); return; }
    let active = true;
    setLoading(true);
    setError('');
    api<{ user: SessionUser }>('/auth/me').then((data) => {
      if (active) setUser(data.user);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível verificar seu acesso.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isLogin, attempt]);
  useEffect(() => {
    if (!user) return;
    const loadAlerts = () => api<{ alerts: typeof alerts }>('/notifications/deadlines').then((data) => setAlerts(data.alerts)).catch(() => setAlerts([]));
    void loadAlerts();
    const interval = window.setInterval(loadAlerts, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => { setAlertsOpen(false); }, [pathname]);
  useEffect(() => {
    if (!alertsOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setAlertsOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [alertsOpen]);

  async function signOut() {
    setLeaving(true);
    setLogoutError('');
    try {
      await encerrarSessao();
      setUser(null);
      window.location.replace('/login');
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : 'Não foi possível sair. Tente novamente.');
      setLeaving(false);
    }
  }

  if (isLogin) return children;
  if (loading || !user) return <main className="session-screen"><img src="/inova-logo.png" alt="Inova Marmoraria" width={130} height={85} /><p role="status">{error || 'Verificando acesso…'}</p>{error && <><button className="primary-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button><a href="/login">Ir para o login</a></>}</main>;
  const superArea = ['/administracao', '/funcionarios', '/usuarios', '/dashboard'].some(path => pathname === path || pathname.startsWith(path + '/'));
  const allowed = (!superArea || user.role === 'SUPER_ADMIN') && (!pathname.startsWith('/projetos/') || temPermissao(user.role, 'technical'));
  const links = [
    ...(temPermissao(user.role, 'dashboard') ? [{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] : []),
    { href: '/mostruario', label: 'Mostruário', icon: 'showcase' },
    { href: '/', label: 'Novo Projeto', icon: 'project' },
    { href: '/orcamentos', label: 'Orçamentos', icon: 'quotes' },
    ...(user.role === 'SUPER_ADMIN' ? [{ href: '/administracao', label: 'Materiais e serviços', icon: 'materials' }] : []),
    { href: '/clientes', label: 'Clientes', icon: 'customers' },
    ...(user.role === 'SUPER_ADMIN' ? [{ href: '/funcionarios', label: 'Funcionários', icon: 'workers' }] : []),
    ...(temPermissao(user.role, 'administration') ? [{ href: '/usuarios', label: 'Usuários e vendedores', icon: 'customers' }] : []),
    { href: '/historico', label: 'Histórico', icon: 'history' },
  ];
  return <SessionContext.Provider value={user}><div className="application-frame">
    <aside className="application-sidebar"><Link className="application-brand" href="/" aria-label="Inova — novo orçamento"><img src="/inova-logo.png" alt="Inova Marmoraria" /></Link>
      <span className="sidebar-section-label">SEU ESPAÇO DE TRABALHO</span>
      <nav aria-label="Menu principal">{links.map((link) => { const selected = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href); return <Link key={link.href} href={link.href} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined}><span aria-hidden="true"><NavigationIcon name={link.icon} /></span>{link.label}</Link>; })}</nav>
      <div className="sidebar-marble-message">PEDRAS<br />QUE TRANSFORMAM<br />AMBIENTES</div>
  </aside><div className="application-content"><div className="application-header-actions"><div id="application-header-tabs" className="application-header-tabs" />{pathname === '/mostruario' && <Link className="showcase-header-request" href="/">Solicitar orçamento <span>→</span></Link>}<button type="button" className="notification-bell" aria-label="Notificações de prazo" aria-expanded={alertsOpen} aria-controls="deadline-notifications" onClick={() => setAlertsOpen((open) => !open)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>{alerts.length > 0 && <b>{alerts.length}</b>}</button><div className="header-account"><span className="account-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></div><button type="button" onClick={signOut} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair'}</button></div>{alertsOpen && <aside id="deadline-notifications" className="notification-panel" aria-label="Notificações de prazo"><strong>Prazos de projetos</strong>{alerts.length ? alerts.map((alert) => <Link onClick={() => setAlertsOpen(false)} href={`/orcamentos/${alert.id}`} key={alert.id} className={`deadline-alert ${alert.status.toLowerCase()}`}><b>{alert.number}</b><span>{alert.customerName}{alert.projectName ? ` · ${alert.projectName}` : ''}</span><small>{apresentacaoPrazo(alert.dueDate)?.description ?? alert.label}</small></Link>) : <p>Nenhum prazo exige atenção.</p>}</aside>}</div>{logoutError && <p role="alert" className="form-error header-logout-error">{logoutError}</p>}{allowed ? children : <main className="list-page"><h1>Acesso restrito</h1><p>Seu perfil não tem acesso a esta área.</p><Link href="/orcamentos">Voltar aos seus orçamentos</Link></main>}</div>
  </div></SessionContext.Provider>;
}
