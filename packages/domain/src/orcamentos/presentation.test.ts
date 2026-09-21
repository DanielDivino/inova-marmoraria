import { describe, expect, it } from 'vitest';
import { diasUteisEntre, situacaoPrazoInterno } from './deadline-rules';
import { apresentacaoPrazo, indicadoresOrcamento, orcamentoEncerrado } from './presentation';

const monday = new Date(2026, 8, 7, 12);
describe('cores e agrupamento de projetos', () => {
  it('mantém aprovação verde e execução amarela, sinalizando atraso separadamente', () => {
    expect(indicadoresOrcamento({ status: 'APPROVED', executionStatus: 'IN_PROGRESS', dueDate: new Date(2026, 8, 4) }, monday).map((badge) => badge.tone)).toEqual(['green', 'yellow', 'red']);
  });
  it('entregues ficam roxos e encerrados, sem alerta de atraso antigo', () => {
    const quote = { status: 'APPROVED', executionStatus: 'COMPLETED', dueDate: new Date(2026, 8, 1) };
    expect(indicadoresOrcamento(quote, monday).map((badge) => badge.tone)).toEqual(['green', 'purple']);
    expect(orcamentoEncerrado(quote)).toBe(true);
  });
  it('retrabalho é azul e volta para a área operacional', () => {
    const quote = { status: 'APPROVED', executionStatus: 'REWORK' };
    expect(indicadoresOrcamento(quote, monday)).toContainEqual({ label: 'Em retrabalho', tone: 'blue' });
    expect(orcamentoEncerrado(quote)).toBe(false);
  });
  it('preserva os status legados e identifica validade ultrapassada', () => {
    expect(indicadoresOrcamento({ status: 'DRAFT' }, monday)[0].label).toBe('Em elaboração');
    expect(indicadoresOrcamento({ status: 'SENT', validUntil: new Date(2026, 8, 4) }, monday)).toHaveLength(2);
    for (const status of ['REJECTED', 'CANCELLED', 'EXPIRED']) expect(orcamentoEncerrado({ status })).toBe(true);
  });
  it('datas ausentes ou inválidas não bloqueiam a tela nem geram alertas falsos', () => {
    expect(apresentacaoPrazo('inválida', monday)).toBeNull();
    expect(apresentacaoPrazo(null, monday)).toBeNull();
    expect(() => diasUteisEntre(monday, new Date('invalid'))).toThrow('Data de prazo inválida');
  });
  it('não classifica como vencendo hoje um prazo encerrado no fim de semana', () => {
    expect(situacaoPrazoInterno(new Date(2026, 8, 4), new Date(2026, 8, 5))).toBe('OVERDUE');
    expect(situacaoPrazoInterno(new Date(2026, 8, 6), new Date(2026, 8, 4))).toBe('NEAR_DUE');
  });
});
