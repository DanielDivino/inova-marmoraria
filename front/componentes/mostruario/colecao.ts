import { exibirPrecoMaterial, type UnidadeMaterial } from '../../utilitarios/material-price';
import type { Familia } from '../catalogo/tipos';
import { fichaDaPedra, normalizar, type FichaDaPedra, type Tom, type UsoId } from './conhecimento';
import { fotoPrincipal } from './imagens';

export type Material = {
  id: string; name: string; category: string; familyId?: string | null; description?: string | null; currentPrice: number | null;
  billingUnit?: UnidadeMaterial; isActive: boolean; images?: { id?: string; url: string; isPrimary: boolean }[];
};
/** Pedra do mostruário: o material do catálogo com a ficha dos guias. `exemplo`: só amostra visual. */
export type Pedra = Material & { ficha: FichaDaPedra; familia?: Familia; exemplo?: boolean };

/** Amostras visuais para pedras que não estão no catálogo ativo (preço sob consulta), com a família pelo nome. */
const EXEMPLOS: [string, string, string][] = [
  ['Alaska', 'alaska', 'Granito'], ['Bege Arabesco', 'bege-arabesco', 'Granito'], ['Grey Claro', 'grey-claro', 'Ultracompacto'],
  ['Grey Escuro', 'grey-escuro', 'Ultracompacto'], ['Nero Marquina', 'nero-marquina', 'Mármore'],
];

/** Pedras ativas do catálogo, mais os exemplos visuais que o catálogo ativo não tem; cada uma com a ficha. */
export function montarPedras(catalogo: Material[], familias: Familia[]): Pedra[] {
  const ativos = catalogo.filter((material) => material.isActive);
  const nomes = new Set(ativos.map((material) => normalizar(material.name)));
  const exemplos: Material[] = EXEMPLOS.filter(([nome]) => !nomes.has(normalizar(nome))).map(([name, arquivo, familia]) => ({
    id: `exemplo-${arquivo}`, name, category: familia, familyId: familias.find((item) => item.name === familia)?.id ?? null, currentPrice: null, isActive: true,
    images: [{ url: `/mostruario-pedras/${arquivo}.webp`, isPrimary: true }],
  }));
  const comFicha = (material: Material) => ({ ...material, ficha: fichaDaPedra(material, familias), familia: familias.find((familia) => familia.id === material.familyId) });
  return [...ativos.map(comFicha), ...exemplos.map((material) => ({ ...comFicha(material), exemplo: true }))]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export type Ordem = 'nome' | 'menor' | 'maior';
/** `familia`: id da família no catálogo ou 'todas'. */
export type FiltroColecao = { familia: string; tom: Tom | 'todos'; uso: UsoId | 'todos'; ordem: Ordem; busca: string };
export const FILTRO_INICIAL: FiltroColecao = { familia: 'todas', tom: 'todos', uso: 'todos', ordem: 'nome', busca: '' };

export const temPreco = (pedra: Material) => Number(pedra.currentPrice) > 0;
export const precoDaPedra = (pedra: Material) => temPreco(pedra) ? exibirPrecoMaterial(pedra.currentPrice, pedra.billingUnit) : 'Preço sob consulta';

/** Pedras que passam nos filtros (menos o de família, para contar cada família), na ordem pedida. */
export function filtrarPedras(pedras: Pedra[], filtro: FiltroColecao, ignorarFamilia = false) {
  const busca = normalizar(filtro.busca.trim());
  const lista = pedras.filter((pedra) => (ignorarFamilia || filtro.familia === 'todas' || pedra.ficha.familiaId === filtro.familia)
    && (filtro.tom === 'todos' || pedra.ficha.tom === filtro.tom)
    && (filtro.uso === 'todos' || pedra.ficha.onde.includes(filtro.uso))
    && (!busca || normalizar(`${pedra.name} ${pedra.category}`).includes(busca)));
  if (filtro.ordem === 'nome') return lista;
  // Por preço: as sem preço (sob consulta) vão para o fim nos dois sentidos.
  const sinal = filtro.ordem === 'menor' ? 1 : -1;
  return [...lista].sort((a, b) => Number(temPreco(b)) - Number(temPreco(a)) || sinal * (Number(a.currentPrice) - Number(b.currentPrice)) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Pedras para a abertura: com foto, alternando claras e escuras, sem repetir família seguida quando dá. */
export function destaquesDaAbertura(pedras: Pedra[], quantidade = 6) {
  const comFoto = pedras.filter((pedra) => fotoPrincipal(pedra) && !pedra.exemplo);
  const preferidas = ['branco dallas', 'preto sao gabriel', 'taj mahal', 'calacata carrara', 'verde ubatuba', 'marmore branco'];
  const escolhidas = preferidas.map((nome) => comFoto.find((pedra) => normalizar(pedra.name) === nome)).filter((pedra): pedra is Pedra => !!pedra);
  for (const pedra of comFoto) if (escolhidas.length < quantidade && !escolhidas.includes(pedra)) escolhidas.push(pedra);
  return escolhidas.slice(0, quantidade);
}
