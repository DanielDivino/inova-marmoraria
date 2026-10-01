import { z } from 'zod';

const marcado = (padrao: 'true' | 'false') => z.enum(['true', 'false']).default(padrao).transform(value => value === 'true');

/** Caixinhas do Exportar: cada parte entra ou não no mesmo PDF (orçamento → OS → desenho técnico). */
export const quotePdfOptionsSchema = z.object({
  commercial: marcado('true'),
  individualPrices: marcado('false'),
  drawings: marcado('true'),
  technical: marcado('false'),
});
export type QuotePdfOptions = z.output<typeof quotePdfOptionsSchema>;
