'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedQuoteItem } from '@inova/domain';
import { api } from '../../lib/api';
import { savedItemDraft } from '../../lib/saved-quote';
import { TechnicalDrawing } from './TechnicalDrawing';

export function SavedItemDrawing({ item }: { item: SavedQuoteItem }) {
  const draft = savedItemDraft(item);
  if (!draft.components.length) return <p className="customer-help">Área manual: este projeto não possui medidas para desenho 2D.</p>;
  return <TechnicalDrawing components={draft.components} cutouts={draft.cutouts} materialName={item.materialNameSnapshot} linearServices={item.components.flatMap((component) => component.edges.map((edge) => ({ id: edge.serviceId, name: edge.serviceNameSnapshot })))} />;
}

export function SavedDrawings({ quoteId }: { quoteId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<SavedQuoteItem[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '150px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setError('');
    api<{ items: SavedQuoteItem[] }>(`/quotes/${quoteId}`, { signal: controller.signal }).then((quote) => setItems(quote.items)).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os desenhos.'); });
    return () => controller.abort();
  }, [quoteId, visible, attempt]);
  return <div className="saved-drawings" ref={container}>
    {error ? <p role="alert" className="form-error">{error} <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p> : items ? items.map((item, index) => <section key={item.id}><h3>{item.projectName || `Projeto ${index + 1}`}</h3><SavedItemDrawing item={item} /></section>) : <p className="customer-help">Carregando desenhos 2D…</p>}
  </div>;
}
