export type DeadlineStatus = 'NORMAL' | 'NEAR_DUE' | 'DUE_TODAY' | 'OVERDUE';

export const DEFAULT_PROJECT_BUSINESS_DAYS = 15;
export const NEAR_DUE_BUSINESS_DAYS = 3;

export function isBusinessDay(date: Date, holidays: ReadonlySet<string> = new Set()) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !holidays.has(date.toISOString().slice(0, 10));
}

export function addBusinessDays(start: Date, days: number, holidays: ReadonlySet<string> = new Set()) {
  const result = new Date(start);
  let added = 0;
  while (added < days) { result.setDate(result.getDate() + 1); if (isBusinessDay(result, holidays)) added += 1; }
  return result;
}

export function businessDaysBetween(from: Date, to: Date, holidays: ReadonlySet<string> = new Set()) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new RangeError('Data de prazo inválida.');
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let count = 0;
  const step = cursor <= end ? 1 : -1;
  while (cursor.getTime() !== end.getTime()) { cursor.setDate(cursor.getDate() + step); if (isBusinessDay(cursor, holidays)) count += step; }
  return count;
}

export function deadlineStatus(dueDate: Date, now = new Date(), nearDays = NEAR_DUE_BUSINESS_DAYS, holidays: ReadonlySet<string> = new Set()): DeadlineStatus {
  const remaining = businessDaysBetween(now, dueDate, holidays);
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (dueDay < today) return 'OVERDUE';
  if (dueDay === today) return 'DUE_TODAY';
  if (remaining <= nearDays) return 'NEAR_DUE';
  return 'NORMAL';
}
