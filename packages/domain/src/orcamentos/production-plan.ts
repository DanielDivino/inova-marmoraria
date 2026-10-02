import type { ComponentType } from '../calculos/components.js';

/**
 * Plano de produção: como o orçamento comercial (item.components/cutouts) vira
 * peças físicas para fabricar. Vive inteiramente dentro de drawingData — nunca
 * é convertido de volta em components/cutouts comerciais, e nunca carrega preço
 * (appliedTotal, calculatedTotal, materialSubtotal, desconto). O Orçamento
 * Rápido continua sendo a única fonte do valor cobrado.
 * Era feito no extinto "Com desenho"; hoje a divisão em pedras é a emenda do
 * desenho técnico. Os planos dos projetos antigos continuam sendo lidos (OS,
 * fluxo e entregas) e acompanham as peças quando o orçamento é editado.
 */
export type ProductionSplitAxis = 'LENGTH' | 'WIDTH';
export type ProductionEdgeSide = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'CUSTOM';

export type ProductionEdge = {
  side: ProductionEdgeSide;
  serviceId: string;
  serviceName: string;
  lengthMm?: number;
  heightMm?: number;
  quantity: number;
};

export type ProductionCutout = {
  id: string;
  pieceId: string;
  sourceCutoutId?: string;
  cutoutType: 'SINK' | 'SCULPTED_SINK' | 'OVAL_SINK' | 'COOKTOP' | 'FAUCET_HOLE' | 'GENERIC_HOLE' | 'OTHER';
  label: string;
  sizePending?: boolean;
  lengthMm?: number;
  widthMm?: number;
  diameterMm?: number;
  positionXMm?: number;
  positionYMm?: number;
  quantity: number;
};

export type ProductionPiece = {
  id: string;
  sourceComponentId: string;
  label: string;
  componentType: ComponentType;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  lengthMm: number;
  widthMm: number;
  quantity: number;
  edges: ProductionEdge[];
  /** Rodabanca/lateral colada a outra peça — mesmo padrão de parentComponentId/parentSide do comercial. */
  parentPieceId?: string;
  parentSide?: Exclude<ProductionEdgeSide, 'CUSTOM'>;
  sillDetailMm?: number;
  sillDetailHeightMm?: number;
  sillTopWidthMm?: number;
  sillBottomWidthMm?: number;
  sillFinalWidthMm?: number;
  sillOverlapMm?: number;
};

export type ProductionSource = {
  componentId: string;
  splitAxis: ProductionSplitAxis;
  snapshotLengthMm: number;
  snapshotWidthMm: number;
  snapshotQuantity: number;
  snapshotComponentType: ComponentType;
  snapshotMaterialId?: string;
  needsReview?: boolean;
};

export type ProductionPlan = {
  version: 1;
  sources: ProductionSource[];
  pieces: ProductionPiece[];
  cutouts: ProductionCutout[];
};

function inteiroPositivo(value: number, campo: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${campo} deve ser um inteiro maior que zero.`);
  return value;
}

type ComponentSillDetail = { sillDetailMm?: number; sillDetailHeightMm?: number; sillTopWidthMm?: number; sillBottomWidthMm?: number; sillFinalWidthMm?: number; sillOverlapMm?: number };

/** Peça de produção inicial (sem dividir) a partir de um componente comercial,
 * com o detalhe do peitoril (simples ou duplo) da peça de origem. */
export function pecaInicial(source: { id: string; label: string; componentType: ComponentType; orientation: 'HORIZONTAL' | 'VERTICAL'; lengthMm: number; widthMm: number; quantity: number; edges: ProductionEdge[]; parentComponentId?: string; parentSide?: Exclude<ProductionEdgeSide, 'CUSTOM'> } & ComponentSillDetail, newId: () => string): ProductionPiece {
  return { id: newId(), sourceComponentId: source.id, label: source.label, componentType: source.componentType, orientation: source.orientation, lengthMm: source.lengthMm, widthMm: source.widthMm, quantity: source.quantity, edges: source.edges.map((edge) => ({ ...edge })),
    parentPieceId: source.parentComponentId, parentSide: source.parentSide,
    sillDetailMm: source.sillDetailMm, sillDetailHeightMm: source.sillDetailHeightMm, sillTopWidthMm: source.sillTopWidthMm, sillBottomWidthMm: source.sillBottomWidthMm, sillFinalWidthMm: source.sillFinalWidthMm, sillOverlapMm: source.sillOverlapMm };
}

/** Estrutura padrão de drawingData.componentDetails: continua lendo/gravando plano ali. */
export function planoDeProducao(data: unknown): ProductionPlan | undefined {
  if (!data || typeof data !== 'object' || !('productionPlan' in data)) return undefined;
  const plan = (data as { productionPlan?: unknown }).productionPlan;
  if (!plan || typeof plan !== 'object') return undefined;
  const candidate = plan as Partial<ProductionPlan>;
  if (candidate.version !== 1 || !Array.isArray(candidate.pieces) || !Array.isArray(candidate.sources) || !Array.isArray(candidate.cutouts)) return undefined;
  return { version: 1, sources: candidate.sources as ProductionSource[], pieces: candidate.pieces as ProductionPiece[], cutouts: candidate.cutouts as ProductionCutout[] };
}

export function comPlanoDeProducao(data: unknown, plan: ProductionPlan): Record<string, unknown> {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return { ...base, productionPlan: plan };
}

/** O comercial mudou depois do detalhamento? Compara com o snapshot guardado na origem. */
export function precisaRevisao(source: ProductionSource, atual: { lengthMm: number; widthMm: number; quantity: number; componentType: ComponentType; materialId?: string }): boolean {
  return source.snapshotLengthMm !== atual.lengthMm || source.snapshotWidthMm !== atual.widthMm || source.snapshotQuantity !== atual.quantity || source.snapshotComponentType !== atual.componentType || source.snapshotMaterialId !== atual.materialId;
}
