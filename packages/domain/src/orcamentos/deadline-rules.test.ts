import { adicionarDiasUteis, diasUteisEntre, situacaoPrazoInterno } from './deadline-rules';
import { describe, expect, it } from 'vitest';
import { validadeOrcamento } from './tracking';

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
  it('orçamento vale 10 dias úteis a partir da emissão, no dia da empresa', () => {
    // Terça, 29/09/2026 às 10h em Manaus: 10 dias úteis depois é terça, 13/10.
    expect(validadeOrcamento(new Date('2026-09-29T14:00:00Z'))).toBe('2026-10-13');
    // Sexta à noite em Manaus (já sábado em UTC) ainda conta a partir da sexta.
    expect(validadeOrcamento(new Date('2026-10-03T02:30:00Z'))).toBe('2026-10-16');
    // Emitido no sábado: os dias úteis começam na segunda.
    expect(validadeOrcamento(new Date('2026-10-03T15:00:00Z'))).toBe('2026-10-16');
  });
});
