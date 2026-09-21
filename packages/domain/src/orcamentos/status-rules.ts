export type StatusOrcamento = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

const transitions: Record<StatusOrcamento, StatusOrcamento[]> = {
  DRAFT: ['SENT', 'APPROVED', 'REJECTED', 'CANCELLED'],
  SENT: ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: ['DRAFT', 'CANCELLED'],
  CANCELLED: []
};

export function podeAlterarStatusOrcamento(from: StatusOrcamento, to: StatusOrcamento) {
  return transitions[from].includes(to);
}
