'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { appliedComponentValue, canEditQuote, type SavedQuoteItem, aggregateComponentArea, calculateComponent, calculateLine, calculateQuoteTotal, centimetersToMillimeters } from '@inova/domain';
import { ComponentEditor } from '../components/quote-builder/ComponentEditor';
import { TechnicalDrawing } from '../components/quote-builder/TechnicalDrawing';
import { QuoteExtras } from '../components/quote-builder/QuoteExtras';
import type { ComponentType, DraftComponent, DraftEdge, DraftItem } from '../components/quote-builder/types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { draftItemInput, savedItemDraft } from '../lib/saved-quote';
import { QuoteLinker, type QuoteLink } from '../components/quote-builder/QuoteLinker';
import { api } from '../lib/api';
import { StatusLegend } from '../components/QuoteStatus';
import { useSession } from '../components/ApplicationShell';

type BillingUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';
type MaterialImage = { id: string; url: string; alt?: string | null; isPrimary: boolean };
type Material = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; images?: MaterialImage[] };
type Service = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number };
type ProductType = { id: string; name: string };
type Customer = { id: string; name: string; phone: string; document?: string | null; email?: string | null; address?: string | null; neighborhood?: string | null; city?: string | null; postalCode?: string | null; complement?: string | null; notes?: string | null };
type Catalog = { materials: Material[]; services: Service[]; productTypes: ProductType[] };

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const unitLabel: Record<BillingUnit, string> = { SQUARE_METER: 'por m²', LINEAR_METER: 'por metro linear', UNIT: 'por unidade', FIXED: 'valor fixo' };
const labels: Record<ComponentType, string> = { TOP: 'Tampo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', SIDE_LEFT: 'Lateral esquerda', SIDE_RIGHT: 'Lateral direita', SILL: 'Soleira / peitoril', STEP: 'Degrau', OTHER: 'Componente' };
const environments = ['Cozinha', 'Banheiro', 'Área gourmet', 'Escada', 'Janela', 'Outros'];
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const decimal = (value: string) => Number(value.replace(',', '.')) || 0;
const currencyDecimal = (value: string) => { const normalized = value.trim(); if (!normalized) return 0; return Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized) || 0; };
const catalogCacheKey = 'inova_catalog_cache_v2';
const catalogCacheTtlMs = 60_000;
const legacyQuoteDraftStorageKey = 'inova_quote_draft_v2';
const materialImageUrl = (material?: Material) => material?.images?.find((image) => image.isPrimary)?.url ?? material?.images?.[0]?.url;
const blankComponent = (componentType: ComponentType): DraftComponent => ({ id: newId(), label: labels[componentType], componentType, orientation: ['TOP', 'SILL', 'STEP'].includes(componentType) ? 'HORIZONTAL' : 'VERTICAL', lengthCm: '', widthCm: '', quantity: 1, edges: [] });
const newItem = (): DraftItem => ({ id: newId(), projectName: '', environment: '', productTypeId: '', materialId: '', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [blankComponent('TOP')], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {} });
const calculateDraftComponent = (component: DraftComponent) => {
  try { return calculateComponent({ label: component.label, componentType: component.componentType, orientation: component.orientation, lengthMm: centimetersToMillimeters(component.lengthCm), widthMm: centimetersToMillimeters(component.widthCm), quantity: component.quantity }); } catch { return null; }
};

