'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ROLE_LABELS, type DashboardCounts, type DashboardData } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { formatarMoeda } from '../../utilitarios/formatadores';
import './dashboard.css';
import { CampoFiltro, PainelFiltros } from '../../componentes/filtros/Filtros';

type Seller = { id: string; name: string; isActive: boolean };
const stages: [keyof DashboardCounts, string][] = [
  ['pending', 'Aguardando aprovação'], ['approved', 'Aprovados · não iniciados'], ['production', 'Em produção'],
  ['waitingMaterial', 'Aguardando material'], ['pendingWork', 'Trabalho pendente'], ['rework', 'Em retrabalho'],
  ['ready', 'Prontos'], ['deliveryPending', 'Entrega pendente'], ['installationPending', 'Montagem pendente'],
  ['delivered', 'Entregues'], ['cancelled', 'Cancelados'], ['rejected', 'Recusados'], ['expired', 'Expirados'],
];
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [filters, setFilters] = useState({ from: '', to: '', sellerId: '' });
  const [applied, setApplied] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api<Seller[]>('/users').then(setSellers).catch(cause => setError(cause.message)); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    api<DashboardData>(`/dashboard?${applied}`, { signal: controller.signal }).then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, refresh]);
  const quoteLink = (sellerId: string) => {
    const query = new URLSearchParams(applied);
    query.set('sellerId', sellerId); query.set('scope', 'all');
    return `/orcamentos?${query}`;
  };
  return <main className="list-page dashboard-page">
    <header className="list-header"><div className="titulo-no-topo"><span className="catalog-eyebrow">VISÃO DA MARMORARIA</span><h1>Dashboard</h1></div><Link className="secondary-button" href="/usuarios">Gerenciar vendedores</Link></header>
    <PainelFiltros rotulo="Filtros do dashboard" ativos={[filters.from, filters.to, filters.sellerId].filter(Boolean).length} ocupado={loading} rotuloBuscar="Atualizar"
      aoBuscar={() => { setApplied(new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()); setRefresh(value => value + 1); }}
      aoLimpar={() => { setFilters({ from: '', to: '', sellerId: '' }); setApplied(''); setRefresh(value => value + 1); }}>
      <CampoFiltro rotulo="Período de emissão" icone="calendario" grupo><input type="date" aria-label="Emissão a partir de" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /><small>até</small><input type="date" aria-label="Emissão até" min={filters.from || undefined} value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></CampoFiltro>
      <CampoFiltro rotulo="Vendedor / responsável" icone="vendedor"><select value={filters.sellerId} onChange={event => setFilters({ ...filters, sellerId: event.target.value })}><option value="">Todos os responsáveis</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}{seller.isActive ? '' : ' (inativo)'}</option>)}</select></CampoFiltro>
    </PainelFiltros>
    <p className="customer-help">O período considera a data de emissão dos orçamentos. Vendas são orçamentos aprovados, incluindo os já entregues. Valores representam propostas e vendas, não recebimentos de caixa.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && <p role="status">Atualizando indicadores…</p>}
    {data && <div aria-busy={loading} className={loading ? 'dashboard-loading' : undefined}>
      <section className="dashboard-kpis" aria-label="Indicadores gerais">
        <article className="detail-card"><span>Orçamentos emitidos</span><strong>{data.totals.issued}</strong><small>{formatarMoeda(data.totals.quotedValue)} em propostas</small></article>
        <article className="detail-card"><span>Vendidos</span><strong>{data.totals.sold}</strong><small>{formatarMoeda(data.totals.soldValue)} em vendas aprovadas</small></article>
        <article className="detail-card"><span>Conversão</span><strong>{data.totals.conversion.toLocaleString('pt-BR')}%</strong><small>Aprovados / emitidos no período</small></article>
        <article className={`detail-card ${data.totals.overdue ? 'dashboard-warning' : ''}`}><span>Projetos atrasados</span><strong>{data.totals.overdue}</strong><small>Vendas ainda não entregues</small></article>
      </section>
      <section className="detail-card"><h2 className="section-title">Da proposta à entrega</h2><div className="dashboard-stages">{stages.map(([key, label]) => <div key={key}><span>{label}</span><strong>{data.totals[key]}</strong><progress max={Math.max(1, data.totals.issued)} value={data.totals[key]} aria-label={label} /></div>)}</div></section>
      <section className="detail-card"><h2 className="section-title">Vendas por vendedor</h2><div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Responsável</th><th>Emitidos</th><th>Vendidos</th><th>Em produção</th><th>Entregues</th><th>Cancelados</th><th>Atrasados</th><th>Valor vendido</th><th>Conversão</th></tr></thead><tbody>{data.sellers.map(seller => <tr key={seller.id}><td><Link href={quoteLink(seller.id)}>{seller.name}</Link><small>{ROLE_LABELS[seller.role]}{seller.isActive ? '' : ' · Inativo'}</small></td><td>{seller.issued}</td><td>{seller.sold}</td><td>{seller.production}</td><td>{seller.delivered}</td><td>{seller.cancelled}</td><td>{seller.overdue}</td><td>{formatarMoeda(seller.soldValue)}</td><td>{seller.conversion.toLocaleString('pt-BR')}%</td></tr>)}</tbody></table></div>{!data.sellers.length && <p className="empty">Nenhuma venda ou vendedor neste filtro.</p>}</section>
      <section className="detail-card"><h2 className="section-title">Entregas que precisam de atenção</h2><p className="customer-help">Até 20 projetos atrasados. Considera o prazo de montagem, depois o de entrega e, na ausência de ambos, o prazo interno.</p>
        {data.overdueQuotes.length ? <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Orçamento / cliente</th><th>Responsável</th><th>Prazo</th><th>Valor</th></tr></thead><tbody>{data.overdueQuotes.map(quote => <tr key={quote.id}><td><Link href={`/orcamentos/${quote.id}`}>{quote.number}</Link><small>{quote.customerName}</small></td><td>{quote.sellerName}</td><td>{quote.deadline.slice(0, 10).split('-').reverse().join('/')}<small>{quote.deadlineSource}</small></td><td>{formatarMoeda(quote.netTotal)}</td></tr>)}</tbody></table></div> : <p className="empty">Nenhum projeto atrasado neste filtro.</p>}
      </section>
      <small className="customer-help">Atualizado em {new Date(data.generatedAt).toLocaleString('pt-BR')}</small>
    </div>}
  </main>;
}
