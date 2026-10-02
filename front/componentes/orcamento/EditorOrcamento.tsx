'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type SetStateAction } from 'react';
import { arredondarMoeda, valorAplicadoComponente, podeEditarOrcamento, type SavedQuoteItem, somarAreasComponentes, calcularComponente, calcularLinha, calcularLinhaServico, calcularTotalOrcamento, centimetrosParaMilimetros, calcularAreaRetangularM2, acabamentoBordaPedra, calcularAcabamentoBorda } from '@inova/domain';
import type { ComponentType, DraftComponent, DraftEdge, DraftItem } from './types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { currency, rascunhoParaEntradaItem, itemSalvoParaRascunho } from '../../utilitarios/saved-quote';
import { restaurarNomesComponentes } from '../../utilitarios/component-groups';
import { VincularOrcamento, type QuoteLink } from './QuoteLinker';
import { api } from '../../utilitarios/api';
import '../../app/project-builder.css';
import { useSession } from '../ApplicationShell';
import { calcularTotalCartao, temPermissao } from '@inova/domain';
import { EditorOrcamentoRapido } from './QuickQuoteEditor';
import { ResumoMovel } from './MobileQuoteSummary';
import { criarId } from '../../utilitarios/id';
import { duplicarProjeto } from '../../utilitarios/duplicar-projeto';
import { JanelaDuplicarProjeto } from './JanelaDuplicarProjeto';
import { arredondarMedidaParaCima, normalizarPedrasDasPecas, prepararItemRapido } from '../../utilitarios/quick-quote';
import './quick-quote.css';
import { conciliarPlanoParaSalvar } from '../../utilitarios/production-plan';
import { createPortal } from 'react-dom';
import { Icone, useCelular } from '../filtros/Filtros';
import { BarraAtendimento } from './BarraAtendimento';
import { OpcaoSemCadastro, contatoCliente, payloadCliente } from '../clientes/SemCadastro';
import { DesenhoTecnicoNoOrcamento, type DesenhoUsado } from './DesenhoTecnicoNoOrcamento';
import { projetoDoDesenho, projetoParaDesenho, vinculoDesenho } from '../../utilitarios/desenho-orcamento';
import type { SincroniaDesenho } from '@inova/domain/technical';
import { useRascunhoServidor } from './useRascunhoServidor';
import { Caminho } from '../Caminho';
import { caminhoDentroDoOrcamento, enderecoOrcamento, lerOrigem, SEM_ORIGEM } from '../../utilitarios/rotas';

type BillingUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';
type MaterialImage = { id: string; url: string; alt?: string | null; isPrimary: boolean };
type Material = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; images?: MaterialImage[] };
type Service = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number };
type ProductType = { id: string; name: string };
type Customer = { id: string; name: string; phone: string | null; isQuick?: boolean; document?: string | null; email?: string | null; address?: string | null; neighborhood?: string | null; city?: string | null; postalCode?: string | null; complement?: string | null; notes?: string | null };
type Catalog = { materials: Material[]; services: Service[]; productTypes: ProductType[]; settings?: { closedSquareMeter: boolean } };
type ClientWorkspace = { id: string; customer: Customer | null; items: DraftItem[]; activeIndex: number; discount: string; parentQuote: QuoteLink | null };
type CustomerTarget = { kind: 'WORKSPACE'; workspaceId: string } | { kind: 'NEW_WORKSPACE' };

const projetoPreenchido = (project: DraftItem) => !!project.projectName.trim() || !!project.materialId || !!project.manualM2 || !!project.manualJustification || project.components.length > 1 || project.cutouts.length > 0 || project.serviceIds.length > 0 || project.components.some(component => !!component.label.trim() || !!component.materialId || !!component.lengthCm || !!component.widthCm || component.quantity !== 1 || component.componentType !== 'TOP' || component.edges.length > 0 || component.appliedTotal !== undefined);

