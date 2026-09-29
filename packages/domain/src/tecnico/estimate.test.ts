import { describe, expect, it } from 'vitest';
import { calcularLinha, calcularLinhaServico, calcularTotalCartao, calcularTotalOrcamento } from '../calculos/quote-calculator.js';
import { calcularComponente, calcularSubtotalMaterial } from '../calculos/components.js';
import { calcularAcabamentoBorda } from '../orcamentos/edge-finishes.js';
import { areaCobradaPecaM2, estimarDesenho, type CatalogoEstimativa } from './estimate.js';
import { contornoDosParametros, makePiece } from './geometry.js';
import { emptyTechnicalDocument, featureSchema, nomeDaPeca, pieceSchema, type Feature, type Piece, type TechnicalDocument } from './schema.js';

const catalogo: CatalogoEstimativa = {
  materials: [{ id: 'granito', name: 'Granito Preto São Gabriel', billingUnit: 'SQUARE_METER', currentPrice: 600 }, { id: 'sem-preco', name: 'Quartzo novo', billingUnit: 'SQUARE_METER', currentPrice: null }],
  services: [
    { id: 's-cuba', name: 'Recorte de cuba', billingUnit: 'UNIT', currentPrice: 180 },
    { id: 's-oval', name: 'Corte de cuba oval', billingUnit: 'UNIT', currentPrice: 80 },
    { id: 's-furo', name: 'Furo de Torneira', billingUnit: 'UNIT', currentPrice: 30 },
    { id: 's-45', name: 'Acabamento 45°', billingUnit: 'LINEAR_METER', currentPrice: 70 },
    { id: 's-saia', name: 'Saia', billingUnit: 'LINEAR_METER', currentPrice: 0 },
    { id: 's-jateado', name: 'Acabamento Jateado', billingUnit: 'SQUARE_METER', currentPrice: 400 },
    { id: 's-montagem', name: 'Instalação/Montagem', billingUnit: 'FIXED', currentPrice: 300 },
  ],
};
function peca(id: string, width: number, length: number, material = 'granito'): Piece {
  const base = makePiece(id, 'RECTANGLE');
  const parameters = { ...base.parameters!, width, length };
  return { ...base, parameters, contour: contornoDosParametros(id, parameters), material: { id: material, textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } };
}
const recurso = (dados: Partial<Feature> & Pick<Feature, 'id' | 'type' | 'pieceId'>) => featureSchema.parse({ x: 0, y: 0, ...dados });
function cozinha(): TechnicalDocument {
  const doc = emptyTechnicalDocument();
  doc.pieces.push(peca('a', 2000, 600), { ...peca('b', 900, 500), x: 2500 });
  doc.features.push(
    recurso({ id: 'cuba', type: 'SINK', pieceId: 'a', x: 1000, y: 300, widthMm: 500, lengthMm: 400 }),
    recurso({ id: 'furo', type: 'HOLE', pieceId: 'a', x: 1000, y: 540, diameterMm: 35 }),
    recurso({ id: 'saia', type: 'SKIRT', pieceId: 'a', edgeId: 'a-v0', extentMm: 2000, heightMm: 40 }),
    recurso({ id: 'borda', type: 'EDGE_FINISH', pieceId: 'a', edgeId: 'a-v0', extentMm: 2000, profile: 'MITER45' }),
    recurso({ id: 'roda', type: 'BACKSPLASH', pieceId: 'a', edgeId: 'a-v2', extentMm: 2000, heightMm: 100 }),
  );
  return doc;
}

