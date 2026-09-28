import { describe, expect, it } from 'vitest';
import { podeAlterarStatusOrcamento } from './status-rules';

describe('canChangeQuoteStatus', () => {
  it('permite apenas transições comerciais válidas', () => {
    expect(podeAlterarStatusOrcamento('DRAFT', 'SENT')).toBe(true);
    expect(podeAlterarStatusOrcamento('SENT', 'APPROVED')).toBe(true);
    expect(podeAlterarStatusOrcamento('EXPIRED', 'DRAFT')).toBe(true);
  });

  it('bloqueia alteração de um orçamento já aprovado ou cancelado; aprovado só pode ir para cancelado (cliente desistiu)', () => {
    expect(podeAlterarStatusOrcamento('APPROVED', 'DRAFT')).toBe(false);
    expect(podeAlterarStatusOrcamento('APPROVED', 'REJECTED')).toBe(false);
    expect(podeAlterarStatusOrcamento('APPROVED', 'CANCELLED')).toBe(true);
    expect(podeAlterarStatusOrcamento('CANCELLED', 'SENT')).toBe(false);
  });
});
