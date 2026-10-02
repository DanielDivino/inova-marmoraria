'use client';

import { useEffect, useState, type MouseEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';

/** Usuário pediu menos movimento no sistema. */
export function useMovimentoReduzido() {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const atualizar = () => setReduzido(consulta.matches);
    atualizar();
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return reduzido;
}

/** O elemento está (ao menos em parte) na tela. */
export function useVisivel(alvo: RefObject<Element | null>, margem = '0px') {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const elemento = alvo.current;
    if (!elemento || typeof IntersectionObserver === 'undefined') { setVisivel(true); return; }
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting), { rootMargin: margem });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [alvo, margem]);
  return visivel;
}

// Um observador só para todos os blocos que surgem ao rolar a página.
let observadorRevelar: IntersectionObserver | undefined;
/** Ref para blocos que surgem suavemente quando entram na tela (`data-revelar` no CSS). */
export function revelar(elemento: HTMLElement | null) {
  if (!elemento || elemento.dataset.revelado !== undefined) return;
  if (typeof IntersectionObserver === 'undefined') { elemento.dataset.revelado = ''; return; }
  observadorRevelar ??= new IntersectionObserver((entradas) => entradas.forEach((entrada) => {
    if (!entrada.isIntersecting) return;
    (entrada.target as HTMLElement).dataset.revelado = '';
    observadorRevelar?.unobserve(entrada.target);
  }), { rootMargin: '0px 0px -8% 0px' });
  observadorRevelar.observe(elemento);
}

type Transicao = { finished: Promise<void>; ready: Promise<void> };
/**
 * Troca de estado com transição de vista (View Transitions): o que tiver o mesmo
 * `view-transition-name` antes e depois "cresce" de um lugar para o outro. Sem suporte no navegador
 * ou com menos movimento pedido, só troca.
 */
export function comTransicao(atualizar: () => void): Transicao | undefined {
  const documento = document as Document & { startViewTransition?: (callback: () => void) => Transicao };
  if (!documento.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { atualizar(); return undefined; }
  const transicao = documento.startViewTransition(() => flushSync(atualizar));
  // Uma transição nova antes do fim da anterior pula a anterior: não é erro (o estado já mudou).
  transicao.ready.catch(() => undefined);
  return { ready: transicao.ready, finished: transicao.finished.catch(() => undefined) };
}

/** Leva até a seção com rolagem suave (sem animar, se o sistema pede menos movimento). */
export function rolarAte(id: string) {
  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
}
/** Link para uma seção da página (`href="#id"`) que rola suavemente até ela. */
export function irParaSecao(event: MouseEvent<HTMLAnchorElement>) {
  const id = event.currentTarget.hash.slice(1);
  if (!id || !document.getElementById(id)) return;
  event.preventDefault();
  rolarAte(id);
}
