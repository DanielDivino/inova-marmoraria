import { dataAtualEmpresa } from '@inova/domain';

const MONTH_LABELS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

export function siglaMesOrcamento(month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mês inválido para numeração do orçamento.');
  return MONTH_LABELS[month - 1];
}

export function periodoNumeroOrcamento(data: Date) {
  const [year, month] = dataAtualEmpresa(data).split('-').map(Number);
  return { year, month };
}

export function formatarNumeroOrcamento(data: Date, sequencia: number) {
  const { year, month } = periodoNumeroOrcamento(data);
  return `${siglaMesOrcamento(month)}-${year}-${String(sequencia).padStart(2, '0')}`;
}
