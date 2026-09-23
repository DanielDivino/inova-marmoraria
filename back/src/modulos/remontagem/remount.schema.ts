import { z } from 'zod';
import { DEFAULT_ASSEMBLY_PRICE, DEFAULT_DISASSEMBLY_PRICE } from '@inova/domain';
import { quoteItemSchema } from '../orcamentos/quote.schema.js';

const money = z.number().finite().nonnegative().max(9999999999.99).multipleOf(0.01);
export const remountSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  items: z.array(quoteItemSchema).max(50).default([]),
  assembly: money.default(DEFAULT_ASSEMBLY_PRICE),
  disassembly: money.default(DEFAULT_DISASSEMBLY_PRICE),
  cardOverride: money.nullable().default(null),
  pixPercent: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(25)]).default(5),
  notes: z.string().trim().max(3000).default(''),
  itemNotes: z.record(z.string().max(120), z.string().trim().max(500)).default({}),
}).strict().superRefine((input, ctx) => {
  const ids = input.items.map(item => item.id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Identifique cada grupo de materiais uma única vez.' });
  const components = input.items.flatMap(item => item.components);
  const componentIds = components.map(component => component.id);
  if (componentIds.some(id => !id) || new Set(componentIds).size !== componentIds.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Identifique cada peça uma única vez.' });
  if (components.length > 200) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Limite de 200 peças por proposta.' });
  for (const id of Object.keys(input.itemNotes)) if (!componentIds.includes(id)) ctx.addIssue({ code: 'custom', path: ['itemNotes', id], message: 'Observação sem peça correspondente.' });
  input.items.forEach((item, index) => {
    if (item.calculationMode !== 'DIMENSIONS') ctx.addIssue({ code: 'custom', path: ['items', index], message: 'Informe as medidas das peças da remontagem.' });
  });
});
export type RemountInput = z.infer<typeof remountSchema>;
export const remountPdfSchema = z.object({ individualPrices: z.enum(['true', 'false']).default('false').transform(value => value === 'true') });
