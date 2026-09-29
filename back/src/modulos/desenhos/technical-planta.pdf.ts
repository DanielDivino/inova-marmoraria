import { cotasDaPeca, distanciasAteBordas, edgeLength, edgePoint, featureContour, formatMeasure, rotate, sampleContour, type CotaLado, type Feature, type Piece, type Point, type TechnicalDocument } from '@inova/domain/technical';

type Pdf = PDFKit.PDFDocument;

/** Mesma paleta do orçamento e da nota de entrega; pedra e recortes como no desenho do orçamento. */
export const COR = {
  tinta: '#17251f', rotulo: '#6f685e', apagado: '#9a9388', ouro: '#8a6320', dourado: '#b6811e', linha: '#dfd9cf', forte: '#8f887c',
  cabecalho: '#dcd9d3', zebra: '#f7f5f1', creme: '#fbf5e6', borda: '#e6cf8f', pedra: '#fff7e5', cota: '#80776a', textoCota: '#4f4940', recorte: '#8b6b3a',
};
export const ROTULO_RECURSO: Record<Feature['type'], string> = { SINK: 'Cuba', SCULPTED_SINK: 'Cuba esculpida', CUTOUT: 'Recorte / cooktop', HOLE: 'Furo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', EDGE_FINISH: 'Acabamento de borda' };
const BORDA = { SKIRT: { fundo: '#ead49b', traco: '#9b6817' }, BACKSPLASH: { fundo: '#dde3d4', traco: '#52654c' }, EDGE_FINISH: { fundo: COR.dourado, traco: COR.dourado } };
export const ehRecursoDeBorda = (recurso: Feature): recurso is Feature & { type: keyof typeof BORDA } => recurso.type in BORDA;
/** Espessuras e alturas em centímetros, com decimal quando houver ("2cm", "2,5cm"). */
export const centimetros = (mm: number) => `${(mm / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}cm`;

const LARGURA = 523;
/** Espaço dentro do quadro, em volta do desenho, para as cotas dos lados. */
const FOLGA = 44;
/** Faixa da legenda e da escala, no pé do quadro. */
const LEGENDA = 20;
const PT_POR_MM = 72 / 25.4;
const ESCALAS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];

// Mesma projeção em planta do editor: giro da peça em torno da sua origem, sem a inclinação.
const noMundo = (local: Point, peca: Piece): Point => { const v = rotate(local, peca.rotationDeg); return { x: v.x + peca.x, y: v.y + peca.y }; };

/** Cota livre entre dois vértices, já afastada da linha medida (coordenadas do mundo). */
function cotaLivre(documento: TechnicalDocument, cota: TechnicalDocument['dimensions'][number]) {
  const pecaA = documento.pieces.find((peca) => peca.id === cota.from.pieceId), pecaB = documento.pieces.find((peca) => peca.id === cota.to.pieceId);
  const verticeA = pecaA?.contour.find((vertice) => vertice.id === cota.from.vertexId), verticeB = pecaB?.contour.find((vertice) => vertice.id === cota.to.vertexId);
  if (!pecaA || !pecaB || !verticeA || !verticeB) return null;
  const a = noMundo(verticeA, pecaA), b = noMundo(verticeB, pecaB);
  const comprimento = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: -(b.y - a.y) / comprimento, y: (b.x - a.x) / comprimento };
  const afastar = (p: Point) => ({ x: p.x + normal.x * cota.offsetMm, y: p.y + normal.y * cota.offsetMm });
  return { a, b, a2: afastar(a), b2: afastar(b), normal, comprimento };
}

export type Planta = { minX: number; maxY: number; larguraMundo: number; alturaMundo: number; escala: number; proporcao: number | null; altura: number };

/**
 * Escolhe a maior escala padrão (1:10, 1:20, 1:25…) em que o desenho cabe no
 * quadro de 523 pt de largura e até `alturaMax` de altura. O quadro fica só com
 * a altura que o desenho precisa.
 */
