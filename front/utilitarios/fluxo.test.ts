import { describe, expect, it } from 'vitest';
import { aguardandoInicio, colunasFluxo, corOrcamento, entregaFinalDoOrcamento, filtrarCartoes, formatarDataFluxo, moverCartaoLocal, resumirPorOrcamento, rotuloPecas, SEM_RESPONSAVEL, type CartaoFluxo, type FiltroFluxo } from './fluxo';

const quote = (id: string, deadline: string | null = null, worker: CartaoFluxo['quote']['worker'] = null, phase: CartaoFluxo['quote']['phase'] = 'IN_EXECUTION') => ({ id, number: `SET-2026-${id}`, customerId: `cliente-${id}`, customerName: `Cliente ${id}`, deadline, worker, phase });
const cartao = (id: string, status: CartaoFluxo['status'], position: number, orcamento = quote('1')): CartaoFluxo => ({ id, name: `Projeto ${id}`, status, position, completedAt: null, pieces: 1, quote: orcamento });

describe('Fluxo de trabalho no quadro', () => {
  const joao = { id: 'joao', name: 'João', color: '#607453' };
  const cartoes = [cartao('a', 'TODO', 0), cartao('b', 'TODO', 1), cartao('c', 'IN_PROGRESS', 0, quote('2', null, joao)), cartao('d', 'DONE', 3, quote('2', null, joao))];

  it('ordena cada coluna pela posição e filtra por cliente, orçamento e funcionário', () => {
    expect(colunasFluxo(cartoes).TODO.map((entrada) => entrada.id)).toEqual(['a', 'b']);
    expect(filtrarCartoes(cartoes, { customerId: 'cliente-2', quoteId: '', workerId: '' }).map((entrada) => entrada.id)).toEqual(['c', 'd']);
    expect(filtrarCartoes(cartoes, { customerId: '', quoteId: '1', workerId: '' }).map((entrada) => entrada.id)).toEqual(['a', 'b']);
    expect(filtrarCartoes(cartoes, { customerId: '', quoteId: '', workerId: 'joao' }).map((entrada) => entrada.id)).toEqual(['c', 'd']);
    expect(filtrarCartoes(cartoes, { customerId: '', quoteId: '', workerId: SEM_RESPONSAVEL }).map((entrada) => entrada.id)).toEqual(['a', 'b']);
  });

  it('move entre vizinhos visíveis, marca a conclusão e a limpa ao sair de Produzido', () => {
    const agora = new Date('2026-09-26T12:00:00Z');
    const concluido = moverCartaoLocal(cartoes, 'b', 'DONE', ['b', 'd'], agora);
    expect(concluido).toMatchObject({ afterId: null, beforeId: 'd' });
    expect(concluido.cartoes.find((entrada) => entrada.id === 'b')).toMatchObject({ status: 'DONE', position: 2, completedAt: agora.toISOString() });
    const reaberto = moverCartaoLocal(concluido.cartoes, 'b', 'IN_PROGRESS', ['c', 'b']);
    expect(reaberto.cartoes.find((entrada) => entrada.id === 'b')).toMatchObject({ status: 'IN_PROGRESS', position: 1, completedAt: null });
    const meio = moverCartaoLocal(cartoes, 'c', 'TODO', ['a', 'c', 'b']);
    expect(meio.cartoes.find((entrada) => entrada.id === 'c')?.position).toBe(0.5);
    expect(moverCartaoLocal(cartoes, 'a', 'IN_PROGRESS', ['a']).cartoes.find((entrada) => entrada.id === 'a')?.position).toBe(1);
  });

  it('resume o progresso por orçamento e marca a produção finalizada quando todos foram produzidos', () => {
    const resumos = resumirPorOrcamento([...cartoes, cartao('e', 'DONE', 4, quote('3', '2026-10-01'))]);
    expect(resumos.map((resumo) => [resumo.quote.id, resumo.concluidos, resumo.total, resumo.finalizado])).toEqual([['1', 0, 2, false], ['2', 1, 2, false], ['3', 1, 1, true]]);
  });

  it('usa sempre a mesma cor para o mesmo orçamento e formata a data sem fuso', () => {
    expect(corOrcamento('cmuhoj3o20003iqqfmwt8ujni')).toBe(corOrcamento('cmuhoj3o20003iqqfmwt8ujni'));
    expect(formatarDataFluxo('2026-10-03')).toBe('03/10/2026');
    expect([rotuloPecas(1), rotuloPecas(10)]).toEqual(['1 peça', '10 peças']);
  });

  it('orçamento com tudo concluído continua no quadro até a entrega e aparece finalizado no resumo', () => {
    const todos = [...cartoes, cartao('e', 'DONE', 4, quote('3')), cartao('f', 'DONE', 5, quote('3'))];
    expect(colunasFluxo(todos).DONE.map((entrada) => entrada.id)).toEqual(['d', 'e', 'f']);
    expect(resumirPorOrcamento(todos).find((resumo) => resumo.quote.id === '3')).toMatchObject({ concluidos: 2, entregues: 0, total: 2, finalizado: true });
  });

  it('identifica a entrega que completa o orçamento e mantém a data de conclusão até a entrega', () => {
    const todos = [cartao('x', 'DELIVERED', 0, quote('6')), cartao('y', 'DONE', 1, quote('6')), cartao('z', 'IN_PROGRESS', 0, quote('7')), cartao('w', 'TODO', 0, quote('7'))];
    expect(entregaFinalDoOrcamento(todos, 'y')).toBe(true);
    expect(entregaFinalDoOrcamento(todos, 'z')).toBe(false);
    const concluido = { ...cartao('k', 'DONE', 0), completedAt: '2026-09-20T10:00:00.000Z' };
    expect(moverCartaoLocal([concluido], 'k', 'DELIVERED', ['k']).cartoes[0].completedAt).toBe('2026-09-20T10:00:00.000Z');
    expect(moverCartaoLocal([concluido], 'k', 'IN_PROGRESS', ['k']).cartoes[0].completedAt).toBeNull();
    expect(resumirPorOrcamento(todos).find((resumo) => resumo.quote.id === '6')).toMatchObject({ concluidos: 2, entregues: 1, finalizado: true });
  });

  it('orçamentos não iniciados ficam só em "Aguardando início", aprovados antes dos que aguardam aprovação', () => {
    const todos = [...cartoes, cartao('g', 'TODO', 9, quote('4', '2026-10-10', null, 'AWAITING_APPROVAL')), cartao('h', 'TODO', 8, quote('5', '2026-12-01', null, 'AWAITING_START'))];
    expect(aguardandoInicio(todos).map((entrada) => entrada.id)).toEqual(['h', 'g']);
    expect(colunasFluxo(todos).TODO.map((entrada) => entrada.id)).toEqual(['a', 'b']);
    expect(resumirPorOrcamento(todos).map((resumo) => resumo.quote.id)).toEqual(['1', '2', '5', '4']);
    expect(resumirPorOrcamento(todos).find((resumo) => resumo.quote.id === '4')?.finalizado).toBe(false);
  });
});

