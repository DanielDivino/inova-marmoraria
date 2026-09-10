import { describe, expect, it } from 'vitest';
import { draftItemInput, savedItemDraft } from './saved-quote';
import type { DraftItem } from '../components/quote-builder/types';
import { savedItemInput, type SavedQuoteItem } from '@inova/domain';

const draft = (): DraftItem => ({ id: 'draft', projectName: 'Cozinha', environment: 'Cozinha', productTypeId: 'product', materialId: 'material', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, cutouts: [], components: [{ id: 'component', label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '190,5', widthCm: '40', quantity: 2, edges: [] }] });
describe('Dados do formulário enviados ao servidor', () => {
  it.each([['1.234,56', 1234.56], ['1234,56', 1234.56], ['1234.56', 1234.56], ['0,00', 0], ['10', 10]])('converte moeda %s em %s', (text, value) => { const input = draft(); input.components[0].appliedTotal = text; expect(draftItemInput(input).components[0].appliedTotal).toBe(value); });
  it.each(['', ' ', '-1', 'NaN', 'Infinity', '1,2,3', 'R$ inválido'])('não transforma valor inválido %s em cobrança zero', (text) => { const input = draft(); input.components[0].appliedTotal = text; expect(() => draftItemInput(input)).toThrow(); });
  it('converte centímetros fracionados para milímetros inteiros', () => expect(draftItemInput(draft()).components[0]).toMatchObject({ lengthMm: 1905, widthMm: 400, quantity: 2 }));
  it('conserva posição zero de recorte e o vínculo com componente zero', () => { const input = draft(); input.cutouts = [{ id: 'cut', componentIndex: 0, cutoutType: 'SINK', label: '', quantity: 1, positionXCm: '0', positionYCm: '0' }]; expect(draftItemInput(input).cutouts[0]).toMatchObject({ componentIndex: 0, positionX: 0, positionY: 0 }); });
  it('restaurar valor remove override, não aplica zero', () => { const input = draft(); input.components[0].appliedTotal = undefined; expect(draftItemInput(input).components[0].appliedTotal).toBeUndefined(); });
  it('não envia UUID local de projeto novo como ID persistido', () => { const input = draftItemInput(draft()); expect(input.id).toBeUndefined(); expect(input.components[0].id).toBeUndefined(); });
  it('reabre e reenvia dados salvos sem perder ID, quantidades, recorte ou preço manual', () => {
    const saved: SavedQuoteItem = { id: 'item', productTypeId: 'product', materialId: 'material', materialNameSnapshot: 'Material', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: '600', calculationMode: 'DIMENSIONS', quantity: 1, billedQuantity: '1.52', total: '850', components: [{ id: 'component', label: 'Tampo', componentType: 'TOP', orientation: 'VERTICAL', lengthMm: 1900, widthMm: 400, quantity: 2, sortOrder: 0, calculatedTotal: '912', appliedTotal: '850', hasManualPriceOverride: true, edges: [] }], cutouts: [{ id: 'cut', componentId: 'component', cutoutType: 'SINK', label: '', quantity: 1, positionX: 0, positionY: 0, sortOrder: 0, calculatedSubtotal: '70', appliedSubtotal: '0', hasManualPriceOverride: true }], services: [] };
    expect(draftItemInput(savedItemDraft(saved), saved)).toEqual(savedItemInput(saved));
  });
});
