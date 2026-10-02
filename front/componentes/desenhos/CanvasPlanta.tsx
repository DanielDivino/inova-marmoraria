'use client';

import { useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from 'react';
import { ajustarRecursosDeBorda, centroDaPecaNoMundo, contornoValido, cotasDaPeca, girarPeca, posicaoNoBalcao, pecaNoEixoDaArea, organizarTraco, rotate, snapPoint, updatePiece, type Feature, type Piece, type Point, type TechnicalDocument, type Vertex } from '@inova/domain/technical';
import { Icone } from '../filtros/Filtros';
import { PreviaArea, type MarcacaoArea } from './AreaSecaMolhada';
import { CotasLivres } from './CotasLivres';
import { PecaSvg } from './PecaSvg';
import { Texto, pontosSvg } from './svg';
import { arredondar, limitesDoDesenho, mundoParaLocal, pecaNoPonto } from './operacoes';
import { useCamera } from './useCamera';
import { FONTE_TEXTO_PADRAO_MM, type Ferramenta, type Selecao, type TipoNoLado } from './tipos';

export type TracoPendente = { pontos: Point[]; fechado: boolean; ladoReferencia: number | null } | null;
type Props = {
  anguloArea: number; aoCriarLinha: (inicio: Point, fim: Point) => void;
  documento: TechnicalDocument; selecao: Selecao; ferramenta: Ferramenta; pendenteBorda: TipoNoLado | null; tracoPendente: TracoPendente;
  pedidoEnquadrar: number;
  aoSelecionar: (selecao: Selecao) => void;
  aoTocarLado: (pecaId: string, ladoId: string) => void;
  aoCriarTexto: (ponto: Point) => void;
  /** Ferramenta "Cota livre": o canvas avisa cada vértice tocado; `cotaInicio` é o primeiro já escolhido. */
  aoTocarVertice: (pecaId: string, verticeId: string) => void;
  cotaInicio: { pieceId: string; vertexId: string } | null;
  aoTraco: (pontos: Point[], ferramenta: 'TRACO_PECA' | 'TRACO_RECORTE') => void;
  aoCancelarTraco?: () => void;
  aoAviso?: (texto: string) => void;
  /** Ferramenta "Seca / molhada": o trecho marcado (mm a partir da ponta esquerda) e o que espera o tipo. */
  aoMarcarArea?: (pecaId: string, inicioMm: number, fimMm: number) => void;
  areaPendente?: MarcacaoArea | null;
  substituir: (documento: TechnicalDocument) => void;
  concluirGesto: (antes: TechnicalDocument) => void;
};
type Base = { inicio: Point; moveu: boolean; antes: TechnicalDocument };
type Gesto =
  | (Base & { tipo: 'fundo'; camera: { x: number; y: number; escala: number } })
  | (Base & { tipo: 'peca'; id: string; desvio: Point; aoTocar: () => void })
  | (Base & { tipo: 'vertice'; pecaId: string; verticeId: string })
  | (Base & { tipo: 'lado'; pecaId: string; indice: number; normal: Point; inicioLocal: Point; contorno: Vertex[]; bloqueio?: string; aoTocar: () => void })
  | (Base & { tipo: 'recurso'; id: string; desvio: Point })
  | (Base & { tipo: 'texto'; id: string; desvio: Point })
  | (Base & { tipo: 'toque'; aoTocar: () => void })
  | (Base & { tipo: 'traco'; pontos: Point[]; ferramenta: 'TRACO_PECA' | 'TRACO_RECORTE' })
  | (Base & { tipo: 'area' })
  | (Base & { tipo: 'linha'; inicioMundo: Point })
  | (Base & { tipo: 'girar'; id: string; centro: Point; anguloInicial: number; giroInicial: number; giro: number })
  | (Base & { tipo: 'borda-recurso'; id: string; lado: LadoRecurso; inicioLocal: Point; original: Pick<Feature, 'x' | 'y' | 'widthMm' | 'lengthMm'> })
  | { tipo: 'pinca'; distancia: number; centro: Point; camera: { x: number; y: number; escala: number } };
const LIMIAR_ARRASTE_PX = 5;
const grausDoPonto = (p: Point, centro: Point) => Math.atan2(p.y - centro.y, p.x - centro.x) * 180 / Math.PI;
/** Giro livre, no grau inteiro; perto (3°) de 0°, 45°, 90°… encaixa. */
function giroComEncaixe(graus: number) {
  const giro = ((Math.round(graus) % 360) + 360) % 360, encaixe = Math.round(giro / 45) * 45;
  return Math.abs(giro - encaixe) <= 3 ? encaixe % 360 : giro;
}
/** Borda da cuba/recorte puxada: direita, esquerda, cima e baixo, no giro do próprio recurso. */
export type LadoRecurso = 'D' | 'E' | 'C' | 'B';
/** Menor largura/comprimento de cuba ou recorte ao puxar a borda (5 cm). */
const MENOR_RECURSO_MM = 50;
/** Ponto da peça no eixo do recurso (origem no centro original, sem o giro dele). */
const noEixoDoRecurso = (local: Point, centro: Point, giro: number) => rotate({ x: local.x - centro.x, y: local.y - centro.y }, -giro);

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
  const [linhaInicio, setLinhaInicio] = useState<Point | null>(null);
  const [linhaFim, setLinhaFim] = useState<Point | null>(null);
  useEffect(() => { setLinhaInicio(null); setLinhaFim(null); }, [ferramenta]);
  const ajustarLinha = (a: Point, b: Point, forcar = false) => {
    const angulo = Math.atan2(b.y - a.y, b.x - a.x), encaixe = Math.round(angulo / (Math.PI / 4)) * Math.PI / 4;
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    return forcar || Math.abs(angulo - encaixe) < Math.PI / 18 ? { x: a.x + r * Math.cos(encaixe), y: a.y + r * Math.sin(encaixe) } : b;
  };
  const terminarLinha = (a: Point, b: Point) => { if (Math.hypot(b.x-a.x, b.y-a.y) < 10) return; props.aoCriarLinha(a,b); setLinhaInicio(null); setLinhaFim(null); };
  const px = (valor: number) => valor / camera.escala;
  const desenhando = ferramenta === 'TRACO_PECA' || ferramenta === 'TRACO_RECORTE';
  // Área seca/molhada em andamento: começo fixo e o fim acompanhando o ponteiro (mesmo sem botão apertado).
  const [marcacao, setMarcacao] = useState<MarcacaoArea | null>(null);
  const marcacaoAtual = useRef<MarcacaoArea | null>(null);
  const mudarMarcacao = (proxima: MarcacaoArea | null) => { marcacaoAtual.current = proxima; setMarcacao(proxima); };
  useEffect(() => { if (ferramenta !== 'AREA') mudarMarcacao(null); }, [ferramenta]);
  useEffect(() => { mudarMarcacao(null); }, [props.anguloArea]);
  const posicaoNaPeca = (peca: Piece, clienteX: number, clienteY: number) => posicaoNoBalcao(pecaNoEixoDaArea(peca, props.anguloArea), rotate(mundoParaLocal(telaParaMundo(clienteX, clienteY), peca), -props.anguloArea).x);
  const fecharArea = (peca: Piece, inicio: number, fim: number) => {
    mudarMarcacao(null);
    if (Math.abs(fim - inicio) < 10) { props.aoAviso?.('Área muito curta: clique no início da área, arraste até o fim e clique novamente.'); return; }
    props.aoMarcarArea?.(peca.id, inicio, fim);
  };

  // Enquadra o desenho ao abrir e quando pedido (botão "Enquadrar").
  useEffect(() => { enquadrar(limitesDoDesenho(documento)); }, [props.pedidoEnquadrar, tamanho.largura, tamanho.altura]); // eslint-disable-line react-hooks/exhaustive-deps
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
    cancelarTraco(); setLinhaInicio(null); setLinhaFim(null);
    gesto.current = { tipo: 'pinca', distancia: Math.hypot(b.x - a.x, b.y - a.y) || 1, centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: cameraAtual.current };
  }

  function aoPressionar(evento: EventoPonteiro<HTMLDivElement>) {
    if (evento.button !== 0 && evento.pointerType === 'mouse') return;
    if ((evento.target as Element).closest('.tec-zoom')) return;
    evento.currentTarget.focus({ preventScroll: true });
    evento.currentTarget.setPointerCapture(evento.pointerId);
    // Primeiro dedo de um toque novo (ou o mouse): dedo de um gesto antigo que não soltou aqui não pode virar pinça.
    if (evento.isPrimary && ponteiros.current.size) { ponteiros.current.clear(); gesto.current = null; }
    ponteiros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (ponteiros.current.size === 2) { iniciarPinca(); return; }
    if (ponteiros.current.size > 2) return;
    const mundo = telaParaMundo(evento.clientX, evento.clientY);
    const base = { inicio: { x: evento.clientX, y: evento.clientY }, moveu: false, antes: documento };
    if (ferramenta === 'LINHA') {
      if (linhaInicio) { terminarLinha(linhaInicio, ajustarLinha(linhaInicio, mundo, evento.shiftKey)); gesto.current = null; }
      else { setLinhaInicio(mundo); setLinhaFim(mundo); gesto.current = { ...base, tipo: 'linha', inicioMundo: mundo }; }
      return;
    }

    const alvo = (evento.target as Element).closest<HTMLElement | SVGElement>('[data-alvo]');
    const dado = (nome: string) => alvo?.getAttribute(`data-${nome}`) ?? '';
    const tipo = alvo?.getAttribute('data-alvo');
    const peca = documento.pieces.find((entrada) => entrada.id === (dado('peca') || dado('id')));
    if (tipo === 'mais-lado' && peca && ferramenta !== 'AREA') { gesto.current = { ...base, tipo: 'toque', aoTocar: () => props.aoTocarLado(peca.id, dado('lado')) }; return; }
    if (desenhando) { gesto.current = { ...base, tipo: 'traco', pontos: [mundo], ferramenta: ferramenta as 'TRACO_PECA' | 'TRACO_RECORTE' }; desenharTracoVivo([mundo]); return; }
    if (ferramenta === 'AREA') {
      // Segundo clique: fecha a área no ponto (dentro da mesma peça, no eixo dela).
      const emAndamento = marcacaoAtual.current;
      const pecaDaArea = emAndamento && documento.pieces.find((entrada) => entrada.id === emAndamento.pecaId);
      if (emAndamento && pecaDaArea) { fecharArea(pecaDaArea, emAndamento.inicio, posicaoNaPeca(pecaDaArea, evento.clientX, evento.clientY)); gesto.current = { ...base, tipo: 'toque', aoTocar: () => undefined }; return; }
      // Primeiro clique numa peça (na pedra, num lado ou num componente dela): marca o começo.
      const alvoPeca = peca ?? documento.pieces.find((entrada) => entrada.id === documento.features.find((recurso) => recurso.id === dado('id'))?.pieceId) ?? pecaNoPonto(documento, mundo);
      if (alvoPeca) {
        const inicio = posicaoNaPeca(alvoPeca, evento.clientX, evento.clientY);
        mudarMarcacao({ pecaId: alvoPeca.id, inicio, fim: inicio, angulo: props.anguloArea });
        gesto.current = { ...base, tipo: 'area' };
        return;
      }
    }
    // Bolinha de girar: o ângulo do ponteiro em volta do centro da peça vira o giro dela.
    if (tipo === 'girar' && peca && !peca.locked) {
      const centro = centroDaPecaNoMundo(peca);
      gesto.current = { ...base, tipo: 'girar', id: peca.id, centro, anguloInicial: grausDoPonto(mundo, centro), giroInicial: peca.rotationDeg, giro: peca.rotationDeg };
      return;
    }
    if (tipo === 'vertice' && peca && ferramenta === 'COTA') { gesto.current = { ...base, tipo: 'toque', aoTocar: () => props.aoTocarVertice(peca.id, dado('vertice')) }; return; }
    if (tipo === 'vertice' && peca) { gesto.current = { ...base, tipo: 'vertice', pecaId: peca.id, verticeId: dado('vertice') }; return; }
    if (tipo === 'cota' && peca) { gesto.current = { ...base, tipo: 'toque', aoTocar: () => props.aoTocarLado(peca.id, dado('lado')) }; return; }
    // Borda da cuba/recorte selecionado: puxar muda o tamanho daquele lado (a borda oposta fica parada).
    if (tipo === 'borda-recurso' && ferramenta === 'SELECIONAR') {
      const recurso = documento.features.find((entrada) => entrada.id === dado('id'));
      const pai = recurso && documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
      if (recurso && pai && !pai.locked) {
        gesto.current = { ...base, tipo: 'borda-recurso', id: recurso.id, lado: dado('lado') as LadoRecurso,
          inicioLocal: noEixoDoRecurso(mundoParaLocal(mundo, pai), recurso, recurso.rotationDeg), original: { x: recurso.x, y: recurso.y, widthMm: recurso.widthMm, lengthMm: recurso.lengthMm } };
        return;
      }
    }
    if (tipo === 'recurso' || tipo === 'borda-recurso') {
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
    // Puxar um lado: os dois cantos dele andam juntos para fora/para dentro e os lados vizinhos esticam ou encolhem.
    if (tipo === 'lado' && peca && ferramenta === 'SELECIONAR' && !peca.locked) {
      const indice = peca.contour.findIndex((vertice) => vertice.id === dado('lado'));
      const total = peca.contour.length;
      const vizinhos = [peca.contour[(indice - 1 + total) % total].id, peca.contour[(indice + 1) % total].id];
      gesto.current = { ...base, tipo: 'lado', pecaId: peca.id, indice, normal: cotasDaPeca(peca)[indice].normal, inicioLocal: mundoParaLocal(mundo, peca), contorno: peca.contour,
        bloqueio: vizinhos.some((id) => peca.lockedEdges.includes(id)) ? 'Os lados adjacentes estão travados. Destrave-os para ajustar este lado.' : undefined,
        aoTocar: () => props.aoTocarLado(peca.id, dado('lado')) };
      return;
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
    if (ferramenta === 'LINHA' && linhaInicio && ponteiros.current.size <= 1) setLinhaFim(ajustarLinha(linhaInicio, telaParaMundo(evento.clientX, evento.clientY), evento.shiftKey));
    // Área em andamento: o fim segue o ponteiro, com ou sem botão apertado (clicar-puxar-clicar ou arrastar-soltar).
    const emAndamento = marcacaoAtual.current;
    if (ferramenta === 'AREA' && emAndamento && ponteiros.current.size <= 1) {
      const peca = documento.pieces.find((entrada) => entrada.id === emAndamento.pecaId);
      const fim = peca ? posicaoNaPeca(peca, evento.clientX, evento.clientY) : emAndamento.fim;
      if (fim !== emAndamento.fim) mudarMarcacao({ ...emAndamento, fim });
      const atual = gesto.current;
      if (atual?.tipo === 'area' && Math.hypot(evento.clientX - atual.inicio.x, evento.clientY - atual.inicio.y) >= LIMIAR_ARRASTE_PX) atual.moveu = true;
      if (!ponteiros.current.has(evento.pointerId) || atual?.tipo === 'area') return;
    }
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
      desenharTracoVivo(organizarTraco(atual.pontos, { toleranciaAnguloGraus: 16, fracaoSimplificacao: .04 }).pontos);
      return;
    }
    if (atual.tipo === 'linha') return;
    if (atual.tipo === 'fundo') { deslocar(evento.clientX - atual.inicio.x, evento.clientY - atual.inicio.y, atual.camera); return; }
    if (atual.tipo === 'toque') return;
    if (atual.tipo === 'peca') {
      const destino = snapPoint(documento, { x: mundo.x - atual.desvio.x, y: mundo.y - atual.desvio.y }, atual.id, 10, 12 / cameraAtual.current.escala);
      props.substituir(updatePiece(documento, atual.id, { x: destino.x, y: destino.y }));
      return;
    }
    if (atual.tipo === 'lado') {
      if (atual.bloqueio) { props.aoAviso?.(atual.bloqueio); atual.bloqueio = ''; return; }
      if (atual.bloqueio === '') return;
      const peca = documento.pieces.find((entrada) => entrada.id === atual.pecaId);
      if (!peca) return;
      const local = mundoParaLocal(mundo, peca), n = atual.normal, total = atual.contorno.length;
      const avanco = arredondar((local.x - atual.inicioLocal.x) * n.x + (local.y - atual.inicioLocal.y) * n.y);
      const contour = atual.contorno.map((vertice, indice) => indice === atual.indice || indice === (atual.indice + 1) % total
        ? { ...vertice, x: Math.round((vertice.x + n.x * avanco) * 10) / 10, y: Math.round((vertice.y + n.y * avanco) * 10) / 10 } : vertice);
      // Encolher até cruzar ou zerar um lado vizinho não vale: a peça fica no último tamanho possível.
      if (contornoValido(contour)) props.substituir(updatePiece(documento, peca.id, { contour, geometryMode: 'FREE', parameters: undefined }));
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
    if (atual.tipo === 'area') return;
    if (atual.tipo === 'girar') {
      // Ângulo cresce no sentido anti-horário; o giro da peça é horário.
      atual.giro = giroComEncaixe(atual.giroInicial - (grausDoPonto(mundo, atual.centro) - atual.anguloInicial));
      // O ângulo aparece ao lado da bolinha: uma mensagem agora empurraria o desenho para baixo do dedo.
      props.substituir(girarPeca(atual.antes, atual.id, atual.giro));
      return;
    }
    if (atual.tipo === 'borda-recurso') {
      const recurso = documento.features.find((entrada) => entrada.id === atual.id);
      const pai = recurso && documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
      if (!recurso || !pai) return;
      const agora = noEixoDoRecurso(mundoParaLocal(mundo, pai), atual.original, recurso.rotationDeg);
      const deLado = atual.lado === 'D' || atual.lado === 'E', sinal = atual.lado === 'D' || atual.lado === 'C' ? 1 : -1;
      const antes = deLado ? atual.original.widthMm : atual.original.lengthMm;
      const tamanho = Math.max(MENOR_RECURSO_MM, arredondar(antes + (deLado ? agora.x - atual.inicioLocal.x : agora.y - atual.inicioLocal.y) * sinal));
      // O centro anda metade do que a borda andou, no eixo do recurso: a borda oposta não sai do lugar.
      const centro = rotate(deLado ? { x: (tamanho - antes) / 2 * sinal, y: 0 } : { x: 0, y: (tamanho - antes) / 2 * sinal }, recurso.rotationDeg);
      const medida = deLado ? { widthMm: tamanho } : { lengthMm: tamanho };
      props.substituir({ ...documento, features: documento.features.map((entrada) => entrada.id === recurso.id
        ? { ...entrada, ...medida, x: Math.round((atual.original.x + centro.x) * 10) / 10, y: Math.round((atual.original.y + centro.y) * 10) / 10 } : entrada) });
      return;
    }
    props.substituir({ ...documento, annotations: documento.annotations.map((texto) => {
      if (texto.id !== atual.id) return texto;
      const x = arredondar(mundo.x - atual.desvio.x), y = arredondar(mundo.y - atual.desvio.y);
      return { ...texto, x, y, ...(texto.lineEnd ? { lineEnd: { x: texto.lineEnd.x + x - texto.x, y: texto.lineEnd.y + y - texto.y } } : {}) };
    }) });
  }

  function aoSoltar(evento: EventoPonteiro<HTMLDivElement>, cancelado = false) {
    ponteiros.current.delete(evento.pointerId);
    const atual = gesto.current;
    if (!atual) return;
    if (atual.tipo === 'pinca') { if (ponteiros.current.size === 0) gesto.current = null; return; }
    gesto.current = null;
    if (atual.tipo === 'linha') {
      if (cancelado) { setLinhaInicio(null); setLinhaFim(null); }
      else if (atual.moveu) terminarLinha(atual.inicioMundo, ajustarLinha(atual.inicioMundo, telaParaMundo(evento.clientX, evento.clientY), evento.shiftKey));
      return;
    }
    if (atual.tipo === 'area') {
      const emAndamento = marcacaoAtual.current;
      const peca = emAndamento && documento.pieces.find((entrada) => entrada.id === emAndamento.pecaId);
      if (!emAndamento || !peca || cancelado) { mudarMarcacao(null); return; }
      // Arrastou e soltou: a área fecha aqui. Só clicou: segue o ponteiro até o próximo clique.
      if (atual.moveu) fecharArea(peca, emAndamento.inicio, posicaoNaPeca(peca, evento.clientX, evento.clientY));
      else props.aoAviso?.('Leve o cursor até o fim da área e clique (ou arraste e solte). Pressione Esc para cancelar.');
      return;
    }
    if (atual.tipo === 'traco') {
      desenharTracoVivo([]);
      if (!cancelado && atual.pontos.length > 2) props.aoTraco(atual.pontos, atual.ferramenta);
      return;
    }
    if (atual.moveu && atual.tipo === 'girar') props.aoAviso?.(`Peça girada para ${atual.giro}°. Use Ctrl+Z para desfazer.`);
    if (atual.moveu && atual.tipo === 'lado') {
      // Saias, rodabancas e acabamentos continuam dentro dos lados que mudaram.
      const peca = documento.pieces.find((entrada) => entrada.id === atual.pecaId);
      if (peca && peca.contour !== atual.contorno) props.substituir(ajustarRecursosDeBorda(documento, peca));
    }
    if (cancelado) { if (atual.moveu && atual.tipo !== 'fundo' && atual.tipo !== 'toque') props.concluirGesto(atual.antes); return; }
    if (atual.moveu) { if (atual.tipo !== 'fundo' && atual.tipo !== 'toque') props.concluirGesto(atual.antes); return; }
    if (atual.tipo === 'peca' || atual.tipo === 'toque' || atual.tipo === 'lado') atual.aoTocar();
    else if (atual.tipo === 'vertice') props.aoSelecionar({ tipo: 'vertice', pecaId: atual.pecaId, verticeId: atual.verticeId });
    else if (atual.tipo === 'fundo') { if (ferramenta === 'TEXTO') props.aoCriarTexto(telaParaMundo(evento.clientX, evento.clientY)); else props.aoSelecionar(null); }
  }

  const visivel = { x: camera.x - tamanho.largura / 2 / camera.escala, y: camera.y - tamanho.altura / 2 / camera.escala, largura: tamanho.largura / camera.escala, altura: tamanho.altura / camera.escala };
  const gradeFina = camera.escala * 100 >= 7;
  const areaVisivel = marcacao ?? props.areaPendente ?? null;
  const pecaDaAreaVisivel = areaVisivel && documento.pieces.find((entrada) => entrada.id === areaVisivel.pecaId);
  return <div ref={recipiente} tabIndex={0} aria-label="Área de desenho técnico. Selecione uma peça e pressione Delete para excluir." className={`tec-canvas${desenhando ? ' desenhando' : ''}${pendenteBorda ? ' escolhendo-lado' : ''}${ferramenta === 'AREA' ? ' marcando-area' : ''}`}
    onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={(evento) => aoSoltar(evento)} onPointerCancel={(evento) => aoSoltar(evento, true)}>
    <svg viewBox={viewBox} role="img" aria-label="Planta do desenho técnico" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="tec-grade-fina" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" className="tec-grade-fina" strokeWidth={px(.6)} /></pattern>
        <pattern id="tec-grade" width="1000" height="1000" patternUnits="userSpaceOnUse"><path d="M 1000 0 L 0 0 0 1000" fill="none" className="tec-grade-grossa" strokeWidth={px(1)} /></pattern>
      </defs>
      <g transform="scale(1 -1)">
        {gradeFina && <rect x={visivel.x} y={visivel.y} width={visivel.largura} height={visivel.altura} fill="url(#tec-grade-fina)" pointerEvents="none" />}
        <rect x={visivel.x} y={visivel.y} width={visivel.largura} height={visivel.altura} fill="url(#tec-grade)" pointerEvents="none" />
        {documento.pieces.map((peca) => <PecaSvg aoTocarLado={props.aoTocarLado} key={peca.id} peca={peca} recursos={documento.features.filter((recurso) => recurso.pieceId === peca.id)} escala={camera.escala} selecao={selecao} destacarLados={!!pendenteBorda}
          mostrarVertices={ferramenta === 'COTA'} verticeMarcado={props.cotaInicio?.pieceId === peca.id ? props.cotaInicio.vertexId : undefined} />)}
        {areaVisivel && pecaDaAreaVisivel && <PreviaArea peca={pecaDaAreaVisivel} marcacao={areaVisivel} escala={camera.escala} />}
        {linhaInicio && linhaFim && <line x1={linhaInicio.x} y1={linhaInicio.y} x2={linhaFim.x} y2={linhaFim.y} stroke="#937444" strokeWidth={px(2)} pointerEvents="none" />}
        {documento.annotations.filter(n => n.lineEnd).map(n => <line key={`linha-${n.id}`} x1={n.x} y1={n.y} x2={n.lineEnd!.x} y2={n.lineEnd!.y} stroke="#937444" strokeWidth={px(3)} data-alvo="texto" data-id={n.id} />)}
        <CotasLivres documento={documento} escala={camera.escala} />
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
