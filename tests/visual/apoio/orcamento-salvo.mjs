// Orçamento salvo mínimo, para a tela do orçamento que abre depois de salvar (API simulada).
export const orcamentoSalvo = (id, extra = {}) => ({
  id, number: 'ORC-2026-99', customerId: 'cliente-teste', createdAt: '2026-09-30T14:00:00.000Z', status: 'SENT', executionStatus: 'NOT_STARTED',
  validUntil: '2026-10-14T00:00:00.000Z', deadlineConfirmed: false, notes: null, customerNameSnapshot: 'Cliente de teste', customerPhoneSnapshot: null,
  discountAmount: 0, grossTotal: 0, netTotal: 0, workerAssignments: [], items: [], ...extra,
});
