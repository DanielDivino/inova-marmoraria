import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import type { FastifyInstance } from 'fastify';
import { diasUteisEntre, situacaoPrazoInterno, type DeadlineStatus } from '@inova/domain';
import { prisma } from '../../config/prisma.js';

const labels: Record<DeadlineStatus, string> = { NORMAL: 'No prazo', NEAR_DUE: 'Próximo do prazo', DUE_TODAY: 'Vence hoje', OVERDUE: 'Atrasado' };

export async function registrarRotasNotificacoes(app: FastifyInstance) {
  app.get('/deadlines', { preHandler: [app.authenticate] }, async (request) => {
    const today = new Date();
    const quotes = await prisma.quote.findMany({
      where: { ...escopoOrcamentos(request.user), status: 'APPROVED', executionStatus: { not: 'COMPLETED' }, OR: [{ deliveryDeadline: { not: null } }, { dueDate: { not: null } }, { items: { some: { declinedAt: null, deliveryDeadline: { not: null } } } }] },
      select: { id: true, number: true, dueDate: true, deliveryDeadline: true, customerNameSnapshot: true, items: { where: { declinedAt: null }, select: { id: true, projectName: true, deliveryDeadline: true }, orderBy: { id: 'asc' } } },
      orderBy: { dueDate: 'asc' }
    });
    const alerts = quotes.flatMap((quote) => {
      const projetosComPrazo = quote.items.filter((item) => item.deliveryDeadline);
      const prazos = projetosComPrazo.length
        ? projetosComPrazo.map((item) => ({ projectId: item.id, projectName: item.projectName, dueDate: item.deliveryDeadline! }))
        : [{ projectId: null, projectName: quote.items[0]?.projectName ?? null, dueDate: quote.deliveryDeadline ?? quote.dueDate! }];
      return prazos.map(({ projectId, projectName, dueDate }) => {
        const status = situacaoPrazoInterno(dueDate, today);
        return { id: quote.id, projectId, number: quote.number, customerName: quote.customerNameSnapshot, projectName, dueDate, status, label: labels[status], businessDays: diasUteisEntre(today, dueDate) };
      }).filter((alert) => alert.status !== 'NORMAL');
    }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return { count: alerts.length, alerts };
  });
}
