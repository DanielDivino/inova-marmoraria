import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { customerSchema, digitsOnly } from './customer.schema.js';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema, pageQuerySchema, sendPaged } from '../../shared/http.js';

const querySchema = pageQuerySchema({ search: z.string().optional() });
export async function registerCustomerRoutes(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  app.get('/', authenticated, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const digits = digitsOnly(query.search ?? '');
    const matches = digits ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'} OR regexp_replace(COALESCE(document, ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}` : [];
    const where = query.search ? { OR: [{ id: { in: matches.map((entry) => entry.id) } }, { name: { contains: query.search, mode: 'insensitive' as const } }, { phone: { contains: query.search } }, { document: { contains: query.search } }] } : {};
    const [data, total] = await prisma.$transaction([prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit, include: { quotes: { orderBy: { createdAt: 'desc' }, take: 1, select: { number: true, createdAt: true, status: true, items: { take: 1, select: { materialNameSnapshot: true, productType: { select: { name: true } } } } } } } }), prisma.customer.count({ where })]);
    return sendPaged(reply, query.page, query.limit, total, data);
  });
  app.get('/:id/quotes', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND');
    const quotes = await prisma.quote.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, include: { items: { include: { productType: true, material: true, components: { orderBy: { sortOrder: 'asc' } } } } } });
    return quotes.map((quote) => ({ ...quote, discountAmount: Number(quote.discountAmount), grossTotal: Number(quote.grossTotal), netTotal: Number(quote.netTotal), items: quote.items.map((item) => ({ ...item, unitPriceSnapshot: Number(item.unitPriceSnapshot), billedQuantity: Number(item.billedQuantity), materialSubtotal: Number(item.materialSubtotal), servicesSubtotal: Number(item.servicesSubtotal), total: Number(item.total), components: item.components.map((component) => ({ ...component, billableArea: Number(component.billableArea), subtotal: Number(component.subtotal) })) })) }));
  });
  app.get('/:id', authenticated, async (request) => { const customer = await prisma.customer.findUnique({ where: idSchema.parse(request.params), include: { _count: { select: { quotes: true } } } }); if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND'); return customer; });
  app.post('/', authenticated, async (request, reply) => {
    const input = customerSchema.parse(request.body); await assertUniqueContact(input);
    return reply.status(201).send(await prisma.customer.create({ data: input }).catch(contactConflict));
  });
  app.patch('/:id', authenticated, async (request) => { const { id } = idSchema.parse(request.params); const input = customerSchema.partial().parse(request.body); const customer = await prisma.customer.findUnique({ where: { id } }); if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND'); await assertUniqueContact(input, id); return prisma.customer.update({ where: { id }, data: input }).catch(contactConflict); });
}

function contactConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'Já existe cliente com este telefone.', 'PHONE_IN_USE');
  throw error;
}
async function assertUniqueContact(input: { phone?: string; document?: string | null }, excludeId = '') {
  const phone = input.phone ? digitsOnly(input.phone) : '';
  const document = input.document ? digitsOnly(input.document) : '';
  if (!phone && !document) return;
  const duplicates = await prisma.$queryRaw<{ id: string; phone: string }[]>`SELECT id, phone FROM "Customer" WHERE id <> ${excludeId} AND ((${phone} <> '' AND regexp_replace(phone, '[^0-9]', '', 'g') = ${phone}) OR (${document} <> '' AND regexp_replace(COALESCE(document, ''), '[^0-9]', '', 'g') = ${document})) LIMIT 1`;
  if (duplicates.length) throw new AppError(409, phone && digitsOnly(duplicates[0].phone) === phone ? 'Já existe cliente com este telefone.' : 'Já existe cliente com este CPF.', 'CONTACT_IN_USE');
}
