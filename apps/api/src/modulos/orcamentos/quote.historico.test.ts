import { describe, expect, it } from 'vitest';
import { montarHistorico } from './quote.historico.js';

const dia = (texto: string) => new Date(texto);
const orcamento = {
  createdAt: dia('2026-09-29T14:00:00Z'), validUntil: null, approvedAt: null, completedAt: null, dueDate: null,
  items: [{ id: 'i1', projectName: 'Cozinha' }, { id: 'i2', projectName: '' }],
  workerAssignments: [{ id: 'a1', assignedAt: dia('2026-09-30T12:00:00Z'), releasedAt: null, worker: { name: 'Carlos' } }],
};
let seq = 0;
const registro = (entityType: string, action: string, createdAt: string, previous: unknown, current: unknown, entityId = 'q1') => ({ id: `r${++seq}`, entityType, entityId, action, previous, current, createdAt: dia(createdAt), user: { name: 'Ana' } });

describe('linha do tempo do orçamento', () => {
  it('traduz o registro em eventos simples, do mais recente ao mais antigo', () => {
    const { eventos } = montarHistorico(orcamento, [
      registro('QUOTE', 'CREATED', '2026-09-29T14:00:00Z', null, { number: 'SET-2026-20' }),
      registro('QUOTE', 'STATUS_CHANGED', '2026-09-29T15:00:00Z', { status: 'SENT', executionStatus: 'NOT_STARTED' }, { status: 'APPROVED', executionStatus: 'NOT_STARTED' }),
      registro('QUOTE', 'STATUS_CHANGED', '2026-09-30T10:00:00Z', { status: 'APPROVED', executionStatus: 'NOT_STARTED' }, { status: 'APPROVED', executionStatus: 'IN_PROGRESS' }),
      registro('QUOTE', 'STATUS_CHANGED', '2026-10-01T10:00:00Z', { status: 'APPROVED', executionStatus: 'IN_PROGRESS' }, { status: 'APPROVED', executionStatus: 'PAUSED', reason: 'Produção parada' }),
      registro('QUOTE', 'STATUS_CHANGED', '2026-10-02T10:00:00Z', { status: 'APPROVED', executionStatus: 'PAUSED' }, { status: 'APPROVED', executionStatus: 'IN_PROGRESS', reason: 'Produção retomada' }),
    ]);
    expect(eventos.map((evento) => evento.titulo)).toEqual(['Produção retomada', 'Produção interrompida', 'Carlos assumiu o serviço', 'Serviço iniciado', 'Orçamento aprovado', 'Orçamento criado']);
    expect(eventos[0]).toMatchObject({ usuario: 'Ana', tom: 'azul', icone: 'situacao' });
  });

  it('prazos mostram só o que mudou; observações viram um evento próprio', () => {
    const { eventos } = montarHistorico({ ...orcamento, workerAssignments: [] }, [
      registro('QUOTE', 'CREATED', '2026-09-29T14:00:00Z', null, {}),
      registro('QUOTE', 'DEADLINE_UPDATED', '2026-09-30T14:00:00Z', { deliveryDeadline: null, installationDeadline: null, deadlineConfirmed: false, notes: null }, { deliveryDeadline: '2026-10-20T00:00:00.000Z', installationDeadline: null, deadlineConfirmed: true, notes: 'Conferir no local.' }),
      registro('QUOTE', 'DEADLINE_UPDATED', '2026-09-30T15:00:00Z', { deliveryDeadline: '2026-10-20T00:00:00.000Z', deadlineConfirmed: true, notes: 'Conferir no local.' }, { deliveryDeadline: '2026-10-20T00:00:00.000Z', deadlineConfirmed: true, notes: 'Conferir no local.' }),
    ]);
    expect(eventos.map((evento) => [evento.titulo, evento.detalhe])).toEqual([
      ['Prazos atualizados', 'Entrega acordada: 20/10/2026 · Prazo confirmado com o cliente'],
      ['Observações do orçamento atualizadas', undefined],
      ['Orçamento criado', undefined],
    ]);
  });

  it('movimentos seguidos do mesmo projeto no Fluxo viram um só; entregas e cancelamento com motivo', () => {
    const { eventos } = montarHistorico({ ...orcamento, workerAssignments: [] }, [
      registro('QUOTE_ITEM', 'WORKFLOW_STATUS_CHANGED', '2026-10-01T10:00:00Z', { status: 'TODO' }, { status: 'IN_PROGRESS', quoteId: 'q1' }, 'i1'),
      registro('QUOTE_ITEM', 'WORKFLOW_STATUS_CHANGED', '2026-10-01T10:03:00Z', { status: 'IN_PROGRESS' }, { status: 'DONE', quoteId: 'q1' }, 'i1'),
      registro('QUOTE_ITEM', 'WORKFLOW_STATUS_CHANGED', '2026-10-01T11:00:00Z', { status: 'TODO' }, { status: 'IN_PROGRESS', quoteId: 'q1' }, 'i2'),
      registro('QUOTE_ITEM', 'PROJECT_DELIVERY_CREATED', '2026-10-02T10:00:00Z', null, { quoteId: 'q1', number: 'ENT-2026-01', pieces: [{ key: 'a', quantity: 2 }, { key: 'b', quantity: 1 }] }, 'i1'),
      registro('QUOTE', 'STATUS_CHANGED', '2026-10-03T10:00:00Z', { status: 'SENT' }, { status: 'CANCELLED', reason: 'Cancelado no acompanhamento comercial' }),
    ]);
    expect(eventos.map((evento) => [evento.titulo, evento.detalhe ?? ''])).toEqual([
      ['Orçamento cancelado', 'Cancelado no acompanhamento comercial'],
      ['Entrega registrada: Cozinha', 'Nota ENT-2026-01 · 3 peças'],
      ['Projeto 2 movido para “Em andamento”', ''],
      ['Cozinha movido para “Produzido – entrega/montagem”', ''],
      ['Orçamento criado', ''],
    ]);
  });

  it('orçamento antigo, sem registro: emissão, aprovação, entrega e os marcos', () => {
    const antigo = { ...orcamento, workerAssignments: [], approvedAt: dia('2026-09-30T10:00:00Z'), completedAt: dia('2026-10-10T10:00:00Z') };
    const { eventos, marcos } = montarHistorico(antigo, []);
    expect(eventos.map((evento) => evento.titulo)).toEqual(['Orçamento entregue', 'Orçamento aprovado', 'Orçamento criado']);
    expect(marcos.map((marco) => [marco.rotulo, marco.data])).toEqual([['Emissão', '2026-09-29'], ['Validade', '2026-10-13'], ['Aprovação', '2026-09-30'], ['Data limite', null], ['Entrega', '2026-10-10']]);
  });

  it('aprovação parcial: diz quais projetos não foram aprovados; mudanças depois aparecem por projeto', () => {
    const { eventos } = montarHistorico({ ...orcamento, workerAssignments: [] }, [
      registro('QUOTE', 'STATUS_CHANGED', '2026-10-01T10:00:00Z', { status: 'SENT' }, { status: 'APPROVED', executionStatus: 'NOT_STARTED', projetosNaoAprovados: ['Projeto 2'] }),
      registro('QUOTE_ITEM', 'APPROVAL_CHANGED', '2026-10-02T10:00:00Z', { aprovado: false }, { quoteId: 'q1', aprovado: true }, 'i2'),
    ]);
    expect(eventos.map((evento) => [evento.titulo, evento.detalhe ?? ''])).toEqual([
      ['Projeto 2 aprovado pelo cliente', ''],
      ['Orçamento aprovado em parte', 'Não aprovado: Projeto 2'],
      ['Orçamento criado', ''],
    ]);
  });

  it('desistência do cliente tem título próprio', () => {
    const { eventos } = montarHistorico({ ...orcamento, workerAssignments: [] }, [registro('QUOTE', 'STATUS_CHANGED', '2026-10-03T10:00:00Z', { status: 'APPROVED', executionStatus: 'IN_PROGRESS' }, { status: 'CANCELLED', reason: 'Cliente desistiu' })]);
    expect(eventos[0]).toMatchObject({ titulo: 'Desistência do cliente', tom: 'vermelho' });
  });
});
