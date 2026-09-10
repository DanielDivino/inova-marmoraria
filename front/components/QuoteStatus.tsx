import { getQuoteBadges, STATUS_LEGEND, type QuoteProgress } from '@inova/domain';

export function QuoteStatus({ quote }: { quote: QuoteProgress }) {
  return <div className="status-badges">{getQuoteBadges(quote).map((badge) => <span className={`status status-${badge.tone}`} key={badge.label}>{badge.label}</span>)}</div>;
}

export function StatusLegend() {
  return <div className="status-legend" aria-label="Legenda das cores dos projetos">{STATUS_LEGEND.map((badge) => <span key={badge.tone}><i className={`status-dot status-${badge.tone}`} aria-hidden="true" />{badge.label}</span>)}</div>;
}
