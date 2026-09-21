import { describe, expect, it } from 'vitest';
import { formatarNumeroOrcamento, siglaMesOrcamento, periodoNumeroOrcamento } from './quote-number.js';

describe('numeração dos orçamentos', () => {
  it('usa mês abreviado, ano e sequência', () => {
    expect(formatarNumeroOrcamento(new Date(2026, 8, 17), 1)).toBe('SET-2026-01');
    expect(formatarNumeroOrcamento(new Date(2026, 11, 17), 12)).toBe('DEZ-2026-12');
  });

  it('contém os meses em português', () => {
    expect(siglaMesOrcamento(1)).toBe('JAN');
    expect(siglaMesOrcamento(5)).toBe('MAI');
    expect(siglaMesOrcamento(12)).toBe('DEZ');
  });
});

it('troca o mês e o ano na meia-noite de Manaus, independente do fuso do servidor', () => {
  expect(periodoNumeroOrcamento(new Date('2027-01-01T03:59:59Z'))).toEqual({ year: 2026, month: 12 });
  expect(formatarNumeroOrcamento(new Date('2027-01-01T04:00:00Z'), 1)).toBe('JAN-2027-01');
  expect(formatarNumeroOrcamento(new Date('2026-10-01T04:00:00Z'), 1)).toBe('OUT-2026-01');
});
