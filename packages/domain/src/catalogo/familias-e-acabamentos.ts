/**
 * Vocabulário do catálogo compartilhado pela API e pelas telas: usos das pedras (onde indicar),
 * desenhos das bordas, aparências dos acabamentos de superfície, valor percebido e manutenção.
 * As famílias, bordas e acabamentos em si ficam no banco (Materiais e serviços), com estes valores.
 */

/** Onde a pedra é indicada (filtros e guia do mostruário). */
export const USOS_DA_PEDRA = ['cozinha', 'banheiro', 'gourmet', 'lavanderia', 'piso', 'painel'] as const;
export type UsoDaPedra = (typeof USOS_DA_PEDRA)[number];
export const NOME_DO_USO: Record<UsoDaPedra, string> = {
  cozinha: 'Cozinha', banheiro: 'Banheiro e lavabo', gourmet: 'Área gourmet', lavanderia: 'Lavanderia', piso: 'Soleira, piso e escada', painel: 'Painéis e paredes',
};

export const NIVEIS_DE_MANUTENCAO = ['Muito baixa', 'Baixa', 'Média', 'Alta'] as const;
export type NivelDeManutencao = (typeof NIVEIS_DE_MANUTENCAO)[number];

/** Desenho do perfil de cada borda (mostruário; e, no desenho técnico, o perfil do lado). */
export const DESENHOS_DE_BORDA = ['reta', 'boleada', 'meia-cana', 'chanfrada', 'bisote', 'meia-esquadria', 'saia', 'engrossada', 'pingadeira', 'polida'] as const;
export type DesenhoDeBorda = (typeof DESENHOS_DE_BORDA)[number];
export const NOME_DO_DESENHO_DE_BORDA: Record<DesenhoDeBorda, string> = {
  reta: 'Reta', boleada: 'Boleada', 'meia-cana': 'Meia-cana', chanfrada: 'Chanfrada', bisote: 'Bisotê', 'meia-esquadria': 'Meia-esquadria',
  saia: 'Saia', engrossada: 'Engrossada', pingadeira: 'Pingadeira', polida: 'Polida',
};
/**
 * Perfil do desenho técnico para cada desenho de borda: o desenho técnico tem 4 perfis (reto, 45°,
 * chanfro e arredondado); as demais bordas são desenhadas retas por enquanto.
 */
export const PERFIL_TECNICO_DA_BORDA: Record<DesenhoDeBorda, 'SIMPLE' | 'MITER45' | 'BEVEL' | 'ROUND'> = {
  reta: 'SIMPLE', boleada: 'ROUND', 'meia-cana': 'ROUND', chanfrada: 'BEVEL', bisote: 'BEVEL', 'meia-esquadria': 'MITER45',
  saia: 'SIMPLE', engrossada: 'SIMPLE', pingadeira: 'SIMPLE', polida: 'SIMPLE',
};

/** Aparência de cada acabamento de superfície (mostruário). */
export const APARENCIAS_DE_SUPERFICIE = ['polido', 'levigado', 'escovado', 'flameado', 'jateado'] as const;
export type AparenciaDeSuperficie = (typeof APARENCIAS_DE_SUPERFICIE)[number];
export const NOME_DA_APARENCIA: Record<AparenciaDeSuperficie, string> = { polido: 'Polido', levigado: 'Levigado', escovado: 'Escovado', flameado: 'Flameado', jateado: 'Jateado' };

/** Valor que o cliente percebe em cada borda (Tabela da Borda). */
export const VALORES_PERCEBIDOS = ['Baixo', 'Médio', 'Alto', 'Técnico'] as const;
export type ValorPercebido = (typeof VALORES_PERCEBIDOS)[number];

export type TipoDeAcabamento = 'EDGE' | 'SURFACE';
/** Bordas são cobradas por metro linear; acabamentos de superfície, por m². */
export const UNIDADE_DO_ACABAMENTO: Record<TipoDeAcabamento, 'LINEAR_METER' | 'SQUARE_METER'> = { EDGE: 'LINEAR_METER', SURFACE: 'SQUARE_METER' };
