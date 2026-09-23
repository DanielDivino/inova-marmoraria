'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DEFAULT_ASSEMBLY_PRICE, DEFAULT_DISASSEMBLY_PRICE, calcularComponente, centimetrosParaMilimetros, calcularTotalOrcamento, numeroDocumentoRemontagem, type PixDiscountPercent, type RemountDocument, type RemountItem, type RemountTotals } from '@inova/domain';
import { EditorOrcamentoRapido } from '../../../../componentes/orcamento/QuickQuoteEditor';
import type { ComponentMaterial } from '../../../../componentes/orcamento/ComponentMaterialPicker';
import type { DraftItem } from '../../../../componentes/orcamento/types';
import { criarComponenteRapido, prepararItemRapido } from '../../../../utilitarios/quick-quote';
import { currency, itemSalvoParaRascunho, rascunhoParaEntradaItem } from '../../../../utilitarios/saved-quote';
import { api, buscarArquivoApi } from '../../../../utilitarios/api';
import { abrirPdf } from '../../../../utilitarios/abrir-pdf';
import { formatarMoeda } from '../../../../utilitarios/formatadores';
import '../../../project-builder.css';
import '../../../../componentes/orcamento/quick-quote.css';
import './remontagem.css';

type Service = { id: string; name: string; category: string; billingUnit: ComponentMaterial['billingUnit']; currentPrice: number };
type Catalog = { materials: ComponentMaterial[]; services: Service[]; productTypes: { id: string; name: string }[] };
type Origin = { id: string; number: string; customerNameSnapshot: string; customerPhoneSnapshot: string | null; workAddressSnapshot: string | null; notes: string | null; createdAt: string };
type Preview = RemountTotals & { items: RemountItem[] };
const newItem = (productTypeId: string): DraftItem => ({ id: crypto.randomUUID(), projectName: '', productTypeId, materialId: '', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [criarComponenteRapido()], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, drawingData: { entryMode: 'QUICK' } });
const date = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export default function RemontagemPage() {
  const { id } = useParams<{ id: string }>();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [saved, setSaved] = useState<RemountDocument | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [assembly, setAssembly] = useState(String(DEFAULT_ASSEMBLY_PRICE));
  const [disassembly, setDisassembly] = useState(String(DEFAULT_DISASSEMBLY_PRICE));
  const [card, setCard] = useState('');
  const [pixPercent, setPixPercent] = useState<PixDiscountPercent>(5);
  const [notes, setNotes] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [individualPrices, setIndividualPrices] = useState(false);
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);

  const restore = (document: RemountDocument | null, productTypeId: string) => {
    setSaved(document);
    setItems(document?.items.length ? document.items.map(itemSalvoParaRascunho) : [newItem(productTypeId)]);
    setAssembly(String(document?.assembly ?? DEFAULT_ASSEMBLY_PRICE)); setDisassembly(String(document?.disassembly ?? DEFAULT_DISASSEMBLY_PRICE));
    setCard(document?.cardOverride == null ? '' : String(document.cardOverride)); setPixPercent(document?.pixPercent ?? 5);
    setNotes(document?.notes ?? ''); setItemNotes(document?.itemNotes ?? {}); setDirty(false);
  };
  useEffect(() => {
    const controller = new AbortController(); setError('');
    Promise.all([api<{ quote: Origin; remount: RemountDocument | null }>(`/quotes/${id}/remontagem`, { signal: controller.signal }), api<Catalog>('/catalog', { signal: controller.signal })])
      .then(([data, loadedCatalog]) => { if (!controller.signal.aborted) { setOrigin(data.quote); setCatalog(loadedCatalog); restore(data.remount, loadedCatalog.productTypes[0]?.id ?? ''); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a remontagem.'); });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const input = useMemo(() => {
    if (!catalog) return { body: '', issue: '' };
    try {
      const groups = items.map(prepararItemRapido);
      if (groups.some(item => !item.components.length && (item.serviceIds.length || item.cutouts.length))) throw new Error('Informe as peças do grupo para calcular os serviços adicionais.');
      const prepared = groups.filter(item => item.components.length > 0);
      const componentIds = new Set(prepared.flatMap(item => item.components.map(component => component.id)));
      const payload = { expectedVersion: saved?.version ?? 0, assembly: currency(assembly), disassembly: currency(disassembly), cardOverride: card.trim() ? currency(card) : null, pixPercent, notes,
        itemNotes: Object.fromEntries(Object.entries(itemNotes).filter(([key]) => componentIds.has(key))),
        items: prepared.map(item => ({ ...rascunhoParaEntradaItem(item), id: item.id })) };
      if (prepared.some(item => !item.materialId && !item.components[0]?.materialId)) throw new Error('Selecione o material das peças.');
      return { body: JSON.stringify(payload), issue: '' };
    } catch (cause) { return { body: '', issue: cause instanceof Error ? cause.message : 'Confira os campos preenchidos.' }; }
  }, [items, saved?.version, catalog, assembly, disassembly, card, pixPercent, notes, itemNotes]);
  useEffect(() => {
    if (!input.body) return;
    const controller = new AbortController(); setPreviewError('');
    const timer = setTimeout(() => {
      api<Preview>(`/quotes/${id}/remontagem/calculate`, { method: 'POST', body: input.body, signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setPreview({ key: input.body, data }); })
        .catch(cause => { if (!controller.signal.aborted) setPreviewError(cause instanceof Error ? cause.message : 'Falha no cálculo.'); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, input.body]);
  const change = (action: () => void) => { action(); setDirty(true); setStatus(''); };
  const ready = preview?.key === input.body && !!input.body && !previewError;
  const totals = ready ? preview.data : null;
  const display = (value?: number) => value === undefined ? '—' : formatarMoeda(value);
  async function submit(kind?: 'pdf' | 'delivery-pdf') {
    if (!input.body || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const document = await api<RemountDocument>(`/quotes/${id}/remontagem`, { method: 'PUT', body: input.body });
      restore(document, catalog!.productTypes[0]?.id ?? ''); setStatus('Remontagem salva.');
      if (kind) {
        const file = await buscarArquivoApi(`/quotes/${id}/remontagem/${kind}?individualPrices=${individualPrices}`);
        abrirPdf(file, `${kind === 'pdf' ? document.number : document.deliveryNumber}.pdf`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  if (!origin || !catalog) return <main className="list-page">{error ? <p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></p> : <p role="status">Carregando remontagem…</p>}</main>;
  const otherServices = totals ? calcularTotalOrcamento(totals.items.flatMap(item => [...item.services, ...item.cutouts].map(service => Number(service.appliedSubtotal)))) : undefined;
  const materials = totals ? calcularTotalOrcamento(totals.items.flatMap(item => item.components.map(component => Number(component.appliedTotal)))) : undefined;
  const individualComponents = items.flatMap(item => item.components.map(component => ({ item, component })));
  const updateComponentValue = (itemId: string, componentId: string, value: string) => change(() => { setItems(current => current.map(item => item.id !== itemId ? item : { ...item, components: item.components.map(component => component.id === componentId ? { ...component, appliedTotal: value || undefined } : component) })); setCard(''); });
  return <main className="shell project-builder remount-page">
    <header className="quote-detail-header"><div className="quote-detail-heading"><Link href={`/orcamentos/${id}`}>← Orçamento {origin.number}</Link><h1>Desmontagem e Remontagem</h1><small>{saved?.number ?? numeroDocumentoRemontagem(origin.number, 'REM')}</small></div></header>
    <section className="detail-card"><strong>{origin.customerNameSnapshot}</strong><small>{origin.customerPhoneSnapshot || 'Telefone não informado'}</small><small>{origin.workAddressSnapshot || 'Endereço não informado'}</small><small>Orçamento {origin.number} · {date(origin.createdAt)}{saved ? ` · Proposta atualizada em ${date(saved.updatedAt)}` : ''}</small>{origin.notes && <p>Observações do projeto: {origin.notes}</p>}</section>
    {error && <p role="alert" className="form-error">{error}</p>}
    <fieldset disabled={busy} className="remount-fieldset">
    <div className="quote-workspace quick-workspace"><div className="quote-form-column">
      {items.map((item, index) => {
        const calculated = ready ? preview.data.items.find(entry => entry.id === item.id) : undefined;
        const snapshots = saved?.items.find(entry => entry.id === item.id);
        const historicalMaterials: ComponentMaterial[] = snapshots ? [snapshots, ...snapshots.components].flatMap(entry => entry.materialId ? [{
          ...catalog.materials.find(material => material.id === entry.materialId),
          id: entry.materialId, name: entry.materialNameSnapshot ?? snapshots.materialNameSnapshot,
          category: catalog.materials.find(material => material.id === entry.materialId)?.category ?? 'Material da proposta',
          billingUnit: entry.billingUnitSnapshot ?? snapshots.billingUnitSnapshot, currentPrice: Number(entry.unitPriceSnapshot ?? snapshots.unitPriceSnapshot),
        }] : []) : [];
        const itemMaterials = [...new Map([...catalog.materials, ...historicalMaterials].map(material => [material.id, material])).values()];
        return <div key={item.id}>
          <EditorOrcamentoRapido item={item} title={items.length > 1 ? `Materiais / pedras novas · ${index + 1}` : 'Materiais / pedras novas'} showAssembly={false} showRounding={false}
            materials={itemMaterials} material={itemMaterials.find(material => material.id === (item.materialId || item.components[0]?.materialId))}
            services={catalog.services.filter(service => !/^(desmontagem|montagem)$/i.test(service.name.trim()))}
            onChange={patch => change(() => { setItems(current => current.map(entry => entry.id === item.id ? { ...entry, ...patch } : entry)); setCard(''); })}
            area={component => { try { return calcularComponente({ ...component, lengthMm: centimetrosParaMilimetros(component.lengthCm), widthMm: centimetrosParaMilimetros(component.widthCm) }).billableArea; } catch { return 0; } }}
            value={component => Number(calculated?.components.find(entry => entry.id === component.id)?.appliedTotal ?? 0)}
            calculateCutout={cutout => Number(calculated?.cutouts.find(entry => entry.id === cutout.id)?.calculatedSubtotal ?? 0)}
            renderComponentInfo={component => {
              const stored = calculated?.components.find(entry => entry.id === component.id) ?? snapshots?.components.find(entry => entry.id === component.id);
              const material = itemMaterials.find(entry => entry.id === (component.materialId || item.materialId));
              const unitPrice = stored && stored.materialId === material?.id ? Number(stored.unitPriceSnapshot) : material?.currentPrice;
              return <div className="remount-piece-info"><small>{material?.name || 'Selecione o material'} · {display(unitPrice)}/m²{stored && ready ? ` · Valor calculado: ${formatarMoeda(Number(stored.calculatedTotal))}` : ''}</small><label>Observação da peça<input maxLength={500} value={itemNotes[component.id] ?? ''} onChange={event => change(() => setItemNotes(current => ({ ...current, [component.id]: event.target.value })))} /></label></div>;
            }} />
          {items.length > 1 && <button type="button" className="text-button" onClick={() => change(() => setItems(current => current.filter(entry => entry.id !== item.id)))}>Remover grupo {index + 1}</button>}
        </div>;
      })}
      <button type="button" className="secondary-button" onClick={() => change(() => setItems(current => [...current, newItem(catalog.productTypes[0]?.id ?? '')]))}>+ Grupo de materiais</button>
      <section className="section"><h2>Serviços</h2><div className="quick-project-fields">
        <label>Montagem (R$)<input inputMode="decimal" value={assembly} onChange={event => change(() => { setAssembly(event.target.value); setCard(''); })} />{!!totals?.assemblyDiscount && <small>Desconto: {formatarMoeda(totals.assemblyDiscount)}</small>}</label>
        <label>Desmontagem (R$)<input inputMode="decimal" value={disassembly} onChange={event => change(() => { setDisassembly(event.target.value); setCard(''); })} />{ !!totals?.disassemblyDiscount && <small>Desconto: {formatarMoeda(totals.disassemblyDiscount)}</small>}</label>
      </div><p>Total dos serviços: {display(totals ? calcularTotalOrcamento([currency(assembly), currency(disassembly)]) : undefined)}</p></section>
      <section className="section"><h2>Forma de pagamento</h2><div className="quick-project-fields"><label>Valor no cartão<input inputMode="decimal" placeholder={totals ? formatarMoeda(totals.subtotal) : 'Automático'} value={card} onChange={event => change(() => setCard(event.target.value))} /><small>O total calculado é o valor à vista. Informe aqui um valor maior para o cartão.</small></label><p className="payment-explanation">À vista: {display(totals?.subtotal)} · Desconto aplicado: {display(totals?.cashDiscount)}</p></div></section>
      <section className="section"><label className="remount-notes">Observações da proposta e entrega<textarea rows={4} maxLength={3000} value={notes} onChange={event => change(() => setNotes(event.target.value))} /></label></section>
    </div><aside className="quote-summary-card"><strong>Resumo da remontagem</strong><span>Materiais e acabamentos <b>{display(materials)}</b></span><div className="remount-individual-values"><strong>Valores individuais</strong>{individualComponents.map(({ item, component }, index) => { const calculated = totals?.items.find(entry => entry.id === item.id)?.components.find(entry => entry.id === component.id); return <label key={component.id}>{component.label || `Peça ${index + 1}`}<input inputMode="decimal" aria-label={`Valor individual ${component.label || `peça ${index + 1}`}`} placeholder={calculated ? formatarMoeda(Number(calculated.appliedTotal)) : 'Automático'} value={component.appliedTotal ?? ''} onChange={event => updateComponentValue(item.id, component.id, event.target.value)} /><small>Deixe vazio para restaurar o cálculo.</small></label>; })}</div><span>Montagem <b>{display(totals ? currency(assembly) : undefined)}</b></span><span>Desmontagem <b>{display(totals ? currency(disassembly) : undefined)}</b></span><span>Outros serviços e recortes <b>{display(otherServices)}</b></span><span>Total à vista <b>{display(totals?.subtotal)}</b></span><span className="summary-grand-total">Cartão <b>{display(totals?.cardTotal)}</b></span><span>Desconto à vista <b>{display(totals?.cashDiscount)}</b></span>
      <p role="status">{input.issue || previewError || (!ready ? 'Calculando…' : dirty ? 'Alterações não salvas.' : saved ? 'Dados salvos.' : 'Nova proposta.')}</p>
    </aside></div>
    <section className="section remount-document-actions"><label>Valores na proposta<select aria-label="Valores na proposta" value={String(individualPrices)} onChange={event => setIndividualPrices(event.target.value === 'true')}><option value="false">Sem valores descritos</option><option value="true">Com valores descritos</option></select></label><p>A geração salva os dados atuais. A nota de entrega contém itens, conferência e assinatura, sem preços.</p><div className="detail-actions"><button type="button" className="save-quote-button" disabled={!ready || busy} onClick={() => void submit()}>Salvar</button><button type="button" className="secondary-button" disabled={!ready || busy} onClick={() => void submit('pdf')}>Gerar proposta em PDF</button><button type="button" className="secondary-button" disabled={!ready || busy} onClick={() => void submit('delivery-pdf')}>Nota de Entrega</button></div>{status && <p role="status">{status}</p>}{busy && <p role="status">Salvando e preparando documento…</p>}</section>
    </fieldset>
  </main>;
}
