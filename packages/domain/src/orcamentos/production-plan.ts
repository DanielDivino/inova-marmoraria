import type { ComponentType } from '../calculos/components.js';

/**
 * Plano de produção: como o orçamento comercial (item.components/cutouts) vira
 * peças físicas para fabricar. Vive inteiramente dentro de drawingData — nunca
 * é convertido de volta em components/cutouts comerciais, e nunca carrega preço
 * (appliedTotal, calculatedTotal, materialSubtotal, desconto). O Orçamento
 * Rápido continua sendo a única fonte do valor cobrado.
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

/**
 * Divide um total (mm inteiro) em N partes o mais iguais possível, distribuindo
 * o resto (em mm) entre as primeiras peças. A soma bate exatamente com o total,
 * sempre — nunca há erro de arredondamento por float.
 */
export function dividirIgualmente(totalMm: number, partes: number): number[] {
  inteiroPositivo(totalMm, 'Medida total');
  inteiroPositivo(partes, 'Número de peças');
  const base = Math.floor(totalMm / partes);
  const resto = totalMm - base * partes;
  return Array.from({ length: partes }, (_, index) => base + (index < resto ? 1 : 0));
}

export type ResultadoDivisao =
  | { status: 'completo'; usadoMm: number }
  | { status: 'excedeu'; usadoMm: number; excedenteMm: number }
  | { status: 'incompleto'; usadoMm: number; restanteMm: number };

/** Confere se a soma das peças bate com o total (mm inteiro, sem float). */
export function validarDivisao(totalMm: number, pecasMm: number[]): ResultadoDivisao {
  inteiroPositivo(totalMm, 'Medida total');
  const usadoMm = pecasMm.reduce((sum, mm) => sum + mm, 0);
  if (usadoMm > totalMm) return { status: 'excedeu', usadoMm, excedenteMm: usadoMm - totalMm };
  if (usadoMm < totalMm) return { status: 'incompleto', usadoMm, restanteMm: totalMm - usadoMm };
  return { status: 'completo', usadoMm };
}

/** Preenche a última peça automaticamente com o que sobrou do total. */
export function calcularUltimaPeca(totalMm: number, pecasAnterioresMm: number[]): number {
  inteiroPositivo(totalMm, 'Medida total');
  const usado = pecasAnterioresMm.reduce((sum, mm) => sum + mm, 0);
  const restante = totalMm - usado;
  if (restante <= 0) throw new Error('Não há medida restante para a última peça — reduza as anteriores.');
  return restante;
}

/**
 * Um lado deve ser sugerido nesta peça resultante de uma divisão por
 * comprimento? FRONT/BACK (correm o comprimento todo) valem para todas as
 * peças; LEFT fica só na primeira, RIGHT só na última. Divisão por largura
 * (WIDTH) ainda não tem heurística própria — copia tudo, mantendo simples.
 */
export function ladoHerdado(side: ProductionEdgeSide, splitAxis: ProductionSplitAxis, pieceIndex: number, totalPieces: number): boolean {
  if (side === 'CUSTOM') return false;
  if (splitAxis === 'WIDTH') return true;
  if (side === 'FRONT' || side === 'BACK') return true;
  if (side === 'LEFT') return pieceIndex === 0;
  if (side === 'RIGHT') return pieceIndex === totalPieces - 1;
  return false;
}

type ComponentSillDetail = { sillDetailMm?: number; sillDetailHeightMm?: number; sillTopWidthMm?: number; sillBottomWidthMm?: number; sillFinalWidthMm?: number; sillOverlapMm?: number };

/** Peça de produção inicial (sem dividir) a partir de um componente comercial.
 * Preserva o detalhe do peitoril (simples ou duplo) da peça comercial de
 * origem — a peça inicial ainda é a MESMA peça física, só representada como
 * produção; dividir de fato (dividirComponente) não carrega esse detalhe, pois
 * peitoril não é um componente que normalmente se divide. */
