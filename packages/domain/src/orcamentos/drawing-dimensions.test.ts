import { describe, expect, it } from 'vitest';
import { rotuloMedidaDesenho, posicaoMarcadorMeiaEsquadria, posicaoMedidaFaixa } from './component-details.js';

describe('Cotas exatas e posicionamento das saias', () => {
  it.each([[75, '7,5 cm'], [125, '12,5 cm'], [1205, '120,5 cm'], [1, '0,1 cm'], [1200, '1,20 m'], [500, '0,50 m'], [80, '0,08 m']])('formata %s mm sem perder precisão', (mm, expected) => {
    expect(rotuloMedidaDesenho(Number(mm))).toBe(expected);
  });
  it('preserva casas decimais nas medidas de saia e vista', () => {
    expect(rotuloMedidaDesenho(75, 'cm')).toBe('7,5 cm');
    expect(rotuloMedidaDesenho(50, 'cm')).toBe('5 cm');
  });
  it.each(['LEFT', 'RIGHT'] as const)('separa a cota lateral do símbolo de 45° em %s, inclusive em peça estreita', (side) => {
    const piece = { x: 100, y: 100, width: 170, height: 24 };
    const extra = { top: 10, bottom: 5, left: 5, right: 5 };
    const label = posicaoMedidaFaixa(side, { x: side === 'LEFT' ? 95 : 270, y: 100, width: 5, height: 24 }, 90);
    const marker = posicaoMarcadorMeiaEsquadria(side, piece, extra)!;
    const markerTop = side === 'LEFT' ? marker.y - 40 : marker.y;
    expect(label.y + 4).toBeLessThan(markerTop);
    expect(label.anchor).toBe('middle');
    expect(posicaoMedidaFaixa(side, { x: 95, y: 100, width: 5, height: 24 }, 90, 1).y).toBe(label.y - 12);
  });
});
