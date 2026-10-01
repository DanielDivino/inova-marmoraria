import { acabamentoBordaPedra } from '../orcamentos/edge-finishes.js';
import { EPS, edgeLength, edgePoint, sampleContour } from './geometry.js';
import { nomeDaPeca, type Feature, type Piece, type Point, type TechnicalDocument } from './schema.js';

/**
 * Desenho técnico → projeto do orçamento. O orçamento só conhece peças
 * retangulares (comprimento × largura), então:
 * - peça com todos os lados em esquadro (reta, L, U, desenho livre organizado)
 *   vira os retângulos que a compõem, como a marmoraria cobra um L (duas partes)
 *   ou um U (três partes): a área é exatamente a do contorno;
 * - peça com curva ou corte diagonal (redonda, cantos arredondados, livre torta)
 *   é cobrada pelo retângulo que a envolve — a pedra sai inteira da chapa;
 * - rodabanca vira peça da mesma pedra (extensão × altura), presa ao lado;
 * - saia e acabamento viram bordas no lado da parte onde estão;
 * - cuba, cooktop e furo viram recortes na parte onde estão, com a posição.
 * Medidas em mm inteiros, como o orçamento guarda. Este é o único lugar da
 * regra: a estimativa do desenho e o projeto que vai para o orçamento saem
 * daqui, então o valor aceito é o mesmo que o resumo do orçamento mostra.
 */
export type LadoRetangulo = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';
/** Retângulo no eixo da peça (mm, y para cima): FRONT embaixo, BACK em cima. */
export type Retangulo = { x0: number; y0: number; x1: number; y1: number };
export type BordaDoDesenho = {
  recursoId: string; tipo: 'SKIRT' | 'EDGE_FINISH'; side: LadoRetangulo | 'CUSTOM';
  /** Cobre o lado inteiro da parte: acompanha a medida dela se for mudada no orçamento. */
  ladoInteiro: boolean; customLabel?: string; lengthMm: number; heightMm?: number; serviceId?: string;
};
export type ComponenteDoDesenho = {
  id: string; pecaId: string; recursoId?: string; label: string; componentType: 'TOP' | 'BACKSPLASH'; orientation: 'HORIZONTAL' | 'VERTICAL';
  lengthMm: number; widthMm: number; materialId?: string; bordas: BordaDoDesenho[];
  /** Rodabanca presa a um lado de uma parte (id da parte). */
  paiId?: string; ladoPai?: LadoRetangulo;
  /** Peça curva ou diagonal cobrada pelo retângulo que a envolve. */
  envolvente: boolean; retangulo?: Retangulo;
  /** Como a peça do desenho pode receber mudanças do orçamento e qual parte dela este componente é. */
  forma: FormaNoDesenho; parte: number;
  /** Peça arredondada do desenho: cantos arredondados nas 4 pontas no orçamento. */
  raioCantosMm?: number;
};
/**
 * Forma da peça do desenho para receber mudanças do orçamento: RETANGULO (reta, inclusive com cantos
 * arredondados) muda de medida pelo orçamento; COMPOSTA (L, U, desenho em esquadro) e LIVRE (curva,
 * diagonal) só no desenho.
 */
export type FormaNoDesenho = 'RETANGULO' | 'COMPOSTA' | 'LIVRE';
export function formaDaPeca(peca: Piece): FormaNoDesenho {
  if (peca.geometryMode === 'PARAMETRIC' && (peca.parameters?.shape === 'RECTANGLE' || peca.parameters?.shape === 'ROUNDED')) return 'RETANGULO';
  const { retangulos, envolvente } = retangulosDaPeca(peca);
  return envolvente ? 'LIVRE' : retangulos.length === 1 ? 'RETANGULO' : 'COMPOSTA';
}
export type TipoRecorteOrcamento = 'SINK' | 'SCULPTED_SINK' | 'OVAL_SINK' | 'COOKTOP' | 'FAUCET_HOLE';
export type RecorteDoDesenho = {
  recursoId: string; pecaId: string; componente: number; cutoutType: TipoRecorteOrcamento; label: string;
  lengthMm: number; widthMm: number; diameterMm?: number; positionX: number; positionY: number; serviceId?: string;
};
export type ServicoDoDesenho = { serviceId: string; quantidade: number };
export type ItemDoDesenho = { materialId?: string; componentes: ComponenteDoDesenho[]; recortes: RecorteDoDesenho[]; servicos: ServicoDoDesenho[] };

