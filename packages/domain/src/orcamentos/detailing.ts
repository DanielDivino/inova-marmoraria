export const QUOTE_ENTRY_MODES = ['QUICK', 'DETAILED'] as const;
export const DETAILING_STATUSES = ['PENDING', 'COMPLETED'] as const;
export type QuoteEntryMode = typeof QUOTE_ENTRY_MODES[number];

function metadata(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

export function modoEntradaOrcamento(data: unknown): QuoteEntryMode {
  return metadata(data).entryMode === 'QUICK' ? 'QUICK' : 'DETAILED';
}

/** Existing detailed projects retain their drawings. Quick projects require an explicit review. */
export function projetoTemDesenho(data: unknown): boolean {
  const value = metadata(data);
  return value.detailingStatus === 'COMPLETED' || (value.detailingStatus !== 'PENDING' && value.entryMode !== 'QUICK');
}

export function dadosEntradaProjeto(data: unknown, entryMode: QuoteEntryMode): Record<string, unknown> {
  return { ...metadata(data), entryMode, detailingStatus: projetoTemDesenho(data) && entryMode === 'DETAILED' ? 'COMPLETED' : 'PENDING' };
}
