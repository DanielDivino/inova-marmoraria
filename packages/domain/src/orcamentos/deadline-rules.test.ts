import { adicionarDiasUteis, diasUteisEntre, situacaoPrazoInterno } from './deadline-rules';
import { describe, expect, it } from 'vitest';

describe('project deadline rules', () => {
  it('skips Saturday and Sunday when adding business days', () => {
    expect(adicionarDiasUteis(new Date(2026, 8, 4), 1).toDateString()).toBe(new Date(2026, 8, 7).toDateString());
  });
  it('classifies approaching, due and overdue deadlines', () => {
    const monday = new Date(2026, 8, 7);
    expect(diasUteisEntre(monday, new Date(2026, 8, 9))).toBe(2);
    expect(situacaoPrazoInterno(new Date(2026, 8, 9), monday)).toBe('NEAR_DUE');
    expect(situacaoPrazoInterno(monday, monday)).toBe('DUE_TODAY');
    expect(situacaoPrazoInterno(new Date(2026, 8, 4), monday)).toBe('OVERDUE');
  });
});
