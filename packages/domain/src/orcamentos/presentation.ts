import { diasUteisEntre, situacaoPrazoInterno } from './deadline-rules.js';

export type StatusTone = 'neutral' | 'red' | 'yellow' | 'green' | 'purple' | 'blue';
export type StatusBadge = { label: string; tone: StatusTone };
export const QUOTE_STATUS_LABELS: Record<string, StatusBadge> = {
  DRAFT: { label: 'Em elaboração', tone: 'neutral' },
  SENT: { label: 'Aguardando aprovação', tone: 'neutral' },
  APPROVED: { label: 'Aprovado', tone: 'green' },
  REJECTED: { label: 'Não aprovado', tone: 'red' },
  EXPIRED: { label: 'Validade encerrada', tone: 'red' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};
export const EXECUTION_STATUS_LABELS: Record<string, StatusBadge> = {
  NOT_STARTED: { label: 'Não iniciado', tone: 'neutral' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'yellow' },
  COMPLETED: { label: 'Entregue', tone: 'purple' },
  REWORK: { label: 'Em retrabalho', tone: 'blue' },
};
export const STATUS_LEGEND: StatusBadge[] = [
  { label: 'Fora do prazo', tone: 'red' },
  EXECUTION_STATUS_LABELS.IN_PROGRESS,
  QUOTE_STATUS_LABELS.APPROVED,
  EXECUTION_STATUS_LABELS.COMPLETED,
  EXECUTION_STATUS_LABELS.REWORK,
];
export type QuoteProgress = { status: string; executionStatus?: string | null; dueDate?: string | Date | null; validUntil?: string | Date | null };
export function orcamentoEncerrado(quote: QuoteProgress) {
  return ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(quote.status) || quote.executionStatus === 'COMPLETED';
}

export function podeEditarOrcamento(quote: QuoteProgress) {
  return ['DRAFT', 'SENT', 'APPROVED'].includes(quote.status) && !orcamentoEncerrado(quote);
}
export function apresentacaoPrazo(value?: string | Date | null, now = new Date()): (StatusBadge & { description: string }) | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T12:00:00` : value) : value;
  if (!Number.isFinite(date.getTime())) return null;
  const status = situacaoPrazoInterno(date, now);
  const days = Math.abs(diasUteisEntre(now, date));
  const duration = `${days} ${days === 1 ? 'dia útil' : 'dias úteis'}`;
  if (status === 'OVERDUE') return { label: 'Fora do prazo', tone: 'red', description: days ? `Atrasado há ${duration}` : 'Data limite ultrapassada' };
  if (status === 'DUE_TODAY') return { label: 'Vence hoje', tone: 'yellow', description: 'Entrega prevista para hoje' };
  return { label: status === 'NEAR_DUE' ? 'Próximo do prazo' : 'Dentro do prazo', tone: status === 'NEAR_DUE' ? 'yellow' : 'neutral', description: `Faltam ${duration}` };
}
export function indicadoresOrcamento(quote: QuoteProgress, now = new Date()): StatusBadge[] {
  const badges = [QUOTE_STATUS_LABELS[quote.status] ?? { label: 'Status não informado', tone: 'neutral' as const }];
  if (quote.status === 'APPROVED' && quote.executionStatus && quote.executionStatus !== 'NOT_STARTED') {
    const execution = EXECUTION_STATUS_LABELS[quote.executionStatus];
    if (execution) badges.push(execution);
  }
  if (!orcamentoEncerrado(quote)) {
    const deadline = apresentacaoPrazo(quote.status === 'APPROVED' ? quote.dueDate : quote.validUntil, now);
    if (deadline?.tone === 'red') badges.push(deadline);
  }
  return badges;
}
