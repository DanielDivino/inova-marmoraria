import { z } from 'zod';

const marcado = (padrao: 'true' | 'false') => z.enum(['true', 'false']).default(padrao).transform(value => value === 'true');

/**
 * Caixinhas do Exportar: o orçamento (com ou sem valores individuais) e a ordem de serviço
 * (`drawings`: a planta do desenho técnico de cada projeto ou, sem ele, as folhas com as peças).
 */
export const quotePdfOptionsSchema = z.object({
  commercial: marcado('true'),
  individualPrices: marcado('false'),
  drawings: marcado('true'),
});
export type QuotePdfOptions = z.output<typeof quotePdfOptionsSchema>;
