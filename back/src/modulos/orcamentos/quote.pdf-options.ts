import { z } from 'zod';

export const quotePdfOptionsSchema = z.object({
  individualPrices: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  drawings: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
});
export type QuotePdfOptions = z.output<typeof quotePdfOptionsSchema>;