describe('estimativa pelo desenho', () => {
  it('bate com o total que o orçamento calcula para as mesmas peças retangulares', () => {
    const estimativa = estimarDesenho(cozinha(), catalogo, { servicosGerais: [{ serviceId: 's-jateado' }, { serviceId: 's-montagem' }] });

    // O mesmo projeto como o orçamento monta (quote.service → montarItem).
    const componentes = [{ lengthMm: 2000, widthMm: 600 }, { lengthMm: 2000, widthMm: 100 }, { lengthMm: 900, widthMm: 500 }]
      .map((medida) => calcularComponente({ label: 'Peça', componentType: 'COUNTER', orientation: 'HORIZONTAL', ...medida }));
    const areaDoProjeto = componentes.reduce((soma, componente) => soma + componente.billableArea, 0);
    const orcamento = calcularTotalOrcamento([
      ...componentes.map((componente) => calcularSubtotalMaterial(componente.billableArea, 600)),
      calcularAcabamentoBorda({ name: 'Saia', lengthMm: 2000, heightMm: 40, quantity: 1, materialPrice: 600, servicePrice: 0 }).subtotal,
      calcularAcabamentoBorda({ name: 'Acabamento 45°', lengthMm: 2000, quantity: 1, materialPrice: 600, servicePrice: 70 }).subtotal,
      calcularLinha({ billingUnit: 'UNIT', unitPrice: 180, billedQuantity: 1 }).subtotal,
      calcularLinha({ billingUnit: 'UNIT', unitPrice: 30, billedQuantity: 1 }).subtotal,
      calcularLinhaServico({ serviceName: 'Acabamento Jateado', billingUnit: 'SQUARE_METER', unitPrice: 400, billedQuantity: areaDoProjeto }).subtotal,
      calcularLinhaServico({ serviceName: 'Instalação/Montagem', billingUnit: 'FIXED', unitPrice: 300, billedQuantity: 1 }).subtotal,
    ]);

    expect(estimativa.total).toBe(orcamento);
    // 720 + 120 + 270 (pedra) + 48 (saia) + 140 (45°) + 180 (cuba) + 30 (furo) + 800 (jateado: 1,85 m² → 2 m²) + 300 (montagem).
    expect(estimativa.total).toBe(2608);
    expect(estimativa).toMatchObject({ areaTotalM2: 1.85, totalPix: 2608, totalCartao: calcularTotalCartao(2608), itensSemPreco: 0 });
    expect(estimativa.linhas.find((linha) => linha.id === 'saia')).toMatchObject({ quantidade: .08, unidade: 'm²', subtotal: 48 });
    expect(estimativa.linhas.find((linha) => linha.id === 'borda')).toMatchObject({ descricao: 'Acabamento 45° · Peça 1', quantidade: 2, unidade: 'm', subtotal: 140 });
  });

  it('mostra "sem preço" na linha em vez de somar zero calado', () => {
    const doc = cozinha();
    doc.pieces[1] = { ...doc.pieces[1], material: { id: 'sem-preco', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } };
    doc.pieces.push({ ...peca('c', 800, 400), material: undefined, x: 4000 });
    doc.features.push(recurso({ id: 'chanfro', type: 'EDGE_FINISH', pieceId: 'a', edgeId: 'a-v1', extentMm: 600, profile: 'BEVEL' }));
    const estimativa = estimarDesenho(doc, catalogo);
    expect(estimativa.linhas.find((linha) => linha.id === 'b')).toMatchObject({ subtotal: null, semPreco: 'Quartzo novo está sem preço vigente.' });
    expect(estimativa.linhas.find((linha) => linha.id === 'c')).toMatchObject({ subtotal: null, semPreco: 'Escolha a pedra da peça.' });
    expect(estimativa.linhas.find((linha) => linha.id === 'chanfro')).toMatchObject({ subtotal: null, semPreco: 'Escolha o serviço de acabamento.' });
    expect(estimativa.itensSemPreco).toBe(3);
    expect(estimativa.total).toBe(720 + 120 + 48 + 140 + 180 + 30);
  });

  it('peça sem nome é aceita e aparece como "Peça N" no valor', () => {
    const doc = cozinha();
    doc.pieces[1] = pieceSchema.parse({ ...doc.pieces[1], name: '' });
    expect(doc.pieces[1].name).toBe('');
    expect(nomeDaPeca(doc.pieces[1], doc.pieces)).toBe('Peça 2');
    expect(estimarDesenho(doc, catalogo).linhas.find((linha) => linha.id === 'b')).toMatchObject({ descricao: 'Peça 2 · Granito Preto São Gabriel' });
  });

  it('usa o serviço escolhido para o componente e cobra peça irregular pela área do contorno', () => {
    const doc = cozinha();
    const l = makePiece('l', 'L');
    doc.pieces.push({ ...l, material: { id: 'granito', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } });
    const estimativa = estimarDesenho(doc, catalogo, { servicoDoRecurso: { cuba: 's-oval' } });
    expect(estimativa.linhas.find((linha) => linha.id === 'cuba')).toMatchObject({ descricao: 'Corte de cuba oval · Peça 1', subtotal: 80 });
    // L de 2m44 × 1m50 com largura de 60cm: 2,44 × 0,6 + 0,6 × 0,9 = 2,004 m² (cubas e recortes não descontam).
    expect(areaCobradaPecaM2(l)).toBe(2.004);
    expect(estimativa.linhas.find((linha) => linha.id === 'l')).toMatchObject({ quantidade: 2.004, subtotal: calcularSubtotalMaterial(2.004, 600) });
  });
});
