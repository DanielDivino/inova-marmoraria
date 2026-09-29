/**
 * Rascunho do Novo orçamento guardado no servidor: os clientes abertos e os seus projetos
 * são os mesmos no celular e no computador. Cada aparelho continua com a sua cópia local
 * (funciona sem internet) e só escolhe qual cliente e qual projeto estão abertos na tela.
 */
export type EspacoSincronizavel = { id: string; activeIndex: number };
export type DadosRascunhoServidor<W> = { workspaces: W[]; removedWorkspaceIds: string[] };
/** Atendimentos salvos ou apagados que continuam lembrados, para outro aparelho não trazê-los de volta. */
export const LIMITE_REMOVIDOS = 150;

/** O que vai ao servidor: só os atendimentos com dados, não removidos, e sem o projeto aberto (cada aparelho abre o seu). */
export function conteudoParaServidor<W extends EspacoSincronizavel>(espacos: W[], removidos: string[], temDados: (espaco: W) => boolean) {
  const lembrados = removidos.slice(-LIMITE_REMOVIDOS);
  const fora = new Set(lembrados);
  return JSON.stringify({ workspaces: espacos.filter((espaco) => temDados(espaco) && !fora.has(espaco.id)).map(({ activeIndex, ...resto }) => resto), removedWorkspaceIds: lembrados });
}

/** Lê o rascunho vindo do servidor, ignorando o que não tiver o formato esperado. */
export function lerDadosServidor<W extends { id: string }>(dados: unknown): DadosRascunhoServidor<Partial<W> & { id: string }> {
  const entrada = (dados && typeof dados === 'object' ? dados : {}) as { workspaces?: unknown; removedWorkspaceIds?: unknown };
  const workspaces = Array.isArray(entrada.workspaces) ? entrada.workspaces.filter((espaco): espaco is Partial<W> & { id: string } => !!espaco && typeof espaco === 'object' && typeof (espaco as { id?: unknown }).id === 'string') : [];
  const removedWorkspaceIds = Array.isArray(entrada.removedWorkspaceIds) ? entrada.removedWorkspaceIds.filter((id): id is string => typeof id === 'string') : [];
  return { workspaces, removedWorkspaceIds };
}

/** Texto que identifica o conteúdo de um atendimento (sem o projeto aberto), igual qualquer que seja a ordem dos campos. */
export function assinaturaEspaco<W extends EspacoSincronizavel | { id: string }>(espaco: W) {
  const ordenar = (valor: unknown): unknown => Array.isArray(valor) ? valor.map(ordenar) : valor && typeof valor === 'object' ? Object.fromEntries(Object.keys(valor).sort().map((chave) => [chave, ordenar((valor as Record<string, unknown>)[chave])])) : valor;
  const { activeIndex, ...resto } = espaco as W & { activeIndex?: number };
  return JSON.stringify(ordenar(JSON.parse(JSON.stringify(resto))));
}
/** Assinaturas dos atendimentos de uma versão, para saber depois o que cada aparelho mudou desde ela. */
export const assinaturas = <W extends { id: string }>(espacos: W[]) => new Map(espacos.map((espaco) => [espaco.id, assinaturaEspaco(espaco)]));

/**
 * Os dois aparelhos mudaram o rascunho: fica com os atendimentos dos dois lados, menos os salvos
 * ou apagados em qualquer um deles. No atendimento que existe nos dois, vale o do servidor se este
 * aparelho não o mudou desde a última versão em comum ("base"); se mudou, vale o deste aparelho.
 */
export function juntarRascunhos<W extends { id: string }>(local: DadosRascunhoServidor<W>, servidor: DadosRascunhoServidor<W>, temDados: (espaco: W) => boolean, base: Map<string, string> = new Map()): DadosRascunhoServidor<W> {
  const removedWorkspaceIds = [...new Set([...servidor.removedWorkspaceIds, ...local.removedWorkspaceIds])].slice(-LIMITE_REMOVIDOS);
  const fora = new Set(removedWorkspaceIds);
  const locais = new Map(local.workspaces.map((espaco) => [espaco.id, espaco]));
  const mudouAqui = (espaco: W) => base.get(espaco.id) !== assinaturaEspaco(espaco);
  const juntos = servidor.workspaces.map((espaco) => { const aqui = locais.get(espaco.id); return aqui && mudouAqui(aqui) ? aqui : espaco; });
  for (const espaco of local.workspaces) if (!juntos.some((outro) => outro.id === espaco.id)) juntos.push(espaco);
  return { workspaces: juntos.filter((espaco) => !fora.has(espaco.id) && temDados(espaco)), removedWorkspaceIds };
}
