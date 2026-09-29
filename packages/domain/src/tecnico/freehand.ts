import { contornoValido, EPS, signedArea } from './geometry.js';
import type { Point, Vertex } from './schema.js';

/**
 * Desenho livre: o traço do dedo/caneta/mouse vira um contorno de peça.
 * Tudo aqui é puro (sem tela): recebe pontos em mm do mundo e devolve pontos.
 */
export type OpcoesTraco = {
  /** Até quantos graus de 0°/45°/90°… um lado é endireitado. */
  toleranciaAnguloGraus?: number;
  /** Tolerância da simplificação (Ramer–Douglas–Peucker), em fração do tamanho do traço. */
  fracaoSimplificacao?: number;
  /** Lados menores que isto somem (mm). O mínimo real é o maior entre isto e 4% do tamanho do traço. */
  ladoMinimoMm?: number;
  /** Fecha sozinho quando o fim está a menos desta fração do perímetro do começo. */
  fracaoFechamento?: number;
  /** Fecha mesmo aberto (o usuário respondeu "fechar" na pergunta). */
  fechar?: boolean;
};
export type TracoOrganizado = {
  pontos: Point[];
  fechado: boolean;
  /** Aberto, mas dá para fechar se o usuário pedir. */
  podeFechar: boolean;
  /** Fechado, com área e sem cruzamentos (vale como contorno de peça). */
  valido: boolean;
  motivo?: string;
};

const distancia = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const comprimentoTraco = (pontos: Point[]) => pontos.slice(1).reduce((total, ponto, indice) => total + distancia(pontos[indice], ponto), 0);
const diagonal = (pontos: Point[]) => {
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

/** Pontos a cada `passo` mm ao longo do traço (o dedo manda pontos irregulares). */
export function reamostrar(pontos: Point[], passo: number): Point[] {
  if (pontos.length < 2 || !(passo > 0)) return pontos.map((p) => ({ x: p.x, y: p.y }));
  const saida: Point[] = [{ x: pontos[0].x, y: pontos[0].y }];
  let anterior = saida[0], acumulado = 0;
  for (const atual of pontos.slice(1)) {
    let trecho = distancia(anterior, atual);
    while (acumulado + trecho >= passo && trecho > EPS) {
      const t = (passo - acumulado) / trecho;
      anterior = { x: anterior.x + (atual.x - anterior.x) * t, y: anterior.y + (atual.y - anterior.y) * t };
      saida.push(anterior);
      trecho = distancia(anterior, atual); acumulado = 0;
    }
    acumulado += trecho; anterior = atual;
  }
  const ultimo = pontos[pontos.length - 1];
  if (distancia(saida[saida.length - 1], ultimo) > passo / 4) saida.push({ x: ultimo.x, y: ultimo.y });
  return saida;
}

/** Ramer–Douglas–Peucker, sem recursão (traços longos não estouram a pilha). */
export function simplificarRdp(pontos: Point[], tolerancia: number): Point[] {
  if (pontos.length < 3) return pontos.slice();
  const manter = new Array(pontos.length).fill(false);
  manter[0] = manter[pontos.length - 1] = true;
  const pilha: [number, number][] = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [inicio, fim] = pilha.pop()!;
    const a = pontos[inicio], b = pontos[fim], comprimento = distancia(a, b);
    let maior = -1, indiceMaior = -1;
    for (let k = inicio + 1; k < fim; k++) {
      const p = pontos[k];
      const d = comprimento < EPS ? distancia(a, p) : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / comprimento;
      if (d > maior) { maior = d; indiceMaior = k; }
    }
    if (maior > tolerancia) { manter[indiceMaior] = true; pilha.push([inicio, indiceMaior], [indiceMaior, fim]); }
  }
  return pontos.filter((_, indice) => manter[indice]);
}

