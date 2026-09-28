import { DEADLINE_LABELS, DEADLINE_TONES, obterStatusPrazo, obterStatusTrabalho, WORK_STATUS_LABELS, WORK_STATUS_TONES, STATUS_LEGEND, type QuoteProgress } from '@inova/domain';

/** Selo da situação do trabalho (ex.: "Em produção"). */
export function SeloTrabalho({ quote }: { quote: QuoteProgress }) {
  const work = obterStatusTrabalho(quote);
  return <span className={`status status-${WORK_STATUS_TONES[work]}`}>{quote.status === 'CANCELLED' ? (quote.approvedAt ? 'Cliente desistiu' : 'Cancelado') : quote.status === 'EXPIRED' ? 'Expirado' : WORK_STATUS_LABELS[work]}</span>;
}

/** Selo da situação do prazo (ex.: "Próximo do prazo"). */
export function SeloPrazo({ quote }: { quote: QuoteProgress }) {
  const deadline = obterStatusPrazo(quote);
  return <span className={`status status-${DEADLINE_TONES[deadline]}`}>{DEADLINE_LABELS[deadline]}</span>;
}

export function StatusOrcamento({ quote }: { quote: QuoteProgress }) {
  return <div className="status-badges"><SeloTrabalho quote={quote} /><SeloPrazo quote={quote} /></div>;
}

export function StatusLegend() {
  return <div className="status-legend" aria-label="Legenda das cores dos projetos">{STATUS_LEGEND.map((badge) => <span key={badge.tone}><i className={`status-dot status-${badge.tone}`} aria-hidden="true" />{badge.label}</span>)}</div>;
}
