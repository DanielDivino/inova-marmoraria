import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { exigirPerfil } from '../autenticacao/auth.plugin.js';

const createSchema = z.object({ name: z.string().min(2), email: z.string().email().transform((v) => v.toLowerCase()), password: z.string().min(8), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SELLER']).default('SELLER'), maxDiscountPercent: z.number().min(0).max(100).default(0) });
const updateSchema = createSchema.partial().omit({ password: true }).extend({ password: z.string().min(8).optional(), isActive: z.boolean().optional() });
const publicSelect = { id: true, name: true, email: true, role: true, isActive: true, maxDiscountPercent: true, createdAt: true } as const;

export async function registrarRotasUsuarios(app: FastifyInstance) {
  const superOnly = { preHandler: [app.authenticate, exigirPerfil('SUPER_ADMIN')] };
  app.get('/', superOnly, async () => prisma.user.findMany({ select: publicSelect, orderBy: { name: 'asc' } }));
  app.post('/', superOnly, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new AppError(409, 'Já existe um usuário com este e-mail.', 'EMAIL_IN_USE');
    const { password, ...rest } = input;
    const user = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 12) }, select: publicSelect });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'USER', entityId: user.id, action: 'CREATED', current: user } });
    return reply.status(201).send(user);
  });
  app.patch('/:id', superOnly, async (request) => {
    const { id } = idSchema.parse(request.params); const input = updateSchema.parse(request.body);
    const before = await prisma.user.findUnique({ where: { id }, select: publicSelect });
    if (!before) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');
    if (id === request.user.id && (input.isActive === false || (input.role && input.role !== 'SUPER_ADMIN'))) throw new AppError(409, 'Você não pode desativar ou remover seu próprio acesso de super administrador.', 'SELF_ACCESS_CHANGE');
    if (input.email && input.email !== before.email && await prisma.user.findUnique({ where: { email: input.email } })) throw new AppError(409, 'Já existe um usuário com este e-mail.', 'EMAIL_IN_USE');
    const { password, ...rest } = input;
    const user = await prisma.user.update({ where: { id }, data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) }, select: publicSelect });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'USER', entityId: id, action: 'UPDATED', previous: before, current: user } });
    return user;
  });
}
