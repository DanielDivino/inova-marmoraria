'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { temPermissao, projetoTemDesenho, rotuloLadoBorda, descontosIndividuais, podeEditarOrcamento, DEADLINE_LABELS, obterStatusPrazo, obterStatusTrabalho, WORK_STATUS_LABELS, WORK_STATUS_STORAGE, WORK_STATUSES, type SavedQuoteItem, type WorkStatus } from '@inova/domain';
import { SavedItemDrawing } from '../../../componentes/orcamento/SavedDrawings';
import { StatusOrcamento } from '../../../componentes/QuoteStatus';
import { useSession } from '../../../componentes/ApplicationShell';
import { api } from '../../../utilitarios/api';
import { ExportarPdfOrcamento } from '../../../componentes/orcamento/QuotePdfExport';

import { formatarMoeda } from '../../../utilitarios/formatadores';
type Edge = { side: string; serviceNameSnapshot: string; billingUnitSnapshot?: string; billedQuantity: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number };
type Component = { id: string; label: string; orientation: 'HORIZONTAL' | 'VERTICAL'; lengthMm: number; widthMm: number; quantity: number; billableArea: number; subtotal: number; calculatedTotal: number; appliedTotal: number; hasManualPriceOverride: boolean; edges: Edge[] };
type Cutout = { id: string; cutoutType: string; label?: string; lengthMm?: number; widthMm?: number; diameterMm?: number; quantity: number };
type Worker = { id: string; name: string; workColor: string };
type WorkerAssignment = { id: string; assignedAt: string; releasedAt?: string | null; colorSnapshot: string; worker: Worker };
type TrackingTab = 'GENERAL' | 'TEAM' | 'DEADLINES' | 'NOTES' | 'HISTORY';
type Quote = {
  parentQuote?: { id: string; number: string } | null; complements?: { id: string; number: string; netTotal: number }[];
  number: string; createdAt?: string; status: string; executionStatus?: string; approvedAt?: string; completedAt?: string; validUntil?: string; dueDate?: string; deliveryDeadline?: string; installationDeadline?: string; deadlineConfirmed?: boolean; deadlineNote?: string | null; customerNameSnapshot: string; customerPhoneSnapshot?: string; workAddressSnapshot?: string;
  discountAmount: number; grossTotal: number; netTotal: number; notes?: string;
  workerAssignments?: WorkerAssignment[];
  items: (SavedQuoteItem & { id: string; materialNameSnapshot: string; unitPriceSnapshot: number; billedQuantity: number; materialSubtotal: number; total: number; calculationMode: 'DIMENSIONS' | 'MANUAL_M2'; productType: { name: string }; services: { serviceNameSnapshot: string; billedQuantity: number; unitPriceSnapshot: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number; billingUnitSnapshot: string }[]; components: Component[]; cutouts: Cutout[] })[];
};
const cm = (millimeters: number) => (millimeters / 10).toLocaleString('pt-BR');
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession();
  const canTeam = !!user && temPermissao(user.role, 'team');
  const canTechnical = !!user && temPermissao(user.role, 'technical');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
 const [updating, setUpdating] = useState(false);
  const [savingTracking, setSavingTracking] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [savingWorker, setSavingWorker] = useState(false);
  const [trackingTab, setTrackingTab] = useState<TrackingTab>('GENERAL');
  const [openingDesign, setOpeningDesign] = useState(false);
  useEffect(() => { api<Quote>(`/quotes/${id}`).then(setQuote).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o orçamento.')); if (canTeam) api<Worker[]>('/workers?active=true').then(setWorkers).catch(() => setWorkers([])); }, [id, canTeam]);
  if (error && !quote) return <main className="list-page"><p className="form-error">{error}</p></main>;
  if (!quote) return <main className="list-page"><p className="empty">Carregando orçamento…</p></main>;
  const individualDiscount = descontosIndividuais(quote.items);
  const totalDiscountGiven = individualDiscount + quote.discountAmount;
 async function changeStatus(payload: { status: string; executionStatus?: string; reason?: string }) {
    if (updating) return;
    setUpdating(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o projeto.'); }
    finally { setUpdating(false); }
 }
  async function saveTracking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savingTracking) return;
    const form = new FormData(event.currentTarget); setSavingTracking(true); setError('');
    const payload: { deliveryDeadline?: string | null; installationDeadline?: string | null; deadlineConfirmed?: boolean; deadlineNote?: string | null } = {};
    if (form.has('deliveryDeadline')) payload.deliveryDeadline = String(form.get('deliveryDeadline') || '') || null;
    if (form.has('installationDeadline')) payload.installationDeadline = String(form.get('installationDeadline') || '') || null;
    if (form.has('deadlineConfirmed')) payload.deadlineConfirmed = form.get('deadlineConfirmed') === 'on';
    if (form.has('deadlineNote')) payload.deadlineNote = String(form.get('deadlineNote') || '') || null;
    try { setQuote(await api<Quote>('/quotes/' + id + '/tracking', { method: 'PATCH', body: JSON.stringify(payload) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o prazo.'); }
    finally { setSavingTracking(false); }
  }
  async function changeWorker(workerId: string) {
    if (savingWorker) return;
    setSavingWorker(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/worker`, { method: 'PUT', body: JSON.stringify({ workerId: workerId || null }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o funcionário.'); }
    finally { setSavingWorker(false); }
  }
  async function changeWorkerColor(worker: Worker, workColor: string) {
    setSavingWorker(true); setError('');
    try {
      const updated = await api<Worker>(`/workers/${worker.id}`, { method: 'PATCH', body: JSON.stringify({ workColor }) });
      setWorkers((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setQuote((current) => current ? { ...current, workerAssignments: current.workerAssignments?.map((assignment) => assignment.worker.id === updated.id ? { ...assignment, worker: updated } : assignment) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a cor do funcionário.'); }
    finally { setSavingWorker(false); }
  }
  async function openTechnicalDesign() {
    if (openingDesign) return;
    setOpeningDesign(true); setError('');
    try {
      const result = await api<{ editorUrl: string }>(`/quotes/${id}/technical-project`, { method: 'POST' });
      router.push(result.editorUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o desenho técnico.'); }
    finally { setOpeningDesign(false); }
  }
  const currentWorkStatus = obterStatusTrabalho(quote);
  const situacaoPrazoInterno = obterStatusPrazo(quote);
  const activeWorker = quote.workerAssignments?.find((assignment) => !assignment.releasedAt);
  return <main className="list-page">
    <header className="quote-detail-header">
      <div className="quote-detail-heading"><Link href="/orcamentos">← Orçamentos</Link><h1>{quote.number}</h1><StatusOrcamento quote={quote} /></div>
      <div className="quote-detail-header-actions">
        {canTechnical && <button className="secondary-button" disabled={openingDesign} onClick={() => void openTechnicalDesign()}>{openingDesign ? 'Abrindo desenho…' : 'Desenho técnico'}</button>}
        <ExportarPdfOrcamento quoteId={id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} hasDrawings={quote.items.some(item => projetoTemDesenho(item.drawingData))} />
      </div>
    </header>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="detail-actions">
      {podeEditarOrcamento(quote) && <Link className="secondary-button" href={`/orcamentos/${id}/editar`}>Editar orçamento</Link>}
      <Link className="secondary-button" href={`/?parent=${id}`}>+ Vincular complemento</Link>
      <Link className="secondary-button" href={`/orcamentos/${id}/remontagem`}>Desmontagem / Remontagem</Link>
      {['DRAFT', 'SENT', 'EXPIRED'].includes(quote.status) && <button disabled={updating} className="text-button" onClick={() => { if (window.confirm('Cancelar este orçamento? Ele continuará disponível no histórico.')) void changeStatus({ status: 'CANCELLED', reason: 'Cancelado no acompanhamento comercial' }); }}>Cancelar orçamento</button>}
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
    {(quote.parentQuote || Boolean(quote.complements?.length)) && <section className="detail-card"><span>PROJETOS VINCULADOS</span>{quote.parentQuote && <Link href={`/orcamentos/${quote.parentQuote.id}`}>Complemento de {quote.parentQuote.number}</Link>}{quote.complements?.map((complement) => <Link href={`/orcamentos/${complement.id}`} key={complement.id}>{complement.number} · {formatarMoeda(Number(complement.netTotal))}</Link>)}<small>Os valores dos complementos são separados do orçamento original.</small></section>}
    <section className="quote-workbench" aria-label="Acompanhamento do serviço">
      <nav className="quote-workbench-tabs" aria-label="Seções do acompanhamento">{([{ id: 'GENERAL', icon: '●', label: 'Geral' }, { id: 'TEAM', icon: '♟', label: 'Equipe' }, { id: 'DEADLINES', icon: '◷', label: 'Prazos' }, { id: 'NOTES', icon: '▤', label: 'Observação' }, { id: 'HISTORY', icon: '↶', label: 'Histórico' }] as { id: TrackingTab; icon: string; label: string }[]).filter(tab => tab.id !== 'TEAM' || canTeam).map((tab) => <button type="button" key={tab.id} aria-pressed={trackingTab === tab.id} onClick={() => setTrackingTab(tab.id)}><i aria-hidden="true">{tab.icon}</i>{tab.label}</button>)}</nav>
      {trackingTab === 'GENERAL' && <form className="quote-workbench-general" onSubmit={saveTracking}><label>Cliente<strong>{quote.customerNameSnapshot}<small>{quote.customerPhoneSnapshot ?? 'Telefone não informado'}</small></strong></label><label>Status<select value={currentWorkStatus} disabled={updating} onChange={(event) => { const value = event.target.value as WorkStatus; if (value === 'PENDING_APPROVAL') void changeStatus({ status: 'SENT' }); else if (value === 'REJECTED') void changeStatus({ status: 'REJECTED', reason: 'Status alterado no acompanhamento' }); else void changeStatus({ status: WORK_STATUS_STORAGE[value].status, executionStatus: WORK_STATUS_STORAGE[value].executionStatus }); }}>{WORK_STATUSES.map(status => <option value={status} key={status}>{WORK_STATUS_LABELS[status]}</option>)}</select></label><label>Acordada<input type="date" name="deliveryDeadline" defaultValue={quote.deliveryDeadline?.slice(0, 10) ?? ''} /></label><label>Prev. montagem<input type="date" name="installationDeadline" defaultValue={quote.installationDeadline?.slice(0, 10) ?? ''} /></label><button className="save-quote-button" disabled={savingTracking}>{savingTracking ? 'Salvando…' : 'Salvar'}</button></form>}
      {trackingTab === 'TEAM' && <div className="quote-workbench-team"><label>Funcionário em atividade<select value={activeWorker?.worker.id ?? ''} disabled={savingWorker} onChange={(event) => void changeWorker(event.target.value)}><option value="">Sem responsável definido</option>{workers.map(worker => <option value={worker.id} key={worker.id}>{worker.name}</option>)}</select></label>{activeWorker && <div className="active-worker"><i style={{ backgroundColor: activeWorker.worker.workColor }} /><strong>{activeWorker.worker.name}</strong><label>Cor<input aria-label={`Cor de ${activeWorker.worker.name}`} type="color" value={activeWorker.worker.workColor} disabled={savingWorker} onChange={(event) => void changeWorkerColor(activeWorker.worker, event.target.value)} /></label></div>}<details className="worker-colors"><summary>Definir cores da equipe</summary><div>{workers.map((worker) => <label key={worker.id}><i style={{ backgroundColor: worker.workColor }} />{worker.name}<input aria-label={`Cor de ${worker.name}`} type="color" value={worker.workColor} disabled={savingWorker} onChange={(event) => void changeWorkerColor(worker, event.target.value)} /></label>)}</div></details></div>}
      {trackingTab === 'DEADLINES' && <form className="quote-workbench-deadlines" onSubmit={saveTracking}><label>Data acordada para entrega<input type="date" name="deliveryDeadline" defaultValue={quote.deliveryDeadline?.slice(0, 10) ?? ''} /></label><label>Data prevista para montagem<input type="date" name="installationDeadline" defaultValue={quote.installationDeadline?.slice(0, 10) ?? ''} /></label><label className="tracking-check"><input type="checkbox" name="deadlineConfirmed" defaultChecked={quote.deadlineConfirmed} /> Prazo confirmado com o cliente</label><button className="secondary-button" disabled={savingTracking}>{savingTracking ? 'Salvando…' : 'Salvar prazo'}</button><small>Status do prazo: <strong>{DEADLINE_LABELS[situacaoPrazoInterno]}</strong></small></form>}
      {trackingTab === 'NOTES' && <form className="quote-workbench-notes" onSubmit={saveTracking}><label>Observação do prazo<textarea name="deadlineNote" defaultValue={quote.deadlineNote ?? ''} placeholder="Ex.: cliente precisa antes da viagem." rows={2} /></label><button className="secondary-button" disabled={savingTracking}>{savingTracking ? 'Salvando…' : 'Salvar observação'}</button></form>}
      {trackingTab === 'HISTORY' && <div className="quote-workbench-history"><div className="deadline-summary"><small>Emissão: {dateLabel(quote.createdAt)}</small><small>Orçamento válido até: {dateLabel(quote.validUntil)}</small><small>Data de aprovação: {dateLabel(quote.approvedAt)}</small><small>Data limite: {dateLabel(quote.dueDate)}</small><small>Entrega: {dateLabel(quote.completedAt)}</small></div><div className="worker-history"><strong>Funcionários ({quote.workerAssignments?.length ?? 0})</strong><div>{quote.workerAssignments?.length ? quote.workerAssignments.map((assignment) => <p key={assignment.id}><i style={{ backgroundColor: assignment.colorSnapshot }} /><b>{assignment.worker.name}</b><small>{dateLabel(assignment.assignedAt)}{assignment.releasedAt ? ` até ${dateLabel(assignment.releasedAt)}` : ' · trabalhando agora'}</small></p>) : <small>Nenhum funcionário foi vinculado a este serviço.</small>}</div></div></div>}
    </section>
    <div className="cards">{quote.items.map((item) => <article className="detail-card" key={item.id}>
      <span>{item.projectName || item.productType.name.toUpperCase()}</span>{!projetoTemDesenho(item.drawingData) && podeEditarOrcamento(quote) && <Link className="secondary-button" href={`/orcamentos/${id}/editar?detail=${item.id}`}>Adicionar desenhos</Link>}<SavedItemDrawing item={item} notes={quote.notes} /><strong>{[...new Set(item.components.length ? item.components.map(component => component.materialNameSnapshot ?? item.materialNameSnapshot) : [item.materialNameSnapshot])].join(' · ')}</strong>
      <small>{item.calculationMode === 'MANUAL_M2' ? 'Área manual registrada' : 'Área calculada pelos componentes'} · {item.billedQuantity.toLocaleString('pt-BR')} m² · Material: {formatarMoeda(item.materialSubtotal)}</small>
      {item.components.map((component) => <div className="quote-component" key={component.id}><strong>{component.label}</strong><small>{component.materialNameSnapshot ?? item.materialNameSnapshot}</small><small>{cm(component.lengthMm)} × {cm(component.widthMm)} cm · {component.orientation === 'HORIZONTAL' ? 'horizontal' : 'vertical'} · qtd. {component.quantity} · {(component.lengthMm * component.widthMm * component.quantity / 1_000_000).toLocaleString('pt-BR')} m²</small><small>Calculado: {formatarMoeda(Number(component.calculatedTotal))} · Aplicado: {formatarMoeda(Number(component.appliedTotal))} · Desconto: {formatarMoeda(Math.max(0, Number(component.calculatedTotal) - Number(component.appliedTotal)))}</small>{component.edges.map((edge, index) => <small key={`${edge.side}-${index}`}>↳ {rotuloLadoBorda(edge.side)}: {edge.serviceNameSnapshot} · Calculado {formatarMoeda(Number(edge.calculatedSubtotal))} · Aplicado {formatarMoeda(Number(edge.appliedSubtotal))}</small>)}</div>)}
      {item.cutouts.map((cutout) => <small key={cutout.id}>Recorte: {cutout.label ?? cutout.cutoutType}{cutout.lengthMm && cutout.widthMm ? ` · ${cm(cutout.lengthMm)} × ${cm(cutout.widthMm)} cm` : ''}</small>)}
      {item.services.map((service, index) => <small key={`${service.serviceNameSnapshot}-${index}`}>+ {service.serviceNameSnapshot}: calculado {formatarMoeda(Number(service.calculatedSubtotal))} · aplicado {formatarMoeda(Number(service.appliedSubtotal))} · desconto {formatarMoeda(Math.max(0, Number(service.calculatedSubtotal) - Number(service.appliedSubtotal)))}</small>)}
      <b>{formatarMoeda(item.total)}</b>
    </article>)}</div>
    <section className="detail-total"><span>Total bruto</span><strong>{formatarMoeda(quote.grossTotal)}</strong><span>Descontos individuais</span><strong>- {formatarMoeda(individualDiscount)}</strong><span>Desconto geral</span><strong>- {formatarMoeda(quote.discountAmount)}</strong><span>Desconto total dado</span><strong>- {formatarMoeda(totalDiscountGiven)}</strong><b>Total do orçamento: {formatarMoeda(quote.netTotal)}</b></section>
  </main>;
}
