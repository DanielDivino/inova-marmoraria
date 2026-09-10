import { describe, expect, it } from 'vitest';
import { canChangeQuoteStatus } from './status-rules';

describe('canChangeQuoteStatus', () => {
  it('permite apenas transições comerciais válidas', () => {
    expect(canChangeQuoteStatus('DRAFT', 'SENT')).toBe(true);
    expect(canChangeQuoteStatus('SENT', 'APPROVED')).toBe(true);
    expect(canChangeQuoteStatus('EXPIRED', 'DRAFT')).toBe(true);
  });

  it('bloqueia alteração de um orçamento já aprovado ou cancelado', () => {
    expect(canChangeQuoteStatus('APPROVED', 'DRAFT')).toBe(false);
    expect(canChangeQuoteStatus('CANCELLED', 'SENT')).toBe(false);
  });
});
