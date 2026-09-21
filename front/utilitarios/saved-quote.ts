import { centimetrosParaMilimetros, detalheDesenhoComponente, itemSalvoParaEntrada, type SavedQuoteItem } from '@inova/domain';
import type { DraftItem } from '../componentes/orcamento/types';

const cm = (value?: number) => value === undefined ? undefined : String(value / 10);
const price = (value?: number) => value === undefined ? undefined : value.toFixed(2).replace('.', ',');
export function itemSalvoParaRascunho(saved: SavedQuoteItem): DraftItem {
  const input = itemSalvoParaEntrada(saved);
  return {
    id: saved.id, projectName: input.projectName ?? '',
    ...(input.drawingData ? { drawingData: input.drawingData } : {}),
    productTypeId: input.productTypeId, materialId: input.materialId, calculationMode: input.calculationMode,
    manualM2: String(saved.billedQuantity), manualJustification: input.manualJustification ?? '',
    components: input.components.map((component, index) => ({
      ...component, materialId: component.materialId ?? saved.materialId, lengthCm: cm(component.lengthMm)!, widthCm: cm(component.widthMm)!,
      parentComponentId: input.components[detalheDesenhoComponente(input.drawingData, index).parentComponentIndex ?? -1]?.id,
      parentSide: detalheDesenhoComponente(input.drawingData, index).parentSide,
      sillDetailCm: cm(detalheDesenhoComponente(input.drawingData, index).sillDetailMm),
      sillDetailHeightCm: cm(detalheDesenhoComponente(input.drawingData, index).sillDetailHeightMm),
      appliedTotal: price(component.appliedTotal), edges: component.edges.map((edge) => ({ ...edge, lengthCm: cm(edge.lengthMm), heightCm: cm(edge.heightMm), appliedTotal: price(edge.appliedSubtotal) })),
    })),
    cutouts: input.cutouts.map((cutout, index) => ({ ...cutout, id: saved.cutouts[index].id, lengthCm: cm(cutout.lengthMm), widthCm: cm(cutout.widthMm), diameterCm: cm(cutout.diameterMm), positionXCm: cm(cutout.positionX), positionYCm: cm(cutout.positionY), appliedTotal: price(cutout.appliedSubtotal) })),
    serviceIds: input.services.map((service) => service.serviceId),
    serviceQuantities: Object.fromEntries(input.services.map((service) => [service.serviceId, String(service.billedQuantity)])),
    serviceAppliedValues: Object.fromEntries(input.services.filter((service) => service.appliedSubtotal !== undefined).map((service) => [service.serviceId, price(service.appliedSubtotal)!])),
  };
}

const decimal = (value: string) => Number(value.replace(',', '.'));
const currency = (value: string) => {
  const parsed = Number(value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value);
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0) throw new Error('Informe um valor monetário válido, maior ou igual a zero.');
  return Math.round(parsed * 100) / 100;
};
const optionalMm = (value?: string) => value ? centimetrosParaMilimetros(value) : undefined;
const positionMm = (value?: string) => value ? Math.round(decimal(value) * 10) : undefined;

export function rascunhoParaEntradaItem(draft: DraftItem, saved?: SavedQuoteItem) {
  const componentDetails = draft.calculationMode === 'DIMENSIONS' ? draft.components.map((component) => {
    const parentComponentIndex = draft.components.findIndex((entry) => entry.id === component.parentComponentId);
    return {
      ...(parentComponentIndex >= 0 ? { parentComponentIndex } : {}),
      ...(parentComponentIndex >= 0 && component.componentType === 'BACKSPLASH' && component.parentSide ? { parentSide: component.parentSide } : {}),
      ...(component.componentType === 'SILL' && component.sillDetailCm?.trim() ? { sillDetailMm: centimetrosParaMilimetros(component.sillDetailCm) } : {}),
      ...(component.componentType === 'SILL' && component.sillDetailHeightCm?.trim() ? { sillDetailHeightMm: centimetrosParaMilimetros(component.sillDetailHeightCm) } : {}),
    };
  }) : [];
  const hasDetails = componentDetails.some((detail) => Object.keys(detail).length);
  const drawingData = draft.drawingData || hasDetails ? { ...draft.drawingData, ...(hasDetails || draft.drawingData?.componentDetails ? { componentDetails } : {}) } : undefined;
  return {
    id: saved?.id, projectName: draft.projectName.trim() || null, environment: saved?.environment ?? null,
    ...(drawingData ? { drawingData } : {}),
    productTypeId: draft.productTypeId, materialId: draft.calculationMode === 'DIMENSIONS' ? draft.components[0]?.materialId || draft.materialId : draft.materialId, calculationMode: draft.calculationMode,
    manualJustification: draft.calculationMode === 'MANUAL_M2' ? draft.manualJustification : undefined,
    billedQuantity: draft.calculationMode === 'MANUAL_M2' ? decimal(draft.manualM2) : undefined, quantity: saved?.quantity ?? 1,
    components: draft.calculationMode === 'DIMENSIONS' ? draft.components.map((component, sortOrder) => ({
      id: saved?.components.some((entry) => entry.id === component.id) ? component.id : undefined,
      materialId: component.materialId || draft.materialId || undefined,
      label: component.label, componentType: component.componentType, orientation: component.orientation, shape: 'RECTANGLE' as const,
      lengthMm: centimetrosParaMilimetros(component.lengthCm), widthMm: centimetrosParaMilimetros(component.widthCm), quantity: component.quantity,
      appliedTotal: component.appliedTotal === undefined ? undefined : currency(component.appliedTotal), sortOrder,
      edges: component.edges.map((edge) => ({ id: edge.id, side: edge.side, customLabel: edge.customLabel,
        lengthMm: optionalMm(edge.lengthCm), heightMm: optionalMm(edge.heightCm), quantity: edge.quantity, serviceId: edge.serviceId,
        appliedSubtotal: edge.appliedTotal === undefined ? undefined : currency(edge.appliedTotal),
      })),
    })) : [],
    cutouts: draft.cutouts.map((cutout, sortOrder) => ({
      id: saved?.cutouts.some((entry) => entry.id === cutout.id) ? cutout.id : undefined,
      componentIndex: cutout.componentIndex, cutoutType: cutout.cutoutType, sizePending: cutout.sizePending ?? false, label: cutout.label,
      lengthMm: optionalMm(cutout.lengthCm), widthMm: optionalMm(cutout.widthCm), diameterMm: optionalMm(cutout.diameterCm),
      positionX: positionMm(cutout.positionXCm), positionY: positionMm(cutout.positionYCm), quantity: cutout.quantity, serviceId: cutout.serviceId, sortOrder,
      appliedSubtotal: cutout.appliedTotal === undefined ? undefined : currency(cutout.appliedTotal),
    })),
    services: draft.serviceIds.map((serviceId) => ({ serviceId, billedQuantity: decimal(draft.serviceQuantities[serviceId] ?? '1') || undefined,
      appliedSubtotal: draft.serviceAppliedValues[serviceId] === undefined ? undefined : currency(draft.serviceAppliedValues[serviceId]),
    })),
  };
}
