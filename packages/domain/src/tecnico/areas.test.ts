import { describe, expect, it } from 'vitest';
import { areasDaPeca, faixaDentroDaPeca, marcarArea, posicaoNoBalcao, tirarArea, trocarTipoArea } from './areas.js';
import { makePiece } from './geometry.js';
import { centroDaPecaNoMundo, girarPeca } from './commands.js';
import { emptyTechnicalDocument } from './schema.js';
import { pieceSchema, type Piece } from './schema.js';

const balcao = (zonas: Piece['wetDryZones'] = []): Piece => ({ ...makePiece('b', 'RECTANGLE'), wetDryZones: zonas });

describe('área seca e área molhada do balcão', () => {
  it('marca o trecho entre os dois cliques, em qualquer ordem, e mede o tamanho', () => {
    const peca = balcao();
    const zonas = marcarArea(peca, 1500, 300, 'WET');
    expect(zonas).toEqual([{ kind: 'WET', startMm: 300, endMm: 1500 }]);
    expect(areasDaPeca({ ...peca, wetDryZones: zonas })).toEqual([{ indice: 0, tipo: 'WET', inicioMm: 300, fimMm: 1500, x0: 300, x1: 1500, comprimentoMm: 1200 }]);
    expect(areasDaPeca(peca)).toEqual([]);
    expect(marcarArea(peca, 100, 105, 'WET')).toEqual([]);
  });

  it('o clique cai no centímetro, dentro da peça, e cola nas pontas', () => {
    const peca = balcao();
    expect([posicaoNoBalcao(peca, 1203.7), posicaoNoBalcao(peca, -80), posicaoNoBalcao(peca, 3), posicaoNoBalcao(peca, 2437), posicaoNoBalcao(peca, 9999)]).toEqual([1200, 0, 0, 2440, 2440]);
  });

  it('trecho novo toma o lugar do que estava marcado; iguais que se encostam se juntam', () => {
    let peca = balcao(marcarArea(balcao(), 0, 2440, 'DRY'));
    peca = { ...peca, wetDryZones: marcarArea(peca, 800, 2000, 'WET') };
    expect(peca.wetDryZones).toEqual([{ kind: 'DRY', startMm: 0, endMm: 800 }, { kind: 'WET', startMm: 800, endMm: 2000 }, { kind: 'DRY', startMm: 2000, endMm: 2440 }]);
    // Trocar a molhada para seca junta as três numa só; tirar deixa o trecho sem marcação.
    expect(trocarTipoArea(peca, 1)).toEqual([{ kind: 'DRY', startMm: 0, endMm: 2440 }]);
    expect(tirarArea(peca, 1)).toEqual([{ kind: 'DRY', startMm: 0, endMm: 800 }, { kind: 'DRY', startMm: 2000, endMm: 2440 }]);
  });

  it('desenho salvo no primeiro formato (só tamanhos) abre com as áreas no mesmo lugar', () => {
    const antigo = { ...makePiece('b', 'RECTANGLE'), wetDryZones: [{ kind: 'WET', lengthMm: 1200 }, { kind: 'DRY', lengthMm: 1240 }] };
    expect(pieceSchema.parse(antigo).wetDryZones).toEqual([{ kind: 'WET', startMm: 0, endMm: 1200 }, { kind: 'DRY', startMm: 1200, endMm: 2440 }]);
    const { wetDryZones: _semZonas, ...semCampo } = antigo;
    expect(pieceSchema.parse(semCampo).wetDryZones).toEqual([]);
  });

  it('se a peça encolhe, as áreas cabem nela e o rótulo acha o trecho dentro do U', () => {
    const encolhido = balcao([{ kind: 'WET', startMm: 2000, endMm: 3000 }, { kind: 'DRY', startMm: 2600, endMm: 2900 }]);
    expect(areasDaPeca(encolhido)).toEqual([{ indice: 0, tipo: 'WET', inicioMm: 2000, fimMm: 2440, x0: 2000, x1: 2440, comprimentoMm: 440 }]);
    const u = makePiece('u', 'U');
    expect(faixaDentroDaPeca(u, 1300)).toEqual({ y0: 900, y1: 1500 });
    expect(faixaDentroDaPeca(u, 300)).toEqual({ y0: 0, y1: 1500 });
  });

  it('girar a peça mantém o centro dela no lugar, em qualquer ângulo', () => {
    const doc = emptyTechnicalDocument();
    doc.pieces.push({ ...makePiece('p', 'RECTANGLE'), x: 1000, y: 500 });
    const centro = centroDaPecaNoMundo(doc.pieces[0]);
    for (const graus of [90, 37, 180, -45, 405]) {
      const girado = girarPeca(doc, 'p', graus);
      const depois = centroDaPecaNoMundo(girado.pieces[0]);
      expect(Math.abs(depois.x - centro.x)).toBeLessThan(.1);
      expect(Math.abs(depois.y - centro.y)).toBeLessThan(.1);
      expect(girado.pieces[0].rotationDeg).toBe(((graus % 360) + 360) % 360);
    }
    expect(girarPeca({ ...doc, pieces: [{ ...doc.pieces[0], locked: true }] }, 'p', 90).pieces[0].rotationDeg).toBe(0);
  });
});
