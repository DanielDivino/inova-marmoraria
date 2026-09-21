import { describe, expect, it } from 'vitest';
import { obterStatusPrazo, obterStatusTrabalho, WORK_STATUS_LABELS } from './tracking';

describe('acompanhamento do orçamento', () => {
  const base = { status: 'APPROVED', executionStatus: 'IN_PROGRESS', deliveryDeadline: '2026-09-25' };
  it('classifica prazo futuro, próximo, hoje e vencido sem horário', () => {
    expect(obterStatusPrazo(base, new Date('2026-09-20T23:59:00Z'))).toBe('ON_TIME');
    expect(obterStatusPrazo(base, new Date('2026-09-22T23:59:00Z'))).toBe('NEAR_DEADLINE');
    expect(obterStatusPrazo(base, new Date('2026-09-25T23:59:00Z'))).toBe('DUE_TODAY');
    expect(obterStatusPrazo(base, new Date('2026-09-26T05:01:00Z'))).toBe('OVERDUE');
  });
  it('encerra a situação do prazo quando o trabalho foi entregue', () => {
    expect(obterStatusPrazo({ ...base, executionStatus: 'COMPLETED' }, new Date('2026-10-01'))).toBe('COMPLETED');
  });
  it('separa status do trabalho da situação do prazo', () => {
    expect(obterStatusTrabalho({ status: 'APPROVED', executionStatus: 'WAITING_MATERIAL' })).toBe('WAITING_MATERIAL');
    expect(WORK_STATUS_LABELS[obterStatusTrabalho({ status: 'REJECTED' })]).toBe('Não aprovado');
  });
});
