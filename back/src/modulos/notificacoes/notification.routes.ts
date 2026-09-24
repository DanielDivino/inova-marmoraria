import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import type { FastifyInstance } from 'fastify';
import { diasUteisEntre, situacaoPrazoInterno, type DeadlineStatus } from '@inova/domain';
import { prisma } from '../../config/prisma.js';

const labels: Record<DeadlineStatus, string> = { NORMAL: 'No prazo', NEAR_DUE: 'Próximo do prazo', DUE_TODAY: 'Vence hoje', OVERDUE: 'Atrasado' };

export async function registrarRotasNotificacoes(app: FastifyInstance) {
  app.get('/deadlines', { preHandler: [app.authenticate] }, async (request) => {
    const today = new Date();
    const quotes = await prisma.quote.findMany({
      where: { ...escopoOrcamentos(request.user), status: 'APPROVED', executionStatus: { not: 'COMPLETED' }, dueDate: { not: null } },
      select: { id: true, number: true, dueDate: true, customerNameSnapshot: true, items: { select: { projectName: true }, take: 1 } },
      orderBy: { dueDate: 'asc' }
    });
    const alerts = quotes.map((quote) => {
      const dueDate = quote.dueDate!;
      const status = situacaoPrazoInterno(dueDate, today);
      return { id: quote.id, number: quote.number, customerName: quote.customerNameSnapshot, projectName: quote.items[0]?.projectName ?? null, dueDate, status, label: labels[status], businessDays: diasUteisEntre(today, dueDate) };
    }).filter((alert) => alert.status !== 'NORMAL');
    return { count: alerts.length, alerts };
  });
}
