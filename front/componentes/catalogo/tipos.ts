import type { DesenhoDeBorda, AparenciaDeSuperficie, NivelDeManutencao, UsoDaPedra, ValorPercebido } from '@inova/domain';

/** Família da pedra, com as informações do mostruário (API `/catalog/families`). */
export type Desempenho = { scratchResistance: number; stainResistance: number; heatResistance: number; aesthetics: number; maintenance: NivelDeManutencao; costLevel: number };
export type Familia = {
  id: string; name: string; plural: string; summary: string; style: string; advantages: string[]; care: string[]; uses: UsoDaPedra[];
  desempenho: Desempenho | null; sortOrder: number; materialCount: number;
};

/** Borda (perfil) ou acabamento de superfície, com os serviços que o cobram (API `/catalog/finishes`). */
export type ServicoDoAcabamento = { id: string; name: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number; isActive: boolean };
export type Acabamento = {
  id: string; kind: 'EDGE' | 'SURFACE'; name: string; appearance: DesenhoDeBorda | AparenciaDeSuperficie; description: string; uses: string;
  perceivedValue: ValorPercebido | null; sortOrder: number; isActive: boolean; services: ServicoDoAcabamento[];
};

/** Menor preço entre os serviços ativos que cobram o acabamento (sem preço: undefined). */
export function precoAPartirDe(acabamento: Pick<Acabamento, 'services'>) {
  const precos = acabamento.services.filter((servico) => servico.isActive && servico.currentPrice > 0).map((servico) => servico.currentPrice);
  return precos.length ? Math.min(...precos) : undefined;
}
