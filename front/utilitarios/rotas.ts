/**
 * Rotas entre as telas: de onde o orçamento foi aberto (para o caminho no topo e o "voltar"
 * levarem de volta ao lugar certo) e as listas que lembram os filtros ao voltar para elas.
 */

/** De onde o orçamento foi aberto. Sem origem, ele pertence a Orçamentos (ou ao Histórico, se encerrado). */
export type OrigemOrcamento = 'fluxo' | 'cliente' | 'dashboard' | 'historico';
const ORIGENS: readonly OrigemOrcamento[] = ['fluxo', 'cliente', 'dashboard', 'historico'];
/** Origem e, vindo do Fluxo, o cartão para destacar ao voltar. */
export type Origem = { de: OrigemOrcamento | null; cartao?: string | null };
export const SEM_ORIGEM: Origem = { de: null };

export function lerOrigem(parametros: URLSearchParams | { get: (nome: string) => string | null }): Origem {
  const de = parametros.get('de');
  const cartao = parametros.get('cartao');
  return ORIGENS.includes(de as OrigemOrcamento) ? { de: de as OrigemOrcamento, ...(de === 'fluxo' && cartao ? { cartao } : {}) } : SEM_ORIGEM;
}

/** Junta parâmetros ao endereço, antes da âncora (#), sem repetir os que já existem. */
export function comParametros(endereco: string, parametros: Record<string, string | null | undefined>) {
  const [semAncora, ancora] = endereco.split('#');
  const [caminho, consulta = ''] = semAncora.split('?');
  const busca = new URLSearchParams(consulta);
  for (const [nome, valor] of Object.entries(parametros)) if (valor) busca.set(nome, valor); else busca.delete(nome);
  const texto = busca.toString();
  return `${caminho}${texto ? `?${texto}` : ''}${ancora ? `#${ancora}` : ''}`;
}

/** Endereço do orçamento (ou de uma tela dentro dele) levando junto a origem. */
export function enderecoOrcamento(id: string, origem: Origem = SEM_ORIGEM, { tela, parametros, ancora }: { tela?: 'editar' | 'remontagem'; parametros?: Record<string, string | null | undefined>; ancora?: string } = {}) {
  const base = `/orcamentos/${id}${tela ? `/${tela}` : ''}${ancora ? `#${ancora}` : ''}`;
  return comParametros(base, { de: origem.de, cartao: origem.de === 'fluxo' ? origem.cartao : null, ...parametros });
}

/** Encerrado (recusado, cancelado, vencido ou entregue): fica no Histórico, não em Orçamentos. */
export const orcamentoEncerrado = (quote: { status: string; executionStatus?: string | null }) =>
  ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(quote.status) || quote.executionStatus === 'COMPLETED';

export type Lista = 'orcamentos' | 'historico' | 'fluxo' | 'clientes';
const LISTAS: Record<Lista, { endereco: string; rotulo: string }> = {
  orcamentos: { endereco: '/orcamentos', rotulo: 'Orçamentos' },
  historico: { endereco: '/historico', rotulo: 'Histórico' },
  fluxo: { endereco: '/fluxo', rotulo: 'Fluxo de trabalho' },
  clientes: { endereco: '/clientes', rotulo: 'Clientes' },
};
const chaveLista = (lista: Lista) => `inova_lista:${lista}`;
/** A lista guarda o próprio endereço com os filtros (nesta aba do navegador) sempre que eles mudam. */
export function lembrarLista(lista: Lista, endereco: string) {
  try { sessionStorage.setItem(chaveLista(lista), endereco); } catch { /* sem armazenamento: volta sem filtros */ }
}
/** Endereço para voltar à lista como ela estava (filtros, aba, página). */
export function enderecoDaLista(lista: Lista) {
  try {
    const guardado = sessionStorage.getItem(chaveLista(lista));
    if (guardado && guardado.split(/[?#]/)[0] === LISTAS[lista].endereco) return guardado;
  } catch { /* sem armazenamento */ }
  return LISTAS[lista].endereco;
}

export type ItemCaminho = { rotulo: string; href: string };
type OrcamentoNoCaminho = { id: string; number: string; customerId: string; customerNameSnapshot: string; status: string; executionStatus?: string | null };

/**
 * Caminho até o orçamento, conforme de onde ele foi aberto:
 * Fluxo de trabalho · Clientes › cliente · Dashboard · Histórico · Orçamentos.
 */
export function caminhoAteOrcamento(quote: Omit<OrcamentoNoCaminho, 'id' | 'number'>, origem: Origem, lista: (lista: Lista) => string = enderecoDaLista): ItemCaminho[] {
  if (origem.de === 'fluxo') return [{ rotulo: LISTAS.fluxo.rotulo, href: comParametros(lista('fluxo'), { cartao: origem.cartao }) }];
  if (origem.de === 'cliente') return [{ rotulo: LISTAS.clientes.rotulo, href: lista('clientes') }, { rotulo: quote.customerNameSnapshot, href: `/clientes/${quote.customerId}` }];
  if (origem.de === 'dashboard') return [{ rotulo: 'Dashboard', href: '/dashboard' }];
  const noHistorico = origem.de === 'historico' || orcamentoEncerrado(quote);
  return [{ rotulo: noHistorico ? LISTAS.historico.rotulo : LISTAS.orcamentos.rotulo, href: lista(noHistorico ? 'historico' : 'orcamentos') }];
}
/** Caminho de uma tela dentro do orçamento (Editar, Desmontagem e remontagem, Desenho técnico). */
export const caminhoDentroDoOrcamento = (quote: OrcamentoNoCaminho, origem: Origem, lista?: (lista: Lista) => string): ItemCaminho[] =>
  [...caminhoAteOrcamento(quote, origem, lista), { rotulo: quote.number, href: enderecoOrcamento(quote.id, origem) }];

/** Para onde voltar depois do login: só endereços internos do sistema (nunca outro site). */
export function voltaSegura(valor: string | null | undefined) {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\') || valor.startsWith('/login')) return '/';
  return valor;
}
export const enderecoLogin = (atual?: string) => {
  const volta = voltaSegura(atual);
  return volta === '/' ? '/login' : `/login?voltar=${encodeURIComponent(volta)}`;
};