export function planejarPlanta(documento: TechnicalDocument, alturaMax: number): Planta {
  const pontos = [
    ...documento.pieces.flatMap((peca) => sampleContour(peca.contour, 2).map((vertice) => noMundo(vertice, peca))),
    ...documento.dimensions.flatMap((cota) => { const livre = cotaLivre(documento, cota); return livre ? [livre.a, livre.b, livre.a2, livre.b2] : []; }),
    ...documento.annotations.map(({ x, y }) => ({ x, y })),
  ];
  const minX = Math.min(...pontos.map((p) => p.x)), maxX = Math.max(...pontos.map((p) => p.x));
  const minY = Math.min(...pontos.map((p) => p.y)), maxY = Math.max(...pontos.map((p) => p.y));
  const larguraMundo = Math.max(1, maxX - minX), alturaMundo = Math.max(1, maxY - minY);
  const cabeLargura = LARGURA - 2 * FOLGA, cabeAltura = Math.max(60, alturaMax - 2 * FOLGA - LEGENDA);
  const proporcao = ESCALAS.find((razao) => larguraMundo * PT_POR_MM / razao <= cabeLargura && alturaMundo * PT_POR_MM / razao <= cabeAltura) ?? null;
  const escala = proporcao ? PT_POR_MM / proporcao : Math.min(cabeLargura / larguraMundo, cabeAltura / alturaMundo);
  return { minX, maxY, larguraMundo, alturaMundo, escala, proporcao, altura: Math.max(170, alturaMundo * escala + 2 * FOLGA + LEGENDA) };
}

/** Ângulo (graus, sentido horário da página) para o texto acompanhar a linha sem ficar de cabeça para baixo. */
function anguloLegivel(direcao: Point) {
  let angulo = Math.round(Math.atan2(direcao.y, direcao.x) * 180 / Math.PI * 100) / 100;
  while (angulo >= 90) angulo -= 180;
  while (angulo < -90) angulo += 180;
  return angulo;
}

type EstiloTexto = { fonte: string; tamanho: number; cor: string; fundo?: boolean };
/** Texto centrado num ponto, girado junto com a linha; com fundo branco ele "corta" a linha da cota. */
function rotulo(pdf: Pdf, texto: string, centro: Point, angulo: number, { fonte, tamanho, cor, fundo }: EstiloTexto) {
  pdf.font(fonte).fontSize(tamanho);
  const largura = pdf.widthOfString(texto);
  pdf.save();
  if (angulo) pdf.rotate(angulo, { origin: [centro.x, centro.y] });
  if (fundo) pdf.rect(centro.x - largura / 2 - 1.5, centro.y - tamanho * .55, largura + 3, tamanho * 1.1).fill('#ffffff');
  pdf.fillColor(cor).text(texto, centro.x - largura / 2, centro.y - tamanho * .36, { lineBreak: false });
  pdf.restore();
}

/** Cota alinhada: linhas de chamada, linha de cota com traços a 45° e a medida no meio (ou por fora, se não couber). */
function cotaAlinhada(pdf: Pdf, a: Point, b: Point, normal: Point, afastamento: number, texto: string, estilo: EstiloTexto & { linha: string }, inicioChamada = 6) {
  const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
  if (comprimento < .5) return;
  const u = { x: (b.x - a.x) / comprimento, y: (b.y - a.y) / comprimento };
  const em = (p: Point, distancia: number) => ({ x: p.x + normal.x * distancia, y: p.y + normal.y * distancia });
  const a2 = em(a, afastamento), b2 = em(b, afastamento);
  const traco = { x: (u.x + normal.x) * 2.2, y: (u.y + normal.y) * 2.2 };
  pdf.save().lineWidth(.5).strokeColor(estilo.linha);
  for (const [origem, ponta] of [[a, a2], [b, b2]]) {
    const inicio = em(origem, Math.min(inicioChamada, afastamento)), fim = em(origem, afastamento + 4);
    pdf.moveTo(inicio.x, inicio.y).lineTo(fim.x, fim.y).moveTo(ponta.x - traco.x, ponta.y - traco.y).lineTo(ponta.x + traco.x, ponta.y + traco.y);
  }
  pdf.moveTo(a2.x, a2.y).lineTo(b2.x, b2.y).stroke().restore();
  pdf.font(estilo.fonte).fontSize(estilo.tamanho);
  const cabe = pdf.widthOfString(texto) + 8 <= comprimento;
  const meio = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  rotulo(pdf, texto, cabe ? meio : em(meio, estilo.tamanho + 1), anguloLegivel(u), { ...estilo, fundo: cabe });
}

