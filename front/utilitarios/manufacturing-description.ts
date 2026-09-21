import { centimetrosParaMilimetros, descricaoProducaoComponente, descricaoProducaoRecorte, tituloComponenteProducao, type ManufacturingCutout, type ManufacturingLine } from '@inova/domain';
import type { DraftComponent, DraftCutout } from '../componentes/orcamento/types';

export const drawingMm = (value?: string) => { try { return centimetrosParaMilimetros(value ?? ''); } catch { return undefined; } };
const position = (value?: string) => {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10) : undefined;
};
export function descricaoProducaoRascunho(components: DraftComponent[], cutouts: DraftCutout[], services: { id: string; name: string }[]) {
  const normalizeCutout = (cutout: DraftCutout): ManufacturingCutout => ({ ...cutout,
    lengthMm: drawingMm(cutout.lengthCm), widthMm: drawingMm(cutout.widthCm), diameterMm: drawingMm(cutout.diameterCm),
    positionX: position(cutout.positionXCm), positionY: position(cutout.positionYCm),
    serviceName: services.find((service) => service.id === cutout.serviceId)?.name,
  });
  const sections: { title: string; lines: ManufacturingLine[] }[] = components.map((component, index) => {
    const parentIndex = components.findIndex((entry) => entry.id === component.parentComponentId);
    return { title: tituloComponenteProducao(component, index), lines: descricaoProducaoComponente({ ...component,
      lengthMm: drawingMm(component.lengthCm) ?? 0, widthMm: drawingMm(component.widthCm) ?? 0,
      sillDetailMm: drawingMm(component.sillDetailCm), sillDetailHeightMm: drawingMm(component.sillDetailHeightCm),
      edges: component.edges.map((edge) => ({ ...edge, lengthMm: drawingMm(edge.lengthCm), heightMm: drawingMm(edge.heightCm), serviceName: services.find((service) => service.id === edge.serviceId)?.name ?? 'Acabamento' })),
    }, cutouts.filter((cutout) => cutout.componentIndex === index).map(normalizeCutout),
    parentIndex >= 0 ? tituloComponenteProducao(components[parentIndex], parentIndex) : undefined,
    components.flatMap((entry, childIndex) => entry.parentComponentId === component.id ? [tituloComponenteProducao(entry, childIndex)] : [])) };
  });
  const unassigned = cutouts.filter((cutout) => cutout.componentIndex == null || !components[cutout.componentIndex]);
  if (unassigned.length) sections.push({ title: 'Recortes sem componente vinculado', lines: unassigned.flatMap((cutout) => descricaoProducaoRecorte(normalizeCutout(cutout))) });
  return sections;
}
