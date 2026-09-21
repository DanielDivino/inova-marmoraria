import { modoEntradaOrcamento, calcularAreaPeitorilDuplo, centimetrosParaMilimetros } from '@inova/domain';
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
/** Peitoril de duas pedras sobrepostas (Orçamento Rápido): true quando as 4 medidas principais estão preenchidas. */
export function ehPeitorilDuplo(component: Pick<DraftComponent, 'componentType' | 'sillTopLengthCm' | 'sillTopWidthCm' | 'sillBottomLengthCm' | 'sillBottomWidthCm'>): boolean {
  return component.componentType === 'SILL' && !!(component.sillTopLengthCm?.trim() && component.sillTopWidthCm?.trim() && component.sillBottomLengthCm?.trim() && component.sillBottomWidthCm?.trim());
}
/**
 * Medidas (mm) "efetivas" de um peitoril de duas pedras: um retângulo sintético de
 * 1 m de comprimento cuja área bate exatamente com a soma real das duas peças
 * (área superior + área inferior, sem descontar a sobreposição). Reaproveitando
 * lengthMm/widthMm assim, o resto do sistema (preço, área somada, serviços por m²)
 * funciona sem precisar saber que existe um peitoril duplo — só a descrição de
 * fabricação (PDF) usa as medidas reais de cada pedra, separadamente.
 * roundUp aplica o arredondamento de "M² fechado" em cada uma das 4 medidas antes
 * de somar as áreas — nunca use roundUp para a medida exata salva no orçamento.
 */
export function medidasEfetivasPeitorilDuplo(component: DraftComponent, roundUp: boolean): { lengthMm: number; widthMm: number } | null {
  if (!ehPeitorilDuplo(component)) return null;
  const medida = (value: string) => roundUp ? arredondarMedidaParaCima(value) : value;
  try {
    const areaM2 = calcularAreaPeitorilDuplo({
      topLengthMm: centimetrosParaMilimetros(medida(component.sillTopLengthCm!)), topWidthMm: centimetrosParaMilimetros(medida(component.sillTopWidthCm!)),
      bottomLengthMm: centimetrosParaMilimetros(medida(component.sillBottomLengthCm!)), bottomWidthMm: centimetrosParaMilimetros(medida(component.sillBottomWidthCm!)),
      quantity: 1,
    });
    return { lengthMm: 1000, widthMm: Math.round(areaM2 * 1000) };
  } catch { return null; }
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
