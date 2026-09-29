import { describe, expect, it } from 'vitest';
import { alterarMedidaLado, ajustarRecursosDeBorda } from './lados.js';
import { makePiece, parametricContour } from './geometry.js';
import { emptyTechnicalDocument, featureSchema } from './schema.js';

const retangulo = () => parametricContour('r', 'RECTANGLE', 2000, 600);
const pontos = (resultado: ReturnType<typeof alterarMedidaLado>) => 'contorno' in resultado ? resultado.contorno.map((v) => [v.x, v.y]) : resultado.erro;

describe('medida digitada em um lado', () => {
  it('estica o retângulo pelo lado e o lado oposto acompanha, em esquadro', () => {
    expect(pontos(alterarMedidaLado(retangulo(), 'r-v0', 2400))).toEqual([[0, 0], [2400, 0], [2400, 600], [0, 600]]);
    expect(pontos(alterarMedidaLado(retangulo(), 'r-v1', 700))).toEqual([[0, 0], [2000, 0], [2000, 700], [0, 700]]);
  });
  it('no L, o vértice final anda na direção do lado e o lado paralelo mais próximo absorve', () => {
    const l = parametricContour('l', 'L', 2400, 1800, 0, 600);
    // Ponta do braço (de (600,1800) até (0,1800)) passa de 60cm para 70cm: a parede externa vai 10cm para fora.
    expect(pontos(alterarMedidaLado(l, 'l-v4', 700))).toEqual([[-100, 0], [2400, 0], [2400, 600], [600, 600], [600, 1800], [-100, 1800]]);
    // Braço mais comprido (parede interna de 1m20 para 1m50): o topo do braço sobe 30cm.
    expect(pontos(alterarMedidaLado(l, 'l-v3', 1500))).toEqual([[0, 0], [2400, 0], [2400, 600], [600, 600], [600, 2100], [0, 2100]]);
  });
  it('lado travado não muda: o ajuste vai para outro lado, e sem saída avisa', () => {
    const travadoOposto = alterarMedidaLado(retangulo(), 'r-v1', 700, ['r-v3']);
    expect('contorno' in travadoOposto).toBe(true);
    const r = retangulo();
    // Com os outros três lados travados não há como fechar a forma.
    expect(alterarMedidaLado(r, 'r-v0', 2400, ['r-v1', 'r-v2', 'r-v3'])).toEqual({ erro: expect.stringMatching(/travados/) });
    expect(alterarMedidaLado(r, 'r-v0', 2400, ['r-v0'])).toEqual({ erro: expect.stringMatching(/travado/) });
  });
  it('não aceita medida que cruzaria o contorno nem medida zero', () => {
    // Peça côncava: alongar o lado inclinado faria ele atravessar a borda de baixo.
    const concava = [[0, 0], [2000, 0], [2000, 1000], [1000, 100], [0, 1000]].map(([x, y], i) => ({ id: `c${i}`, x, y, bulge: 0 }));
    expect(alterarMedidaLado(concava, 'c2', 3000)).toEqual({ erro: expect.stringMatching(/cruzaria/) });
    expect(alterarMedidaLado(retangulo(), 'r-v0', 0)).toEqual({ erro: 'Informe uma medida maior que zero.' });
  });
  it('saia e rodabanca continuam dentro do lado que encurtou', () => {
    const doc = emptyTechnicalDocument();
    const peca = makePiece('p', 'RECTANGLE');
    doc.pieces.push(peca);
    doc.features.push(featureSchema.parse({ id: 's', type: 'SKIRT', pieceId: 'p', x: 0, y: 0, edgeId: 'p-v0', startMm: 200, extentMm: 2000 }));
    const menor = { ...peca, contour: peca.contour.map((v) => ({ ...v, x: Math.min(v.x, 1500) })) };
    expect(ajustarRecursosDeBorda(doc, menor).features[0]).toMatchObject({ startMm: 200, extentMm: 1300 });
  });
});
