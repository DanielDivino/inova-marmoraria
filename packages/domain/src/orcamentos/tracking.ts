/** Production stages reuse Quote.status + Quote.executionStatus; no parallel persisted status. */
export const WORK_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'WAITING_MATERIAL', 'PENDING_WORK', 'REWORK', 'READY', 'DELIVERY_PENDING', 'INSTALLATION_PENDING', 'DELIVERED', 'REJECTED'] as const;
export type WorkStatus = typeof WORK_STATUSES[number];
export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  PENDING_APPROVAL: 'Aguardando aprovação', APPROVED: 'Aprovado', IN_PRODUCTION: 'Em produção',
  WAITING_MATERIAL: 'Aguardando material', PENDING_WORK: 'Falta fazer', REWORK: 'Retrabalho',
  READY: 'Pronto', DELIVERY_PENDING: 'Entrega pendente', INSTALLATION_PENDING: 'Montagem pendente',
  DELIVERED: 'Entregue', REJECTED: 'Não aprovado',
};
export const WORK_STATUS_TONES: Record<WorkStatus, 'neutral' | 'green' | 'yellow' | 'red'> = {
  PENDING_APPROVAL: 'neutral', APPROVED: 'green', IN_PRODUCTION: 'yellow', WAITING_MATERIAL: 'yellow',
  PENDING_WORK: 'yellow', REWORK: 'red', READY: 'green', DELIVERY_PENDING: 'yellow',
  INSTALLATION_PENDING: 'yellow', DELIVERED: 'green', REJECTED: 'red',
};
export const EXECUTION_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'REWORK', 'WAITING_MATERIAL', 'PENDING_WORK', 'READY', 'DELIVERY_PENDING', 'INSTALLATION_PENDING'] as const;
export type ExecutionStage = typeof EXECUTION_STATUSES[number];
export const WORK_STATUS_STORAGE: Record<WorkStatus, { status: 'SENT' | 'APPROVED' | 'REJECTED'; executionStatus: ExecutionStage }> = {
  PENDING_APPROVAL: { status: 'SENT', executionStatus: 'NOT_STARTED' },
  APPROVED: { status: 'APPROVED', executionStatus: 'NOT_STARTED' },
  IN_PRODUCTION: { status: 'APPROVED', executionStatus: 'IN_PROGRESS' },
  WAITING_MATERIAL: { status: 'APPROVED', executionStatus: 'WAITING_MATERIAL' },
  PENDING_WORK: { status: 'APPROVED', executionStatus: 'PENDING_WORK' },
  REWORK: { status: 'APPROVED', executionStatus: 'REWORK' },
  READY: { status: 'APPROVED', executionStatus: 'READY' },
  DELIVERY_PENDING: { status: 'APPROVED', executionStatus: 'DELIVERY_PENDING' },
  INSTALLATION_PENDING: { status: 'APPROVED', executionStatus: 'INSTALLATION_PENDING' },
  DELIVERED: { status: 'APPROVED', executionStatus: 'COMPLETED' },
  REJECTED: { status: 'REJECTED', executionStatus: 'NOT_STARTED' },
};
export type QuoteTracking = {
  status: string; executionStatus?: string | null;
  deliveryDeadline?: string | Date | null; installationDeadline?: string | Date | null;
  deadlineConfirmed?: boolean; deadlineNote?: string | null;
};
export function obterStatusTrabalho(quote: QuoteTracking): WorkStatus {
  if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(quote.status)) return 'REJECTED';
  if (quote.status !== 'APPROVED') return 'PENDING_APPROVAL';
  return WORK_STATUSES.find(key => WORK_STATUS_STORAGE[key].status === 'APPROVED' && WORK_STATUS_STORAGE[key].executionStatus === (quote.executionStatus || 'NOT_STARTED')) ?? 'APPROVED';
}
export const DEADLINE_STATUSES = ['WITHOUT_DEADLINE', 'ON_TIME', 'NEAR_DEADLINE', 'DUE_TODAY', 'OVERDUE', 'COMPLETED'] as const;
export type CustomerDeadlineStatus = typeof DEADLINE_STATUSES[number];
export const DEADLINE_LABELS: Record<CustomerDeadlineStatus, string> = {
  WITHOUT_DEADLINE: 'Sem prazo', ON_TIME: 'No prazo', NEAR_DEADLINE: 'Próximo do prazo',
  DUE_TODAY: 'Vence hoje', OVERDUE: 'Atrasado', COMPLETED: 'Finalizado',
};
export const DEADLINE_TONES: Record<CustomerDeadlineStatus, 'neutral' | 'green' | 'yellow' | 'red'> = {
  WITHOUT_DEADLINE: 'neutral', ON_TIME: 'green', NEAR_DEADLINE: 'yellow', DUE_TODAY: 'yellow', OVERDUE: 'red', COMPLETED: 'green',
};
export const NEAR_CUSTOMER_DEADLINE_DAYS = 3;
export const BUSINESS_TIME_ZONE = 'America/Manaus';
/** Calendar date stored as DATE, never converted to the viewer's timezone. */
export function dataCalendario(value: string | Date): string { return (value instanceof Date ? value.toISOString() : value).slice(0, 10); }
export function dataAtualEmpresa(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function deslocarDataCalendario(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00.000Z'); value.setUTCDate(value.getUTCDate() + days); return dataCalendario(value);
}
export function prazoEfetivo(quote: QuoteTracking) { return quote.installationDeadline || quote.deliveryDeadline || null; }
export function obterStatusPrazo(quote: QuoteTracking, now = new Date()): CustomerDeadlineStatus {
  if (obterStatusTrabalho(quote) === 'DELIVERED') return 'COMPLETED';
  const deadline = prazoEfetivo(quote);
  if (!deadline) return 'WITHOUT_DEADLINE';
  const day = dataCalendario(deadline), today = dataAtualEmpresa(now);
  if (day < today) return 'OVERDUE';
  if (day === today) return 'DUE_TODAY';
  return day <= deslocarDataCalendario(today, NEAR_CUSTOMER_DEADLINE_DAYS) ? 'NEAR_DEADLINE' : 'ON_TIME';
}