export type ServicoParaConversao = { id: string; name: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED' };
export type OpcoesConversao = {
  servicoDoRecurso?: Record<string, string>;
  servicosGerais?: { serviceId: string; quantidade?: number }[];
};

const BORDA: Feature['type'][] = ['SKIRT', 'EDGE_FINISH', 'BACKSPLASH'];
const mm = (valor: number) => Math.round(valor) || 0;
const pontosIguais = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const area = (r: Retangulo) => (r.x1 - r.x0) * (r.y1 - r.y0);

/** Contorno em mm inteiros, sem pontos repetidos nem colineares, se todos os lados estiverem em esquadro. */
function contornoEmEsquadro(peca: Piece): Point[] | null {
  if (peca.contour.some((vertice) => Math.abs(vertice.bulge) > EPS)) return null;
  let pontos = peca.contour.map((vertice) => ({ x: mm(vertice.x), y: mm(vertice.y) })).filter((p, i, todos) => !pontosIguais(p, todos[(i + 1) % todos.length]));
  pontos = pontos.filter((p, i) => {
    const antes = pontos[(i - 1 + pontos.length) % pontos.length], depois = pontos[(i + 1) % pontos.length];
    return !((antes.x === p.x && p.x === depois.x) || (antes.y === p.y && p.y === depois.y));
  });
  if (pontos.length < 4) return null;
  return pontos.every((p, i) => { const q = pontos[(i + 1) % pontos.length]; return p.x === q.x || p.y === q.y; }) ? pontos : null;
}

/**
 * Faixas horizontais (corta em cada y do contorno) juntando as que continuam
 * com a mesma largura; `emPe` faz o mesmo com faixas verticais.
 */
function faixas(contorno: Point[], emPe: boolean): Retangulo[] {
  const pontos = emPe ? contorno.map(({ x, y }) => ({ x: y, y: x })) : contorno;
  const ys = [...new Set(pontos.map((p) => p.y))].sort((a, b) => a - b);
  let abertos: Retangulo[] = [];
  const prontos: Retangulo[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1], meio = (y0 + y1) / 2;
    const xs = pontos.flatMap((a, k) => { const b = pontos[(k + 1) % pontos.length]; return a.x === b.x && (a.y - meio) * (b.y - meio) < 0 ? [a.x] : []; }).sort((a, b) => a - b);
    const agora: Retangulo[] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const [x0, x1] = [xs[k], xs[k + 1]];
      if (x1 <= x0) continue;
      const continua = abertos.find((r) => r.x0 === x0 && r.x1 === x1 && r.y1 === y0);
      if (continua) { continua.y1 = y1; agora.push(continua); } else agora.push({ x0, x1, y0, y1 });
    }
    prontos.push(...abertos.filter((r) => !agora.includes(r)));
    abertos = agora;
  }
  prontos.push(...abertos);
  return emPe ? prontos.map((r) => ({ x0: r.y0, x1: r.y1, y0: r.x0, y1: r.x1 })) : prontos;
}

/** Partes retangulares da peça (a maior primeiro) ou o retângulo que a envolve. */
export function retangulosDaPeca(peca: Piece): { retangulos: Retangulo[]; envolvente: boolean } {
  const contorno = contornoEmEsquadro(peca);
  if (!contorno) {
    const pontos = sampleContour(peca.contour, .05);
    const [xs, ys] = [pontos.map((p) => p.x), pontos.map((p) => p.y)];
    return { retangulos: [{ x0: mm(Math.min(...xs)), y0: mm(Math.min(...ys)), x1: mm(Math.max(...xs)), y1: mm(Math.max(...ys)) }], envolvente: true };
  }
  // Menos partes; empatando, a que deixa a parte principal maior (o balcão inteiro, os braços à parte).
  const deitadas = faixas(contorno, false), emPe = faixas(contorno, true);
  const maior = (lista: Retangulo[]) => Math.max(...lista.map(area));
  const escolhidas = emPe.length < deitadas.length || (emPe.length === deitadas.length && maior(emPe) > maior(deitadas)) ? emPe : deitadas;
  return { retangulos: [...escolhidas].sort((a, b) => area(b) - area(a) || b.y1 - a.y1 || a.x0 - b.x0), envolvente: false };
}

