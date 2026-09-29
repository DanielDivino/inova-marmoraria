'use client';

import { useEffect, useRef, type PointerEvent as EventoPonteiro } from 'react';
import { snapPoint, updatePiece, type Point, type TechnicalDocument } from '@inova/domain/technical';
import { Icone } from '../filtros/Filtros';
import { PecaSvg } from './PecaSvg';
import { Texto, pontosSvg } from './svg';
import { arredondar, limitesDoDesenho, mundoParaLocal } from './operacoes';
import { useCamera } from './useCamera';
import { FONTE_TEXTO_PADRAO_MM, type Ferramenta, type Selecao, type TipoBorda } from './tipos';

export type TracoPendente = { pontos: Point[]; fechado: boolean; ladoReferencia: number | null } | null;
type Props = {
  documento: TechnicalDocument; selecao: Selecao; ferramenta: Ferramenta; pendenteBorda: TipoBorda | null; tracoPendente: TracoPendente;
  pedidoEnquadrar: number;
  aoSelecionar: (selecao: Selecao) => void;
  aoTocarLado: (pecaId: string, ladoId: string) => void;
  aoCriarTexto: (ponto: Point) => void;
  aoTraco: (pontos: Point[], ferramenta: 'TRACO_PECA' | 'TRACO_RECORTE') => void;
  aoCancelarTraco?: () => void;
  substituir: (documento: TechnicalDocument) => void;
  concluirGesto: (antes: TechnicalDocument) => void;
};
type Base = { inicio: Point; moveu: boolean; antes: TechnicalDocument };
type Gesto =
  | (Base & { tipo: 'fundo'; camera: { x: number; y: number; escala: number } })
  | (Base & { tipo: 'peca'; id: string; desvio: Point; aoTocar: () => void })
  | (Base & { tipo: 'vertice'; pecaId: string; verticeId: string })
  | (Base & { tipo: 'recurso'; id: string; desvio: Point })
  | (Base & { tipo: 'texto'; id: string; desvio: Point })
  | (Base & { tipo: 'toque'; aoTocar: () => void })
  | (Base & { tipo: 'traco'; pontos: Point[]; ferramenta: 'TRACO_PECA' | 'TRACO_RECORTE' })
  | { tipo: 'pinca'; distancia: number; centro: Point; camera: { x: number; y: number; escala: number } };
const LIMIAR_ARRASTE_PX = 5;

/**
 * Planta 2D: SVG em mm (y para cima), com grade, peças, cotas e textos.
 * Um dedo/mouse seleciona, arrasta (com encaixe) ou desenha à mão; dois dedos
 * fazem pan e zoom (e cancelam um traço em andamento, contra a palma apoiada).
 */
