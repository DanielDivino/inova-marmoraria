import { describe, expect, it } from 'vitest';
import { savedItemInput, type SavedQuoteItem } from './snapshot.js';
import { canEditQuote } from './presentation.js';

const item: SavedQuoteItem = {
  id: 'item-1', materialId: 'material', productTypeId: 'product', materialNameSnapshot: 'Pedra', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: '600', calculationMode: 'DIMENSIONS', quantity: 1, billedQuantity: '0.76', total: '500',
  components: [{ id: 'component-1', label: 'Tampo', componentType: 'TOP', orientation: 'VERTICAL', lengthMm: 1900, widthMm: 400, quantity: 2, sortOrder: 0, calculatedTotal: '912', appliedTotal: '850', hasManualPriceOverride: true,
    edges: [{ id: 'edge', side: 'LEFT', lengthMm: 950, heightMm: 100, serviceId: 'skirt', serviceNameSnapshot: 'Saia', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: '600', billedQuantity: '0.38', calculatedSubtotal: '228', appliedSubtotal: '200', hasManualPriceOverride: true }] }],
  cutouts: [{ id: 'cutout', componentId: 'component-1', cutoutType: 'SINK', positionX: 0, positionY: 0, quantity: 1, sortOrder: 0, calculatedSubtotal: '50', appliedSubtotal: '0', hasManualPriceOverride: true }],
  services: [{ serviceId: 'service', serviceNameSnapshot: 'Montagem', billingUnitSnapshot: 'FIXED', unitPriceSnapshot: '100', billedQuantity: '1', calculatedSubtotal: '100', appliedSubtotal: '100', hasManualPriceOverride: false }],
};
describe('Saved quote input', () => {
  it('preserves manual and zero values without applying new overrides', () => {
    const input = savedItemInput(item);
    expect(input.components[0].appliedTotal).toBe(850);
    expect(input.components[0].edges[0].appliedSubtotal).toBe(200);
    expect(input.cutouts[0].appliedSubtotal).toBe(0);
    expect(input.services[0].appliedSubtotal).toBeUndefined();
  });
  it('keeps quantities, orientation, partial skirt geometry and cutout links', () => {
    const input = savedItemInput(item);
    expect(input.components[0].quantity).toBe(2);
    expect(input.components[0].orientation).toBe('VERTICAL');
    expect(input.components[0].edges[0]).toMatchObject({ lengthMm: 950, heightMm: 100, quantity: 2 });
    expect(input.cutouts[0]).toMatchObject({ componentIndex: 0, positionX: 0, positionY: 0 });
    expect(input.components[0].id).toBe('component-1');
  });
  it('does not attach an orphan cutout to another component', () => {
    expect(savedItemInput({ ...item, cutouts: [{ ...item.cutouts[0], componentId: 'deleted' }] }).cutouts[0].componentIndex).toBeUndefined();
  });
  it('preserves manual-area records without inventing drawings', () => {
    const input = savedItemInput({ ...item, calculationMode: 'MANUAL_M2', components: [], billedQuantity: '2.4', manualJustification: 'Área acordada' });
    expect(input.billedQuantity).toBe(2.4); expect(input.components).toEqual([]);
    expect(input.manualJustification).toBe('Área acordada');
  });
  it('only permits editing open records, including rework', () => {
    expect(canEditQuote({ status: 'SENT' })).toBe(true);
    expect(canEditQuote({ status: 'APPROVED', executionStatus: 'REWORK' })).toBe(true);
    expect(canEditQuote({ status: 'APPROVED', executionStatus: 'COMPLETED' })).toBe(false);
    expect(canEditQuote({ status: 'REJECTED' })).toBe(false);
  });
});
