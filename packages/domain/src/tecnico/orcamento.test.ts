import { describe, expect, it } from 'vitest';
import { calcularLinha, calcularTotalOrcamento } from '../calculos/quote-calculator.js';
import { calcularAreaRetangularM2, calcularSubtotalMaterial, medidaM2Fechado } from '../calculos/components.js';
import { calcularAcabamentoBorda } from '../orcamentos/edge-finishes.js';
import { estimarDesenho, type CatalogoEstimativa } from './estimate.js';
import { contornoDosParametros, contourArea, makePiece } from './geometry.js';
import { desenhoParaOrcamento, retangulosDaPeca } from './orcamento.js';
import { emptyTechnicalDocument, featureSchema, type Feature, type Piece, type TechnicalDocument } from './schema.js';

const catalogo: CatalogoEstimativa = {
  materials: [{ id: 'granito', name: 'Granito Preto São Gabriel', billingUnit: 'SQUARE_METER', currentPrice: 600 }],
  services: [
    { id: 's-cuba', name: 'Recorte de cuba', billingUnit: 'UNIT', currentPrice: 180 },
    { id: 's-45', name: 'Acabamento 45°', billingUnit: 'LINEAR_METER', currentPrice: 70 },
    { id: 's-saia', name: 'Saia', billingUnit: 'LINEAR_METER', currentPrice: 0 },
    { id: 's-montagem', name: 'Instalação/Montagem', billingUnit: 'FIXED', currentPrice: 300 },
    { id: 's-furo', name: 'Furo de Torneira', billingUnit: 'UNIT', currentPrice: 30 },
  ],
};
const granito = { id: 'granito', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 };
const comPedra = (peca: Piece): Piece => ({ ...peca, material: granito });
const recurso = (dados: Partial<Feature> & Pick<Feature, 'id' | 'type' | 'pieceId'>) => featureSchema.parse({ x: 0, y: 0, ...dados });
function retangulo(id: string, width: number, length: number): Piece {
  const base = makePiece(id, 'RECTANGLE');
  const parameters = { ...base.parameters!, width, length };
  return comPedra({ ...base, parameters, contour: contornoDosParametros(id, parameters) });
}
/** Cozinha em U: fundo de 2m60 × 60cm, braços de 60cm × 90cm; cuba no fundo, saia no lado de fora e rodabanca na parede. */
function cozinhaEmU(): TechnicalDocument {
  const doc = emptyTechnicalDocument();
  doc.pieces.push(comPedra(makePiece('u', 'U')));
  doc.features.push(
    recurso({ id: 'cuba', type: 'SINK', pieceId: 'u', x: 1300, y: 1200, widthMm: 500, lengthMm: 400 }),
    recurso({ id: 'saia', type: 'SKIRT', pieceId: 'u', edgeId: 'u-v7', extentMm: 1500, heightMm: 40 }),
    recurso({ id: 'borda', type: 'EDGE_FINISH', pieceId: 'u', edgeId: 'u-v2', extentMm: 1400, profile: 'MITER45' }),
    recurso({ id: 'roda', type: 'BACKSPLASH', pieceId: 'u', name: 'Rodabanca', edgeId: 'u-v6', extentMm: 2600, heightMm: 100 }),
  );
  return doc;
}

