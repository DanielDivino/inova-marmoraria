import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { pageQuerySchema, sendPaged } from '../../shared/http.js';
import { requireRole } from '../auth/auth.plugin.js';

const querySchema = pageQuerySchema({ entityType: z.string().optional(), entityId: z.string().optional() });
export async function registerAuditRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate, requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const where = { ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) };
    const [data, total] = await prisma.$transaction([prisma.auditLog.findMany({ where, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), prisma.auditLog.count({ where })]);
    return sendPaged(reply, query.page, query.limit, total, data);
  });
}
