import { escopoOrcamentos, exigirOrcamentoProprio, exigirPermissao } from '../../compartilhado/acesso.js';
import { serializarOrcamento } from './serializacao.js';
import { nomeArquivoPdf, disposicaoArquivoPdf, itemSalvoParaCopia, nomeProjeto } from '@inova/domain';
import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { adicionarDiasUteis, podeAlterarStatusOrcamento, calcularLinha, calcularTotalOrcamento, DEFAULT_PROJECT_BUSINESS_DAYS, WORK_STATUS_STORAGE } from '@inova/domain';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { createQuoteSchema, quoteItemSchema, updateQuoteItemSchema, updateQuoteSchema, updateStatusSchema, calculateQuoteSchema } from './quote.schema.js';
import { adicionarItemOrcamento, criarOrcamento, editarOrcamento, incluirOrcamento, recalcularOrcamento, validarDesconto } from './quote.service.js';
import { editQuoteSchema } from './quote.schema.js';
import { novoPdfExportacao, renderizarExportacao } from './quote.pdf.js';
import { quotePdfOptionsSchema, type QuotePdfOptions } from './quote.pdf-options.js';
import { desenhosTecnicosDosProjetos, desenhosTecnicosParaOrdemServico } from '../desenhos/desenho-tecnico-do-orcamento.js';
import { compararPorPrazo, montarFiltrosOrcamento, historySchema, ORDEM_ORCAMENTOS } from './quote.tracking.js';
import { atualizarCliente } from '../clientes/customer.routes.js';
import { montarHistorico } from './quote.historico.js';
import { definirProjetosNaoAprovados } from './aprovacao-projetos.js';
import { naoAprovarPecas, naoAprovarPecasSchema } from './pecas-nao-aprovadas.js';
import { retrabalharProjeto } from '../fluxo/workflow.service.js';
import { acompanhamentoSchema } from './quote.tracking.js';

const asNumber = (value: unknown) => Number(value);
type QuoteParaExportar = { id: string; number: string; customerId: string; customerNameSnapshot: string; deliveryDeadline: Date | null; dueDate: Date | null; items: { id: string; projectName: string | null; drawingData: unknown; declinedAt: Date | null }[] };

