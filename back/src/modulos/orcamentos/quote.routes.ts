import { serializarOrcamento } from './serializacao.js';
import { nomeArquivoPdf, disposicaoArquivoPdf, itemSalvoParaCopia } from '@inova/domain';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adicionarDiasUteis, podeAlterarStatusOrcamento, calcularLinha, calcularTotalOrcamento, DEFAULT_PROJECT_BUSINESS_DAYS, WORK_STATUS_STORAGE } from '@inova/domain';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { createQuoteSchema, quoteItemSchema, updateQuoteItemSchema, updateQuoteSchema, updateStatusSchema, calculateQuoteSchema } from './quote.schema.js';
import { adicionarItemOrcamento, criarOrcamento, editarOrcamento, quoteInclude, recalcularOrcamento } from './quote.service.js';
import { editQuoteSchema } from './quote.schema.js';
import { renderizarPdfOrcamento } from './quote.pdf.js';
import { quotePdfOptionsSchema } from './quote.pdf-options.js';
import { montarFiltrosOrcamento, historySchema } from './quote.tracking.js';
import { trackingSchema } from './quote.tracking.js';

const asNumber = (value: unknown) => Number(value);
export async function registrarRotasOrcamentos(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  app.put('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = editQuoteSchema.parse(request.body);
    return serializarOrcamento(await prisma.$transaction((tx) => editarOrcamento(tx, id, input, request.user), { timeout: 20000 }));
  });
  app.post('/calculate', authenticated, async (request) => { const input = calculateQuoteSchema.parse(request.body); const lines = input.lines.map(calcularLinha); return { lines, total: calcularTotalOrcamento(lines.map((line) => line.subtotal), input.discount) }; });
  app.get('/', authenticated, async (request, reply) => {
    const query = historySchema.parse(request.query);
    const where = montarFiltrosOrcamento(query);
    const [data, total] = await prisma.$transaction([prisma.quote.findMany({ where, include: { customer: true, workerAssignments: { where: { releasedAt: null }, include: { worker: { select: { id: true, name: true, workColor: true } } } }, items: { select: { projectName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), prisma.quote.count({ where })]);
    const counterBase = montarFiltrosOrcamento({ ...query, page: 1, limit: 1, workStatus: undefined, situacaoPrazoInterno: undefined });
    const statuses = ['PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'WAITING_MATERIAL', 'PENDING_WORK', 'REWORK', 'READY', 'DELIVERY_PENDING', 'INSTALLATION_PENDING', 'DELIVERED', 'REJECTED'] as const;
    const counts = Object.fromEntries(await Promise.all(statuses.map(async (status) => [status, await prisma.quote.count({ where: { AND: [counterBase, (status === 'DELIVERED' ? { status: 'APPROVED', executionStatus: 'COMPLETED' } : status === 'PENDING_APPROVAL' ? { status: { in: ['DRAFT', 'SENT'] } } : status === 'REJECTED' ? { status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] } } : { status: WORK_STATUS_STORAGE[status].status, executionStatus: WORK_STATUS_STORAGE[status].executionStatus })] } })])));
    const overdue = await prisma.quote.count({ where: { AND: [counterBase, montarFiltrosOrcamento({ ...query, page: 1, limit: 1, situacaoPrazoInterno: 'OVERDUE', workStatus: undefined })] } });
    return reply.send({ data: data.map(serializarOrcamento), meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }, counts: { ALL: total, ...counts, OVERDUE: overdue } });
  });
  app.post('/', authenticated, async (request, reply) => {
    const input = createQuoteSchema.parse(request.body); const quote = await prisma.$transaction((tx) => criarOrcamento(tx, input, request.user));
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: quote.id, action: 'CREATED', current: { number: quote.number, netTotal: asNumber(quote.netTotal) } } });
    for (const item of input.items) await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: quote.id, action: item.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_USED' : 'MEASUREMENTS_RECORDED', current: item.calculationMode === 'MANUAL_M2' ? { justification: item.manualJustification, billedQuantity: item.billedQuantity } : { components: item.components.map((component) => ({ materialId: component.materialId ?? item.materialId, label: component.label, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity })) } } });
    return reply.status(201).send(serializarOrcamento(quote));
  });
  app.get('/:id', authenticated, async (request) => { const quote = await prisma.quote.findUnique({ where: idSchema.parse(request.params), include: quoteInclude }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); return serializarOrcamento(quote); });
  app.put('/:id/worker', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const { workerId } = z.object({ workerId: z.string().cuid().nullable() }).parse(request.body);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const current = await prisma.quoteWorkerAssignment.findFirst({ where: { quoteId: id, releasedAt: null }, include: { worker: { select: { id: true, name: true, workColor: true } } }, orderBy: { assignedAt: 'desc' } });
    if (current?.workerId === workerId) return serializarOrcamento(await prisma.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude }));
    const worker = workerId ? await prisma.worker.findFirst({ where: { id: workerId, isActive: true }, select: { id: true, name: true, workColor: true } }) : null;
    if (workerId && !worker) throw new AppError(422, 'Funcionário não está disponível.', 'WORKER_UNAVAILABLE');
    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      if (current) await tx.quoteWorkerAssignment.update({ where: { id: current.id }, data: { releasedAt: now } });
      if (worker) await tx.quoteWorkerAssignment.create({ data: { quoteId: id, workerId: worker.id, colorSnapshot: worker.workColor, assignedAt: now } });
      const result = await tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_WORKER', entityId: id, action: 'ASSIGNMENT_CHANGED', previous: current ? { workerId: current.worker.id, name: current.worker.name, color: current.colorSnapshot } : Prisma.JsonNull, current: worker ? { workerId: worker.id, name: worker.name, color: worker.workColor } : Prisma.JsonNull } });
      return result;
    });
    return serializarOrcamento(updated);
  });
  app.patch('/:id/tracking', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = trackingSchema.parse(request.body);
    const before = await prisma.quote.findUnique({ where: { id } });
    if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const data: Prisma.QuoteUpdateInput = {
      ...(input.deliveryDeadline !== undefined ? { deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline + 'T00:00:00.000Z') : null } : {}),
      ...(input.installationDeadline !== undefined ? { installationDeadline: input.installationDeadline ? new Date(input.installationDeadline + 'T00:00:00.000Z') : null } : {}),
      ...(input.deadlineConfirmed !== undefined ? { deadlineConfirmed: input.deadlineConfirmed } : {}),
      ...(input.deadlineNote !== undefined ? { deadlineNote: input.deadlineNote } : {}),
    };
    const updated = await prisma.quote.update({ where: { id }, data, include: quoteInclude });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'DEADLINE_UPDATED', previous: { deliveryDeadline: before.deliveryDeadline, installationDeadline: before.installationDeadline, deadlineConfirmed: before.deadlineConfirmed, deadlineNote: before.deadlineNote }, current: { deliveryDeadline: updated.deliveryDeadline, installationDeadline: updated.installationDeadline, deadlineConfirmed: updated.deadlineConfirmed, deadlineNote: updated.deadlineNote } } });
    return serializarOrcamento(updated);
  });
  app.patch('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params); const input = updateQuoteSchema.parse(request.body); const before = await prisma.quote.findUnique({ where: { id } }); if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (before.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
    const grossTotal = Number(before.grossTotal); const discount = input.discountAmount ?? Number(before.discountAmount); const allowed = request.user.role === 'SUPER_ADMIN' ? grossTotal : grossTotal * request.user.maxDiscountPercent / 100; if (discount > allowed) throw new AppError(403, 'Desconto acima do limite permitido.', 'DISCOUNT_NOT_ALLOWED');
    const quote = await prisma.quote.update({ where: { id }, data: { ...input, ...(input.discountAmount !== undefined ? { netTotal: calcularTotalOrcamento([grossTotal], input.discountAmount) } : {}) }, include: quoteInclude });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'UPDATED', previous: { discountAmount: asNumber(before.discountAmount), notes: before.notes }, current: { discountAmount: asNumber(quote.discountAmount), notes: quote.notes } } }); return serializarOrcamento(quote);
  });
  app.post('/:id/items', authenticated, async (request, reply) => { const { id } = idSchema.parse(request.params); const input = quoteItemSchema.parse(request.body); const item = await prisma.$transaction((tx) => adicionarItemOrcamento(tx, id, input, request.user)); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: item.id, action: input.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_USED' : 'MEASUREMENTS_RECORDED', current: { quoteId: id, total: asNumber(item.total), components: input.components.length, justification: input.manualJustification } } }); return reply.status(201).send(serializarOrcamento({ items: [item] }).items[0]); });
  app.patch('/:id/items/:itemId', authenticated, async (request) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params); const input = updateQuoteItemSchema.parse(request.body); const quote = await prisma.quote.findUnique({ where: { id: params.id } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (quote.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
    const old = await prisma.quoteItem.findUnique({ where: { id: params.itemId }, include: { services: true, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' } }, cutouts: { orderBy: { sortOrder: 'asc' } } } }); if (!old || old.quoteId !== params.id) throw new AppError(404, 'Item não encontrado.', 'NOT_FOUND');
    const anterior = itemSalvoParaCopia(old);
    const merged = quoteItemSchema.parse({
      ...anterior,
      ...Object.fromEntries(Object.entries(input).filter(([, valor]) => valor !== undefined)),
    });
    const replacement = await prisma.$transaction(async (tx) => { await tx.quoteItem.delete({ where: { id: old.id } }); const gross = Number(quote.grossTotal) - Number(old.total); await tx.quote.update({ where: { id: params.id }, data: { grossTotal: gross, netTotal: calcularTotalOrcamento([gross], Number(quote.discountAmount)) } }); return adicionarItemOrcamento(tx, params.id, merged, request.user); }); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: replacement.id, action: merged.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_UPDATED' : 'MEASUREMENTS_UPDATED', previous: { itemId: old.id, components: old.components.length }, current: { components: merged.components.length, billedQuantity: merged.billedQuantity } } }); return serializarOrcamento({ items: [replacement] }).items[0];
  });
  app.post('/:id/calculate', authenticated, async (request) => serializarOrcamento(await prisma.$transaction((tx) => recalcularOrcamento(tx, idSchema.parse(request.params).id, request.user))));
  app.patch('/:id/status', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = updateStatusSchema.parse(request.body);
    const normalized = 'workStatus' in input ? { ...input, ...WORK_STATUS_STORAGE[input.workStatus] } : input;
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    if (quote.status !== normalized.status && !podeAlterarStatusOrcamento(quote.status, normalized.status)) throw new AppError(409, 'Esta alteração de status não é permitida.', 'INVALID_STATUS_TRANSITION');
    if (normalized.executionStatus && normalized.status !== 'APPROVED') throw new AppError(409, 'A execução exige um orçamento aprovado.', 'INVALID_EXECUTION_STATUS');
    if (quote.executionStatus === 'COMPLETED' && normalized.executionStatus && !['COMPLETED', 'REWORK'].includes(normalized.executionStatus)) throw new AppError(409, 'Para reabrir um projeto entregue, use Em retrabalho.', 'INVALID_EXECUTION_STATUS');
    const firstApproval = normalized.status === 'APPROVED' && !quote.approvedAt;
    const now = new Date();
    const estimatedBusinessDays = normalized.estimatedBusinessDays ?? quote.estimatedBusinessDays ?? DEFAULT_PROJECT_BUSINESS_DAYS;
    const startedAt = quote.startedAt ?? now;
    const executionStatus = input.executionStatus ?? quote.executionStatus;
    const data: Prisma.QuoteUpdateInput = {
      status: normalized.status,
      ...(normalized.executionStatus ? { executionStatus } : {}),
      ...(normalized.approvedAt ? { approvedAt: normalized.approvedAt } : {}),
      ...(firstApproval ? { approvedAt: normalized.approvedAt ?? now, estimatedBusinessDays, dueDate: quote.dueDate ?? adicionarDiasUteis(normalized.approvedAt ?? now, estimatedBusinessDays) } : {}),
      ...(normalized.executionStatus === 'IN_PROGRESS' || normalized.executionStatus === 'REWORK' ? { startedAt } : {}),
      ...(normalized.executionStatus === 'COMPLETED' ? { completedAt: quote.completedAt ?? now } : {}),
      ...(normalized.executionStatus === 'REWORK' ? { completedAt: null } : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.quote.update({ where: { id }, data, include: quoteInclude });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'STATUS_CHANGED', previous: { status: quote.status, executionStatus: quote.executionStatus, completedAt: quote.completedAt }, current: { status: result.status, executionStatus: result.executionStatus, reason: input.reason, approvedAt: result.approvedAt, completedAt: result.completedAt, startedAt: result.startedAt, dueDate: result.dueDate } } });
      return result;
    });
    return serializarOrcamento(updated);
  });
  app.post('/:id/duplicate', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const quote = await prisma.quote.findUnique({ where: { id }, include: { items: { include: { services: true, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' } }, cutouts: { orderBy: { sortOrder: 'asc' } } } } } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const input = { customerId: quote.customerId, validUntil: quote.validUntil, deliveryDeadline: quote.deliveryDeadline ? quote.deliveryDeadline.toISOString().slice(0, 10) : null, installationDeadline: quote.installationDeadline ? quote.installationDeadline.toISOString().slice(0, 10) : null, deadlineConfirmed: quote.deadlineConfirmed, deadlineNote: quote.deadlineNote, discountAmount: Number(quote.discountAmount), notes: quote.notes, items: quote.items.map(itemSalvoParaCopia) };
    const copy = await prisma.$transaction((tx) => criarOrcamento(tx, input, request.user)); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: copy.id, action: 'DUPLICATED', current: { sourceId: id, number: copy.number } } }); return reply.status(201).send(serializarOrcamento(copy));
  });
  app.get('/:id/pdf', authenticated, async (request, reply) => {
    const options = quotePdfOptionsSchema.parse(request.query);
    const quote = await prisma.quote.findUnique({ where: idSchema.parse(request.params), include: quoteInclude }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const filename = nomeArquivoPdf(quote.customerNameSnapshot, quote.number);
    const pdf = new PDFDocument({ margin: 36 }); renderizarPdfOrcamento(pdf, quote, options); pdf.end(); return reply.type('application/pdf').header('Content-Disposition', disposicaoArquivoPdf(filename)).send(pdf);
  });
}
