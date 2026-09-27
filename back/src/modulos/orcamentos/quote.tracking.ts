import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { WORK_STATUSES, WORK_STATUS_STORAGE, DEADLINE_STATUSES, dataAtualEmpresa, deslocarDataCalendario, NEAR_CUSTOMER_DEADLINE_DAYS, type WorkStatus, type CustomerDeadlineStatus } from '@inova/domain';
import { schemaConsultaPaginada } from '../../compartilhado/http.js';

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.').refine(value => {
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Informe uma data válida.');
export const trackingSchema = z.object({
  deliveryDeadline: calendarDateSchema.nullable().optional(),
  installationDeadline: calendarDateSchema.nullable().optional(),
  deadlineConfirmed: z.boolean().optional(),
  deadlineNote: z.string().trim().max(500).nullable().optional(),
}).strict();
/** Ordens da lista de orçamentos; "prazo" usa o prazo final (montagem ou, sem ela, a data acordada). */
export const ORDENS_ORCAMENTO = ['recentes', 'antigos', 'prazo', 'maior-valor', 'cliente'] as const;
export type OrdemOrcamentos = typeof ORDENS_ORCAMENTO[number];
export const ORDEM_ORCAMENTOS: Record<Exclude<OrdemOrcamentos, 'prazo'>, Prisma.QuoteOrderByWithRelationInput[]> = {
  recentes: [{ createdAt: 'desc' }],
  antigos: [{ createdAt: 'asc' }],
  'maior-valor': [{ netTotal: 'desc' }, { createdAt: 'desc' }],
  cliente: [{ customerNameSnapshot: 'asc' }, { createdAt: 'desc' }],
};
type ComPrazo = { installationDeadline: Date | null; deliveryDeadline: Date | null; createdAt: Date };
const prazoFinal = (quote: ComPrazo) => (quote.installationDeadline ?? quote.deliveryDeadline)?.toISOString().slice(0, 10);
/** Prazo mais próximo primeiro; sem prazo no fim; empate pelo mais recente. */
export function compararPorPrazo(a: ComPrazo, b: ComPrazo) {
  const pa = prazoFinal(a), pb = prazoFinal(b);
  if (pa !== pb) return !pa ? 1 : !pb ? -1 : pa.localeCompare(pb);
  return b.createdAt.getTime() - a.createdAt.getTime();
}
export const historySchema = schemaConsultaPaginada({
  scope: z.enum(['active', 'history']).optional(), search: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']).optional(),
  // Uma ou mais situações separadas por vírgula (ex.: entrega e montagem pendentes juntas).
  workStatus: z.preprocess((valor) => typeof valor === 'string' ? valor.split(',').filter(Boolean) : valor, z.array(z.enum(WORK_STATUSES)).min(1).optional()), situacaoPrazoInterno: z.enum(DEADLINE_STATUSES).optional(),
  sellerId: z.string().cuid().optional(), customerId: z.string().cuid().optional(), responsibleId: z.string().cuid().optional(),
  from: calendarDateSchema.optional(), to: calendarDateSchema.optional(),
  approvedFrom: calendarDateSchema.optional(), approvedTo: calendarDateSchema.optional(),
  deliveryFrom: calendarDateSchema.optional(), deliveryTo: calendarDateSchema.optional(),
  installationFrom: calendarDateSchema.optional(), installationTo: calendarDateSchema.optional(),
  ordem: z.enum(ORDENS_ORCAMENTO).default('recentes'),
}).superRefine((value, context) => {
  for (const [from, to] of [['from', 'to'], ['approvedFrom', 'approvedTo'], ['deliveryFrom', 'deliveryTo'], ['installationFrom', 'installationTo']] as const) {
    if (value[from] && value[to] && value[from]! > value[to]!) context.addIssue({ code: 'custom', path: [to], message: 'A data final deve ser igual ou posterior à inicial.' });
  }
});
export type QuoteFilters = z.infer<typeof historySchema>;
export const dateValue = (value: string) => new Date(value + 'T00:00:00.000Z');
export function filtroStatusTrabalho(status: WorkStatus): Prisma.QuoteWhereInput {
  if (status === 'PENDING_APPROVAL') return { status: { in: ['DRAFT', 'SENT'] } };
  if (status === 'REJECTED') return { status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] } };
  return WORK_STATUS_STORAGE[status];
}
export function filtroPrazo(status: CustomerDeadlineStatus, now = new Date()): Prisma.QuoteWhereInput {
  const completed: Prisma.QuoteWhereInput = { status: 'APPROVED', executionStatus: 'COMPLETED' };
  if (status === 'COMPLETED') return completed;
  const today = dataAtualEmpresa(now);
  let range: Prisma.DateTimeNullableFilter;
  switch (status) {
    case 'WITHOUT_DEADLINE': return { AND: [{ NOT: completed }, { installationDeadline: null, deliveryDeadline: null }] };
    case 'OVERDUE': range = { lt: dateValue(today) }; break;
    case 'DUE_TODAY': range = { equals: dateValue(today) }; break;
    case 'NEAR_DEADLINE': range = { gt: dateValue(today), lte: dateValue(deslocarDataCalendario(today, NEAR_CUSTOMER_DEADLINE_DAYS)) }; break;
    case 'ON_TIME': range = { gt: dateValue(deslocarDataCalendario(today, NEAR_CUSTOMER_DEADLINE_DAYS)) }; break;
  }
  return { AND: [{ NOT: completed }, { OR: [{ installationDeadline: range }, { installationDeadline: null, deliveryDeadline: range }] }] };
}
export function montarFiltrosOrcamento(query: Omit<QuoteFilters, 'ordem'>, now = new Date()): Prisma.QuoteWhereInput {
  const conditions: Prisma.QuoteWhereInput[] = [];
  const closed: Prisma.QuoteWhereInput = { OR: [{ status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] } }, { executionStatus: 'COMPLETED' }] };
  if (query.scope === 'history') conditions.push(closed);
  if (query.scope === 'active') conditions.push({ NOT: closed });
  if (query.workStatus?.length) conditions.push({ OR: query.workStatus.map(filtroStatusTrabalho) });
  if (query.status) conditions.push({ status: query.status });
  if (query.situacaoPrazoInterno) conditions.push(filtroPrazo(query.situacaoPrazoInterno, now));
  if (query.sellerId) conditions.push({ createdById: query.sellerId });
  if (query.customerId) conditions.push({ customerId: query.customerId });
  if (query.responsibleId) conditions.push({ workerAssignments: { some: { workerId: query.responsibleId, releasedAt: null } } });
  if (query.search) conditions.push({ OR: [
    { number: { contains: query.search, mode: 'insensitive' } },
    { customer: { is: { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] } } },
    { items: { some: { projectName: { contains: query.search, mode: 'insensitive' } } } },
  ] });
  for (const [field, from, to] of [
    ['createdAt', query.from, query.to], ['approvedAt', query.approvedFrom, query.approvedTo],
    ['deliveryDeadline', query.deliveryFrom, query.deliveryTo], ['installationDeadline', query.installationFrom, query.installationTo],
  ] as const) {
    if (from || to) conditions.push({ [field]: { ...(from ? { gte: dateValue(from) } : {}), ...(to ? { lt: dateValue(deslocarDataCalendario(to, 1)) } : {}) } });
  }
  return { AND: conditions };
}
