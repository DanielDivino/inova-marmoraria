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

const roundCurrency = (value: number) => Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
const centsOf = (value: number, field: string) => Math.round((nonNegative(value, field) + Number.EPSILON) * 100);

/** Normaliza valores monetários em centavos, com arredondamento consistente no frontend e na API. */
export function arredondarMoeda(value: number): number {
  return roundCurrency(nonNegative(value, 'Valor monetário'));
}
const quantityOf = (input: CalculationInput) => nonNegative(input.quantity ?? 1, 'Quantidade');
const meters = (millimeters: number) => nonNegative(millimeters, 'Medida') / 1000;

type Strategy = (input: CalculationInput) => number;

const strategies: Record<BillingUnit, Strategy> = {
  SQUARE_METER: (input) => input.billedQuantity ?? (meters(input.lengthMm ?? 0) * meters(input.widthMm ?? 0) * quantityOf(input)),
  LINEAR_METER: (input) => input.billedQuantity ?? meters(input.lengthMm ?? 0) * quantityOf(input),
  UNIT: (input) => input.billedQuantity ?? quantityOf(input),
  FIXED: () => 1
};

export function calcularLinha(input: CalculationInput): CalculationResult {
  const unitPrice = nonNegative(input.unitPrice, 'Preço');
  const billedQuantity = strategies[input.billingUnit](input);
  return { billedQuantity, subtotal: roundCurrency(billedQuantity * unitPrice) };
}

/** Arredonda a área total do serviço antes de aplicar o preço por m². */
export function calcularLinhaServico(input: CalculationInput & { serviceName?: string }): CalculationResult {
  const name = input.serviceName?.toLocaleLowerCase('pt-BR') ?? '';
  const increment = name.includes('jateado') ? 1 : name.includes('rebaixo italiano') ? 0.5 : undefined;
  if (increment && input.billingUnit === 'SQUARE_METER') {
    const area = nonNegative(strategies.SQUARE_METER(input), 'Área');
    // Medidas em mm têm precisão de seis casas em m²; elimina ruído de ponto flutuante.
    const normalizedArea = Math.round(area * 1_000_000) / 1_000_000;
    return calcularLinha({ ...input, billedQuantity: Math.ceil(normalizedArea / increment) * increment });
  }
  return calcularLinha(input);
}

export function calcularTotalOrcamento(subtotals: number[], discount = 0): number {
  const grossCents = subtotals.reduce((sum, subtotal) => sum + centsOf(subtotal, 'Subtotal'), 0);
  const discountCents = centsOf(discount, 'Desconto');
  if (discountCents > grossCents) throw new Error('O desconto não pode ser maior que o total bruto.');
  return (grossCents - discountCents) / 100;
}

export type PixDiscountPercent = 5 | 10 | 15 | 20 | 25;
export function calcularTotalPix(total: number, discountPercent: PixDiscountPercent = 5): number {
  if (![5, 10, 15, 20, 25].includes(discountPercent)) throw new Error('Desconto Pix deve ser 5%, 10%, 15%, 20% ou 25%.');
  const totalCents = centsOf(total, 'Total');
  return Math.round(totalCents * (100 - discountPercent) / 100) / 100;
}

/** O orçamento usa o total à vista como base e acrescenta 10% no cartão. */
export function calcularTotalCartao(total: number): number {
  return Math.round(centsOf(total, 'Total') * 110 / 100) / 100;
}

/** Arredonda o teto de desconto do vendedor usando a mesma base em centavos do orçamento. */
export function calcularLimiteDesconto(total: number, percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Percentual de desconto deve estar entre 0 e 100.');
  return Math.round(centsOf(total, 'Total') * percent / 100) / 100;
}
