'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './filtros/Filtros';

type Opcao = { valor: string; rotulo: string; desabilitada: boolean; grupo?: string; indice: number };
type Aberta = { select: HTMLSelectElement; opcoes: Opcao[]; ativo: number; posicao: { left: number; width: number; top?: number; bottom?: number; maxHeight: number } };

const ID_LISTA = 'lista-de-selecao';
const pertence = (alvo: EventTarget | null) => alvo instanceof HTMLSelectElement && !alvo.multiple && alvo.size <= 1 && !alvo.disabled ? alvo : null;
const opcoesDo = (select: HTMLSelectElement): Opcao[] => [...select.options].map((opcao, indice) => ({ opcao, indice })).filter(({ opcao }) => !opcao.hidden)
  .map(({ opcao, indice }) => ({ valor: opcao.value, rotulo: opcao.label || opcao.text, desabilitada: opcao.disabled, grupo: opcao.parentElement instanceof HTMLOptGroupElement ? opcao.parentElement.label : undefined, indice }));
function posicaoDe(select: HTMLSelectElement): Aberta['posicao'] {
  const caixa = select.getBoundingClientRect();
  const abaixo = window.innerHeight - caixa.bottom - 12, acima = caixa.top - 12;
  const largura = Math.min(Math.max(caixa.width, 200), window.innerWidth - 16);
  const left = Math.max(8, Math.min(caixa.left, window.innerWidth - largura - 8));
  return abaixo >= Math.min(320, acima) ? { left, width: largura, top: caixa.bottom + 6, maxHeight: Math.min(340, abaixo) } : { left, width: largura, bottom: window.innerHeight - caixa.top + 6, maxHeight: Math.min(340, acima) };
}
/** Muda o valor como a pessoa faria no select: o React e os formulários recebem input e change. */
function escolherNoSelect(select: HTMLSelectElement, valor: string) {
  if (select.value === valor) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, valor);
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * A lista que abre em qualquer select do sistema, no estilo dos filtros (a lista nativa não segue o
 * tema). O campo fechado continua o select de sempre; só a lista é nossa. Mouse, toque e teclado
 * (setas, Home/End, Enter/Espaço, Esc, letra inicial). Fica por cima de tudo, inclusive dentro de janelas.
 */
