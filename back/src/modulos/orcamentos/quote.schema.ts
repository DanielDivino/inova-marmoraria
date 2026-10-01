import { z } from 'zod';
import { arredondarMoeda, tipoPresoAoLado, EXECUTION_STATUSES, WORK_STATUSES, WORK_STATUS_STORAGE, QUOTE_ENTRY_MODES, DETAILING_STATUSES } from '@inova/domain';
import { trackingSchema } from './quote.tracking.js';

const billingUnitSchema = z.enum(['SQUARE_METER', 'LINEAR_METER', 'UNIT', 'FIXED']);
const componentTypeSchema = z.enum(['TOP', 'COUNTER', 'BASE', 'VISTA', 'SKIRT', 'BACKSPLASH', 'SIDE_LEFT', 'SIDE_RIGHT', 'SILL', 'THRESHOLD', 'STEP', 'OTHER']);
const orientationSchema = z.enum(['HORIZONTAL', 'VERTICAL']);
const edgeSideSchema = z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT', 'CUSTOM']);
const cutoutTypeSchema = z.enum(['SINK', 'SCULPTED_SINK', 'OVAL_SINK', 'COOKTOP', 'FAUCET_HOLE', 'GENERIC_HOLE', 'OTHER']);
const positiveMm = z.number().int().positive();
const money = z.number().finite().nonnegative().transform(arredondarMoeda);

