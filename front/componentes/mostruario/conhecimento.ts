import type { DesenhoDeBorda, UsoDaPedra } from '@inova/domain';
import type { Familia } from '../catalogo/tipos';

/**
 * Conhecimento do mostruário tirado dos guias da Inova (GUIA DO MOSTRUARIO): observações de pedras
 * específicas, cuidados, dicas, inspirações e o que indicar em cada uso. As famílias, as bordas e os
 * acabamentos ficam no catálogo (Materiais e serviços). O nome comercial não comprova a composição
 * da chapa: quando o nome é ambíguo e a família não tem notas de desempenho, a ficha manda confirmar.
 */

export type Tom = 'claro' | 'medio' | 'escuro';
export type UsoId = UsoDaPedra;

/** O que observar em cada uso (as famílias indicadas vêm do catálogo). */
export const USOS: Record<UsoId, { nome: string; atencao: string }> = {
  cozinha: { nome: 'Cozinha', atencao: 'Priorize resistência a manchas e calor e evite mármore na bancada de preparo. Óleo, café e vinho: limpar sem demora.' },
  banheiro: { nome: 'Banheiro e lavabo', atencao: 'Área úmida: nada de limpador ácido, seque as poças e mantenha a selagem em dia.' },
  gourmet: { nome: 'Área gourmet', atencao: 'Gordura e calor pedem limpeza fácil. Descoberta: só granito de lote apto ou ultracompacto certificado para sol.' },
  lavanderia: { nome: 'Lavanderia', atencao: 'Produtos de limpeza fortes por perto: prefira superfícies pouco porosas.' },
  piso: { nome: 'Soleira, piso e escada', atencao: 'Polido molhado escorrega: em área externa ou molhada, flameado ou escovado. Dimensione carga e bordas.' },
  painel: { nome: 'Painéis e paredes', atencao: 'Painel iluminado pede ônix translúcido, projeto de suporte e amostra real para testar a luz.' },
};
/** Famílias do catálogo indicadas para o uso, por extenso ("Granito, Quartzito e Ultracompacto"). */
export function familiasIndicadas(uso: UsoId, familias: Pick<Familia, 'name' | 'uses'>[]) {
  const nomes = familias.filter((familia) => familia.uses.includes(uso)).map((familia) => familia.name);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0] ?? '';
}
export const ORDEM_USOS: UsoId[] = ['cozinha', 'banheiro', 'gourmet', 'lavanderia', 'piso', 'painel'];

export const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Observações dos guias para pedras específicas (pelo nome); `incerta`: só quando a família não veio do cadastro. */
const OBSERVACOES: { padrao: RegExp; nota: string; onde?: UsoId[]; confirmar?: boolean; incerta?: boolean }[] = [
  { padrao: /ubatuba|sao gabriel/, onde: ['cozinha', 'gourmet', 'banheiro', 'lavanderia', 'piso'], nota: 'Baixo a moderado risco de absorção (varia por chapa) e ótima resistência no dia a dia.' },
  { padrao: /dallas|itauna|arabesco/, onde: ['cozinha', 'banheiro', 'lavanderia'], nota: 'Por ser clara, mostra mais óleo e pigmento: confirme a absorção e a selagem. Resiste bem ao desgaste.' },
  { padrao: /corumbazinho|cafe imperial|ocre itabira/, onde: ['cozinha', 'gourmet', 'piso'], nota: 'O granulado disfarça as marcas do dia a dia.' },
  { padrao: /preto indiano|alaska/, onde: ['cozinha', 'painel'], nota: 'Nome comercial de rocha ornamental: composição e comportamento pedem a ficha do fornecedor.', confirmar: true },
  { padrao: /bege bahia/, nota: 'Vendido como mármore, é um calcário ornamental: sensível a ácido e com absorção variável.' },
  { padrao: /translucido|onix/, onde: ['painel'], nota: 'Translúcido e delicado: brilha em painel iluminado, com projeto de suporte e amostra real para testar a luz.' },
  { padrao: /taj mahal/, onde: ['cozinha', 'banheiro', 'gourmet', 'painel'], nota: 'Usualmente quartzito natural: resiste bem a riscos, mas pode absorver óleo. Avalie a selagem.' },
  { padrao: /prime/, nota: '“Prime” é usado tanto para aglomerado de mármore quanto para quartzo. Sendo aglomerado, o cuidado com ácido, risco e calor é maior.', confirmar: true },
  { padrao: /nano/, nota: 'Vidro cristalizado branco: siga o manual do fabricante para calor, bordas e manchas.' },
  { padrao: /stellar|escovado|blackstone/, incerta: true, confirmar: true, nota: 'O nome pode indicar cor, acabamento ou produto diferente (“escovado” é acabamento). Confirme a família antes de orçar.' },
  { padrao: /calacat|yoshi|grey/, incerta: true, confirmar: true, nota: 'Nome e aparência não dizem se é mármore, quartzito, quartzo ou porcelânico. Confirme na ficha antes de indicar para cozinha.' },
];

