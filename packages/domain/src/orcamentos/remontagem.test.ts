import { describe, it, expect } from 'vitest';
import { calcularPagamentoRemontagem } from './remontagem.js';
import { calcularTotalPix } from '../calculos/quote-calculator.js';

describe('Pagamentos da remontagem', () => {
  const input = { itemTotals: [4400], assembly: 300, disassembly: 300, pixPercent: 5 as const };
  it('A: serviços separados a R$ 300 sem desconto', () => {
    expect(calcularPagamentoRemontagem(input)).toMatchObject({ subtotal: 5000, assemblyDiscount: 0, disassemblyDiscount: 0 });
  });
  it.each(['assembly', 'disassembly'] as const)('B/C: %s abaixo ou acima da base', field => {
    expect(calcularPagamentoRemontagem({ ...input, [field]: 250 })).toMatchObject({ subtotal: 4950, [`${field}Discount`]: 50 });
    expect(calcularPagamentoRemontagem({ ...input, [field]: 450 })).toMatchObject({ subtotal: 5150, [`${field}Discount`]: 0 });
  });
  it('D/E: cartão manual define o desconto concedido à vista', () => {
    expect(calcularPagamentoRemontagem(input)).toMatchObject({ pixTotal: 5000, cashDiscount: 0 });
    expect(calcularPagamentoRemontagem({ ...input, cardOverride: 5500 })).toMatchObject({ cardTotal: 5500, pixTotal: 5000, cashDiscount: 500 });
  });
  it('F: cartão manual substitui a base do Pix', () => {
    expect(calcularPagamentoRemontagem({ ...input, cardOverride: 5500 })).toMatchObject({ subtotal: 5000, cardTotal: 5500, pixTotal: 5000, cashDiscount: 500 });
    expect(calcularPagamentoRemontagem({ ...input, cardOverride: 0 })).toMatchObject({ cardTotal: 0, pixTotal: 5000, cashDiscount: 0 });
  });
  it('arredonda centavos e mantém 5% como padrão dos orçamentos', () => {
    expect(calcularTotalPix(10.01)).toBe(9.51);
    expect(calcularTotalPix(10.01, 10)).toBe(9.01);
    expect(() => calcularTotalPix(100, 7 as 5)).toThrow();
  });
});
