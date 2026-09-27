import { dataAtualEmpresa, deslocarDataCalendario } from '@inova/domain';

export type PeriodoRapido = 'HOJE' | 'SETE_DIAS' | 'TRINTA_DIAS';
export type OpcaoPeriodo = 'TODOS' | PeriodoRapido | 'PERSONALIZADO';
export const OPCOES_PERIODO: { valor: OpcaoPeriodo; rotulo: string }[] = [
  { valor: 'TODOS', rotulo: 'Todos os períodos' },
  { valor: 'HOJE', rotulo: 'Hoje' },
  { valor: 'SETE_DIAS', rotulo: 'Últimos 7 dias' },
  { valor: 'TRINTA_DIAS', rotulo: 'Últimos 30 dias' },
  { valor: 'PERSONALIZADO', rotulo: 'Personalizado' },
];

/** Intervalo em datas de calendário (AAAA-MM-DD) no fuso da empresa, incluindo o dia de hoje. */
export function intervaloDoPeriodo(periodo: PeriodoRapido, agora = new Date()): { from: string; to: string } {
  const hoje = dataAtualEmpresa(agora);
  const dias = { HOJE: 0, SETE_DIAS: 6, TRINTA_DIAS: 29 }[periodo];
  return { from: deslocarDataCalendario(hoje, -dias), to: hoje };
}

/** Qual opção corresponde às datas escolhidas; datas que não batem com um atalho são "Personalizado". */
export function periodoSelecionado(from: string, to: string, agora = new Date()): OpcaoPeriodo {
  if (!from && !to) return 'TODOS';
  const atalho = OPCOES_PERIODO.find(({ valor }) => valor !== 'TODOS' && valor !== 'PERSONALIZADO'
    && intervaloDoPeriodo(valor, agora).from === from && intervaloDoPeriodo(valor, agora).to === to);
  return atalho?.valor ?? 'PERSONALIZADO';
}
