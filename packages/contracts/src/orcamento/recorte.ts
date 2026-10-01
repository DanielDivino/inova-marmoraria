import { z } from 'zod';
import { arredondarMoeda } from '@inova/domain';

// Contrato público do recorte de um item de orçamento: o mesmo schema valida a
// entrada na API e confere, nos testes da interface, o que o editor envia.
// Movido sem alterações de apps/api/src/modulos/orcamentos/quote.schema.ts.
export const cutoutTypeSchema = z.enum(['SINK', 'SCULPTED_SINK', 'OVAL_SINK', 'COOKTOP', 'FAUCET_HOLE', 'GENERIC_HOLE', 'OTHER']);
export const positiveMm = z.number().int().positive();
export const money = z.number().finite().nonnegative().transform(arredondarMoeda);

export const quoteCutoutSchema = z.object({ id: z.string().optional(), componentIndex: z.number().int().nonnegative().optional(), cutoutType: cutoutTypeSchema, sizePending: z.boolean().default(false), label: z.string().max(120).optional(), lengthMm: positiveMm.optional(), widthMm: positiveMm.optional(), diameterMm: positiveMm.optional(), positionX: z.number().int().nonnegative().optional(), positionY: z.number().int().nonnegative().optional(), quantity: z.number().int().positive().default(1), serviceId: z.string().cuid().optional(), appliedSubtotal: money.optional(), sortOrder: z.number().int().nonnegative().default(0) });
