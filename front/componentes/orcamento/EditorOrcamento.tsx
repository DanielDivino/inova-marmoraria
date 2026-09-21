'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { rotuloLadoBorda, valorAplicadoComponente, podeEditarOrcamento, type SavedQuoteItem, somarAreasComponentes, calcularComponente, calcularLinha, calcularLinhaServico, calcularTotalOrcamento, centimetrosParaMilimetros, acabamentoBordaPedra, calcularAcabamentoBorda } from '@inova/domain';
import { SeletorMaterialComponente } from './ComponentMaterialPicker';
import { CartaoMaterialSelecionado } from './SelectedMaterialCard';
import { EditorComponentes } from './ComponentEditor';
import { ValoresRecortes } from './CutoutValues';
import { DesenhoTecnico } from './TechnicalDrawing';
import { ComplementosOrcamento } from './QuoteExtras';
import type { ComponentType, DraftComponent, DraftEdge, DraftItem } from './types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { rascunhoParaEntradaItem, itemSalvoParaRascunho } from '../../utilitarios/saved-quote';
import { removerGrupoComponentes, restaurarNomesComponentes } from '../../utilitarios/component-groups';
import { VincularOrcamento, type QuoteLink } from './QuoteLinker';
import { api } from '../../utilitarios/api';
import { TituloEtapaProjeto } from './ProjectStageHeading';
import '../../app/project-builder.css';
import { useSession } from '../ApplicationShell';
import { EtapasProjeto } from './ProjectStepper';
import { calcularTotalPix, projetoTemDesenho, dadosEntradaProjeto, modoEntradaOrcamento, type QuoteEntryMode } from '@inova/domain';
import { EditorOrcamentoRapido } from './QuickQuoteEditor';
import { aplicarMaterialProjeto, arredondarMedidaParaCima, medidasEfetivasPeitorilDuplo, prepararItemRapido } from '../../utilitarios/quick-quote';
import './quick-quote.css';

type BillingUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';
type MaterialImage = { id: string; url: string; alt?: string | null; isPrimary: boolean };
type Material = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; images?: MaterialImage[] };
type Service = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number };
type ProductType = { id: string; name: string };
type Customer = { id: string; name: string; phone: string; document?: string | null; email?: string | null; address?: string | null; neighborhood?: string | null; city?: string | null; postalCode?: string | null; complement?: string | null; notes?: string | null };
type Catalog = { materials: Material[]; services: Service[]; productTypes: ProductType[] };
type ClientWorkspace = { id: string; customer: Customer | null; items: DraftItem[]; activeIndex: number; discount: string; validUntil: string; notes: string; parentQuote: QuoteLink | null };

const projetoPreenchido = (project: DraftItem) => !!project.projectName.trim() || !!project.materialId || !!project.manualM2 || !!project.manualJustification || project.components.length > 1 || project.cutouts.length > 0 || project.serviceIds.length > 0 || project.components.some(component => !!component.label.trim() || !!component.materialId || !!component.lengthCm || !!component.widthCm || component.quantity !== 1 || component.componentType !== 'TOP' || component.edges.length > 0 || component.appliedTotal !== undefined);