import { confirmar } from '../Confirmacao';
import { Janela } from '../Janela';
import { formatarMoeda } from '../../utilitarios/formatadores';
const newId = criarId;
const decimal = (value: string) => Number(value.replace(',', '.')) || 0;
const currencyDecimal = (value: string) => { const normalized = value.trim(); if (!normalized) return 0; const parsed = Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized); return Number.isFinite(parsed) && parsed >= 0 ? arredondarMoeda(parsed) : 0; };
const billedServiceQuantity = (service: Pick<Service, 'id' | 'name' | 'billingUnit'>, area: number, quantities: DraftItem['serviceQuantities']) => service.billingUnit === 'SQUARE_METER' ? area * (/rebaixo italiano/i.test(service.name) ? decimal(quantities[service.id] ?? '1') : 1) : service.billingUnit === 'FIXED' ? 1 : decimal(quantities[service.id] ?? '1');
const catalogCacheKey = 'inova_catalog_cache_v4';
const catalogCacheTtlMs = 60_000;
const legacyQuoteDraftStorageKey = 'inova_quote_draft_v2';
const componentSummaryLabels: Record<ComponentType, string> = { TOP: 'Bancada', COUNTER: 'Bancada', BASE: 'Base', VISTA: 'Vista', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', SIDE_LEFT: 'Lateral esquerda', SIDE_RIGHT: 'Lateral direita', SILL: 'Peitoril', THRESHOLD: 'Soleira', STEP: 'Degrau', OTHER: 'Componente' };
const blankComponent = (componentType: ComponentType): DraftComponent => ({ id: newId(), label: '', componentType, orientation: ['TOP', 'COUNTER', 'BASE', 'VISTA', 'SILL', 'THRESHOLD', 'STEP'].includes(componentType) ? 'HORIZONTAL' : 'VERTICAL', lengthCm: '', widthCm: '', quantity: 1, edges: [] });
const newItem = (): DraftItem => ({ id: newId(), projectName: '', productTypeId: '', materialId: '', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [blankComponent('TOP')], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {} });
const newClientWorkspace = (): ClientWorkspace => ({ id: newId(), customer: null, items: [newItem()], activeIndex: 0, discount: '0', parentQuote: null });
const workspaceHasData = (entry: ClientWorkspace) => !!entry.customer || entry.items.some((project) => projetoPreenchido(project));
const normalizarProjetos = (entries: DraftItem[] | undefined, componentNamesVersion?: number) => entries?.length ? restaurarNomesComponentes(entries, componentNamesVersion).map((entry) => ({ ...entry, projectName: entry.projectName ?? '', components: normalizarPedrasDasPecas(entry, entry.components), serviceAppliedValues: entry.serviceAppliedValues ?? {} })) : [newItem()];
/** Atendimentos guardados (neste aparelho ou no servidor) no formato atual do editor. */
const normalizarAtendimentos = (entries: Partial<ClientWorkspace>[], componentNamesVersion = 1): ClientWorkspace[] => entries.map((entry) => ({ ...newClientWorkspace(), ...entry, id: entry.id ?? newId(), customer: entry.customer ?? null, items: normalizarProjetos(entry.items, componentNamesVersion), activeIndex: Math.min(Math.max(0, entry.activeIndex ?? 0), Math.max(0, (entry.items?.length ?? 1) - 1)), discount: entry.discount ?? '0', parentQuote: entry.parentQuote ?? null }));
// roundUp (Orçamento Rápido, "M² fechado") só afeta o m² usado para calcular o
// valor do material — as medidas exibidas, o desenho técnico e o que é salvo no
// orçamento/PDF sempre usam component.lengthCm/widthCm exatos, sem passar por aqui.
const calculateDraftComponent = (component: DraftComponent, roundUp = false) => {
  try {
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
  const workspacesAtuais = useRef(workspaces);
  workspacesAtuais.current = workspaces;
  // Editando um orçamento: de onde ele foi aberto (o caminho, o cancelar e o salvar voltam para lá).
  const [origem] = useState(() => quoteId && typeof window !== 'undefined' ? lerOrigem(new URLSearchParams(window.location.search)) : SEM_ORIGEM);
  // No computador, a barra do atendimento vai para a barra de cima (ao lado do sino); no celular fica na página.
  const celular = useCelular();
  const [alvoCabecalho, setAlvoCabecalho] = useState<HTMLElement | null>(null);
  useEffect(() => { setAlvoCabecalho(document.getElementById('application-header-tabs')); }, []);
  const [error, setError] = useState('');
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING' | null>(null);
  const [customerTarget, setCustomerTarget] = useState<CustomerTarget | null>(null);
  const [customerError, setCustomerError] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  /** Novo cadastro como orçamento sem cadastro: nenhum dado é exigido para já fazer os projetos. */
  const [clienteRapido, setClienteRapido] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' });
  const [summarySelection, setSummarySelection] = useState<number | 'TOTAL'>(0);
  /** Aviso depois de usar um desenho técnico no orçamento. */
  const [avisoDesenho, setAvisoDesenho] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [componentNamesVersion, setComponentNamesVersion] = useState(0);
  // "Duplicar projeto": janela com o nome do novo projeto (e do desenho técnico copiado).
  const [janelaDuplicar, setJanelaDuplicar] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [erroDuplicar, setErroDuplicar] = useState('');
  const savedRef = useRef(false);
  const latestDraft = useRef<string>('');
  const workspace = workspaces[activeClientIndex] ?? workspaces[0];
  const customer = workspace.customer;
  const items = workspace.items;
  const activeIndex = workspace.activeIndex;
  const discount = workspace.discount;
  const parentQuote = workspace.parentQuote;
  const setWorkspaceValue = <K extends keyof ClientWorkspace>(key: K, value: SetStateAction<ClientWorkspace[K]>) => setWorkspaces(current => current.map(entry => entry.id === workspace.id ? { ...entry, [key]: typeof value === 'function' ? (value as (current: ClientWorkspace[K]) => ClientWorkspace[K])(entry[key]) : value } : entry));
  const setCustomer = (value: Customer | null | ((current: Customer | null) => Customer | null)) => setWorkspaceValue('customer', value);
  const setItems = (value: SetStateAction<DraftItem[]>) => setWorkspaceValue('items', value);
  const setActiveIndex = (value: SetStateAction<number>) => setWorkspaceValue('activeIndex', value);
  const setDiscount = (value: string | ((current: string) => string)) => setWorkspaceValue('discount', value);
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
      const stored = localStorage.getItem(quoteDraftStorageKey) ?? (currentUser?.role === 'SUPER_ADMIN' ? localStorage.getItem(legacyQuoteDraftStorageKey) : null);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<{ customer: Customer | null; customerMode: 'NEW' | 'EXISTING' | null; customerForm: typeof customerForm; items: DraftItem[]; activeIndex: number; discount: string; parentQuote: QuoteLink | null; componentNamesVersion: number; workspaces: Partial<ClientWorkspace>[]; activeClientIndex: number }>;
        const normalizeItems = (entries: DraftItem[] | undefined) => normalizarProjetos(entries, draft.componentNamesVersion);
        if (Array.isArray(draft.workspaces) && draft.workspaces.length) {
          setWorkspaces(normalizarAtendimentos(draft.workspaces, draft.componentNamesVersion));
          if (typeof draft.activeClientIndex === 'number') setActiveClientIndex(Math.min(Math.max(0, draft.activeClientIndex), draft.workspaces.length - 1));
        } else {
          if (Array.isArray(draft.items)) draft.items = restaurarNomesComponentes(draft.items, draft.componentNamesVersion);
          if (draft.parentQuote) setParentQuote(draft.parentQuote);
          if (draft.customer) setCustomer(draft.customer);
          if (draft.customerForm) setCustomerForm(draft.customerForm);
          if (Array.isArray(draft.items) && draft.items.length) setItems(normalizeItems(draft.items));
          if (typeof draft.activeIndex === 'number') setActiveIndex(Math.min(Math.max(0, draft.activeIndex), Math.max(0, (draft.items?.length ?? 1) - 1)));
          if (typeof draft.discount === 'string') setDiscount(draft.discount);
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
  latestDraft.current = JSON.stringify({ customer, customerMode, customerForm, items, activeIndex, discount, parentQuote, componentNamesVersion, workspaces, activeClientIndex, expectedUpdatedAt: editingQuote?.updatedAt });
  // Clientes abertos e os seus projetos ficam também no servidor: iguais no celular e no computador.
  // Cada aparelho só escolhe qual cliente e qual projeto estão abertos na tela.
  const rascunhoServidor = useRascunhoServidor({
    chave: `${quoteDraftStorageKey}:sincronia`, ativo: !quoteId && draftHydrated && !!currentUser?.id, espacos: workspaces, temDados: workspaceHasData,
    normalizar: (entradas) => normalizarAtendimentos(entradas),
    receber: (recebidos) => {
      const abertoId = workspace.id;
      setWorkspaces((current) => {
        const projetoAberto = new Map(current.map((entry) => [entry.id, entry.activeIndex]));
        const lista = recebidos.map((entry) => ({ ...entry, activeIndex: Math.min(projetoAberto.get(entry.id) ?? 0, entry.items.length - 1) }));
        return lista.length ? lista : [current.find((entry) => !workspaceHasData(entry)) ?? newClientWorkspace()];
      });
      const aberto = recebidos.findIndex((entry) => entry.id === abertoId);
      setActiveClientIndex(Math.max(0, aberto));
      if (aberto < 0) setSummarySelection(0);
    },
  });
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
        if (!podeEditarOrcamento(quote)) throw new Error('Este orçamento está encerrado. Crie um complemento ou reabra-o como retrabalho.');
        setEditingQuote(quote); setCustomer(quote.customer); setCustomerMode(null);
        setItems(quote.items.map(itemSalvoParaRascunho)); setDiscount(String(quote.discountAmount));
        try {
          const stored = JSON.parse(localStorage.getItem(quoteDraftStorageKey) || 'null');
          if (stored?.expectedUpdatedAt === quote.updatedAt && stored.items?.length) {
            setItems(stored.items.map((entry: DraftItem) => ({ ...entry, components: normalizarPedrasDasPecas(entry, entry.components) }))); setDiscount(stored.discount);
            if (stored.customer) setCustomer(stored.customer);
          }
        } catch {}
        setComponentNamesVersion(1);
        setDraftHydrated(true);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a edição.'); });
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
  // Projeto antigo com área manual (sem peças): só consulta; o Orçamento Rápido é feito por peças.
  const areaManual = item.calculationMode === 'MANUAL_M2';
  const activeServices = servicesFor(item);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  // M² fechado é da empresa (Materiais e serviços → Serviços e acabamentos), sempre marcado nos
  // orçamentos novos. Orçamento salvo mantém como foi salvo: o valor dele nunca muda ao editar.
  const m2Fechado = catalog?.settings?.closedSquareMeter ?? true;
  const arredondaM2 = (draft: DraftItem) => quoteId ? !!draft.arredondarM2 : m2Fechado;
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
    const calculated = calculateDraftComponent(component, arredondaM2(draft));
    if (!calculated || !material) return 0;
    const materialValue = calcularLinha({ billingUnit: material.billingUnit, unitPrice: material.currentPrice, billedQuantity: calculated.billableArea }).subtotal;
    const edgeValue = calcularTotalOrcamento(component.edges.map(edge => edgeCalculatedSubtotal(draft, component, edge)));
    return calcularTotalOrcamento([materialValue, edgeValue]);
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
    // Mesma conta da API: m² com as medidas em mm inteiros.
    const areaRecorte = () => { try { return calcularAreaRetangularM2(centimetrosParaMilimetros(cutout.lengthCm ?? ''), centimetrosParaMilimetros(cutout.widthCm ?? ''), cutout.quantity); } catch { return 0; } };
    const quantity = service.billingUnit === 'SQUARE_METER' ? areaRecorte() : service.billingUnit === 'FIXED' ? 1 : cutout.quantity;
    return quantity > 0 ? calcularLinha({ billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0;
  };
  const itemSummary = (draft: DraftItem) => {
    const material = materialFor(draft);
    const components = draft.components.map(component => calculateDraftComponent(component, arredondaM2(draft))).filter(Boolean) as ReturnType<typeof calcularComponente>[];
    const measuredArea = components.length ? somarAreasComponentes(components) : 0;
    const area = draft.calculationMode === 'MANUAL_M2' ? decimal(draft.manualM2) : measuredArea;
    // Serviços por m² usam a área exata das peças, como a API: o M² fechado vale só para a pedra.
    const exatos = draft.components.map(component => calculateDraftComponent(component)).filter(Boolean) as ReturnType<typeof calcularComponente>[];
    const areaServicos = draft.calculationMode === 'MANUAL_M2' ? area : exatos.length ? somarAreasComponentes(exatos) : 0;
    const materialSubtotal = draft.calculationMode === 'MANUAL_M2'
      ? (material ? calcularLinha({ billingUnit: material.billingUnit, unitPrice: material.currentPrice, billedQuantity: area }).subtotal : 0)
      : draft.components.reduce((sum, component) => { const selected = materialFor(draft, component); const measured = calculateDraftComponent(component, arredondaM2(draft)); return sum + (selected && measured ? calcularLinha({ billingUnit: selected.billingUnit, unitPrice: selected.currentPrice, billedQuantity: measured.billableArea }).subtotal : 0); }, 0);
    let calculatedServices = 0;
    let serviceDiscounts = 0;
    const serviceBreakdown: Array<{ id: string; name: string; amount: number }> = [];
    const addServiceBreakdown = (rawName: string, amount: number) => {
      if (amount <= 0) return;
      const name = /(?:^|\D)45\s*(?:°|º|graus?)/i.test(rawName) ? 'Acabamento 45°' : rawName.trim() || 'Acabamento';
      const existing = serviceBreakdown.find((entry) => entry.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
      if (existing) existing.amount = calcularTotalOrcamento([existing.amount, amount]);
      else serviceBreakdown.push({ id: `service-${name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-')}`, name, amount });
    };
    const draftServices = servicesFor(draft);
    const directServices = draftServices.filter((service) => draft.serviceIds.includes(service.id)).reduce((sum, service) => {
      const quantity = billedServiceQuantity(service, areaServicos, draft.serviceQuantities);
      const calculated = quantity > 0 ? calcularLinhaServico({ serviceName: service.name, billingUnit: service.billingUnit, unitPrice: service.currentPrice, billedQuantity: quantity }).subtotal : 0;
      const applied = draft.serviceAppliedValues[service.id] === undefined ? calculated : currencyDecimal(draft.serviceAppliedValues[service.id]);
      calculatedServices += calculated;
      serviceDiscounts += Math.max(0, calculated - applied);
      addServiceBreakdown(service.name, applied);
      return sum + applied;
    }, 0);
    const calculatedComponents = draft.components.reduce((sum, component) => sum + componentCalculatedTotal(draft, component), 0);
    const appliedEdges = draft.components.reduce((sum, component) => sum + calcularTotalOrcamento(component.edges.map(edge => edge.appliedTotal === undefined ? edgeCalculatedSubtotal(draft, component, edge) : currencyDecimal(edge.appliedTotal))), 0);
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
    const total = unchanged ? arredondarMoeda(Number(saved.total)) : calcularTotalOrcamento([componentTotal, directServices, cutoutsTotal]);
    return { area, materialSubtotal, componentsTotal: componentTotal, componentBreakdown, additionalServicesTotal: calcularTotalOrcamento([directServices, cutoutsTotal]), serviceBreakdown, servicesSubtotal: calcularTotalOrcamento([directServices, appliedEdges, cutoutsTotal]), calculatedComponents, calculatedTotal: calcularTotalOrcamento([(draft.calculationMode === 'MANUAL_M2' ? materialSubtotal : calculatedComponents), calculatedServices, calculatedCutouts]), individualDiscountTotal: calcularTotalOrcamento([componentDiscounts, serviceDiscounts, cutoutDiscounts]), total };
  };
  const summaries = useMemo(() => items.map(itemSummary), [items, catalog, editingQuote]);
  const gross = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const discountValue = currencyDecimal(discount);
  const total = calcularTotalOrcamento(summaries.map((summary) => summary.total), Math.min(discountValue, gross));
  const updateItem = (patch: Partial<DraftItem>) => setItems((current) => current.map((entry, index) => index === activeIndex ? { ...entry, ...patch } : entry));
  const selectProject = (index: number) => { setActiveIndex(index); setSummarySelection(index); };
  const summaryIsTotal = summarySelection === 'TOTAL';
  const selectedSummary = typeof summarySelection === 'number' ? summaries[summarySelection] : undefined;
  const selectedComponentBreakdown = selectedSummary?.componentBreakdown ?? [];
  const selectedServiceBreakdown = selectedSummary?.serviceBreakdown ?? [];
  useEffect(() => {
    if (summarySelection !== 'TOTAL' && summarySelection !== activeIndex) setSummarySelection(activeIndex);
  }, [activeIndex, summarySelection]);

  /** Coloca o cliente no atendimento de destino (novo, um atendimento aberto ou o atual). */
  const selectCustomer = (entry: Customer, target: CustomerTarget | null = customerTarget) => {
    // Pode ser chamado depois de esperar a API: vale a lista de atendimentos mais recente. Se o atendimento
    // de destino saiu enquanto isso (ex.: veio o rascunho de outro aparelho), o cliente vai para um novo,
    // nunca para o de outro cliente.
    const abertos = workspacesAtuais.current;
    const destinoId = target?.kind === 'WORKSPACE' ? target.workspaceId : null;
    if (destinoId && !abertos.some(candidate => candidate.id === destinoId)) target = { kind: 'NEW_WORKSPACE' };
    if (target?.kind === 'NEW_WORKSPACE') {
      const fresh = newClientWorkspace();
      fresh.customer = entry;
      fresh.items = fresh.items.map(project => ({ ...project, productTypeId: catalog?.productTypes[0]?.id ?? '' }));
      setWorkspaces(current => [...current, fresh]);
      setActiveClientIndex(abertos.length);
      setSummarySelection(0);
    } else if (target?.kind === 'WORKSPACE') {
      const targetWorkspaceId = target.workspaceId;
      setWorkspaces(current => current.map(candidate => candidate.id === targetWorkspaceId ? { ...candidate, customer: entry } : candidate));
      setActiveClientIndex(abertos.findIndex(candidate => candidate.id === targetWorkspaceId));
      setSummarySelection(0);
    } else setCustomer(entry);
    setCustomerTarget(null);
    setEditingCustomerId(null);
    setCustomerMode(null);
    setCustomerForm({ name: entry.name, phone: entry.phone ?? '', document: entry.document ?? '', email: entry.email ?? '', address: entry.address ?? '', neighborhood: entry.neighborhood ?? '', city: entry.city ?? '', postalCode: entry.postalCode ?? '', complement: entry.complement ?? '', notes: entry.notes ?? '' });
    setCustomerSearch('');
    setCustomers([]);
  };
  const openCustomerSearch = () => { setCustomerError(''); setEditingCustomerId(null); setCustomerMode('EXISTING'); setCustomerSearch(''); setCustomers([]); };
  const openNewCustomer = () => { setCustomerError(''); setEditingCustomerId(null); setClienteRapido(false); setCustomerMode('NEW'); setCustomerForm({ name: '', phone: '', document: '', email: '', address: '', neighborhood: '', city: '', postalCode: '', complement: '', notes: '' }); };
  const editCustomer = () => { if (!customer) return; selectCustomer(customer); setEditingCustomerId(customer.id); setCustomerMode('NEW'); };
  const novoClienteRapido = clienteRapido && !editingCustomerId;
  const editandoClienteRapido = !!editingCustomerId && !!customer?.isQuick;
  const closeCustomerDialog = () => { if (savingCustomer) return; setCustomerError(''); setCustomerMode(null); setCustomerTarget(null); setEditingCustomerId(null); };
  const customerTargetForNewTab = (): CustomerTarget => {
    const empty = workspaces.find(entry => !entry.customer && !entry.parentQuote && entry.items.every(project => !projetoPreenchido(project)));
    return empty ? { kind: 'WORKSPACE', workspaceId: empty.id } : { kind: 'NEW_WORKSPACE' };
  };
  // "Orçamento sem cadastro" (menu do Cliente): cria o cliente sem nenhum dado e já seleciona, sem abrir o cadastro.
  // Se o atendimento aberto já tem cliente, abre outro (como "+ Outro cliente"): os clientes abertos continuam
  // na lista, cada um com os seus projetos, até serem salvos ou apagados.
  async function orcamentoSemCadastro() {
    if (savingCustomer) return;
    const destino: CustomerTarget = customer ? customerTargetForNewTab() : { kind: 'WORKSPACE', workspaceId: workspace.id };
    setSavingCustomer(true);
    setError('');
    try { selectCustomer(await api<Customer>('/customers', { method: 'POST', body: JSON.stringify({ quick: true }) }), destino); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o orçamento sem cadastro.'); }
    finally { setSavingCustomer(false); }
  }
  // "+ Outro cliente": escolhe (ou cadastra) o cliente e só então abre o novo atendimento.
  const adicionarOutroCliente = () => { setCustomerTarget(customerTargetForNewTab()); openCustomerSearch(); };
  async function salvarCliente(event: FormEvent) {
    event.preventDefault();
    if (savingCustomer) return;
    setSavingCustomer(true);
    setCustomerError('');
    try { const payload = payloadCliente(customerForm, clienteRapido && !editingCustomerId); const saved = editingCustomerId ? await api<Customer>('/customers/' + editingCustomerId, { method: 'PATCH', body: JSON.stringify(payload) }) : await api<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) }); selectCustomer(saved); }
    catch (cause) { setCustomerError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.'); }
    finally { setSavingCustomer(false); }
  }
  function adicionarProjeto() { setItems((current) => [...current, { ...newItem(), productTypeId: catalog?.productTypes[0]?.id ?? '', arredondarM2: m2Fechado }]); setActiveIndex(items.length); }
  const nomesDosProjetos = items.map((projeto, index) => projeto.projectName.trim() || `Projeto ${index + 1}`);
  /**
   * "Duplicar projeto" (com o nome escolhido na janela): cópia fiel do projeto atual logo depois
   * dele, já aberta para ajustar. Com desenho técnico, a cópia ganha uma cópia do desenho, com o
   * mesmo nome e só dela: mexer no desenho de um não muda o do outro.
   */
  async function duplicarProjetoAtual(nome: string) {
    const original = items[activeIndex];
    if (!original || duplicando) return;
    const destino = activeIndex + 1;
    let copia = duplicarProjeto(original, nome);
    const vinculo = vinculoDesenho(original);
    if (vinculo) {
      setDuplicando(true); setErroDuplicar('');
      try {
        const desenho = await api<{ designId: string; nome: string; versao: number }>(`/designs/${vinculo.designId}/copy`, { method: 'POST', body: JSON.stringify({ name: nome.slice(0, 120) }) });
        copia = duplicarProjeto(original, nome, undefined, { designId: desenho.designId, nome: desenho.nome, versao: desenho.versao });
      } catch (cause) {
        setErroDuplicar(cause instanceof Error ? `Não foi possível copiar o desenho técnico do projeto: ${cause.message}` : 'Não foi possível copiar o desenho técnico do projeto.');
        return;
      } finally { setDuplicando(false); }
    }
    setItems((current) => [...current.slice(0, destino), copia, ...current.slice(destino)]);
    selectProject(destino);
    setJanelaDuplicar(false);
  }
  async function removerProjeto(index: number) {
    const project = items[index];
    const filled = projetoPreenchido(project);
    if (filled && !await confirmar({ titulo: `Excluir ${project.projectName || 'Projeto ' + (index + 1)}?`, mensagem: 'O projeto e todos os seus dados serão removidos deste orçamento.', confirmar: 'Excluir projeto', perigo: true })) return;
    if (items.length === 1) {
      setItems([{ ...newItem(), productTypeId: catalog?.productTypes[0]?.id ?? '' }]); setActiveIndex(0); setSummarySelection(0);
    } else {
      setItems(current => current.filter((_, currentIndex) => currentIndex !== index));
      setActiveIndex(current => current > index ? current - 1 : Math.min(current, items.length - 2));
    }
  }
  async function removerEspacoCliente(index: number, confirmed = false) {
    const entry = workspaces[index];
    if (!entry) return;
    if (!confirmed && workspaceHasData(entry) && !await confirmar({ titulo: `Remover ${entry.customer?.name || 'Cliente ' + (index + 1)} deste orçamento?`, mensagem: 'Os projetos não salvos deste cliente também serão removidos. O cadastro do cliente será mantido.', confirmar: 'Remover cliente', perigo: true })) return;
    rascunhoServidor.marcarRemovido(entry.id);
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
  }
  /**
   * Abre um atendimento para o cliente (da tela do cliente: ?cliente=) ou para um complemento
   * (+ Vincular complemento: ?parent=), sem mexer nos atendimentos que já estão abertos: reaproveita
   * o que já é desse cliente (ou desse complemento) ou um vazio; senão, abre outro.
   */
  function abrirAtendimentoPara(cliente: Customer, parent: QuoteLink | null = null) {
    const abertos = workspacesAtuais.current;
    const jaAberto = abertos.findIndex(entry => parent ? entry.parentQuote?.id === parent.id : entry.customer?.id === cliente.id && !entry.parentQuote);
    if (jaAberto >= 0) { selecionarEspacoCliente(jaAberto); return; }
    const vazio = abertos.findIndex(entry => !workspaceHasData(entry) && !entry.parentQuote);
    const base = vazio >= 0 ? abertos[vazio] : { ...newClientWorkspace(), items: [{ ...newItem(), productTypeId: catalog?.productTypes[0]?.id ?? '' }] };
    const aberto = { ...base, customer: cliente, parentQuote: parent };
    setWorkspaces(current => vazio >= 0 ? current.map(entry => entry.id === base.id ? aberto : entry) : [...current, aberto]);
    setActiveClientIndex(vazio >= 0 ? vazio : abertos.length);
    setSummarySelection(0); setCustomerMode(null);
  }
  const pedidoDoEndereco = useRef(false);
  useEffect(() => {
    if (quoteId || !draftHydrated || pedidoDoEndereco.current) return;
    const parametros = new URLSearchParams(window.location.search);
    const parent = parametros.get('parent'), cliente = parametros.get('cliente');
    if (!parent && !cliente) return;
    pedidoDoEndereco.current = true;
    // Não repete ao recarregar a página.
    window.history.replaceState(null, '', '/');
    (parent
      ? api<QuoteLink>(`/quotes/${parent}`).then((quote) => abrirAtendimentoPara(quote.customer as Customer, quote))
      : api<Customer>(`/customers/${cliente}`).then((entry) => abrirAtendimentoPara(entry))
    ).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o cliente.'));
  }, [quoteId, draftHydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  function selecionarEspacoCliente(index: number) {
    if (index < 0 || index >= workspaces.length) return;
    setActiveClientIndex(index);
    setSummarySelection(0);
  }
  const projectProblem = (draft: DraftItem): { message: string; componentId?: string } | null => {
    draft = prepararItemRapido(draft);
    if (draft.calculationMode === 'MANUAL_M2') {
      if (!materialFor(draft)) return { message: 'Selecione o material.' };
      if (!isSuperAdmin) return { message: 'O cálculo manual requer o perfil Super administrador.' };
      if (!(decimal(draft.manualM2) > 0)) return { message: 'Informe uma área manual maior que zero.' };
      if (!draft.manualJustification.trim()) return { message: 'Informe a justificativa da área manual.' };
      return null;
    }
    if (!draft.components.length) return { message: 'Adicione ao menos uma peça.' };
    for (const [index, component] of draft.components.entries()) {
      const name = component.label.trim() || `Componente ${index + 1}`;
      if (!materialFor(draft, component)) return { componentId: component.id, message: `${name}: selecione o material dessa peça no campo Material.` };
      if (!calculateDraftComponent(component, arredondaM2(draft))) return { componentId: component.id, message: `${name}: confira comprimento, largura/altura e quantidade. As medidas devem ser maiores que zero.` };
    }
    return null;
  };
  const isEmptyQuickProject = (project: DraftItem) => {
    return !project.projectName.trim() && !project.materialId && !project.manualM2 && !project.manualJustification
      && project.components.length <= 1 && !project.cutouts.length && !project.serviceIds.length
      && project.components.every(component => !component.label.trim() && !component.materialId && !component.lengthCm && !component.widthCm && component.quantity === 1 && component.componentType === 'TOP' && !component.edges.length && component.appliedTotal === undefined);
  };
  // Desenho técnico usado no orçamento: vira o projeto dele no resumo (ou atualiza o que já veio dele),
  // com as mesmas peças e o mesmo valor que o desenho mostrou. Projeto vazio aberto é aproveitado.
  const usarDesenhoTecnico = (desenho: DesenhoUsado) => {
    const existente = items.findIndex((projeto) => vinculoDesenho(projeto)?.designId === desenho.designId);
    const alvo = existente >= 0 ? existente : items[activeIndex] && isEmptyQuickProject(items[activeIndex]) ? activeIndex : items.length;
    const anterior = items[alvo];
    const projeto = projetoDoDesenho(desenho.estimativa.item, {
      id: anterior?.id ?? newId(), projectName: existente >= 0 && anterior.projectName.trim() ? anterior.projectName : desenho.nome,
      productTypeId: anterior?.productTypeId || catalog?.productTypes[0]?.id || '', m2Fechado,
      vinculo: { designId: desenho.designId, nome: desenho.nome, versao: desenho.versao, total: desenho.estimativa.total, aceitoEm: new Date().toISOString() },
    });
    setItems((current) => alvo < current.length ? current.map((entry, index) => index === alvo ? projeto : entry) : [...current, projeto]);
    setActiveIndex(alvo); setSummarySelection(alvo); setError('');
    setAvisoDesenho(`${projeto.projectName}: ${formatarMoeda(desenho.estimativa.total)} do desenho técnico ${existente >= 0 ? 'atualizado' : 'adicionado'} no resumo do orçamento.`);
  };
  // Antes de abrir o desenho técnico de um projeto deste orçamento, o desenho recebe o que mudou no Orçamento Rápido.
  const levarOrcamentoAoDesenho = async (designId: string) => {
    const projeto = items.find((entrada) => vinculoDesenho(entrada)?.designId === designId);
    const vinculo = projeto && vinculoDesenho(projeto);
    if (!projeto || !vinculo) return;
    try {
      const troca = await api<{ sincronia?: SincroniaDesenho; avisos: string[]; versao: number; nome: string }>(`/designs/${designId}/sincronizar`, { method: 'POST',
        body: JSON.stringify({ projeto: projetoParaDesenho(projeto), ...(vinculo.sincronia ? { sincronia: vinculo.sincronia } : {}) }) });
      setItems((atual) => atual.map((entrada) => {
        const ligado = entrada.id === projeto.id ? vinculoDesenho(entrada) : undefined;
        return ligado ? { ...entrada, drawingData: { ...entrada.drawingData, desenhoTecnico: { ...ligado, nome: troca.nome, versao: troca.versao, sincronia: troca.sincronia } } } : entrada;
      }));
      if (troca.avisos.length) setAvisoDesenho(troca.avisos.join(' '));
    } catch (cause) {
      setAvisoDesenho(`As mudanças do orçamento não foram levadas ao desenho técnico agora (${cause instanceof Error ? cause.message : 'erro de conexão'}); elas entram na próxima vez que ele for aberto.`);
    }
  };
  // Desenho técnico do projeto aberto: criado com o nome do projeto, já com as peças do Orçamento Rápido, e ligado a ele.
  const criarDesenhoDoProjeto = async () => {
    const projeto = items[activeIndex];
    if (!customer || !projeto) throw new Error('Selecione o cliente e o projeto antes de criar o desenho.');
    const nome = (projeto.projectName.trim() || `Projeto ${activeIndex + 1}`).slice(0, 120);
    const criado = await api<{ designId: string }>(`/customers/${customer.id}/designs`, { method: 'POST', body: JSON.stringify({ name: nome }) });
    const troca = await api<{ sincronia?: SincroniaDesenho; avisos: string[]; versao: number; nome: string }>(`/designs/${criado.designId}/sincronizar`, { method: 'POST', body: JSON.stringify({ projeto: projetoParaDesenho(projeto) }) });
    const desenhoTecnico = { designId: criado.designId, nome: troca.nome, versao: troca.versao, total: 0, aceitoEm: new Date().toISOString(), ...(troca.sincronia ? { sincronia: troca.sincronia } : {}) };
    setItems((atual) => atual.map((entrada) => entrada.id === projeto.id ? { ...entrada, drawingData: { ...entrada.drawingData, desenhoTecnico } } : entrada));
    if (troca.avisos.length) setAvisoDesenho(troca.avisos.join(' '));
    return criado.designId;
  };
  // Peça em L, U, curva ou desenho livre: a medida muda no desenho técnico, não no Orçamento Rápido.
  const medidaPeloDesenho = (component: DraftComponent) => {
    const origem = vinculoDesenho(item)?.sincronia?.pecas[component.id];
    return origem && !origem.recursoId && origem.forma !== 'RETANGULO'
      ? <p className="quick-medida-desenho"><Icone nome="esquadro" tamanho={13} />{origem.forma === 'COMPOSTA' ? 'Parte de uma peça em L ou U' : 'Peça com curva ou em desenho livre'} do desenho técnico: a medida muda no desenho.</p> : null;
  };
  const prepareDraftForSave = (draft: DraftItem) => {
    const prepared = prepararItemRapido(draft);
    const arredondar = prepared.calculationMode === 'DIMENSIONS' && arredondaM2(prepared);
    const draftServices = servicesFor(prepared);
    const omitted = new Set<string>();
    // "M² fechado": grava o valor de material calculado com a área arredondada como
    // valor final da peça, para o orçamento cobrar por ele. Um valor final já digitado
    // manualmente é preservado (componentAppliedTotal respeita component.appliedTotal
    // como sobreposição antes de retornar o valor a gravar aqui). As medidas
    // (lengthCm/widthCm) nunca são alteradas — o desenho técnico e o PDF continuam
    // mostrando exatamente o que foi digitado.
    // A marca m2Fechado no projeto faz o valor voltar a ser calculado ao reabrir (itemSalvoParaRascunho).
    // Saia e vista antigas (acabamento) sem a altura não vão: entram como serviço do projeto.
    const components = prepared.components.map(component => ({ ...component,
      appliedTotal: arredondar ? componentAppliedTotal(prepared, component).toFixed(2).replace('.', ',') : component.appliedTotal,
      edges: component.edges.filter(edge => {
      const service = draftServices.find(entry => entry.id === edge.serviceId);
      const stripWithoutMeasure = !!acabamentoBordaPedra(service?.name ?? '') && !(decimal(edge.heightCm ?? '') > 0);
      if (stripWithoutMeasure) omitted.add(edge.serviceId);
      return !stripWithoutMeasure;
    }) }));
    const { m2Fechado: _marca, ...semMarca } = prepared.drawingData ?? {};
    const drawingData = !prepared.drawingData ? undefined : arredondar ? { ...prepared.drawingData, m2Fechado: true } : 'm2Fechado' in prepared.drawingData ? semMarca : prepared.drawingData;
    if (!omitted.size && !arredondar && drawingData === prepared.drawingData) return prepared;
    return { ...prepared, components, drawingData, serviceIds: [...new Set([...prepared.serviceIds, ...omitted])], serviceQuantities: { ...prepared.serviceQuantities, ...Object.fromEntries([...omitted].map(serviceId => [serviceId, prepared.serviceQuantities[serviceId] ?? '1'])) } };
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
      }
      if (!activeWorkspace?.customer) openCustomerSearch();
      setError(!activeWorkspace?.customer ? 'Selecione o cliente deste grupo.' : !itemsToSave.length ? 'Adicione ao menos uma peça no orçamento rápido.' : `${itemsToSave[invalidIndex].projectName || 'Projeto ' + (invalidIndex + 1)} — ${activeProblems[invalidIndex]!.message}`);
      return;
    }
    if (activeWorkspace.parentQuote && activeWorkspace.parentQuote.customerId !== activeWorkspace.customer!.id) { setError('O complemento deve usar o cliente do orçamento vinculado.'); return; }
    if (editingQuote?.status === 'APPROVED' && !await confirmar({ titulo: 'Salvar alterações no orçamento aprovado?', mensagem: 'Revise os valores e as medidas antes de confirmar.', confirmar: 'Salvar alterações' })) return;
    setSaving(true);
    try {
      const defaultProductTypeId = catalog?.productTypes[0]?.id ?? '';
      const payload = { customerId: activeWorkspace.customer!.id, parentQuoteId: activeWorkspace.parentQuote?.id, expectedUpdatedAt: editingQuote?.updatedAt, discountAmount: activeWorkspace.discount.trim() ? currency(activeWorkspace.discount) : 0, items: itemsToSave.map((draft) => { const prepared = conciliarPlanoParaSalvar(prepareDraftForSave(draft), servicesFor(draft)); const normalized = prepared.productTypeId ? prepared : { ...prepared, productTypeId: defaultProductTypeId }; return rascunhoParaEntradaItem(normalized, snapshotFor(draft)); }) };
      const saved = await api<{ id: string }>(quoteId ? `/quotes/${quoteId}` : '/quotes', { method: quoteId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const savedActiveId = saved.id;
      if (!quoteId) await api(`/quotes/${saved.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SENT' }) });
      savedRef.current = true;
      if (!quoteId) {
        // O cliente salvo sai do atendimento também nos outros aparelhos.
        const remaining = await rascunhoServidor.concluirAtendimento(activeWorkspace.id, workspaces.filter((_, index) => index !== activeClientIndex));
        if (remaining.length) localStorage.setItem(quoteDraftStorageKey, JSON.stringify({ workspaces: remaining, activeClientIndex: 0, componentNamesVersion: 1 }));
        else localStorage.removeItem(quoteDraftStorageKey);
      } else localStorage.removeItem(quoteDraftStorageKey);
      // Salvo: abre a tela do orçamento (editando, volta com a mesma origem de antes).
      window.location.href = enderecoOrcamento(savedActiveId, quoteId ? origem : SEM_ORIGEM, { parametros: openPdf ? { pdf: '1' } : undefined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o orçamento.'); } finally { setSaving(false); }
  }
  if (quoteId && !editingQuote) return <main className="shell"><Link href={enderecoOrcamento(quoteId, origem)}>← Voltar ao orçamento</Link><p className={error ? 'form-error' : 'empty'}>{error || 'Abrindo orçamento para edição…'}</p></main>;
  if (!catalog) return <main className="shell"><p className="empty">{error || 'Carregando catálogo…'}</p></main>;

  const barraNoTopo = !celular && !!alvoCabecalho;
  const barraAtendimento = <BarraAtendimento clientes={quoteId ? [] : workspaces.map((entry) => ({ id: entry.id, nome: entry.customer?.name ?? null }))} clienteAtivo={activeClientIndex} clienteNome={customer?.name ?? null}
    projetos={items.map((draft, index) => ({ id: draft.id, nome: draft.projectName.trim() || `Projeto ${index + 1}` }))} projetoAtivo={activeIndex}
    aoEscolherCliente={selecionarEspacoCliente} aoSelecionarCliente={openCustomerSearch} aoCadastrarCliente={openNewCustomer} aoSemCadastro={() => void orcamentoSemCadastro()}
    aoOutroCliente={quoteId ? undefined : adicionarOutroCliente}
    aoRemoverCliente={!quoteId && (workspaces.length > 1 || workspaceHasData(workspace)) ? () => removerEspacoCliente(activeClientIndex) : undefined}
    aoEditarCliente={customer ? editCustomer : undefined}
    aoEscolherProjeto={selectProject} aoAdicionarProjeto={adicionarProjeto} aoExcluirProjeto={() => removerProjeto(activeIndex)} />;
  return <main className="shell project-builder">
    <ResumoMovel total={formatarMoeda(summaries[activeIndex]?.total ?? 0)} label="Total do projeto atual" />
    <header className={`project-topbar${barraNoTopo ? ' barra-no-topo' : ''}`}>
      {editingQuote ? <div className="project-edit-heading"><Caminho itens={caminhoDentroDoOrcamento({ id: editingQuote.id, number: editingQuote.number, customerId: editingQuote.customerId, customerNameSnapshot: editingQuote.customer.name, status: editingQuote.status, executionStatus: editingQuote.executionStatus }, origem)} /><h1 className="project-edit-title">Editar {editingQuote.number}</h1></div> : <h1 className="sr-only">Novo orçamento</h1>}
      {!barraNoTopo && barraAtendimento}
    </header>
    {barraNoTopo && alvoCabecalho && createPortal(barraAtendimento, alvoCabecalho)}
    {janelaDuplicar && item && <JanelaDuplicarProjeto original={nomesDosProjetos[activeIndex]} nomesDoOrcamento={nomesDosProjetos} comDesenho={!!vinculoDesenho(item)} ocupada={duplicando} erro={erroDuplicar}
      aoFechar={() => setJanelaDuplicar(false)} aoDuplicar={(nome) => void duplicarProjetoAtual(nome)} />}
    {customerMode && <Janela aberta aoFechar={closeCustomerDialog} ocupada={savingCustomer} className="customer-dialog" icone="pessoa" rotuloFechar="Fechar seleção de cliente" titulo={editingCustomerId ? 'Editar cliente' : customerMode === 'NEW' ? 'Novo cliente' : 'Selecionar cliente'}>
      <div className="customer-mode-tabs"><button type="button" disabled={savingCustomer} onClick={openCustomerSearch}>Selecionar cliente</button><button type="button" disabled={savingCustomer} onClick={openNewCustomer}>Novo cliente</button></div>
      {customerError && <p className="form-error" role="alert">{customerError}</p>}
      {customerMode === 'NEW' ? <><form className="inline-form customer-form" onSubmit={salvarCliente}>
        {!editingCustomerId && <OpcaoSemCadastro ativo={clienteRapido} aoMudar={setClienteRapido} />}
        {editandoClienteRapido && <p className="cliente-rapido-aviso">Cliente sem cadastro: informe o telefone para concluir o cadastro.</p>}
        <input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder={novoClienteRapido ? 'Nome (opcional)' : 'Nome'} aria-label="Nome" required={!novoClienteRapido} />
        <input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} placeholder={novoClienteRapido || editandoClienteRapido ? 'Telefone (opcional)' : 'Telefone'} aria-label="Telefone" required={!novoClienteRapido && !editandoClienteRapido} />
        {!novoClienteRapido && <><input value={customerForm.document} onChange={(event) => setCustomerForm({ ...customerForm, document: event.target.value })} placeholder="CPF (opcional)" />
        <input value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="E-mail" />
        <input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} placeholder="Endereço / obra" />
        <input value={customerForm.neighborhood} onChange={(event) => setCustomerForm({ ...customerForm, neighborhood: event.target.value })} placeholder="Bairro" />
        <input value={customerForm.city} onChange={(event) => setCustomerForm({ ...customerForm, city: event.target.value })} placeholder="Cidade" />
        <input value={customerForm.postalCode} onChange={(event) => setCustomerForm({ ...customerForm, postalCode: event.target.value })} placeholder="CEP" />
        <input value={customerForm.complement} onChange={(event) => setCustomerForm({ ...customerForm, complement: event.target.value })} placeholder="Complemento" />
        <textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} placeholder="Observações" /></>}
        <button className="primary-button" disabled={savingCustomer}>{savingCustomer ? 'Salvando…' : editingCustomerId ? 'Salvar alterações' : novoClienteRapido ? 'Criar sem cadastro e selecionar' : 'Salvar e selecionar cliente'}</button>
      </form><button type="button" className="text-button customer-back" disabled={savingCustomer} onClick={openCustomerSearch}>← Voltar para busca</button></> : <>
        <label className="customer-search-label">Buscar cliente existente<input className="search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Digite nome, telefone ou CPF" autoFocus /></label>
        {customerSearch.trim().length < 2 ? <p className="customer-help">Digite para localizar um cliente cadastrado.</p> : customers.length ? <div className="customer-results">{customers.map((entry) => <button className="customer-result" key={entry.id} onClick={() => selectCustomer(entry)}><strong>{entry.name}</strong><small>{contatoCliente(entry)}</small></button>)}</div> : <p className="customer-help">Nenhum cliente encontrado. <button type="button" className="text-button" onClick={openNewCustomer}>Cadastrar novo cliente</button></p>}
      </>}
    </Janela>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="quote-workspace quick-workspace"><div className="quote-form-column" id="active-project-panel" role="region" aria-label={`Projeto: ${item.projectName.trim() || `Projeto ${activeIndex + 1}`}`}>
    {editingQuote && <p className="customer-help">Edição de orçamento salvo: os preços registrados e os ajustes manuais são preservados; novos materiais e serviços utilizam o catálogo atual. <Link href={enderecoOrcamento(quoteId!, origem)} onClick={() => { savedRef.current = true; localStorage.removeItem(quoteDraftStorageKey); }}>Cancelar edição</Link></p>}
    <div className="modo-e-etapas">
    <DesenhoTecnicoNoOrcamento cliente={customer ? { id: customer.id, name: customer.name } : null} desenhosNoOrcamento={items.flatMap((projeto) => vinculoDesenho(projeto)?.designId ?? [])}
      podeRevisar={!!currentUser && temPermissao(currentUser.role, 'technical')} aoEscolherCliente={openCustomerSearch} aoSemCadastro={() => void orcamentoSemCadastro()} aoUsar={usarDesenhoTecnico} antesDeAbrir={levarOrcamentoAoDesenho}
      projetoAtual={customer && item ? { nome: item.projectName.trim() || `Projeto ${activeIndex + 1}`, pecas: item.components.filter((component) => component.lengthCm.trim() && component.widthCm.trim()).length, designId: vinculoDesenho(item)?.designId } : null}
      aoCriarDoProjeto={criarDesenhoDoProjeto} aoExcluir={(designId) => setItems((atual) => atual.map((projeto) => {
        if (vinculoDesenho(projeto)?.designId !== designId) return projeto;
        const { desenhoTecnico: _vinculo, ...drawingData } = projeto.drawingData ?? {};
        return { ...projeto, drawingData };
      }))} />
    </div>
    {avisoDesenho && <p className="catalog-notice orc-desenho-aviso" role="status">{avisoDesenho}<button type="button" className="text-button" aria-label="Fechar aviso" onClick={() => setAvisoDesenho('')}>×</button></p>}
    {vinculoDesenho(item) && <p className="customer-help orc-desenho-vinculo"><Icone nome="esquadro" tamanho={14} />Desenho técnico deste projeto: “{vinculoDesenho(item)!.nome}”. Para mudar as peças pelo desenho, abra-o em Desenho técnico e use-o de novo no orçamento.</p>}
    {areaManual
      ? <p className="catalog-notice" role="status">Projeto com área informada à mão ({item.manualM2.replace('.', ',')} m²), feito antes do Orçamento Rápido: ele fica como está. Para mudar, adicione um projeto com as peças.</p>
      : <EditorOrcamentoRapido key={item.id} item={item} materials={catalog.materials} material={item.materialId ? materialFor(item) : materialFor(item, item.components[0])} services={activeServices} onCreateService={createQuickService} onChange={updateItem} m2Fechado={arredondaM2(item)} onDuplicate={() => { setErroDuplicar(''); setJanelaDuplicar(true); }} renderComponentInfo={medidaPeloDesenho} area={component => calculateDraftComponent(component, arredondaM2(item))?.billableArea ?? 0} value={component => componentAppliedTotal(item, component)} calculateCutout={cutout => cutoutCalculatedSubtotal(item, cutout)} />}
    </div>
<aside id="quote-summary-card" className="quote-summary-card" aria-label="Resumo do orçamento"><div className="quote-visual-card"><p>Projetos únicos<br />para espaços<br />incríveis.</p><i /></div><strong>Resumo do orçamento</strong><label className="summary-project-select">Projeto em edição<select aria-label="Projeto em edição" value={summarySelection} onChange={(event) => { const value = event.target.value; if (value === 'TOTAL') { setSummarySelection('TOTAL'); return; } selectProject(Number(value)); }}>{items.map((draft, index) => <option key={draft.id} value={index}>{draft.projectName || `Projeto ${index + 1}`}</option>)}<option value="TOTAL">Total</option></select></label>{summaryIsTotal ? <div className="summary-project-totals">{items.map((draft, index) => <span key={draft.id}><span>{draft.projectName || `Projeto ${index + 1}`}</span><b>{formatarMoeda(summaries[index]?.total ?? 0)}</b></span>)}<span className="summary-grand-total"><span>Total dos projetos</span><b>{formatarMoeda(gross)}</b></span></div> : <><span>Projetos adicionados <b>{items.length}</b></span><span>Área total <b>{(selectedSummary?.area ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²</b></span>{selectedComponentBreakdown.length ? selectedComponentBreakdown.map((component) => <span key={component.id}>{component.name} <b>{formatarMoeda(component.amount)}</b></span>) : <span>Material <b>{formatarMoeda(selectedSummary?.materialSubtotal ?? 0)}</b></span>}{selectedServiceBreakdown.length ? selectedServiceBreakdown.map((service) => <span key={service.id}>{service.name} <b>{formatarMoeda(service.amount)}</b></span>) : <span>Serviços, recortes e cubas <b>{formatarMoeda(0)}</b></span>}<span>Descontos individuais <b>{formatarMoeda(selectedSummary?.individualDiscountTotal ?? 0)}</b></span><span className="summary-grand-total">Total do projeto <b>{formatarMoeda(selectedSummary?.total ?? 0)}</b></span></>}{/* Validade: sempre 10 dias úteis após a emissão (sai no PDF). Observações do orçamento: na tela do orçamento salvo. */}{!quoteId && <VincularOrcamento customer={customer} value={parentQuote} onChange={(quote) => { setParentQuote(quote); if (quote) selectCustomer(quote.customer); }} />}<small className="quote-summary-note">O orçamento é atualizado automaticamente conforme as medidas e os acabamentos.</small><label>Desconto autorizado (R$)<input aria-label="Desconto geral rápido" inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label><span>Total no Pix (10% de desconto) <b>{formatarMoeda(total)}</b></span><span>No cartão (+10%) <b>{formatarMoeda(calcularTotalCartao(total))}</b></span><div className="quote-summary-actions"><button type="button" className="save-quote-button" disabled={saving} onClick={() => salvarOrcamento(true)}>Salvar e abrir PDF</button><button type="button" className="save-draft-button" onClick={() => salvarOrcamento()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar orçamento'}</button><small>{quoteId ? 'O preenchimento é salvo automaticamente neste navegador.' : 'O preenchimento é salvo automaticamente e fica disponível no celular e no computador.'}</small></div></aside>
    </div>
  </main>;
}
