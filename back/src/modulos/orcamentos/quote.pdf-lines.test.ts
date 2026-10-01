import { describe, expect, it } from 'vitest';
import { montarLinhasPdf } from './quote.pdf-lines.js';
import { quotePdfOptionsSchema } from './quote.pdf-options.js';

const edge = (billedQuantity: number, appliedSubtotal: number, serviceNameSnapshot = 'Acabamento 45°') => ({ side: 'FRONT', serviceNameSnapshot, billingUnitSnapshot: 'LINEAR_METER', billedQuantity, appliedSubtotal });
const piece = (edges: any[], extra = {}) => ({ label: 'Balcão', lengthMm: 2000, widthMm: 600, quantity: 2, billableArea: 2.4, subtotal: 1000, edges, ...extra });

describe('Linhas comerciais do PDF', () => {
  it('identifica pedras diferentes e não mistura rodabancas de materiais distintos', () => {
    const result = montarLinhasPdf([{ materialNameSnapshot: 'Pedra A', components: [
      piece([], { componentType: 'BACKSPLASH', materialId: 'a', materialNameSnapshot: 'Pedra A', subtotal: 35 }),
      piece([], { componentType: 'BACKSPLASH', materialId: 'b', materialNameSnapshot: 'Pedra B', subtotal: 49 }),
      piece([], { componentType: 'BACKSPLASH', materialId: 'a', materialNameSnapshot: 'Pedra A', subtotal: 70 }),
    ] }]);
    expect(result.items[0].map(line => [line.description, line.total])).toEqual([['Rodabanca · Pedra A', 105], ['Rodabanca · Pedra B', 49]]);
  });
  it('soma metragens já faturadas e preços aplicados em projetos diferentes, sem alterar snapshots', () => {
    const items = [{ components: [piece([edge(4, 200), edge(1.2, 90)])], services: [edge(.8, 70)] }, { components: [piece([edge(2, 0)])] }];
    const before = structuredClone(items);
    const result = montarLinhasPdf(items);
    expect(result.linear).toEqual([{ description: 'Acabamento 45°', measure: 8, unit: 'm', total: 360 }]);
    expect(result.items.flat()).toHaveLength(2);
    expect(items).toEqual(before);
  });
  it('mantém tipos diferentes separados e inclui recortes cobrados por metro linear', () => {
    const result = montarLinhasPdf([{ components: [piece([edge(2, 80), edge(1, 20, 'Polimento')])], services: [edge(1, 30, 'Friso')], cutouts: [edge(.5, 15, 'Friso')] }]);
    expect(result.linear.map(line => [line.description, line.measure, line.total])).toEqual([['Acabamento 45°', 2, 80], ['Polimento', 1, 20], ['Friso', 1.5, 45]]);
  });
  it('não agrupa saia/vista em m² e reconcilia o preço manual da peça sem duplicar bordas', () => {
    const result = montarLinhasPdf([{ components: [piece([
      edge(2, 80), { ...edge(.2, 100, 'Saia'), billingUnitSnapshot: 'SQUARE_METER' },
      { ...edge(.1, 50, 'Vista'), billingUnitSnapshot: 'SQUARE_METER' },
    ], { appliedTotal: 1100 })], services: [{ ...edge(1, 200, 'Cuba'), billingUnitSnapshot: 'UNIT' }] }]);
    expect(result.linear).toHaveLength(1);
    expect(result.items[0].filter(line => line.unit === 'm²')).toHaveLength(3);
    expect(result.items[0].find(line => line.adjustment)?.total).toBe(-130);
  });
  it('agrupa várias vistas da mesma peça em uma única linha', () => {
    const result = montarLinhasPdf([{ components: [piece([
      { ...edge(.025, 17.5, 'Vista'), billingUnitSnapshot: 'SQUARE_METER' },
      { ...edge(.025, 17.5, 'Vista'), billingUnitSnapshot: 'SQUARE_METER' },
      { ...edge(.06, 42, 'Vista'), billingUnitSnapshot: 'SQUARE_METER' },
    ])] }]);
    const vistas = result.items[0].filter((line) => line.description.startsWith('Vista'));
    expect(vistas).toEqual([{ description: 'Vista - Inferior', measure: .11, unit: 'm²', total: 77 }]);
  });
  it('rodabancas: uma linha só, com área, quantidade e valor somados; a largura comum aparece, o comprimento diferente não', () => {
    const result = montarLinhasPdf([{ components: [
      { componentType: 'BACKSPLASH', label: 'Rodabanca 1', lengthMm: 1200, widthMm: 80, quantity: 1, billableArea: .096, subtotal: 57.60, edges: [] },
      { componentType: 'BACKSPLASH', label: 'Rodabanca 2', lengthMm: 700, widthMm: 80, quantity: 2, billableArea: .112, subtotal: 67.20, edges: [] },
      { componentType: 'BACKSPLASH', label: 'Rodabanca 3', lengthMm: 1200, widthMm: 80, quantity: 1, billableArea: .096, subtotal: 57.60, edges: [] },
    ] }]);
    const rodabancas = result.items[0].filter((line) => line.description === 'Rodabanca');
    expect(rodabancas).toEqual([{ description: 'Rodabanca', widthMm: 80, measure: .304, unit: 'm²', quantity: 4, total: 182.40 }]);
  });
  it('saia: uma linha só no projeto, somando m² e valores das peças; os lados aparecem quando é de uma peça', () => {
    const saia = (side: string, billedQuantity: number, appliedSubtotal: number) => ({ side, serviceNameSnapshot: 'Saia', billingUnitSnapshot: 'SQUARE_METER', billedQuantity, appliedSubtotal });
    const result = montarLinhasPdf([
      { components: [
        piece([saia('FRONT', .3, 210), saia('BACK', .3, 210), saia('LEFT', .0825, 57.75), saia('RIGHT', .0825, 57.75)], { label: 'Bancada' }),
        piece([saia('FRONT', .2, 140), saia('BACK', .2, 140), saia('RIGHT', .0136, 9.52)], { label: 'Lavatório' }),
      ] },
      { components: [piece([saia('FRONT', .2, 140), saia('LEFT', .05, 35)])] },
    ]);
    expect(result.items[0].filter((line) => line.description.startsWith('Saia'))).toEqual([{ description: 'Saia', measure: 1.1786, unit: 'm²', total: 825.02 }]);
    expect(result.items[1].filter((line) => line.description.startsWith('Saia'))).toEqual([{ description: 'Saia - Inferior / Esquerdo', measure: .25, unit: 'm²', total: 175 }]);
  });
  it('junta só peças com a mesma descrição e a mesma medida (somando quantidade, m² e valor); vistas viram uma linha só, como saia e rodabanca', () => {
    const result = montarLinhasPdf([{ components: [
      { componentType: 'COUNTER', label: 'Bancada', lengthMm: 1200, widthMm: 600, quantity: 1, billableArea: .72, subtotal: 432, edges: [] },
      { componentType: 'COUNTER', label: 'Bancada', lengthMm: 900, widthMm: 600, quantity: 2, billableArea: 1.08, subtotal: 648, edges: [] },
      { componentType: 'COUNTER', label: 'Bancada', lengthMm: 1200, widthMm: 600, quantity: 1, billableArea: .72, subtotal: 432, edges: [] },
      { componentType: 'VISTA', label: 'Vista', lengthMm: 900, widthMm: 50, quantity: 1, billableArea: .045, subtotal: 27, edges: [] },
      { componentType: 'VISTA', label: 'Vista', lengthMm: 700, widthMm: 50, quantity: 1, billableArea: .035, subtotal: 21, edges: [] },
    ] }]);

    expect(result.items[0]).toEqual([
      expect.objectContaining({ description: 'Bancada', lengthMm: 1200, widthMm: 600, measure: 1.44, quantity: 2, total: 864 }),
      expect.objectContaining({ description: 'Bancada', lengthMm: 900, widthMm: 600, measure: 1.08, quantity: 2, total: 648 }),
      { description: 'Vista', widthMm: 50, measure: .08, unit: 'm²', quantity: 2, total: 48 },
    ]);
  });
  it('saia no Tipo/descrição e saia antiga (acabamento) somam na mesma linha, depois da rodabanca e da vista', () => {
    const result = montarLinhasPdf([{ components: [
      piece([{ side: 'FRONT', serviceNameSnapshot: 'Saia', billingUnitSnapshot: 'SQUARE_METER', billedQuantity: .08, appliedSubtotal: 56 }], { label: 'Bancada', quantity: 1 }),
      { componentType: 'SKIRT', label: 'Saia · Bancada', lengthMm: 2000, widthMm: 40, quantity: 1, billableArea: .08, subtotal: 56, edges: [] },
      { componentType: 'VISTA', label: '', lengthMm: 2000, widthMm: 50, quantity: 1, billableArea: .1, subtotal: 70, edges: [] },
      { componentType: 'BACKSPLASH', label: '', lengthMm: 2000, widthMm: 100, quantity: 1, billableArea: .2, subtotal: 140, edges: [] },
    ] }]);
    expect(result.items[0].slice(1)).toEqual([
      { description: 'Rodabanca', lengthMm: 2000, widthMm: 100, measure: .2, unit: 'm²', quantity: 1, total: 140 },
      { description: 'Vista', lengthMm: 2000, widthMm: 50, measure: .1, unit: 'm²', quantity: 1, total: 70 },
      { description: 'Saia', measure: .16, unit: 'm²', total: 112 },
    ]);
  });
  it('preserva valores zero, área manual, recortes e precisão decimal', () => {
    const result = montarLinhasPdf([{ components: [], billedQuantity: 1.5, materialSubtotal: 500, services: [edge(.075, .1), edge(.025, .2)], cutouts: [{ label: 'Furo', quantity: 1, calculatedSubtotal: 30, appliedSubtotal: 0 }] }]);
    expect(result.linear[0]).toMatchObject({ measure: .1, total: .3 });
    expect(result.items[0]).toMatchObject([{ measure: 1.5, total: 500 }, { description: 'Furo', total: 0 }]);
  });
  it.each([109.01, 80])('reconcilia cada linha do PDF com o total aplicado da peça e serviços (%s)', appliedTotal => {
    const result = montarLinhasPdf([{ components: [piece([
      { ...edge(2, 5.01), calculatedSubtotal: 20 },
      { ...edge(.05, 4, 'Vista'), billingUnitSnapshot: 'SQUARE_METER', calculatedSubtotal: 5 },
    ], { subtotal: 100, appliedTotal })], services: [{ ...edge(1, 8.01, 'Furo de torneira'), billingUnitSnapshot: 'UNIT', calculatedSubtotal: 10 }], cutouts: [{ label: 'Recorte da cuba', quantity: 1, billingUnitSnapshot: 'UNIT', calculatedSubtotal: 3, appliedSubtotal: 2.01 }] }]);
    const lineTotal = result.items[0].reduce((sum, line) => sum + line.total, 0) + result.linear.reduce((sum, line) => sum + line.total, 0);
    const expected = appliedTotal + 8.01 + 2.01;
    expect(Math.round(lineTotal * 100)).toBe(Math.round(expected * 100));
  });
  it('apresenta a montagem pelo valor digitado, sem linha de desconto', () => {
    const result = montarLinhasPdf([{ components: [], services: [{ serviceNameSnapshot: 'Montagem', billingUnitSnapshot: 'FIXED', billedQuantity: 1, calculatedSubtotal: 300, appliedSubtotal: 250 }] }]);
    const assemblyLines = result.items[0].filter(line => line.description !== 'Material · área informada');
    expect(assemblyLines).toEqual([{ description: 'Montagem', measure: 1, unit: 'serviço', total: 250 }]);
  });
});

describe('Opções do PDF', () => {
  it('preserva a exportação antiga quando não há opções', () => {
    expect(quotePdfOptionsSchema.parse({})).toEqual({ commercial: true, individualPrices: false, drawings: true, technical: false });
  });
  it.each(['true', 'false'])('aceita valores %s independentemente dos desenhos', individualPrices => {
    for (const drawings of ['true', 'false']) expect(quotePdfOptionsSchema.parse({ individualPrices, drawings })).toMatchObject({ individualPrices: individualPrices === 'true', drawings: drawings === 'true' });
  });
  it('cada caixinha do Exportar é independente: só desenhos e desenho técnico, sem o orçamento', () => {
    expect(quotePdfOptionsSchema.parse({ commercial: 'false', drawings: 'true', technical: 'true' })).toEqual({ commercial: false, individualPrices: false, drawings: true, technical: true });
  });
  it('rejeita opções inválidas em vez de gerar um documento diferente do solicitado', () => {
    expect(quotePdfOptionsSchema.safeParse({ drawings: 'não' }).success).toBe(false);
  });
});
