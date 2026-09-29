import type { FastifyInstance } from 'fastify';
import { exigirPermissao } from '../../compartilhado/acesso.js';
import { idSchema } from '../../compartilhado/http.js';
import { prisma } from '../../config/prisma.js';
import { faltaMaterialSchema, listarProjetosFluxo, marcarFaltaMaterial, moverProjeto, moverProjetoSchema } from './workflow.service.js';

export async function registrarRotasFluxo(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirPermissao('commercial')] };

  app.get('/projects', authenticated, async (request) => listarProjetosFluxo(prisma, request.user));

  app.patch('/projects/:id/move', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = moverProjetoSchema.parse(request.body);
    const { card, previousStatus } = await prisma.$transaction((tx) => moverProjeto(tx, id, input, request.user));
    // Reordenar na mesma coluna é frequente e não é auditado; a troca de coluna é.
    if (previousStatus !== card.status) await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: card.projectId, action: 'WORKFLOW_STATUS_CHANGED', previous: { status: previousStatus, cardId: id }, current: { status: card.status, quoteId: card.quote.id, cardId: card.id, ...(input.pieces ? { pieces: input.pieces } : {}) } } });
    return card;
  });

  app.patch('/projects/:id/material', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = faltaMaterialSchema.parse(request.body);
    const { card, previous } = await prisma.$transaction((tx) => marcarFaltaMaterial(tx, id, input, request.user));
    if (previous !== card.materialMissing) await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'QUOTE_ITEM', entityId: card.projectId, action: 'WORKFLOW_MATERIAL_CHANGED', previous: { materialMissing: previous }, current: { materialMissing: card.materialMissing, quoteId: card.quote.id, cardId: card.id } } });
    return card;
  });
}
