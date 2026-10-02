import { describe, expect, it } from 'vitest';
import { calcularAreaRetangularM2, calcularSubtotalMaterial, medidaM2Fechado, type SavedQuoteItem } from '@inova/domain';
import { emptyTechnicalDocument, estimarDesenho, featureSchema, makePiece, type CatalogoEstimativa, type Feature } from '@inova/domain/technical';
import { projetoDoDesenho, vinculoDesenho } from './desenho-orcamento';
import { itemSalvoParaRascunho, rascunhoParaEntradaItem } from './saved-quote';

const catalogo: CatalogoEstimativa = {
  materials: [{ id: 'cm0000000000000000granito', name: 'Branco Dallas', billingUnit: 'SQUARE_METER', currentPrice: 700 }],
  services: [
    { id: 'cm00000000000000000000cuba', name: 'Recorte de cuba', billingUnit: 'UNIT', currentPrice: 180 },
    { id: 'cm00000000000000000000saia', name: 'Saia', billingUnit: 'LINEAR_METER', currentPrice: 0 },
    { id: 'cm00000000000000000000e45f', name: 'Acabamento 45° — Granito/Mármore', billingUnit: 'LINEAR_METER', currentPrice: 70 },
  ],
};
const recurso = (dados: Partial<Feature> & Pick<Feature, 'id' | 'type' | 'pieceId'>) => featureSchema.parse({ x: 0, y: 0, ...dados });
function cozinhaEmU() {
  const doc = emptyTechnicalDocument();
  doc.pieces.push({ ...makePiece('u', 'U'), name: 'Bancada', material: { id: 'cm0000000000000000granito', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } });
  doc.features.push(
    recurso({ id: 'cuba', type: 'SINK', pieceId: 'u', x: 1300, y: 1200, widthMm: 500, lengthMm: 400 }),
    recurso({ id: 'saia', type: 'SKIRT', pieceId: 'u', edgeId: 'u-v7', extentMm: 1500, heightMm: 40 }),
    recurso({ id: 'borda', type: 'EDGE_FINISH', pieceId: 'u', edgeId: 'u-v2', extentMm: 1400, profile: 'MITER45' }),
    recurso({ id: 'roda', type: 'BACKSPLASH', pieceId: 'u', edgeId: 'u-v6', extentMm: 2600, heightMm: 100 }),
  );
  return doc;
}
const dados = (m2Fechado: boolean) => ({ id: 'projeto-1', projectName: 'Cozinha', productTypeId: 'cm0000000000000000000tipo', m2Fechado,
  vinculo: { designId: 'cm000000000000000000design', nome: 'Cozinha', versao: 3, total: 0, aceitoEm: '2026-09-29T12:00:00.000Z' } });

describe('desenho técnico usado no orçamento', () => {
  it('vira o projeto do Orçamento Rápido com as partes, acabamentos, saia e rodabanca no Tipo/descrição e cuba posicionada', () => {
    const estimativa = estimarDesenho(cozinhaEmU(), catalogo);
    const projeto = projetoDoDesenho(estimativa.item, dados(false));
    expect(vinculoDesenho(projeto)).toMatchObject({ designId: 'cm000000000000000000design', versao: 3 });
    expect(projeto.components.map(({ label, componentType, lengthCm, widthCm }) => ({ label, componentType, lengthCm, widthCm }))).toEqual([
      { label: 'Bancada · parte 1', componentType: 'TOP', lengthCm: '260', widthCm: '60' },
      { label: 'Bancada · parte 2', componentType: 'TOP', lengthCm: '60', widthCm: '90' },
      { label: 'Bancada · parte 3', componentType: 'TOP', lengthCm: '60', widthCm: '90' },
      { label: 'Saia · Bancada', componentType: 'SKIRT', lengthCm: '150', widthCm: '4' },
      { label: 'Rodabanca · Bancada', componentType: 'BACKSPLASH', lengthCm: '260', widthCm: '10' },
    ]);
    expect(projeto.components[4]).toMatchObject({ parentComponentId: projeto.components[0].id, parentSide: 'BACK' });

    const entrada = rascunhoParaEntradaItem(projeto);
    // Trecho parcial do acabamento com o comprimento dele; a saia não é mais acabamento.
    expect(entrada.components[0].edges).toEqual([expect.objectContaining({ side: 'FRONT', lengthMm: 1400, heightMm: undefined, serviceId: catalogo.services[2].id })]);
    expect(entrada.cutouts).toEqual([expect.objectContaining({ componentIndex: 0, cutoutType: 'SINK', lengthMm: 500, widthMm: 400, positionX: 1300, positionY: 300, serviceId: catalogo.services[0].id })]);
    expect(entrada.drawingData).toMatchObject({ desenhoTecnico: { designId: 'cm000000000000000000design' }, componentDetails: [{}, {}, {}, {}, { parentComponentIndex: 0, parentSide: 'BACK' }] });
    expect(entrada.materialId).toBe('cm0000000000000000granito');
  });

  it('projeto salvo com M² fechado volta a calcular o valor ao reabrir; valor digitado à mão continua', () => {
    const salvo = {
      id: 'item-1', projectName: 'Cozinha', productTypeId: 'tipo', materialId: 'granito', materialNameSnapshot: 'Branco Dallas', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: 700,
      calculationMode: 'DIMENSIONS', quantity: 1, billedQuantity: 2.2, total: 0, cutouts: [], services: [], drawingData: { entryMode: 'QUICK', m2Fechado: true },
      components: [
        { id: 'a', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2437, widthMm: 637, quantity: 1, sortOrder: 0, unitPriceSnapshot: 700, calculatedTotal: 0, hasManualPriceOverride: true,
          appliedTotal: calcularSubtotalMaterial(calcularAreaRetangularM2(medidaM2Fechado(2437), medidaM2Fechado(637)), 700) + 28,
          edges: [{ id: 'e', side: 'FRONT', lengthMm: 2437, heightMm: 40, serviceId: 'saia', serviceNameSnapshot: 'Saia', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: 700, billedQuantity: .04, hasManualPriceOverride: false, calculatedSubtotal: 28, appliedSubtotal: 28 }] },
        { id: 'b', label: 'Soleira', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 800, widthMm: 150, quantity: 1, sortOrder: 1, unitPriceSnapshot: 700, calculatedTotal: 84, appliedTotal: 50, hasManualPriceOverride: true, edges: [] },
      ],
    } as unknown as SavedQuoteItem;
    const rascunho = itemSalvoParaRascunho(salvo);
    expect(rascunho.arredondarM2).toBe(true);
    expect(rascunho.components[0].appliedTotal).toBeUndefined();
    expect(rascunho.components[1].appliedTotal).toBe('50,00');
  });
});
