import { describe, expect, it } from 'vitest';
import { organizarProjetos, type PosicaoProjeto } from './organizar-projetos';

// Acima na mesma coluna ou lado a lado nas colunas vizinhas.
const encostam = (anterior: PosicaoProjeto, atual: PosicaoProjeto) => Math.abs(anterior.coluna - atual.coluna) <= 1 && anterior.topo <= atual.base && anterior.base + 16 >= atual.topo;

describe('Organização dos projetos salvos em colunas', () => {
  it('mantém a ordem de leitura enquanto as alturas não foram medidas', () => {
    expect(organizarProjetos([0, 0, 0, 0, 0], 3).map((posicao) => posicao.coluna)).toEqual([0, 1, 2, 0, 1]);
  });

  it('preenche o vão ao lado de um projeto grande em vez de abrir uma nova linha', () => {
    const posicoes = organizarProjetos([300, 300, 2400, 300, 300, 300], 3);
    expect(posicoes.map((posicao) => posicao.coluna)).toEqual([0, 1, 2, 0, 1, 0]);
    expect(posicoes[3].topo).toBe(316);
    expect(Math.max(...posicoes.map((posicao) => posicao.base))).toBe(2400);
  });

  it('nunca repete o tom na mesma coluna e só repete ao lado quando o cartão encosta nos três tons', () => {
    for (const colunas of [1, 2, 3, 4]) {
      const posicoes = organizarProjetos([300, 500, 2400, 280, 320, 700, 150, 150, 900, 420], colunas);
      posicoes.forEach((posicao, indice) => {
        const vizinhos = posicoes.slice(0, indice).filter((anterior) => encostam(anterior, posicao));
        for (const vizinho of vizinhos.filter((anterior) => anterior.coluna === posicao.coluna)) expect(posicao.tom).not.toBe(vizinho.tom);
        if (vizinhos.some((vizinho) => vizinho.tom === posicao.tom)) expect(new Set(vizinhos.map((vizinho) => vizinho.tom)).size).toBe(3);
      });
    }
  });

  it('alterna os três tons quando os projetos ficam um abaixo do outro', () => {
    expect(organizarProjetos([200, 200, 200, 200], 1).map((posicao) => posicao.tom)).toEqual([0, 1, 2, 0]);
  });
});