export function ListasDeSelecao() {
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const atual = useRef(aberta);
  atual.current = aberta;
  const lista = useRef<HTMLUListElement>(null);
  const escolherOpcao = useRef<(indice: number) => void>(() => {});
  useEffect(() => {
    const abrir = (select: HTMLSelectElement) => {
      const opcoes = opcoesDo(select);
      if (!opcoes.length) return;
      const ativo = Math.max(0, opcoes.findIndex((opcao) => opcao.indice === select.selectedIndex));
      select.setAttribute('aria-expanded', 'true');
      select.setAttribute('aria-controls', ID_LISTA);
      setAberta({ select, opcoes, ativo, posicao: posicaoDe(select) });
    };
    const fechar = (devolverFoco = true) => {
      const { current } = atual;
      if (!current) return;
      current.select.removeAttribute('aria-expanded');
      current.select.removeAttribute('aria-controls');
      current.select.removeAttribute('aria-activedescendant');
      if (devolverFoco) current.select.focus({ preventScroll: true });
      setAberta(null);
    };
    const escolher = (indice: number) => {
      const { current } = atual;
      const opcao = current?.opcoes[indice];
      if (!current || !opcao || opcao.desabilitada) return;
      fechar();
      escolherNoSelect(current.select, opcao.valor);
    };
    let toque: { x: number; y: number } | null = null;
    const aoPressionar = (event: MouseEvent) => {
      const select = pertence(event.target);
      if (!select) {
        // Clique fora da lista fecha (na lista, o clique escolhe).
        if (atual.current && !lista.current?.contains(event.target as Node)) fechar(false);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      if (atual.current?.select === select) { fechar(); return; }
      select.focus({ preventScroll: true });
      abrir(select);
    };
    const aoClicar = (event: MouseEvent) => { if (pertence(event.target)) event.preventDefault(); };
    const aoTocar = (event: TouchEvent) => { toque = pertence(event.target) ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; };
    // No toque, o celular abriria a lista dele no fim do toque: abre a nossa (se não foi rolagem).
    const aoSoltarToque = (event: TouchEvent) => {
      const select = pertence(event.target);
      if (!select || !toque) return;
      const ponto = event.changedTouches[0];
      const moveu = Math.hypot(ponto.clientX - toque.x, ponto.clientY - toque.y) > 10;
      toque = null;
      if (moveu) return;
      event.preventDefault();
      if (atual.current?.select === select) { fechar(); return; }
      select.focus({ preventScroll: true });
      abrir(select);
    };
    const aoTeclar = (event: KeyboardEvent) => {
      const { current } = atual;
      if (!current) {
        const select = pertence(event.target);
        if (select && (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(event.key) || (event.altKey && event.key === 'ArrowDown'))) { event.preventDefault(); abrir(select); }
        return;
      }
      const ultimo = current.opcoes.length - 1;
      const pular = (de: number, passo: number) => { let indice = de; while (indice >= 0 && indice <= ultimo && current.opcoes[indice].desabilitada) indice += passo; return indice < 0 || indice > ultimo ? current.ativo : indice; };
      const mover: Record<string, () => number> = {
        ArrowDown: () => pular(Math.min(ultimo, current.ativo + 1), 1), ArrowUp: () => pular(Math.max(0, current.ativo - 1), -1),
        Home: () => pular(0, 1), End: () => pular(ultimo, -1), PageDown: () => pular(Math.min(ultimo, current.ativo + 8), 1), PageUp: () => pular(Math.max(0, current.ativo - 8), -1),
      };
      if (event.key in mover) { event.preventDefault(); event.stopPropagation(); setAberta({ ...current, ativo: mover[event.key]() }); return; }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); escolher(current.ativo); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); fechar(); return; }
      if (event.key === 'Tab') { fechar(false); return; }
      // Letra: vai para a próxima opção que começa com ela.
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const letra = event.key.toLocaleLowerCase('pt-BR');
        const ordem = [...current.opcoes.slice(current.ativo + 1), ...current.opcoes.slice(0, current.ativo + 1)];
        const achada = ordem.find((opcao) => !opcao.desabilitada && opcao.rotulo.trim().toLocaleLowerCase('pt-BR').startsWith(letra));
        if (achada) setAberta({ ...current, ativo: current.opcoes.indexOf(achada) });
      }
    };
    // Rolando a página (fora da lista) ou mudando o tamanho da tela, a lista acompanha o campo.
    const reposicionar = (event: Event) => {
      const { current } = atual;
      if (!current || (event.target instanceof Node && lista.current?.contains(event.target))) return;
      if (!current.select.isConnected) { fechar(false); return; }
      setAberta({ ...current, posicao: posicaoDe(current.select) });
    };
    document.addEventListener('mousedown', aoPressionar, true);
    document.addEventListener('click', aoClicar, true);
    document.addEventListener('touchstart', aoTocar, { capture: true, passive: true });
    document.addEventListener('touchend', aoSoltarToque, { capture: true, passive: false });
    document.addEventListener('keydown', aoTeclar, true);
    window.addEventListener('scroll', reposicionar, true);
    window.addEventListener('resize', reposicionar);
    escolherOpcao.current = escolher;
    return () => {
      document.removeEventListener('mousedown', aoPressionar, true);
      document.removeEventListener('click', aoClicar, true);
      document.removeEventListener('touchstart', aoTocar, true);
      document.removeEventListener('touchend', aoSoltarToque, true);
      document.removeEventListener('keydown', aoTeclar, true);
      window.removeEventListener('scroll', reposicionar, true);
      window.removeEventListener('resize', reposicionar);
    };
  }, []);
  useEffect(() => {
    if (!aberta) return;
    const id = `${ID_LISTA}-${aberta.ativo}`;
    aberta.select.setAttribute('aria-activedescendant', id);
    document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
  }, [aberta]);
  if (!aberta) return null;
  const { select, opcoes, ativo, posicao } = aberta;
  const rotulo = select.getAttribute('aria-label') ?? select.labels?.[0]?.textContent?.trim() ?? undefined;
  return createPortal(<ul id={ID_LISTA} ref={lista} role="listbox" aria-label={rotulo} className="menu-selecao-lista lista-de-selecao"
    style={{ left: posicao.left, minWidth: posicao.width, top: posicao.top, bottom: posicao.bottom, maxHeight: posicao.maxHeight }}
    onMouseDown={(event) => event.preventDefault()}>
    {opcoes.flatMap((opcao, indice) => {
      const item = <li key={opcao.indice} id={`${ID_LISTA}-${indice}`} role="option" data-valor={opcao.valor} aria-selected={opcao.indice === select.selectedIndex} aria-disabled={opcao.desabilitada || undefined} className={indice === ativo ? 'ativo' : undefined}
        onMouseEnter={() => { if (!opcao.desabilitada) setAberta((atual) => atual && { ...atual, ativo: indice }); }} onClick={() => escolherOpcao.current(indice)}>
        <span>{opcao.rotulo}</span>{opcao.indice === select.selectedIndex && <Icone nome="marcado" tamanho={16} />}
      </li>;
      // Grupos (optgroup): título em cima das opções do grupo.
      return opcao.grupo && opcao.grupo !== opcoes[indice - 1]?.grupo ? [<li key={`grupo-${indice}`} role="presentation" className="lista-de-selecao-grupo">{opcao.grupo}</li>, item] : [item];
    })}
  </ul>, select.closest('dialog[open]') ?? document.body);
}
