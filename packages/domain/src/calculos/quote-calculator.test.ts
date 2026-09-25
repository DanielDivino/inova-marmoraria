import { describe, expect, it } from 'vitest';
import { arredondarMoeda, calcularLinha, calcularLimiteDesconto, calcularTotalCartao, calcularTotalPix, calcularTotalOrcamento, calcularLinhaServico } from './quote-calculator';
import { somarAreasComponentes } from './components';

describe('calculateLine', () => {
  it('calcula área a partir de milímetros e quantidade', () => {
    expect(calcularLinha({ billingUnit: 'SQUARE_METER', unitPrice: 250, lengthMm: 2000, widthMm: 600, quantity: 2 }))
      .toEqual({ billedQuantity: 2.4, subtotal: 600 });
  });

  it('aceita quantidade em m² informada diretamente', () => {
    expect(calcularLinha({ billingUnit: 'SQUARE_METER', unitPrice: 1800, billedQuantity: 2.35 })).toEqual({ billedQuantity: 2.35, subtotal: 4230 });
  });

  it('calcula metro linear, unidade e valor fixo', () => {
    expect(calcularLinha({ billingUnit: 'LINEAR_METER', unitPrice: 100, lengthMm: 1500, quantity: 2 }).subtotal).toBe(300);
    expect(calcularLinha({ billingUnit: 'UNIT', unitPrice: 45, quantity: 3 }).subtotal).toBe(135);
    expect(calcularLinha({ billingUnit: 'FIXED', unitPrice: 120, quantity: 9 }).subtotal).toBe(120);
  });

  it.each([
    ['SQUARE_METER', 250, 2, 3, 1, 1, 500],
    ['LINEAR_METER', 100, 2, 3, 1500, undefined, 200],
    ['UNIT', 45, 2, 3, undefined, undefined, 90],
    ['FIXED', 120, 1, 9, undefined, undefined, 120],
  ] as const)('usa billedQuantity como quantidade final em %s, sem multiplicar de novo', (billingUnit, unitPrice, billedQuantity, quantity, lengthMm, widthMm, subtotal) => {
    expect(calcularLinha({ billingUnit, unitPrice, billedQuantity, quantity, lengthMm, widthMm }).subtotal).toBe(subtotal);
  });

  it('arredonda dinheiro em centavos, inclusive valores de meio centavo', () => {
    expect(arredondarMoeda(1.005)).toBe(1.01);
    expect(calcularLinha({ billingUnit: 'UNIT', unitPrice: 1.005, quantity: 1 })).toEqual({ billedQuantity: 1, subtotal: 1.01 });
    expect(calcularTotalOrcamento([0.105, 0.205, 0.305])).toBe(0.63);
  });
});

describe('calculateQuoteTotal', () => {
  it('arredonda em centavos e não permite desconto maior que o bruto', () => {
    expect(calcularTotalOrcamento([10.005, 20.005], 5)).toBe(25.02);
    expect(() => calcularTotalOrcamento([100], 101)).toThrow('desconto');
  });

  it('soma valores finais ajustados por componente e mantém desconto global', () => {
    const calculated = [1000, 800];
    const applied = [900, 750];
    expect(calcularTotalOrcamento(applied, 100)).toBe(1550);
    expect(calculated.reduce((sum, value) => sum + value, 0) - applied.reduce((sum, value) => sum + value, 0)).toBe(150);
  });

  it('restaurar o valor calculado equivale a remover o override', () => {
    const calculated = 780;
    const applied: number | undefined = undefined;
    expect(applied ?? calculated).toBe(780);
  });

  it('normaliza o valor base e o desconto em centavos antes de subtrair', () => {
    expect(calcularTotalOrcamento([10.005], 1.005)).toBe(9);
    expect(() => calcularTotalOrcamento([1], 1.005)).toThrow('desconto');
  });

  it('calcula Pix e cartão a partir de centavos estáveis', () => {
    expect(calcularTotalPix(5000, 5)).toBe(4750);
    expect(calcularTotalPix(5000, 10)).toBe(4500);
    expect(calcularTotalPix(1.005, 5)).toBe(0.96);
    expect(calcularTotalCartao(509.25)).toBe(560.18);
    expect(calcularTotalCartao(1.005)).toBe(1.11);
  });

  it('aplica limite de desconto sobre centavos e valida percentuais', () => {
    expect(calcularLimiteDesconto(100.05, 10)).toBe(10.01);
    expect(calcularLimiteDesconto(100.05, 5)).toBe(5);
    expect(() => calcularLimiteDesconto(100, 101)).toThrow();
  });
});

describe('calculateServiceLine', () => {
  it.each([[1.1, 2, 800], [2.1, 3, 1200], [2.43, 3, 1200], [2, 2, 800], [0, 0, 0], [2.0000000000000004, 2, 800]])('jateado: %s m² cobra %s m²', (area, billedQuantity, subtotal) => {
    expect(calcularLinhaServico({ serviceName: 'Acabamento Jateado', billingUnit: 'SQUARE_METER', unitPrice: 400, billedQuantity: area })).toEqual({ billedQuantity, subtotal });
  });

  it('soma todas as peças antes de arredondar o jateado', () => {
    const area = somarAreasComponentes([[3000, 600], [700, 600], [700, 300]].map(([lengthMm, widthMm]) => ({ label: 'Peça', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm, widthMm, quantity: 1 })));
    expect(area).toBe(2.43);
    expect(calcularLinhaServico({ serviceName: 'Acabamento Jateado', billingUnit: 'SQUARE_METER', unitPrice: 600, billedQuantity: area })).toEqual({ billedQuantity: 3, subtotal: 1800 });
  });

  it('mantém serviços comuns por m² sem arredondamento', () => {
    expect(calcularLinhaServico({ serviceName: 'Acabamento Polimento', billingUnit: 'SQUARE_METER', unitPrice: 100, billedQuantity: 2.43 })).toEqual({ billedQuantity: 2.43, subtotal: 243 });
  });

  it('arredonda rebaixo italiano para blocos de meio metro quadrado', () => {
    expect(calcularLinhaServico({ serviceName: 'Acabamento Rebaixo Italiano', billingUnit: 'SQUARE_METER', unitPrice: 600, billedQuantity: 2.1 }))
      .toEqual({ billedQuantity: 2.5, subtotal: 1500 });
    expect(calcularLinhaServico({ serviceName: 'Acabamento Rebaixo Italiano', billingUnit: 'SQUARE_METER', unitPrice: 600, billedQuantity: 2.51 }))
      .toEqual({ billedQuantity: 3, subtotal: 1800 });
  });
});
