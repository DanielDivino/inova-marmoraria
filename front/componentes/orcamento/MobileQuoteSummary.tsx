'use client';

import { useEffect, useRef, useState } from 'react';

export function ResumoMovel({ total }: { total: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);

  useEffect(() => {
    const summary = bar.current?.closest('.project-builder')?.querySelector('.quote-summary-card');
    if (!summary) return;
    const observer = new IntersectionObserver(([entry]) => setSummaryVisible(entry.isIntersecting), { rootMargin: '0px 0px -90px 0px' });
    observer.observe(summary);
    return () => observer.disconnect();
  }, []);

  function showSummary() {
    const summary = bar.current?.closest('.project-builder')?.querySelector<HTMLElement>('.quote-summary-card');
    if (!summary) return;
    summary.tabIndex = -1;
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  return <div ref={bar} className="mobile-quote-bar" data-summary-visible={summaryVisible}>
    <div><small>Total à vista / Pix</small><strong>{total}</strong></div>
    <button type="button" className="primary-compact-button" onClick={showSummary}>Ver resumo <span aria-hidden="true">↓</span></button>
  </div>;
}
