'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { getDeadlinePresentation } from '@inova/domain';
import { api, logout, type SessionUser } from '../lib/api';

const SessionContext = createContext<SessionUser | null>(null);
export function useSession() { return useContext(SessionContext); }

export function ApplicationShell({ children }: { children: ReactNode }) {
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
      await logout();
      setUser(null);
      window.location.replace('/login');
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : 'Não foi possível sair. Tente novamente.');
      setLeaving(false);
    }
  }

  if (isLogin) return children;
  if (loading || !user) return <main className="session-screen"><img src="/inova-logo.png" alt="Inova Marmoraria" width={130} height={85} /><p role="status">{error || 'Verificando acesso…'}</p>{error && <><button className="primary-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button><a href="/login">Ir para o login</a></>}</main>;
  const links = [
    { href: '/mostruario', label: 'Mostruário', icon: '◇' },
    { href: '/', label: 'Novo Projeto', icon: '+' },
    { href: '/orcamentos', label: 'Orçamentos', icon: '◷' },
    ...(user.role === 'SUPER_ADMIN' ? [{ href: '/administracao', label: 'Usuários e administração', icon: '⚙' }] : []),
    { href: '/clientes', label: 'Clientes', icon: '♙' },
    { href: '/historico', label: 'Histórico', icon: '◷' },
  ];
  return <SessionContext.Provider value={user}><div className="application-frame">
    <aside className="application-sidebar"><Link className="application-brand" href="/" aria-label="Inova — novo orçamento"><img src="/inova-logo.png" alt="Inova Marmoraria" /></Link>
      <nav aria-label="Menu principal">{links.map((link) => { const selected = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href); return <Link key={link.href} href={link.href} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined}><span aria-hidden="true">{link.icon}</span>{link.label}</Link>; })}</nav>
      <div className="sidebar-marble-message">PEDRAS<br />QUE TRANSFORMAM<br />AMBIENTES</div>
    </aside><div className="application-content"><div className="application-header-actions">{pathname === '/mostruario' && <Link className="showcase-header-request" href="/">Solicitar orçamento <span>→</span></Link>}<button type="button" className="notification-bell" aria-label="Notificações de prazo" aria-expanded={alertsOpen} aria-controls="deadline-notifications" onClick={() => setAlertsOpen((open) => !open)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>{alerts.length > 0 && <b>{alerts.length}</b>}</button><div className="header-account"><span className="account-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Administrador'}</small></div><button type="button" onClick={signOut} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair'}</button></div>{alertsOpen && <aside id="deadline-notifications" className="notification-panel" aria-label="Notificações de prazo"><strong>Prazos de projetos</strong>{alerts.length ? alerts.map((alert) => <Link onClick={() => setAlertsOpen(false)} href={`/orcamentos/${alert.id}`} key={alert.id} className={`deadline-alert ${alert.status.toLowerCase()}`}><b>{alert.number}</b><span>{alert.customerName}{alert.projectName ? ` · ${alert.projectName}` : ''}</span><small>{getDeadlinePresentation(alert.dueDate)?.description ?? alert.label}</small></Link>) : <p>Nenhum prazo exige atenção.</p>}</aside>}</div>{logoutError && <p role="alert" className="form-error header-logout-error">{logoutError}</p>}{children}</div>
  </div></SessionContext.Provider>;
}