const dentro = (p: Point, poligono: Point[]) => {
  let resultado = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i], b = poligono[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) resultado = !resultado;
  }
  return resultado;
};
type Segmento = readonly [Point, Point];
const segmentos = (poligono: Point[]): Segmento[] => poligono.map((p, i) => [p, poligono[(i + 1) % poligono.length]] as const);
/** Contorno de um texto girado (centro, direção do texto, meia largura e meia altura). */
const caixaDoTexto = (centro: Point, u: Point, meiaLargura: number, meiaAltura: number) => segmentos([[-1, -1], [1, -1], [1, 1], [-1, 1]]
  .map(([i, j]) => ({ x: centro.x + u.x * meiaLargura * i - u.y * meiaAltura * j, y: centro.y + u.y * meiaLargura * i + u.x * meiaAltura * j })));
/** Pontos a cada ~2 pt ao longo dos segmentos: a caixa do nome não pode conter nenhum deles. */
const amostrar = (linhas: Segmento[]) => linhas.flatMap(([a, b]) => {
  const passos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
  return Array.from({ length: passos + 1 }, (_, k) => ({ x: a.x + (b.x - a.x) * k / passos, y: a.y + (b.y - a.y) * k / passos }));
});

/**
 * Lugar dentro da pedra para uma caixa de texto (meia largura × meia altura)
 * com a maior sobra até as bordas, os recortes e o que já foi escrito ali;
 * `folga` negativa quer dizer que a caixa não cabe em lugar nenhum.
 */
function lugarDoNome(contorno: Point[], recortes: Point[][], pontos: Point[], meiaLargura: number, meiaAltura: number) {
  const xs = contorno.map((p) => p.x), ys = contorno.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let melhor = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, folga = -Infinity;
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
    const p = { x: minX + (maxX - minX) * i / 24, y: minY + (maxY - minY) * j / 24 };
    if (!dentro(p, contorno) || recortes.some((recorte) => dentro(p, recorte))) continue;
    let sobra = Infinity;
    for (const q of pontos) {
      sobra = Math.min(sobra, Math.max(Math.abs(q.x - p.x) - meiaLargura, Math.abs(q.y - p.y) - meiaAltura));
      if (sobra <= folga) break;
    }
    if (sobra > folga) { folga = sobra; melhor = p; }
  }
  return { ponto: melhor, folga };
}

/**
 * Planta dentro de um quadro de 523 pt a partir de `topo`: pedras, saias,
 * rodabancas e acabamentos, recortes tracejados com a distância até as bordas,
 * medida de cada lado (ou o texto combinado, em itálico), cotas livres, textos
 * e, no pé do quadro, a legenda e a escala.
 */
