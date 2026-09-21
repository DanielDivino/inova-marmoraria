export type UnidadeMaterial = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function exibirPrecoMaterial(preco: number | null | undefined, unidade: UnidadeMaterial = 'SQUARE_METER') {
  if (preco === null || preco === undefined) return 'Preço sob consulta';
  const sufixo = unidade === 'SQUARE_METER' ? ' / m²' : unidade === 'LINEAR_METER' ? ' / m' : unidade === 'UNIT' ? ' / un.' : '';
  return `${money.format(preco)}${sufixo}`;
}
