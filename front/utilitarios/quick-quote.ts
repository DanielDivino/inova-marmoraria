import { modoEntradaOrcamento } from '@inova/domain';
import type { DraftComponent, DraftItem } from '../componentes/orcamento/types';
import { removerGrupoComponentes } from './component-groups';

export function metrosParaCentimetrosRascunho(value: string): string {
  if (!value.trim()) return '';
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? String(Math.round(parsed * 100000) / 1000) : value;
}
/**
 * Arredonda uma medida (em cm) para cima, para o múltiplo de 5 cm mais próximo.
 * Usada só para calcular o valor do material a cobrar (m² fechado) — nunca altera
 * a medida digitada, exibida ou salva no orçamento/PDF.
 */
export function arredondarMedidaParaCima(cmValue: string): string {
  if (!cmValue.trim()) return cmValue;
  const parsed = Number(cmValue.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return cmValue;
  return String(Math.ceil(parsed / 5) * 5);
}
export function centimetrosRascunhoParaMetros(value: string): string {
  if (!value.trim()) return '';
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? String(parsed / 100).replace('.', ',') : value;
}
export function criarComponenteRapido(materialId = '', id = crypto.randomUUID()): DraftComponent {
  return { id, materialId, label: '', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '', widthCm: '', quantity: 1, edges: [] };
}
export function aplicarMaterialProjeto(item: DraftItem, materialId: string): Partial<DraftItem> {
  return { materialId, components: item.components.map(component => ({ ...component, materialId })) };
}
/** Enter may leave an unused insertion row. Only completely untouched rows are omitted. */
export function prepararItemRapido(item: DraftItem): DraftItem {
  if (modoEntradaOrcamento(item.drawingData) !== 'QUICK') return item;
  let result = item;
  for (let index = item.components.length - 1; index >= 0; index--) {
    const row = result.components[index];
    if (!row || row.label || row.lengthCm || row.widthCm || row.quantity !== 1 || row.edges.length || row.appliedTotal !== undefined || row.parentComponentId || row.componentType !== 'TOP') continue;
    if (result.cutouts.some(cut => cut.componentIndex === index) || result.components.some(child => child.parentComponentId === row.id)) continue;
    result = { ...result, ...removerGrupoComponentes(result, index) };
  }
  return result;
}
export function duplicarComponenteRapido(item: DraftItem, index: number): Partial<DraftItem> {
  const root = item.components[index];
  const originals = [root, ...item.components.filter(component => component.parentComponentId === root.id)];
  const ids = new Map(originals.map(component => [component.id, crypto.randomUUID()]));
  const components = originals.map(component => ({ ...component, id: ids.get(component.id)!, parentComponentId: ids.get(component.parentComponentId ?? '') ?? component.parentComponentId, edges: component.edges.map(({ id: _id, ...edge }) => ({ ...edge })) }));
  const cutouts = item.cutouts.flatMap(cutout => {
    const source = item.components[cutout.componentIndex ?? -1];
    const offset = originals.indexOf(source);
    return offset < 0 ? [] : [{ ...cutout, id: crypto.randomUUID(), componentIndex: item.components.length + offset }];
  });
  return { components: [...item.components, ...components], cutouts: [...item.cutouts, ...cutouts] };
}
