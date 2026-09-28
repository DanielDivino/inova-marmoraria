import { dataAtualEmpresa, dataCalendario, deslocarDataCalendario } from './tracking.js';

/** Colunas do Kanban de projetos; a ordem é a das colunas na tela. */
export const PROJECT_WORKFLOW_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'DELIVERED'] as const;
export type ProjectWorkflowStatus = typeof PROJECT_WORKFLOW_STATUSES[number];
export const PROJECT_WORKFLOW_LABELS: Record<ProjectWorkflowStatus, string> = {
  TODO: 'A fazer', IN_PROGRESS: 'Em andamento', DONE: 'Produzido – entrega/montagem', DELIVERED: 'Entregue',
};

/** De "Produzido – entrega/montagem" em diante a produção do projeto terminou. */
export const ETAPAS_CONCLUIDAS: readonly ProjectWorkflowStatus[] = ['DONE', 'DELIVERED'];
export const etapaConcluida = (status: ProjectWorkflowStatus) => ETAPAS_CONCLUIDAS.includes(status);

/**
 * Data de conclusão ao mover: preenchida ao chegar em "Produzido" (ou depois),
 * mantida enquanto o projeto segue para entrega e limpa se ele voltar para antes.
 */
export function dataConclusaoAoMover<T>(anterior: { status: ProjectWorkflowStatus; completedAt: T | null }, novoStatus: ProjectWorkflowStatus, agora: T): T | null {
  if (!etapaConcluida(novoStatus)) return null;
  return etapaConcluida(anterior.status) && anterior.completedAt ? anterior.completedAt : agora;
}

/** Execuções que não podem ser movidas no quadro: ainda não iniciado ou já entregue (histórico). */
// Produção parada também sai das colunas de trabalho (os cartões ficam guardados na etapa em que estavam).
export const EXECUCOES_FORA_DO_FLUXO = ['NOT_STARTED', 'PAUSED', 'COMPLETED'] as const;

/**
 * Fase do orçamento no quadro. Antes de iniciar (aguardando aprovação ou
 * aprovado sem início), os projetos ficam só na coluna "Aguardando início";
 * iniciado, entram em A fazer / Em andamento / Produzido / Entregue. Recusado, cancelado,
 * expirado e entregue ficam fora (histórico).
 */
export type FaseOrcamentoFluxo = 'AWAITING_APPROVAL' | 'AWAITING_START' | 'PAUSED' | 'IN_EXECUTION';
export const FASE_ORCAMENTO_FLUXO_LABELS: Record<FaseOrcamentoFluxo, string> = {
  AWAITING_APPROVAL: 'Aguardando aprovação', AWAITING_START: 'Aprovado · falta iniciar', PAUSED: 'Produção parada', IN_EXECUTION: 'Em execução',
};
export function faseOrcamentoFluxo(quote: { status: string; executionStatus?: string | null }): FaseOrcamentoFluxo | null {
  if (['DRAFT', 'SENT'].includes(quote.status)) return 'AWAITING_APPROVAL';
  if (quote.status !== 'APPROVED' || quote.executionStatus === 'COMPLETED') return null;
  if (quote.executionStatus === 'PAUSED') return 'PAUSED';
  return !quote.executionStatus || quote.executionStatus === 'NOT_STARTED' ? 'AWAITING_START' : 'IN_EXECUTION';
}

/** O fluxo avisa com uma semana de antecedência; o aviso de 3 dias do acompanhamento não muda. */
export const PRAZO_PROXIMO_FLUXO_DIAS = 7;
export type SituacaoPrazoFluxo = 'SEM_PRAZO' | 'VENCIDO' | 'PROXIMO' | 'NO_PRAZO' | 'CONCLUIDO';
export const SITUACAO_PRAZO_FLUXO_LABELS: Record<SituacaoPrazoFluxo, string> = {
  SEM_PRAZO: 'Sem prazo', VENCIDO: 'Prazo vencido', PROXIMO: 'Vence em até 7 dias', NO_PRAZO: 'No prazo', CONCLUIDO: 'Entregue',
};

/** Prazo final em data de calendário: vencido antes de hoje, próximo até 7 dias à frente. Trabalho entregue não fica em alerta. */
export function situacaoPrazoFluxo(prazoFinal: string | Date | null | undefined, concluido = false, now = new Date()): SituacaoPrazoFluxo {
  if (concluido) return 'CONCLUIDO';
  if (!prazoFinal) return 'SEM_PRAZO';
  const dia = dataCalendario(prazoFinal), hoje = dataAtualEmpresa(now);
  if (dia < hoje) return 'VENCIDO';
  return dia <= deslocarDataCalendario(hoje, PRAZO_PROXIMO_FLUXO_DIAS) ? 'PROXIMO' : 'NO_PRAZO';
}

/** Posição do cartão solto entre dois vizinhos: o meio do caminho; sem vizinho de um lado, um passo além do outro. */
export function posicaoEntre(anterior?: number, seguinte?: number) {
  if (anterior === undefined) return seguinte === undefined ? 0 : seguinte - 1;
  if (seguinte === undefined) return anterior + 1;
  return (anterior + seguinte) / 2;
}
