import { PROJECT_WORKFLOW_STATUSES, posicaoEntre, type ProjectWorkflowStatus } from '@inova/domain';

export type ResponsavelFluxo = { id: string; name: string | null; color: string };
export type CartaoFluxo = {
  id: string; name: string; status: ProjectWorkflowStatus; position: number; completedAt: string | null; pieces: number;
  quote: { id: string; number: string; customerId: string; customerName: string; deadline: string | null; worker: ResponsavelFluxo | null };
};
/** `workerId` aceita também SEM_RESPONSAVEL, para achar orçamentos sem funcionário definido. */
export type FiltroFluxo = { customerId: string; quoteId: string; workerId: string };
export const SEM_RESPONSAVEL = 'sem-responsavel';
export type ResumoOrcamentoFluxo = { quote: CartaoFluxo['quote']; projetos: CartaoFluxo[]; concluidos: number; total: number; finalizado: boolean };

/** Tons distintos entre si e legíveis nos dois temas; sem vermelho, que no quadro significa prazo vencido. */
const CORES_ORCAMENTO = ['#2f6fb0', '#2e8b57', '#b0602f', '#8a4fb3', '#a0439c', '#1f8a8a', '#9a7b1c', '#5a6fb8', '#6b8e23', '#4f6d7a', '#7a5c3e', '#3d7f9e'];

/** Cor fixa por orçamento: todos os projetos do mesmo orçamento têm a mesma etiqueta, em qualquer tela ou filtro. */
export function corOrcamento(quoteId: string) {
  let hash = 0;
  for (const caractere of quoteId) hash = (hash * 31 + caractere.charCodeAt(0)) >>> 0;
  return CORES_ORCAMENTO[hash % CORES_ORCAMENTO.length];
}

export function filtrarCartoes(cartoes: CartaoFluxo[], filtro: FiltroFluxo) {
  return cartoes.filter((cartao) => (!filtro.customerId || cartao.quote.customerId === filtro.customerId)
    && (!filtro.quoteId || cartao.quote.id === filtro.quoteId)
    && (!filtro.workerId || (filtro.workerId === SEM_RESPONSAVEL ? !cartao.quote.worker : cartao.quote.worker?.id === filtro.workerId)));
}

export const nomeResponsavel = (responsavel: ResponsavelFluxo) => responsavel.name?.trim() || 'Funcionário sem nome';
export const rotuloPecas = (pecas: number) => `${pecas} ${pecas === 1 ? 'peça' : 'peças'}`;

const ordemDoQuadro = (a: CartaoFluxo, b: CartaoFluxo) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function colunasFluxo(cartoes: CartaoFluxo[]) {
  return Object.fromEntries(PROJECT_WORKFLOW_STATUSES.map((status) => [status, cartoes.filter((cartao) => cartao.status === status).sort(ordemDoQuadro)])) as Record<ProjectWorkflowStatus, CartaoFluxo[]>;
}

/**
 * Aplica na lista local o cartão solto na coluna `status`, onde `idsDestino` é a
 * ordem visível final da coluna (já com o cartão). Devolve os vizinhos que o
 * backend usa para gravar a mesma posição.
 */
export function moverCartaoLocal(cartoes: CartaoFluxo[], id: string, status: ProjectWorkflowStatus, idsDestino: string[], agora = new Date()) {
  const indice = idsDestino.indexOf(id);
  const afterId = idsDestino[indice - 1] ?? null;
  const beforeId = idsDestino[indice + 1] ?? null;
  const posicaoDe = (vizinho: string | null) => vizinho ? cartoes.find((cartao) => cartao.id === vizinho)?.position : undefined;
  const ultima = Math.max(-1, ...cartoes.filter((cartao) => cartao.status === status && cartao.id !== id).map((cartao) => cartao.position));
  const position = afterId || beforeId ? posicaoEntre(posicaoDe(afterId), posicaoDe(beforeId)) : ultima + 1;
  const atualizados = cartoes.map((cartao) => cartao.id !== id ? cartao : {
    ...cartao, status, position,
    completedAt: status !== 'DONE' ? null : cartao.status === 'DONE' ? cartao.completedAt : agora.toISOString(),
  });
  return { cartoes: atualizados, afterId, beforeId };
}

/** Um resumo por orçamento: pendentes primeiro, pelo prazo mais próximo; finalizados no fim. */
export function resumirPorOrcamento(cartoes: CartaoFluxo[]): ResumoOrcamentoFluxo[] {
  const grupos = new Map<string, CartaoFluxo[]>();
  for (const cartao of cartoes) grupos.set(cartao.quote.id, [...(grupos.get(cartao.quote.id) ?? []), cartao]);
  const resumos = [...grupos.values()].map((projetos) => {
    const concluidos = projetos.filter((projeto) => projeto.status === 'DONE').length;
    // Mesma ordem dos projetos no orçamento (ids criados em sequência).
    const ordenados = [...projetos].sort((a, b) => (a.id < b.id ? -1 : 1));
    return { quote: projetos[0].quote, projetos: ordenados, concluidos, total: projetos.length, finalizado: concluidos === projetos.length };
  });
  return resumos.sort((a, b) => Number(a.finalizado) - Number(b.finalizado)
    || (a.quote.deadline ?? '9999-12-31').localeCompare(b.quote.deadline ?? '9999-12-31')
    || a.quote.number.localeCompare(b.quote.number));
}

/** Data de calendário (AAAA-MM-DD) em dd/mm/aaaa, sem passar por fuso horário. */
export function formatarDataFluxo(data: string) {
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}
