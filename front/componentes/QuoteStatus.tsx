import { Icone } from './filtros/Filtros';
import { DEADLINE_LABELS, DEADLINE_TONES, obterStatusPrazo, obterStatusTrabalho, WORK_STATUS_LABELS, WORK_STATUS_TONES, STATUS_LEGEND, type QuoteProgress } from '@inova/domain';

/** Selo da situação do trabalho (ex.: "Em produção"); `icone` põe o ponto colorido na frente. */
export function SeloTrabalho({ quote, icone = false }: { quote: QuoteProgress; icone?: boolean }) {
  const work = obterStatusTrabalho(quote);
  return <span className={`status status-${WORK_STATUS_TONES[work]}`}>{icone && <i className="status-ponto" aria-hidden="true" />}{quote.status === 'CANCELLED' ? (quote.approvedAt ? 'Cliente desistiu' : 'Cancelado') : quote.status === 'EXPIRED' ? 'Expirado' : WORK_STATUS_LABELS[work]}</span>;
}

/** Selo da situação do prazo (ex.: "Próximo do prazo"); `icone` põe o relógio na frente. */
export function SeloPrazo({ quote, icone = false }: { quote: QuoteProgress; icone?: boolean }) {
  const deadline = obterStatusPrazo(quote);
  return <span className={`status status-${DEADLINE_TONES[deadline]}`}>{icone && <Icone nome="prazo" tamanho={13} />}{DEADLINE_LABELS[deadline]}</span>;
}

export function StatusOrcamento({ quote, icones = false }: { quote: QuoteProgress; icones?: boolean }) {
  return <div className="status-badges"><SeloTrabalho quote={quote} icone={icones} /><SeloPrazo quote={quote} icone={icones} /></div>;
}

export function StatusLegend() {
  return <div className="status-legend" aria-label="Legenda das cores dos projetos">{STATUS_LEGEND.map((badge) => <span key={badge.tone}><i className={`status-dot status-${badge.tone}`} aria-hidden="true" />{badge.label}</span>)}</div>;
}
