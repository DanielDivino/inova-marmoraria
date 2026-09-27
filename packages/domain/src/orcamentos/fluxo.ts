import { dataAtualEmpresa, dataCalendario, deslocarDataCalendario } from './tracking.js';

/** Colunas do Kanban de projetos; a ordem é a das colunas na tela. */
export const PROJECT_WORKFLOW_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type ProjectWorkflowStatus = typeof PROJECT_WORKFLOW_STATUSES[number];
export const PROJECT_WORKFLOW_LABELS: Record<ProjectWorkflowStatus, string> = {
  TODO: 'A fazer', IN_PROGRESS: 'Em andamento', DONE: 'Concluído',
};

/** Execuções fora do Kanban: orçamento ainda não iniciado ou já entregue (histórico). */
export const EXECUCOES_FORA_DO_FLUXO = ['NOT_STARTED', 'COMPLETED'] as const;

/** O fluxo avisa com uma semana de antecedência; o aviso de 3 dias do acompanhamento não muda. */
export const PRAZO_PROXIMO_FLUXO_DIAS = 7;
export type SituacaoPrazoFluxo = 'SEM_PRAZO' | 'VENCIDO' | 'PROXIMO' | 'NO_PRAZO' | 'CONCLUIDO';
export const SITUACAO_PRAZO_FLUXO_LABELS: Record<SituacaoPrazoFluxo, string> = {
  SEM_PRAZO: 'Sem prazo', VENCIDO: 'Prazo vencido', PROXIMO: 'Vence em até 7 dias', NO_PRAZO: 'No prazo', CONCLUIDO: 'Concluído',
};

/** Prazo final em data de calendário: vencido antes de hoje, próximo até 7 dias à frente. Trabalho concluído não fica em alerta. */
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
