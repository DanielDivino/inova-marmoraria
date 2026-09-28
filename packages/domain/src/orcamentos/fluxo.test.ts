import { describe, expect, it } from 'vitest';
import { dataConclusaoAoMover, faseOrcamentoFluxo, posicaoEntre, situacaoPrazoFluxo } from './fluxo';

describe('prazo do fluxo de trabalho', () => {
  it('marca vencido, próximo em até 7 dias e no prazo pela data de calendário', () => {
    const agora = new Date('2026-09-26T15:00:00Z');
    expect(situacaoPrazoFluxo('2026-09-25', false, agora)).toBe('VENCIDO');
    expect(situacaoPrazoFluxo('2026-09-26', false, agora)).toBe('PROXIMO');
    expect(situacaoPrazoFluxo('2026-10-03', false, agora)).toBe('PROXIMO');
    expect(situacaoPrazoFluxo('2026-10-04', false, agora)).toBe('NO_PRAZO');
    expect(situacaoPrazoFluxo(new Date('2026-09-20T00:00:00Z'), false, agora)).toBe('VENCIDO');
  });
  it('não alerta sem prazo nem quando o trabalho já foi concluído', () => {
    expect(situacaoPrazoFluxo(null)).toBe('SEM_PRAZO');
    expect(situacaoPrazoFluxo('2020-01-01', true)).toBe('CONCLUIDO');
  });
});

describe('posição do cartão no fluxo de trabalho', () => {
  it('fica no meio dos vizinhos e um passo além quando só há vizinho de um lado', () => {
    expect(posicaoEntre(2, 3)).toBe(2.5);
    expect(posicaoEntre(4)).toBe(5);
    expect(posicaoEntre(undefined, 0)).toBe(-1);
    expect(posicaoEntre()).toBe(0);
  });
});

describe('fase do orçamento no quadro', () => {
  it('separa aguardando aprovação, aprovado sem início e em execução; histórico fica fora', () => {
    expect(faseOrcamentoFluxo({ status: 'SENT', executionStatus: 'NOT_STARTED' })).toBe('AWAITING_APPROVAL');
    expect(faseOrcamentoFluxo({ status: 'DRAFT' })).toBe('AWAITING_APPROVAL');
    expect(faseOrcamentoFluxo({ status: 'APPROVED', executionStatus: 'NOT_STARTED' })).toBe('AWAITING_START');
    expect(faseOrcamentoFluxo({ status: 'APPROVED', executionStatus: 'PAUSED' })).toBe('PAUSED');
    for (const executionStatus of ['IN_PROGRESS', 'REWORK', 'READY', 'INSTALLATION_PENDING']) expect(faseOrcamentoFluxo({ status: 'APPROVED', executionStatus })).toBe('IN_EXECUTION');
    for (const quote of [{ status: 'APPROVED', executionStatus: 'COMPLETED' }, { status: 'REJECTED' }, { status: 'CANCELLED' }, { status: 'EXPIRED' }]) expect(faseOrcamentoFluxo(quote)).toBeNull();
  });
});

describe('data de conclusão ao mover', () => {
  it('preenche ao concluir, mantém até a entrega e limpa ao voltar para antes', () => {
    expect(dataConclusaoAoMover({ status: 'IN_PROGRESS', completedAt: null }, 'DONE', 'hoje')).toBe('hoje');
    expect(dataConclusaoAoMover({ status: 'IN_PROGRESS', completedAt: null }, 'DELIVERED', 'hoje')).toBe('hoje');
    expect(dataConclusaoAoMover({ status: 'DONE', completedAt: 'ontem' }, 'DONE', 'hoje')).toBe('ontem');
    expect(dataConclusaoAoMover({ status: 'DONE', completedAt: 'ontem' }, 'DELIVERED', 'hoje')).toBe('ontem');
    expect(dataConclusaoAoMover({ status: 'DONE', completedAt: 'ontem' }, 'IN_PROGRESS', 'hoje')).toBeNull();
  });
});