export async function registrarRotasOrcamentos(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirOrcamentoProprio] };
  app.put('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = editQuoteSchema.parse(request.body);
    return serializarOrcamento(await prisma.$transaction((tx) => editarOrcamento(tx, id, input, request.user), { timeout: 20000 }));
  });
  app.post('/calculate', authenticated, async (request) => { const input = calculateQuoteSchema.parse(request.body); const lines = input.lines.map(calcularLinha); return { lines, total: calcularTotalOrcamento(lines.map((line) => line.subtotal), input.discount) }; });
  app.get('/', authenticated, async (request, reply) => {
    const query = historySchema.parse(request.query);
    const where = { AND: [montarFiltrosOrcamento(query), escopoOrcamentos(request.user)] };
    const include = { customer: true, createdBy: { select: { id: true, name: true } }, workerAssignments: { where: { releasedAt: null }, include: { worker: { select: { id: true, name: true, workColor: true } } } }, items: { select: { projectName: true } } } satisfies Prisma.QuoteInclude;
    const skip = (query.page - 1) * query.limit;
    const total = await prisma.quote.count({ where });
    let data;
    if (query.ordem === 'prazo') {
      // O prazo final junta dois campos: ordena os ids no servidor e busca só a página.
      const ordenados = (await prisma.quote.findMany({ where, select: { id: true, installationDeadline: true, deliveryDeadline: true, createdAt: true } })).sort(compararPorPrazo);
      const ids = ordenados.slice(skip, skip + query.limit).map((quote) => quote.id);
      const pagina = await prisma.quote.findMany({ where: { id: { in: ids } }, include });
      data = ids.map((id) => pagina.find((quote) => quote.id === id)!);
    } else data = await prisma.quote.findMany({ where, include, orderBy: ORDEM_ORCAMENTOS[query.ordem], skip, take: query.limit });
    const counterBase = { AND: [montarFiltrosOrcamento({ ...query, page: 1, limit: 1, workStatus: undefined, situacaoPrazoInterno: undefined }), escopoOrcamentos(request.user)] };
    const statuses = ['PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'WAITING_MATERIAL', 'PENDING_WORK', 'REWORK', 'PAUSED', 'READY', 'DELIVERY_PENDING', 'INSTALLATION_PENDING', 'DELIVERED', 'REJECTED'] as const;
    const counts = Object.fromEntries(await Promise.all(statuses.map(async (status) => [status, await prisma.quote.count({ where: { AND: [counterBase, (status === 'DELIVERED' ? { status: 'APPROVED', executionStatus: 'COMPLETED' } : status === 'PENDING_APPROVAL' ? { status: { in: ['DRAFT', 'SENT'] } } : status === 'REJECTED' ? { status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] } } : { status: WORK_STATUS_STORAGE[status].status, executionStatus: WORK_STATUS_STORAGE[status].executionStatus })] } })])));
    const overdue = await prisma.quote.count({ where: { AND: [counterBase, montarFiltrosOrcamento({ ...query, page: 1, limit: 1, situacaoPrazoInterno: 'OVERDUE', workStatus: undefined })] } });
    return reply.send({ data: data.map((quote) => serializarOrcamento(quote)), meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }, counts: { ALL: total, ...counts, OVERDUE: overdue } });
  });
  app.post('/', authenticated, async (request, reply) => {
    const input = createQuoteSchema.parse(request.body); const quote = await prisma.$transaction((tx) => criarOrcamento(tx, input, request.user));
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: quote.id, action: 'CREATED', current: { number: quote.number, netTotal: asNumber(quote.netTotal) } } });
    for (const item of input.items) await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: quote.id, action: item.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_USED' : 'MEASUREMENTS_RECORDED', current: item.calculationMode === 'MANUAL_M2' ? { justification: item.manualJustification, billedQuantity: item.billedQuantity } : { components: item.components.map((component) => ({ materialId: component.materialId ?? item.materialId, label: component.label, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity })) } } });
    return reply.status(201).send(serializarOrcamento(quote));
  });
  app.get('/:id', authenticated, async (request) => { const quote = await prisma.quote.findUnique({ where: idSchema.parse(request.params), include: incluirOrcamento(request.user) }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); return serializarOrcamento(quote); });
  app.put('/:id/worker', { preHandler: [...authenticated.preHandler, exigirPermissao('team')] }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const { workerId } = z.object({ workerId: z.string().cuid().nullable() }).parse(request.body);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const current = await prisma.quoteWorkerAssignment.findFirst({ where: { quoteId: id, releasedAt: null }, include: { worker: { select: { id: true, name: true, workColor: true } } }, orderBy: { assignedAt: 'desc' } });
    if (current?.workerId === workerId) return serializarOrcamento(await prisma.quote.findUniqueOrThrow({ where: { id }, include: incluirOrcamento(request.user) }));
    const worker = workerId ? await prisma.worker.findFirst({ where: { id: workerId, isActive: true }, select: { id: true, name: true, workColor: true } }) : null;
    if (workerId && !worker) throw new AppError(422, 'Funcionário não está disponível.', 'WORKER_UNAVAILABLE');
    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      if (current) await tx.quoteWorkerAssignment.update({ where: { id: current.id }, data: { releasedAt: now } });
      if (worker) await tx.quoteWorkerAssignment.create({ data: { quoteId: id, workerId: worker.id, colorSnapshot: worker.workColor, assignedAt: now } });
      const result = await tx.quote.findUniqueOrThrow({ where: { id }, include: incluirOrcamento(request.user) });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_WORKER', entityId: id, action: 'ASSIGNMENT_CHANGED', previous: current ? { workerId: current.worker.id, name: current.worker.name, color: current.colorSnapshot } : Prisma.JsonNull, current: worker ? { workerId: worker.id, name: worker.name, color: worker.workColor } : Prisma.JsonNull } });
      return result;
    });
    return serializarOrcamento(updated);
  });
  // Botão "Histórico" da tela do orçamento: linha do tempo com o que aconteceu (situação, prazos, equipe, Fluxo, entregas).
  app.get('/:id/historico', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const quote = await prisma.quote.findUnique({ where: { id }, select: {
      createdAt: true, validUntil: true, approvedAt: true, completedAt: true, dueDate: true,
      items: { select: { id: true, projectName: true } },
      workerAssignments: { select: { id: true, assignedAt: true, releasedAt: true, worker: { select: { name: true } } }, orderBy: { assignedAt: 'asc' } },
    } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const registros = await prisma.auditLog.findMany({
      where: { OR: [
        { entityType: 'QUOTE', entityId: id },
        { entityType: 'QUOTE_ITEM', current: { path: ['quoteId'], equals: id } },
        { entityType: 'DESIGN', action: 'CREATED_FROM_QUOTE', current: { path: ['quoteId'], equals: id } },
      ] },
      include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' }, take: 500,
    });
    return montarHistorico(quote, registros);
  });
  // Lápis ao lado do cliente, na tela do orçamento: edita o contato do cliente e este orçamento (e o PDF dele) passa a mostrá-lo.
  app.patch('/:id/contact', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const before = await prisma.quote.findUnique({ where: { id }, select: { customerId: true, customerNameSnapshot: true, customerPhoneSnapshot: true, workAddressSnapshot: true } });
    if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const customer = await atualizarCliente(before.customerId, request.body);
    const current = { customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, workAddressSnapshot: customer.address ?? before.workAddressSnapshot };
    const updated = await prisma.quote.update({ where: { id }, data: current, include: incluirOrcamento(request.user) });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'CONTACT_UPDATED', previous: { customerNameSnapshot: before.customerNameSnapshot, customerPhoneSnapshot: before.customerPhoneSnapshot, workAddressSnapshot: before.workAddressSnapshot }, current } });
    return serializarOrcamento(updated);
  });
  app.patch('/:id/tracking', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = acompanhamentoSchema.parse(request.body);
    const before = await prisma.quote.findUnique({ where: { id } });
    if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const data: Prisma.QuoteUpdateInput = {
      ...(input.deliveryDeadline !== undefined ? { deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline + 'T00:00:00.000Z') : null } : {}),
      ...(input.installationDeadline !== undefined ? { installationDeadline: input.installationDeadline ? new Date(input.installationDeadline + 'T00:00:00.000Z') : null } : {}),
      ...(input.deadlineConfirmed !== undefined ? { deadlineConfirmed: input.deadlineConfirmed } : {}),
      ...(input.deadlineNote !== undefined ? { deadlineNote: input.deadlineNote } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    };
    const updated = await prisma.quote.update({ where: { id }, data, include: incluirOrcamento(request.user) });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'DEADLINE_UPDATED', previous: { deliveryDeadline: before.deliveryDeadline, installationDeadline: before.installationDeadline, deadlineConfirmed: before.deadlineConfirmed, deadlineNote: before.deadlineNote, notes: before.notes }, current: { deliveryDeadline: updated.deliveryDeadline, installationDeadline: updated.installationDeadline, deadlineConfirmed: updated.deadlineConfirmed, deadlineNote: updated.deadlineNote, notes: updated.notes } } });
    return serializarOrcamento(updated);
  });
  app.patch('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params); const input = updateQuoteSchema.parse(request.body); const before = await prisma.quote.findUnique({ where: { id } }); if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (before.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
    const grossTotal = Number(before.grossTotal); const discount = input.discountAmount ?? Number(before.discountAmount); validarDesconto(request.user, grossTotal, discount);
    const quote = await prisma.quote.update({ where: { id }, data: { ...input, ...(input.discountAmount !== undefined ? { netTotal: calcularTotalOrcamento([grossTotal], input.discountAmount) } : {}) }, include: incluirOrcamento(request.user) });
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
    if (old.declinedAt) throw new AppError(409, 'Este projeto não foi aprovado pelo cliente; aprove-o antes de alterar.', 'ITEM_DECLINED');
    const replacement = await prisma.$transaction(async (tx) => { await tx.quoteItem.delete({ where: { id: old.id } }); const gross = calcularTotalOrcamento([Number(quote.grossTotal)]) - calcularTotalOrcamento([Number(old.total)]); await tx.quote.update({ where: { id: params.id }, data: { grossTotal: gross, netTotal: calcularTotalOrcamento([gross], Number(quote.discountAmount)) } }); return adicionarItemOrcamento(tx, params.id, merged, request.user); }); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: replacement.id, action: merged.calculationMode === 'MANUAL_M2' ? 'MANUAL_M2_UPDATED' : 'MEASUREMENTS_UPDATED', previous: { itemId: old.id, components: old.components.length }, current: { components: merged.components.length, billedQuantity: merged.billedQuantity } } }); return serializarOrcamento({ items: [replacement] }).items[0];
  });
  app.post('/:id/calculate', authenticated, async (request) => serializarOrcamento(await prisma.$transaction((tx) => recalcularOrcamento(tx, idSchema.parse(request.params).id, request.user))));
  app.patch('/:id/status', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = updateStatusSchema.parse(request.body);
    const normalized = 'workStatus' in input ? { ...input, ...WORK_STATUS_STORAGE[input.workStatus] } : input;
    const quote = await prisma.quote.findUnique({ where: { id }, include: { items: { select: { declinedAt: true } } } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    if (quote.status !== normalized.status && !podeAlterarStatusOrcamento(quote.status, normalized.status)) throw new AppError(409, 'Esta alteração de status não é permitida.', 'INVALID_STATUS_TRANSITION');
    if (normalized.executionStatus && normalized.executionStatus !== 'NOT_STARTED' && normalized.status !== 'APPROVED') throw new AppError(409, 'A execução exige um orçamento aprovado.', 'INVALID_EXECUTION_STATUS');
    if (quote.executionStatus === 'COMPLETED' && normalized.executionStatus && !['COMPLETED', 'REWORK'].includes(normalized.executionStatus)) throw new AppError(409, 'Para reabrir um projeto entregue, use Em retrabalho.', 'INVALID_EXECUTION_STATUS');
    const firstApproval = normalized.status === 'APPROVED' && !quote.approvedAt;
    const now = new Date();
    const estimatedBusinessDays = normalized.estimatedBusinessDays ?? quote.estimatedBusinessDays ?? DEFAULT_PROJECT_BUSINESS_DAYS;
    const startedAt = quote.startedAt ?? now;
    const executionStatus = normalized.executionStatus ?? quote.executionStatus;
    const data: Prisma.QuoteUpdateInput = {
      status: normalized.status,
      ...(normalized.executionStatus ? { executionStatus } : {}),
      ...(normalized.approvedAt ? { approvedAt: normalized.approvedAt } : {}),
      ...(firstApproval ? { approvedAt: normalized.approvedAt ?? now, estimatedBusinessDays, dueDate: quote.dueDate ?? adicionarDiasUteis(normalized.approvedAt ?? now, estimatedBusinessDays) } : {}),
      ...(normalized.executionStatus === 'IN_PROGRESS' || normalized.executionStatus === 'REWORK' ? { startedAt } : {}),
      ...(normalized.executionStatus === 'COMPLETED' ? { completedAt: quote.completedAt ?? now } : {}),
      ...(normalized.executionStatus === 'REWORK' ? { completedAt: null } : {}),
    };
    // Aprovação: os projetos que o cliente não aprovou saem do valor, do fluxo e da entrega. De volta a
    // "aguardando aprovação", todos os projetos voltam a valer.
    const aprovando = normalized.status === 'APPROVED' && quote.status !== 'APPROVED';
    const pendente = normalized.status === 'SENT' || normalized.status === 'DRAFT';
    const pedidos = aprovando ? normalized.projetosNaoAprovados ?? [] : [];
    const mudaAprovacao = (aprovando || pendente) && (pedidos.length > 0 || !!quote.items?.some((item) => item.declinedAt));
    const updated = await prisma.$transaction(async (tx) => {
      const naoAprovados = mudaAprovacao ? await definirProjetosNaoAprovados(tx, id, pedidos) : [];
      const result = await tx.quote.update({ where: { id }, data, include: incluirOrcamento(request.user) });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: id, action: 'STATUS_CHANGED', previous: { status: quote.status, executionStatus: quote.executionStatus, completedAt: quote.completedAt }, current: { status: result.status, executionStatus: result.executionStatus, reason: input.reason, ...(naoAprovados.length ? { projetosNaoAprovados: result.items.filter((item) => naoAprovados.includes(item.id)).map((item) => nomeProjeto(item)) } : {}), approvedAt: result.approvedAt, completedAt: result.completedAt, startedAt: result.startedAt, dueDate: result.dueDate } } });
      return result;
    });
    return serializarOrcamento(updated);
  });
  // Corrigir nomes (projeto e descrição das peças) em qualquer situação, até entregue: nada mais muda —
  // nem medidas, nem valores, nem o fluxo; o que foi entregue continua entregue (só o retrabalho volta).
  app.patch('/:id/items/:itemId/nomes', authenticated, async (request) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const input = z.object({ projectName: z.string().trim().max(120).nullable(), components: z.array(z.object({ id: z.string(), label: z.string().trim().max(120) })).max(500).default([]) }).strict().parse(request.body);
    const item = await prisma.quoteItem.findFirst({ where: { id: params.itemId, quoteId: params.id }, select: { id: true, projectName: true, components: { select: { id: true, label: true } } } });
    if (!item) throw new AppError(404, 'Projeto não encontrado neste orçamento.', 'NOT_FOUND');
    const pecas = new Map(item.components.map((peca) => [peca.id, peca.label]));
    if (input.components.some((peca) => !pecas.has(peca.id))) throw new AppError(422, 'Peça não encontrada neste projeto.', 'INVALID_PIECES');
    const mudadas = input.components.filter((peca) => pecas.get(peca.id) !== peca.label);
    const result = await prisma.$transaction(async (tx) => {
      await tx.quoteItem.update({ where: { id: item.id }, data: { projectName: input.projectName || null } });
      for (const peca of mudadas) await tx.quoteItemComponent.update({ where: { id: peca.id }, data: { label: peca.label } });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: item.id, action: 'NAMES_UPDATED',
        previous: { projectName: item.projectName, components: mudadas.map((peca) => ({ id: peca.id, label: pecas.get(peca.id) })) },
        current: { quoteId: params.id, projectName: input.projectName || null, components: mudadas } } });
      return tx.quote.findUniqueOrThrow({ where: { id: params.id }, include: incluirOrcamento(request.user) });
    });
    return serializarOrcamento(result);
  });
  // Depois da aprovação: aprovar ou tirar a aprovação de um projeto (o valor do orçamento acompanha).
  app.patch('/:id/items/:itemId/aprovacao', authenticated, async (request) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const { aprovado } = z.object({ aprovado: z.boolean() }).strict().parse(request.body);
    const quote = await prisma.quote.findUnique({ where: { id: params.id }, select: { status: true, executionStatus: true, items: { select: { id: true, declinedAt: true } } } });
    const item = quote?.items.find((entrada) => entrada.id === params.itemId);
    if (!quote || !item) throw new AppError(404, 'Projeto não encontrado neste orçamento.', 'NOT_FOUND');
    if (quote.status !== 'APPROVED' || quote.executionStatus === 'COMPLETED') throw new AppError(409, 'A aprovação dos projetos só muda em um orçamento aprovado e ainda não entregue.', 'QUOTE_NOT_APPROVED');
    const naoAprovados = quote.items.filter((entrada) => entrada.id === item.id ? !aprovado : !!entrada.declinedAt).map((entrada) => entrada.id);
    const result = await prisma.$transaction(async (tx) => {
      await definirProjetosNaoAprovados(tx, params.id, naoAprovados);
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: item.id, action: 'APPROVAL_CHANGED', previous: { aprovado: !item.declinedAt }, current: { quoteId: params.id, aprovado } } });
      return tx.quote.findUniqueOrThrow({ where: { id: params.id }, include: incluirOrcamento(request.user) });
    });
    return serializarOrcamento(result);
  });
  // "Não aprovado / alterar": o cliente não aprovou parte das peças do projeto (ou todas).
  app.post('/:id/items/:itemId/nao-aprovar', authenticated, async (request) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const corpo = naoAprovarPecasSchema.parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      await naoAprovarPecas(tx, params.id, params.itemId, corpo, request.user);
      return tx.quote.findUniqueOrThrow({ where: { id: params.id }, include: incluirOrcamento(request.user) });
    }, { timeout: 20000 });
    return serializarOrcamento(result);
  });
  // Retrabalho de um projeto (erro de produção ou de entrega): as peças voltam no fluxo e o orçamento fica "Em retrabalho".
  app.post('/:id/items/:itemId/retrabalho', authenticated, async (request) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const { destino, motivo } = z.object({ destino: z.enum(['IN_PROGRESS', 'DONE']), motivo: z.string().trim().max(500).optional() }).strict().parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      await retrabalharProjeto(tx, params.id, params.itemId, destino, motivo || undefined, request.user);
      return tx.quote.findUniqueOrThrow({ where: { id: params.id }, include: incluirOrcamento(request.user) });
    });
    return serializarOrcamento(result);
  });
  app.post('/:id/duplicate', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const quote = await prisma.quote.findUnique({ where: { id }, include: { items: { include: { services: true, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' } }, cutouts: { orderBy: { sortOrder: 'asc' } } } } } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const input = { customerId: quote.customerId, validUntil: quote.validUntil, deliveryDeadline: quote.deliveryDeadline ? quote.deliveryDeadline.toISOString().slice(0, 10) : null, installationDeadline: quote.installationDeadline ? quote.installationDeadline.toISOString().slice(0, 10) : null, deadlineConfirmed: quote.deadlineConfirmed, deadlineNote: quote.deadlineNote, discountAmount: Number(quote.discountAmount), notes: quote.notes, items: quote.items.map(itemSalvoParaCopia) };
    const copy = await prisma.$transaction((tx) => criarOrcamento(tx, input, request.user)); await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE', entityId: copy.id, action: 'DUPLICATED', current: { sourceId: id, number: copy.number } } }); return reply.status(201).send(serializarOrcamento(copy));
  });
  // Exportar: o orçamento e a ordem de serviço (planta do desenho técnico ou folhas com as peças) no mesmo PDF, do orçamento todo ou de um projeto.
  async function exportarPdf(reply: FastifyReply, quote: QuoteParaExportar, options: QuotePdfOptions, arquivo: string, projetoId?: string) {
    const projetos = projetoId ? quote.items.filter((item) => item.id === projetoId) : quote.items.filter((item) => !item.declinedAt);
    const partes = { orcamento: options.commercial, valoresIndividuais: options.individualPrices, ordemServico: options.drawings, tecnicos: options.drawings ? await desenhosTecnicosParaOrdemServico(quote, projetos) : new Map() };
    if (!partes.orcamento && !partes.ordemServico) throw new AppError(422, 'Marque o orçamento ou a ordem de serviço.', 'NOTHING_TO_EXPORT');
    const pdf = novoPdfExportacao(quote, partes, projetoId); renderizarExportacao(pdf, quote, partes, projetoId); pdf.end();
    return reply.type('application/pdf').header('Content-Disposition', disposicaoArquivoPdf(arquivo)).send(pdf);
  }
  app.get('/:id/pdf', authenticated, async (request, reply) => {
    const options = quotePdfOptionsSchema.parse(request.query);
    const quote = await prisma.quote.findUnique({ where: idSchema.parse(request.params), include: incluirOrcamento(request.user) }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    return exportarPdf(reply, quote, options, nomeArquivoPdf(quote.customerNameSnapshot, quote.number));
  });
  app.get('/:id/items/:itemId/pdf', authenticated, async (request, reply) => {
    const params = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const options = quotePdfOptionsSchema.parse(request.query);
    const quote = await prisma.quote.findUnique({ where: { id: params.id }, include: incluirOrcamento(request.user) }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const item = quote.items.find((entry) => entry.id === params.itemId);
    if (!item) throw new AppError(404, 'Projeto não encontrado neste orçamento.', 'NOT_FOUND');
    return exportarPdf(reply, quote, options, nomeArquivoPdf(quote.customerNameSnapshot, `${quote.number} - ${nomeProjeto(item)}`), item.id);
  });
  // Projetos com desenho técnico (para o Exportar marcar a opção como disponível).
  app.get('/:id/desenhos-tecnicos', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const quote = await prisma.quote.findUnique({ where: { id }, select: { id: true, number: true, customerId: true, customerNameSnapshot: true, deliveryDeadline: true, dueDate: true, items: { select: { id: true, projectName: true, drawingData: true } } } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
    const desenhos = await desenhosTecnicosDosProjetos(quote, quote.items);
    return { projetos: desenhos.flatMap((desenho) => 'designId' in desenho ? [desenho.itemId] : []) };
  });
}