describe('Filtros de data de entrega e falta de material', () => {
  const hoje = '2026-09-28';
  const cartoes = [
    { ...cartao('atrasado', 'IN_PROGRESS', 0, quote('1', '2026-09-20')), materialMissing: true },
    cartao('entregue-atrasado', 'DELIVERED', 1, quote('2', '2026-09-20')),
    cartao('hoje', 'TODO', 2, quote('3', '2026-09-28')),
    { ...cartao('semana', 'TODO', 3, quote('4', '2026-10-05')), materialMissing: true },
    cartao('mes', 'DONE', 4, quote('5', '2026-10-20')),
    cartao('sem-data', 'TODO', 5, quote('6', null)),
  ];
  const ids = (filtro: Partial<FiltroFluxo>) => filtrarCartoes(cartoes, { customerId: '', quoteId: '', workerId: '', ...filtro }, hoje).map((entrada) => entrada.id);

  it('filtra pela data de entrega do orçamento', () => {
    expect(ids({ entrega: 'TODAS' })).toHaveLength(6);
    expect(ids({ entrega: 'ATRASADAS' })).toEqual(['atrasado']);
    expect(ids({ entrega: 'HOJE' })).toEqual(['hoje']);
    expect(ids({ entrega: 'SETE_DIAS' })).toEqual(['hoje', 'semana']);
    expect(ids({ entrega: 'TRINTA_DIAS' })).toEqual(['hoje', 'semana', 'mes']);
    expect(ids({ entrega: 'SEM_DATA' })).toEqual(['sem-data']);
    expect(ids({ entrega: 'PERSONALIZADO', entregaDe: '2026-09-25', entregaAte: '2026-10-10' })).toEqual(['hoje', 'semana']);
    expect(ids({ entrega: 'PERSONALIZADO', entregaDe: '2026-10-01' })).toEqual(['semana', 'mes']);
  });

  it('filtra pela falta de material e combina com a data', () => {
    expect(ids({ material: 'FALTA' })).toEqual(['atrasado', 'semana']);
    expect(ids({ material: 'OK' })).toEqual(['entregue-atrasado', 'hoje', 'mes', 'sem-data']);
    expect(ids({ material: 'FALTA', entrega: 'SETE_DIAS' })).toEqual(['semana']);
  });
});
