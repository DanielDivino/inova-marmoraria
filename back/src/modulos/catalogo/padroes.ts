import type { AparenciaDeSuperficie, DesenhoDeBorda, NivelDeManutencao, UsoDaPedra, ValorPercebido } from '@inova/domain';

/**
 * Famílias, bordas e acabamentos que o catálogo começa tendo (textos dos guias da Inova: Guia de
 * pedras, Guia Prático de Materiais e Tabela da Borda). A migração `familias_bordas_acabamentos`
 * grava estes mesmos dados; o seed garante que existam num banco novo.
 */
export type FamiliaPadrao = {
  name: string; plural: string; summary: string; style: string; advantages: string[]; care: string[]; uses: UsoDaPedra[];
  desempenho?: { scratchResistance: number; stainResistance: number; heatResistance: number; aesthetics: number; maintenance: NivelDeManutencao; costLevel: number };
};

export const FAMILIAS_PADRAO: FamiliaPadrao[] = [
  {
    name: 'Granito', plural: 'Granitos', style: 'Rústico, contemporâneo, industrial',
    summary: 'Rocha natural dura, de grãos visíveis e enorme variedade de cores. Aguenta bem o uso diário; a absorção muda de chapa para chapa.',
    advantages: ['Alta resistência a riscos e ao calor', 'Durabilidade excepcional', 'Vai bem da cozinha à área externa'],
    care: ['Avaliar a selagem conforme a chapa', 'Pano úmido e detergente neutro', 'Longe de ácidos e abrasivos'],
    uses: ['cozinha', 'banheiro', 'gourmet', 'lavanderia', 'piso'],
    desempenho: { scratchResistance: 5, stainResistance: 4, heatResistance: 5, aesthetics: 3, maintenance: 'Baixa', costLevel: 2 },
  },
  {
    name: 'Mármore', plural: 'Mármores', style: 'Clássico, luxuoso, minimalista',
    summary: 'Pedra nobre de veios elegantes, cada chapa única. Ácidos como limão e vinagre fosqueiam a superfície, e ela risca com mais facilidade.',
    advantages: ['Beleza que não se repete', 'Valoriza qualquer ambiente', 'Toque frio e agradável'],
    care: ['Muito sensível a limão e vinagre', 'Pede impermeabilização', 'Só produtos de pH neutro'],
    uses: ['banheiro', 'painel'],
    desempenho: { scratchResistance: 3, stainResistance: 2, heatResistance: 3, aesthetics: 5, maintenance: 'Alta', costLevel: 3 },
  },
  {
    name: 'Quartzito', plural: 'Quartzitos', style: 'Sofisticado, natural, elegante',
    summary: 'Rocha natural rica em quartzo e muito dura: a aparência do mármore com mais resistência no dia a dia.',
    advantages: ['Bem mais duro que o mármore', 'Veios naturais marcantes', 'Resiste a riscos e ao calor'],
    care: ['Impermeabilizar periodicamente', 'Pode absorver óleo: limpar logo', 'Conferir a procedência do lote'],
    uses: ['cozinha', 'banheiro', 'gourmet', 'painel'],
    desempenho: { scratchResistance: 5, stainResistance: 3, heatResistance: 4, aesthetics: 5, maintenance: 'Média', costLevel: 4 },
  },
  {
    name: 'Ultracompacto', plural: 'Ultracompactos', style: 'Tecnológico, premium, contemporâneo',
    summary: 'Superfície industrial de altíssima densidade, prensada a altas temperaturas e quase sem poros. Calor, sol e área externa dependem do fabricante e do modelo.',
    advantages: ['Alta resistência a manchas e ao calor', 'Dispensa impermeabilização', 'Placas grandes e padrão uniforme'],
    care: ['Bordas e recortes lascam com impacto', 'Instalação por equipe especializada', 'Reparo difícil em caso de dano'],
    uses: ['cozinha', 'banheiro', 'gourmet', 'painel'],
    desempenho: { scratchResistance: 5, stainResistance: 5, heatResistance: 5, aesthetics: 4, maintenance: 'Muito baixa', costLevel: 4 },
  },
  {
    name: 'Industrializado', plural: 'Industrializados', style: 'Moderno, clean, uniforme',
    summary: 'Superfície composta (quartzo, aglomerado de mármore ou vidro cristalizado, conforme o produto). Visual uniforme; o comportamento varia de um produto para outro.',
    advantages: ['Cor e padrão uniformes', 'Baixa absorção no quartzo e no vidro', 'Ótimo para bancadas internas'],
    care: ['Panela quente nunca direto na pedra', 'Evitar sol direto prolongado', 'Limpeza só com produto neutro'],
    uses: ['banheiro', 'painel'],
  },
  {
    name: 'Superfície especial', plural: 'Especiais', style: 'Exclusivo, marcante, autoral',
    summary: 'Superfície de nome comercial, escolhida pelo visual marcante. A família (natural ou industrializada) vem da ficha do fornecedor.',
    advantages: ['Visual exclusivo e marcante', 'Destaque em projetos autorais'],
    care: ['Mostrar a chapa real ao cliente', 'Seguir o manual de uso do fornecedor'],
    uses: ['painel'],
  },
];

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Família de um material antigo (pela categoria e pelo nome). Preto Absoluto e Calacatta Gold são ultracompactos. */
export function familiaDoMaterialAntigo(nome: string, categoria: string) {
  const n = normalizar(nome), c = normalizar(categoria), tudo = `${n} ${c}`;
  if (tudo.includes('ultracompacto') || ['preto absoluto', 'calacatta gold'].includes(n)) return 'Ultracompacto';
  if (tudo.includes('quartzito') || n.includes('taj mahal')) return 'Quartzito';
  if (tudo.includes('marmore')) return 'Mármore';
  if (c.includes('granit')) return 'Granito';
  if (/industrializ|importad|quartzo|silestone/.test(c) || /prime|nano|translucido|silestone|quartzo/.test(n)) return 'Industrializado';
  if (/granit|sao gabriel|ubatuba/.test(n)) return 'Granito';
  return 'Superfície especial';
}

