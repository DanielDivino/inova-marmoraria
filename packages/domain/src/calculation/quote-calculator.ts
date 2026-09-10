export type BillingUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';

export interface CalculationInput {
  billingUnit: BillingUnit;
  unitPrice: number;
  lengthMm?: number;
  widthMm?: number;
  quantity?: number;
  billedQuantity?: number;
}

export interface CalculationResult {
  billedQuantity: number;
  subtotal: number;
}

const nonNegative = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} deve ser um número não negativo.`);
  return value;
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const quantityOf = (input: CalculationInput) => nonNegative(input.quantity ?? 1, 'Quantidade');
const meters = (millimeters: number) => nonNegative(millimeters, 'Medida') / 1000;

type Strategy = (input: CalculationInput) => number;

const strategies: Record<BillingUnit, Strategy> = {
  SQUARE_METER: (input) => input.billedQuantity ?? (meters(input.lengthMm ?? 0) * meters(input.widthMm ?? 0) * quantityOf(input)),
  LINEAR_METER: (input) => (input.billedQuantity ?? meters(input.lengthMm ?? 0)) * quantityOf(input),
  UNIT: (input) => input.billedQuantity ?? quantityOf(input),
  FIXED: () => 1
};

export function calculateLine(input: CalculationInput): CalculationResult {
  const unitPrice = nonNegative(input.unitPrice, 'Preço');
  const billedQuantity = strategies[input.billingUnit](input);
  return { billedQuantity, subtotal: roundCurrency(billedQuantity * unitPrice) };
}

export function calculateQuoteTotal(subtotals: number[], discount = 0): number {
  const gross = subtotals.reduce((sum, subtotal) => sum + nonNegative(subtotal, 'Subtotal'), 0);
  const validDiscount = nonNegative(discount, 'Desconto');
  if (validDiscount > gross) throw new Error('O desconto não pode ser maior que o total bruto.');
  return roundCurrency(gross - validDiscount);
}
