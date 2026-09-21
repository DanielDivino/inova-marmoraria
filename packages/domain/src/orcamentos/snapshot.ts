import type { ComponentType, ComponentOrientation, EdgeSide, CalculationMode } from '../calculos/components.js';

type Numeric = number | string | { toString(): string };
export type SnapshotUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';
type Adjustment = { hasManualPriceOverride: boolean; appliedSubtotal: Numeric; calculatedSubtotal: Numeric };
export type SavedCutoutPrice = { serviceNameSnapshot?: string | null; billingUnitSnapshot?: SnapshotUnit | null; unitPriceSnapshot?: Numeric | null; billedQuantity?: Numeric | null };
export type SavedEdge = Adjustment & { id: string; side: EdgeSide; customLabel?: string | null; lengthMm: number; heightMm?: number | null; serviceId: string; serviceNameSnapshot: string; billingUnitSnapshot: SnapshotUnit; unitPriceSnapshot: Numeric; billedQuantity: Numeric };
export type SavedComponent = { materialId?: string | null; materialNameSnapshot?: string | null; billingUnitSnapshot?: SnapshotUnit | null; unitPriceSnapshot?: Numeric | null; id: string; label: string; componentType: ComponentType; orientation: ComponentOrientation; lengthMm: number; widthMm: number; quantity: number; sortOrder: number; calculatedTotal: Numeric; appliedTotal: Numeric; hasManualPriceOverride: boolean; edges: SavedEdge[] };
export type SavedCutout = Adjustment & SavedCutoutPrice & { id: string; componentId?: string | null; cutoutType: 'SINK' | 'SCULPTED_SINK' | 'OVAL_SINK' | 'COOKTOP' | 'FAUCET_HOLE' | 'GENERIC_HOLE' | 'OTHER'; sizePending?: boolean; label?: string | null; lengthMm?: number | null; widthMm?: number | null; diameterMm?: number | null; positionX?: number | null; positionY?: number | null; quantity: number; serviceId?: string | null; sortOrder: number };
export type SavedService = Adjustment & { serviceId: string; serviceNameSnapshot: string; billingUnitSnapshot: SnapshotUnit; unitPriceSnapshot: Numeric; billedQuantity: Numeric };
export type SavedQuoteItem = {
  id: string; projectName?: string | null; environment?: string | null; productTypeId: string; materialId: string;
  materialNameSnapshot: string; billingUnitSnapshot: SnapshotUnit; unitPriceSnapshot: Numeric;
  calculationMode: CalculationMode; manualJustification?: string | null; quantity: number; billedQuantity: Numeric; total: Numeric;
  components: SavedComponent[]; cutouts: SavedCutout[]; services: SavedService[];
  drawingData?: unknown;
};

export function itemSalvoParaEntrada(item: SavedQuoteItem) {
  return {
    id: item.id, projectName: item.projectName || null, environment: item.environment ?? null,
    ...(item.drawingData && typeof item.drawingData === 'object' && !Array.isArray(item.drawingData) ? { drawingData: item.drawingData as Record<string, unknown> } : {}),
    productTypeId: item.productTypeId, materialId: item.materialId, calculationMode: item.calculationMode,
    manualJustification: item.calculationMode === 'MANUAL_M2' ? item.manualJustification ?? 'Orçamento legado' : undefined,
    billedQuantity: item.calculationMode === 'MANUAL_M2' ? Number(item.billedQuantity) : undefined, quantity: item.quantity,
    components: item.components.map((component, sortOrder) => ({
      id: component.id, materialId: component.materialId ?? item.materialId, label: component.label, componentType: component.componentType, orientation: component.orientation, shape: 'RECTANGLE' as const,
      lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity, sortOrder,
      appliedTotal: component.hasManualPriceOverride ? Number(component.appliedTotal) : undefined,
      edges: component.edges.map((edge) => ({
        id: edge.id, side: edge.side, customLabel: edge.customLabel ?? undefined, lengthMm: edge.lengthMm, heightMm: edge.heightMm ?? undefined,
        quantity: Math.max(1, Math.round(Number(edge.billedQuantity) / (component.quantity * edge.lengthMm * (edge.heightMm ? edge.heightMm / 1_000_000 : 1 / 1000)))),
        serviceId: edge.serviceId, appliedSubtotal: edge.hasManualPriceOverride ? Number(edge.appliedSubtotal) : undefined,
      })),
    })),
    cutouts: item.cutouts.map((cutout, sortOrder) => ({
      id: cutout.id, componentIndex: cutout.componentId ? (() => { const index = item.components.findIndex((component) => component.id === cutout.componentId); return index < 0 ? undefined : index; })() : undefined,
      cutoutType: cutout.cutoutType, sizePending: cutout.sizePending ?? false, label: cutout.label ?? '', lengthMm: cutout.lengthMm ?? undefined, widthMm: cutout.widthMm ?? undefined,
      diameterMm: cutout.diameterMm ?? undefined, positionX: cutout.positionX ?? undefined, positionY: cutout.positionY ?? undefined,
      quantity: cutout.quantity, serviceId: cutout.serviceId ?? undefined, sortOrder,
      appliedSubtotal: cutout.hasManualPriceOverride ? Number(cutout.appliedSubtotal) : undefined,
    })),
    services: item.services.map((service) => ({ serviceId: service.serviceId, billedQuantity: Number(service.billedQuantity), appliedSubtotal: service.hasManualPriceOverride ? Number(service.appliedSubtotal) : undefined })),
  };
}

/** Nova identidade para a cópia; materiais, vínculos de recortes e medidas são preservados. */
export function itemSalvoParaCopia(item: SavedQuoteItem) {
  const entrada = itemSalvoParaEntrada(item);
  return {
    ...entrada, id: undefined,
    components: entrada.components.map(componente => ({
      ...componente, id: undefined,
      edges: componente.edges.map(borda => ({ ...borda, id: undefined })),
    })),
    cutouts: entrada.cutouts.map(recorte => ({ ...recorte, id: undefined })),
  };
}