export function CanvasPlanta(props: Props) {
  const { documento, selecao, ferramenta, pendenteBorda, tracoPendente } = props;
  const recipiente = useRef<HTMLDivElement | null>(null);
  const tracoVivo = useRef<SVGPolylineElement | null>(null);
  const { camera, viewBox, tamanho, telaParaMundo, deslocar, zoomEm, enquadrar, setCamera, cameraAtual } = useCamera(recipiente);
  const ponteiros = useRef(new Map<number, Point>());
  const gesto = useRef<Gesto | null>(null);
  const px = (valor: number) => valor / camera.escala;
  const desenhando = ferramenta === 'TRACO_PECA' || ferramenta === 'TRACO_RECORTE';

  // Enquadra o desenho ao abrir e quando pedido (botão "Enquadrar").
  useEffect(() => { enquadrar(limitesDoDesenho(documento)); }, [props.pedidoEnquadrar, tamanho.largura > 1]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const elemento = recipiente.current;
    if (!elemento) return;
    const aoRolar = (evento: WheelEvent) => { evento.preventDefault(); zoomEm(evento.clientX, evento.clientY, Math.exp(-evento.deltaY * .0015)); };
    elemento.addEventListener('wheel', aoRolar, { passive: false });
    return () => elemento.removeEventListener('wheel', aoRolar);
  }, [zoomEm]);

  const zoomNoCentro = (fator: number) => { const caixa = recipiente.current?.getBoundingClientRect(); if (caixa) zoomEm(caixa.left + caixa.width / 2, caixa.top + caixa.height / 2, fator); };
  const desenharTracoVivo = (pontos: Point[]) => tracoVivo.current?.setAttribute('points', pontosSvg(pontos));
  const cancelarTraco = () => { if (gesto.current?.tipo === 'traco') { gesto.current = null; desenharTracoVivo([]); props.aoCancelarTraco?.(); } };

  function iniciarPinca() {
    const [a, b] = [...ponteiros.current.values()];
    // Um gesto de arraste em andamento fica como está; o traço é descartado.
    if (gesto.current && gesto.current.tipo !== 'pinca' && gesto.current.tipo !== 'traco' && gesto.current.moveu) props.concluirGesto(gesto.current.antes);
    cancelarTraco();
    gesto.current = { tipo: 'pinca', distancia: Math.hypot(b.x - a.x, b.y - a.y) || 1, centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: cameraAtual.current };
  }

  function aoPressionar(evento: EventoPonteiro<HTMLDivElement>) {
    if (evento.button !== 0 && evento.pointerType === 'mouse') return;
    if ((evento.target as Element).closest('.tec-zoom')) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    ponteiros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (ponteiros.current.size === 2) { iniciarPinca(); return; }
    if (ponteiros.current.size > 2) return;
    const mundo = telaParaMundo(evento.clientX, evento.clientY);
    const base = { inicio: { x: evento.clientX, y: evento.clientY }, moveu: false, antes: documento };
    if (desenhando) { gesto.current = { ...base, tipo: 'traco', pontos: [mundo], ferramenta: ferramenta as 'TRACO_PECA' | 'TRACO_RECORTE' }; desenharTracoVivo([mundo]); return; }
    const alvo = (evento.target as Element).closest<HTMLElement | SVGElement>('[data-alvo]');
    const dado = (nome: string) => alvo?.getAttribute(`data-${nome}`) ?? '';
    const tipo = alvo?.getAttribute('data-alvo');
    const peca = documento.pieces.find((entrada) => entrada.id === (dado('peca') || dado('id')));
    if (tipo === 'vertice' && peca) { gesto.current = { ...base, tipo: 'vertice', pecaId: peca.id, verticeId: dado('vertice') }; return; }
    if (tipo === 'cota' && peca) { gesto.current = { ...base, tipo: 'toque', aoTocar: () => props.aoTocarLado(peca.id, dado('lado')) }; return; }
    if (tipo === 'recurso') {
      const recurso = documento.features.find((entrada) => entrada.id === dado('id'));
      const pai = recurso && documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
      if (recurso && pai) {
        const local = mundoParaLocal(mundo, pai);
        if (recurso.edgeId || ferramenta !== 'SELECIONAR' || pai.locked) gesto.current = { ...base, tipo: 'toque', aoTocar: () => props.aoSelecionar({ tipo: 'recurso', id: recurso.id }) };
        else { gesto.current = { ...base, tipo: 'recurso', id: recurso.id, desvio: { x: local.x - recurso.x, y: local.y - recurso.y } }; props.aoSelecionar({ tipo: 'recurso', id: recurso.id }); }
        return;
      }
    }
    if (tipo === 'texto') {
      const texto = documento.annotations.find((entrada) => entrada.id === dado('id'));
      if (texto) { gesto.current = { ...base, tipo: 'texto', id: texto.id, desvio: { x: mundo.x - texto.x, y: mundo.y - texto.y } }; props.aoSelecionar({ tipo: 'texto', id: texto.id }); return; }
    }
    if ((tipo === 'peca' || tipo === 'lado') && peca) {
      const aoTocar = tipo === 'lado' ? () => props.aoTocarLado(peca.id, dado('lado')) : () => props.aoSelecionar({ tipo: 'peca', id: peca.id });
      if (ferramenta === 'SELECIONAR' && !peca.locked) gesto.current = { ...base, tipo: 'peca', id: peca.id, desvio: { x: mundo.x - peca.x, y: mundo.y - peca.y }, aoTocar };
      else gesto.current = { ...base, tipo: 'toque', aoTocar };
      return;
    }
    gesto.current = { ...base, tipo: 'fundo', camera: cameraAtual.current };
  }

  function aoMover(evento: EventoPonteiro<HTMLDivElement>) {
    if (!ponteiros.current.has(evento.pointerId)) return;
    ponteiros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    const atual = gesto.current;
    if (!atual) return;
    if (atual.tipo === 'pinca') {
      if (ponteiros.current.size < 2) return;
      const [a, b] = [...ponteiros.current.values()];
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const fator = Math.hypot(b.x - a.x, b.y - a.y) / atual.distancia;
      const escala = Math.min(3, Math.max(.02, atual.camera.escala * fator));
      const caixa = recipiente.current!.getBoundingClientRect();
      // O ponto do mundo que estava entre os dedos acompanha o centro dos dedos.
      const mundo = { x: atual.camera.x + (atual.centro.x - caixa.left - caixa.width / 2) / atual.camera.escala, y: atual.camera.y - (atual.centro.y - caixa.top - caixa.height / 2) / atual.camera.escala };
      setCamera({ escala, x: mundo.x - (centro.x - caixa.left - caixa.width / 2) / escala, y: mundo.y + (centro.y - caixa.top - caixa.height / 2) / escala });
      return;
    }
    if (!atual.moveu && Math.hypot(evento.clientX - atual.inicio.x, evento.clientY - atual.inicio.y) < LIMIAR_ARRASTE_PX) return;
    atual.moveu = true;
    const mundo = telaParaMundo(evento.clientX, evento.clientY);
    if (atual.tipo === 'traco') {
      const eventos = evento.nativeEvent.getCoalescedEvents?.() ?? [evento.nativeEvent];
      for (const coalescido of eventos) {
        const ponto = telaParaMundo(coalescido.clientX, coalescido.clientY);
        const ultimo = atual.pontos[atual.pontos.length - 1];
        if (Math.hypot(ponto.x - ultimo.x, ponto.y - ultimo.y) * cameraAtual.current.escala >= 1.5) atual.pontos.push(ponto);
      }
      desenharTracoVivo(atual.pontos);
      return;
    }
    if (atual.tipo === 'fundo') { deslocar(evento.clientX - atual.inicio.x, evento.clientY - atual.inicio.y, atual.camera); return; }
    if (atual.tipo === 'toque') return;
    if (atual.tipo === 'peca') {
      const destino = snapPoint(documento, { x: mundo.x - atual.desvio.x, y: mundo.y - atual.desvio.y }, atual.id, 10, 12 / cameraAtual.current.escala);
      props.substituir(updatePiece(documento, atual.id, { x: destino.x, y: destino.y }));
      return;
    }
    if (atual.tipo === 'vertice') {
      const peca = documento.pieces.find((entrada) => entrada.id === atual.pecaId);
      if (!peca) return;
      const local = mundoParaLocal(mundo, peca);
      const contour = peca.contour.map((vertice) => vertice.id === atual.verticeId ? { ...vertice, x: arredondar(local.x), y: arredondar(local.y) } : vertice);
      props.substituir(updatePiece(documento, peca.id, { contour, geometryMode: 'FREE', parameters: undefined }));
      return;
    }
    if (atual.tipo === 'recurso') {
      const recurso = documento.features.find((entrada) => entrada.id === atual.id);
      const pai = recurso && documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
      if (!recurso || !pai) return;
      const local = mundoParaLocal(mundo, pai);
      props.substituir({ ...documento, features: documento.features.map((entrada) => entrada.id === recurso.id ? { ...entrada, x: arredondar(local.x - atual.desvio.x), y: arredondar(local.y - atual.desvio.y) } : entrada) });
      return;
    }
    props.substituir({ ...documento, annotations: documento.annotations.map((texto) => texto.id === atual.id ? { ...texto, x: arredondar(mundo.x - atual.desvio.x), y: arredondar(mundo.y - atual.desvio.y) } : texto) });
  }

  function aoSoltar(evento: EventoPonteiro<HTMLDivElement>, cancelado = false) {
    ponteiros.current.delete(evento.pointerId);
    const atual = gesto.current;
    if (!atual) return;
    if (atual.tipo === 'pinca') { if (ponteiros.current.size === 0) gesto.current = null; return; }
    gesto.current = null;
    if (atual.tipo === 'traco') {
      desenharTracoVivo([]);
      if (!cancelado && atual.pontos.length > 2) props.aoTraco(atual.pontos, atual.ferramenta);
      return;
    }
    if (cancelado) { if (atual.moveu && atual.tipo !== 'fundo' && atual.tipo !== 'toque') props.concluirGesto(atual.antes); return; }
    if (atual.moveu) { if (atual.tipo !== 'fundo' && atual.tipo !== 'toque') props.concluirGesto(atual.antes); return; }
    if (atual.tipo === 'peca' || atual.tipo === 'toque') atual.aoTocar();
    else if (atual.tipo === 'vertice') props.aoSelecionar({ tipo: 'vertice', pecaId: atual.pecaId, verticeId: atual.verticeId });
    else if (atual.tipo === 'fundo') { if (ferramenta === 'TEXTO') props.aoCriarTexto(telaParaMundo(evento.clientX, evento.clientY)); else props.aoSelecionar(null); }
  }

  const visivel = { x: camera.x - tamanho.largura / 2 / camera.escala, y: camera.y - tamanho.altura / 2 / camera.escala, largura: tamanho.largura / camera.escala, altura: tamanho.altura / camera.escala };
  const gradeFina = camera.escala * 100 >= 7;
  return <div ref={recipiente} className={`tec-canvas${desenhando ? ' desenhando' : ''}${pendenteBorda ? ' escolhendo-lado' : ''}`}
    onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={(evento) => aoSoltar(evento)} onPointerCancel={(evento) => aoSoltar(evento, true)}>
    <svg viewBox={viewBox} role="img" aria-label="Planta do desenho técnico" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="tec-grade-fina" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" className="tec-grade-fina" strokeWidth={px(.6)} /></pattern>
        <pattern id="tec-grade" width="1000" height="1000" patternUnits="userSpaceOnUse"><path d="M 1000 0 L 0 0 0 1000" fill="none" className="tec-grade-grossa" strokeWidth={px(1)} /></pattern>
      </defs>
      <g transform="scale(1 -1)">
        {gradeFina && <rect x={visivel.x} y={visivel.y} width={visivel.largura} height={visivel.altura} fill="url(#tec-grade-fina)" pointerEvents="none" />}
        <rect x={visivel.x} y={visivel.y} width={visivel.largura} height={visivel.altura} fill="url(#tec-grade)" pointerEvents="none" />
        {documento.pieces.map((peca) => <PecaSvg key={peca.id} peca={peca} recursos={documento.features.filter((recurso) => recurso.pieceId === peca.id)} escala={camera.escala} selecao={selecao} destacarLados={!!pendenteBorda} />)}
        {documento.annotations.map((texto) => <Texto key={texto.id} x={texto.x} y={texto.y} tamanho={texto.fontSizeMm ?? FONTE_TEXTO_PADRAO_MM} data-alvo="texto" data-id={texto.id}
          className={`tec-texto${selecao?.tipo === 'texto' && selecao.id === texto.id ? ' selecionado' : ''}`}>{texto.text}</Texto>)}
        {tracoPendente && <g className="tec-traco-organizado" pointerEvents="none">
          {tracoPendente.fechado ? <polygon points={pontosSvg(tracoPendente.pontos)} strokeWidth={px(2.5)} /> : <polyline points={pontosSvg(tracoPendente.pontos)} strokeWidth={px(2.5)} fill="none" />}
          {tracoPendente.ladoReferencia !== null && (() => {
            const a = tracoPendente.pontos[tracoPendente.ladoReferencia], b = tracoPendente.pontos[(tracoPendente.ladoReferencia + 1) % tracoPendente.pontos.length];
            return <line className="tec-traco-referencia" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={px(6)} />;
          })()}
          {tracoPendente.pontos.map((ponto, indice) => <circle key={indice} cx={ponto.x} cy={ponto.y} r={px(5)} />)}
        </g>}
        <polyline ref={tracoVivo} className="tec-traco-vivo" strokeWidth={px(3)} fill="none" pointerEvents="none" />
      </g>
    </svg>
    <div className="tec-zoom">
      <button type="button" aria-label="Aproximar" onClick={() => zoomNoCentro(1.3)}><Icone nome="mais" /></button>
      <button type="button" aria-label="Afastar" onClick={() => zoomNoCentro(1 / 1.3)}>−</button>
      <button type="button" aria-label="Enquadrar o desenho" onClick={() => enquadrar(limitesDoDesenho(documento))}>⤢</button>
    </div>
  </div>;
}
