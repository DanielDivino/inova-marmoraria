'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCelular } from '../filtros/Filtros';

export function ResumoMovel({ total, label = 'Total à vista / Pix', summaryId = 'quote-summary-card' }: { total: string; label?: string; summaryId?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const celular = useCelular();

  useEffect(() => { setHeader(document.getElementById('application-mobile-summary')); }, []);
  useEffect(() => { if (!celular) setExpanded(false); }, [celular]);
  useEffect(() => {
    if (!header || !celular) return;
    const owner = anchor.current?.closest<HTMLElement>('.project-builder, .remount-page');
    const top = header.closest<HTMLElement>('.application-header-actions');
    if (!owner || !top) return;
    const measure = () => owner.style.setProperty('--summary-header-height', `${top.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(top);
    measure();
    return () => { observer.disconnect(); owner.style.removeProperty('--summary-header-height'); };
  }, [header, celular]);

  useEffect(() => {
    const summary = anchor.current?.closest('.project-builder, .remount-page')?.querySelector<HTMLElement>('.quote-summary-card');
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
    return () => {
      if (expanded) document.body.style.overflow = previousOverflow;
      summary.removeAttribute('role');
      summary.removeAttribute('aria-modal');
      summary.removeAttribute('tabindex');
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setExpanded(false);
        trigger.current?.focus({ preventScroll: true });
      }
      if (event.key === 'Tab') {
        const summary = anchor.current?.closest('.project-builder, .remount-page')?.querySelector<HTMLElement>('.quote-summary-card');
        const controls = [...(summary?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length > 0);
        const items = [trigger.current, ...controls].filter((el): el is HTMLElement => !!el);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (items.length) {
          event.preventDefault();
          const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
          items[next]?.focus();
        }
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

  const bar = <div className="mobile-quote-bar" data-expanded={expanded}>
      <div><small>{label}</small><strong>{total}</strong></div>
      <button ref={trigger} type="button" className="primary-compact-button" aria-controls={summaryId} aria-expanded={expanded} onClick={toggleSummary}>
        {expanded ? <>Fechar resumo <span aria-hidden="true">↑</span></> : <>Ver resumo <span aria-hidden="true">↓</span></>}
      </button>
    </div>;
  return <>
    <span ref={anchor} className="mobile-summary-anchor" data-expanded={expanded} hidden />
    {expanded && <button type="button" className="mobile-summary-backdrop" aria-label="Fechar resumo" onClick={closeSummary} tabIndex={-1} />}
    {celular && header && createPortal(bar, header)}
  </>;
}
