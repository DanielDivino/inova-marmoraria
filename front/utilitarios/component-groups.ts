import type { DraftComponent, DraftItem, EdgeSide } from '../componentes/orcamento/types';
import { componentTypeLabels, rotuloLadoBorda, tipoPresoAoLado } from '@inova/domain';

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

/** Muda a posição de uma peça na lista; os recortes continuam presos à mesma peça. */
export function moverComponente(item: Pick<DraftItem, 'components' | 'cutouts'>, de: number, para: number) {
  const components = [...item.components];
  const [movido] = components.splice(de, 1);
  if (!movido) return { components: item.components, cutouts: item.cutouts };
  components.splice(para, 0, movido);
  // Rodabanca, saia e vista presas a uma peça ficam sempre depois dela (é assim que o orçamento as guarda).
  for (let indice = 0; indice < components.length; indice++) {
    const pai = components.findIndex((entry) => entry.id === components[indice].parentComponentId);
    if (pai <= indice) continue;
    const [presa] = components.splice(indice, 1);
    components.splice(pai, 0, presa);
    indice--;
  }
  const cutouts = item.cutouts.map((cutout) => {
    if (cutout.componentIndex === undefined) return cutout;
    const componentIndex = components.findIndex((entry) => entry.id === item.components[cutout.componentIndex!]?.id);
    return { ...cutout, componentIndex: componentIndex >= 0 ? componentIndex : undefined };
  });
  return { components, cutouts };
}

/** Peças em que uma rodabanca, saia ou vista pode ficar presa: as principais (não presas a outra). */
export const pecasParaPrender = (item: Pick<DraftItem, 'components'>, id: string) =>
  item.components.filter((entry) => entry.id !== id && !entry.parentComponentId && !tipoPresoAoLado(entry.componentType));

/**
 * Prende (ou solta, sem `pai`) uma rodabanca, saia ou vista a um lado de uma peça. Sem comprimento,
 * ela pega o do lado; sem pedra própria, a da peça; presa, passa a ficar logo depois da peça na lista.
 */
export function prenderNaPeca(item: Pick<DraftItem, 'components' | 'cutouts'>, id: string, pai?: { id: string; side: Exclude<EdgeSide, 'CUSTOM'> }) {
  const dona = pai && item.components.find((entry) => entry.id === pai.id);
  const components = item.components.map((entry) => {
    if (entry.id !== id) return entry;
    if (!pai || !dona) return { ...entry, parentComponentId: undefined, parentSide: undefined };
    const comprimentoDoLado = pai.side === 'LEFT' || pai.side === 'RIGHT' ? dona.widthCm : dona.lengthCm;
    const pedra = entry.materialProprio ? {} : { materialId: dona.materialId, materialProprio: dona.materialProprio };
    return { ...entry, ...pedra, parentComponentId: pai.id, parentSide: pai.side, lengthCm: entry.lengthCm.trim() ? entry.lengthCm : comprimentoDoLado };
  });
  const de = components.findIndex((entry) => entry.id === id), alvo = dona ? components.findIndex((entry) => entry.id === dona.id) : -1;
  return alvo > de ? moverComponente({ components, cutouts: item.cutouts }, de, alvo) : { components, cutouts: item.cutouts };
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