type Trecho = { indice: number; side: LadoRetangulo; lengthMm: number; ladoInteiro: boolean };
/** Pedaços de um trecho reto de lado da peça sobre os lados das partes (a soma é o trecho inteiro). */
function trechosNasPartes(a: Point, b: Point, partes: Retangulo[]): Trecho[] {
  const trechos: Trecho[] = [];
  const sobre = (inicio: number, fim: number, de: number, ate: number) => Math.max(0, Math.min(Math.max(inicio, fim), ate) - Math.max(Math.min(inicio, fim), de));
  partes.forEach((r, indice) => {
    const lados: [LadoRetangulo, boolean, number, number, number][] = [
      ['FRONT', a.y === b.y && a.y === r.y0, a.x, b.x, r.x1 - r.x0], ['BACK', a.y === b.y && a.y === r.y1, a.x, b.x, r.x1 - r.x0],
      ['LEFT', a.x === b.x && a.x === r.x0, a.y, b.y, r.y1 - r.y0], ['RIGHT', a.x === b.x && a.x === r.x1, a.y, b.y, r.y1 - r.y0],
    ];
    for (const [side, noLado, inicio, fim, tamanho] of lados) {
      if (!noLado) continue;
      const [de, ate] = side === 'FRONT' || side === 'BACK' ? [r.x0, r.x1] : [r.y0, r.y1];
      const lengthMm = sobre(inicio, fim, de, ate);
      if (lengthMm > 0) trechos.push({ indice, side, lengthMm, ladoInteiro: lengthMm === tamanho });
    }
  });
  return trechos;
}

const ROTULO: Record<Feature['type'], string> = { SINK: 'Cuba', SCULPTED_SINK: 'Cuba esculpida', CUTOUT: 'Recorte / cooktop', HOLE: 'Furo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', EDGE_FINISH: 'Acabamento de borda' };
/** Nome do componente no orçamento: o dado no desenho ou, sem nome, o tipo ("Saia", "Cuba"). */
export const nomeDoRecurso = (recurso: Pick<Feature, 'type' | 'name'>) => recurso.name?.trim() && recurso.name.trim() !== 'Componente' ? recurso.name.trim() : ROTULO[recurso.type];
const normalizar = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
/** Serviço sugerido para cada componente, pelos nomes usados no orçamento (o primeiro que existir). */
const SUGESTOES: Record<string, string[]> = {
  SINK: ['recorte de cuba', 'corte de cuba quadrado'], SINK_OVAL: ['corte de cuba oval', 'recorte de cuba'],
  SCULPTED_SINK: ['cuba esculpida', 'cuba escupido'], HOLE: ['furo de torneira', 'furo de cuba'],
  CUTOUT: ['corte para fogao', 'furo de cooktop/lixeira/torre'],
  EDGE_SIMPLE: ['acabamento simples'], EDGE_MITER45: ['acabamento 45°', 'acabamento 45° — granito/marmore'],
  EDGE_ROUND: ['acabamento boleado', 'acabamento meia cana'], EDGE_BEVEL: ['chanfro', 'acabamento chanfrado'],
};
export function servicoSugerido<T extends { name: string }>(recurso: Pick<Feature, 'type' | 'shape' | 'profile'>, servicos: T[]): T | undefined {
  const chave = recurso.type === 'EDGE_FINISH' ? `EDGE_${recurso.profile}` : recurso.type === 'SINK' && recurso.shape === 'OVAL' ? 'SINK_OVAL' : recurso.type;
  for (const nome of SUGESTOES[chave] ?? []) {
    const encontrado = servicos.find((servico) => normalizar(servico.name) === normalizar(nome));
    if (encontrado) return encontrado;
  }
  return undefined;
}
/** Serviço "Saia" do catálogo (cobrado pela área no preço da pedra, lançado como borda por metro linear). */
export const servicoSaia = <T extends ServicoParaConversao>(servicos: T[]) => servicos.find((servico) => acabamentoBordaPedra(servico.name) === 'SKIRT' && servico.billingUnit === 'LINEAR_METER');

