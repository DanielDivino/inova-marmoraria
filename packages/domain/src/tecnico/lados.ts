import { contornoValido, edgeLength, EPS } from './geometry.js';
import type { Piece, TechnicalDocument, Vertex } from './schema.js';

type Resultado = { contorno: Vertex[] } | { erro: string };
const paralelos = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax * by - ay * bx) <= 1e-6 * Math.hypot(ax, ay) * Math.hypot(bx, by);

/**
 * Muda a medida de um lado (o que começa no vértice `ladoId`): o vértice final
 * anda na direção do lado e os vértices seguintes vão junto até um lado que
 * possa absorver a diferença — de preferência um lado paralelo ao movimento
 * (assim retângulos, L e U continuam em esquadro). Lados travados nunca mudam
 * de medida. Se não houver como fechar a forma, devolve o motivo e nada muda.
 */
export function alterarMedidaLado(contorno: Vertex[], ladoId: string, medidaMm: number, travados: string[] = []): Resultado {
  const n = contorno.length;
  const i = contorno.findIndex((vertice) => vertice.id === ladoId);
  if (i < 0) return { erro: 'Lado não encontrado.' };
  if (!Number.isFinite(medidaMm) || medidaMm <= 0) return { erro: 'Informe uma medida maior que zero.' };
  if (travados.includes(ladoId)) return { erro: 'Este lado está travado. Destrave o cadeado para mudar a medida.' };
  const a = contorno[i], b = contorno[(i + 1) % n];
  if (a.bulge) return { erro: 'Lado curvo: mude a curvatura ou as medidas da forma.' };
  const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
  if (comprimento < EPS) return { erro: 'Lado sem comprimento.' };
  const dx = (b.x - a.x) / comprimento * (medidaMm - comprimento), dy = (b.y - a.y) / comprimento * (medidaMm - comprimento);
  if (Math.hypot(dx, dy) < EPS) return { contorno };
  // Lado j (do vértice j ao j+1) que absorve: os vértices i+1..j andam; o j+1 fica.
  const podeAbsorver = (j: number, soParalelo: boolean) => {
    const inicio = contorno[j], fim = contorno[(j + 1) % n];
    if (travados.includes(inicio.id) || inicio.bulge) return false;
    const ex = fim.x - inicio.x, ey = fim.y - inicio.y, nx = fim.x - (inicio.x + dx), ny = fim.y - (inicio.y + dy);
    if (Math.hypot(nx, ny) < 1 || ex * nx + ey * ny <= 0) return false;
    return !soParalelo || paralelos(ex, ey, dx, dy);
  };
  const lados = Array.from({ length: n - 1 }, (_, passo) => (i + 1 + passo) % n);
  const absorvedor = lados.find((j) => podeAbsorver(j, true)) ?? lados.find((j) => podeAbsorver(j, false));
  if (absorvedor === undefined) return { erro: 'Não dá para fechar a forma com essa medida mantendo os lados travados.' };
  const movidos = new Set<number>();
  for (let k = (i + 1) % n; ; k = (k + 1) % n) { movidos.add(k); if (k === absorvedor) break; }
  const novo = contorno.map((vertice, indice) => movidos.has(indice) ? { ...vertice, x: Math.round((vertice.x + dx) * 10) / 10, y: Math.round((vertice.y + dy) * 10) / 10 } : vertice);
  if (!contornoValido(novo)) return { erro: 'Com essa medida o contorno se cruzaria. Ajuste outro lado antes.' };
  return { contorno: novo };
}

/** Saias, rodabancas e acabamentos continuam dentro do lado depois que ele muda de medida. */
export function ajustarRecursosDeBorda(doc: TechnicalDocument, peca: Piece): TechnicalDocument {
  return { ...doc, features: doc.features.map((recurso) => {
    if (recurso.pieceId !== peca.id || !recurso.edgeId || !peca.contour.some((vertice) => vertice.id === recurso.edgeId)) return recurso;
    const lado = edgeLength(peca, recurso.edgeId);
    const startMm = Math.min(recurso.startMm, Math.max(0, lado - 1));
    return { ...recurso, startMm, extentMm: Math.min(recurso.extentMm, lado - startMm) };
  }) };
}
