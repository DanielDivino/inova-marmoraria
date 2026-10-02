import { describe, expect, it } from 'vitest';
import { contornoDosParametros, makePiece, validateTechnicalDocument } from './geometry.js';
import { emptyTechnicalDocument, featureSchema, type Piece } from './schema.js';
import { ladoDaPeca } from './sincronia.js';
import { linhaDaEmenda, partesDaPeca, pecasFisicasDoDesenho } from './divisao.js';
import { desenhoParaOrcamento } from './orcamento.js';
import { estimarDesenho } from './estimate.js';

const retangulo = (id: string, width: number, length: number): Piece => {
  const parameters = { ...makePiece(id).parameters!, shape: 'RECTANGLE' as const, width, length };
  return { ...makePiece(id), name: 'Bancada', geometryMode: 'PARAMETRIC', parameters, contour: contornoDosParametros(id, parameters), material: { id: 'm1', name: 'Branco Dallas', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } };
};
const emenda = (id: string, peca: Piece, lado: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT', startMm: number) => featureSchema.parse({ id, type: 'SEAM', pieceId: peca.id, name: 'Emenda', x: 0, y: 0, edgeId: ladoDaPeca(peca, lado), startMm });
const medidas = (peca: Piece, emendas: ReturnType<typeof emenda>[]) => partesDaPeca(peca, emendas).map((parte) => [parte.comprimentoMm, parte.larguraMm, parte.areaMm2]);

describe('emendas: a peça dividida em pedras', () => {
  it('bancada de 4 m com uma emenda a 2m40 vira duas pedras; com duas emendas, três; a área não muda', () => {
    const bancada = retangulo('b', 4000, 600);
    expect(medidas(bancada, [])).toEqual([[4000, 600, 2_400_000]]);
    expect(medidas(bancada, [emenda('e1', bancada, 'FRONT', 2400)])).toEqual([[2400, 600, 1_440_000], [1600, 600, 960_000]]);
    expect(medidas(bancada, [emenda('e1', bancada, 'FRONT', 2400), emenda('e2', bancada, 'FRONT', 1000)])).toEqual([[1000, 600, 600_000], [1400, 600, 840_000], [1600, 600, 960_000]]);
    // O lado de cima começa na ponta direita: 1 m dele é a 3 m da esquerda.
    expect(medidas(bancada, [emenda('e3', bancada, 'BACK', 1000)])).toEqual([[3000, 600, 1_800_000], [1000, 600, 600_000]]);
    expect(linhaDaEmenda(bancada, emenda('e1', bancada, 'FRONT', 2400))).toEqual({ a: { x: 2400, y: 0 }, b: { x: 2400, y: 600 } });
  });

  it('L dividido na quina: o braço inteiro numa pedra e o resto da base na outra', () => {
    const l = { ...makePiece('l', 'L'), name: 'Bancada em L' };
    expect(medidas(l, [emenda('e', l, 'FRONT', 600)])).toEqual([[600, 1500, 900_000], [1840, 600, 1_104_000]]);
  });

  it('emenda na ponta ou em lado curvo não corta; a validação aponta', () => {
    const bancada = retangulo('b', 2000, 600);
    const naPonta = emenda('e', bancada, 'FRONT', 0);
    expect(partesDaPeca(bancada, [naPonta])).toHaveLength(1);
    expect(linhaDaEmenda(bancada, naPonta)).toBeNull();
    const redonda = makePiece('r', 'CIRCLE');
    const curva = featureSchema.parse({ id: 'c', type: 'SEAM', pieceId: 'r', x: 0, y: 0, edgeId: redonda.contour[0].id, startMm: 100 });
    expect(partesDaPeca(redonda, [curva])).toHaveLength(1);
    const doc = emptyTechnicalDocument();
    doc.pieces.push(bancada);
    doc.features.push(naPonta);
    expect(validateTechnicalDocument(doc).map((diagnostico) => diagnostico.code)).toContain('SEAM_POSITION');
    doc.features = [emenda('ok', bancada, 'FRONT', 1200)];
    expect(validateTechnicalDocument(doc).map((diagnostico) => diagnostico.code)).not.toContain('SEAM_POSITION');
  });

  it('peças físicas: cada pedra e a rodabanca; o orçamento e o valor do desenho não mudam com a emenda', () => {
    const doc = emptyTechnicalDocument();
    const bancada = retangulo('b', 4000, 600);
    doc.pieces.push(bancada);
    doc.features.push(featureSchema.parse({ id: 'roda', type: 'BACKSPLASH', pieceId: 'b', x: 0, y: 0, edgeId: ladoDaPeca(bancada, 'BACK'), startMm: 0, extentMm: 4000, heightMm: 100 }));
    const catalogo = { materials: [{ id: 'm1', name: 'Branco Dallas', billingUnit: 'SQUARE_METER' as const, currentPrice: 600 }], services: [] };
    const semEmenda = { item: desenhoParaOrcamento(doc, []), total: estimarDesenho(doc, catalogo).total };
    doc.features.push(emenda('e', bancada, 'FRONT', 2400));
    expect(pecasFisicasDoDesenho(doc)).toEqual([
      { chave: 'b:1', nome: 'Bancada · parte 1', pecaId: 'b', lengthMm: 2400, widthMm: 600, material: 'Branco Dallas' },
      { chave: 'b:2', nome: 'Bancada · parte 2', pecaId: 'b', lengthMm: 1600, widthMm: 600, material: 'Branco Dallas' },
      { chave: 'roda', nome: 'Rodabanca · Bancada', pecaId: 'b', recursoId: 'roda', lengthMm: 4000, widthMm: 100, material: 'Branco Dallas' },
    ]);
    expect(desenhoParaOrcamento(doc, [])).toEqual(semEmenda.item);
    expect(estimarDesenho(doc, catalogo).total).toBe(semEmenda.total);
  });
});