export function pecaInicial(source: { id: string; label: string; componentType: ComponentType; orientation: 'HORIZONTAL' | 'VERTICAL'; lengthMm: number; widthMm: number; quantity: number; edges: ProductionEdge[]; parentComponentId?: string; parentSide?: Exclude<ProductionEdgeSide, 'CUSTOM'> } & ComponentSillDetail, newId: () => string): ProductionPiece {
  return { id: newId(), sourceComponentId: source.id, label: source.label, componentType: source.componentType, orientation: source.orientation, lengthMm: source.lengthMm, widthMm: source.widthMm, quantity: source.quantity, edges: source.edges.map((edge) => ({ ...edge })),
    parentPieceId: source.parentComponentId, parentSide: source.parentSide,
    sillDetailMm: source.sillDetailMm, sillDetailHeightMm: source.sillDetailHeightMm, sillTopWidthMm: source.sillTopWidthMm, sillBottomWidthMm: source.sillBottomWidthMm, sillFinalWidthMm: source.sillFinalWidthMm, sillOverlapMm: source.sillOverlapMm };
}

/**
 * Divide um componente comercial em N peças pelo comprimento (padrão), cada uma
 * herdando a largura e a quantidade comercial originais, com os acabamentos
 * sugeridos por ladoHerdado. lengthsMm deve somar exatamente ao comprimento do
 * componente (valide antes com validarDivisao).
 */
export function dividirComponente(source: { id: string; label: string; componentType: ComponentType; orientation: 'HORIZONTAL' | 'VERTICAL'; lengthMm: number; widthMm: number; quantity: number; edges: ProductionEdge[] }, lengthsMm: number[], splitAxis: ProductionSplitAxis, newId: () => string): ProductionPiece[] {
  if (splitAxis === 'LENGTH') {
    const total = lengthsMm.reduce((sum, mm) => sum + mm, 0);
    if (total !== source.lengthMm) throw new Error('A soma das peças deve ser igual ao comprimento comercial.');
    return lengthsMm.map((lengthMm, index) => ({
      id: newId(), sourceComponentId: source.id, label: lengthsMm.length > 1 ? `${source.label || 'Peça'} ${index + 1}` : source.label,
      componentType: source.componentType, orientation: source.orientation, lengthMm, widthMm: source.widthMm, quantity: source.quantity,
      edges: source.edges.filter((edge) => ladoHerdado(edge.side, splitAxis, index, lengthsMm.length)).map((edge) => ({ ...edge, lengthMm: edge.side === 'FRONT' || edge.side === 'BACK' ? lengthMm : edge.lengthMm })),
    }));
  }
  const total = lengthsMm.reduce((sum, mm) => sum + mm, 0);
  if (total !== source.widthMm) throw new Error('A soma das peças deve ser igual à largura comercial.');
  return lengthsMm.map((widthMm, index) => ({
    id: newId(), sourceComponentId: source.id, label: lengthsMm.length > 1 ? `${source.label || 'Peça'} ${index + 1}` : source.label,
    componentType: source.componentType, orientation: source.orientation, lengthMm: source.lengthMm, widthMm, quantity: source.quantity,
    edges: source.edges.filter((edge) => ladoHerdado(edge.side, splitAxis, index, lengthsMm.length)).map((edge) => ({ ...edge })),
  }));
}

/** Peças de rodabanca/saia/vista que seguem a mesma divisão de uma peça já dividida. */
export function seguirDivisao(pecas: ProductionPiece[], parentSide: Exclude<ProductionEdgeSide, 'CUSTOM'>, heightMm: number, componentType: ComponentType, newId: () => string): ProductionPiece[] {
  return pecas.map((peca) => ({
    id: newId(), sourceComponentId: peca.sourceComponentId, label: '', componentType, orientation: 'VERTICAL',
    lengthMm: peca.lengthMm, widthMm: heightMm, quantity: peca.quantity, edges: [], parentPieceId: peca.id, parentSide,
  }));
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