export const quoteServiceSchema = z.object({ serviceId: z.string().cuid(), billedQuantity: z.number().positive().optional(), appliedSubtotal: money.optional() });
export const quoteEdgeSchema = z.object({ id: z.string().optional(), side: edgeSideSchema, customLabel: z.string().min(1).max(80).optional(), lengthMm: positiveMm.optional(), heightMm: positiveMm.optional(), quantity: z.number().int().positive().default(1), serviceId: z.string().cuid(), appliedSubtotal: money.optional() }).superRefine((value, context) => { if (value.side === 'CUSTOM' && !value.lengthMm) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Borda personalizada exige comprimento.', path: ['lengthMm'] }); });
export const quoteComponentSchema = z.object({ id: z.string().optional(), materialId: z.string().cuid().optional(), label: z.string().trim().max(120).default(''), componentType: componentTypeSchema, orientation: orientationSchema, shape: z.literal('RECTANGLE').default('RECTANGLE'), lengthMm: positiveMm, widthMm: positiveMm, quantity: z.number().int().positive().default(1), appliedTotal: money.optional(), sortOrder: z.number().int().nonnegative().default(0), edges: z.array(quoteEdgeSchema).default([]) });
export const quoteCutoutSchema = z.object({ id: z.string().optional(), componentIndex: z.number().int().nonnegative().optional(), cutoutType: cutoutTypeSchema, sizePending: z.boolean().default(false), label: z.string().max(120).optional(), lengthMm: positiveMm.optional(), widthMm: positiveMm.optional(), diameterMm: positiveMm.optional(), positionX: z.number().int().nonnegative().optional(), positionY: z.number().int().nonnegative().optional(), quantity: z.number().int().positive().default(1), serviceId: z.string().cuid().optional(), appliedSubtotal: money.optional(), sortOrder: z.number().int().nonnegative().default(0) });
// Plano de produção: puramente descritivo (como fabricar), nunca carrega preço.
// Vive só dentro de drawingData, fora da comparação financeira em quote.service.ts.
const productionEdgeSchema = z.object({ side: edgeSideSchema, serviceId: z.string(), serviceName: z.string(), lengthMm: positiveMm.optional(), heightMm: positiveMm.optional(), quantity: z.number().int().positive() });
const productionPieceSchema = z.object({ id: z.string(), sourceComponentId: z.string(), label: z.string(), componentType: componentTypeSchema, orientation: orientationSchema, lengthMm: positiveMm, widthMm: positiveMm, quantity: z.number().int().positive(), edges: z.array(productionEdgeSchema).default([]), parentPieceId: z.string().optional(), parentSide: z.enum(['BACK', 'FRONT', 'LEFT', 'RIGHT']).optional(), sillDetailMm: positiveMm.optional(), sillDetailHeightMm: positiveMm.optional(), sillTopWidthMm: positiveMm.optional(), sillBottomWidthMm: positiveMm.optional(), sillFinalWidthMm: positiveMm.optional(), sillOverlapMm: positiveMm.optional() });
const productionCutoutSchema = z.object({ id: z.string(), pieceId: z.string(), sourceCutoutId: z.string().optional(), cutoutType: cutoutTypeSchema, label: z.string(), sizePending: z.boolean().optional(), lengthMm: positiveMm.optional(), widthMm: positiveMm.optional(), diameterMm: positiveMm.optional(), positionXMm: z.number().int().nonnegative().optional(), positionYMm: z.number().int().nonnegative().optional(), quantity: z.number().int().positive() });
const productionSourceSchema = z.object({ componentId: z.string(), splitAxis: z.enum(['LENGTH', 'WIDTH']), snapshotLengthMm: positiveMm, snapshotWidthMm: positiveMm, snapshotQuantity: z.number().int().positive(), snapshotComponentType: componentTypeSchema, snapshotMaterialId: z.string().optional(), needsReview: z.boolean().optional() });
export const productionPlanSchema = z.object({ version: z.literal(1), sources: z.array(productionSourceSchema), pieces: z.array(productionPieceSchema), cutouts: z.array(productionCutoutSchema) });
const quoteItemBaseSchema = z.object({ id: z.string().optional(), projectName: z.string().max(120).optional().nullable(), environment: z.string().max(80).optional().nullable(), productTypeId: z.string().cuid(), materialId: z.string().cuid(), calculationMode: z.enum(['DIMENSIONS', 'MANUAL_M2']).default('DIMENSIONS'), manualJustification: z.string().min(3).max(500).optional(), quantity: z.number().int().positive().default(1), billedQuantity: z.number().positive().optional(), components: z.array(quoteComponentSchema).default([]), cutouts: z.array(quoteCutoutSchema).default([]), services: z.array(quoteServiceSchema).default([]), drawingData: z.record(z.string(), z.unknown()).optional() });
export const quoteItemSchema = quoteItemBaseSchema.superRefine((value, context) => {
  if (value.drawingData && !z.object({ entryMode: z.enum(QUOTE_ENTRY_MODES).optional(), detailingStatus: z.enum(DETAILING_STATUSES).optional() }).safeParse(value.drawingData).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Modo do orçamento ou situação do desenho inválido.', path: ['drawingData'] });
  // Projeto que veio do desenho técnico ("Usar no orçamento") e o M² fechado com que foi salvo: só referência, nunca preço.
  if (value.drawingData && !z.object({ desenhoTecnico: z.object({ designId: z.string().cuid(), nome: z.string().max(160), versao: z.number().int().positive(), total: z.number().nonnegative(), aceitoEm: z.string().max(40) }).optional(), m2Fechado: z.boolean().optional() }).safeParse(value.drawingData).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Vínculo com o desenho técnico inválido.', path: ['drawingData'] });
  if (value.drawingData?.componentDetails !== undefined) {
  const parsed = z.array(z.object({ parentComponentIndex: z.number().int().nonnegative().optional(), parentSide: z.enum(['BACK', 'FRONT', 'LEFT', 'RIGHT']).optional(), sillDetailMm: positiveMm.optional(), sillDetailHeightMm: positiveMm.optional(), sillTopWidthMm: positiveMm.optional(), sillBottomWidthMm: positiveMm.optional(), sillFinalWidthMm: positiveMm.optional(), sillOverlapMm: positiveMm.optional(), cornerRadiusMm: positiveMm.optional() })).safeParse(value.drawingData.componentDetails);
  if (!parsed.success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detalhes dos componentes inválidos.', path: ['drawingData', 'componentDetails'] });
  else {
    if (parsed.data.length > value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detalhe sem componente correspondente.', path: ['drawingData', 'componentDetails'] });
    parsed.data.forEach((detail, index) => {
      const parent = detail.parentComponentIndex;
      if (detail.parentSide !== undefined && (parent === undefined || !tipoPresoAoLado(value.components[index]?.componentType ?? ''))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'O lado deve pertencer a uma rodabanca, saia ou vista vinculada a um componente.', path: ['drawingData', 'componentDetails', index, 'parentSide'] });
      if (parent !== undefined && (parent >= index || parsed.data[parent]?.parentComponentIndex !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A peça adicional deve pertencer a um componente principal anterior.', path: ['drawingData', 'componentDetails', index, 'parentComponentIndex'] });
      for (const field of ['sillDetailMm', 'sillDetailHeightMm', 'sillTopWidthMm', 'sillBottomWidthMm', 'sillFinalWidthMm', 'sillOverlapMm'] as const) {
        if (detail[field] !== undefined && value.components[index]?.componentType !== 'SILL') context.addIssue({ code: z.ZodIssueCode.custom, message: 'As medidas do detalhe são exclusivas do peitoril.', path: ['drawingData', 'componentDetails', index, field] });
      }
      // Cantos arredondados: o raio cabe na peça (no máximo metade do lado menor).
      const peca = value.components[index];
      if (detail.cornerRadiusMm !== undefined && peca && detail.cornerRadiusMm * 2 > Math.min(peca.lengthMm, peca.widthMm)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'O raio dos cantos arredondados passa da metade do lado menor da peça.', path: ['drawingData', 'componentDetails', index, 'cornerRadiusMm'] });
    });
  }
}
if (value.drawingData?.productionPlan !== undefined) {
  const parsed = productionPlanSchema.safeParse(value.drawingData.productionPlan);
  if (!parsed.success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Plano de produção inválido.', path: ['drawingData', 'productionPlan'] });
  else {
    const componentIds = new Set(value.components.map((component) => component.id).filter(Boolean));
    const pieceIds = new Set(parsed.data.pieces.map((piece) => piece.id));
    parsed.data.sources.forEach((source, index) => { if (!componentIds.has(source.componentId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Origem do plano de produção não corresponde a nenhum componente comercial.', path: ['drawingData', 'productionPlan', 'sources', index, 'componentId'] }); });
    parsed.data.pieces.forEach((piece, index) => {
      if (!componentIds.has(piece.sourceComponentId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Peça de produção não corresponde a nenhum componente comercial.', path: ['drawingData', 'productionPlan', 'pieces', index, 'sourceComponentId'] });
      if (piece.parentPieceId !== undefined && !pieceIds.has(piece.parentPieceId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Peça pai do plano de produção não existe.', path: ['drawingData', 'productionPlan', 'pieces', index, 'parentPieceId'] });
    });
    parsed.data.cutouts.forEach((cutout, index) => { if (!pieceIds.has(cutout.pieceId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Recorte de produção não corresponde a nenhuma peça.', path: ['drawingData', 'productionPlan', 'cutouts', index, 'pieceId'] }); });
  }
}
value.cutouts.forEach((cutout, index) => { if (cutout.componentIndex !== undefined && cutout.componentIndex >= value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'O componente do recorte não existe neste projeto.', path: ['cutouts', index, 'componentIndex'] }); }); if (value.calculationMode === 'DIMENSIONS' && !value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe ao menos um componente com medidas.', path: ['components'] }); if (value.calculationMode === 'MANUAL_M2' && (!value.billedQuantity || !value.manualJustification)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'm² manual exige quantidade e justificativa.', path: ['billedQuantity'] }); });
export const updateQuoteItemSchema = quoteItemBaseSchema.partial();
export const createQuoteSchema = z.object({ customerId: z.string().cuid(), parentQuoteId: z.string().cuid().optional().nullable(), validUntil: z.coerce.date().optional().nullable(), discountAmount: money.default(0), notes: z.string().max(3000).optional().nullable(), items: z.array(quoteItemSchema).min(1), ...trackingSchema.shape });
export const updateQuoteSchema = createQuoteSchema.omit({ customerId: true, items: true, parentQuoteId: true }).partial();
const legacyStatusSchema = z.object({ status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']), projetosNaoAprovados: z.array(z.string().cuid()).max(200).optional(), executionStatus: z.enum(EXECUTION_STATUSES).optional(), reason: z.string().min(3).max(500).optional(), estimatedBusinessDays: z.number().int().min(1).max(90).optional(), approvedAt: z.coerce.date().optional(), completedAt: z.coerce.date().optional() });
export const updateStatusSchema = z.union([
  z.object({ workStatus: z.enum(WORK_STATUSES), reason: z.string().min(3).max(500).optional(), projetosNaoAprovados: z.array(z.string().cuid()).max(200).optional() }).strict().transform(({ workStatus, reason, projetosNaoAprovados }) => ({ ...WORK_STATUS_STORAGE[workStatus], workStatus, reason, projetosNaoAprovados })),
  legacyStatusSchema,
]);
export const calculateQuoteSchema = z.object({ lines: z.array(z.object({ billingUnit: billingUnitSchema, unitPrice: money, lengthMm: z.number().positive().optional(), widthMm: z.number().positive().optional(), quantity: z.number().positive().optional(), billedQuantity: z.number().positive().optional() })).min(1), discount: money.default(0) });

export const editQuoteSchema = createQuoteSchema.omit({ parentQuoteId: true }).extend({ expectedUpdatedAt: z.string().datetime() });
