import { describe, expect, it } from 'vitest';
import { caminhoAteOrcamento, caminhoDentroDoOrcamento, comParametros, enderecoLogin, enderecoOrcamento, lerOrigem, orcamentoEncerrado, voltaSegura } from './rotas';

const quote = { id: 'q1', number: 'ORC-2026-30', customerId: 'c1', customerNameSnapshot: 'Maria Silva', status: 'APPROVED', executionStatus: 'IN_PROGRESS' };
const listas = (lista: string) => ({ fluxo: '/fluxo?aba=RESUMO', orcamentos: '/orcamentos?status=PRODUCAO', historico: '/historico', clientes: '/clientes?busca=mar' }[lista]!);

describe('rotas entre as telas', () => {
  it('lê a origem só entre as conhecidas; o cartão só vale vindo do fluxo', () => {
    expect(lerOrigem(new URLSearchParams('de=fluxo&cartao=k1'))).toEqual({ de: 'fluxo', cartao: 'k1' });
    expect(lerOrigem(new URLSearchParams('de=cliente&cartao=k1'))).toEqual({ de: 'cliente' });
    expect(lerOrigem(new URLSearchParams('de=https://outro.site'))).toEqual({ de: null });
  });

  it('monta o endereço do orçamento levando a origem, antes da âncora', () => {
    expect(enderecoOrcamento('q1', { de: 'fluxo', cartao: 'k1' }, { ancora: 'projeto-p1' })).toBe('/orcamentos/q1?de=fluxo&cartao=k1#projeto-p1');
    expect(enderecoOrcamento('q1', { de: 'cliente' }, { tela: 'editar', parametros: { detail: 'i1' } })).toBe('/orcamentos/q1/editar?de=cliente&detail=i1');
    expect(enderecoOrcamento('q1')).toBe('/orcamentos/q1');
    expect(comParametros('/fluxo?aba=RESUMO#x', { cartao: 'k1', aba: null })).toBe('/fluxo?cartao=k1#x');
  });

  it('o caminho volta para onde o orçamento foi aberto, com os filtros da lista', () => {
    expect(caminhoAteOrcamento(quote, { de: 'fluxo', cartao: 'k1' }, listas)).toEqual([{ rotulo: 'Fluxo de trabalho', href: '/fluxo?aba=RESUMO&cartao=k1' }]);
    expect(caminhoAteOrcamento(quote, { de: 'cliente' }, listas)).toEqual([{ rotulo: 'Clientes', href: '/clientes?busca=mar' }, { rotulo: 'Maria Silva', href: '/clientes/c1' }]);
    expect(caminhoAteOrcamento(quote, { de: 'dashboard' }, listas)).toEqual([{ rotulo: 'Dashboard', href: '/dashboard' }]);
    expect(caminhoAteOrcamento(quote, { de: null }, listas)).toEqual([{ rotulo: 'Orçamentos', href: '/orcamentos?status=PRODUCAO' }]);
    // Sem origem, o encerrado fica no Histórico.
    expect(caminhoAteOrcamento({ ...quote, executionStatus: 'COMPLETED' }, { de: null }, listas)).toEqual([{ rotulo: 'Histórico', href: '/historico' }]);
    expect(caminhoAteOrcamento(quote, { de: 'historico' }, listas)[0].rotulo).toBe('Histórico');
  });

  it('telas dentro do orçamento acrescentam o orçamento ao caminho', () => {
    expect(caminhoDentroDoOrcamento(quote, { de: 'fluxo', cartao: 'k1' }, listas).at(-1)).toEqual({ rotulo: 'ORC-2026-30', href: '/orcamentos/q1?de=fluxo&cartao=k1' });
  });

  it('encerrados: recusado, cancelado, vencido ou entregue', () => {
    expect(['REJECTED', 'CANCELLED', 'EXPIRED'].map((status) => orcamentoEncerrado({ status }))).toEqual([true, true, true]);
    expect(orcamentoEncerrado({ status: 'SENT' })).toBe(false);
  });

  it('depois do login só volta para telas do sistema', () => {
    expect(voltaSegura('/orcamentos/q1?de=fluxo')).toBe('/orcamentos/q1?de=fluxo');
    for (const perigoso of ['https://outro.site', '//outro.site', '/\\outro.site', '/login?voltar=/x', '', null]) expect(voltaSegura(perigoso)).toBe('/');
    expect(enderecoLogin('/fluxo?aba=RESUMO')).toBe('/login?voltar=%2Ffluxo%3Faba%3DRESUMO');
    expect(enderecoLogin('/')).toBe('/login');
  });
});