/** Tom da pedra para os filtros Claras / Escuras (pelo nome; o que não se sabe fica no meio). */
export function tomDe(nome: string): Tom {
  const n = normalizar(nome);
  if (/preto|negro|nero|escuro|marrom|cafe|stellar|indiano|ubatuba|absoluto|escovado|lactea|gabriel|verde/.test(n) && !/branco stellar/.test(n)) return 'escuro';
  if (/grey claro|branco|bege|claro|alaska|calacat|itauna|nano|translucido|onix|taj|carrara|yoshi|parana|pitaya|arabesco|bahia|super prime/.test(n)) return 'claro';
  return 'medio';
}

export type FichaDaPedra = { familiaId: string | null; tom: Tom; onde: UsoId[]; nota?: string; confirmar: boolean };

/**
 * Ficha da pedra: família do catálogo, tom, onde usar (da observação da pedra ou da família) e a
 * observação dos guias. "Confirmar" só vale quando a família não tem notas de desempenho.
 */
export function fichaDaPedra(material: { name: string; familyId?: string | null }, familias: Pick<Familia, 'id' | 'uses' | 'desempenho'>[]): FichaDaPedra {
  const familia = familias.find((item) => item.id === material.familyId);
  const nome = normalizar(material.name);
  const incerta = !familia?.desempenho;
  const observacao = OBSERVACOES.find((item) => item.padrao.test(nome) && (!item.incerta || incerta));
  return { familiaId: familia?.id ?? null, tom: tomDe(material.name), onde: observacao?.onde ?? familia?.uses ?? [], nota: observacao?.nota, confirmar: !!observacao?.confirmar };
}

export const CUIDADOS: { titulo: string; texto: string }[] = [
  { titulo: 'Limpeza do dia a dia', texto: 'Retire o que derramar na hora. Pano macio, água e detergente neutro; enxágue e seque. Vinagre, limão, ácido muriático e abrasivos nunca em mármore, Bege Bahia e ônix.' },
  { titulo: 'Impermeabilização', texto: 'Teste antes e siga o fornecedor: a frequência depende da pedra, do selante, do acabamento e do uso. O selante atrasa a entrada de líquidos, mas não impede a marca de ácido.' },
  { titulo: 'Calor, sol e impacto', texto: 'Panela quente nunca direto sobre quartzo com resina. O quartzo comum pode mudar de cor ao sol. Bordas e recortes de qualquer pedra lascam com impacto.' },
  { titulo: 'Mancha não é marca de ácido', texto: 'Mancha é líquido ou pigmento absorvido; marca de ácido é perda de brilho e acontece mesmo na pedra impermeabilizada. Resistente não quer dizer imune.' },
  { titulo: 'Como confirmar um lote', texto: 'Peça o nome técnico, o fabricante ou a pedreira, a ficha de absorção e o manual de uso. Ensaios só em amostra descartável, nunca na chapa ou na obra.' },
];

