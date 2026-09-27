import { describe, expect, it } from 'vitest';
import { colunasFluxo, corOrcamento, filtrarCartoes, formatarDataFluxo, moverCartaoLocal, resumirPorOrcamento, rotuloPecas, SEM_RESPONSAVEL, type CartaoFluxo } from './fluxo';

const quote = (id: string, deadline: string | null = null, worker: CartaoFluxo['quote']['worker'] = null) => ({ id, number: `SET-2026-${id}`, customerId: `cliente-${id}`, customerName: `Cliente ${id}`, deadline, worker });
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

  it('move entre vizinhos visíveis, marca a conclusão e a limpa ao sair de Concluído', () => {
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

  it('resume o progresso por orçamento e marca finalizado quando todos estão concluídos', () => {
    const resumos = resumirPorOrcamento([...cartoes, cartao('e', 'DONE', 4, quote('3', '2026-10-01'))]);
    expect(resumos.map((resumo) => [resumo.quote.id, resumo.concluidos, resumo.total, resumo.finalizado])).toEqual([['1', 0, 2, false], ['2', 1, 2, false], ['3', 1, 1, true]]);
  });

  it('usa sempre a mesma cor para o mesmo orçamento e formata a data sem fuso', () => {
    expect(corOrcamento('cmuhoj3o20003iqqfmwt8ujni')).toBe(corOrcamento('cmuhoj3o20003iqqfmwt8ujni'));
    expect(formatarDataFluxo('2026-10-03')).toBe('03/10/2026');
    expect([rotuloPecas(1), rotuloPecas(10)]).toEqual(['1 peça', '10 peças']);
  });
});
