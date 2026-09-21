import { DEADLINE_LABELS, DEADLINE_TONES, obterStatusPrazo, obterStatusTrabalho, WORK_STATUS_LABELS, WORK_STATUS_TONES, STATUS_LEGEND, type QuoteProgress } from '@inova/domain';

export function StatusOrcamento({ quote }: { quote: QuoteProgress }) {
  const work = obterStatusTrabalho(quote);
  const deadline = obterStatusPrazo(quote);
  return <div className="status-badges"><span className={`status status-${WORK_STATUS_TONES[work]}`}>{WORK_STATUS_LABELS[work]}</span><span className={`status status-${DEADLINE_TONES[deadline]}`}>{DEADLINE_LABELS[deadline]}</span></div>;
}

export function StatusLegend() {
  return <div className="status-legend" aria-label="Legenda das cores dos projetos">{STATUS_LEGEND.map((badge) => <span key={badge.tone}><i className={`status-dot status-${badge.tone}`} aria-hidden="true" />{badge.label}</span>)}</div>;
}
