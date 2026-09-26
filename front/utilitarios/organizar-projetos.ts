export const ESPACO_ENTRE_PROJETOS = 16;
export const TONS_PROJETO = 3;

export type PosicaoProjeto = { coluna: number; topo: number; base: number; tom: number };

/**
 * Coloca cada projeto, na ordem do orçamento, na coluna mais curta: um projeto
 * grande não deixa mais um vão em branco ao lado dos outros. Cada cartão recebe
 * o tom pastel que menos encosta em cartões da mesma cor: o de cima, na mesma
 * coluna, nunca repete; nas colunas ao lado pesa o trecho em que ficam lado a
 * lado (com três tons, às vezes um cartão encosta nos três). Alturas ainda não
 * medidas valem 0, o que mantém a ordem de leitura da esquerda para a direita.
 */
export function organizarProjetos(alturas: number[], colunas: number): PosicaoProjeto[] {
  const fundo = Array.from({ length: Math.max(1, colunas) }, () => 0);
  const posicoes: PosicaoProjeto[] = [];
  alturas.forEach((altura, indice) => {
    const coluna = fundo.indexOf(Math.min(...fundo));
    const topo = fundo[coluna];
    const base = topo + altura;
    fundo[coluna] = base + ESPACO_ENTRE_PROJETOS;
    const usos = Array.from({ length: TONS_PROJETO }, () => 0);
    for (const vizinho of posicoes) {
      const distancia = Math.abs(vizinho.coluna - coluna);
      if (distancia > 1 || vizinho.topo > base || vizinho.base + ESPACO_ENTRE_PROJETOS < topo) continue;
      const ladoALado = Math.min(base, vizinho.base) - Math.max(topo, vizinho.topo) + ESPACO_ENTRE_PROJETOS;
      usos[vizinho.tom] += distancia === 0 ? Number.POSITIVE_INFINITY : ladoALado;
    }
    // Começa pelo tom da vez para variar as cores mesmo quando nada encosta.
    const candidatos = Array.from({ length: TONS_PROJETO }, (_, deslocamento) => (indice + deslocamento) % TONS_PROJETO);
    const tom = candidatos.reduce((melhor, candidato) => usos[candidato] < usos[melhor] ? candidato : melhor);
    posicoes.push({ coluna, topo, base, tom });
  });
  return posicoes;
}
