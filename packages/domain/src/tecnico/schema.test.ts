import { describe, expect, it } from 'vitest';
import { formatMeasure, parseFriendlyMeasure } from './schema.js';

describe('formatMeasure', () => {
  it('formata medidas acima de 1 metro como metros e centímetros', () => {
    expect(formatMeasure(1150)).toBe('1m15');
    expect(formatMeasure(2440)).toBe('2m44');
    expect(formatMeasure(3000)).toBe('3m');
  });
  it('formata medidas abaixo de 1 metro em centímetros', () => {
    expect(formatMeasure(650)).toBe('65cm');
    expect(formatMeasure(20)).toBe('2cm');
  });
  it('preserva o sinal negativo', () => {
    expect(formatMeasure(-1150)).toBe('-1m15');
  });
});

describe('parseFriendlyMeasure', () => {
  it('lê o formato metros e centímetros', () => {
    expect(parseFriendlyMeasure('1m15')).toBe(1150);
    expect(parseFriendlyMeasure('1m15cm')).toBe(1150);
    expect(parseFriendlyMeasure('2m')).toBe(2000);
  });
  it('lê metros decimais com vírgula ou ponto', () => {
    expect(parseFriendlyMeasure('1,15m')).toBe(1150);
    expect(parseFriendlyMeasure('1.15m')).toBe(1150);
  });
  it('lê centímetros e milímetros explícitos', () => {
    expect(parseFriendlyMeasure('115cm')).toBe(1150);
    expect(parseFriendlyMeasure('1150mm')).toBe(1150);
  });
  it('trata um número puro como milímetros, para compatibilidade com os campos existentes', () => {
    expect(parseFriendlyMeasure('1150')).toBe(1150);
  });
  it('rejeita texto que não é uma medida', () => {
    expect(parseFriendlyMeasure('abc')).toBeNull();
    expect(parseFriendlyMeasure('')).toBeNull();
  });
});
