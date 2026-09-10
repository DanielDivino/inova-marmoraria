import { addBusinessDays, businessDaysBetween, deadlineStatus } from './deadline-rules';
import { describe, expect, it } from 'vitest';

describe('project deadline rules', () => {
  it('skips Saturday and Sunday when adding business days', () => {
    expect(addBusinessDays(new Date(2026, 8, 4), 1).toDateString()).toBe(new Date(2026, 8, 7).toDateString());
  });
  it('classifies approaching, due and overdue deadlines', () => {
    const monday = new Date(2026, 8, 7);
    expect(businessDaysBetween(monday, new Date(2026, 8, 9))).toBe(2);
    expect(deadlineStatus(new Date(2026, 8, 9), monday)).toBe('NEAR_DUE');
    expect(deadlineStatus(monday, monday)).toBe('DUE_TODAY');
    expect(deadlineStatus(new Date(2026, 8, 4), monday)).toBe('OVERDUE');
  });
});
