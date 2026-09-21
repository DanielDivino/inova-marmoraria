'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedQuoteItem } from '@inova/domain';
import { projetoTemDesenho } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { itemSalvoParaRascunho } from '../../utilitarios/saved-quote';
import { DesenhoTecnico } from './TechnicalDrawing';

export function SavedItemDrawing({ item, notes }: { item: SavedQuoteItem; notes?: string | null }) {
  if (!projetoTemDesenho(item.drawingData)) return <small>Desenho pendente — orçamento calculado.</small>;
  const draft = itemSalvoParaRascunho(item);
  const services = [...item.services.map((service) => ({ id: service.serviceId, name: service.serviceNameSnapshot })), ...item.cutouts.flatMap((cutout) => cutout.serviceId && cutout.serviceNameSnapshot ? [{ id: cutout.serviceId, name: cutout.serviceNameSnapshot }] : [])];
  return <DesenhoTecnico components={draft.components} cutouts={draft.cutouts} materialName={item.materialNameSnapshot} materialNames={Object.fromEntries(item.components.map(component => [component.id, component.materialNameSnapshot ?? item.materialNameSnapshot]))} linearServices={item.components.flatMap((component) => component.edges.map((edge) => ({ id: edge.serviceId, name: edge.serviceNameSnapshot })))} services={services} additionalServices={item.services.map((service) => ({ name: service.serviceNameSnapshot, quantity: service.billingUnitSnapshot === 'UNIT' ? String(service.billedQuantity) : undefined }))} notes={notes} />;
}

export function DesenhosSalvos({ quoteId }: { quoteId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<SavedQuoteItem[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
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
    api<{ items: SavedQuoteItem[]; notes?: string | null }>(`/quotes/${quoteId}`, { signal: controller.signal }).then((quote) => { setItems(quote.items); setNotes(quote.notes ?? null); }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os desenhos.'); });
    return () => controller.abort();
  }, [quoteId, visible, attempt]);
  return <div className="saved-drawings" ref={container}>
    {error ? <p role="alert" className="form-error">{error} <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p> : items ? items.map((item, index) => <section key={item.id}><h3>{item.projectName || `Projeto ${index + 1}`}</h3><SavedItemDrawing item={item} notes={notes} /></section>) : <p className="customer-help">Carregando desenhos 2D…</p>}
  </div>;
}