type Reta = { ponto: Point; angulo: number; comprimento: number; endireitada: boolean };
const normalizar = (angulo: number) => ((angulo % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const diferencaAngulo = (a: number, b: number) => { const d = Math.abs(normalizar(a) - normalizar(b)); return Math.min(d, 2 * Math.PI - d); };

/** Lado a até `tolerancia` graus de um múltiplo de 45° (0°, 45°, 90°…) vira exatamente esse ângulo. */
export function endireitarAngulo(angulo: number, toleranciaGraus = 10): { angulo: number; endireitado: boolean } {
  const passo = Math.PI / 4;
  const alvo = Math.round(angulo / passo) * passo;
  return Math.abs(angulo - alvo) <= toleranciaGraus * Math.PI / 180 ? { angulo: alvo, endireitado: true } : { angulo, endireitado: false };
}

function retasDosPontos(pontos: Point[], fechado: boolean, tolerancia: number): Reta[] {
  const total = fechado ? pontos.length : pontos.length - 1;
  return Array.from({ length: total }, (_, i) => {
    const a = pontos[i], b = pontos[(i + 1) % pontos.length];
    const { angulo, endireitado } = endireitarAngulo(Math.atan2(b.y - a.y, b.x - a.x), tolerancia);
    return { ponto: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angulo, comprimento: distancia(a, b), endireitada: endireitado };
  });
}

/** Junta lados vizinhos na mesma direção (depois de endireitar) num lado só. */
function juntarColineares(retas: Reta[], fechado: boolean, toleranciaGraus: number): Reta[] {
  const lista = retas.slice();
  const mesmaDirecao = (a: Reta, b: Reta) => diferencaAngulo(a.angulo, b.angulo) < (a.endireitada && b.endireitada ? 1e-6 : toleranciaGraus * Math.PI / 180);
  const juntar = (a: Reta, b: Reta): Reta => {
    const peso = a.comprimento + b.comprimento || 1;
    const angulo = a.endireitada ? a.angulo : b.endireitada ? b.angulo : Math.atan2(a.comprimento * Math.sin(a.angulo) + b.comprimento * Math.sin(b.angulo), a.comprimento * Math.cos(a.angulo) + b.comprimento * Math.cos(b.angulo));
    return { ponto: { x: (a.ponto.x * a.comprimento + b.ponto.x * b.comprimento) / peso, y: (a.ponto.y * a.comprimento + b.ponto.y * b.comprimento) / peso }, angulo, comprimento: a.comprimento + b.comprimento, endireitada: a.endireitada || b.endireitada };
  };
  for (let mudou = true; mudou && lista.length > (fechado ? 3 : 1);) {
    mudou = false;
    const limite = fechado ? lista.length : lista.length - 1;
    for (let i = 0; i < limite && lista.length > (fechado ? 3 : 1); i++) {
      const j = (i + 1) % lista.length;
      if (!mesmaDirecao(lista[i], lista[j])) continue;
      lista.splice(i, 1, juntar(lista[i], lista[j]));
      lista.splice(j > i ? j : 0, 1);
      mudou = true; break;
    }
  }
  return lista;
}

/** Cruzamento de duas retas (ponto + ângulo); null quando são paralelas. */
function cruzamento(a: Reta, b: Reta): Point | null {
  const da = { x: Math.cos(a.angulo), y: Math.sin(a.angulo) }, db = { x: Math.cos(b.angulo), y: Math.sin(b.angulo) };
  const cruz = da.x * db.y - da.y * db.x;
  if (Math.abs(cruz) < 1e-9) return null;
  const t = ((b.ponto.x - a.ponto.x) * db.y - (b.ponto.y - a.ponto.y) * db.x) / cruz;
  return { x: a.ponto.x + da.x * t, y: a.ponto.y + da.y * t };
}
const projetar = (p: Point, reta: Reta) => {
  const d = { x: Math.cos(reta.angulo), y: Math.sin(reta.angulo) };
  const t = (p.x - reta.ponto.x) * d.x + (p.y - reta.ponto.y) * d.y;
  return { x: reta.ponto.x + d.x * t, y: reta.ponto.y + d.y * t };
};

/** Vértices onde as retas se encontram (traço aberto: pontas projetadas nas retas das pontas). */
function verticesDasRetas(retas: Reta[], fechado: boolean, inicio: Point, fim: Point): Point[] {
  if (!fechado) {
    const meio = retas.slice(1).map((reta, i) => cruzamento(retas[i], reta) ?? { x: (retas[i].ponto.x + reta.ponto.x) / 2, y: (retas[i].ponto.y + reta.ponto.y) / 2 });
    return [projetar(inicio, retas[0]), ...meio, projetar(fim, retas[retas.length - 1])];
  }
  return retas.map((reta, i) => {
    const anterior = retas[(i - 1 + retas.length) % retas.length];
    return cruzamento(anterior, reta) ?? { x: (anterior.ponto.x + reta.ponto.x) / 2, y: (anterior.ponto.y + reta.ponto.y) / 2 };
  });
}

/**
 * Organiza o traço: reamostra, simplifica, endireita os ângulos, junta lados na
 * mesma direção, tira lados muito curtos e fecha a forma quando o fim volta
 * perto do começo. Ainda sem escala real: veja `aplicarMedidaReferencia`.
 */
export function organizarTraco(bruto: Point[], opcoes: OpcoesTraco = {}): TracoOrganizado {
  const toleranciaAngulo = opcoes.toleranciaAnguloGraus ?? 10;
  const pontosValidos = bruto.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pontosValidos.length < 3) return { pontos: pontosValidos, fechado: false, podeFechar: false, valido: false, motivo: 'Traço curto demais.' };
  const tamanho = diagonal(pontosValidos);
  if (tamanho < EPS) return { pontos: [], fechado: false, podeFechar: false, valido: false, motivo: 'Traço curto demais.' };
  const reamostrado = reamostrar(pontosValidos, Math.max(tamanho / 150, EPS));
  const perimetro = comprimentoTraco(reamostrado);
  const fechado = opcoes.fechar || distancia(reamostrado[0], reamostrado[reamostrado.length - 1]) < (opcoes.fracaoFechamento ?? .08) * perimetro;
  let simples = simplificarRdp(reamostrado, (opcoes.fracaoSimplificacao ?? .025) * tamanho);
  if (fechado && simples.length > 3 && distancia(simples[0], simples[simples.length - 1]) < .08 * perimetro) simples = simples.slice(0, -1);
  if (simples.length < (fechado ? 3 : 2)) return { pontos: simples, fechado, podeFechar: false, valido: false, motivo: 'Não deu para reconhecer a forma. Desenhe de novo, mais devagar.' };

  let retas = juntarColineares(retasDosPontos(simples, fechado, toleranciaAngulo), fechado, toleranciaAngulo);
  const ladoMinimo = Math.max(opcoes.ladoMinimoMm ?? 50, tamanho * .04);
  let pontos = verticesDasRetas(retas, fechado, simples[0], simples[simples.length - 1]);
  // Lados curtos (tremidas do dedo) somem, um por vez, e as retas vizinhas se encontram.
  // Também some o "chanfro" que a mão faz ao arredondar um canto: lado curto entre
  // dois lados retos perpendiculares. Um chanfro de verdade é maior que isso.
  const chanfroAcidental = tamanho * .08;
  const cantoReto = (i: number) => {
    const anterior = retas[(i - 1 + retas.length) % retas.length], seguinte = retas[(i + 1) % retas.length];
    return (fechado || (i > 0 && i < retas.length - 1)) && anterior.endireitada && seguinte.endireitada && Math.abs(diferencaAngulo(anterior.angulo, seguinte.angulo) - Math.PI / 2) < 1e-6;
  };
  for (let guarda = 0; guarda < 200; guarda++) {
    const lados = pontos.map((p, i) => (fechado || i < pontos.length - 1 ? distancia(p, pontos[(i + 1) % pontos.length]) : Infinity));
    const candidatos = lados.map((lado, i) => (lado < ladoMinimo || (lado < chanfroAcidental && cantoReto(i)) ? lado : Infinity));
    const menor = candidatos.reduce((m, lado, i) => (lado < candidatos[m] ? i : m), 0);
    if (candidatos[menor] === Infinity || retas.length <= (fechado ? 3 : 1)) break;
    // O lado entre os vértices `menor` e `menor + 1` está sobre a reta `menor`.
    retas = retas.filter((_, i) => i !== menor);
    retas = juntarColineares(retas, fechado, toleranciaAngulo);
    pontos = verticesDasRetas(retas, fechado, simples[0], simples[simples.length - 1]);
  }
  if (!fechado) return { pontos, fechado: false, podeFechar: pontos.length >= 3, valido: false };
  if (signedArea(pontos) < 0) pontos = pontos.reverse();
  const valido = pontos.length >= 3 && contornoValido(paraContorno('traco', pontos));
  return { pontos, fechado: true, podeFechar: false, valido, motivo: valido ? undefined : 'O contorno ficou cruzado ou sem área. Desfaça o traço e desenhe de novo.' };
}

/** Índice do lado mais comprido (o que o usuário vai medir para dar escala). */
export function ladoMaisComprido(pontos: Point[]) {
  let maior = 0;
  pontos.forEach((p, i) => { if (distancia(p, pontos[(i + 1) % pontos.length]) > distancia(pontos[maior], pontos[(maior + 1) % pontos.length])) maior = i; });
  return maior;
}

/**
 * Dá escala real ao traço: o lado `indiceLado` passa a medir `medidaMm` e a
 * peça toda acompanha. Depois arredonda os vértices em múltiplos de `passoMm`
 * (1 cm ou 5 cm), o que mantém lados retos com medidas redondas.
 */
export function aplicarMedidaReferencia(pontos: Point[], indiceLado: number, medidaMm: number, passoMm = 10): Point[] {
  const a = pontos[indiceLado], b = pontos[(indiceLado + 1) % pontos.length];
  const atual = distancia(a, b);
  if (!(medidaMm > 0) || atual < EPS) return pontos;
  const fator = medidaMm / atual;
  const escalados = pontos.map((p) => ({ x: (p.x - pontos[0].x) * fator, y: (p.y - pontos[0].y) * fator }));
  return arredondarPontos(escalados, passoMm);
}

/** Vértices em múltiplos do passo, sem pontos repetidos (lados de 45° podem ficar a 1 passo do exato). */
export function arredondarPontos(pontos: Point[], passoMm = 10): Point[] {
  const passo = passoMm > 0 ? passoMm : 10;
  const redondos = pontos.map((p) => ({ x: Math.round(p.x / passo) * passo, y: Math.round(p.y / passo) * passo }));
  return redondos.filter((p, i) => distancia(p, redondos[(i + 1) % redondos.length]) > EPS);
}

/** Pontos → contorno da peça, com ids de vértice estáveis (`${id}-v0`, `${id}-v1`…). */
export const paraContorno = (idPeca: string, pontos: Point[]): Vertex[] => pontos.map((p, i) => ({ id: `${idPeca}-v${i}`, x: p.x, y: p.y, bulge: 0 }));

export type RecorteDoTraco = { shape: 'RECTANGLE' | 'OVAL'; x: number; y: number; widthMm: number; lengthMm: number; rotationDeg: number };
/**
 * Traço fechado dentro de uma peça vira recorte (cuba, cooktop): retangular ou
 * oval, o que o traço mais parecer. Um retângulo ocupa quase toda a caixa que o
 * envolve; uma elipse, cerca de 78% (π/4). A orientação vem da direção principal do traço.
 */
export function recorteDoTraco(bruto: Point[], passoMm = 10): RecorteDoTraco | null {
  const pontos = reamostrar(bruto, Math.max(diagonal(bruto) / 150, EPS));
  if (pontos.length < 6) return null;
  const cx = pontos.reduce((s, p) => s + p.x, 0) / pontos.length, cy = pontos.reduce((s, p) => s + p.y, 0) / pontos.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pontos) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy); }
  let angulo = Math.abs(sxx - syy) < EPS && Math.abs(sxy) < EPS ? 0 : .5 * Math.atan2(2 * sxy, sxx - syy);
  angulo = endireitarAngulo(angulo, 10).angulo;
  const cos = Math.cos(-angulo), sin = Math.sin(-angulo);
  const locais = pontos.map((p) => ({ x: (p.x - cx) * cos - (p.y - cy) * sin, y: (p.x - cx) * sin + (p.y - cy) * cos }));
  const xs = locais.map((p) => p.x), ys = locais.map((p) => p.y);
  const largura = Math.max(...xs) - Math.min(...xs), comprimento = Math.max(...ys) - Math.min(...ys);
  if (largura < EPS || comprimento < EPS) return null;
  const ocupacao = Math.abs(signedArea(locais)) / (largura * comprimento);
  const centro = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  const redondo = (v: number) => Math.max(passoMm, Math.round(v / passoMm) * passoMm);
  return {
    shape: ocupacao > .87 ? 'RECTANGLE' : 'OVAL',
    x: Math.round(cx + centro.x * Math.cos(angulo) - centro.y * Math.sin(angulo)),
    y: Math.round(cy + centro.x * Math.sin(angulo) + centro.y * Math.cos(angulo)),
    widthMm: redondo(largura), lengthMm: redondo(comprimento),
    // A rotação dos componentes é em graus no sentido horário.
    rotationDeg: Math.round(-angulo * 180 / Math.PI) || 0,
  };
}
