'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { apresentacaoPrazo, ROLE_LABELS, temPermissao } from '@inova/domain';
import { ListasDeSelecao } from './ListasDeSelecao';
import { JanelasDeConfirmacao } from './Confirmacao';
import { api, encerrarSessao, type SessionUser } from '../utilitarios/api';
import { CONSULTA_CELULAR } from '../utilitarios/tela';

const SessionContext = createContext<SessionUser | null>(null);
export function useSession() { return useContext(SessionContext); }
/** Seta de voltar da barra de cima no celular: a tela de detalhe diz para onde ela leva. */
type Voltar = { rotulo: string; href: string } | null;
const VoltarContext = createContext<(voltar: Voltar) => void>(() => {});
export function useVoltarNoTopo(voltar: Voltar) {
  const definir = useContext(VoltarContext);
  const chave = voltar ? `${voltar.href}|${voltar.rotulo}` : '';
  useEffect(() => { if (!voltar) return; definir(voltar); return () => definir(null); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
}

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    showcase: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    project: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8m-4-4h8" /></>,
    quotes: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8m-8 4h5" /></>,
    materials: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
    workers: <><path d="M4 15a8 8 0 0 1 16 0" /><rect x="3" y="15" width="18" height="3" rx="1" /><path d="M12 6v3" /></>,
    dashboard: <><path d="M4 20V10m8 10V4m8 16v-7M2 21h20" /></>,
    workflow: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="7" rx="1.5" /></>,
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
  const [voltar, setVoltar] = useState<Voltar>(null);
  // Orçamento aberto pelo Fluxo, por um cliente, pelo Dashboard ou pelo Histórico: o menu marca essa seção.
  const [secaoDeOrigem, setSecaoDeOrigem] = useState<string | null>(null);
  useEffect(() => {
    const de = new URLSearchParams(window.location.search).get('de');
    const secao = ({ fluxo: '/fluxo', cliente: '/clientes', dashboard: '/dashboard', historico: '/historico' } as Record<string, string>)[de ?? ''];
    setSecaoDeOrigem(secao && (pathname.startsWith('/orcamentos/') || pathname.startsWith('/projetos/')) ? secao : null);
  }, [pathname]);
  const mobileMenu = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; number: string; customerName: string; projectName?: string | null; status: string; label: string; businessDays: number; dueDate: string }[]>([]);

  useEffect(() => {
    setDarkTheme(document.documentElement.classList.contains('inova-dark'));
  }, []);

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

  useEffect(() => { setAlertsOpen(false); mobileMenu.current?.close(); }, [pathname]);
  useEffect(() => {
    const celular = window.matchMedia(CONSULTA_CELULAR);
    const closeOnDesktop = () => { if (!celular.matches) mobileMenu.current?.close(); };
    celular.addEventListener('change', closeOnDesktop);
    return () => celular.removeEventListener('change', closeOnDesktop);
  }, []);
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

  function toggleTheme() {
    const next = !darkTheme;
    setDarkTheme(next);
    document.documentElement.classList.toggle('inova-dark', next);
    try { window.localStorage.setItem('inova-theme', next ? 'dark' : 'light'); } catch { /* O tema ainda funciona sem armazenamento local. */ }
  }

  function abrirMenu() {
    setAlertsOpen(false);
    mobileMenu.current?.showModal();
    setMenuOpen(true);
  }

  if (isLogin) return children;
  if (loading || !user) return <main className="session-screen"><img src="/inova-logo.png" alt="Inova Marmoraria" width={130} height={85} /><p role="status">{error || 'Verificando acesso…'}</p>{error && <><button className="primary-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button><a href="/login">Ir para o login</a></>}</main>;
  const superArea = ['/administracao', '/funcionarios', '/usuarios', '/dashboard'].some(path => pathname === path || pathname.startsWith(path + '/'));
  const allowed = (!superArea || user.role === 'SUPER_ADMIN') && (!pathname.startsWith('/projetos/') || temPermissao(user.role, 'technical'));
  // `inclui`: outras páginas que ficam dentro do mesmo item do menu.
  const links: { href: string; label: string; icon: string; inclui?: string[] }[] = [
    ...(temPermissao(user.role, 'dashboard') ? [{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] : []),
    { href: '/mostruario', label: 'Mostruário', icon: 'showcase' },
    { href: '/', label: 'Novo orçamento', icon: 'project' },
    { href: '/orcamentos', label: 'Orçamentos', icon: 'quotes' },
    { href: '/fluxo', label: 'Fluxo de trabalho', icon: 'workflow' },
    ...(user.role === 'SUPER_ADMIN' ? [{ href: '/administracao', label: 'Materiais e serviços', icon: 'materials' }] : []),
    { href: '/clientes', label: 'Clientes', icon: 'customers' },
    ...(user.role === 'SUPER_ADMIN' || temPermissao(user.role, 'administration') ? [{ href: user.role === 'SUPER_ADMIN' ? '/funcionarios' : '/usuarios', label: 'Funcionários', icon: 'workers', inclui: ['/funcionarios', '/usuarios'] }] : []),
    { href: '/historico', label: 'Histórico', icon: 'history' },
  ];
  const ativo = (link: typeof links[number]) => secaoDeOrigem ? link.href === secaoDeOrigem : link.href === '/' ? pathname === '/' : [link.href, ...(link.inclui ?? [])].some((prefixo) => pathname.startsWith(prefixo));
  const navigation = <nav aria-label="Menu principal">{links.map((link) => { const selected = ativo(link); return <Link key={link.href} href={link.href} title={link.label} onClick={() => mobileMenu.current?.close()} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined}><span aria-hidden="true"><NavigationIcon name={link.icon} /></span><b className="navigation-label">{link.label}</b></Link>; })}</nav>;
  // Nome da tela principal, na barra de cima (o desenho técnico não está no menu).
  // No Novo orçamento a barra de cima já tem as abas dos atendimentos: sem título.
  const tituloDaTela = pathname === '/' ? null : links.find(ativo)?.label ?? (pathname.startsWith('/projetos/') ? 'Desenho técnico' : 'Inova Marmoraria');
  const navegacaoRapida = [
    { href: '/orcamentos', label: 'Orçamentos', icon: 'quotes' },
    { href: '/clientes', label: 'Clientes', icon: 'customers' },
    { href: '/', label: 'Novo', icon: 'project' },
    { href: '/fluxo', label: 'Fluxo', icon: 'workflow' },
  ];
  const sino = (id: string) => <button type="button" className="notification-bell" aria-label="Notificações de prazo" aria-expanded={alertsOpen} aria-controls={id} onClick={() => setAlertsOpen((open) => !open)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>{alerts.length > 0 && <b>{alerts.length}</b>}</button>;
  const painelAvisos = (id: string) => <aside id={id} className="notification-panel" aria-label="Notificações de prazo"><strong>Prazos de projetos</strong>{alerts.length ? alerts.map((alert) => <Link onClick={() => { setAlertsOpen(false); mobileMenu.current?.close(); }} href={`/orcamentos/${alert.id}`} key={alert.id} className={`deadline-alert ${alert.status.toLowerCase()}`}><b>{alert.number}</b><span>{alert.customerName}{alert.projectName ? ` · ${alert.projectName}` : ''}</span><small>{apresentacaoPrazo(alert.dueDate)?.description ?? alert.label}</small></Link>) : <p>Nenhum prazo exige atenção.</p>}</aside>;
  return <SessionContext.Provider value={user}><VoltarContext.Provider value={setVoltar}><div className="application-frame">
    <aside className="application-sidebar"><Link className="application-brand" href="/" aria-label="Inova — novo orçamento"><img src="/inova-logo.png" alt="Inova Marmoraria" /></Link>
      <span className="sidebar-section-label">ÁREA DE TRABALHO</span>
      {navigation}
      <div className="sidebar-marble-message"><span className="sidebar-signature">NATUREZA EM CADA DETALHE</span><p>Pedras que<br />transformam<br /><em>ambientes.</em></p></div>
  </aside><dialog className="mobile-navigation-dialog" id="mobile-navigation" ref={mobileMenu} aria-label="Navegação da Inova" onClose={() => { setMenuOpen(false); setAlertsOpen(false); }} onClick={event => { if (event.target === event.currentTarget) mobileMenu.current?.close(); }}>
    <aside className="application-sidebar mobile-sidebar">
      <div className="mobile-menu-tools">{sino('mobile-deadline-notifications')}<button type="button" className="secondary-button mobile-menu-close" autoFocus onClick={() => mobileMenu.current?.close()} aria-label="Fechar menu">Fechar <span aria-hidden="true">×</span></button></div>
      <Link className="application-brand" href="/" onClick={() => mobileMenu.current?.close()} aria-label="Inova — novo orçamento"><img src="/inova-logo.png" alt="Inova Marmoraria" /></Link>
      {menuOpen && alertsOpen && painelAvisos('mobile-deadline-notifications')}
      <span className="sidebar-section-label">ÁREA DE TRABALHO</span>
      {navigation}
      <div className="mobile-menu-account"><div><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></div><button type="button" className="secondary-button mobile-menu-theme" aria-pressed={darkTheme} onClick={toggleTheme}>{darkTheme ? 'Tema claro' : 'Tema escuro'}</button><button type="button" className="text-button" onClick={signOut} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair da conta'}</button>{logoutError && <p role="alert" className="form-error">{logoutError}</p>}</div>
    </aside>
  </dialog><div className="application-content"><div className="application-header-actions">{voltar && <Link className="mobile-voltar" href={voltar.href} aria-label={`Voltar para ${voltar.rotulo}`} title={`Voltar para ${voltar.rotulo}`}>‹</Link>}{tituloDaTela && <strong className="titulo-da-tela">{tituloDaTela}</strong>}<div id="application-mobile-summary" className="application-mobile-summary" /><div id="application-header-tabs" className="application-header-tabs" />{pathname === '/mostruario' && <Link className="showcase-header-request" href="/">Solicitar orçamento <span>→</span></Link>}{sino('deadline-notifications')}<button type="button" className="notification-bell theme-toggle" aria-label={darkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'} title={darkTheme ? 'Tema claro' : 'Tema escuro'} aria-pressed={darkTheme} onClick={toggleTheme}>{darkTheme ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z" /></svg>}</button><div className="header-account"><span className="account-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></div><button type="button" onClick={signOut} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair'}</button></div>{alertsOpen && painelAvisos('deadline-notifications')}</div>{logoutError && <p role="alert" className="form-error header-logout-error">{logoutError}</p>}{allowed ? children : <main className="list-page"><h1>Acesso restrito</h1><p>Seu perfil não possui acesso a esta área.</p><Link href="/orcamentos">Voltar aos seus orçamentos</Link></main>}</div>
    <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
      {navegacaoRapida.map(link => <Link key={link.href} href={link.href} aria-label={link.href === '/' ? 'Criar novo orçamento' : `Abrir ${link.label.toLocaleLowerCase('pt-BR')}`} aria-current={ativo(link) ? 'page' : undefined} className={link.href === '/' ? 'mobile-nav-create' : undefined}><span><NavigationIcon name={link.icon} /></span>{link.label}</Link>)}
      <button type="button" aria-label="Abrir todas as telas" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={abrirMenu}><span><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></span>Mais</button>
    </nav>
  </div><ListasDeSelecao /><JanelasDeConfirmacao /></VoltarContext.Provider></SessionContext.Provider>;
}
