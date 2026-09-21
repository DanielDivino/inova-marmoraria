import { calcularMetrosLineares, calcularSubtotalMaterial, calcularAreaRetangularM2 } from '../calculos/components.js';

/** Edge strips use the stone price, not the catalog service price.
 * Keep heightMm as the persisted second dimension for compatibility with skirts.
 */
export function acabamentoBordaPedra(name: string): 'SKIRT' | 'VISTA' | undefined {
  switch (name.trim().toLocaleLowerCase('pt-BR')) {
    case 'saia': return 'SKIRT';
    case 'vista': return 'VISTA';
    default: return undefined;
  }
}

export function calcularAcabamentoBorda(input: { name: string; lengthMm: number; heightMm?: number | null; quantity: number; materialPrice: number; servicePrice: number }) {
  const areaBased = !!acabamentoBordaPedra(input.name);
  const billedQuantity = areaBased
    ? calcularAreaRetangularM2(input.lengthMm, input.heightMm ?? 0, input.quantity)
    : calcularMetrosLineares(input.lengthMm, input.quantity);
  const unitPrice = areaBased ? input.materialPrice : input.servicePrice;
  return { billingUnit: areaBased ? 'SQUARE_METER' as const : 'LINEAR_METER' as const, billedQuantity, unitPrice, subtotal: calcularSubtotalMaterial(billedQuantity, unitPrice) };
}

/** Lay out simultaneous strips separately so Vista never hides a skirt. */
export function faixasBordaPedra<T extends { side: string; serviceName: string; heightMm?: number | null }>(edges: T[]) {
  const extra = { top: 0, bottom: 0, left: 0, right: 0 };
  const sides: Record<string, keyof typeof extra> = { BACK: 'top', FRONT: 'bottom', LEFT: 'left', RIGHT: 'right' };
  const strips = edges.flatMap((edge) => {
    const side = sides[edge.side];
    if (!side || !acabamentoBordaPedra(edge.serviceName) || !edge.heightMm || edge.heightMm <= 0) return [];
    const offsetMm = extra[side];
    extra[side] += edge.heightMm;
    return [{ edge, offsetMm }];
  });
  return { strips, extra };
}
