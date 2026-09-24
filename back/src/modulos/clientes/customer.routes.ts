import { escopoClientes, escopoOrcamentos, exigirClienteProprio, exigirPermissao } from '../../compartilhado/acesso.js';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { customerSchema, digitsOnly } from './customer.schema.js';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema, schemaConsultaPaginada, enviarPaginado } from '../../compartilhado/http.js';

const querySchema = schemaConsultaPaginada({ search: z.string().optional() });
export async function registrarRotasClientes(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirClienteProprio] };
  app.get('/', authenticated, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const digits = digitsOnly(query.search ?? '');
    const matches = digits ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'} OR regexp_replace(COALESCE(document, ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}` : [];
    const searchWhere = query.search ? { OR: [{ id: { in: matches.map((entry) => entry.id) } }, { name: { contains: query.search, mode: 'insensitive' as const } }, { phone: { contains: query.search } }, { document: { contains: query.search } }] } : {};
    const where = { AND: [searchWhere, escopoClientes(request.user)] };
    const [data, total] = await prisma.$transaction([prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit, include: { quotes: { where: escopoOrcamentos(request.user), orderBy: { createdAt: 'desc' }, take: 1, select: { number: true, createdAt: true, status: true, items: { take: 1, select: { materialNameSnapshot: true, productType: { select: { name: true } } } } } } } }), prisma.customer.count({ where })]);
    return enviarPaginado(reply, query.page, query.limit, total, data);
  });
  app.get('/:id/quotes', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND');
    const quotes = await prisma.quote.findMany({ where: { customerId: id, ...escopoOrcamentos(request.user) }, orderBy: { createdAt: 'desc' }, include: { items: { include: { productType: true, material: true, components: { orderBy: { sortOrder: 'asc' } } } } } });
    return quotes.map((quote) => ({ ...quote, discountAmount: Number(quote.discountAmount), grossTotal: Number(quote.grossTotal), netTotal: Number(quote.netTotal), items: quote.items.map((item) => ({ ...item, unitPriceSnapshot: Number(item.unitPriceSnapshot), billedQuantity: Number(item.billedQuantity), materialSubtotal: Number(item.materialSubtotal), servicesSubtotal: Number(item.servicesSubtotal), total: Number(item.total), components: item.components.map((component) => ({ ...component, billableArea: Number(component.billableArea), subtotal: Number(component.subtotal) })) })) }));
  });
  app.get('/:id', authenticated, async (request) => { const customer = await prisma.customer.findUnique({ where: idSchema.parse(request.params), include: { owner: { select: { id: true, name: true } }, _count: { select: { quotes: { where: escopoOrcamentos(request.user) } } } } }); if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND'); return customer; });
  app.post('/', authenticated, async (request, reply) => {
    const input = customerSchema.parse(request.body); await validarContatoUnico(input);
    return reply.status(201).send(await prisma.customer.create({ data: { ...input, ownerId: request.user.id } }).catch(tratarConflitoContato));
  });
  app.patch('/:id', authenticated, async (request) => { const { id } = idSchema.parse(request.params); const input = customerSchema.partial().parse(request.body); const customer = await prisma.customer.findUnique({ where: { id } }); if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND'); await validarContatoUnico(input, id); return prisma.customer.update({ where: { id }, data: input }).catch(tratarConflitoContato); });
  app.patch('/:id/owner', { preHandler: [app.authenticate, exigirPermissao('administration')] }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const { ownerId } = z.object({ ownerId: z.string().cuid().nullable() }).strict().parse(request.body);
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND');
    if (ownerId && !await prisma.user.findFirst({ where: { id: ownerId, isActive: true }, select: { id: true } })) throw new AppError(422, 'Responsável indisponível.', 'OWNER_UNAVAILABLE');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { ownerId }, include: { owner: { select: { id: true, name: true } } } });
      await tx.auditLog.create({ data: { userId: request.user.id, entityType: 'CUSTOMER', entityId: id, action: 'OWNER_CHANGED', previous: { ownerId: customer.ownerId }, current: { ownerId } } });
      return updated;
    });
  });
}

function tratarConflitoContato(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'Já existe cliente com este telefone.', 'PHONE_IN_USE');
  throw error;
}
async function validarContatoUnico(input: { phone?: string; document?: string | null }, excludeId = '') {
  const phone = input.phone ? digitsOnly(input.phone) : '';
  const document = input.document ? digitsOnly(input.document) : '';
  if (!phone && !document) return;
  const duplicates = await prisma.$queryRaw<{ id: string; phone: string }[]>`SELECT id, phone FROM "Customer" WHERE id <> ${excludeId} AND ((${phone} <> '' AND regexp_replace(phone, '[^0-9]', '', 'g') = ${phone}) OR (${document} <> '' AND regexp_replace(COALESCE(document, ''), '[^0-9]', '', 'g') = ${document})) LIMIT 1`;
  if (duplicates.length) throw new AppError(409, phone && digitsOnly(duplicates[0].phone) === phone ? 'Já existe cliente com este telefone.' : 'Já existe cliente com este CPF.', 'CONTACT_IN_USE');
}