import { formatarMoeda } from '../../utilitarios/formatadores';
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const decimal = (value: string) => Number(value.replace(',', '.')) || 0;
const currencyDecimal = (value: string) => { const normalized = value.trim(); if (!normalized) return 0; return Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized) || 0; };
const billedServiceQuantity = (service: Pick<Service, 'id' | 'name' | 'billingUnit'>, area: number, quantities: DraftItem['serviceQuantities']) => service.billingUnit === 'SQUARE_METER' ? area * (/rebaixo italiano/i.test(service.name) ? decimal(quantities[service.id] ?? '1') : 1) : service.billingUnit === 'FIXED' ? 1 : decimal(quantities[service.id] ?? '1');
const catalogCacheKey = 'inova_catalog_cache_v4';
const catalogCacheTtlMs = 60_000;
const legacyQuoteDraftStorageKey = 'inova_quote_draft_v2';
const componentSummaryLabels: Record<ComponentType, string> = { TOP: 'Bancada', COUNTER: 'Bancada', BASE: 'Base', VISTA: 'Vista', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', SIDE_LEFT: 'Lateral esquerda', SIDE_RIGHT: 'Lateral direita', SILL: 'Peitoril', THRESHOLD: 'Soleira', STEP: 'Degrau', OTHER: 'Componente' };
const blankComponent = (componentType: ComponentType): DraftComponent => ({ id: newId(), label: '', componentType, orientation: ['TOP', 'COUNTER', 'BASE', 'VISTA', 'SILL', 'THRESHOLD', 'STEP'].includes(componentType) ? 'HORIZONTAL' : 'VERTICAL', lengthCm: '', widthCm: '', quantity: 1, edges: [] });
// Orçamentos novos começam no modo rápido; o usuário pode mudar para o
// detalhado a qualquer momento sem criar outro orçamento.
const newItem = (): DraftItem => ({ id: newId(), projectName: '', productTypeId: '', materialId: '', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [blankComponent('TOP')], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, drawingData: dadosEntradaProjeto(undefined, 'QUICK') });
const newClientWorkspace = (): ClientWorkspace => ({ id: newId(), customer: null, items: [newItem()], activeIndex: 0, discount: '0', validUntil: '', notes: '', parentQuote: null });
// roundUp (Orçamento Rápido, "M² fechado") só afeta o m² usado para calcular o
// valor do material — as medidas exibidas, o desenho técnico e o que é salvo no
// orçamento/PDF sempre usam component.lengthCm/widthCm exatos, sem passar por aqui.
const calculateDraftComponent = (component: DraftComponent, roundUp = false) => {
  try {
    const peitorilDuplo = medidasEfetivasPeitorilDuplo(component, roundUp);
    if (peitorilDuplo) return calcularComponente({ label: component.label, componentType: component.componentType, orientation: component.orientation, lengthMm: peitorilDuplo.lengthMm, widthMm: peitorilDuplo.widthMm, quantity: component.quantity });
    return calcularComponente({ label: component.label, componentType: component.componentType, orientation: component.orientation, lengthMm: centimetrosParaMilimetros(roundUp ? arredondarMedidaParaCima(component.lengthCm) : component.lengthCm), widthMm: centimetrosParaMilimetros(roundUp ? arredondarMedidaParaCima(component.widthCm) : component.widthCm), quantity: component.quantity });
  } catch { return null; }
};

type EditingQuote = { id: string; number: string; status: string; executionStatus: string; updatedAt: string; customer: Customer; customerId: string; items: SavedQuoteItem[]; discountAmount: number; validUntil?: string | null; notes?: string | null; parentQuote?: { id: string; number: string } | null };
export default function EditorOrcamento() {
  const { id: quoteId } = useParams<{ id?: string }>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const currentUser = useSession();
  const quoteDraftStorageKey = `${legacyQuoteDraftStorageKey}:${currentUser?.id}${quoteId ? `:edit:${quoteId}` : ''}`;
  const [editingQuote, setEditingQuote] = useState<EditingQuote | null>(null);
  const [workspaces, setWorkspaces] = useState<ClientWorkspace[]>(() => [newClientWorkspace()]);
  const [activeClientIndex, setActiveClientIndex] = useState(0);
  const [error, setError] = useState('');
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING' | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' });
  const [materialComponentId, setMaterialComponentId] = useState<string | null>(null);
  const [summarySelection, setSummarySelection] = useState<number | 'TOTAL'>(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [reviewedSteps, setReviewedSteps] = useState<number[]>([]);
  const [headerTabsTarget, setHeaderTabsTarget] = useState<HTMLElement | null>(null);
  const navigateStep = (step: number) => {
    setCurrentStep(step);
    window.setTimeout(() => {
      const target = document.getElementById(`project-step-${step}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.focus({ preventScroll: true });
    }, 0);
  };
  const nextStep = () => {
    if (currentStep >= 2) setReviewedSteps((steps) => [...new Set([...steps, currentStep])]);
    navigateStep(Math.min(currentStep + 1, 3));
  };
  const [saving, setSaving] = useState(false);
  const [pdfIndividualPrices, setPdfIndividualPrices] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [componentNamesVersion, setComponentNamesVersion] = useState(0);
  const savedRef = useRef(false);
  const latestDraft = useRef<string>('');
  useEffect(() => { setHeaderTabsTarget(document.getElementById('application-header-tabs')); }, []);
  const linearServices = useMemo(() => catalog?.services.filter((service) => service.billingUnit === 'LINEAR_METER') ?? [], [catalog]);
  const workspace = workspaces[activeClientIndex] ?? workspaces[0];
  const customer = workspace.customer;
  const items = workspace.items;
  const activeIndex = workspace.activeIndex;
  const discount = workspace.discount;
  const validUntil = workspace.validUntil;
  const notes = workspace.notes;
  const parentQuote = workspace.parentQuote;
  const setWorkspaceValue = <K extends keyof ClientWorkspace>(key: K, value: SetStateAction<ClientWorkspace[K]>) => setWorkspaces(current => current.map(entry => entry.id === workspace.id ? { ...entry, [key]: typeof value === 'function' ? (value as (current: ClientWorkspace[K]) => ClientWorkspace[K])(entry[key]) : value } : entry));
  const setCustomer = (value: Customer | null | ((current: Customer | null) => Customer | null)) => setWorkspaceValue('customer', value);
  const setItems = (value: SetStateAction<DraftItem[]>) => setWorkspaceValue('items', value);
  const setActiveIndex = (value: SetStateAction<number>) => setWorkspaceValue('activeIndex', value);
  const setDiscount = (value: string | ((current: string) => string)) => setWorkspaceValue('discount', value);
  const setValidUntil = (value: string | ((current: string) => string)) => setWorkspaceValue('validUntil', value);
  const setNotes = (value: string | ((current: string) => string)) => setWorkspaceValue('notes', value);
  const setParentQuote = (value: QuoteLink | null | ((current: QuoteLink | null) => QuoteLink | null)) => setWorkspaceValue('parentQuote', value);
  const createQuickService = async (input: { name: string; billingUnit: BillingUnit; currentPrice: number }): Promise<Service> => {
    const created = await api<Service>('/catalog/services', { method: 'POST', body: JSON.stringify({ ...input, category: 'Outros serviços', isActive: true }) });
    setCatalog(current => current ? { ...current, services: [...current.services, created].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')) } : current);
    return created;
  };

  useEffect(() => {
    let active = true;
    async function carregarCatalogo() {
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
    void carregarCatalogo().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (quoteId) return;
    try {
      const stored = localStorage.getItem(quoteDraftStorageKey) ?? localStorage.getItem(legacyQuoteDraftStorageKey);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<{ customer: Customer | null; customerMode: 'NEW' | 'EXISTING' | null; customerForm: typeof customerForm; items: DraftItem[]; activeIndex: number; discount: string; validUntil: string; notes: string; parentQuote: QuoteLink | null; componentNamesVersion: number; workspaces: Partial<ClientWorkspace>[]; activeClientIndex: number }>;
        const normalizeItems = (entries: DraftItem[] | undefined) => entries?.length ? restaurarNomesComponentes(entries, draft.componentNamesVersion).map((entry) => ({ ...entry, projectName: entry.projectName ?? '', components: entry.components.map(component => ({ ...component, materialId: component.materialId ?? entry.materialId })), serviceAppliedValues: entry.serviceAppliedValues ?? {} })) : [newItem()];
        if (Array.isArray(draft.workspaces) && draft.workspaces.length) {
          setWorkspaces(draft.workspaces.map((entry) => ({ ...newClientWorkspace(), ...entry, id: entry.id ?? newId(), customer: entry.customer ?? null, items: normalizeItems(entry.items), activeIndex: Math.min(Math.max(0, entry.activeIndex ?? 0), Math.max(0, (entry.items?.length ?? 1) - 1)), discount: entry.discount ?? '0', validUntil: entry.validUntil ?? '', notes: entry.notes ?? '', parentQuote: entry.parentQuote ?? null })));
          if (typeof draft.activeClientIndex === 'number') setActiveClientIndex(Math.min(Math.max(0, draft.activeClientIndex), draft.workspaces.length - 1));
        } else {
          if (Array.isArray(draft.items)) draft.items = restaurarNomesComponentes(draft.items, draft.componentNamesVersion);
          if (draft.parentQuote) setParentQuote(draft.parentQuote);
          if (draft.customer) setCustomer(draft.customer);
          if (draft.customerForm) setCustomerForm(draft.customerForm);
          if (Array.isArray(draft.items) && draft.items.length) setItems(normalizeItems(draft.items));
          if (typeof draft.activeIndex === 'number') setActiveIndex(Math.min(Math.max(0, draft.activeIndex), Math.max(0, (draft.items?.length ?? 1) - 1)));
          if (typeof draft.discount === 'string') setDiscount(draft.discount);
          if (typeof draft.validUntil === 'string') setValidUntil(draft.validUntil);
          if (typeof draft.notes === 'string') setNotes(draft.notes);
        }
        localStorage.setItem(quoteDraftStorageKey, JSON.stringify({ ...draft, componentNamesVersion: 1 }));
        localStorage.removeItem(legacyQuoteDraftStorageKey);
      }
    } catch { localStorage.removeItem(quoteDraftStorageKey); }
    setComponentNamesVersion(1);
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
  }, [quoteDraftStorageKey, draftHydrated, workspaces, activeClientIndex, customerMode, customerForm, componentNamesVersion]);
  latestDraft.current = JSON.stringify({ customer, customerMode, customerForm, items, activeIndex, discount, validUntil, notes, parentQuote, componentNamesVersion, workspaces, activeClientIndex, expectedUpdatedAt: editingQuote?.updatedAt });
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
        if (!podeEditarOrcamento(quote)) throw new Error('Este orçamento está encerrado. Crie um complemento ou reabra como retrabalho.');
        setEditingQuote(quote); setCustomer(quote.customer); setCustomerMode(null);
        setItems(quote.items.map(itemSalvoParaRascunho)); setDiscount(String(quote.discountAmount)); setValidUntil(quote.validUntil?.slice(0, 10) ?? '');
        setNotes(quote.notes ?? '');
        try {
          const stored = JSON.parse(localStorage.getItem(quoteDraftStorageKey) || 'null');
          if (stored?.expectedUpdatedAt === quote.updatedAt && stored.items?.length) {
            setItems(stored.items.map((entry: DraftItem) => ({ ...entry, components: entry.components.map(component => ({ ...component, materialId: component.materialId ?? entry.materialId })) }))); setDiscount(stored.discount); setValidUntil(stored.validUntil);
            if (typeof stored.notes === 'string') setNotes(stored.notes);
            if (stored.customer) setCustomer(stored.customer);
          }
        } catch {}
        const detailId = new URLSearchParams(window.location.search).get('detail');
        if (detailId) {
          const index = quote.items.findIndex(entry => entry.id === detailId);
          if (index >= 0) {
            setItems(current => current.map((entry, i) => i === index ? { ...entry, drawingData: dadosEntradaProjeto(entry.drawingData, 'DETAILED') } : entry));
            setActiveIndex(index); setCurrentStep(3);
          }
        }
        setComponentNamesVersion(1);
        setDraftHydrated(true);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a edição.'); });
    } else {
      const parent = new URLSearchParams(window.location.search).get('parent');
      if (parent) api<QuoteLink>(`/quotes/${parent}`, { signal: controller.signal }).then((quote) => { setParentQuote(quote); setCustomer(quote.customer); setCustomerMode(null); }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    }
    return () => controller.abort();
  }, [quoteId]);
  const snapshotFor = (draft: DraftItem) => editingQuote?.items.find((saved) => saved.id === draft.id);
  const materialFor = (draft: DraftItem, component?: DraftComponent): Material | undefined => {
    const saved = snapshotFor(draft);
    const id = component?.materialId || draft.materialId;
    const current = catalog?.materials.find(entry => entry.id === id);
    const savedComponent = component && saved?.components.find(entry => entry.id === component.id);
    if (savedComponent && (savedComponent.materialId ?? saved?.materialId) === id) return { ...current, id, name: savedComponent.materialNameSnapshot ?? saved!.materialNameSnapshot, category: current?.category ?? 'Material do orçamento', billingUnit: savedComponent.billingUnitSnapshot ?? saved!.billingUnitSnapshot, currentPrice: Number(savedComponent.unitPriceSnapshot ?? saved!.unitPriceSnapshot) };
    if (!component && saved?.materialId === id) return { ...current, id, name: saved.materialNameSnapshot, category: current?.category ?? 'Material do orçamento', billingUnit: saved.billingUnitSnapshot, currentPrice: Number(saved.unitPriceSnapshot) };
    return current;
  };
  const servicesFor = (draft: DraftItem): Service[] => {
    const saved = snapshotFor(draft);
    const result = [...(catalog?.services ?? [])];
    if (!saved) return result;
    const prices = [...saved.services, ...saved.components.flatMap((component) => component.edges)];
    for (const row of prices) {
      const service = { id: row.serviceId, name: row.serviceNameSnapshot, category: result.find((entry) => entry.id === row.serviceId)?.category ?? 'Preço deste orçamento', billingUnit: acabamentoBordaPedra(row.serviceNameSnapshot) ? 'LINEAR_METER' as const : row.billingUnitSnapshot, currentPrice: Number(row.unitPriceSnapshot) };
      const index = result.findIndex((entry) => entry.id === row.serviceId);
      if (index >= 0) result[index] = service; else result.push(service);
    }
    for (const cutout of saved.cutouts) {
      if (prices.some((row) => row.serviceId === cutout.serviceId)) continue;
      if (cutout.serviceId && cutout.billingUnitSnapshot && cutout.unitPriceSnapshot != null) {
        const index = result.findIndex((entry) => entry.id === cutout.serviceId);
        const savedService = { id: cutout.serviceId, name: cutout.serviceNameSnapshot ?? 'Recorte / cuba', category: result[index]?.category ?? 'Recortes e cubas', billingUnit: cutout.billingUnitSnapshot, currentPrice: Number(cutout.unitPriceSnapshot) };
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
  const quickMode = modoEntradaOrcamento(item.drawingData) === 'QUICK';
  const materialComponent = item.components.find(component => component.id === materialComponentId) ?? item.components[0];
  const activeServices = servicesFor(item);
  const drawingServices = editingQuote ? activeServices.filter((service) => service.billingUnit === 'LINEAR_METER') : linearServices;
  const drawingComponents = useDeferredValue(item.components);
  const drawingCutouts = useDeferredValue(item.cutouts);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const completedSteps = [(item.calculationMode === 'MANUAL_M2' ? !!materialFor(item) && decimal(item.manualM2) > 0 && !!item.manualJustification.trim() : item.components.length > 0 && item.components.every(component => !!materialFor(item, component) && !!calculateDraftComponent(component, item.arredondarM2))) ? 1 : 0, ...reviewedSteps].filter(Boolean);
  const edgeCalculatedSubtotal = (draft: DraftItem, component: DraftComponent, edge: DraftEdge) => {
    const material = materialFor(draft, component);
    const savedEdge = snapshotFor(draft)?.components.flatMap((component) => component.edges).find((row) => row.id === edge.id && row.serviceId === edge.serviceId);
    const currentService = catalog?.services.find((entry) => entry.id === edge.serviceId);
    const service = savedEdge ? { ...currentService, name: savedEdge.serviceNameSnapshot, currentPrice: Number(savedEdge.unitPriceSnapshot) } : currentService;
    const lengthCm = edge.lengthCm ? decimal(edge.lengthCm) : edge.side === 'FRONT' || edge.side === 'BACK' ? decimal(component.lengthCm) : decimal(component.widthCm);
    if (!material || !service || lengthCm <= 0) return 0;
    try {
      return calcularAcabamentoBorda({ name: service.name, lengthMm: centimetrosParaMilimetros(lengthCm), heightMm: acabamentoBordaPedra(service.name) ? centimetrosParaMilimetros(edge.heightCm ?? '') : undefined, quantity: component.quantity * edge.quantity, materialPrice: material.currentPrice, servicePrice: service.currentPrice }).subtotal;
    } catch { return 0; }
  };
  const componentCalculatedTotal = (draft: DraftItem, component: DraftComponent) => {
    const material = materialFor(draft, component);
    const calculated = calculateDraftComponent(component, draft.arredondarM2);
    if (!calculated || !material) return 0;
    const materialValue = calcularLinha({ billingUnit: material.billingUnit, unitPrice: material.currentPrice, billedQuantity: calculated.billableArea }).subtotal;
    const edgeValue = component.edges.reduce((sum, edge) => sum + edgeCalculatedSubtotal(draft, component, edge), 0);
    return Math.round((materialValue + edgeValue) * 100) / 100;
  };
  const componentAppliedTotal = (draft: DraftItem, component: DraftComponent) => {
    const edges = component.edges.map((edge) => ({ calculatedSubtotal: edgeCalculatedSubtotal(draft, component, edge), appliedSubtotal: edge.appliedTotal === undefined ? undefined : currencyDecimal(edge.appliedTotal) }));
    const materialSubtotal = componentCalculatedTotal(draft, component) - edges.reduce((sum, edge) => sum + edge.calculatedSubtotal, 0);
    return valorAplicadoComponente(materialSubtotal, edges, component.appliedTotal === undefined ? undefined : currencyDecimal(component.appliedTotal));
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
    return quantity > 0 ? calcularLinha({ billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0;
  };
  const itemSummary = (draft: DraftItem) => {
    const material = materialFor(draft);
    const components = draft.components.map(component => calculateDraftComponent(component, draft.arredondarM2)).filter(Boolean) as ReturnType<typeof calcularComponente>[];
    const measuredArea = components.length ? somarAreasComponentes(components) : 0;
    const area = draft.calculationMode === 'MANUAL_M2' ? decimal(draft.manualM2) : measuredArea;
    const materialSubtotal = draft.calculationMode === 'MANUAL_M2'
      ? (material ? calcularLinha({ billingUnit: material.billingUnit, unitPrice: material.currentPrice, billedQuantity: area }).subtotal : 0)
      : draft.components.reduce((sum, component) => { const selected = materialFor(draft, component); const measured = calculateDraftComponent(component, draft.arredondarM2); return sum + (selected && measured ? calcularLinha({ billingUnit: selected.billingUnit, unitPrice: selected.currentPrice, billedQuantity: measured.billableArea }).subtotal : 0); }, 0);
    let calculatedServices = 0;
    let serviceDiscounts = 0;
    const serviceBreakdown: Array<{ id: string; name: string; amount: number }> = [];
    const addServiceBreakdown = (rawName: string, amount: number) => {
      if (amount <= 0) return;
      const name = /(?:^|\D)45\s*(?:°|º|graus?)/i.test(rawName) ? 'Acabamento 45°' : rawName.trim() || 'Acabamento';
      const existing = serviceBreakdown.find((entry) => entry.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
      if (existing) existing.amount += amount;
      else serviceBreakdown.push({ id: `service-${name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-')}`, name, amount });
    };
    const draftServices = servicesFor(draft);
    const directServices = draftServices.filter((service) => draft.serviceIds.includes(service.id)).reduce((sum, service) => {
      const quantity = billedServiceQuantity(service, area, draft.serviceQuantities);
      const calculated = quantity > 0 ? calcularLinhaServico({ serviceName: service.name, billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0;
      const applied = draft.serviceAppliedValues[service.id] === undefined ? calculated : currencyDecimal(draft.serviceAppliedValues[service.id]);
      calculatedServices += calculated;
      serviceDiscounts += Math.max(0, calculated - applied);
      addServiceBreakdown(service.name, applied);
      return sum + applied;
    }, 0);
    const calculatedComponents = draft.components.reduce((sum, component) => sum + componentCalculatedTotal(draft, component), 0);
    const calculatedEdges = draft.components.reduce((sum, component) => sum + Math.max(0, componentCalculatedTotal(draft, component) - (calculateDraftComponent(component, draft.arredondarM2)?.billableArea ?? 0) * (materialFor(draft, component)?.currentPrice ?? 0)), 0);
    const componentTotal = draft.calculationMode === 'MANUAL_M2' ? materialSubtotal : draft.components.reduce((sum, component) => sum + componentAppliedTotal(draft, component), 0);
    const cutoutsTotal = draft.cutouts.reduce((sum, cutout) => {
      const calculated = cutoutCalculatedSubtotal(draft, cutout);
      const applied = cutout.appliedTotal === undefined ? calculated : currencyDecimal(cutout.appliedTotal);
      const service = cutout.serviceId ? draftServices.find((entry) => entry.id === cutout.serviceId) : undefined;
      addServiceBreakdown(service?.name ?? (cutout.label || 'Recorte / cuba'), applied);
      return sum + applied;
    }, 0);
    const calculatedCutouts = draft.cutouts.reduce((sum, cutout) => sum + cutoutCalculatedSubtotal(draft, cutout), 0);
    const cutoutDiscounts = draft.cutouts.reduce((sum, cutout) => sum + (cutout.appliedTotal === undefined ? 0 : Math.max(0, cutoutCalculatedSubtotal(draft, cutout) - currencyDecimal(cutout.appliedTotal))), 0);
    const componentDiscounts = draft.components.reduce((sum, component) => sum + Math.max(0, componentCalculatedTotal(draft, component) - componentAppliedTotal(draft, component)), 0);
    const componentBreakdown = draft.components.map((component, index) => {
      const calculatedEdges = component.edges.reduce((sum, edge) => sum + edgeCalculatedSubtotal(draft, component, edge), 0);
      const appliedEdges = component.edges.reduce((sum, edge) => sum + (edge.appliedTotal === undefined ? edgeCalculatedSubtotal(draft, component, edge) : currencyDecimal(edge.appliedTotal)), 0);
      const calculatedMaterial = Math.max(0, componentCalculatedTotal(draft, component) - calculatedEdges);
      const amount = component.appliedTotal === undefined ? Math.max(0, componentAppliedTotal(draft, component) - appliedEdges) : calculatedMaterial;
      component.edges.forEach((edge) => {
        const savedEdge = snapshotFor(draft)?.components.flatMap((entry) => entry.edges).find((entry) => entry.id === edge.id && entry.serviceId === edge.serviceId);
        const service = draftServices.find((entry) => entry.id === edge.serviceId);
        addServiceBreakdown(savedEdge?.serviceNameSnapshot ?? service?.name ?? 'Acabamento', edge.appliedTotal === undefined ? edgeCalculatedSubtotal(draft, component, edge) : currencyDecimal(edge.appliedTotal));
      });
      const defaultName = componentSummaryLabels[component.componentType];
      const unnamedRodabancaNumber = component.componentType === 'BACKSPLASH' && !component.label.trim()
        ? draft.components.slice(0, index + 1).filter((entry) => entry.componentType === 'BACKSPLASH' && !entry.label.trim()).length
        : 0;
      const name = component.label.trim() || (unnamedRodabancaNumber ? `${defaultName} ${unnamedRodabancaNumber}` : defaultName);
      return { id: `component-${component.id || index}`, name, amount };
    }).filter((component) => component.amount > 0);
    const saved = snapshotFor(draft);
    const financialDraft = (value: DraftItem) => JSON.stringify({ ...value, projectName: '', drawingData: undefined });
    const unchanged = saved && financialDraft(draft) === financialDraft(itemSalvoParaRascunho(saved));
    return { area, materialSubtotal, componentsTotal: componentTotal, componentBreakdown, additionalServicesTotal: directServices + cutoutsTotal, serviceBreakdown, servicesSubtotal: directServices + calculatedEdges + cutoutsTotal, calculatedComponents, calculatedTotal: (draft.calculationMode === 'MANUAL_M2' ? materialSubtotal : calculatedComponents) + calculatedServices + calculatedCutouts, individualDiscountTotal: componentDiscounts + serviceDiscounts + cutoutDiscounts, total: unchanged ? Number(saved.total) : componentTotal + directServices + cutoutsTotal };
  };
  const summaries = useMemo(() => items.map(itemSummary), [items, catalog, editingQuote]);
  const gross = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const discountValue = currencyDecimal(discount);
  const total = calcularTotalOrcamento(summaries.map((summary) => summary.total), Math.min(discountValue, gross));
  const updateItem = (patch: Partial<DraftItem>) => setItems((current) => current.map((entry, index) => index === activeIndex ? { ...entry, ...patch } : entry));
  const changeEntryMode = (mode: QuoteEntryMode) => {
    if (mode === 'QUICK' && item.calculationMode === 'MANUAL_M2') { setError('Este projeto usa área manual. Adicione um projeto para informar peças no orçamento rápido.'); return; }
    const materialIds = new Set(item.components.map(component => component.materialId || item.materialId).filter(Boolean));
    if (mode === 'QUICK' && materialIds.size > 1) { setError('Este projeto tem materiais diferentes por peça. Use um projeto rápido separado para cada material.'); return; }
    const prepared = prepararItemRapido(item);
    updateItem({ ...(prepared.components.length ? { components: prepared.components, cutouts: prepared.cutouts } : {}), ...(mode === 'QUICK' ? aplicarMaterialProjeto(item, item.components[0]?.materialId || item.materialId) : {}), drawingData: dadosEntradaProjeto(item.drawingData, mode) });
    setError(''); setCurrentStep(mode === 'DETAILED' && quickMode ? 3 : 1);
  };
  const selectProject = (index: number) => { setActiveIndex(index); setSummarySelection(index); setReviewedSteps([]); };
  const selectedMaterial = materialFor(item);
  const summaryIsTotal = summarySelection === 'TOTAL';
  const selectedSummary = typeof summarySelection === 'number' ? summaries[summarySelection] : undefined;
  const selectedComponentBreakdown = selectedSummary?.componentBreakdown ?? [];
  const selectedServiceBreakdown = selectedSummary?.serviceBreakdown ?? [];
  useEffect(() => {
    if (summarySelection !== 'TOTAL' && summarySelection !== activeIndex) setSummarySelection(activeIndex);
  }, [activeIndex, summarySelection]);

  const selectCustomer = (entry: Customer) => { setCustomer(entry); setEditingCustomerId(null); setCustomerMode(null); setCustomerForm({ name: entry.name, phone: entry.phone, document: entry.document ?? '', email: entry.email ?? '', address: entry.address ?? '', neighborhood: entry.neighborhood ?? '', city: entry.city ?? '', postalCode: entry.postalCode ?? '', complement: entry.complement ?? '', notes: entry.notes ?? '' }); setCustomerSearch(''); setCustomers([]); };
  const openCustomerSearch = () => { setEditingCustomerId(null); setCustomerMode('EXISTING'); setCustomerSearch(''); setCustomers([]); };
  const openNewCustomer = () => { setEditingCustomerId(null); setCustomerMode('NEW'); setCustomerForm({ name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' }); };
  const editCustomer = () => { if (!customer) return; selectCustomer(customer); setEditingCustomerId(customer.id); setCustomerMode('NEW'); };
  async function salvarCliente(event: FormEvent) {
    event.preventDefault();
    try { const payload = Object.fromEntries(Object.entries(customerForm).map(([key, value]) => [key, value || null])); const saved = editingCustomerId ? await api<Customer>('/customers/' + editingCustomerId, { method: 'PATCH', body: JSON.stringify(payload) }) : await api<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) }); selectCustomer(saved); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.'); }
  }
  function adicionarProjeto() { setItems((current) => [...current, { ...newItem(), productTypeId: catalog?.productTypes[0]?.id ?? '', ...(quickMode ? { drawingData: dadosEntradaProjeto(undefined, 'QUICK') } : {}) }]); setActiveIndex(items.length); setReviewedSteps([]); }
  function removerProjeto(index: number) {
    const project = items[index];
    const filled = projetoPreenchido(project);
    if (filled && !window.confirm(`Excluir ${project.projectName || 'Projeto ' + (index + 1)} e todos os seus dados?`)) return;
    if (items.length === 1) {
      setItems([{ ...newItem(), productTypeId: catalog?.productTypes[0]?.id ?? '' }]); setActiveIndex(0); setSummarySelection(0); navigateStep(1);
    } else {
      setItems(current => current.filter((_, currentIndex) => currentIndex !== index));
      setActiveIndex(current => current > index ? current - 1 : Math.min(current, items.length - 2));
    }
    setReviewedSteps([]);
  }
  const workspaceHasData = (entry: ClientWorkspace) => !!entry.customer || entry.items.some((project) => projetoPreenchido(project));
  function adicionarEspacoCliente() {
    const fresh = newClientWorkspace();
    fresh.items = [{ ...fresh.items[0], productTypeId: catalog?.productTypes[0]?.id ?? '' }];
    setWorkspaces((current) => [...current, fresh]);
    setActiveClientIndex(workspaces.length);
    setSummarySelection(0);
    setReviewedSteps([]);
    setCurrentStep(1);
  }
  function removerEspacoCliente(index: number) {
    const entry = workspaces[index];
    if (!entry) return;
    if (workspaceHasData(entry) && !window.confirm(`Excluir ${entry.customer?.name || 'Cliente ' + (index + 1)} e todos os seus projetos?`)) return;
    if (workspaces.length === 1) {
      const fresh = newClientWorkspace();
      fresh.items = [{ ...fresh.items[0], productTypeId: catalog?.productTypes[0]?.id ?? '' }];
      setWorkspaces([fresh]);
      setActiveClientIndex(0);
    } else {
      setWorkspaces((current) => current.filter((_, currentIndex) => currentIndex !== index));
      setActiveClientIndex((current) => current > index ? current - 1 : Math.min(current, workspaces.length - 2));
    }
    setSummarySelection(0);
    setReviewedSteps([]);
    setCurrentStep(1);
  }
  function selecionarEspacoCliente(index: number) {
    if (index < 0 || index >= workspaces.length) return;
    setActiveClientIndex(index);
    setSummarySelection(0);
    setReviewedSteps([]);
    setCurrentStep(1);
  }
  const projectProblem = (draft: DraftItem): { message: string; componentId?: string } | null => {
    draft = prepararItemRapido(draft);
    const quickDraft = modoEntradaOrcamento(draft.drawingData) === 'QUICK';
    if (!draft.productTypeId && !quickDraft) return { message: 'O catálogo de tipos de peça ainda não foi carregado. Aguarde e tente novamente.' };
    if (draft.calculationMode === 'MANUAL_M2') {
      if (!materialFor(draft)) return { message: 'Selecione o material.' };
      if (!isSuperAdmin) return { message: 'O cálculo manual exige acesso de Super Admin.' };
      if (!(decimal(draft.manualM2) > 0)) return { message: 'Informe uma área manual maior que zero.' };
      if (!draft.manualJustification.trim()) return { message: 'Informe a justificativa da área manual.' };
      return null;
    }
    if (!draft.components.length) return { message: 'Adicione ao menos uma peça.' };
    for (const [index, component] of draft.components.entries()) {
      const name = component.label.trim() || `Componente ${index + 1}`;
      if (!materialFor(draft, component)) return { componentId: component.id, message: `${name}: selecione o material dessa peça no campo Material.` };
      if (!calculateDraftComponent(component, draft.arredondarM2)) return { componentId: component.id, message: `${name}: confira comprimento, largura/altura e quantidade. As medidas devem ser maiores que zero.` };
      for (const edge of quickDraft ? [] : component.edges) {
        const service = servicesFor(draft).find(entry => entry.id === edge.serviceId);
        if (acabamentoBordaPedra(service?.name ?? '') && !(decimal(edge.heightCm ?? '') > 0)) return { componentId: component.id, message: `${name}: informe a altura/largura de ${service?.name}.` };
      }
    }
    return null;
  };
  const isEmptyQuickProject = (project: DraftItem) => {
    if (modoEntradaOrcamento(project.drawingData) !== 'QUICK') return false;
    return !project.projectName.trim() && !project.materialId && !project.manualM2 && !project.manualJustification
      && project.components.length <= 1 && !project.cutouts.length && !project.serviceIds.length
      && project.components.every(component => !component.label.trim() && !component.materialId && !component.lengthCm && !component.widthCm && component.quantity === 1 && component.componentType === 'TOP' && !component.edges.length && component.appliedTotal === undefined);
  };
  const prepareDraftForSave = (draft: DraftItem) => {
    const prepared = prepararItemRapido(draft);
    if (modoEntradaOrcamento(prepared.drawingData) !== 'QUICK') return prepared;
    const draftServices = servicesFor(prepared);
    const omitted = new Set<string>();
    // "M² fechado": grava o valor de material calculado com a área arredondada como
    // valor final da peça, para o orçamento cobrar por ele. Um valor final já digitado
    // manualmente é preservado (componentAppliedTotal respeita component.appliedTotal
    // como sobreposição antes de retornar o valor a gravar aqui). As medidas
    // (lengthCm/widthCm) nunca são alteradas — o desenho técnico e o PDF continuam
    // mostrando exatamente o que foi digitado.
    const components = prepared.components.map(component => ({ ...component,
      appliedTotal: prepared.arredondarM2 ? componentAppliedTotal(prepared, component).toFixed(2).replace('.', ',') : component.appliedTotal,
      edges: component.edges.filter(edge => {
      const service = draftServices.find(entry => entry.id === edge.serviceId);
      const stripWithoutMeasure = !!acabamentoBordaPedra(service?.name ?? '') && !(decimal(edge.heightCm ?? '') > 0);
      if (stripWithoutMeasure) omitted.add(edge.serviceId);
      return !stripWithoutMeasure;
    }) }));
    if (!omitted.size && !prepared.arredondarM2) return prepared;
    return { ...prepared, components, serviceIds: [...new Set([...prepared.serviceIds, ...omitted])], serviceQuantities: { ...prepared.serviceQuantities, ...Object.fromEntries([...omitted].map(serviceId => [serviceId, prepared.serviceQuantities[serviceId] ?? '1'])) } };
  };
  async function salvarOrcamento(openPdf = false) {
    setError('');
    // Cada aba de cliente representa um orçamento independente. O salvamento
    // não deve ser bloqueado por outro cliente que ainda está sendo preenchido.
    const activeWorkspace = workspaces[activeClientIndex] ?? workspaces[0];
    if (!activeWorkspace) { setError('Crie um projeto antes de salvar o orçamento.'); return; }
    const itemsToSave = activeWorkspace.items.filter(project => !isEmptyQuickProject(project));
    const activeProblems = itemsToSave.map(projectProblem);
    const invalidIndex = !activeWorkspace?.customer ? -1 : activeProblems.findIndex(Boolean);
    const invalid = !activeWorkspace?.customer || !itemsToSave.length || invalidIndex >= 0;
    if (invalid) {
      setActiveClientIndex(activeClientIndex);
      if (invalidIndex >= 0) {
        setWorkspaces((current) => current.map((entry, index) => index === activeClientIndex ? { ...entry, activeIndex: invalidIndex } : entry));
        setSummarySelection(invalidIndex);
        setMaterialComponentId(activeProblems[invalidIndex]?.componentId ?? null);
      }
      navigateStep(1);
      if (!activeWorkspace?.customer) openCustomerSearch();
      setError(!activeWorkspace?.customer ? 'Selecione o cliente deste grupo.' : !itemsToSave.length ? 'Adicione ao menos uma peça no orçamento rápido.' : `${itemsToSave[invalidIndex].projectName || 'Projeto ' + (invalidIndex + 1)} — ${activeProblems[invalidIndex]!.message}`);
      return;
    }
    if (activeWorkspace.parentQuote && activeWorkspace.parentQuote.customerId !== activeWorkspace.customer!.id) { setError('O complemento deve usar o cliente do orçamento vinculado.'); return; }
    if (editingQuote?.status === 'APPROVED' && !window.confirm('Salvar alterações neste orçamento aprovado? Confira os valores e as medidas antes de confirmar.')) return;
    setSaving(true);
    try {
      const defaultProductTypeId = catalog?.productTypes[0]?.id ?? '';
      const payload = { customerId: activeWorkspace.customer!.id, parentQuoteId: activeWorkspace.parentQuote?.id, expectedUpdatedAt: editingQuote?.updatedAt, notes: activeWorkspace.notes.trim() || null, validUntil: activeWorkspace.validUntil || null, discountAmount: currencyDecimal(activeWorkspace.discount), items: itemsToSave.map((draft) => { const prepared = prepareDraftForSave(draft); const normalized = prepared.productTypeId ? prepared : { ...prepared, productTypeId: defaultProductTypeId }; return rascunhoParaEntradaItem(normalized, snapshotFor(draft)); }) };
      const saved = await api<{ id: string }>(quoteId ? `/quotes/${quoteId}` : '/quotes', { method: quoteId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const savedActiveId = saved.id;
      if (!quoteId) await api(`/quotes/${saved.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SENT' }) });
      savedRef.current = true;
      if (!quoteId) {
        const remaining = workspaces.filter((_, index) => index !== activeClientIndex);
        if (remaining.length) localStorage.setItem(quoteDraftStorageKey, JSON.stringify({ workspaces: remaining, activeClientIndex: 0, componentNamesVersion: 1 }));
        else localStorage.removeItem(quoteDraftStorageKey);
      } else localStorage.removeItem(quoteDraftStorageKey);
      window.location.href = openPdf && savedActiveId ? `/orcamentos/${savedActiveId}?pdf=1&individualPrices=${pdfIndividualPrices}` : '/orcamentos';
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o orçamento.'); } finally { setSaving(false); }
  }
  const updateAppliedComponentValue = (componentIndex: number, value: string) => updateItem({ components: item.components.map((component, index) => index === componentIndex ? { ...component, appliedTotal: value } : component) });
  const restoreComponentValue = (componentIndex: number) => updateItem({ components: item.components.map((component, index) => index === componentIndex ? { ...component, appliedTotal: undefined } : component) });
  if (quoteId && !editingQuote) return <main className="shell"><Link href="/orcamentos">← Orçamentos</Link><p className={error ? 'form-error' : 'empty'}>{error || 'Abrindo orçamento para edição…'}</p></main>;
  if (!catalog) return <main className="shell"><p className="empty">{error || 'Carregando catálogo…'}</p></main>;
  const clientTabs = !quoteId ? <div className="client-tabs-bar" role="tablist" aria-label="Clientes"><span className="client-tabs-label">Clientes</span>{workspaces.map((entry, index) => <div className={`client-tab ${index === activeClientIndex ? 'active' : ''}`} key={entry.id}>
    <button type="button" role="tab" aria-selected={index === activeClientIndex} onClick={() => selecionarEspacoCliente(index)}>{entry.customer?.name || `Cliente ${index + 1}`}</button>
    <button type="button" className="close-client-tab" aria-label={`Excluir ${entry.customer?.name || 'Cliente ' + (index + 1)}`} onClick={() => removerEspacoCliente(index)}>×</button>
  </div>)}<button type="button" className="add-client-tab" aria-label="Adicionar cliente" onClick={adicionarEspacoCliente}>+</button></div> : null;

  return <main className="shell project-builder">
    <header className="project-topbar">
      {!headerTabsTarget && clientTabs}
      <div className="project-topbar-main"><div className="project-title-client"><h1>{editingQuote ? `Editar ${editingQuote.number}` : 'Novo Projeto'}</h1>
        <div className="compact-customer">{customer ? <><span title={customer.name}>Cliente: <strong>{customer.name}</strong></span><button type="button" onClick={openCustomerSearch}>Trocar cliente</button><button type="button" onClick={editCustomer} aria-label="Editar cliente">✎</button></> : <><button type="button" onClick={openCustomerSearch}>Selecionar cliente</button><span aria-hidden="true">|</span><button type="button" onClick={openNewCustomer}>Novo cliente</button></>}</div>
      </div>
      <div className="project-tabs-bar"><div className="project-tabs" role="tablist" aria-label="Projetos">{items.map((draft, index) => <div className={`project-tab ${index === activeIndex ? 'active' : ''}`} key={draft.id}>
        <button type="button" role="tab" id={`tab-${draft.id}`} aria-controls="active-project-panel" aria-selected={index === activeIndex} tabIndex={index === activeIndex ? 0 : -1} onClick={() => selectProject(index)} onKeyDown={event => { const target = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1; if (target >= 0) { event.preventDefault(); selectProject(target); document.getElementById(`tab-${items[target].id}`)?.focus(); } }}>{draft.projectName || `Projeto ${index + 1}`}</button>
        <button type="button" className="close-project-tab" aria-label={`Excluir ${draft.projectName || 'Projeto ' + (index + 1)}`} onClick={() => removerProjeto(index)}>×</button>
      </div>)}</div><button type="button" className="add-project-tab" aria-label="Adicionar projeto" onClick={adicionarProjeto}>+</button></div></div>
    </header>
    {headerTabsTarget && clientTabs && createPortal(clientTabs, headerTabsTarget)}
    {customerMode && <dialog className="customer-dialog" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setCustomerMode(null)}>
      <div className="customer-dialog-heading"><strong>{editingCustomerId ? 'Editar cliente' : customerMode === 'NEW' ? 'Novo cliente' : 'Selecionar cliente'}</strong><button type="button" className="text-button" aria-label="Fechar seleção de cliente" onClick={() => setCustomerMode(null)}>×</button></div>
      <div className="customer-mode-tabs"><button type="button" onClick={openCustomerSearch}>Selecionar cliente</button><button type="button" onClick={openNewCustomer}>Novo cliente</button></div>
      {customerMode === 'NEW' ? <><form className="inline-form customer-form" onSubmit={salvarCliente}>
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
    </dialog>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className={`quote-workspace${quickMode ? ' quick-workspace' : ''}`}><div className="quote-form-column" id="active-project-panel" role="tabpanel" aria-labelledby={`tab-${item.id}`}>
    {editingQuote && <p className="customer-help">Editando o orçamento salvo. Os preços registrados e os ajustes manuais são preservados; novos materiais e serviços usam o catálogo atual. <Link href={`/orcamentos/${quoteId}`} onClick={() => { savedRef.current = true; localStorage.removeItem(quoteDraftStorageKey); }}>Cancelar edição</Link></p>}
    <div className="quote-mode-switch" role="group" aria-label="Modo do orçamento">
      <button type="button" aria-pressed={quickMode} onClick={() => changeEntryMode('QUICK')}>Orçamento Rápido</button>
      <button type="button" aria-pressed={!quickMode} onClick={() => changeEntryMode('DETAILED')}>Orçamento com Desenho / Detalhado</button>
      <small>{projetoTemDesenho(item.drawingData) ? 'Desenho adicionado' : 'Desenho pendente'}</small>
      {!quickMode && !projetoTemDesenho(item.drawingData) && <button type="button" onClick={() => { const problem = projectProblem(item); if (problem) { setError(problem.message); return; } updateItem({ drawingData: { ...item.drawingData, detailingStatus: 'COMPLETED' } }); }}>Concluir detalhamento</button>}
    </div>
    {!quickMode && <div className="project-navigation"><EtapasProjeto current={currentStep} completed={completedSteps} onSelect={navigateStep} /><button type="button" className="view-all-button" aria-pressed={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? 'Ver por etapas' : 'Ver tudo'}</button></div>}
    {quickMode && <EditorOrcamentoRapido key={item.id} item={item} materials={catalog.materials} material={materialFor(item, item.components[0])} services={activeServices} onCreateService={createQuickService} onChange={patch => updateItem({ ...patch, drawingData: dadosEntradaProjeto(item.drawingData, 'QUICK') })} area={component => calculateDraftComponent(component, item.arredondarM2)?.billableArea ?? 0} value={component => componentAppliedTotal(item, component)} calculateCutout={cutout => cutoutCalculatedSubtotal(item, cutout)} />}
    {!quickMode && <>
    <div className="project-stage-group project-setup-grid" hidden={quickMode || (!showAll && currentStep !== 1)}>
    <section className="section measurements-card" id="project-step-1" tabIndex={-1} onFocusCapture={() => setCurrentStep(1)}><CartaoMaterialSelecionado material={item.calculationMode === 'DIMENSIONS' ? materialFor(item, materialComponent) : selectedMaterial} /><TituloEtapaProjeto number={1} title="Componentes e medidas" description="Escolha o material e informe as medidas de cada peça." /><div className="project-details-row"><label className="project-name-field"><span>Nome do projeto</span><input id="project-name" value={item.projectName} onChange={event => updateItem({ projectName: event.target.value })} placeholder={`Projeto ${activeIndex + 1}`} /></label>{item.calculationMode === 'DIMENSIONS' && materialComponent && <div className="project-material-field"><SeletorMaterialComponente materials={catalog.materials.filter(material => material.billingUnit === 'SQUARE_METER')} selected={materialFor(item, materialComponent)} onSelect={materialId => updateItem({ components: item.components.map(component => component.id === materialComponent.id ? { ...component, materialId } : component) })} /></div>}</div><label className="calculation-mode"><input type="radio" checked={item.calculationMode === 'DIMENSIONS'} onChange={() => updateItem({ calculationMode: 'DIMENSIONS' })} /> Calcular pelas medidas</label>{isSuperAdmin && <label className="calculation-mode"><input type="radio" checked={item.calculationMode === 'MANUAL_M2'} onChange={() => updateItem({ calculationMode: 'MANUAL_M2' })} /> M² manual (auditável)</label>}{item.calculationMode === 'MANUAL_M2' ? <div className="manual-component"><SeletorMaterialComponente materials={catalog.materials} selected={selectedMaterial} onSelect={materialId => updateItem({ materialId })} /><div className="inline-form"><input inputMode="decimal" value={item.manualM2} onChange={(event) => updateItem({ manualM2: event.target.value })} placeholder="Área em m²" /><input value={item.manualJustification} onChange={(event) => updateItem({ manualJustification: event.target.value })} placeholder="Justificativa obrigatória" /></div></div> : <EditorComponentes renderCutouts={(componentIndex) => (<ComplementosOrcamento mode="cutouts" componentIndex={componentIndex} calculateCutout={(cutout) => cutoutCalculatedSubtotal(item, cutout)} cutouts={item.cutouts} components={item.components} services={activeServices} serviceIds={item.serviceIds} serviceQuantities={item.serviceQuantities} serviceAppliedValues={item.serviceAppliedValues} onChange={(patch) => updateItem(patch)} />)} cutouts={item.cutouts} materialFor={component => materialFor(item, component)} components={item.components} linearServices={drawingServices} onChange={(components) => updateItem({ components })} onActiveMaterialChange={setMaterialComponentId} onAdd={(type, parentIndex) => updateItem({ components: [...item.components, { ...blankComponent(type), materialId: parentIndex === undefined ? '' : item.components[parentIndex].materialId, parentComponentId: parentIndex === undefined ? undefined : item.components[parentIndex].id }] })} onRemove={(index) => { const patch = removerGrupoComponentes(item, index); if (patch.components.length) updateItem(patch); }} onAddCutout={(componentIndex) => { updateItem({ cutouts: [...item.cutouts, { id: newId(), componentIndex, cutoutType: 'SINK', label: 'Recorte / cuba', quantity: 1 }] }); }} />}<div className="partial"><span>Área total da pedra</span><strong>{summaries[activeIndex].area.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m²</strong><span>Material</span><strong>{formatarMoeda(summaries[activeIndex].materialSubtotal)}</strong></div></section>
    <div className="setup-unassigned-cutouts"><ComplementosOrcamento mode={item.calculationMode === 'MANUAL_M2' ? 'cutouts' : 'unassigned'} calculateCutout={(cutout) => cutoutCalculatedSubtotal(item, cutout)} cutouts={item.cutouts} components={item.components} services={activeServices} serviceIds={item.serviceIds} serviceQuantities={item.serviceQuantities} serviceAppliedValues={item.serviceAppliedValues} onChange={(patch) => updateItem(patch)} /></div>
    </div>
    <div className="project-stage-group" id="project-step-2" tabIndex={-1} hidden={quickMode || (!showAll && currentStep !== 2)}>
    <section className="section quote-values"><TituloEtapaProjeto number={2} title="Valores e serviços" description="Confira os valores calculados e ajuste o valor final de cada item." /><ComplementosOrcamento mode="services" calculateCutout={(cutout) => cutoutCalculatedSubtotal(item, cutout)} cutouts={item.cutouts} components={item.components} services={activeServices} serviceIds={item.serviceIds} serviceQuantities={item.serviceQuantities} serviceAppliedValues={item.serviceAppliedValues} onChange={(patch) => updateItem(patch)} /><div className="pricing-notice"><strong>Revisão interna de preços</strong><p>Os valores abaixo ajudam na negociação. No PDF do cliente aparece o total do orçamento.</p></div>{item.components.map((component, componentIndex) => { const calculated = componentCalculatedTotal(item, component); const applied = componentAppliedTotal(item, component); const difference = calculated - applied; const changed = component.appliedTotal !== undefined; return <article className="quote-value-row" key={component.id}><div><strong>{component.label || `Componente ${componentIndex + 1}`}</strong><small>Valor calculado: {formatarMoeda(calculated)}</small>{component.edges.length > 0 && <small>Inclui os acabamentos desta peça, detalhados abaixo.</small>}{changed && Math.abs(difference) > 0.005 && <small className="manual-warning">⚠ Cálculo atualizado; valor manual aplicado.</small>}</div><label><span>Valor final</span><input inputMode="decimal" value={component.appliedTotal ?? applied.toFixed(2).replace('.', ',')} onChange={(event) => updateAppliedComponentValue(componentIndex, event.target.value)} /></label><div className="quote-value-discount">Desconto: <strong>{formatarMoeda(Math.max(0, difference))}</strong>{changed && <button type="button" className="text-button" onClick={() => restoreComponentValue(componentIndex)}>Restaurar cálculo</button>}</div></article>; })}{item.components.flatMap((component) => component.edges.map((edge) => ({ component, edge }))).map(({ component, edge }) => { const service = activeServices.find((entry) => entry.id === edge.serviceId); const calculated = edgeCalculatedSubtotal(item, component, edge); const applied = edge.appliedTotal === undefined ? calculated : currencyDecimal(edge.appliedTotal); const difference = calculated - applied; return <article className="quote-value-row" key={`${component.id}-${edge.side}-${edge.serviceId}`}><div><strong>{service?.name ?? 'Acabamento'} · {component.label || 'Peça'} · {rotuloLadoBorda(edge.side)}</strong><small>Valor calculado: {formatarMoeda(calculated)}</small></div><label><span>Valor final</span><input inputMode="decimal" value={edge.appliedTotal ?? calculated.toFixed(2).replace('.', ',')} onChange={(event) => updateItem({ components: item.components.map((entry) => entry.id === component.id ? { ...entry, edges: entry.edges.map((current) => current === edge ? { ...current, appliedTotal: event.target.value } : current) } : entry) })} /></label><div className="quote-value-discount">Desconto: <strong>{formatarMoeda(Math.max(0, difference))}</strong>{edge.appliedTotal !== undefined && <button type="button" className="text-button" onClick={() => updateItem({ components: item.components.map((entry) => entry.id === component.id ? { ...entry, edges: entry.edges.map((current) => current === edge ? { ...current, appliedTotal: undefined } : current) } : entry) })}>Restaurar cálculo</button>}</div></article>; })}{item.serviceIds.map((serviceId) => { const service = activeServices.find((entry) => entry.id === serviceId); if (!service) return null; const quantity = billedServiceQuantity(service, summaries[activeIndex].area, item.serviceQuantities); const calculated = quantity > 0 ? calcularLinhaServico({ serviceName: service.name, billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0; const applied = item.serviceAppliedValues[service.id] === undefined ? calculated : currencyDecimal(item.serviceAppliedValues[service.id]); const difference = calculated - applied; return <article className="quote-value-row" key={`service-${service.id}`}><div><strong>{service.name}</strong><small>Valor calculado: {formatarMoeda(calculated)}</small></div><label><span>Valor final</span><input inputMode="decimal" value={item.serviceAppliedValues[service.id] ?? calculated.toFixed(2).replace('.', ',')} onChange={(event) => updateItem({ serviceAppliedValues: { ...item.serviceAppliedValues, [service.id]: event.target.value } })} /></label><div className="quote-value-discount">Desconto: <strong>{formatarMoeda(Math.max(0, difference))}</strong>{item.serviceAppliedValues[service.id] !== undefined && <button type="button" className="text-button" onClick={() => { const values = { ...item.serviceAppliedValues }; delete values[service.id]; updateItem({ serviceAppliedValues: values }); }}>Restaurar cálculo</button>}</div></article>; })}<ValoresRecortes cutouts={item.cutouts} components={item.components} services={activeServices} calculate={(cutout) => cutoutCalculatedSubtotal(item, cutout)} onChange={(cutouts) => updateItem({ cutouts })} /><div className="quote-values-total"><span>Subtotal calculado</span><strong>{formatarMoeda(summaries[activeIndex]?.calculatedTotal ?? 0)}</strong><span>Descontos individuais</span><strong>{formatarMoeda(summaries[activeIndex]?.individualDiscountTotal ?? 0)}</strong><span>Total deste item</span><strong>{formatarMoeda(summaries[activeIndex]?.total ?? 0)}</strong></div></section>
    <section className="section discount"><label htmlFor="discount">Desconto autorizado</label><div><span>R$</span><input id="discount" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div></section>
    </div>
    <div className="project-stage-group" id="project-step-3" tabIndex={-1} hidden={quickMode || (!showAll && currentStep !== 3)}>
    <section className="section"><TituloEtapaProjeto number={3} title="Desenho técnico" description="Confira as peças e as especificações antes de salvar o orçamento." />{(showAll || currentStep === 3) && <DesenhoTecnico components={drawingComponents} cutouts={drawingCutouts} materialNames={Object.fromEntries(item.components.map(component => [component.id, materialFor(item, component)?.name ?? 'Material não selecionado']))} linearServices={drawingServices} services={activeServices} additionalServices={item.serviceIds.flatMap((id) => { const service = activeServices.find((entry) => entry.id === id); return service ? [{ name: service.name, quantity: service.billingUnit === 'UNIT' ? item.serviceQuantities[id] : undefined }] : []; })} notes={notes} />}</section>
    </div>
    <div className="project-stage-actions" hidden={quickMode}><button type="button" className="secondary-button" onClick={() => navigateStep(Math.max(1, currentStep - 1))} disabled={currentStep === 1}>← Voltar</button><span>{`Etapa ${currentStep} de 3`}</span>{currentStep < 3 ? <button type="button" className="save-quote-button" onClick={nextStep}>{currentStep === 1 ? 'Revisar valores e serviços' : 'Conferir desenho técnico'} <span aria-hidden="true">→</span></button> : <button type="button" className="save-quote-button" onClick={() => salvarOrcamento()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar orçamento'} <span aria-hidden="true">✓</span></button>}</div>
    </>}
    </div>
    <aside className="quote-summary-card"><div className="quote-visual-card"><p>Projetos únicos<br />para espaços<br />incríveis.</p><i /></div><strong>Resumo do orçamento</strong><label className="summary-project-select">Projeto em edição<select aria-label="Projeto em edição" value={summarySelection} onChange={(event) => { const value = event.target.value; if (value === 'TOTAL') { setSummarySelection('TOTAL'); return; } selectProject(Number(value)); }}>{items.map((draft, index) => <option key={draft.id} value={index}>{draft.projectName || `Projeto ${index + 1}`}</option>)}<option value="TOTAL">Total</option></select></label>{summaryIsTotal ? <div className="summary-project-totals">{items.map((draft, index) => <span key={draft.id}><span>{draft.projectName || `Projeto ${index + 1}`}</span><b>{formatarMoeda(summaries[index]?.total ?? 0)}</b></span>)}<span className="summary-grand-total"><span>Total dos projetos</span><b>{formatarMoeda(gross)}</b></span></div> : <><span>Projetos adicionados <b>{items.length}</b></span><span>Área total <b>{(selectedSummary?.area ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²</b></span>{selectedComponentBreakdown.length ? selectedComponentBreakdown.map((component) => <span key={component.id}>{component.name} <b>{formatarMoeda(component.amount)}</b></span>) : <span>Material <b>{formatarMoeda(selectedSummary?.materialSubtotal ?? 0)}</b></span>}{selectedServiceBreakdown.length ? selectedServiceBreakdown.map((service) => <span key={service.id}>{service.name} <b>{formatarMoeda(service.amount)}</b></span>) : <span>Serviços, recortes e cubas <b>{formatarMoeda(0)}</b></span>}<span>Descontos individuais <b>{formatarMoeda(selectedSummary?.individualDiscountTotal ?? 0)}</b></span><span className="summary-grand-total">Total do projeto <b>{formatarMoeda(selectedSummary?.total ?? 0)}</b></span></>}<label className="quote-validity-field">Validade do orçamento<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label><section className="summary-notes"><label htmlFor="quote-notes">Observações do orçamento</label><textarea id="quote-notes" rows={4} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: conferir medidas no local e alinhar os veios das peças." aria-describedby="quote-notes-help" /><p id="quote-notes-help">Estas observações aparecem no PDF do orçamento.</p></section>{!quoteId && <VincularOrcamento value={parentQuote} onChange={(quote) => { setParentQuote(quote); if (quote) selectCustomer(quote.customer); }} />}<small className="quote-summary-note">As medidas e os acabamentos atualizam o orçamento automaticamente.</small>{quickMode && <label>Desconto autorizado (R$)<input aria-label="Desconto geral rápido" inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label>}{quickMode && <><span>Total do orçamento <b>{formatarMoeda(total)}</b></span><span>No Pix (5%) <b>{formatarMoeda(calcularTotalPix(total))}</b></span></>}<div className="quote-summary-actions">{quickMode && <><label className="quick-pdf-pricing"><span>PDF do orçamento</span><select aria-label="Valores no PDF" value={pdfIndividualPrices ? 'individual' : 'total'} onChange={event => setPdfIndividualPrices(event.target.value === 'individual')}><option value="total">Sem valores individuais (totais por projeto)</option><option value="individual">Com valores discriminados</option></select></label><button type="button" className="save-quote-button" disabled={saving} onClick={() => salvarOrcamento(true)}>Salvar e abrir PDF</button><button type="button" className="save-draft-button" onClick={() => changeEntryMode('DETAILED')}>Adicionar desenhos</button></>}{!quickMode && currentStep < 3 && <button type="button" className="save-quote-button" onClick={nextStep}>Continuar <span aria-hidden="true">→</span></button>}<button type="button" className={currentStep < 3 ? 'save-draft-button' : 'save-quote-button'} onClick={() => salvarOrcamento()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar orçamento'}</button><small>Seu preenchimento é mantido neste navegador.</small></div></aside>
    </div>
  </main>;
}
