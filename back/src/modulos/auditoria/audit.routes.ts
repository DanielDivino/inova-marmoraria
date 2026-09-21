import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { schemaConsultaPaginada, enviarPaginado } from '../../compartilhado/http.js';
import { exigirPerfil } from '../autenticacao/auth.plugin.js';

const querySchema = schemaConsultaPaginada({ entityType: z.string().optional(), entityId: z.string().optional() });
export async function registrarRotasAuditoria(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate, exigirPerfil('SUPER_ADMIN')] }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const where = { ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) };
    const [data, total] = await prisma.$transaction([prisma.auditLog.findMany({ where, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), prisma.auditLog.count({ where })]);
    return enviarPaginado(reply, query.page, query.limit, total, data);
  });
}