export function desenharPlanta(pdf: Pdf, documento: TechnicalDocument, planta: Planta, topo: number) {
  const { escala } = planta;
  const zona = planta.altura - LEGENDA;
  const x0 = 36 + (LARGURA - planta.larguraMundo * escala) / 2, y0 = topo + (zona - planta.alturaMundo * escala) / 2;
  const P = (p: Point): Point => ({ x: x0 + (p.x - planta.minX) * escala, y: y0 + (planta.maxY - p.y) * escala });
  const naPagina = (p: Point, peca: Piece) => P(noMundo(p, peca));
  /** Direção para fora da peça, na página (y para baixo). */
  const normalNaPagina = (cota: CotaLado, peca: Piece) => { const n = rotate(cota.normal, peca.rotationDeg); return { x: n.x, y: -n.y }; };
  const caminho = (pontos: Point[]) => { pdf.moveTo(pontos[0].x, pontos[0].y); pontos.slice(1).forEach((p) => pdf.lineTo(p.x, p.y)); return pdf.closePath(); };

  pdf.lineWidth(.8).roundedRect(36, topo, LARGURA, planta.altura, 4).stroke(COR.linha);
  pdf.lineWidth(.5).moveTo(36, topo + zona).lineTo(36 + LARGURA, topo + zona).stroke(COR.linha);

  const cotas = new Map(documento.pieces.map((peca) => [peca.id, cotasDaPeca(peca)]));
  const pecas = documento.pieces.map((peca) => ({ peca, contorno: sampleContour(peca.contour, 2).map((vertice) => naPagina(vertice, peca)) }));
  const recortes = documento.features.filter((recurso) => !ehRecursoDeBorda(recurso)).flatMap((recurso) => {
    const peca = documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
    return peca ? [{ recurso, peca, contorno: sampleContour(featureContour(recurso), 1).map((vertice) => naPagina(vertice, peca)) }] : [];
  });
  const distancias = recortes.flatMap(({ recurso, peca }) => distanciasAteBordas(recurso, peca)
    .map(({ de, ate, distancia }) => ({ peca, de: naPagina(de, peca), ate: naPagina(ate, peca), distancia })));

  for (const { contorno } of pecas) caminho(contorno).lineWidth(1.2).fillAndStroke(COR.pedra, COR.dourado);

  // Saia e rodabanca: faixa do lado de fora do trecho; acabamento: o próprio lado reforçado. Lado curvo: linha grossa no arco.
  for (const recurso of documento.features) {
    if (!ehRecursoDeBorda(recurso) || !recurso.edgeId) continue;
    const peca = documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
    const cota = peca && cotas.get(peca.id)?.find((entrada) => entrada.ladoId === recurso.edgeId);
    if (!peca || !cota) continue;
    const inicio = Math.max(0, recurso.startMm), fim = Math.min(edgeLength(peca, recurso.edgeId), recurso.startMm + recurso.extentMm);
    if (fim <= inicio) continue;
    const { fundo, traco } = BORDA[recurso.type];
    const passos = cota.curvo ? 16 : 1;
    const trecho = Array.from({ length: passos + 1 }, (_, k) => naPagina(edgePoint(peca, recurso.edgeId!, inicio + (fim - inicio) * k / passos), peca));
    if (cota.curvo || recurso.type === 'EDGE_FINISH') {
      pdf.save().lineWidth(cota.curvo ? 3.5 : 2.2).lineCap('round').moveTo(trecho[0].x, trecho[0].y);
      trecho.slice(1).forEach((p) => pdf.lineTo(p.x, p.y));
      pdf.stroke(traco).restore();
      continue;
    }
    const n = normalNaPagina(cota, peca);
    const [a, b] = trecho;
    caminho([a, b, { x: b.x + n.x * 4, y: b.y + n.y * 4 }, { x: a.x + n.x * 4, y: a.y + n.y * 4 }]).lineWidth(.6).fillAndStroke(fundo, traco);
  }

  for (const { contorno } of recortes) { pdf.save().dash(3, { space: 2 }); caminho(contorno).lineWidth(.9).fillAndStroke('#ffffff', COR.recorte); pdf.undash().restore(); }

  // Distância de cada cuba/recorte/furo até as bordas da pedra.
  for (const { de, ate, distancia } of distancias) {
    if (distancia < 1 || Math.hypot(ate.x - de.x, ate.y - de.y) < 10) continue;
    pdf.save().dash(1.5, { space: 1.5 }).lineWidth(.5).moveTo(de.x, de.y).lineTo(ate.x, ate.y).stroke(COR.cota).undash().restore();
    rotulo(pdf, formatMeasure(distancia), { x: (de.x + ate.x) / 2, y: (de.y + ate.y) / 2 }, 0, { fonte: 'Helvetica', tamanho: 6, cor: COR.textoCota, fundo: true });
  }

  for (const { recurso, contorno } of recortes) {
    if (recurso.type === 'HOLE') continue;
    const xs = contorno.map((p) => p.x), ys = contorno.map((p) => p.y);
    const texto = recurso.type === 'CUTOUT' ? 'Recorte' : ROTULO_RECURSO[recurso.type];
    pdf.font('Helvetica').fontSize(6);
    if (pdf.widthOfString(texto) + 4 > Math.max(...xs) - Math.min(...xs) || Math.max(...ys) - Math.min(...ys) < 10) continue;
    rotulo(pdf, texto, { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }, 0, { fonte: 'Helvetica', tamanho: 6, cor: COR.recorte });
  }

  // Medida de cada lado, do lado de fora da pedra; o texto combinado ("medir no local") sai no lugar do número, em itálico.
  // Lado encostado em outra peça: a medida fica por dentro, junto ao lado, para não cair em cima da vizinha.
  const medidasPorDentro = new Map<Piece, Segmento[]>();
  for (const { peca } of pecas) for (const cota of cotas.get(peca.id) ?? []) {
    if (cota.comprimento < 1) continue;
    const estilo = { fonte: cota.livre ? 'Helvetica-Oblique' : 'Helvetica-Bold', tamanho: 7, cor: cota.livre ? COR.ouro : COR.textoCota, linha: COR.cota };
    const n = normalNaPagina(cota, peca);
    if (!cota.curvo) {
      const a = naPagina(cota.a, peca), b = naPagina(cota.b, peca);
      const vizinhas = pecas.filter((outra) => outra.peca !== peca).map((outra) => outra.contorno);
      const encostado = [.15, .5, .85].some((t) => [5, 16, 24].some((k) => vizinhas.some((contorno) => dentro({ x: a.x + (b.x - a.x) * t + n.x * k, y: a.y + (b.y - a.y) * t + n.y * k }, contorno))));
      if (!encostado) { cotaAlinhada(pdf, a, b, n, 16, cota.texto, estilo); continue; }
      const comprimento = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / comprimento, y: (b.y - a.y) / comprimento };
      const centro = { x: (a.x + b.x) / 2 - n.x * 7, y: (a.y + b.y) / 2 - n.y * 7 };
      rotulo(pdf, cota.texto, centro, anguloLegivel(u), { ...estilo, tamanho: 6.5 });
      const angulo = anguloLegivel(u) * Math.PI / 180;
      medidasPorDentro.set(peca, [...medidasPorDentro.get(peca) ?? [], ...caixaDoTexto(centro, { x: Math.cos(angulo), y: Math.sin(angulo) }, pdf.widthOfString(cota.texto) / 2 + 1, 3.5)]);
      continue;
    }
    const meio = naPagina(cota.meio, peca);
    rotulo(pdf, cota.livre ? cota.texto : `arco ${cota.texto}`, { x: meio.x + n.x * 12, y: meio.y + n.y * 12 }, 0, estilo);
  }

  // Cotas livres e textos também ficam no caminho do nome das peças.
  const ocupados: Segmento[] = [];
  for (const cota of documento.dimensions) {
    const livre = cotaLivre(documento, cota);
    if (!livre) continue;
    const sentido = cota.offsetMm < 0 ? -1 : 1;
    cotaAlinhada(pdf, P(livre.a), P(livre.b), { x: livre.normal.x * sentido, y: -livre.normal.y * sentido }, Math.abs(cota.offsetMm) * escala, formatMeasure(livre.comprimento),
      { fonte: 'Helvetica-Bold', tamanho: 7, cor: COR.ouro, linha: COR.dourado }, 2);
    const [a2, b2] = [P(livre.a2), P(livre.b2)];
    ocupados.push([a2, b2], ...caixaDoTexto({ x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }, { x: 1, y: 0 }, 12, 4));
  }
  for (const nota of documento.annotations) {
    const p = P(nota);
    pdf.font('Helvetica-Oblique').fontSize(8);
    const largura = Math.min(180, pdf.widthOfString(nota.text) + 2), x = Math.min(Math.max(p.x, 44), 36 + LARGURA - 8 - largura);
    pdf.fillColor(COR.tinta).text(nota.text, x, p.y - 4, { width: largura });
    const altura = pdf.heightOfString(nota.text, { width: largura });
    ocupados.push(...caixaDoTexto({ x: x + largura / 2, y: p.y - 4 + altura / 2 }, { x: 1, y: 0 }, largura / 2, altura / 2));
  }

  // Nome e espessura; peça pequena na escala fica só com o nome ou, sem espaço nem para ele, com o número do item da tabela.
  let comNumero = false;
  pecas.forEach(({ peca, contorno }, indice) => {
    const daPeca = recortes.filter((recorte) => recorte.peca === peca).map((recorte) => recorte.contorno);
    const pontos = amostrar([...segmentos(contorno), ...daPeca.flatMap(segmentos), ...ocupados, ...medidasPorDentro.get(peca) ?? [],
      ...distancias.filter((distancia) => distancia.peca === peca).flatMap(({ de, ate, distancia }) => {
        const meio = { x: (de.x + ate.x) / 2, y: (de.y + ate.y) / 2 };
        return [[de, ate] as const, ...caixaDoTexto(meio, { x: 1, y: 0 }, pdf.font('Helvetica').fontSize(6).widthOfString(formatMeasure(distancia)) / 2 + 1, 3.5)];
      })]);
    const larguraNome = pdf.font('Helvetica-Bold').fontSize(8).widthOfString(peca.name);
    const larguraEspessura = pdf.font('Helvetica').fontSize(6.5).widthOfString(centimetros(peca.thicknessMm));
    const completo = lugarDoNome(contorno, daPeca, pontos, Math.max(larguraNome, larguraEspessura) / 2 + 1.5, 9);
    if (completo.folga >= 0) {
      rotulo(pdf, peca.name, { x: completo.ponto.x, y: completo.ponto.y - 3.5 }, 0, { fonte: 'Helvetica-Bold', tamanho: 8, cor: COR.tinta });
      rotulo(pdf, centimetros(peca.thicknessMm), { x: completo.ponto.x, y: completo.ponto.y + 5.5 }, 0, { fonte: 'Helvetica', tamanho: 6.5, cor: COR.rotulo });
      return;
    }
    const soNome = lugarDoNome(contorno, daPeca, pontos, larguraNome / 2 + 1.5, 5);
    if (soNome.folga >= 0) { rotulo(pdf, peca.name, soNome.ponto, 0, { fonte: 'Helvetica-Bold', tamanho: 8, cor: COR.tinta }); return; }
    const { ponto } = lugarDoNome(contorno, daPeca, pontos, 6, 6);
    comNumero = true;
    pdf.lineWidth(.7).circle(ponto.x, ponto.y, 5.5).fillAndStroke('#ffffff', COR.dourado);
    rotulo(pdf, String(indice + 1), ponto, 0, { fonte: 'Helvetica-Bold', tamanho: 6, cor: COR.tinta });
  });

  legenda(pdf, documento, planta, topo + zona, comNumero);
}

