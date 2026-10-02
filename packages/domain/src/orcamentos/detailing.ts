/**
 * Marcas antigas do drawingData do projeto: o modo (Rápido ou o extinto "Com desenho") e se o
 * desenho do detalhamento foi concluído. Não têm mais efeito — o Orçamento Rápido é o único modo e
 * a ordem de serviço sai sempre — mas os projetos salvos ainda as trazem, então continuam aceitas.
 */
export const QUOTE_ENTRY_MODES = ['QUICK', 'DETAILED'] as const;
export const DETAILING_STATUSES = ['PENDING', 'COMPLETED'] as const;
