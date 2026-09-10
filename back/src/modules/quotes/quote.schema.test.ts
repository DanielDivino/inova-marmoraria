import { describe, expect, it } from 'vitest';
import { createQuoteSchema, quoteItemSchema, quoteComponentSchema, quoteCutoutSchema, editQuoteSchema } from './quote.schema.js';
const id = 'cm00000000000000000000001';
const component = { label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1900, widthMm: 400 };
describe('Validação centralizada de orçamento', () => {
  it.each([0, -10, 10.5, NaN, Infinity])('recusa dimensão inválida %s', (lengthMm) => expect(quoteComponentSchema.safeParse({ ...component, lengthMm }).success).toBe(false));
  it.each([-1, NaN, Infinity])('recusa preço manual inválido %s', (appliedTotal) => expect(quoteComponentSchema.safeParse({ ...component, appliedTotal }).success).toBe(false));
  it('permite preço manual zero', () => expect(quoteComponentSchema.parse({ ...component, appliedTotal: 0 }).appliedTotal).toBe(0));
  it('exige componente para dimensões', () => expect(quoteItemSchema.safeParse({ materialId: id, productTypeId: id, components: [] }).success).toBe(false));
  it('exige quantidade e justificativa para área manual', () => expect(quoteItemSchema.safeParse({ materialId: id, productTypeId: id, calculationMode: 'MANUAL_M2', billedQuantity: 2 }).success).toBe(false));
  it('permite recorte na origem e impede posição negativa', () => { expect(quoteCutoutSchema.safeParse({ cutoutType: 'SINK', positionX: 0 }).success).toBe(true); expect(quoteCutoutSchema.safeParse({ cutoutType: 'SINK', positionX: -1 }).success).toBe(false); });
  it('exige pelo menos um projeto', () => expect(createQuoteSchema.safeParse({ customerId: id, items: [] }).success).toBe(false));
  it('edição exige versão para prevenir sobrescrita', () => expect(editQuoteSchema.safeParse({ customerId: id, items: [{ materialId: id, productTypeId: id, components: [component] }] }).success).toBe(false));
  it('recusa vínculo com um componente inexistente', () => expect(quoteItemSchema.safeParse({ materialId: id, productTypeId: id, components: [component], cutouts: [{ cutoutType: 'SINK', componentIndex: 3 }] }).success).toBe(false));
});
