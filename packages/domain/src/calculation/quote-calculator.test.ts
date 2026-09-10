import { describe, expect, it } from 'vitest';
import { calculateLine, calculateQuoteTotal } from './quote-calculator';

describe('calculateLine', () => {
  it('calcula área a partir de milímetros e quantidade', () => {
    expect(calculateLine({ billingUnit: 'SQUARE_METER', unitPrice: 250, lengthMm: 2000, widthMm: 600, quantity: 2 }))
      .toEqual({ billedQuantity: 2.4, subtotal: 600 });
  });

  it('aceita quantidade em m² informada diretamente', () => {
    expect(calculateLine({ billingUnit: 'SQUARE_METER', unitPrice: 1800, billedQuantity: 2.35 })).toEqual({ billedQuantity: 2.35, subtotal: 4230 });
  });

  it('calcula metro linear, unidade e valor fixo', () => {
    expect(calculateLine({ billingUnit: 'LINEAR_METER', unitPrice: 100, lengthMm: 1500, quantity: 2 }).subtotal).toBe(300);
    expect(calculateLine({ billingUnit: 'UNIT', unitPrice: 45, quantity: 3 }).subtotal).toBe(135);
    expect(calculateLine({ billingUnit: 'FIXED', unitPrice: 120, quantity: 9 }).subtotal).toBe(120);
  });
});

describe('calculateQuoteTotal', () => {
  it('arredonda em centavos e não permite desconto maior que o bruto', () => {
    expect(calculateQuoteTotal([10.005, 20.005], 5)).toBe(25.01);
    expect(() => calculateQuoteTotal([100], 101)).toThrow('desconto');
  });

  it('soma valores finais ajustados por componente e mantém desconto global', () => {
    const calculated = [1000, 800];
    const applied = [900, 750];
    expect(calculateQuoteTotal(applied, 100)).toBe(1550);
    expect(calculated.reduce((sum, value) => sum + value, 0) - applied.reduce((sum, value) => sum + value, 0)).toBe(150);
  });

  it('restaurar o valor calculado equivale a remover o override', () => {
    const calculated = 780;
    const applied: number | undefined = undefined;
    expect(applied ?? calculated).toBe(780);
  });
});
