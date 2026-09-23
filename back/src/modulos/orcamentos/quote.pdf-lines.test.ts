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
    const vistas = result.items[0].filter((line) => line.description.toLocaleLowerCase('pt-BR') === 'vista');
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toMatchObject({ measure: .11, unit: 'm²', total: 77 });
  });
  it('agrupa rodabancas do mesmo projeto em uma linha e soma área, quantidade e valor', () => {
    const result = montarLinhasPdf([{ components: [
      { componentType: 'BACKSPLASH', label: 'Rodabanca 1', lengthMm: 1200, widthMm: 80, quantity: 1, billableArea: .096, subtotal: 57.60, edges: [] },
      { componentType: 'BACKSPLASH', label: 'Rodabanca 2', lengthMm: 700, widthMm: 80, quantity: 2, billableArea: .112, subtotal: 67.20, edges: [] },
    ] }]);
    const rodabancas = result.items[0].filter((line) => line.description === 'Rodabanca');
    expect(rodabancas).toHaveLength(1);
    expect(rodabancas[0]).toMatchObject({ measure: .208, quantity: 3, total: 124.80 });
    expect(rodabancas[0].lengthMm).toBeUndefined();
  });
  it('consolida peças repetidas pelo tipo e descrição no PDF', () => {
    const result = montarLinhasPdf([{ components: [
      { componentType: 'COUNTER', label: 'Bancada', lengthMm: 1200, widthMm: 600, quantity: 1, billableArea: .72, subtotal: 432, edges: [] },
      { componentType: 'COUNTER', label: 'Bancada', lengthMm: 900, widthMm: 600, quantity: 2, billableArea: 1.08, subtotal: 648, edges: [] },
      { componentType: 'VISTA', label: 'Vista', lengthMm: 900, widthMm: 50, quantity: 1, billableArea: .045, subtotal: 27, edges: [] },
      { componentType: 'VISTA', label: 'Vista', lengthMm: 700, widthMm: 50, quantity: 1, billableArea: .035, subtotal: 21, edges: [] },
    ] }]);

    expect(result.items[0]).toEqual([
      expect.objectContaining({ description: 'Bancada', measure: 1.8, quantity: 3, total: 1080 }),
      expect.objectContaining({ description: 'Vista', measure: .08, quantity: 2, total: 48 }),
    ]);
    expect(result.items[0][0].lengthMm).toBeUndefined();
    expect(result.items[0][1].lengthMm).toBeUndefined();
  });
  it('preserva valores zero, área manual, recortes e precisão decimal', () => {
    const result = montarLinhasPdf([{ components: [], billedQuantity: 1.5, materialSubtotal: 500, services: [edge(.075, .1), edge(.025, .2)], cutouts: [{ label: 'Furo', quantity: 1, calculatedSubtotal: 30, appliedSubtotal: 0 }] }]);
    expect(result.linear[0]).toMatchObject({ measure: .1, total: .3 });
    expect(result.items[0]).toMatchObject([{ measure: 1.5, total: 500 }, { description: 'Furo', total: 0 }]);
  });
});

describe('Opções do PDF', () => {
  it('preserva a exportação antiga quando não há opções', () => {
    expect(quotePdfOptionsSchema.parse({})).toEqual({ individualPrices: false, drawings: true });
  });
  it.each(['true', 'false'])('aceita valores %s independentemente dos desenhos', individualPrices => {
    for (const drawings of ['true', 'false']) expect(quotePdfOptionsSchema.parse({ individualPrices, drawings })).toEqual({ individualPrices: individualPrices === 'true', drawings: drawings === 'true' });
  });
  it('rejeita opções inválidas em vez de gerar um documento diferente do solicitado', () => {
    expect(quotePdfOptionsSchema.safeParse({ drawings: 'não' }).success).toBe(false);
  });
});
