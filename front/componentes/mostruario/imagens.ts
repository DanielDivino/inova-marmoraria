/** Larguras das miniaturas que a API gera (`/miniaturas/:largura/...`). */
export type LarguraImagem = 96 | 320 | 480 | 960 | 1600;
export type ComFotos = { images?: { url: string; isPrimary: boolean }[] };

export const fotoPrincipal = (material?: ComFotos) => material?.images?.find((imagem) => imagem.isPrimary)?.url ?? material?.images?.[0]?.url;

/**
 * Endereço da foto no tamanho pedido: as enviadas (`/uploads/...`) vêm da API já reduzidas e em
 * WebP; as do próprio site (exemplos do mostruário) têm a versão de 480 px ao lado da de 960 px.
 */
export function urlDaFoto(url: string | undefined, largura: LarguraImagem) {
  if (!url) return undefined;
  if (url.startsWith('/uploads/')) return `/api/miniaturas/${largura}/${url.slice('/uploads/'.length)}`;
  if (url.startsWith('/mostruario-pedras/') && largura <= 480) return url.replace(/\.webp$/, '-480.webp');
  return url;
}

export const fotoDaPedra = (material: ComFotos | undefined, largura: LarguraImagem) => urlDaFoto(fotoPrincipal(material), largura);
