'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedQuoteItem } from '@inova/domain';
import { projetoTemDesenho } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { itemSalvoParaRascunho } from '../../utilitarios/saved-quote';
import { lerPlanoDeProducao, planoParaDesenho } from '../../utilitarios/production-plan';
import { ESPACO_ENTRE_PROJETOS, organizarProjetos } from '../../utilitarios/organizar-projetos';
import { DesenhoTecnico } from './TechnicalDrawing';

export function SavedItemDrawing({ item, notes }: { item: SavedQuoteItem; notes?: string | null }) {
  if (!projetoTemDesenho(item.drawingData)) return <small>Desenho pendente — orçamento calculado.</small>;
  const draft = itemSalvoParaRascunho(item);
  const plan = lerPlanoDeProducao(item.drawingData);
  // Orçamentos detalhados com peças de produção mostram o desenho pelas peças
  // já divididas; orçamentos antigos/sem detalhamento caem no componente
  // comercial direto (mesmo desenho de sempre, nada muda para eles).
  const { components, cutouts } = plan && plan.pieces.length ? planoParaDesenho(plan) : { components: draft.components, cutouts: draft.cutouts };
  const materialNames = plan && plan.pieces.length
    ? Object.fromEntries(plan.pieces.map((piece) => { const origin = item.components.find((component) => component.id === piece.sourceComponentId); return [piece.id, origin?.materialNameSnapshot ?? item.materialNameSnapshot]; }))
    : Object.fromEntries(item.components.map(component => [component.id, component.materialNameSnapshot ?? item.materialNameSnapshot]));
  const services = [...item.services.map((service) => ({ id: service.serviceId, name: service.serviceNameSnapshot })), ...item.cutouts.flatMap((cutout) => cutout.serviceId && cutout.serviceNameSnapshot ? [{ id: cutout.serviceId, name: cutout.serviceNameSnapshot }] : [])];
  return <DesenhoTecnico components={components} cutouts={cutouts} materialName={item.materialNameSnapshot} materialNames={materialNames} linearServices={item.components.flatMap((component) => component.edges.map((edge) => ({ id: edge.serviceId, name: edge.serviceNameSnapshot })))} services={services} additionalServices={item.services.map((service) => ({ name: service.serviceNameSnapshot, quantity: service.billingUnitSnapshot === 'UNIT' ? String(service.billedQuantity) : undefined }))} notes={notes} />;
}

const LARGURA_MINIMA_COLUNA = 320;

export function DesenhosSalvos({ quoteId }: { quoteId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<SavedQuoteItem[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [largura, setLargura] = useState(0);
  const [alturas, setAlturas] = useState<Record<string, number>>({});
  const colunas = items?.length ? Math.max(1, Math.min(items.length, Math.floor((largura + ESPACO_ENTRE_PROJETOS) / (LARGURA_MINIMA_COLUNA + ESPACO_ENTRE_PROJETOS)))) : 1;
  const posicoes = items ? organizarProjetos(items.map((item) => alturas[item.id] ?? 0), colunas) : [];
  const arranjo = posicoes.map((posicao) => posicao.coluna).join();
  useEffect(() => {
    const elemento = container.current;
    if (!elemento) return;
    const observer = new ResizeObserver(([entry]) => setLargura(entry.contentRect.width));
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);
  // Mudar de coluna recria o cartão; por isso a observação é refeita a cada novo arranjo.
  useEffect(() => {
    const elemento = container.current;
    if (!elemento || !items) return;
    const observer = new ResizeObserver((entries) => setAlturas((atuais) => {
      let mudou = false;
      const proximas = { ...atuais };
      for (const entry of entries) {
        const projeto = entry.target as HTMLElement;
        const id = projeto.dataset.projeto;
        if (id && proximas[id] !== projeto.offsetHeight) { proximas[id] = projeto.offsetHeight; mudou = true; }
      }
      return mudou ? proximas : atuais;
    }));
    elemento.querySelectorAll<HTMLElement>('[data-projeto]').forEach((projeto) => observer.observe(projeto));
    return () => observer.disconnect();
  }, [items, arranjo]);
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
    {error ? <p role="alert" className="form-error">{error} <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p> : items ? Array.from({ length: colunas }, (_, coluna) => <div className="saved-drawings-column" key={coluna}>
      {items.map((item, index) => posicoes[index].coluna === coluna && <section key={item.id} data-projeto={item.id} className={`saved-drawing-card tom-${posicoes[index].tom + 1}`}><h3>{item.projectName || `Projeto ${index + 1}`}</h3><SavedItemDrawing item={item} notes={notes} /></section>)}
    </div>) : <p className="customer-help">Carregando desenhos 2D…</p>}
  </div>;
}
