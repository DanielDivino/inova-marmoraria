'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Point } from '@inova/domain/technical';

/** Câmera da planta: centro (mm do mundo) e escala (pixels por mm). */
export type Camera = { x: number; y: number; escala: number };
const ESCALA_MINIMA = .02, ESCALA_MAXIMA = 3;
const limitar = (escala: number) => Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, escala));

/**
 * Pan e zoom da planta. O SVG usa o viewBox em mm (y para baixo) e o grupo do
 * mundo inverte o y; aqui ficam as contas entre tela e mundo.
 */
export function useCamera(recipiente: RefObject<HTMLElement | null>) {
  const [camera, setCamera] = useState<Camera>({ x: 1500, y: 700, escala: .3 });
  const [tamanho, setTamanho] = useState({ largura: 800, altura: 500 });
  const atual = useRef(camera);
  atual.current = camera;

  useEffect(() => {
    const elemento = recipiente.current;
    if (!elemento) return;
    const medir = () => setTamanho({ largura: Math.max(1, elemento.clientWidth), altura: Math.max(1, elemento.clientHeight) });
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    medir();
    return () => observador.disconnect();
  }, [recipiente]);

  const telaParaMundo = useCallback((clienteX: number, clienteY: number): Point => {
    const caixa = recipiente.current?.getBoundingClientRect();
    const { x, y, escala } = atual.current;
    if (!caixa) return { x, y };
    return { x: x + (clienteX - caixa.left - caixa.width / 2) / escala, y: y - (clienteY - caixa.top - caixa.height / 2) / escala };
  }, [recipiente]);

  /** Arrasta a vista em pixels de tela. */
  const deslocar = useCallback((dxTela: number, dyTela: number, base = atual.current) => {
    setCamera({ ...base, x: base.x - dxTela / base.escala, y: base.y + dyTela / base.escala });
  }, []);
  /** Zoom mantendo parado o ponto do mundo que está sob o dedo/cursor. */
  const zoomEm = useCallback((clienteX: number, clienteY: number, fator: number, base = atual.current) => {
    const caixa = recipiente.current?.getBoundingClientRect();
    const escala = limitar(base.escala * fator);
    if (!caixa) { setCamera({ ...base, escala }); return; }
    const mundo = { x: base.x + (clienteX - caixa.left - caixa.width / 2) / base.escala, y: base.y - (clienteY - caixa.top - caixa.height / 2) / base.escala };
    setCamera({ escala, x: mundo.x - (clienteX - caixa.left - caixa.width / 2) / escala, y: mundo.y + (clienteY - caixa.top - caixa.height / 2) / escala });
  }, [recipiente]);
  const enquadrar = useCallback((limites: { minX: number; minY: number; maxX: number; maxY: number } | null) => {
    const caixa = limites ?? { minX: 0, minY: 0, maxX: 3000, maxY: 1500 };
    const largura = Math.max(caixa.maxX - caixa.minX, 600), altura = Math.max(caixa.maxY - caixa.minY, 400);
    const elemento = recipiente.current;
    const tela = elemento ? { largura: elemento.clientWidth, altura: elemento.clientHeight } : tamanho;
    // Folga para as cotas, que ficam do lado de fora das peças.
    const escala = limitar(Math.min(Math.max(80, tela.largura - 180) / (largura * 1.1), Math.max(24, tela.altura - 216) / (altura * 1.1)));
    // A alça de giro pede mais folga acima do que o botão de lado abaixo.
    setCamera({ x: (caixa.minX + caixa.maxX) / 2, y: (caixa.minY + caixa.maxY) / 2 + 14 / escala, escala });
  }, [recipiente, tamanho]);

  const { largura, altura } = tamanho;
  const viewBox = `${camera.x - largura / 2 / camera.escala} ${-(camera.y + altura / 2 / camera.escala)} ${largura / camera.escala} ${altura / camera.escala}`;
  return { camera, setCamera, tamanho, viewBox, telaParaMundo, deslocar, zoomEm, enquadrar, cameraAtual: atual };
}
