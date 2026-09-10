import { describe, expect, it } from 'vitest';
import { aggregateComponentArea, calculateComponent, calculateLinearMeters, calculateRectangleAreaM2, centimetersToMillimeters } from './components';

describe('medidas e componentes', () => {
  it('normaliza centímetros com vírgula para milímetros inteiros', () => {
    expect(centimetersToMillimeters('200,5')).toBe(2005);
    expect(() => centimetersToMillimeters('0')).toThrow('maior que zero');
  });
  it('calcula tampo horizontal de 200 × 60 cm', () => {
    expect(calculateComponent({ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600 }).billableArea).toBe(1.2);
  });
  it('soma tampo, saia e rodabanca', () => {
    expect(aggregateComponentArea([{ label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600 }, { label: 'Saia', componentType: 'SKIRT', orientation: 'VERTICAL', lengthMm: 2000, widthMm: 100 }, { label: 'Rodabanca', componentType: 'BACKSPLASH', orientation: 'VERTICAL', lengthMm: 2000, widthMm: 100 }])).toBe(1.6);
  });
  it('calcula peitoril com acréscimos e duas laterais verticais', () => {
    expect(calculateComponent({ label: 'Peitoril', componentType: 'SILL', orientation: 'HORIZONTAL', lengthMm: 1200, widthMm: 200 }).billableArea).toBe(0.24);
    expect(aggregateComponentArea([{ label: 'Lateral E', componentType: 'SIDE_LEFT', orientation: 'VERTICAL', lengthMm: 100, widthMm: 200 }, { label: 'Lateral D', componentType: 'SIDE_RIGHT', orientation: 'VERTICAL', lengthMm: 100, widthMm: 200 }])).toBe(0.04);
  });
  it('respeita quantidade e borda por metro linear', () => {
    expect(calculateComponent({ label: 'Soleira', componentType: 'SILL', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 500, quantity: 2 }).billableArea).toBe(1);
    expect(calculateLinearMeters(2000)).toBe(2);
  });
  it('calcula a área da saia pela borda e altura informadas', () => {
    expect(calculateRectangleAreaM2(2000, 100)).toBe(0.2);
  });
  it('multiplica os acabamentos pela quantidade de peças', () => {
    expect(calculateLinearMeters(1900, 12)).toBeCloseTo(22.8, 8);
    expect(calculateRectangleAreaM2(1900, 100, 12)).toBeCloseTo(2.28, 8);
  });
});
