import { nomeExibicaoComponente, componentTypeLabels, rotuloLadoBorda } from './component-details.js';
import type { ComponentType } from '../calculos/components.js';
import { acabamentoBordaPedra } from './edge-finishes.js';

export type ManufacturingLine = { label: string; text: string };
export type ManufacturingCutout = {
  cutoutType: string; label?: string | null; serviceName?: string | null; sizePending?: boolean;
  lengthMm?: number | null; widthMm?: number | null; diameterMm?: number | null;
  positionX?: number | null; positionY?: number | null; quantity: number;
};
export type ManufacturingComponent = {
  label?: string; componentType?: string; orientation?: string; lengthMm: number; widthMm: number; quantity: number;
  sillDetailMm?: number; sillDetailHeightMm?: number;
  /** Peitoril de duas pedras sobrepostas (Orçamento Rápido); lengthMm/widthMm acima
   * viram um retângulo sintético (mesma área total) só para o cálculo do preço —
   * aqui descrevemos as duas peças reais que a oficina precisa cortar. */
  sillTopLengthMm?: number; sillTopWidthMm?: number; sillBottomLengthMm?: number; sillBottomWidthMm?: number; sillFinalWidthMm?: number; sillOverlapMm?: number;
  edges: { side: string; customLabel?: string | null; serviceName: string; lengthMm?: number | null; heightMm?: number | null; quantity?: number }[];
};
const n = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const cm = (value: number) => n(value / 10);
const cutoutNames: Record<string, string> = { SINK: 'Recorte para cuba', SCULPTED_SINK: 'Cuba esculpida', OVAL_SINK: 'Recorte para cuba oval', COOKTOP: 'Recorte para cooktop', FAUCET_HOLE: 'Furo de torneira', GENERIC_HOLE: 'Furo genérico', OTHER: 'Recorte' };