function legenda(pdf: Pdf, documento: TechnicalDocument, planta: Planta, topo: number, comNumero: boolean) {
  const y = topo + 7;
  const tipos = new Set(documento.features.map((recurso) => recurso.type));
  const itens: [string, (x: number) => void][] = [];
  if (comNumero) itens.push(['Nº do item na tabela de peças', (x) => { pdf.lineWidth(.7).circle(x + 6, y + 3, 4).fillAndStroke('#ffffff', COR.dourado); }]);
  for (const tipo of ['SKIRT', 'BACKSPLASH'] as const) if (tipos.has(tipo))
    itens.push([ROTULO_RECURSO[tipo], (x) => pdf.lineWidth(.6).rect(x, y + 1, 12, 4).fillAndStroke(BORDA[tipo].fundo, BORDA[tipo].traco)]);
  if (tipos.has('EDGE_FINISH')) itens.push([ROTULO_RECURSO.EDGE_FINISH, (x) => pdf.lineWidth(2.2).moveTo(x, y + 3).lineTo(x + 12, y + 3).stroke(COR.dourado)]);
  if (documento.features.some((recurso) => !ehRecursoDeBorda(recurso)))
    itens.push(['Cuba / recorte (tracejado)', (x) => { pdf.save().dash(2, { space: 1.5 }).lineWidth(.8).rect(x, y, 12, 6).stroke(COR.recorte).undash().restore(); }]);
  let x = 46;
  for (const [texto, amostra] of itens) {
    amostra(x);
    pdf.font('Helvetica').fontSize(7).fillColor(COR.rotulo).text(texto, x + 16, y, { lineBreak: false });
    x += 16 + pdf.widthOfString(texto) + 14;
  }
  const escala = planta.proporcao ? `Escala 1:${planta.proporcao} em A4` : 'Sem escala';
  pdf.font('Helvetica').fontSize(7).fillColor(COR.rotulo).text(`${escala} · medidas em metros (2m44 = 2,44 m)`, 300, y, { width: 249, align: 'right', lineBreak: false });
}
