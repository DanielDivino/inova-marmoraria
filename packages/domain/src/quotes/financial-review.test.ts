import { expect, it } from 'vitest';
import { appliedComponentValue, individualDiscounts } from './financial-review.js';
it('uses calculated edges by default', () => expect(appliedComponentValue(720, [{ calculatedSubtotal: 60 }])).toBe(780));
it('uses manual edge adjustment without requiring component override', () => expect(appliedComponentValue(720, [{ calculatedSubtotal: 60, appliedSubtotal: 20 }])).toBe(740));
it('component manual price supersedes its constituent prices, including zero', () => { expect(appliedComponentValue(720, [{ calculatedSubtotal: 60, appliedSubtotal: 20 }], 650)).toBe(650); expect(appliedComponentValue(720, [], 0)).toBe(0); });
it('restoring the component keeps negotiated edge prices', () => expect(appliedComponentValue(720, [{ calculatedSubtotal: 60, appliedSubtotal: 0 }], undefined)).toBe(720));
it('does not count the edge discount twice and includes cutouts and direct services', () => expect(individualDiscounts([{ components: [{ calculatedTotal: 780, appliedTotal: 740 }], services: [{ calculatedSubtotal: 300, appliedSubtotal: 250 }], cutouts: [{ calculatedSubtotal: 70, appliedSubtotal: 50 }] }])).toBe(110));
it('preserves cents and does not report surcharges as discounts', () => expect(individualDiscounts([{ components: [{ calculatedTotal: '10.30', appliedTotal: '10.20' }, { calculatedTotal: 10, appliedTotal: 20 }], services: [] }])).toBe(0.1));