describe('desenho técnico → projeto do orçamento', () => {
  it('L e U viram as partes retangulares, com a área exata do contorno', () => {
    const l = comPedra(makePiece('l', 'L'));
    expect(retangulosDaPeca(l)).toEqual({ envolvente: false, retangulos: [{ x0: 0, y0: 0, x1: 2440, y1: 600 }, { x0: 0, y0: 600, x1: 600, y1: 1500 }] });
    const u = comPedra(makePiece('u', 'U'));
    const { retangulos } = retangulosDaPeca(u);
    // Fundo inteiro primeiro (a parede), braços à parte — como a marmoraria cobra um U.
    expect(retangulos).toEqual([{ x0: 0, y0: 900, x1: 2600, y1: 1500 }, { x0: 0, y0: 0, x1: 600, y1: 900 }, { x0: 2000, y0: 0, x1: 2600, y1: 900 }]);
    const soma = retangulos.reduce((total, r) => total + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    expect(soma).toBe(contourArea(u.contour));
  });

  it('peça curva ou com cantos arredondados é cobrada pelo retângulo que a envolve', () => {
    const redonda = comPedra(makePiece('r', 'CIRCLE'));
    const arredondada = comPedra(makePiece('a', 'ROUNDED'));
    expect(retangulosDaPeca(redonda).envolvente).toBe(true);
    expect(retangulosDaPeca(arredondada)).toEqual({ envolvente: true, retangulos: [{ x0: 0, y0: 0, x1: 2440, y1: 650 }] });
    const doc = emptyTechnicalDocument();
    doc.pieces.push(arredondada);
    expect(estimarDesenho(doc, catalogo).linhas[0]).toMatchObject({ quantidade: 1.586, subtotal: calcularSubtotalMaterial(1.586, 600), detalhe: 'Peça curva ou diagonal: cobrada pelo retângulo 2m44 × 65cm' });
  });

  it('acabamentos caem no lado de cada parte, rodabanca e saia viram peças (Tipo/descrição) e a cuba fica na parte onde está', () => {
    const item = desenhoParaOrcamento(cozinhaEmU(), catalogo.services);
    expect(item.componentes.map(({ id, label, componentType, lengthMm, widthMm }) => ({ id, label, componentType, lengthMm, widthMm }))).toEqual([
      { id: 'u', label: 'Peça 1 · parte 1', componentType: 'TOP', lengthMm: 2600, widthMm: 600 },
      { id: 'u#2', label: 'Peça 1 · parte 2', componentType: 'TOP', lengthMm: 600, widthMm: 900 },
      { id: 'u#3', label: 'Peça 1 · parte 3', componentType: 'TOP', lengthMm: 600, widthMm: 900 },
      { id: 'saia', label: 'Saia · Peça 1', componentType: 'SKIRT', lengthMm: 1500, widthMm: 40 },
      { id: 'roda', label: 'Rodabanca · Peça 1', componentType: 'BACKSPLASH', lengthMm: 2600, widthMm: 100 },
    ]);
    expect(item.componentes[0].bordas).toEqual([{ recursoId: 'borda', tipo: 'EDGE_FINISH', side: 'FRONT', ladoInteiro: false, lengthMm: 1400, serviceId: 's-45' }]);
    expect(item.componentes[1].bordas).toEqual([]);
    // Saia no lado de fora (1m50) passa por duas partes (fundo e braço): uma peça só, sem lado único.
    expect(item.componentes[3]).not.toHaveProperty('paiId');
    expect(item.componentes[4]).toMatchObject({ paiId: 'u', ladoPai: 'BACK' });
    expect(item.recortes).toEqual([{ recursoId: 'cuba', pecaId: 'u', componente: 0, cutoutType: 'SINK', label: 'Cuba', lengthMm: 500, widthMm: 400, positionX: 1300, positionY: 300, serviceId: 's-cuba' }]);
    expect(item.materialId).toBe('granito');
  });

  it('a estimativa é a soma do projeto que vai para o orçamento, parte por parte', () => {
    const estimativa = estimarDesenho(cozinhaEmU(), catalogo, { servicosGerais: [{ serviceId: 's-montagem' }, { serviceId: 's-montagem' }] });
    const pedra = [2600 * 600, 600 * 900, 600 * 900, 2600 * 100, 1500 * 40].map((mm2) => calcularSubtotalMaterial(mm2 / 1_000_000, 600));
    const esperado = calcularTotalOrcamento([
      ...pedra,
      calcularAcabamentoBorda({ name: 'Acabamento 45°', lengthMm: 1400, quantity: 1, materialPrice: 600, servicePrice: 70 }).subtotal,
      calcularLinha({ billingUnit: 'UNIT', unitPrice: 180, billedQuantity: 1 }).subtotal,
      300,
    ]);
    expect(estimativa.total).toBe(esperado);
    expect(estimativa.problemas).toEqual([]);
    expect(estimativa.item.servicos).toEqual([{ serviceId: 's-montagem', quantidade: 1 }]);
    expect(estimativa.linhas.find((linha) => linha.id === 'u')).toMatchObject({ quantidade: 2.64, detalhe: '3 partes: 2m60 × 60cm + 60cm × 90cm + 60cm × 90cm' });
    expect(estimativa.linhas.find((linha) => linha.id === 'saia')).toMatchObject({ grupo: 'PEDRA', descricao: 'Saia · Peça 1', quantidade: .06, unidade: 'm²' });
    expect(estimativa.linhas.filter((linha) => linha.id.startsWith('geral-'))).toHaveLength(1);
  });

  it('com M² fechado a pedra de cada parte é cobrada com as medidas arredondadas de 5 em 5 cm', () => {
    const doc = emptyTechnicalDocument();
    doc.pieces.push(retangulo('p', 2437, 637));
    doc.features.push(recurso({ id: 'furo', type: 'HOLE', pieceId: 'p', x: 500, y: 500, diameterMm: 35 }));
    const exata = estimarDesenho(doc, catalogo);
    const fechada = estimarDesenho(doc, catalogo, { m2Fechado: true });
    expect([medidaM2Fechado(2437), medidaM2Fechado(637), medidaM2Fechado(2450)]).toEqual([2450, 650, 2450]);
    expect(exata.linhas[0]).toMatchObject({ quantidade: 1.552369, subtotal: calcularSubtotalMaterial(1.552369, 600) });
    expect(fechada.linhas[0]).toMatchObject({ quantidade: calcularAreaRetangularM2(2450, 650), subtotal: calcularSubtotalMaterial(1.5925, 600), detalhe: 'm² fechado: 2m45 × 65cm' });
    expect(fechada.total).toBe(calcularTotalOrcamento([calcularSubtotalMaterial(1.5925, 600), 30]));
    expect(fechada).toMatchObject({ areaTotalM2: 1.552369, areaCobradaM2: 1.5925 });
    // O projeto que vai para o orçamento guarda a medida exata; o M² fechado é aplicado lá, igual.
    expect(fechada.item.componentes[0]).toMatchObject({ lengthMm: 2437, widthMm: 637 });
  });

  it('aponta o que falta para ir ao orçamento', () => {
    const doc = cozinhaEmU();
    doc.pieces[0] = { ...doc.pieces[0], material: undefined };
    // A saia é pedra: não depende do serviço "Saia" do catálogo, só da pedra da peça.
    const semSaia = { ...catalogo, services: catalogo.services.filter((servico) => servico.id !== 's-saia') };
    const estimativa = estimarDesenho(doc, semSaia);
    expect(estimativa.problemas).toEqual(['Peça 1: Escolha a pedra da peça.', 'Saia · Peça 1: Escolha a pedra da peça.', 'Rodabanca · Peça 1: Escolha a pedra da peça.']);
    expect(estimarDesenho(emptyTechnicalDocument(), catalogo).problemas).toEqual(['Desenhe ao menos uma peça.']);
  });
});
