import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addBusinessDays, canChangeQuoteStatus, calculateLine, calculateQuoteTotal, DEFAULT_PROJECT_BUSINESS_DAYS } from '@inova/domain';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema, pageQuerySchema, sendPaged } from '../../shared/http.js';
import { createQuoteSchema, quoteItemSchema, updateQuoteItemSchema, updateQuoteSchema, updateStatusSchema, calculateQuoteSchema } from './quote.schema.js';
import { addQuoteItem, createQuote, editQuote, quoteInclude, recalculateQuote } from './quote.service.js';
import { editQuoteSchema } from './quote.schema.js';
import { renderQuotePdf } from './quote.pdf.js';

const historySchema = pageQuerySchema({ scope: z.enum(['active', 'history']).optional(), search: z.string().optional(), status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const asNumber = (value: unknown) => Number(value);
const serializable = (quote: any) => ({ ...quote, discountAmount: asNumber(quote.discountAmount), grossTotal: asNumber(quote.grossTotal), netTotal: asNumber(quote.netTotal), items: quote.items?.map((item: any) => ({ ...item, unitPriceSnapshot: asNumber(item.unitPriceSnapshot), billedQuantity: asNumber(item.billedQuantity), materialSubtotal: asNumber(item.materialSubtotal), servicesSubtotal: asNumber(item.servicesSubtotal), total: asNumber(item.total), services: item.services?.map((service: any) => ({ ...service, unitPriceSnapshot: asNumber(service.unitPriceSnapshot), billedQuantity: asNumber(service.billedQuantity), subtotal: asNumber(service.subtotal), calculatedSubtotal: asNumber(service.calculatedSubtotal ?? service.subtotal), appliedSubtotal: asNumber(service.appliedSubtotal ?? service.subtotal) })), cutouts: item.cutouts?.map((cutout: any) => ({ ...cutout, calculatedSubtotal: asNumber(cutout.calculatedSubtotal), appliedSubtotal: asNumber(cutout.appliedSubtotal ?? cutout.calculatedSubtotal) })), components: item.components?.map((component: any) => ({ ...component, billableArea: asNumber(component.billableArea), subtotal: asNumber(component.subtotal), calculatedTotal: asNumber(component.calculatedTotal ?? component.subtotal), appliedTotal: asNumber(component.appliedTotal ?? component.subtotal), edges: component.edges?.map((edge: any) => ({ ...edge, unitPriceSnapshot: asNumber(edge.unitPriceSnapshot), billedQuantity: asNumber(edge.billedQuantity), subtotal: asNumber(edge.subtotal), calculatedSubtotal: asNumber(edge.calculatedSubtotal ?? edge.subtotal), appliedSubtotal: asNumber(edge.appliedSubtotal ?? edge.subtotal) })) })) })) });
const edgeQuantityFromSnapshot = (edge: any, componentQuantity: number) => {
  const quantityPerPiece = edge.heightMm ? edge.lengthMm * edge.heightMm / 1_000_000 : edge.lengthMm / 1000;
  return Math.max(1, Math.round(Number(edge.billedQuantity) / (quantityPerPiece * componentQuantity)));
};

export async function registerQuoteRoutes(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  app.put('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = editQuoteSchema.parse(request.body);
    return serializable(await prisma.$transaction((tx) => editQuote(tx, id, input, request.user), { timeout: 20000 }));
  });
  app.post('/calculate', authenticated, async (request) => { const input = calculateQuoteSchema.parse(request.body); const lines = input.lines.map(calculateLine); return { lines, total: calculateQuoteTotal(lines.map((line) => line.subtotal), input.discount) }; });
  app.get('/', authenticated, async (request, reply) => {
    const query = historySchema.parse(request.query);
    const closed: Prisma.QuoteWhereInput = { OR: [{ status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] } }, { executionStatus: 'COMPLETED' }] };
    const where: Prisma.QuoteWhereInput = { ...(query.scope ? { AND: [query.scope === 'history' ? closed : { NOT: closed }] } : {}), ...(query.status ? { status: query.status } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}), ...(query.search ? { OR: [{ number: { contains: query.search, mode: 'insensitive' as const } }, { customer: { is: { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { phone: { contains: query.search } }] } } }] } : {}) };
    const [data, total] = await prisma.$transaction([prisma.quote.findMany({ where, include: { customer: true, items: { select: { projectName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), prisma.quote.count({ where })]);
    return sendPaged(reply, query.page, query.limit, total, data.map(serializable));
  });
  app.post('/', authenticated, async (request, reply) => {
    const input = createQuoteSchema.parse(request.body); const quote = await prisma.$transaction((tx) => createQuote(tx, input, request.user));
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: quote.id, action: 'CREATED', current: { number: quote.number, netTotal: asNumber(quote.netTotal) } } });
    for (const item of input.items) await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: quote.id, action: item.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_USED' : 'MEASUREMENTS_RECORDED', current: item.calculationMode === 'MANUAL_M2' ? { justification: item.manualJustification, billedQuantity: item.billedQuantity } : { components: item.components.map((component) => ({ label: component.label, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity })) } } });
    return reply.status(201).send(serializable(quote));
  });
  app.get('/:id', authenticated, async (request) => { const quote = await prisma.quote.findUnique({ where: idSchema.parse(request.params), include: quoteInclude }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); return serializable(quote); });
  app.patch('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params); const input = updateQuoteSchema.parse(request.body); const before = await prisma.quote.findUnique({ where: { id } }); if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (before.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
    const grossTotal = Number(before.grossTotal); const discount = input.discountAmount ?? Number(before.discountAmount); const allowed = request.user.role === 'SUPER_ADMIN' ? grossTotal : grossTotal * request.user.maxDiscountPercent / 100; if (discount > allowed) throw new AppError(403, 'Desconto acima do limite permitido.', 'DISCOUNT_NOT_ALLOWED');
    const quote = await prisma.quote.update({ where: { id }, data: { ...input, ...(input.discountAmount !== undefined ? { netTotal: calculateQuoteTotal([grossTotal], input.discountAmount) } : {}) }, include: quoteInclude });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'UPDATED', previous: { discountAmount: asNumber(before.discountAmount), notes: before.notes }, current: { discountAmount: asNumber(quote.discountAmount), notes: quote.notes } } }); return serializable(quote);
  });
  app.post('/:id/items', authenticated, async (request, reply) => { const { id } = idSchema.parse(request.params); const input = quoteItemSchema.parse(request.body); const item = await prisma.$transaction((tx) => addQuoteItem(tx, id, input, request.user)); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: item.id, action: input.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_USED' : 'MEASUREMENTS_RECORDED', current: { quoteId: id, total: asNumber(item.total), components: input.components.length, justification: input.manualJustification } } }); return reply.status(201).send(serializable({ items: [item] }).items[0]); });
  app.patch('/:id/items/:itemId', authenticated, async (request) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params); const input = updateQuoteItemSchema.parse(request.body); const quote = await prisma.quote.findUnique({ where: { id: params.id } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (quote.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
    const old = await prisma.quoteItem.findUnique({ where: { id: params.itemId }, include: { services: true, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' } }, cutouts: { orderBy: { sortOrder: 'asc' } } } }); if (!old || old.quoteId !== params.id) throw new AppError(404, 'Item não encontrado.', 'NOT_FOUND');
    const oldComponents = old.components.map((component) => ({ label: component.label, componentType: component.componentType, orientation: component.orientation, shape: component.shape, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity, appliedTotal: component.hasManualPriceOverride ? Number(component.appliedTotal) : undefined, sortOrder: component.sortOrder, edges: component.edges.map((edge) => ({ side: edge.side, customLabel: edge.customLabel ?? undefined, lengthMm: edge.lengthMm, heightMm: edge.heightMm ?? undefined, quantity: edgeQuantityFromSnapshot(edge, component.quantity), serviceId: edge.serviceId, appliedSubtotal: edge.hasManualPriceOverride ? Number(edge.appliedSubtotal) : undefined })) }));
    const oldCutouts = old.cutouts.map((cutout) => ({ componentIndex: cutout.componentId ? old.components.findIndex((component) => component.id === cutout.componentId) : undefined, cutoutType: cutout.cutoutType, label: cutout.label ?? undefined, lengthMm: cutout.lengthMm ?? undefined, widthMm: cutout.widthMm ?? undefined, diameterMm: cutout.diameterMm ?? undefined, positionX: cutout.positionX ?? undefined, positionY: cutout.positionY ?? undefined, quantity: cutout.quantity, serviceId: cutout.serviceId ?? undefined, appliedSubtotal: cutout.hasManualPriceOverride ? Number(cutout.appliedSubtotal) : undefined, sortOrder: cutout.sortOrder }));
    const merged = quoteItemSchema.parse({ projectName: input.projectName ?? old.projectName, productTypeId: input.productTypeId ?? old.productTypeId, materialId: input.materialId ?? old.materialId, calculationMode: input.calculationMode ?? old.calculationMode, manualJustification: input.manualJustification ?? old.manualJustification ?? (old.components.length ? undefined : 'Atualização de orçamento legado'), quantity: input.quantity ?? old.quantity, billedQuantity: input.billedQuantity ?? Number(old.billedQuantity), components: input.components ?? oldComponents, cutouts: input.cutouts ?? oldCutouts, services: input.services ?? old.services.map((service) => ({ serviceId: service.serviceId, billedQuantity: Number(service.billedQuantity), appliedSubtotal: service.hasManualPriceOverride ? Number(service.appliedSubtotal) : undefined })) });
    const replacement = await prisma.$transaction(async (tx) => { await tx.quoteItem.delete({ where: { id: old.id } }); const gross = Number(quote.grossTotal) - Number(old.total); await tx.quote.update({ where: { id: params.id }, data: { grossTotal: gross, netTotal: calculateQuoteTotal([gross], Number(quote.discountAmount)) } }); return addQuoteItem(tx, params.id, merged, request.user); }); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: replacement.id, action: merged.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_UPDATED' : 'MEASUREMENTS_UPDATED', previous: { itemId: old.id, components: old.components.length }, current: { components: merged.components.length, billedQuantity: merged.billedQuantity } } }); return serializable({ items: [replacement] }).items[0];
  });
  app.post('/:id/calculate', authenticated, async (request) => serializable(await prisma.$transaction((tx) => recalculateQuote(tx, idSchema.parse(request.params).id, request.user))));
  app.patch('/:id/status', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = updateStatusSchema.parse(request.body);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    if (quote.status !== input.status && !canChangeQuoteStatus(quote.status, input.status)) throw new AppError(409, 'Esta alteração de status não é permitida.', 'INVALID_STATUS_TRANSITION');
    if (input.executionStatus && input.status !== 'APPROVED') throw new AppError(409, 'A execução exige um orçamento aprovado.', 'INVALID_EXECUTION_STATUS');
    if (quote.executionStatus === 'COMPLETED' && input.executionStatus && !['COMPLETED', 'REWORK'].includes(input.executionStatus)) throw new AppError(409, 'Para reabrir um projeto entregue, use Em retrabalho.', 'INVALID_EXECUTION_STATUS');
    const firstApproval = input.status === 'APPROVED' && !quote.approvedAt;
    const now = new Date();
    const estimatedBusinessDays = input.estimatedBusinessDays ?? quote.estimatedBusinessDays ?? DEFAULT_PROJECT_BUSINESS_DAYS;
    const startedAt = quote.startedAt ?? now;
    const executionStatus = input.executionStatus ?? quote.executionStatus;
    const data: Prisma.QuoteUpdateInput = {
      status: input.status,
      ...(input.executionStatus ? { executionStatus } : {}),
      ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
      ...(firstApproval ? { approvedAt: input.approvedAt ?? now, estimatedBusinessDays, dueDate: quote.dueDate ?? addBusinessDays(input.approvedAt ?? now, estimatedBusinessDays) } : {}),
      ...(input.executionStatus === 'IN_PROGRESS' || input.executionStatus === 'REWORK' ? { startedAt } : {}),
      ...(input.executionStatus === 'COMPLETED' ? { completedAt: quote.completedAt ?? now } : {}),
      ...(input.executionStatus === 'REWORK' ? { completedAt: null } : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.quote.update({ where: { id }, data, include: quoteInclude });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'STATUS_CHANGED', previous: { status: quote.status, executionStatus: quote.executionStatus, completedAt: quote.completedAt }, current: { status: result.status, executionStatus: result.executionStatus, reason: input.reason, approvedAt: result.approvedAt, completedAt: result.completedAt, startedAt: result.startedAt, dueDate: result.dueDate } } });
      return result;
    });
    return serializable(updated);
  });
  app.post('/:id/duplicate', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const quote = await prisma.quote.findUnique({ where: { id }, include: { items: { include: { services: true, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' } }, cutouts: { orderBy: { sortOrder: 'asc' } } } } } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const input = { customerId: quote.customerId, validUntil: quote.validUntil, discountAmount: Number(quote.discountAmount), notes: quote.notes, items: quote.items.map((item) => ({ projectName: item.projectName, productTypeId: item.productTypeId, materialId: item.materialId, calculationMode: item.components.length ? 'DIMENSIONS' as const : 'MANUAL_M2' as const, manualJustification: item.components.length ? undefined : 'Duplicação de orçamento legado', quantity: item.quantity, billedQuantity: item.components.length ? undefined : Number(item.billedQuantity), components: item.components.map((component) => ({ label: component.label, componentType: component.componentType, orientation: component.orientation, shape: component.shape, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity, appliedTotal: component.hasManualPriceOverride ? Number(component.appliedTotal) : undefined, sortOrder: component.sortOrder, edges: component.edges.map((edge) => ({ side: edge.side, customLabel: edge.customLabel ?? undefined, lengthMm: edge.lengthMm, heightMm: edge.heightMm ?? undefined, quantity: edgeQuantityFromSnapshot(edge, component.quantity), serviceId: edge.serviceId, appliedSubtotal: edge.hasManualPriceOverride ? Number(edge.appliedSubtotal) : undefined })) })), cutouts: item.cutouts.map((cutout) => ({ cutoutType: cutout.cutoutType, label: cutout.label ?? undefined, lengthMm: cutout.lengthMm ?? undefined, widthMm: cutout.widthMm ?? undefined, diameterMm: cutout.diameterMm ?? undefined, positionX: cutout.positionX ?? undefined, positionY: cutout.positionY ?? undefined, quantity: cutout.quantity, serviceId: cutout.serviceId ?? undefined, appliedSubtotal: cutout.hasManualPriceOverride ? Number(cutout.appliedSubtotal) : undefined, sortOrder: cutout.sortOrder })), services: item.services.map((service) => ({ serviceId: service.serviceId, billedQuantity: Number(service.billedQuantity), appliedSubtotal: service.hasManualPriceOverride ? Number(service.appliedSubtotal) : undefined })) })) };
    const copy = await prisma.$transaction((tx) => createQuote(tx, input, request.user)); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: copy.id, action: 'DUPLICATED', current: { sourceId: id, number: copy.number } } }); return reply.status(201).send(serializable(copy));
  });
  app.get('/:id/pdf', authenticated, async (request, reply) => {
    const quote = await prisma.quote.findUnique({ where: idSchema.parse(request.params), include: quoteInclude }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const pdf = new PDFDocument({ margin: 36 }); renderQuotePdf(pdf, quote); pdf.end(); return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${quote.number}.pdf"`).send(pdf);
  });
}
