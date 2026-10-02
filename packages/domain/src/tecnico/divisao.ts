import { EPS, bounds, edgeLength, edgePoint, sampleContour, signedArea } from './geometry.js';
import { nomeDaPeca, type Feature, type Piece, type Point, type TechnicalDocument } from './schema.js';

/**
 * Emenda: divisão da peça para produção, quando ela não sai de uma pedra só (bancada maior que a
 * chapa, L em duas pedras, calçada em placas). É um corte reto que começa num lado reto da peça, a
 * `startMm` do vértice que inicia o lado, e atravessa a peça perpendicular a esse lado até o outro
 * lado. Cada emenda separa uma pedra em duas. O valor do orçamento não muda (a área é a mesma): as
 * pedras valem para produzir, conferir no fluxo e entregar, e aparecem na planta da ordem de serviço.
 */
export type Emenda = Pick<Feature, 'id' | 'edgeId' | 'startMm'>;
/** Pedra da peça depois das emendas: contorno no eixo da peça, medidas do retângulo que a envolve e área. */
export type ParteDaPeca = { contorno: Point[]; comprimentoMm: number; larguraMm: number; areaMm2: number };

const igual = (a: Point, b: Point) => Math.abs(a.x - b.x) < .01 && Math.abs(a.y - b.y) < .01;
const semRepetidos = (pontos: Point[]) => pontos.filter((ponto, indice) => !igual(ponto, pontos[(indice + 1) % pontos.length]));
const sobre = (p: Point, a: Point, b: Point) => {
  const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
  if (comprimento < EPS) return igual(p, a);
  const distancia = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / comprimento;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / comprimento ** 2;
  return distancia < .01 && t > -1e-6 && t < 1 + 1e-6;
};
function dentro(p: Point, poligono: Point[]) {
  let resultado = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i], b = poligono[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) resultado = !resultado;
  }
  return resultado;
}

/** Ponto de partida e direção (para dentro da peça) da emenda; só em lado reto, longe das pontas. */
function inicioDaEmenda(peca: Piece, emenda: Emenda) {
  const indice = peca.contour.findIndex((vertice) => vertice.id === emenda.edgeId);
  if (indice < 0 || Math.abs(peca.contour[indice].bulge) > EPS) return null;
  const tamanho = edgeLength(peca, emenda.edgeId!);
  if (!(emenda.startMm > .5 && emenda.startMm < tamanho - .5)) return null;
  const a = peca.contour[indice], b = peca.contour[(indice + 1) % peca.contour.length];
  const lado = { x: (b.x - a.x) / tamanho, y: (b.y - a.y) / tamanho };
  // Contorno no sentido anti-horário: o lado de dentro fica à esquerda de quem anda pelo lado.
  const antiHorario = signedArea(sampleContour(peca.contour)) > 0;
  return { ponto: edgePoint(peca, emenda.edgeId!, emenda.startMm), direcao: antiHorario ? { x: -lado.y, y: lado.x } : { x: lado.y, y: -lado.x } };
}

/** Primeiro ponto em que a semirreta sai do polígono (lado atravessado e o ponto). */
function saida(poligono: Point[], origem: Point, direcao: Point) {
  let melhor: { t: number; ponto: Point; indice: number } | undefined;
  poligono.forEach((a, indice) => {
    const b = poligono[(indice + 1) % poligono.length];
    const segmento = { x: b.x - a.x, y: b.y - a.y };
    const denominador = direcao.x * segmento.y - direcao.y * segmento.x;
    if (Math.abs(denominador) < 1e-9) return;
    const t = ((a.x - origem.x) * segmento.y - (a.y - origem.y) * segmento.x) / denominador;
    const u = ((a.x - origem.x) * direcao.y - (a.y - origem.y) * direcao.x) / denominador;
    if (t > .5 && u > -1e-9 && u < 1 + 1e-9 && (!melhor || t < melhor.t)) melhor = { t, ponto: { x: origem.x + direcao.x * t, y: origem.y + direcao.y * t }, indice };
  });
  return melhor;
}

/** Corta o polígono pela corda que entra em `ponto` (no lado `indice`) e sai do outro lado. */
function cortar(poligono: Point[], ponto: Point, indice: number, direcao: Point): [Point[], Point[]] | null {
  const fim = saida(poligono, ponto, direcao);
  if (!fim || fim.indice === indice) return null;
  const caminho = (de: number, ate: number) => {
    const pontos: Point[] = [];
    for (let i = (de + 1) % poligono.length; ; i = (i + 1) % poligono.length) { pontos.push(poligono[i]); if (i === ate) break; }
    return pontos;
  };
  const primeira = semRepetidos([ponto, ...caminho(indice, fim.indice), fim.ponto]);
  const segunda = semRepetidos([fim.ponto, ...caminho(fim.indice, indice), ponto]);
  return primeira.length >= 3 && segunda.length >= 3 ? [primeira, segunda] : null;
}

