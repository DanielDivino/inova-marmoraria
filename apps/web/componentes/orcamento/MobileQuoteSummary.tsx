'use client';

import { useEffect, useRef, useState } from 'react';

export function ResumoMovel({ total, label = 'Total à vista / Pix', summaryId = 'quote-summary-card' }: { total: string; label?: string; summaryId?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const summary = bar.current?.closest('.project-builder, .remount-page')?.querySelector<HTMLElement>('.quote-summary-card');
    if (!summary) return;
    const previousOverflow = document.body.style.overflow;
    if (expanded) {
      document.body.style.overflow = 'hidden';
      summary.setAttribute('role', 'dialog');
      summary.setAttribute('aria-modal', 'true');
      summary.tabIndex = -1;
      summary.focus({ preventScroll: true });
    } else {
      summary.removeAttribute('role');
      summary.removeAttribute('aria-modal');
      if (document.activeElement === summary) trigger.current?.focus({ preventScroll: true });
    }
    return () => { if (expanded) document.body.style.overflow = previousOverflow; };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  function closeSummary() {
    setExpanded(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function toggleSummary() {
    if (expanded) closeSummary();
    else setExpanded(true);
  }

  return <>
    {expanded && <button type="button" className="mobile-summary-backdrop" aria-label="Fechar resumo" onClick={closeSummary} />}
    <div ref={bar} className="mobile-quote-bar" data-expanded={expanded}>
      <div><small>{label}</small><strong>{total}</strong></div>
      <button ref={trigger} type="button" className="primary-compact-button" aria-controls={summaryId} aria-expanded={expanded} onClick={toggleSummary}>
        {expanded ? <>Fechar resumo <span aria-hidden="true">↑</span></> : <>Ver resumo <span aria-hidden="true">↓</span></>}
      </button>
    </div>
  </>;
}
