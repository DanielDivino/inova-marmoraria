import { exigirPermissao } from '../../compartilhado/acesso.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { exigirPerfil } from '../autenticacao/auth.plugin.js';

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optionalText = z.preprocess(emptyToNull, z.string().max(120).nullable().optional());
const workColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Escolha uma cor válida.');
const workerSchema = z.object({
  name: optionalText,
  cpf: optionalText,
  phone: optionalText,
  workColor: workColor.default('#607453'),
  isActive: z.boolean().default(true),
});
const updateSchema = workerSchema.partial();
const select = { id: true, name: true, cpf: true, phone: true, workColor: true, isActive: true, createdAt: true } as const;

export async function registrarRotasFuncionarios(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirPermissao('team')] };
  const superOnly = { preHandler: [app.authenticate, exigirPerfil('SUPER_ADMIN')] };

  app.get('/', authenticated, async (request) => {
    const query = z.object({ active: z.enum(['true', 'false', 'all']).default('all') }).parse(request.query);
    const where = query.active === 'all' ? {} : { isActive: query.active === 'true' };
    return prisma.worker.findMany({ where, select, orderBy: { name: 'asc' } });
  });

  app.post('/', superOnly, async (request, reply) => {
    const input = workerSchema.parse(request.body);
    const worker = await prisma.worker.create({ data: input, select });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'WORKER', entityId: worker.id, action: 'CREATED', current: worker } });
    return reply.status(201).send(worker);
  });

  app.patch('/:id', superOnly, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = updateSchema.parse(request.body);
    const before = await prisma.worker.findUnique({ where: { id }, select });
    if (!before) throw new AppError(404, 'Funcionário não encontrado.', 'NOT_FOUND');
    const worker = await prisma.worker.update({ where: { id }, data: input, select });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'WORKER', entityId: id, action: 'UPDATED', previous: before, current: worker } });
    return worker;
  });
}
