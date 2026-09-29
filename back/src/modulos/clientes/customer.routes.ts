import { escopoClientes, escopoOrcamentos, exigirClienteProprio, exigirPermissao } from '../../compartilhado/acesso.js';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { customerSchema, customerUpdateSchema, digitsOnly, quickCustomerSchema } from './customer.schema.js';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema, schemaConsultaPaginada } from '../../compartilhado/http.js';

/** `tipo` separa os clientes cadastrados dos sem cadastro (orçamento sem cadastro); sem ele, vêm todos. */
const querySchema = schemaConsultaPaginada({ search: z.string().optional(), tipo: z.enum(['cadastrados', 'sem-cadastro']).optional() });
export async function registrarRotasClientes(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirClienteProprio] };
  app.get('/', authenticated, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const digits = digitsOnly(query.search ?? '');
    const matches = digits ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'} OR regexp_replace(COALESCE(document, ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}` : [];
    const searchWhere = query.search ? { OR: [{ id: { in: matches.map((entry) => entry.id) } }, { name: { contains: query.search, mode: 'insensitive' as const } }, { phone: { contains: query.search } }, { document: { contains: query.search } }] } : {};
    const base = { AND: [searchWhere, escopoClientes(request.user)] };
    const where = query.tipo ? { AND: [...base.AND, { isQuick: query.tipo === 'sem-cadastro' }] } : base;
    const [data, total, semCadastro, todos] = await prisma.$transaction([prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit, include: { quotes: { where: escopoOrcamentos(request.user), orderBy: { createdAt: 'desc' }, take: 1, select: { number: true, createdAt: true, status: true, items: { take: 1, orderBy: { id: 'asc' }, select: { materialNameSnapshot: true, projectName: true, components: { orderBy: { sortOrder: 'asc' }, select: { label: true, componentType: true } } } } } } } }), prisma.customer.count({ where }),
      prisma.customer.count({ where: { AND: [...base.AND, { isQuick: true }] } }), prisma.customer.count({ where: base })]);
    // Contagem das duas abas (com a mesma busca), para achar rápido os sem cadastro.
    return reply.send({ data, meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }, counts: { cadastrados: todos - semCadastro, semCadastro } });
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
    const body = request.body as { quick?: unknown } | null;
    if (body?.quick === true) {
      const input = quickCustomerSchema.parse(body); await validarContatoUnico(input);
      const name = input.name || `Sem cadastro ${await proximoNumeroSemCadastro()}`;
      return reply.status(201).send(await prisma.customer.create({ data: { ...input, name, isQuick: !input.phone, ownerId: request.user.id } }).catch(tratarConflitoContato));
    }
    const input = customerSchema.parse(body); await validarContatoUnico(input);
    return reply.status(201).send(await prisma.customer.create({ data: { ...input, ownerId: request.user.id } }).catch(tratarConflitoContato));
  });
  app.patch('/:id', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params); const input = customerUpdateSchema.parse(request.body);
    const customer = await prisma.customer.findUnique({ where: { id } }); if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND');
    await validarContatoUnico(input, id);
    // Sem cadastro (cliente rápido): ao ganhar telefone vira cadastro completo, e os orçamentos dele passam a mostrar os dados informados.
    return prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { ...input, ...(customer.isQuick && input.phone ? { isQuick: false } : {}) } });
      if (customer.isQuick) {
        await tx.quote.updateMany({ where: { customerId: id }, data: { customerNameSnapshot: updated.name, customerPhoneSnapshot: updated.phone } });
        if (updated.address) await tx.quote.updateMany({ where: { customerId: id, workAddressSnapshot: null }, data: { workAddressSnapshot: updated.address } });
      }
      return updated;
    }).catch(tratarConflitoContato);
  });
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

/** Próximo número livre para "Sem cadastro N" (orçamento sem cadastro). */
async function proximoNumeroSemCadastro() {
  const clientes = await prisma.customer.findMany({ where: { name: { startsWith: 'Sem cadastro ' } }, select: { name: true } });
  return Math.max(0, ...clientes.map(({ name }) => Number(/^Sem cadastro (\d+)$/.exec(name)?.[1] ?? 0))) + 1;
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
