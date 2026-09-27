'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { FASE_ORCAMENTO_FLUXO_LABELS, PROJECT_WORKFLOW_LABELS, SITUACAO_PRAZO_FLUXO_LABELS, situacaoPrazoFluxo } from '@inova/domain';
import { corOrcamento, formatarDataFluxo, resumirPorOrcamento, rotuloPecas, type CartaoFluxo } from '../../utilitarios/fluxo';
import { enderecoProjeto, Responsavel } from './QuadroProjetos';

/** Progresso de cada orçamento, calculado dos mesmos cartões do quadro. */
export function ResumoOrcamentos({ cartoes }: { cartoes: CartaoFluxo[] }) {
  const resumos = resumirPorOrcamento(cartoes);
  if (!resumos.length) return <p className="empty">Nenhum orçamento com projetos no fluxo.</p>;
  return <ul className="fluxo-resumo">{resumos.map(({ quote, projetos, concluidos, entregues, total, finalizado }) => {
    // O prazo final é de entrega/montagem: o alerta vale até o orçamento ser entregue.
    const situacao = situacaoPrazoFluxo(quote.deadline);
    const percentual = Math.round((concluidos / total) * 100);
    return <li key={quote.id} className={`fluxo-resumo-item prazo-${situacao.toLowerCase()}${finalizado ? ' finalizado' : ''}`} style={{ '--cor-orcamento': corOrcamento(quote.id) } as CSSProperties}>
      <details>
        <summary>
          <span className="fluxo-etiqueta">{quote.number}</span>
          <strong>{quote.customerName}</strong>
          <Responsavel responsavel={quote.worker} />
          <small className="fluxo-prazo">{quote.deadline ? `Prazo final: ${formatarDataFluxo(quote.deadline)}` : 'Sem prazo final'}{['VENCIDO', 'PROXIMO'].includes(situacao) && <b> · {SITUACAO_PRAZO_FLUXO_LABELS[situacao]}</b>}</small>
          {finalizado && <em className="fluxo-finalizado">Produção finalizada</em>}
          {quote.phase !== 'IN_EXECUTION' && <em className={`fluxo-fase fase-${quote.phase.toLowerCase()}`}>{FASE_ORCAMENTO_FLUXO_LABELS[quote.phase]}</em>}
          <span className="fluxo-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={concluidos} aria-label={`Progresso do orçamento ${quote.number}`}><i style={{ width: `${percentual}%` }} /></span>
          <small className="fluxo-contagem">{concluidos} de {total} produzidos{entregues > 0 && ` · ${entregues} ${entregues === 1 ? 'entregue' : 'entregues'}`}</small>
        </summary>
        <ul className="fluxo-resumo-projetos">{projetos.map((projeto) => <li key={projeto.id}>
          <Link href={enderecoProjeto(projeto)}>{projeto.name}</Link><small>{rotuloPecas(projeto.pieces)}</small>
          <span className={`fluxo-status status-${projeto.status.toLowerCase()}`}>{PROJECT_WORKFLOW_LABELS[projeto.status]}</span>
        </li>)}</ul>
      </details>
    </li>;
  })}</ul>;
}