type EditingQuote = { id: string; number: string; status: string; executionStatus: string; updatedAt: string; customer: Customer; customerId: string; items: SavedQuoteItem[]; discountAmount: number; validUntil?: string | null; notes?: string | null; parentQuote?: { id: string; number: string } | null };
export default function QuoteBuilder() {
  const { id: quoteId } = useParams<{ id?: string }>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const currentUser = useSession();
  const quoteDraftStorageKey = `${legacyQuoteDraftStorageKey}:${currentUser?.id}${quoteId ? `:edit:${quoteId}` : ''}`;
  const [editingQuote, setEditingQuote] = useState<EditingQuote | null>(null);
  const [parentQuote, setParentQuote] = useState<QuoteLink | null>(null);
  const [error, setError] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING' | null>('EXISTING');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' });
  const [items, setItems] = useState<DraftItem[]>(() => [newItem()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [discount, setDiscount] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const savedRef = useRef(false);
  const latestDraft = useRef<string>('');
  const linearServices = useMemo(() => catalog?.services.filter((service) => service.billingUnit === 'LINEAR_METER') ?? [], [catalog]);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
        const cached = sessionStorage.getItem(catalogCacheKey);
        let hasFreshCache = false;
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as { createdAt: number; catalog: Catalog };
            hasFreshCache = Date.now() - parsed.createdAt < catalogCacheTtlMs;
            if (hasFreshCache) setCatalog(parsed.catalog);
          } catch { sessionStorage.removeItem(catalogCacheKey); }
        }
        try {
          const freshCatalog = await api<Catalog>('/catalog');
          if (!active) return;
          setCatalog(freshCatalog);
          sessionStorage.setItem(catalogCacheKey, JSON.stringify({ createdAt: Date.now(), catalog: freshCatalog }));
        } catch (cause) {
          if (!hasFreshCache) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo.');
        }
    }
    void loadCatalog().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (quoteId) return;
    try {
      const stored = localStorage.getItem(quoteDraftStorageKey) ?? localStorage.getItem(legacyQuoteDraftStorageKey);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<{ customer: Customer | null; customerMode: 'NEW' | 'EXISTING' | null; customerForm: typeof customerForm; items: DraftItem[]; activeIndex: number; discount: string; validUntil: string; materialSearch: string; parentQuote: QuoteLink | null }>;
        if (draft.parentQuote) setParentQuote(draft.parentQuote);
        if (draft.customer) setCustomer(draft.customer);
        if (draft.customerMode) setCustomerMode(draft.customerMode);
        if (draft.customerForm) setCustomerForm(draft.customerForm);
        if (Array.isArray(draft.items) && draft.items.length) setItems(draft.items.map((entry) => ({ ...entry, projectName: entry.projectName ?? '', environment: entry.environment ?? '', serviceAppliedValues: entry.serviceAppliedValues ?? {} })));
        if (typeof draft.activeIndex === 'number') setActiveIndex(Math.min(Math.max(0, draft.activeIndex), Math.max(0, (draft.items?.length ?? 1) - 1)));
        if (typeof draft.discount === 'string') setDiscount(draft.discount);
        if (typeof draft.validUntil === 'string') setValidUntil(draft.validUntil);
        if (typeof draft.materialSearch === 'string') setMaterialSearch(draft.materialSearch);
        localStorage.setItem(quoteDraftStorageKey, stored);
        localStorage.removeItem(legacyQuoteDraftStorageKey);
      }
    } catch { localStorage.removeItem(quoteDraftStorageKey); }
    setDraftHydrated(true);
  }, []);
  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      if (savedRef.current) return;
      try { localStorage.setItem(quoteDraftStorageKey, latestDraft.current); }
      catch { setError('Não foi possível manter este orçamento neste navegador. Salve-o antes de sair.'); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [quoteDraftStorageKey, draftHydrated, customer, customerMode, customerForm, items, activeIndex, discount, validUntil, materialSearch, parentQuote]);
  latestDraft.current = JSON.stringify({ customer, customerMode, customerForm, items, activeIndex, discount, validUntil, materialSearch, parentQuote, expectedUpdatedAt: editingQuote?.updatedAt });
  useEffect(() => {
    const flush = () => { if (draftHydrated && !savedRef.current) { try { localStorage.setItem(quoteDraftStorageKey, latestDraft.current); } catch {} } };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [quoteDraftStorageKey, draftHydrated]);
  useEffect(() => {
    const defaultProductTypeId = catalog?.productTypes[0]?.id;
    if (!defaultProductTypeId) return;
    setItems((current) => current.map((entry) => entry.productTypeId ? entry : { ...entry, productTypeId: defaultProductTypeId }));
  }, [catalog]);
  useEffect(() => {
    if (customerSearch.trim().length < 2) return void setCustomers([]);
    const controller = new AbortController();
    const timer = window.setTimeout(() => api<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(customerSearch)}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setCustomers(data.data); }).catch(() => { if (!controller.signal.aborted) setCustomers([]); }), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [customerSearch]);
  useEffect(() => {
    const controller = new AbortController();
    if (quoteId) {
      api<EditingQuote>(`/quotes/${quoteId}`, { signal: controller.signal }).then((quote) => {
        if (!canEditQuote(quote)) throw new Error('Este orçamento está encerrado. Crie um complemento ou reabra como retrabalho.');
        setEditingQuote(quote); setCustomer(quote.customer); setCustomerMode(null);
        setItems(quote.items.map(savedItemDraft)); setDiscount(String(quote.discountAmount)); setValidUntil(quote.validUntil?.slice(0, 10) ?? '');
        try {
          const stored = JSON.parse(localStorage.getItem(quoteDraftStorageKey) || 'null');
          if (stored?.expectedUpdatedAt === quote.updatedAt && stored.items?.length) {
            setItems(stored.items); setDiscount(stored.discount); setValidUntil(stored.validUntil);
            if (stored.customer) setCustomer(stored.customer);
          }
        } catch {}
        setDraftHydrated(true);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a edição.'); });
    } else {
      const parent = new URLSearchParams(window.location.search).get('parent');
      if (parent) api<QuoteLink>(`/quotes/${parent}`, { signal: controller.signal }).then((quote) => { setParentQuote(quote); setCustomer(quote.customer); setCustomerMode(null); }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    }
    return () => controller.abort();
  }, [quoteId]);
  const snapshotFor = (draft: DraftItem) => editingQuote?.items.find((saved) => saved.id === draft.id);
  const materialFor = (draft: DraftItem) => {
    const saved = snapshotFor(draft);
    const current = catalog?.materials.find((entry) => entry.id === draft.materialId);
    return saved?.materialId === draft.materialId ? { ...current, id: saved.materialId, name: saved.materialNameSnapshot, category: current?.category ?? 'Material do orçamento', billingUnit: saved.billingUnitSnapshot, currentPrice: Number(saved.unitPriceSnapshot) } : current;
  };
  const servicesFor = (draft: DraftItem): Service[] => {
    const saved = snapshotFor(draft);
    const result = [...(catalog?.services ?? [])];
    if (!saved) return result;
    const prices = [...saved.services, ...saved.components.flatMap((component) => component.edges)];
    for (const row of prices) {
      const service = { id: row.serviceId, name: row.serviceNameSnapshot, category: 'Preço deste orçamento', billingUnit: row.serviceNameSnapshot.toLocaleLowerCase('pt-BR') === 'saia' ? 'LINEAR_METER' as const : row.billingUnitSnapshot, currentPrice: Number(row.unitPriceSnapshot) };
      const index = result.findIndex((entry) => entry.id === row.serviceId);
      if (index >= 0) result[index] = service; else result.push(service);
    }
    for (const cutout of saved.cutouts) {
      if (prices.some((row) => row.serviceId === cutout.serviceId)) continue;
      if (cutout.serviceId && cutout.billingUnitSnapshot && cutout.unitPriceSnapshot != null) {
        const index = result.findIndex((entry) => entry.id === cutout.serviceId);
        const savedService = { id: cutout.serviceId, name: cutout.serviceNameSnapshot ?? 'Recorte / cuba', category: 'Preço deste orçamento', billingUnit: cutout.billingUnitSnapshot, currentPrice: Number(cutout.unitPriceSnapshot) };
        if (index >= 0) result[index] = savedService; else result.push(savedService);
        continue;
      }
      const index = result.findIndex((entry) => entry.id === cutout.serviceId);
      if (index < 0) continue;
      const service = result[index];
      const billed = service.billingUnit === 'FIXED' ? 1 : service.billingUnit === 'SQUARE_METER' ? (cutout.lengthMm ?? 0) * (cutout.widthMm ?? 0) * cutout.quantity / 1_000_000 : cutout.quantity;
      if (billed > 0) result[index] = { ...service, currentPrice: Number(cutout.calculatedSubtotal) / billed };
    }
    return result;
  };
  const item = items[activeIndex] ?? items[0];
  const activeServices = servicesFor(item);
  const drawingServices = editingQuote ? activeServices.filter((service) => service.billingUnit === 'LINEAR_METER') : linearServices;
  const drawingComponents = useDeferredValue(item.components);
  const drawingCutouts = useDeferredValue(item.cutouts);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const edgeCalculatedSubtotal = (draft: DraftItem, component: DraftComponent, edge: DraftEdge) => {
    const material = materialFor(draft);
    const savedEdge = snapshotFor(draft)?.components.flatMap((component) => component.edges).find((row) => row.id === edge.id && row.serviceId === edge.serviceId);
    const currentService = catalog?.services.find((entry) => entry.id === edge.serviceId);
    const service = savedEdge ? { ...currentService, name: savedEdge.serviceNameSnapshot, currentPrice: Number(savedEdge.unitPriceSnapshot) } : currentService;
    const lengthCm = edge.lengthCm ? decimal(edge.lengthCm) : edge.side === 'FRONT' || edge.side === 'BACK' ? decimal(component.lengthCm) : decimal(component.widthCm);
    if (!material || !service || lengthCm <= 0) return 0;
    const isSkirt = service.name.toLocaleLowerCase('pt-BR') === 'saia';
    const billedQuantity = isSkirt ? lengthCm * decimal(edge.heightCm ?? '') * component.quantity * edge.quantity / 10_000 : lengthCm * component.quantity * edge.quantity / 100;
    return billedQuantity > 0 ? calculateLine({ billingUnit: isSkirt ? 'SQUARE_METER' : 'LINEAR_METER', unitPrice: isSkirt ? material.currentPrice : service.currentPrice, billedQuantity }).subtotal : 0;
  };
  const componentCalculatedTotal = (draft: DraftItem, component: DraftComponent) => {
    const material = materialFor(draft);
    const calculated = calculateDraftComponent(component);
    if (!calculated || !material) return 0;
    const materialValue = calculateLine({ billingUnit: material.billingUnit, unitPrice: material.currentPrice, billedQuantity: calculated.billableArea }).subtotal;
    const edgeValue = component.edges.reduce((sum, edge) => sum + edgeCalculatedSubtotal(draft, component, edge), 0);
    return Math.round((materialValue + edgeValue) * 100) / 100;
  };
  const componentAppliedTotal = (draft: DraftItem, component: DraftComponent) => {
    const edges = component.edges.map((edge) => ({ calculatedSubtotal: edgeCalculatedSubtotal(draft, component, edge), appliedSubtotal: edge.appliedTotal === undefined ? undefined : currencyDecimal(edge.appliedTotal) }));
    const materialSubtotal = componentCalculatedTotal(draft, component) - edges.reduce((sum, edge) => sum + edge.calculatedSubtotal, 0);
    return appliedComponentValue(materialSubtotal, edges, component.appliedTotal === undefined ? undefined : currencyDecimal(component.appliedTotal));
  };
  const cutoutCalculatedSubtotal = (draft: DraftItem, cutout: DraftItem['cutouts'][number]) => {
    const savedCutout = snapshotFor(draft)?.cutouts.find((row) => row.id === cutout.id && row.serviceId === cutout.serviceId);
    const currentService = catalog?.services.find((entry) => entry.id === cutout.serviceId);
    const service = savedCutout?.billingUnitSnapshot && savedCutout.unitPriceSnapshot != null ? { billingUnit: savedCutout.billingUnitSnapshot, currentPrice: Number(savedCutout.unitPriceSnapshot) }
      : savedCutout ? servicesFor(draft).find((entry) => entry.id === cutout.serviceId) : currentService;
    if (!service) return 0;
    const quantity = service.billingUnit === 'SQUARE_METER'
      ? decimal(cutout.lengthCm ?? '') / 100 * (decimal(cutout.widthCm ?? '') / 100) * cutout.quantity
      : service.billingUnit === 'FIXED' ? 1 : cutout.quantity;
    return quantity > 0 ? calculateLine({ billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0;
  };
  const itemSummary = (draft: DraftItem) => {
    const material = materialFor(draft);
    const components = draft.components.map(calculateDraftComponent).filter(Boolean) as ReturnType<typeof calculateComponent>[];
    const measuredArea = components.length ? aggregateComponentArea(components) : 0;
    const area = draft.calculationMode === 'MANUAL_M2' ? decimal(draft.manualM2) : measuredArea;
    const materialSubtotal = material ? calculateLine({ billingUnit: material.billingUnit, unitPrice: material.currentPrice, billedQuantity: area }).subtotal : 0;
    const directServices = servicesFor(draft).filter((service) => draft.serviceIds.includes(service.id)).reduce((sum, service) => {
      const quantity = service.billingUnit === 'SQUARE_METER' ? area : service.billingUnit === 'FIXED' ? 1 : decimal(draft.serviceQuantities[service.id] ?? '');
      const calculated = quantity > 0 ? calculateLine({ billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0;
      return sum + (draft.serviceAppliedValues[service.id] === undefined ? calculated : currencyDecimal(draft.serviceAppliedValues[service.id]));
    }, 0);
    const calculatedComponents = draft.components.reduce((sum, component) => sum + componentCalculatedTotal(draft, component), 0);
    const calculatedEdges = draft.components.reduce((sum, component) => sum + Math.max(0, componentCalculatedTotal(draft, component) - (calculateDraftComponent(component)?.billableArea ?? 0) * (material?.currentPrice ?? 0)), 0);
    const componentTotal = draft.calculationMode === 'MANUAL_M2' ? materialSubtotal : draft.components.reduce((sum, component) => sum + componentAppliedTotal(draft, component), 0);
    const cutoutsTotal = draft.cutouts.reduce((sum, cutout) => sum + (cutout.appliedTotal === undefined ? cutoutCalculatedSubtotal(draft, cutout) : currencyDecimal(cutout.appliedTotal)), 0);
    const saved = snapshotFor(draft);
    const financialDraft = (value: DraftItem) => JSON.stringify({ ...value, projectName: '', environment: '' });
    const unchanged = saved && financialDraft(draft) === financialDraft(savedItemDraft(saved));
    return { area, materialSubtotal, servicesSubtotal: directServices + calculatedEdges + cutoutsTotal, calculatedComponents, total: unchanged ? Number(saved.total) : componentTotal + directServices + cutoutsTotal };
  };
  const summaries = useMemo(() => items.map(itemSummary), [items, catalog, editingQuote]);
  const gross = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const discountValue = currencyDecimal(discount);
  const total = calculateQuoteTotal(summaries.map((summary) => summary.total), Math.min(discountValue, gross));
  const updateItem = (patch: Partial<DraftItem>) => setItems((current) => current.map((entry, index) => index === activeIndex ? { ...entry, ...patch } : entry));
  const selectedMaterial = materialFor(item);

  const selectCustomer = (entry: Customer) => { setCustomer(entry); setEditingCustomerId(null); setCustomerMode(null); setCustomerForm({ name: entry.name, phone: entry.phone, document: entry.document ?? '', email: entry.email ?? '', address: entry.address ?? '', neighborhood: entry.neighborhood ?? '', city: entry.city ?? '', postalCode: entry.postalCode ?? '', complement: entry.complement ?? '', notes: entry.notes ?? '' }); setCustomerSearch(''); setCustomers([]); };
  const openCustomerSearch = () => { setCustomer(null); setEditingCustomerId(null); setCustomerMode('EXISTING'); setCustomerSearch(''); setCustomers([]); };
  const openNewCustomer = () => { setCustomer(null); setEditingCustomerId(null); setCustomerMode('NEW'); setCustomerForm({ name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' }); };
  const editCustomer = () => { if (!customer) return; selectCustomer(customer); setEditingCustomerId(customer.id); setCustomerMode('NEW'); };
  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    try { const payload = Object.fromEntries(Object.entries(customerForm).map(([key, value]) => [key, value || null])); const saved = editingCustomerId ? await api<Customer>('/customers/' + editingCustomerId, { method: 'PATCH', body: JSON.stringify(payload) }) : await api<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) }); selectCustomer(saved); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.'); }
  }
  function duplicateItem() {
    const copy = { ...item, id: newId(), components: item.components.map((component) => ({ ...component, id: newId(), label: `${component.label} (cópia)`, edges: component.edges.map((edge) => ({ ...edge })) })), cutouts: item.cutouts.map((cutout) => ({ ...cutout, id: newId() })), serviceIds: [...item.serviceIds], serviceQuantities: { ...item.serviceQuantities }, serviceAppliedValues: { ...item.serviceAppliedValues } };
    setItems((current) => [...current, copy]); setActiveIndex(items.length);
  }
  function addItem() { setItems((current) => [...current, { ...newItem(), productTypeId: catalog?.productTypes[0]?.id ?? '' }]); setActiveIndex(items.length); }
  function removeItem(index: number) {
    if (items.length === 1) { setError('O orçamento deve manter pelo menos um projeto.'); return; }
    if (!window.confirm(`Excluir o Projeto ${index + 1}?`)) return;
    setItems((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setActiveIndex((current) => current > index ? current - 1 : Math.min(current, items.length - 2));
  }
  async function saveQuote() {
    const invalid = !customer || items.some((draft) => !draft.productTypeId || !draft.materialId || (draft.calculationMode === 'DIMENSIONS' && (!draft.components.length || !draft.components.every((component) => Boolean(calculateDraftComponent(component)))) ) || (draft.calculationMode === 'MANUAL_M2' && (!isSuperAdmin || decimal(draft.manualM2) <= 0 || !draft.manualJustification.trim())));
    if (invalid) { setError('Selecione cliente, peça, material e preencha medidas válidas. M² manual exige Super Admin e justificativa.'); return; }
    if (parentQuote && parentQuote.customerId !== customer.id) { setError('O complemento deve usar o cliente do orçamento vinculado.'); return; }
    if (editingQuote?.status === 'APPROVED' && !window.confirm('Salvar alterações neste orçamento aprovado? Confira os valores e as medidas antes de confirmar.')) return;
    setSaving(true);
    try {
      const payload = { customerId: customer.id, parentQuoteId: parentQuote?.id, expectedUpdatedAt: editingQuote?.updatedAt, notes: editingQuote?.notes, validUntil: validUntil || null, discountAmount: discountValue, items: items.map((draft) => draftItemInput(draft, snapshotFor(draft))) };
      (payload.items as Array<{ projectName?: string | null; environment?: string | null }>).forEach((entry, index) => { entry.projectName = items[index].projectName.trim() || null; entry.environment = items[index].environment.trim() || null; });
      const saved = await api<{ id: string }>(quoteId ? `/quotes/${quoteId}` : '/quotes', { method: quoteId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (!quoteId) await api(`/quotes/${saved.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SENT' }) });
      savedRef.current = true; localStorage.removeItem(quoteDraftStorageKey); window.location.href = '/orcamentos';
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o orçamento.'); } finally { setSaving(false); }
  }
  const updateAppliedComponentValue = (componentIndex: number, value: string) => updateItem({ components: item.components.map((component, index) => index === componentIndex ? { ...component, appliedTotal: value } : component) });
  const restoreComponentValue = (componentIndex: number) => updateItem({ components: item.components.map((component, index) => index === componentIndex ? { ...component, appliedTotal: undefined } : component) });
  const shownMaterials = (catalog?.materials ?? []).filter((entry) => entry.name.toLocaleLowerCase('pt-BR').includes(materialSearch.toLocaleLowerCase('pt-BR')));
  if (quoteId && !editingQuote) return <main className="shell"><Link href="/orcamentos">← Orçamentos</Link><p className={error ? 'form-error' : 'empty'}>{error || 'Abrindo orçamento para edição…'}</p></main>;
  if (!catalog) return <main className="shell"><p className="empty">{error || 'Carregando catálogo…'}</p></main>;

  return <main className="shell">
    <section className="intro"><p className="eyebrow">NOVO PROJETO</p><h1>{editingQuote ? `Editar ${editingQuote.number}` : 'Novo Projeto'}</h1><p>Configure o projeto e calcule o orçamento automaticamente.</p><StatusLegend /></section>{error && <p className="form-error">{error}</p>}
    <div className="quote-workspace"><div className="quote-form-column">
    {editingQuote && <p className="customer-help">Editando o orçamento salvo. Os preços registrados e os ajustes manuais são preservados; novos materiais e serviços usam o catálogo atual. <Link href={`/orcamentos/${quoteId}`} onClick={() => { savedRef.current = true; localStorage.removeItem(quoteDraftStorageKey); }}>Cancelar edição</Link></p>}
    <section className="customer-section">
      <div className="customer-section-heading">
        <div><span>CLIENTE</span><h2>{customer ? 'Cliente selecionado' : 'Selecione o cliente'}</h2>{!customer && <p>Escolha um cliente existente ou cadastre um novo.</p>}</div>
        {customer ? <div className="customer-section-actions"><button type="button" className="text-button" onClick={editCustomer}>Editar</button><button type="button" className="secondary-button" onClick={openCustomerSearch}>Trocar cliente</button></div> : <div className="customer-section-actions"><button type="button" className="secondary-button" onClick={openNewCustomer}>Novo cliente</button><button type="button" className="primary-compact-button" onClick={openCustomerSearch}>Cliente existente</button></div>}
      </div>
      {customer && !editingCustomerId ? <div className="selected-customer"><div className="person-icon">◉</div><div><strong>{customer.name}</strong><small>{customer.phone}{customer.address ? ` · ${customer.address}` : ''}</small></div></div> : customerMode === 'NEW' ? <><form className="inline-form customer-form" onSubmit={saveCustomer}>
        <input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Nome" required />
        <input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} placeholder="Telefone" required />
        <input value={customerForm.document} onChange={(event) => setCustomerForm({ ...customerForm, document: event.target.value })} placeholder="CPF (opcional)" />
        <input value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="E-mail" />
        <input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} placeholder="Endereço / obra" />
        <input value={customerForm.neighborhood} onChange={(event) => setCustomerForm({ ...customerForm, neighborhood: event.target.value })} placeholder="Bairro" />
        <input value={customerForm.city} onChange={(event) => setCustomerForm({ ...customerForm, city: event.target.value })} placeholder="Cidade" />
        <input value={customerForm.postalCode} onChange={(event) => setCustomerForm({ ...customerForm, postalCode: event.target.value })} placeholder="CEP" />
        <input value={customerForm.complement} onChange={(event) => setCustomerForm({ ...customerForm, complement: event.target.value })} placeholder="Complemento" />
        <textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} placeholder="Observações" />
        <button className="primary-button">{editingCustomerId ? 'Salvar alterações' : 'Salvar e selecionar cliente'}</button>
      </form><button type="button" className="text-button customer-back" onClick={openCustomerSearch}>← Voltar para busca</button></> : <>
        <label className="customer-search-label">Buscar cliente existente<input className="search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Digite nome, telefone ou CPF" autoFocus /></label>
        {customerSearch.trim().length < 2 ? <p className="customer-help">Comece digitando para localizar um cliente cadastrado.</p> : customers.length ? <div className="customer-results">{customers.map((entry) => <button className="customer-result" key={entry.id} onClick={() => selectCustomer(entry)}><strong>{entry.name}</strong><small>{entry.phone}{entry.document ? ` · ${entry.document}` : ''}</small></button>)}</div> : <p className="customer-help">Nenhum cliente encontrado. <button type="button" className="text-button" onClick={openNewCustomer}>Cadastrar novo cliente</button></p>}
      </>}
    </section>
    <section className="project-manager">
      <div className="project-manager-header"><div><span>PROJETO</span><strong>{item.projectName || `Projeto ${activeIndex + 1}`}</strong></div><div className="project-manager-actions">{items.length > 1 && <label className="project-select-label"><span>Trocar</span><select value={activeIndex} onChange={(event) => setActiveIndex(Number(event.target.value))}>{items.map((draft, index) => <option value={index} key={draft.id}>{draft.projectName || `Projeto ${index + 1}`}</option>)}</select></label>}<button type="button" className="secondary-button" onClick={addItem}>+ Adicionar outro projeto</button></div></div>
      <label className="project-name-field"><span>Nome deste projeto</span><input id="project-name" value={item.projectName} onChange={(event) => updateItem({ projectName: event.target.value })} placeholder="Ex.: Bancada da cozinha" /></label><div className="project-selection-grid"><details className="material-picker"><summary className="picker-summary"><span className="picker-heading"><b>Material</b><small>{selectedMaterial ? `${selectedMaterial.category} · ${money.format(selectedMaterial.currentPrice)}/${unitLabel[selectedMaterial.billingUnit].replace('por ', '')}` : 'Qual pedra será utilizada?'}</small></span><span className="picker-selection">{materialImageUrl(selectedMaterial) ? <img className="material-thumbnail" src={`/api${materialImageUrl(selectedMaterial)}`} alt="" /> : <span className="stone gray material-thumbnail" aria-hidden="true" />}<strong title={selectedMaterial?.name}>{selectedMaterial?.name || 'Selecionar material'}</strong><svg className="picker-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></summary><div className="material-picker-panel"><input className="material-search-inline" value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Buscar material" />{shownMaterials.map((entry) => <button type="button" className={`material ${entry.id === item.materialId ? 'selected' : ''}`} key={entry.id} onClick={(event) => { updateItem({ materialId: entry.id }); (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }}>{materialImageUrl(entry) ? <img className="stone material-thumbnail" src={`/api${materialImageUrl(entry)}`} alt="" /> : <span className="stone gray material-thumbnail" aria-hidden="true" />}<span className="material-name"><strong>{entry.name}</strong><small>{entry.category}</small></span><span className="material-price">{money.format(entry.currentPrice)}<small>/{unitLabel[entry.billingUnit].replace('por ', '')}</small></span></button>)}</div></details><details className="environment-picker"><summary className="picker-summary"><span className="picker-heading"><b>Ambiente</b><small>Onde será instalado?</small></span><span className="picker-selection"><strong>{item.environment || 'Selecionar ambiente'}</strong><svg className="picker-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></summary><div className="environment-picker-panel">{environments.map((environment) => <button type="button" className={item.environment === environment ? 'selected' : ''} key={environment} onClick={(event) => { updateItem({ environment }); (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }}>{environment}</button>)}</div></details></div>
      {items.length > 1 && <button type="button" className="remove-project" onClick={() => removeItem(activeIndex)}>Excluir este projeto</button>}
    </section>
    <section className="section measurements-card"><div className="section-heading"><h2>Componentes e medidas</h2><span>em centímetros</span></div><label className="calculation-mode"><input type="radio" checked={item.calculationMode === 'DIMENSIONS'} onChange={() => updateItem({ calculationMode: 'DIMENSIONS' })} /> Calcular pelas medidas</label>{isSuperAdmin && <label className="calculation-mode"><input type="radio" checked={item.calculationMode === 'MANUAL_M2'} onChange={() => updateItem({ calculationMode: 'MANUAL_M2' })} /> M² manual (auditável)</label>}{item.calculationMode === 'MANUAL_M2' ? <div className="inline-form"><input inputMode="decimal" value={item.manualM2} onChange={(event) => updateItem({ manualM2: event.target.value })} placeholder="Área em m²" /><input value={item.manualJustification} onChange={(event) => updateItem({ manualJustification: event.target.value })} placeholder="Justificativa obrigatória" /></div> : <ComponentEditor components={item.components} linearServices={drawingServices} onChange={(components) => updateItem({ components })} onAdd={(type) => updateItem({ components: [...item.components, blankComponent(type)] })} onRemove={(index) => item.components.length > 1 && updateItem({ components: item.components.filter((_, current) => current !== index), cutouts: item.cutouts.map((cutout) => ({ ...cutout, componentIndex: cutout.componentIndex === index ? undefined : cutout.componentIndex !== undefined && cutout.componentIndex > index ? cutout.componentIndex - 1 : cutout.componentIndex })) })} onAddCutout={(componentIndex) => updateItem({ cutouts: [...item.cutouts, { id: newId(), componentIndex, cutoutType: 'SINK', label: 'Recorte / cuba', quantity: 1 }] })} />}<p className="component-hint">A opção “Saia” em acabamentos usa comprimento × altura × valor do material por m².</p><div className="partial"><span>Área total da pedra</span><strong>{summaries[activeIndex].area.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m²</strong><span>Material</span><strong>{money.format(summaries[activeIndex].materialSubtotal)}</strong></div></section>
    <QuoteExtras calculateCutout={(cutout) => cutoutCalculatedSubtotal(item, cutout)} cutouts={item.cutouts} components={item.components} services={activeServices} serviceIds={item.serviceIds} serviceQuantities={item.serviceQuantities} serviceAppliedValues={item.serviceAppliedValues} onChange={(patch) => updateItem(patch)} />
    <section className="section quote-values"><div className="section-heading"><h2>Valores do orçamento</h2><span>revisão interna</span></div>{item.components.map((component, componentIndex) => { const calculated = componentCalculatedTotal(item, component); const applied = componentAppliedTotal(item, component); const difference = calculated - applied; const changed = component.appliedTotal !== undefined; return <article className="quote-value-row" key={component.id}><div><strong>{component.label || `Componente ${componentIndex + 1}`}</strong><small>Valor calculado: {money.format(calculated)}</small>{changed && Math.abs(difference) > 0.005 && <small className="manual-warning">⚠ Cálculo atualizado; valor manual aplicado.</small>}</div><label><span>Valor final</span><input inputMode="decimal" value={component.appliedTotal ?? applied.toFixed(2).replace('.', ',')} onChange={(event) => updateAppliedComponentValue(componentIndex, event.target.value)} /></label><div className="quote-value-discount">Desconto: <strong>{money.format(Math.max(0, difference))}</strong>{changed && <button type="button" className="text-button" onClick={() => restoreComponentValue(componentIndex)}>Restaurar cálculo</button>}</div></article>; })}{item.components.flatMap((component) => component.edges.map((edge) => ({ component, edge }))).map(({ component, edge }) => { const service = activeServices.find((entry) => entry.id === edge.serviceId); const calculated = edgeCalculatedSubtotal(item, component, edge); const applied = edge.appliedTotal === undefined ? calculated : currencyDecimal(edge.appliedTotal); const difference = calculated - applied; return <article className="quote-value-row" key={`${component.id}-${edge.side}`}><div><strong>{service?.name ?? 'Acabamento'} · {component.label} · {edge.side}</strong><small>Valor calculado: {money.format(calculated)}</small></div><label><span>Valor final</span><input inputMode="decimal" value={edge.appliedTotal ?? calculated.toFixed(2).replace('.', ',')} onChange={(event) => updateItem({ components: item.components.map((entry) => entry.id === component.id ? { ...entry, edges: entry.edges.map((current) => current === edge ? { ...current, appliedTotal: event.target.value } : current) } : entry) })} /></label><div className="quote-value-discount">Desconto: <strong>{money.format(Math.max(0, difference))}</strong>{edge.appliedTotal !== undefined && <button type="button" className="text-button" onClick={() => updateItem({ components: item.components.map((entry) => entry.id === component.id ? { ...entry, edges: entry.edges.map((current) => current === edge ? { ...current, appliedTotal: undefined } : current) } : entry) })}>Restaurar cálculo</button>}</div></article>; })}{item.serviceIds.map((serviceId) => { const service = activeServices.find((entry) => entry.id === serviceId); if (!service) return null; const quantity = service.billingUnit === 'SQUARE_METER' ? summaries[activeIndex].area : service.billingUnit === 'FIXED' ? 1 : decimal(item.serviceQuantities[service.id] ?? ''); const calculated = quantity > 0 ? calculateLine({ billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0; const applied = item.serviceAppliedValues[service.id] === undefined ? calculated : currencyDecimal(item.serviceAppliedValues[service.id]); const difference = calculated - applied; return <article className="quote-value-row" key={`service-${service.id}`}><div><strong>{service.name}</strong><small>Valor calculado: {money.format(calculated)}</small></div><label><span>Valor final</span><input inputMode="decimal" value={item.serviceAppliedValues[service.id] ?? calculated.toFixed(2).replace('.', ',')} onChange={(event) => updateItem({ serviceAppliedValues: { ...item.serviceAppliedValues, [service.id]: event.target.value } })} /></label><div className="quote-value-discount">Desconto: <strong>{money.format(Math.max(0, difference))}</strong>{item.serviceAppliedValues[service.id] !== undefined && <button type="button" className="text-button" onClick={() => { const values = { ...item.serviceAppliedValues }; delete values[service.id]; updateItem({ serviceAppliedValues: values }); }}>Restaurar cálculo</button>}</div></article>; })}<div className="quote-values-total"><span>Subtotal calculado</span><strong>{money.format(item.components.reduce((sum, component) => sum + componentCalculatedTotal(item, component), 0))}</strong><span>Descontos individuais</span><strong>{money.format(item.components.reduce((sum, component) => sum + Math.max(0, componentCalculatedTotal(item, component) - componentAppliedTotal(item, component)), 0))}</strong><span>Total deste item</span><strong>{money.format(summaries[activeIndex]?.total ?? 0)}</strong></div></section>
    <section className="section"><div className="section-heading"><h2>Desenho técnico 2D</h2><span>referência visual</span></div><TechnicalDrawing components={drawingComponents} cutouts={drawingCutouts} materialName={selectedMaterial?.name} linearServices={drawingServices} /></section>
    <section className="section discount"><label htmlFor="discount">Desconto autorizado</label><div><span>R$</span><input id="discount" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div></section>
    </div>
    <aside className="quote-summary-card"><div className="quote-visual-card"><p>Projetos únicos<br />para espaços<br />incríveis.</p><i /></div><strong>Resumo do orçamento</strong><span>Projetos adicionados <b>{items.length}</b></span><span>Área total <b>{summaries.reduce((sum, entry) => sum + entry.area, 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²</b></span><span>Valor estimado <b>{money.format(total)}</b></span><label className="quote-validity-field">Validade do orçamento<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>{!quoteId && <QuoteLinker value={parentQuote} onChange={(quote) => { setParentQuote(quote); if (quote) selectCustomer(quote.customer); }} />}<small className="quote-summary-note">Os valores são estimativas e podem variar conforme o material, acabamento e complexidade.</small><div className="quote-summary-actions"><button type="button" className="save-quote-button" onClick={saveQuote} disabled={saving}>{saving ? 'Salvando…' : 'Salvar orçamento'}</button></div></aside>
    </div>
  </main>;
}
