import type { FastifyInstance } from 'fastify';
import { Prisma } from '@inova/database';
import { z } from 'zod';
import { dataAtualEmpresa, type DashboardCounts, type DashboardData } from '@inova/domain';
import { prisma } from '../../config/prisma.js';
import { exigirPermissao } from '../../compartilhado/acesso.js';
import { calendarDateSchema, montarFiltrosOrcamento, dateValue } from '../orcamentos/quote.tracking.js';

const querySchema = z.object({ from: calendarDateSchema.optional(), to: calendarDateSchema.optional(), sellerId: z.string().cuid().optional() })
  .refine(value => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'A data final deve ser igual ou posterior à inicial.' });

function emptyCounts(): DashboardCounts {
  return { issued: 0, pending: 0, sold: 0, cancelled: 0, rejected: 0, expired: 0, approved: 0, production: 0, waitingMaterial: 0, pendingWork: 0, rework: 0, paused: 0, ready: 0, deliveryPending: 0, installationPending: 0, delivered: 0, overdue: 0, quotedValue: 0, soldValue: 0, conversion: 0 };
}
const stage: Record<string, keyof DashboardCounts> = {
  NOT_STARTED: 'approved', IN_PROGRESS: 'production', WAITING_MATERIAL: 'waitingMaterial', PENDING_WORK: 'pendingWork',
  REWORK: 'rework', PAUSED: 'paused', READY: 'ready', DELIVERY_PENDING: 'deliveryPending', INSTALLATION_PENDING: 'installationPending', COMPLETED: 'delivered',
};

export async function registrarRotasDashboard(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate, exigirPermissao('dashboard')] }, async (request): Promise<DashboardData> => {
    const query = querySchema.parse(request.query);
    const now = new Date();
    const where = montarFiltrosOrcamento({ ...query, page: 1, limit: 1 });
    const late = { lt: dateValue(dataAtualEmpresa(now)) };
    const overdueWhere: Prisma.QuoteWhereInput = { AND: [where, { status: 'APPROVED', executionStatus: { not: 'COMPLETED' }, OR: [
      { installationDeadline: late }, { installationDeadline: null, deliveryDeadline: late },
      { installationDeadline: null, deliveryDeadline: null, dueDate: late },
    ] }] };
    return prisma.$transaction(async (tx) => {
      const [groups, lateGroups, users, overdueQuotes] = await Promise.all([
        tx.quote.groupBy({ by: ['createdById', 'status', 'executionStatus'], where, _count: { _all: true }, _sum: { netTotal: true } }),
        tx.quote.groupBy({ by: ['createdById'], where: overdueWhere, _count: { _all: true } }),
        tx.user.findMany({ where: query.sellerId ? { id: query.sellerId } : { OR: [{ role: 'SELLER' }, { createdQuotes: { some: where } }] }, select: { id: true, name: true, role: true, isActive: true }, orderBy: { name: 'asc' } }),
        tx.quote.findMany({ where: overdueWhere, select: { id: true, number: true, customerNameSnapshot: true, netTotal: true, installationDeadline: true, deliveryDeadline: true, dueDate: true, createdBy: { select: { name: true } } }, orderBy: [{ installationDeadline: 'asc' }, { deliveryDeadline: 'asc' }, { dueDate: 'asc' }], take: 20 }),
      ]);
      const totals = emptyCounts();
      const sellers = users.map(user => ({ ...user, ...emptyCounts() }));
      const byId = new Map(sellers.map(seller => [seller.id, seller]));
      for (const row of groups) {
        const seller = byId.get(row.createdById);
        for (const target of seller ? [totals, seller] : [totals]) {
          const count = row._count._all;
          const value = Number(row._sum.netTotal ?? 0);
          target.issued += count;
          target.quotedValue = Math.round((target.quotedValue + value) * 100) / 100;
          if (row.status === 'APPROVED') {
            target.sold += count;
            target.soldValue = Math.round((target.soldValue + value) * 100) / 100;
            target[stage[row.executionStatus]] += count;
          } else if (row.status === 'CANCELLED') target.cancelled += count;
          else if (row.status === 'REJECTED') target.rejected += count;
          else if (row.status === 'EXPIRED') target.expired += count;
          else target.pending += count;
        }
      }
      for (const row of lateGroups) {
        totals.overdue += row._count._all;
        const seller = byId.get(row.createdById);
        if (seller) seller.overdue = row._count._all;
      }
      for (const target of [totals, ...sellers]) target.conversion = target.issued ? Math.round(target.sold / target.issued * 1000) / 10 : 0;
      sellers.sort((a, b) => b.soldValue - a.soldValue || a.name.localeCompare(b.name));
      return { totals, sellers, generatedAt: now.toISOString(), overdueQuotes: overdueQuotes.map(quote => ({
        id: quote.id, number: quote.number, customerName: quote.customerNameSnapshot, sellerName: quote.createdBy.name,
        deadline: (quote.installationDeadline ?? quote.deliveryDeadline ?? quote.dueDate)!.toISOString(),
        deadlineSource: quote.installationDeadline ? 'Montagem' : quote.deliveryDeadline ? 'Entrega' : 'Prazo interno', netTotal: Number(quote.netTotal),
      })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });
}