const TIPO_RECORTE: Record<'SINK' | 'SCULPTED_SINK' | 'CUTOUT' | 'HOLE', TipoRecorteOrcamento> = { SINK: 'SINK', SCULPTED_SINK: 'SCULPTED_SINK', CUTOUT: 'COOKTOP', HOLE: 'FAUCET_HOLE' };

export function desenhoParaOrcamento(doc: TechnicalDocument, servicos: ServicoParaConversao[], opcoes: OpcoesConversao = {}): ItemDoDesenho {
  const componentes: ComponenteDoDesenho[] = [];
  const recortes: RecorteDoDesenho[] = [];
  const servicoDe = (recurso: Feature) => {
    const escolhido = opcoes.servicoDoRecurso?.[recurso.id];
    return escolhido ? servicos.find((servico) => servico.id === escolhido) : servicoSugerido(recurso, servicos);
  };
  const saia = servicoSaia(servicos);

  for (const peca of doc.pieces) {
    const nome = nomeDaPeca(peca, doc.pieces);
    const materialId = peca.material?.id;
    const { retangulos, envolvente } = retangulosDaPeca(peca);
    const forma = formaDaPeca(peca);
    const raioCantos = peca.geometryMode === 'PARAMETRIC' && peca.parameters?.shape === 'ROUNDED' && peca.parameters.radius > 0 ? mm(Math.min(peca.parameters.radius, peca.parameters.width / 2, peca.parameters.length / 2)) : 0;
    const partes = retangulos.map((retangulo, indice) => {
      const componente: ComponenteDoDesenho = {
        id: indice ? `${peca.id}#${indice + 1}` : peca.id, pecaId: peca.id, label: retangulos.length > 1 ? `${nome} · parte ${indice + 1}` : nome,
        componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: retangulo.x1 - retangulo.x0, widthMm: retangulo.y1 - retangulo.y0,
        materialId, bordas: [], envolvente, retangulo, forma, parte: indice,
        ...(raioCantos ? { raioCantosMm: raioCantos } : {}),
      };
      componentes.push(componente);
      return componente;
    });
    const recursos = doc.features.filter((recurso) => recurso.pieceId === peca.id);

    // Trechos de lado (saia, acabamento, rodabanca): em esquadro caem nos lados das partes; lado curvo fica como borda avulsa.
    const trechosDo = (recurso: Feature) => {
      const indice = peca.contour.findIndex((vertice) => vertice.id === recurso.edgeId);
      if (indice < 0) return null;
      const comprimento = edgeLength(peca, recurso.edgeId!);
      const inicio = Math.min(Math.max(0, recurso.startMm), comprimento), fim = Math.min(comprimento, inicio + Math.max(0, recurso.extentMm));
      const total = mm(fim - inicio);
      if (total < 1) return null;
      const reto = Math.abs(peca.contour[indice].bulge) <= EPS;
      const a = edgePoint(peca, recurso.edgeId!, inicio), b = edgePoint(peca, recurso.edgeId!, fim);
      const trechos = reto ? trechosNasPartes({ x: mm(a.x), y: mm(a.y) }, { x: mm(b.x), y: mm(b.y) }, retangulos) : [];
      return { lado: indice + 1, total, trechos: trechos.reduce((soma, trecho) => soma + trecho.lengthMm, 0) === total ? trechos : [] };
    };

    for (const recurso of recursos.filter((entrada) => BORDA.includes(entrada.type) && entrada.edgeId)) {
      const trechos = trechosDo(recurso);
      if (!trechos) continue;
      if (recurso.type === 'BACKSPLASH') {
        const presa = trechos.trechos.length === 1 ? trechos.trechos[0] : undefined;
        componentes.push({
          id: recurso.id, pecaId: peca.id, recursoId: recurso.id, label: nomeDoRecurso(recurso) === 'Rodabanca' ? `Rodabanca · ${nome}` : nomeDoRecurso(recurso),
          componentType: 'BACKSPLASH', orientation: 'VERTICAL', lengthMm: trechos.total, widthMm: Math.max(1, mm(recurso.heightMm)), materialId, bordas: [], envolvente: false, forma, parte: 0,
          ...(presa ? { paiId: partes[presa.indice].id, ladoPai: presa.side } : {}),
        });
        continue;
      }
      const tipo = recurso.type as 'SKIRT' | 'EDGE_FINISH';
      const serviceId = tipo === 'SKIRT' ? saia?.id : servicoDe(recurso)?.id;
      const extra = tipo === 'SKIRT' ? { heightMm: Math.max(1, mm(recurso.heightMm)) } : {};
      if (trechos.trechos.length) for (const trecho of trechos.trechos) partes[trecho.indice].bordas.push({ recursoId: recurso.id, tipo, side: trecho.side, ladoInteiro: trecho.ladoInteiro, lengthMm: trecho.lengthMm, serviceId, ...extra });
      else partes[0].bordas.push({ recursoId: recurso.id, tipo, side: 'CUSTOM', ladoInteiro: false, customLabel: `Lado ${trechos.lado}`, lengthMm: trechos.total, serviceId, ...extra });
    }

    // Cuba, cooktop e furo: na parte onde está o centro (ou na mais próxima), com a posição a partir do canto de cima à esquerda.
    for (const recurso of recursos.filter((entrada) => !BORDA.includes(entrada.type))) {
      const distancia = (r: Retangulo) => Math.hypot(Math.max(r.x0 - recurso.x, 0, recurso.x - r.x1), Math.max(r.y0 - recurso.y, 0, recurso.y - r.y1));
      const indice = retangulos.reduce((melhor, r, i) => distancia(r) < distancia(retangulos[melhor]) ? i : melhor, 0);
      const r = retangulos[indice];
      const deitado = ((mm(recurso.rotationDeg) % 180) + 180) % 180 === 90;
      const furo = recurso.type === 'HOLE';
      const [x, y] = furo ? [recurso.diameterMm, recurso.diameterMm] : deitado ? [recurso.lengthMm, recurso.widthMm] : [recurso.widthMm, recurso.lengthMm];
      const tipo = recurso.type as keyof typeof TIPO_RECORTE;
      recortes.push({
        recursoId: recurso.id, pecaId: peca.id, componente: componentes.indexOf(partes[indice]),
        cutoutType: tipo === 'SINK' && recurso.shape === 'OVAL' ? 'OVAL_SINK' : TIPO_RECORTE[tipo], label: nomeDoRecurso(recurso),
        lengthMm: Math.max(1, mm(x)), widthMm: Math.max(1, mm(y)), ...(furo ? { diameterMm: Math.max(1, mm(recurso.diameterMm)) } : {}),
        positionX: Math.max(0, mm(recurso.x - r.x0)), positionY: Math.max(0, mm(r.y1 - recurso.y)), serviceId: servicoDe(recurso)?.id,
      });
    }
  }

  // Serviços do projeto: um por serviço (por unidade, as quantidades se somam), como no orçamento.
  const servicosDoProjeto: ServicoDoDesenho[] = [];
  for (const geral of opcoes.servicosGerais ?? []) {
    const existente = servicosDoProjeto.find((servico) => servico.serviceId === geral.serviceId);
    const quantidade = Math.max(1, geral.quantidade ?? 1);
    if (!existente) servicosDoProjeto.push({ serviceId: geral.serviceId, quantidade });
    else if (servicos.find((servico) => servico.id === geral.serviceId)?.billingUnit === 'UNIT') existente.quantidade += quantidade;
  }
  return { materialId: componentes.find((componente) => componente.materialId)?.materialId, componentes, recortes, servicos: servicosDoProjeto };
}
