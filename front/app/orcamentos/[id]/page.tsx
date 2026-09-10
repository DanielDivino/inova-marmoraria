'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { individualDiscounts, canEditQuote, type SavedQuoteItem } from '@inova/domain';
import { SavedItemDrawing } from '../../../components/quote-builder/SavedDrawings';
import { QuoteStatus } from '../../../components/QuoteStatus';
import { api, apiFile } from '../../../lib/api';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
type Edge = { side: string; serviceNameSnapshot: string; billingUnitSnapshot?: string; billedQuantity: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number };
type Component = { id: string; label: string; orientation: 'HORIZONTAL' | 'VERTICAL'; lengthMm: number; widthMm: number; quantity: number; billableArea: number; subtotal: number; calculatedTotal: number; appliedTotal: number; hasManualPriceOverride: boolean; edges: Edge[] };
type Cutout = { id: string; cutoutType: string; label?: string; lengthMm?: number; widthMm?: number; diameterMm?: number; quantity: number };
type Quote = {
  parentQuote?: { id: string; number: string } | null; complements?: { id: string; number: string; netTotal: number }[];
  number: string; createdAt?: string; status: string; executionStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'REWORK'; approvedAt?: string; completedAt?: string; validUntil?: string; dueDate?: string; customerNameSnapshot: string; customerPhoneSnapshot?: string; workAddressSnapshot?: string;
  discountAmount: number; grossTotal: number; netTotal: number; notes?: string;
  items: (SavedQuoteItem & { id: string; materialNameSnapshot: string; unitPriceSnapshot: number; billedQuantity: number; materialSubtotal: number; total: number; calculationMode: 'DIMENSIONS' | 'MANUAL_M2'; productType: { name: string }; services: { serviceNameSnapshot: string; billedQuantity: number; unitPriceSnapshot: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number; billingUnitSnapshot: string }[]; components: Component[]; cutouts: Cutout[] })[];
};
const cm = (millimeters: number) => (millimeters / 10).toLocaleString('pt-BR');
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [updating, setUpdating] = useState(false);
  useEffect(() => { api<Quote>(`/quotes/${id}`).then(setQuote).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o orçamento.')); }, [id]);
  if (error && !quote) return <main className="list-page"><p className="form-error">{error}</p></main>;
  if (!quote) return <main className="list-page"><p className="empty">Carregando orçamento…</p></main>;
  const quoteNumber = quote.number;
  const individualDiscount = individualDiscounts(quote.items);
  const totalDiscountGiven = individualDiscount + quote.discountAmount;
  async function openPdf() { try { setGeneratingPdf(true); const file = await apiFile(`/quotes/${id}/pdf`); const url = URL.createObjectURL(file); const tab = window.open(url, '_blank', 'noopener,noreferrer'); if (!tab) { const link = document.createElement('a'); link.href = url; link.download = `${quoteNumber}.pdf`; document.body.appendChild(link); link.click(); link.remove(); } window.setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o PDF.'); } finally { setGeneratingPdf(false); } }
  async function changeStatus(payload: { status: string; executionStatus?: string; reason?: string }) {
    if (updating) return;
    setUpdating(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o projeto.'); }
    finally { setUpdating(false); }
  }
  return <main className="list-page">
    <header className="list-header"><Link href="/orcamentos">← Orçamentos</Link><h1>{quote.number}</h1><QuoteStatus quote={quote} /><button type="button" className="text-button" onClick={openPdf} disabled={generatingPdf}>{generatingPdf ? 'Gerando…' : 'Orçamento / OS PDF'}</button></header>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="detail-actions">
      {canEditQuote(quote) && <Link className="secondary-button" href={`/orcamentos/${id}/editar`}>Editar orçamento</Link>}
      <Link className="secondary-button" href={`/?parent=${id}`}>+ Vincular complemento</Link>
      {['DRAFT', 'SENT'].includes(quote.status) && <>
        <button disabled={updating} className="primary-button" onClick={() => changeStatus({ status: 'APPROVED' })}>Confirmar aprovação</button>
        <button disabled={updating} className="text-button" onClick={() => changeStatus({ status: 'REJECTED', reason: 'Cliente não aprovou' })}>Marcar como não aprovado</button>
      </>}
      {quote.status === 'APPROVED' && <>
        {quote.executionStatus === 'NOT_STARTED' && <button disabled={updating} className="secondary-button" onClick={() => changeStatus({ status: 'APPROVED', executionStatus: 'IN_PROGRESS' })}>Iniciar serviço</button>}
        {quote.executionStatus !== 'COMPLETED' && <button disabled={updating} className="secondary-button" onClick={() => changeStatus({ status: 'APPROVED', executionStatus: 'COMPLETED' })}>Marcar como entregue</button>}
        {quote.executionStatus !== 'REWORK' && <button disabled={updating} className="secondary-button" onClick={() => { if (window.confirm('Marcar este projeto como Em retrabalho? Ele ficará na aba Orçamentos.')) void changeStatus({ status: 'APPROVED', executionStatus: 'REWORK', reason: 'Projeto encaminhado para retrabalho' }); }}>Marcar em retrabalho</button>}
      </>}
    </div>
    {(quote.parentQuote || Boolean(quote.complements?.length)) && <section className="detail-card"><span>PROJETOS VINCULADOS</span>{quote.parentQuote && <Link href={`/orcamentos/${quote.parentQuote.id}`}>Complemento de {quote.parentQuote.number}</Link>}{quote.complements?.map((complement) => <Link href={`/orcamentos/${complement.id}`} key={complement.id}>{complement.number} · {money.format(Number(complement.netTotal))}</Link>)}<small>Os valores dos complementos são separados do orçamento original.</small></section>}
    <section className="detail-card"><span>CLIENTE</span><strong>{quote.customerNameSnapshot}</strong><small>{quote.customerPhoneSnapshot ?? 'Telefone não informado'}{quote.workAddressSnapshot ? ` · ${quote.workAddressSnapshot}` : ''}</small></section>
    <section className="detail-card deadline-summary"><span>PRAZOS</span><small>Emissão: {dateLabel(quote.createdAt)}</small><small>Orçamento válido até: {dateLabel(quote.validUntil)}</small><small>Data de aprovação: {dateLabel(quote.approvedAt)}</small><small>Data limite de execução: {dateLabel(quote.dueDate)}</small><small>Entrega: {dateLabel(quote.completedAt)}</small></section>
    <div className="cards">{quote.items.map((item) => <article className="detail-card" key={item.id}>
      <span>{item.projectName || item.productType.name.toUpperCase()}</span><SavedItemDrawing item={item} /><strong>{item.materialNameSnapshot}</strong>
      <small>{item.calculationMode === 'MANUAL_M2' ? 'Área manual registrada' : 'Área calculada pelos componentes'} · {item.billedQuantity.toLocaleString('pt-BR')} m² × {money.format(item.unitPriceSnapshot)} = {money.format(item.materialSubtotal)}</small>
      {item.components.map((component) => <div className="quote-component" key={component.id}><strong>{component.label}</strong><small>{cm(component.lengthMm)} × {cm(component.widthMm)} cm · {component.orientation === 'HORIZONTAL' ? 'horizontal' : 'vertical'} · qtd. {component.quantity} · {(component.lengthMm * component.widthMm * component.quantity / 1_000_000).toLocaleString('pt-BR')} m²</small><small>Calculado: {money.format(Number(component.calculatedTotal))} · Aplicado: {money.format(Number(component.appliedTotal))} · Desconto: {money.format(Math.max(0, Number(component.calculatedTotal) - Number(component.appliedTotal)))}</small>{component.edges.map((edge, index) => <small key={`${edge.side}-${index}`}>↳ {edge.side}: {edge.serviceNameSnapshot} · Calculado {money.format(Number(edge.calculatedSubtotal))} · Aplicado {money.format(Number(edge.appliedSubtotal))}</small>)}</div>)}
      {item.cutouts.map((cutout) => <small key={cutout.id}>Recorte: {cutout.label ?? cutout.cutoutType}{cutout.lengthMm && cutout.widthMm ? ` · ${cm(cutout.lengthMm)} × ${cm(cutout.widthMm)} cm` : ''}</small>)}
      {item.services.map((service, index) => <small key={`${service.serviceNameSnapshot}-${index}`}>+ {service.serviceNameSnapshot}: calculado {money.format(Number(service.calculatedSubtotal))} · aplicado {money.format(Number(service.appliedSubtotal))} · desconto {money.format(Math.max(0, Number(service.calculatedSubtotal) - Number(service.appliedSubtotal)))}</small>)}
      <b>{money.format(item.total)}</b>
    </article>)}</div>
    <section className="detail-total"><span>Total bruto</span><strong>{money.format(quote.grossTotal)}</strong><span>Descontos individuais</span><strong>- {money.format(individualDiscount)}</strong><span>Desconto geral</span><strong>- {money.format(quote.discountAmount)}</strong><span>Desconto total dado</span><strong>- {money.format(totalDiscountGiven)}</strong><b>Total do orçamento: {money.format(quote.netTotal)}</b></section>
  </main>;
}