export type AcabamentoPadrao = {
  kind: 'EDGE' | 'SURFACE'; name: string; appearance: DesenhoDeBorda | AparenciaDeSuperficie; description: string; uses: string;
  perceivedValue?: ValorPercebido;
  /** Serviços já cadastrados que cobram este acabamento (pelo nome). */
  servicos: string[];
};

export const ACABAMENTOS_PADRAO: AcabamentoPadrao[] = [
  { kind: 'EDGE', name: 'Reta', appearance: 'reta', perceivedValue: 'Baixo', description: 'Corte a 90°, sem recuo nem arredondamento. Limpa, leve e a mais econômica.', uses: 'Uso geral, peças simples e obras com prazo curto', servicos: ['Acabamento Simples'] },
  { kind: 'EDGE', name: 'Boleada', appearance: 'boleada', perceivedValue: 'Médio', description: 'Quina arredondada: toque suave e mais segurança no dia a dia.', uses: 'Banheiro e lavatório', servicos: ['Acabamento Boleado'] },
  { kind: 'EDGE', name: 'Meia-cana', appearance: 'meia-cana', perceivedValue: 'Médio', description: 'Frente toda arredondada, em meio círculo: macia ao toque e de visual clássico.', uses: 'Lavatório, mesa e balcão', servicos: ['Acabamento Meia Cana'] },
  { kind: 'EDGE', name: 'Chanfrada', appearance: 'chanfrada', perceivedValue: 'Médio', description: 'Pequeno corte a 45° na quina, que deixa a peça mais leve e elegante.', uses: 'Banheiro, soleira e peitoril', servicos: ['Acabamento Chanfrado'] },
  { kind: 'EDGE', name: 'Bisotê', appearance: 'bisote', perceivedValue: 'Médio', description: 'Bisel mais largo que o chanfro, inclinado para valorizar a espessura.', uses: 'Lavatório, soleira e peitoril', servicos: [] },
  { kind: 'EDGE', name: 'Meia-esquadria', appearance: 'meia-esquadria', perceivedValue: 'Alto', description: 'Duas peças unidas a 45°: a pedra parece maciça, sem emenda à vista.', uses: 'Cozinha, ilha e balcão', servicos: ['Acabamento 45°', 'Acabamento 45° — Granito/Mármore', 'Acabamento 45° — Importado'] },
  { kind: 'EDGE', name: 'Saia', appearance: 'saia', perceivedValue: 'Alto', description: 'Faixa vertical na frente da bancada, que dá corpo e presença à peça.', uses: 'Bancada, ilha e balcão', servicos: ['Saia'] },
  { kind: 'EDGE', name: 'Engrossada', appearance: 'engrossada', perceivedValue: 'Alto', description: 'Frente com espessura dobrada: robustez e imponência no acabamento.', uses: 'Cozinha, ilha e balcão comercial', servicos: ['Acabamento Duplo'] },
  { kind: 'EDGE', name: 'Pingadeira', appearance: 'pingadeira', perceivedValue: 'Técnico', description: 'Rebaixo sob a borda que corta o escorrimento da água e protege a parede.', uses: 'Soleira, peitoril e área externa', servicos: [] },
  { kind: 'EDGE', name: 'Polida', appearance: 'polida', perceivedValue: 'Médio', description: 'Brilho em toda a borda, realçando as cores e os veios da pedra.', uses: 'Qualquer perfil que fique à vista', servicos: ['Acabamento com Brilho'] },
  { kind: 'SURFACE', name: 'Polido', appearance: 'polido', description: 'Brilho intenso que realça cores e veios.', uses: 'Bancadas, painéis e interiores clássicos', servicos: ['Acabamento Polimento'] },
  { kind: 'SURFACE', name: 'Levigado', appearance: 'levigado', description: 'Fosco suave e liso ao toque. Discreto e muito sofisticado.', uses: 'Bancadas e pisos internos contemporâneos', servicos: [] },
  { kind: 'SURFACE', name: 'Escovado', appearance: 'escovado', description: 'Textura suave ao toque, que escorrega menos.', uses: 'Áreas molhadas', servicos: [] },
  { kind: 'SURFACE', name: 'Flameado', appearance: 'flameado', description: 'Superfície rústica e antiderrapante, feita em granito.', uses: 'Áreas externas, piscinas e escadas', servicos: [] },
  { kind: 'SURFACE', name: 'Jateado', appearance: 'jateado', description: 'Fosco uniforme e moderno.', uses: 'Pisos e projetos de linhas retas', servicos: ['Acabamento Jateado'] },
];
