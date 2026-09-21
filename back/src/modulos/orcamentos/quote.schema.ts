import { z } from 'zod';
import { EXECUTION_STATUSES, WORK_STATUSES, WORK_STATUS_STORAGE, QUOTE_ENTRY_MODES, DETAILING_STATUSES } from '@inova/domain';
import { trackingSchema } from './quote.tracking.js';

const billingUnitSchema = z.enum(['SQUARE_METER', 'LINEAR_METER', 'UNIT', 'FIXED']);
const componentTypeSchema = z.enum(['TOP', 'COUNTER', 'BASE', 'VISTA', 'SKIRT', 'BACKSPLASH', 'SIDE_LEFT', 'SIDE_RIGHT', 'SILL', 'THRESHOLD', 'STEP', 'OTHER']);
const orientationSchema = z.enum(['HORIZONTAL', 'VERTICAL']);
const edgeSideSchema = z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT', 'CUSTOM']);
const cutoutTypeSchema = z.enum(['SINK', 'SCULPTED_SINK', 'OVAL_SINK', 'COOKTOP', 'FAUCET_HOLE', 'GENERIC_HOLE', 'OTHER']);
const positiveMm = z.number().int().positive();

export const quoteServiceSchema = z.object({ serviceId: z.string().cuid(), billedQuantity: z.number().positive().optional(), appliedSubtotal: z.number().finite().nonnegative().optional() });
export const quoteEdgeSchema = z.object({ id: z.string().optional(), side: edgeSideSchema, customLabel: z.string().min(1).max(80).optional(), lengthMm: positiveMm.optional(), heightMm: positiveMm.optional(), quantity: z.number().int().positive().default(1), serviceId: z.string().cuid(), appliedSubtotal: z.number().finite().nonnegative().optional() }).superRefine((value, context) => { if (value.side === 'CUSTOM' && !value.lengthMm) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Borda personalizada exige comprimento.', path: ['lengthMm'] }); });
export const quoteComponentSchema = z.object({ id: z.string().optional(), materialId: z.string().cuid().optional(), label: z.string().trim().max(120).default(''), componentType: componentTypeSchema, orientation: orientationSchema, shape: z.literal('RECTANGLE').default('RECTANGLE'), lengthMm: positiveMm, widthMm: positiveMm, quantity: z.number().int().positive().default(1), appliedTotal: z.number().finite().nonnegative().optional(), sortOrder: z.number().int().nonnegative().default(0), edges: z.array(quoteEdgeSchema).default([]) });
export const quoteCutoutSchema = z.object({ id: z.string().optional(), componentIndex: z.number().int().nonnegative().optional(), cutoutType: cutoutTypeSchema, sizePending: z.boolean().default(false), label: z.string().max(120).optional(), lengthMm: positiveMm.optional(), widthMm: positiveMm.optional(), diameterMm: positiveMm.optional(), positionX: z.number().int().nonnegative().optional(), positionY: z.number().int().nonnegative().optional(), quantity: z.number().int().positive().default(1), serviceId: z.string().cuid().optional(), appliedSubtotal: z.number().finite().nonnegative().optional(), sortOrder: z.number().int().nonnegative().default(0) });
const quoteItemBaseSchema = z.object({ id: z.string().optional(), projectName: z.string().max(120).optional().nullable(), environment: z.string().max(80).optional().nullable(), productTypeId: z.string().cuid(), materialId: z.string().cuid(), calculationMode: z.enum(['DIMENSIONS', 'MANUAL_M2']).default('DIMENSIONS'), manualJustification: z.string().min(3).max(500).optional(), quantity: z.number().int().positive().default(1), billedQuantity: z.number().positive().optional(), components: z.array(quoteComponentSchema).default([]), cutouts: z.array(quoteCutoutSchema).default([]), services: z.array(quoteServiceSchema).default([]), drawingData: z.record(z.string(), z.unknown()).optional() });
export const quoteItemSchema = quoteItemBaseSchema.superRefine((value, context) => {
  if (value.drawingData && !z.object({ entryMode: z.enum(QUOTE_ENTRY_MODES).optional(), detailingStatus: z.enum(DETAILING_STATUSES).optional() }).safeParse(value.drawingData).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Modo do orçamento ou situação do desenho inválido.', path: ['drawingData'] });
  if (value.drawingData?.componentDetails !== undefined) {
  const parsed = z.array(z.object({ parentComponentIndex: z.number().int().nonnegative().optional(), parentSide: z.enum(['BACK', 'FRONT', 'LEFT', 'RIGHT']).optional(), sillDetailMm: positiveMm.optional(), sillDetailHeightMm: positiveMm.optional() })).safeParse(value.drawingData.componentDetails);
  if (!parsed.success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detalhes dos componentes inválidos.', path: ['drawingData', 'componentDetails'] });
  else {
    if (parsed.data.length > value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detalhe sem componente correspondente.', path: ['drawingData', 'componentDetails'] });
    parsed.data.forEach((detail, index) => {
      const parent = detail.parentComponentIndex;
      if (detail.parentSide !== undefined && (parent === undefined || value.components[index]?.componentType !== 'BACKSPLASH')) context.addIssue({ code: z.ZodIssueCode.custom, message: 'O lado deve pertencer a uma rodabanca vinculada a um componente.', path: ['drawingData', 'componentDetails', index, 'parentSide'] });
      if (parent !== undefined && (parent >= index || parsed.data[parent]?.parentComponentIndex !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A peça adicional deve pertencer a um componente principal anterior.', path: ['drawingData', 'componentDetails', index, 'parentComponentIndex'] });
      for (const field of ['sillDetailMm', 'sillDetailHeightMm'] as const) {
        if (detail[field] !== undefined && value.components[index]?.componentType !== 'SILL') context.addIssue({ code: z.ZodIssueCode.custom, message: 'As medidas do detalhe são exclusivas do peitoril.', path: ['drawingData', 'componentDetails', index, field] });
      }
    });
  }
} value.cutouts.forEach((cutout, index) => { if (cutout.componentIndex !== undefined && cutout.componentIndex >= value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'O componente do recorte não existe neste projeto.', path: ['cutouts', index, 'componentIndex'] }); }); if (value.calculationMode === 'DIMENSIONS' && !value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe ao menos um componente com medidas.', path: ['components'] }); if (value.calculationMode === 'MANUAL_M2' && (!value.billedQuantity || !value.manualJustification)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'm² manual exige quantidade e justificativa.', path: ['billedQuantity'] }); });
export const updateQuoteItemSchema = quoteItemBaseSchema.partial();
export const createQuoteSchema = z.object({ customerId: z.string().cuid(), parentQuoteId: z.string().cuid().optional().nullable(), validUntil: z.coerce.date().optional().nullable(), discountAmount: z.number().nonnegative().default(0), notes: z.string().max(3000).optional().nullable(), items: z.array(quoteItemSchema).min(1), ...trackingSchema.shape });
export const updateQuoteSchema = createQuoteSchema.omit({ customerId: true, items: true, parentQuoteId: true }).partial();
const legacyStatusSchema = z.object({ status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']), executionStatus: z.enum(EXECUTION_STATUSES).optional(), reason: z.string().min(3).max(500).optional(), estimatedBusinessDays: z.number().int().min(1).max(90).optional(), approvedAt: z.coerce.date().optional(), completedAt: z.coerce.date().optional() });
export const updateStatusSchema = z.union([
  z.object({ workStatus: z.enum(WORK_STATUSES), reason: z.string().min(3).max(500).optional() }).strict().transform(({ workStatus, reason }) => ({ ...WORK_STATUS_STORAGE[workStatus], workStatus, reason })),
  legacyStatusSchema,
]);
export const calculateQuoteSchema = z.object({ lines: z.array(z.object({ billingUnit: billingUnitSchema, unitPrice: z.number().nonnegative(), lengthMm: z.number().positive().optional(), widthMm: z.number().positive().optional(), quantity: z.number().positive().optional(), billedQuantity: z.number().positive().optional() })).min(1), discount: z.number().nonnegative().default(0) });

export const editQuoteSchema = createQuoteSchema.omit({ parentQuoteId: true }).extend({ expectedUpdatedAt: z.string().datetime() });