export function descricaoProducaoRecorte(cutout: ManufacturingCutout): ManufacturingLine[] {
  const hole = ['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType);
  const parts = [cutoutNames[cutout.cutoutType] ?? 'Recorte'];
  if (cutout.label?.trim()) parts.push(cutout.label.trim());
  if (cutout.sizePending) parts.push('Medidas a definir com o cliente');
  if (cutout.lengthMm && cutout.widthMm) parts.push(`${cm(cutout.lengthMm)} × ${cm(cutout.widthMm)} cm`);
  else {
    if (cutout.lengthMm) parts.push(`comprimento ${cm(cutout.lengthMm)} cm`);
    if (cutout.widthMm) parts.push(`largura ${cm(cutout.widthMm)} cm`);
  }
  if (cutout.diameterMm) parts.push(`diâmetro ${cm(cutout.diameterMm)} cm`);
  parts.push(`quantidade: ${cutout.quantity}`);
  if (cutout.positionX != null) parts.push(`centro X: ${cm(cutout.positionX)} cm do lado ${rotuloLadoBorda('LEFT')}`);
  if (cutout.positionY != null) parts.push(`centro Y: ${cm(cutout.positionY)} cm do lado ${rotuloLadoBorda('BACK')}`);
  const lines = [{ label: hole ? 'Furação' : 'Recorte', text: parts.join(' · ') }];
  const area = cutout.lengthMm && cutout.widthMm ? cutout.lengthMm * cutout.widthMm / 1_000_000 * (cutout.cutoutType === 'OVAL_SINK' ? Math.PI / 4 : 1)
    : cutout.diameterMm ? Math.PI * (cutout.diameterMm / 2000) ** 2 : undefined;
  if (area) lines.push({ label: 'Área de recorte', text: `${n(area)} m² por recorte${cutout.quantity > 1 ? ` · ${n(area * cutout.quantity)} m² no total` : ''}` });
  if (cutout.serviceName?.trim()) lines.push({ label: ['SINK', 'SCULPTED_SINK', 'OVAL_SINK'].includes(cutout.cutoutType) ? 'Cuba / serviço configurado' : 'Serviço do recorte', text: cutout.serviceName.trim() });
  return lines;
}

export function descricaoProducaoComponente(component: ManufacturingComponent, cutouts: ManufacturingCutout[] = [], parentName?: string, children: string[] = []): ManufacturingLine[] {
  const lines: ManufacturingLine[] = [];
  const dimensions: string[] = [];
  const type = componentTypeLabels[component.componentType as ComponentType];
  const peitorilDuplo = component.componentType === 'SILL' && !!(component.sillTopLengthMm && component.sillTopWidthMm && component.sillBottomLengthMm && component.sillBottomWidthMm);
  if (type && component.componentType !== 'OTHER' && type !== nomeExibicaoComponente(component)) dimensions.push(type);
  // O peitoril duplo usa lengthMm/widthMm como retângulo sintético (mesma área
  // total) só para o preço; a medida real de cada pedra vai no bloco abaixo.
  if (!peitorilDuplo && component.lengthMm > 0 && component.widthMm > 0) dimensions.push(`${cm(component.lengthMm)} × ${cm(component.widthMm)} cm`);
  if (component.orientation) dimensions.push(component.orientation === 'VERTICAL' ? 'vertical' : 'horizontal');
  dimensions.push(`${component.quantity} ${component.quantity === 1 ? 'peça' : 'peças'}`);
  if (component.lengthMm > 0 && component.widthMm > 0) dimensions.push(`${(component.lengthMm * component.widthMm * component.quantity / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m² total`);
  lines.push({ label: 'Peça', text: dimensions.join(' · ') });
  if (parentName) lines.push({ label: 'Vínculo', text: `Adicional de ${parentName}` });
  if (children.length) lines.push({ label: 'Componentes adicionados', text: children.join(' + ') });
  for (const edge of component.edges) {
    const length = edge.lengthMm ?? (['FRONT', 'BACK'].includes(edge.side) ? component.lengthMm : edge.side === 'CUSTOM' ? 0 : component.widthMm);
    const strip = acabamentoBordaPedra(edge.serviceName);
    const parts = [`${edge.serviceName} no lado ${rotuloLadoBorda(edge.side)}${edge.customLabel?.trim() ? ` — ${edge.customLabel.trim()}` : ''}`];
    if (length > 0) parts.push(strip ? `comprimento ${cm(length)} cm` : `${n(length / 1000)} m`);
    if (edge.heightMm) parts.push(`${strip === 'VISTA' ? 'largura' : 'altura'} ${cm(edge.heightMm)} cm`);
    if ((edge.quantity ?? 1) > 1) parts.push(`${edge.quantity} aplicações por peça`);
    lines.push({ label: 'Acabamentos', text: parts[0] + (parts.length > 1 ? ` - ${parts.slice(1).join(' · ')}` : '') });
  }
  if (component.componentType === 'SILL') {
    const details = [];
    if (component.sillDetailMm) details.push(`medida horizontal ${cm(component.sillDetailMm)} cm`);
    if (component.sillDetailHeightMm) details.push(`medida vertical ${cm(component.sillDetailHeightMm)} cm`);
    if (peitorilDuplo) {
      details.push(`pedra de cima ${cm(component.sillTopLengthMm!)} × ${cm(component.sillTopWidthMm!)} cm`);
      details.push(`pedra de baixo ${cm(component.sillBottomLengthMm!)} × ${cm(component.sillBottomWidthMm!)} cm`);
      if (component.sillOverlapMm) details.push(`sobreposição/encaixe ${cm(component.sillOverlapMm)} cm`);
      if (component.sillFinalWidthMm) details.push(`largura final montada ${cm(component.sillFinalWidthMm)} cm`);
    }
    if (details.length) lines.push({ label: 'Detalhe do peitoril', text: details.join(' · ') });
  }
  lines.push(...cutouts.flatMap(descricaoProducaoRecorte));
  return lines;
}

export function tituloComponenteProducao(component: { label?: string; componentType?: string }, index: number) {
  return `${index + 1}. ${nomeExibicaoComponente(component)}`;
}