const parte = (contorno: Point[]): ParteDaPeca => {
  const caixa = bounds(contorno);
  return { contorno, comprimentoMm: Math.round(caixa.maxX - caixa.minX), larguraMm: Math.round(caixa.maxY - caixa.minY), areaMm2: Math.round(Math.abs(signedArea(contorno))) };
};

/** Emendas da peça, na ordem do desenho. */
export const emendasDaPeca = (doc: Pick<TechnicalDocument, 'features'>, pecaId: string) => doc.features.filter((recurso) => recurso.type === 'SEAM' && recurso.pieceId === pecaId);

/**
 * Pedras da peça depois das emendas (sem emenda, a peça inteira), da esquerda para a direita e de
 * baixo para cima. Emenda que não corta a peça (lado curvo, na ponta) é ignorada.
 */
export function partesDaPeca(peca: Piece, emendas: Emenda[]): ParteDaPeca[] {
  let partes = [semRepetidos(sampleContour(peca.contour, .5))];
  for (const emenda of emendas) {
    const inicio = inicioDaEmenda(peca, emenda);
    if (!inicio) continue;
    const dentroDaPeca = { x: inicio.ponto.x + inicio.direcao.x, y: inicio.ponto.y + inicio.direcao.y };
    const alvo = partes.findIndex((poligono) => dentro(dentroDaPeca, poligono) && poligono.some((a, i) => sobre(inicio.ponto, a, poligono[(i + 1) % poligono.length])));
    if (alvo < 0) continue;
    const poligono = partes[alvo];
    const lado = poligono.findIndex((a, i) => sobre(inicio.ponto, a, poligono[(i + 1) % poligono.length]));
    const cortadas = cortar(poligono, inicio.ponto, lado, inicio.direcao);
    if (cortadas) partes = [...partes.slice(0, alvo), ...cortadas, ...partes.slice(alvo + 1)];
  }
  return partes.map(parte).sort((a, b) => {
    const ca = bounds(a.contorno), cb = bounds(b.contorno);
    return ca.minX - cb.minX || ca.minY - cb.minY;
  });
}

/** Linha da emenda na peça (coordenadas da peça), do lado onde começa até onde sai; null se não corta. */
export function linhaDaEmenda(peca: Piece, emenda: Emenda): { a: Point; b: Point } | null {
  const inicio = inicioDaEmenda(peca, emenda);
  if (!inicio) return null;
  const fim = saida(semRepetidos(sampleContour(peca.contour, .5)), inicio.ponto, inicio.direcao);
  return fim ? { a: inicio.ponto, b: fim.ponto } : null;
}

/** Peça física do desenho: cada pedra (peça inteira ou parte entre emendas), rodabanca e saia. */
export type PecaFisicaDoDesenho = {
  chave: string; nome: string; pecaId: string; recursoId?: string;
  lengthMm: number; widthMm: number; material: string | null;
};
const ROTULO_FAIXA: Partial<Record<Feature['type'], string>> = { BACKSPLASH: 'Rodabanca', SKIRT: 'Saia' };

/**
 * Peças físicas do desenho, as que se cortam, conferem e entregam: as pedras de cada peça (com
 * emendas, uma por parte: "Bancada · parte 1") e as rodabancas e saias, que são pedras à parte.
 */
export function pecasFisicasDoDesenho(doc: TechnicalDocument): PecaFisicaDoDesenho[] {
  return doc.pieces.flatMap((peca) => {
    const nome = nomeDaPeca(peca, doc.pieces);
    const material = peca.material?.name ?? null;
    const partes = partesDaPeca(peca, emendasDaPeca(doc, peca.id));
    const pedras = partes.map((pedra, indice) => ({
      chave: partes.length > 1 ? `${peca.id}:${indice + 1}` : peca.id, nome: partes.length > 1 ? `${nome} · parte ${indice + 1}` : nome,
      pecaId: peca.id, lengthMm: pedra.comprimentoMm, widthMm: pedra.larguraMm, material,
    }));
    const faixas = doc.features.filter((recurso) => recurso.pieceId === peca.id && ROTULO_FAIXA[recurso.type]).map((recurso) => {
      const rotulo = ROTULO_FAIXA[recurso.type]!;
      const proprio = recurso.name?.trim() && recurso.name.trim() !== 'Componente' && recurso.name.trim() !== rotulo ? recurso.name.trim() : '';
      return { chave: recurso.id, nome: proprio || `${rotulo} · ${nome}`, pecaId: peca.id, recursoId: recurso.id, lengthMm: Math.round(recurso.extentMm), widthMm: Math.round(recurso.heightMm), material };
    });
    return [...pedras, ...faixas];
  });
}
