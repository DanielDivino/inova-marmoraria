import type { DraftComponent, DraftItem, EdgeSide } from '../componentes/orcamento/types';
import { componentTypeLabels, rotuloLadoBorda } from '@inova/domain';

export function criarRodabancaLateral(parent: DraftComponent, side: Exclude<EdgeSide, 'CUSTOM'>, id: string): DraftComponent {
  return { id, materialId: parent.materialId, label: `Rodabanca · ${rotuloLadoBorda(side)}`, componentType: 'BACKSPLASH', orientation: 'VERTICAL',
    parentComponentId: parent.id, parentSide: side,
    lengthCm: side === 'LEFT' || side === 'RIGHT' ? parent.widthCm : parent.lengthCm,
    widthCm: '', quantity: parent.quantity, edges: [] };
}

export function restaurarNomesComponentes(items: DraftItem[], version = 0): DraftItem[] {
  if (version >= 1) return items;
  return items.map((item) => ({ ...item, components: item.components.map((component) => ({
    ...component,
    label: component.label === componentTypeLabels[component.componentType] ? '' : component.label,
  })) }));
}

export function removerGrupoComponentes(item: DraftItem, index: number) {
  const target = item.components[index];
  const removed = new Set([target.id, ...item.components.filter((entry) => entry.parentComponentId === target.id).map((entry) => entry.id)]);
  const components = item.components.filter((entry) => !removed.has(entry.id));
  const cutouts = item.cutouts.map((cutout) => {
    if (cutout.componentIndex === undefined) return cutout;
    const previousId = item.components[cutout.componentIndex]?.id;
    const componentIndex = components.findIndex((entry) => entry.id === previousId);
    return { ...cutout, componentIndex: componentIndex >= 0 ? componentIndex : undefined };
  });
  return { components, cutouts };
}
