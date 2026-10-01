import type { ComponentType, EdgeSide } from '../calculos/components.js';

export const edgeSideLabels: Record<EdgeSide, string> = { BACK: 'Superior', FRONT: 'Inferior', LEFT: 'Esquerdo', RIGHT: 'Direito', CUSTOM: 'Personalizado' };

/** Use centimetres when two decimal places in metres would lose millimetres. */
export function rotuloMedidaDesenho(millimeters: number, unit: 'auto' | 'cm' = 'auto') {
  if (unit === 'cm' || millimeters % 10 !== 0) return `${(millimeters / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cm`;
  return `${(millimeters / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

/** Side-strip dimensions go above the outline, leaving the centre for the 45° symbol. */
export function posicaoMedidaFaixa(side: string, strip: { x: number; y: number; width: number; height: number }, outlineTop: number, lane = 0) {
  return side === 'LEFT' || side === 'RIGHT'
    ? { x: strip.x + strip.width / 2, y: outlineTop - 8 - lane * 12, anchor: 'middle' as const }
    : { x: strip.x + strip.width + 5, y: strip.y + strip.height / 2, anchor: 'start' as const };
}

export const isMiterFinish = (name: string) => /(?:^|\D)45\s*(?:°|º|graus?)/i.test(name);
// Section of the two stone strips meeting at a 45-degree miter.
export const miterJointPath = 'M0 0 H20 V18 H12 V8 H0 Z M20 0 L12 8';

export function posicaoMarcadorMeiaEsquadria(side: EdgeSide, piece: { x: number; y: number; width: number; height: number }, extra = { left: 0, right: 0, top: 0, bottom: 0 }) {
  const centerX = piece.x + piece.width / 2;
  const centerY = piece.y + piece.height / 2;
  switch (side) {
    case 'BACK': return { x: centerX - 20, y: piece.y - extra.top - 16, rotation: 0 };
    case 'FRONT': return { x: centerX - 20, y: piece.y + piece.height + extra.bottom + 4, rotation: 0 };
    case 'LEFT': return { x: piece.x - extra.left - 16, y: centerY + 20, rotation: -90 };
    case 'RIGHT': return { x: piece.x + piece.width + extra.right + 16, y: centerY - 20, rotation: 90 };
    default: return null;
  }
}

/** Persisted enums and legacy drawing keys share the same user-facing names. */
export function rotuloLadoBorda(side: string): string {
  const key = side.trim().toUpperCase();
  return edgeSideLabels[(key === 'UP' ? 'BACK' : key === 'DOWN' ? 'FRONT' : key) as EdgeSide] ?? edgeSideLabels.CUSTOM;
}

/**
 * Peças que ficam presas a um lado de outra (rodabanca, saia e vista): entram no Tipo/descrição e
 * são cobradas pela área (m²) como as outras, não como acabamento.
 */
export const TIPOS_PRESOS_AO_LADO: readonly ComponentType[] = ['BACKSPLASH', 'SKIRT', 'VISTA'];
export const tipoPresoAoLado = (tipo: string) => (TIPOS_PRESOS_AO_LADO as readonly string[]).includes(tipo);
export const componentTypeLabels: Record<ComponentType, string> = { TOP: 'Tampo', COUNTER: 'Bancada', BASE: 'Base', VISTA: 'Vista', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', SIDE_LEFT: `Lateral — ${edgeSideLabels.LEFT}`, SIDE_RIGHT: `Lateral — ${edgeSideLabels.RIGHT}`, SILL: 'Peitoril', THRESHOLD: 'Soleira', STEP: 'Degrau', OTHER: 'Componente' };
export type ComponentDrawingDetail = { parentComponentIndex?: number; parentSide?: Exclude<EdgeSide, 'CUSTOM'>; sillDetailMm?: number; sillDetailHeightMm?: number;
  /** Peitoril de duas pedras sobrepostas (Orçamento Rápido) — comprimento é o
   * normal do componente (lengthMm), compartilhado pelas duas pedras. */
  sillTopWidthMm?: number; sillBottomWidthMm?: number; sillFinalWidthMm?: number; sillOverlapMm?: number;
  /** Cantos arredondados (acabamento do Orçamento Rápido): as 4 pontas com este raio. */
  cornerRadiusMm?: number };
const sillDuploNumericFields = ['sillTopWidthMm', 'sillBottomWidthMm', 'sillFinalWidthMm', 'sillOverlapMm'] as const;

/** Indexes follow the persisted component sort order, so recreated IDs are safe. */
export function detalheDesenhoComponente(data: unknown, index: number): ComponentDrawingDetail {
  if (!data || typeof data !== 'object' || !('componentDetails' in data) || !Array.isArray(data.componentDetails)) return {};
  const detail = data.componentDetails[index];
  if (!detail || typeof detail !== 'object') return {};
  const result: ComponentDrawingDetail = {
    ...(Number.isInteger(detail.parentComponentIndex) && detail.parentComponentIndex >= 0 && detail.parentComponentIndex < index ? { parentComponentIndex: detail.parentComponentIndex } : {}),
    ...(['BACK', 'FRONT', 'LEFT', 'RIGHT'].includes(detail.parentSide) ? { parentSide: detail.parentSide } : {}),
    ...(Number.isInteger(detail.sillDetailMm) && detail.sillDetailMm > 0 ? { sillDetailMm: detail.sillDetailMm } : {}),
    ...(Number.isInteger(detail.sillDetailHeightMm) && detail.sillDetailHeightMm > 0 ? { sillDetailHeightMm: detail.sillDetailHeightMm } : {}),
  };
  for (const field of sillDuploNumericFields) if (Number.isInteger(detail[field]) && detail[field] > 0) result[field] = detail[field];
  if (Number.isInteger(detail.cornerRadiusMm) && detail.cornerRadiusMm > 0) result.cornerRadiusMm = detail.cornerRadiusMm;
  return result;
}

export function nomeExibicaoComponente(component: { label?: string | null; componentType?: string }): string {
  return component.label?.trim() || componentTypeLabels[component.componentType as ComponentType] || 'Componente';
}

/**
 * Nome do projeto para exibir: o que o vendedor digitou ou, sem nome, as peças
 * que ele tem (ex.: "Soleira", "Bancada + Rodabanca"). O tipo de produto salvo
 * no item não é escolhido na tela (fica sempre o primeiro do catálogo), então
 * nunca serve para descrever o projeto.
 */
export function nomeProjeto(item: { projectName?: string | null; components?: { label?: string | null; componentType?: string }[] }): string {
  const nome = item.projectName?.trim();
  if (nome) return nome;
  const pecas = [...new Set((item.components ?? []).map(nomeExibicaoComponente))];
  if (!pecas.length) return 'Projeto';
  return pecas.length > 3 ? `${pecas.slice(0, 3).join(' + ')} e outras` : pecas.join(' + ');
}

/** Visual only: widen very thin pieces while keeping the drawing inside its cell. */
export function escalasDesenhoTecnico(lengthMm: number, widthMm: number, extra: { left: number; right: number; top: number; bottom: number }, maxWidth: number, maxHeight: number, minimumSize = 24) {
  const maxX = maxWidth / (lengthMm + extra.left + extra.right);
  const maxY = maxHeight / (widthMm + extra.top + extra.bottom);
  const proportional = Math.min(maxX, maxY);
  return {
    scaleX: Math.min(maxX, Math.max(proportional, minimumSize / lengthMm)),
    scaleY: Math.min(maxY, Math.max(proportional, minimumSize / widthMm)),
  };
}