export const DICAS: { titulo: string; texto: string }[] = [
  { titulo: 'Defina o uso', texto: 'Cada ambiente pede um nível diferente de resistência, estética e manutenção.' },
  { titulo: 'Considere o orçamento', texto: 'Pedras naturais raras custam mais; superfícies industrializadas chegam a um visual parecido por menos.' },
  { titulo: 'Pense na manutenção', texto: 'Quem não quer impermeabilizar deve olhar ultracompacto e quartzo.' },
  { titulo: 'Escolha a estética', texto: 'Veios marcantes ou cor uniforme? Brilho ou fosco? Cada material tem personalidade.' },
  { titulo: 'Veja a chapa real', texto: 'Foto e tela mudam a cor: aprove pela chapa ou pela amostra.' },
  { titulo: 'Ouça o marmorista', texto: 'Quem corta e instala conhece o comportamento real de cada pedra.' },
  { titulo: 'Combine materiais', texto: 'Pedras diferentes em cada ambiente equilibram custo e sofisticação.' },
  { titulo: 'Olhe a borda e o acabamento', texto: 'Polido, levigado ou escovado, reta ou meia-esquadria: o conjunto muda completamente o visual.' },
];

/** Inspirações (catálogo de projetos): referências visuais, não obras da Inova nem a pedra exata da foto. */
export type GrupoInspiracao = 'Cozinhas e ilhas' | 'Banheiros e lavatórios' | 'Nichos e peitoris' | 'Escadas e mesas' | 'Painéis e balcões' | 'Gourmet e lavanderia';
export const INSPIRACOES: { arquivo: string; titulo: string; grupo: GrupoInspiracao; texto: string; uso?: UsoId }[] = [
  { arquivo: 'ilha-cooktop', titulo: 'Ilha com cooktop', grupo: 'Cozinhas e ilhas', uso: 'cozinha', texto: 'Ilha em pedra clara com cascata lateral e cooktop embutido, frontão iluminado ao fundo.' },
  { arquivo: 'ilha-cuba', titulo: 'Ilha com cuba', grupo: 'Cozinhas e ilhas', uso: 'cozinha', texto: 'Tampo amplo com cuba de embutir e frontão contínuo na mesma pedra.' },
  { arquivo: 'ilha-banquetas', titulo: 'Ilha com banquetas', grupo: 'Cozinhas e ilhas', uso: 'cozinha', texto: 'Cascata dos dois lados e balanço para banquetas: a pedra vira o centro da cozinha.' },
  { arquivo: 'cuba-esculpida', titulo: 'Cuba de apoio esculpida', grupo: 'Banheiros e lavatórios', uso: 'banheiro', texto: 'Cuba esculpida em bloco único sobre bancada suspensa da mesma pedra.' },
  { arquivo: 'lavabo-suspenso', titulo: 'Lavabo suspenso', grupo: 'Banheiros e lavatórios', uso: 'banheiro', texto: 'Bancada suspensa com saia grossa e luz indireta valorizando os veios.' },
  { arquivo: 'lavatorio-coluna', titulo: 'Lavatório de coluna', grupo: 'Banheiros e lavatórios', uso: 'banheiro', texto: 'Peça escura de desenho orgânico, esculpida em pedra para lavabo social.' },
  { arquivo: 'nicho-triplo', titulo: 'Nicho triplo no box', grupo: 'Nichos e peitoris', uso: 'banheiro', texto: 'Três nichos alinhados com fita de LED, organizando o box.' },
  { arquivo: 'nicho-longo', titulo: 'Nicho iluminado', grupo: 'Nichos e peitoris', uso: 'banheiro', texto: 'Nicho corrido embutido na parede, com luz no topo.' },
  { arquivo: 'peitoril-granito', titulo: 'Peitoril em granito', grupo: 'Nichos e peitoris', uso: 'piso', texto: 'Peitoril escuro polido com borda reta e caimento para fora.' },
  { arquivo: 'escada-revestida', titulo: 'Escada revestida', grupo: 'Escadas e mesas', uso: 'piso', texto: 'Degraus, espelhos e parede na mesma pedra clara para um hall imponente.' },
  { arquivo: 'mesa-retangular', titulo: 'Mesa de jantar', grupo: 'Escadas e mesas', texto: 'Tampo de cantos arredondados sobre base metálica dourada.' },
  { arquivo: 'mesa-redonda', titulo: 'Mesa redonda com giratório', grupo: 'Escadas e mesas', texto: 'Tampo redondo com prato giratório na mesma pedra.' },
  { arquivo: 'balcao-iluminado', titulo: 'Balcão iluminado', grupo: 'Painéis e balcões', uso: 'gourmet', texto: 'Tampo polido sobre frente de pedra bruta com luz por baixo.' },
  { arquivo: 'painel-bookmatch', titulo: 'Painel de sala', grupo: 'Painéis e balcões', uso: 'painel', texto: 'Parede inteira em chapas com veios espelhados e iluminação indireta.' },
  { arquivo: 'painel-veios', titulo: 'Painel de veios marcantes', grupo: 'Painéis e balcões', uso: 'painel', texto: 'Chapas grandes com veios contínuos de ponta a ponta.' },
  { arquivo: 'gourmet-churrasqueira', titulo: 'Gourmet com churrasqueira', grupo: 'Gourmet e lavanderia', uso: 'gourmet', texto: 'Bancada escura com churrasqueira, cuba e apoio para servir.' },
  { arquivo: 'gourmet-ilha', titulo: 'Ilha gourmet externa', grupo: 'Gourmet e lavanderia', uso: 'gourmet', texto: 'Ilha em pedra escura no jardim, com cuba e churrasqueira integradas.' },
  { arquivo: 'lavanderia', titulo: 'Lavanderia', grupo: 'Gourmet e lavanderia', uso: 'lavanderia', texto: 'Bancada clara com cuba e lugar para as máquinas embaixo.' },
];

