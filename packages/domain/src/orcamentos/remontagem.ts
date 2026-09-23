import { calcularTotalOrcamento, type PixDiscountPercent } from '../calculos/quote-calculator.js';
import type { SavedQuoteItem } from './snapshot.js';

export const DEFAULT_ASSEMBLY_PRICE = 300;
export const DEFAULT_DISASSEMBLY_PRICE = 300;
export type RemountItem = SavedQuoteItem & { materialSubtotal: number; servicesSubtotal: number };
export function calcularPagamentoRemontagem(input: { itemTotals: number[]; assembly: number; disassembly: number; cardOverride?: number | null; pixPercent: PixDiscountPercent }) {
  const itemsTotal = calcularTotalOrcamento(input.itemTotals);
  const subtotal = calcularTotalOrcamento([itemsTotal, input.assembly, input.disassembly]);
  const cardTotal = calcularTotalOrcamento([input.cardOverride ?? subtotal]);
  const cashDiscount = Math.max(0, Math.round((cardTotal - subtotal) * 100)) / 100;
  return { itemsTotal, subtotal, cardTotal, cashDiscount, pixTotal: subtotal,
    assemblyDiscount: Math.max(0, Math.round((DEFAULT_ASSEMBLY_PRICE - input.assembly) * 100)) / 100,
    disassemblyDiscount: Math.max(0, Math.round((DEFAULT_DISASSEMBLY_PRICE - input.disassembly) * 100)) / 100 };
}
export type RemountTotals = ReturnType<typeof calcularPagamentoRemontagem>;
export type RemountDocument = RemountTotals & {
  id: string; quoteId: string; version: number; number: string; deliveryNumber: string;
  createdAt: string; updatedAt: string; items: RemountItem[];
  assembly: number; disassembly: number; cardOverride: number | null; pixPercent: PixDiscountPercent;
  notes: string; itemNotes: Record<string, string>;
};
export function numeroDocumentoRemontagem(quoteNumber: string, kind: 'REM' | 'ENT') {
  return `${kind}-${quoteNumber.replace(/^[A-Za-z]+-/, '')}`;
}
