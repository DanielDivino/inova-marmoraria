export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

const transitions: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'APPROVED', 'REJECTED', 'CANCELLED'],
  SENT: ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: ['DRAFT', 'CANCELLED'],
  CANCELLED: []
};

export function canChangeQuoteStatus(from: QuoteStatus, to: QuoteStatus) {
  return transitions[from].includes(to);
}
