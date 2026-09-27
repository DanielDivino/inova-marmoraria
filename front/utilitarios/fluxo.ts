import { dataConclusaoAoMover, etapaConcluida, PROJECT_WORKFLOW_STATUSES, posicaoEntre, type FaseOrcamentoFluxo, type ProjectWorkflowStatus } from '@inova/domain';

export type ResponsavelFluxo = { id: string; name: string | null; color: string };
export type CartaoFluxo = {
  id: string; name: string; status: ProjectWorkflowStatus; position: number; completedAt: string | null; pieces: number;
  quote: { id: string; number: string; customerId: string; customerName: string; deadline: string | null; worker: ResponsavelFluxo | null; phase: FaseOrcamentoFluxo };
};
/** Resposta do movimento: `quoteDelivered` indica que o último projeto foi entregue e o orçamento foi para o Histórico. */
export type CartaoMovido = CartaoFluxo & { quoteDelivered: boolean };
/** `workerId` aceita também SEM_RESPONSAVEL, para achar orçamentos sem funcionário definido. */
export type FiltroFluxo = { customerId: string; quoteId: string; workerId: string };
export const SEM_RESPONSAVEL = 'sem-responsavel';
export type ResumoOrcamentoFluxo = { quote: CartaoFluxo['quote']; projetos: CartaoFluxo[]; concluidos: number; entregues: number; total: number; finalizado: boolean };

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

/** Colunas arrastáveis: projetos de orçamentos em execução, até o último ser entregue (aí o orçamento vai para o Histórico). */
export function colunasFluxo(cartoes: CartaoFluxo[]) {
  const emExecucao = cartoes.filter((cartao) => cartao.quote.phase === 'IN_EXECUTION');
  return Object.fromEntries(PROJECT_WORKFLOW_STATUSES.map((status) => [status, emExecucao.filter((cartao) => cartao.status === status).sort(ordemDoQuadro)])) as Record<ProjectWorkflowStatus, CartaoFluxo[]>;
}

const ORDEM_FASE: Record<FaseOrcamentoFluxo, number> = { IN_EXECUTION: 0, AWAITING_START: 1, AWAITING_APPROVAL: 2 };
const porPrazoENumero = (a: CartaoFluxo['quote'], b: CartaoFluxo['quote']) => (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31') || a.number.localeCompare(b.number);

/** Coluna "Aguardando início": aprovados sem início primeiro, depois os que aguardam aprovação; prazo mais próximo antes. */
export function aguardandoInicio(cartoes: CartaoFluxo[]) {
  return cartoes.filter((cartao) => cartao.quote.phase !== 'IN_EXECUTION')
    .sort((a, b) => ORDEM_FASE[a.quote.phase] - ORDEM_FASE[b.quote.phase] || porPrazoENumero(a.quote, b.quote) || (a.id < b.id ? -1 : 1));
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
    completedAt: dataConclusaoAoMover(cartao, status, agora.toISOString()),
  });
  return { cartoes: atualizados, afterId, beforeId };
}

/** Um resumo por orçamento, com o progresso dos projetos e o prazo mais próximo primeiro dentro de cada fase. */
export function resumirPorOrcamento(cartoes: CartaoFluxo[]): ResumoOrcamentoFluxo[] {
  const grupos = new Map<string, CartaoFluxo[]>();
  for (const cartao of cartoes) grupos.set(cartao.quote.id, [...(grupos.get(cartao.quote.id) ?? []), cartao]);
  const resumos = [...grupos.values()].map((projetos) => {
    const concluidos = projetos.filter((projeto) => etapaConcluida(projeto.status)).length;
    const entregues = projetos.filter((projeto) => projeto.status === 'DELIVERED').length;
    // Mesma ordem dos projetos no orçamento (ids criados em sequência).
    const ordenados = [...projetos].sort((a, b) => (a.id < b.id ? -1 : 1));
    return { quote: projetos[0].quote, projetos: ordenados, concluidos, entregues, total: projetos.length, finalizado: projetos[0].quote.phase === 'IN_EXECUTION' && concluidos === projetos.length };
  });
  // Em execução primeiro, depois os finalizados (prontos para entregar), por fim os que ainda não iniciaram.
  return resumos.sort((a, b) => ORDEM_FASE[a.quote.phase] - ORDEM_FASE[b.quote.phase] || Number(a.finalizado) - Number(b.finalizado) || porPrazoENumero(a.quote, b.quote));
}

/** Soltar este cartão em "Entregue" completa o orçamento: todos os outros projetos dele já foram entregues. */
export function entregaFinalDoOrcamento(cartoes: CartaoFluxo[], id: string) {
  const cartao = cartoes.find((entrada) => entrada.id === id);
  return !!cartao && cartoes.filter((entrada) => entrada.quote.id === cartao.quote.id && entrada.id !== id).every((entrada) => entrada.status === 'DELIVERED');
}

/** Data de calendário (AAAA-MM-DD) em dd/mm/aaaa, sem passar por fuso horário. */
export function formatarDataFluxo(data: string) {
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}