/** Bordas mais indicadas por uso (Tabela da Borda: "Qual borda indicar por tipo de serviço"). */
export const BORDAS_POR_USO: Record<UsoId, DesenhoDeBorda[]> = {
  cozinha: ['reta', 'saia', 'meia-esquadria', 'engrossada'],
  banheiro: ['boleada', 'bisote', 'meia-esquadria'],
  gourmet: ['saia', 'engrossada', 'meia-esquadria'],
  lavanderia: ['reta', 'saia'],
  piso: ['reta', 'pingadeira', 'bisote'],
  painel: ['reta', 'polida'],
};

/** Ambientes do simulador que mostram cada uso (o primeiro é o principal). */
export const CENAS_POR_USO: Record<UsoId, string[]> = {
  cozinha: ['Cozinha'], banheiro: ['Banheiro', 'Nicho de banheiro'], gourmet: ['Área gourmet'],
  lavanderia: ['Lavanderia'], piso: ['Escada', 'Porta / Soleira'], painel: ['Painel de TV', 'Lareira'],
};

/** Até `quantidade` ambientes para os usos da pedra: o principal de cada uso, depois os demais. */
export function cenasDosUsos(onde: UsoId[], quantidade = 3) {
  const titulos: string[] = [];
  for (const rodada of [0, 1]) for (const uso of onde) {
    const titulo = CENAS_POR_USO[uso][rodada];
    if (titulo && !titulos.includes(titulo)) titulos.push(titulo);
  }
  return titulos.slice(0, quantidade);
}

export const ROTULO_TOM: Record<Tom, string> = { claro: 'Clara', medio: 'Tom médio', escuro: 'Escura' };
