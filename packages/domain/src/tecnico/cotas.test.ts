import { describe, expect, it } from 'vitest';
import { cotasDaPeca, distanciasAteBordas } from './cotas.js';
import { makePiece } from './geometry.js';
import { featureSchema } from './schema.js';

describe('cotas da planta', () => {
  it('põe a cota de cada lado para fora da peça e usa o texto livre quando existe', () => {
    const peca = { ...makePiece('p', 'RECTANGLE'), dimensionLabels: { 'p-v1': 'medir no local' } };
    const cotas = cotasDaPeca(peca);
    expect(cotas.map((cota) => [cota.texto, cota.normal.x, cota.normal.y])).toEqual([['2m44', 0, -1], ['medir no local', 1, 0], ['2m44', 0, 1], ['65cm', -1, 0]]);
    // Contorno no sentido horário: a normal continua apontando para fora.
    const horario = { ...peca, contour: [...peca.contour].reverse() };
    // O primeiro lado agora é o de cima (y = 650), então "para fora" é para cima.
    expect(cotasDaPeca(horario)[0].normal).toEqual({ x: 0, y: 1 });
  });
  it('mede a distância da cuba até as quatro bordas', () => {
    const peca = makePiece('p', 'RECTANGLE');
    const cuba = featureSchema.parse({ id: 'c', type: 'SINK', pieceId: 'p', x: 1000, y: 300, widthMm: 500, lengthMm: 400 });
    expect(distanciasAteBordas(cuba, peca).map((d) => d.distancia)).toEqual([750, 1190, 100, 150]);
  });
});
