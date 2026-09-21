import { describe, expect, it } from 'vitest';
import { calcularAcabamentoBorda, acabamentoBordaPedra, faixasBordaPedra } from './edge-finishes.js';

describe('Acabamentos de borda pela pedra', () => {
  it.each(['Vista', ' vista ', 'VISTA'])('identifica %s', (name) => expect(acabamentoBordaPedra(name)).toBe('VISTA'));
  it.each(['Vista', 'Saia'])('cobra %s por área, com o preço do material e as quantidades', (name) => {
    expect(calcularAcabamentoBorda({ name, lengthMm: 2000, heightMm: 50, quantity: 1, materialPrice: 600, servicePrice: 999 })).toEqual({ billingUnit: 'SQUARE_METER', billedQuantity: 0.1, unitPrice: 600, subtotal: 60 });
    expect(calcularAcabamentoBorda({ name, lengthMm: 500, heightMm: 50, quantity: 6, materialPrice: 700, servicePrice: 0 }).subtotal).toBe(105);
  });
  it.each([undefined, 0, -10])('recusa vista sem largura válida: %s', (heightMm) => {
    expect(() => calcularAcabamentoBorda({ name: 'Vista', lengthMm: 2000, heightMm, quantity: 1, materialPrice: 600, servicePrice: 0 })).toThrow();
  });
  it('preserva cobrança linear do 45 graus mesmo com largura informada', () => {
    expect(calcularAcabamentoBorda({ name: 'Acabamento 45°', lengthMm: 2000, heightMm: 50, quantity: 2, materialPrice: 600, servicePrice: 70 })).toEqual({ billingUnit: 'LINEAR_METER', billedQuantity: 4, unitPrice: 70, subtotal: 280 });
  });
  it('posiciona vista e saia sem sobreposição e mantém lados independentes', () => {
    const result = faixasBordaPedra([
      { side: 'FRONT', serviceName: 'Saia', heightMm: 100 },
      { side: 'FRONT', serviceName: 'Vista', heightMm: 50 },
      { side: 'LEFT', serviceName: 'Vista', heightMm: 30 },
      { side: 'BACK', serviceName: 'Acabamento 45°', heightMm: 50 },
      { side: 'CUSTOM', serviceName: 'Vista', heightMm: 50 },
    ]);
    expect(result.extra).toEqual({ top: 0, bottom: 150, left: 30, right: 0 });
    expect(result.strips.map((strip) => strip.offsetMm)).toEqual([0, 100, 0]);
  });
});
