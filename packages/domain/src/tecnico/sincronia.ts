import { acabamentoBordaPedra } from '../orcamentos/edge-finishes.js';
import { componentTypeLabels } from '../orcamentos/component-details.js';
import { bounds, contornoDosParametros, edgeLength, EPS, sampleContour, world } from './geometry.js';
import { ehPecaNoLado, formaDaPeca, retangulosDaPeca, type FormaNoDesenho, type LadoRetangulo, type Retangulo } from './orcamento.js';
import { featureSchema, pieceSchema, type Feature, type Piece, type TechnicalDocument } from './schema.js';

/**
 * Orçamento Rápido → desenho técnico: o caminho de volta do "Usar no orçamento". O projeto guarda,
 * no vínculo com o desenho, de onde veio cada parte (peça, rodabanca, saia, borda e recorte do desenho) e
 * como ele estava na última troca com o desenho (`base`). Ao abrir o desenho pelo orçamento, só o
 * que mudou no orçamento desde então vai para o desenho; o resto do que foi feito lá (posição,
 * formato, cotas, textos) fica como está.
 * - nome, pedra e medidas das peças retangulares (inclusive com cantos arredondados); peça em L, U,
 *   curva ou desenho livre muda de medida só no desenho (vira aviso);
 * - cantos arredondados: a peça retangular vira a "Arredondada" do desenho (e volta a ter cantos retos);
 * - peça nova no orçamento entra no desenho como retângulo, ao lado das outras; rodabanca ou saia
 *   nova (Tipo/descrição) presa a uma peça retangular entra no lado dela; peça removida sai do desenho;
 * - acabamento marcado num lado vai para esse lado (e a saia dos orçamentos antigos, lançada como
 *   acabamento); cuba, cooktop e furo, para a peça (na posição do orçamento ou no centro), e o que
 *   sai do orçamento sai do desenho.
 */
export type LadoNoOrcamento = LadoRetangulo | 'CUSTOM';
export type PecaNoOrcamento = {
  id: string; label: string; componentType: string; lengthMm: number; widthMm: number; materialId?: string;
  /** Cantos arredondados nas 4 pontas (acabamento do Orçamento Rápido). */
  raioCantosMm?: number;
  /** Rodabanca ou saia presa a uma peça do orçamento. */
  paiId?: string; ladoPai?: LadoRetangulo;
  bordas: { side: LadoNoOrcamento; serviceId: string; lengthMm?: number; heightMm?: number }[];
};
export type RecorteNoOrcamento = {
  id: string; pecaId?: string; cutoutType: string; label: string;
  lengthMm?: number; widthMm?: number; diameterMm?: number; positionX?: number; positionY?: number;
};
export type ProjetoNoOrcamento = { nome: string; pecas: PecaNoOrcamento[]; recortes: RecorteNoOrcamento[] };
export type OrigemNoDesenho = { pecaId: string; recursoId?: string; forma: FormaNoDesenho; parte: number };
export type SincroniaDesenho = {
  /** Componente do orçamento → peça (ou rodabanca/saia) do desenho. */
  pecas: Record<string, OrigemNoDesenho>;
  /** Componente do orçamento → "LADO:TIPO" → recurso (saia ou acabamento) do desenho. */
  bordas: Record<string, Record<string, string>>;
  /** Recorte do orçamento → recurso (cuba, cooktop, furo) do desenho. */
  recortes: Record<string, string>;
  /** O projeto do orçamento na última troca com o desenho. */
  base: ProjetoNoOrcamento;
};
export type CatalogoSincronia = { materiais: { id: string; name: string; imageUrl?: string | null }[]; servicos: { id: string; name: string }[] };
export type ResultadoSincronia = { documento: TechnicalDocument; sincronia: SincroniaDesenho; avisos: string[]; alterado: boolean };

type TipoBorda = 'SKIRT' | 'EDGE_FINISH';
/** Espaço entre as peças novas: cabem as cotas de uma e da outra. */
const ESPACO_ENTRE_PECAS = 600;
const normalizar = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
/** Nome da peça no desenho: a descrição do orçamento ou, sem ela, o tipo ("Tampo", "Soleira"). */
const nomeNoDesenho = (peca: Pick<PecaNoOrcamento, 'label' | 'componentType'>) => peca.label.trim() || componentTypeLabels[peca.componentType as keyof typeof componentTypeLabels] || '';
const nomeDaParte = (peca: Pick<PecaNoOrcamento, 'label' | 'componentType'>) => nomeNoDesenho(peca) || 'Peça';

/** Tipo da borda do orçamento no desenho: saia ou acabamento (vista não existe no desenho). */
export function tipoDaBorda(serviceId: string, servicos: CatalogoSincronia['servicos']): TipoBorda | null {
  const servico = servicos.find((entrada) => entrada.id === serviceId);
  if (!servico) return null;
  const tipo = acabamentoBordaPedra(servico.name);
  return tipo === 'VISTA' ? null : tipo === 'SKIRT' ? 'SKIRT' : 'EDGE_FINISH';
}
function perfilDoAcabamento(nome: string): Feature['profile'] {
  const texto = normalizar(nome);
  if (texto.includes('45')) return 'MITER45';
  if (texto.includes('bole') || texto.includes('meia cana') || texto.includes('arredond')) return 'ROUND';
  if (texto.includes('chanfr')) return 'BEVEL';
  return 'SIMPLE';
}
const TIPO_DO_RECORTE: Record<string, Pick<Feature, 'type' | 'shape'>> = {
  SINK: { type: 'SINK', shape: 'RECTANGLE' }, OVAL_SINK: { type: 'SINK', shape: 'OVAL' }, SCULPTED_SINK: { type: 'SCULPTED_SINK', shape: 'RECTANGLE' },
  COOKTOP: { type: 'CUTOUT', shape: 'RECTANGLE' }, FAUCET_HOLE: { type: 'HOLE', shape: 'RECTANGLE' }, GENERIC_HOLE: { type: 'HOLE', shape: 'RECTANGLE' }, OTHER: { type: 'CUTOUT', shape: 'RECTANGLE' },
};

/** Lado reto da peça sobre um lado do retângulo que a envolve (o mais comprido, se houver mais de um). */
export function ladoDaPeca(peca: Piece, lado: LadoRetangulo): string | undefined {
  const { minX, maxX, minY, maxY } = bounds(peca.contour);
  const sobre = (a: { x: number; y: number }, b: { x: number; y: number }) => lado === 'FRONT' ? Math.abs(a.y - minY) < .5 && Math.abs(b.y - minY) < .5
    : lado === 'BACK' ? Math.abs(a.y - maxY) < .5 && Math.abs(b.y - maxY) < .5
    : lado === 'LEFT' ? Math.abs(a.x - minX) < .5 && Math.abs(b.x - minX) < .5 : Math.abs(a.x - maxX) < .5 && Math.abs(b.x - maxX) < .5;
  let melhor: { id: string; tamanho: number } | undefined;
  peca.contour.forEach((vertice, indice) => {
    const proximo = peca.contour[(indice + 1) % peca.contour.length];
    if (Math.abs(vertice.bulge) > EPS || !sobre(vertice, proximo)) return;
    const tamanho = Math.hypot(proximo.x - vertice.x, proximo.y - vertice.y);
    if (tamanho > (melhor?.tamanho ?? 0)) melhor = { id: vertice.id, tamanho };
  });
  return melhor?.id;
}

/** Lado do retângulo em que fica um lado reto da peça (nenhum, se for um arco). */
function ladoDoVertice(peca: Piece, verticeId: string): LadoRetangulo | undefined {
  const indice = peca.contour.findIndex((vertice) => vertice.id === verticeId);
  if (indice < 0 || Math.abs(peca.contour[indice].bulge) > EPS) return undefined;
  const a = peca.contour[indice], b = peca.contour[(indice + 1) % peca.contour.length];
  const { minX, maxX, minY, maxY } = bounds(peca.contour);
  if (Math.abs(a.y - minY) < .5 && Math.abs(b.y - minY) < .5) return 'FRONT';
  if (Math.abs(a.y - maxY) < .5 && Math.abs(b.y - maxY) < .5) return 'BACK';
  if (Math.abs(a.x - minX) < .5 && Math.abs(b.x - minX) < .5) return 'LEFT';
  if (Math.abs(a.x - maxX) < .5 && Math.abs(b.x - maxX) < .5) return 'RIGHT';
  return undefined;
}

/**
 * Cantos da peça retangular: arredondados (raio > 0, a forma "Arredondada" do desenho) ou retos.
 * A peça fica no mesmo lugar; saia, acabamento e rodabanca continuam no mesmo lado (a que cobria o
 * lado inteiro continua cobrindo), cubas e furos no mesmo ponto.
 */
function arredondarCantos(documento: TechnicalDocument, peca: Piece, raio: number) {
  const recursos = documento.features.filter((recurso) => recurso.pieceId === peca.id);
  const { minX, maxX, minY, maxY } = bounds(peca.contour);
  const antes = recursos.flatMap((recurso) => recurso.edgeId ? [{ recurso, lado: ladoDoVertice(peca, recurso.edgeId), inteiro: recurso.startMm < 1 && Math.abs(recurso.extentMm - edgeLength(peca, recurso.edgeId)) < 1 }] : []);
  const rotulos = Object.entries(peca.dimensionLabels).flatMap(([id, texto]) => { const lado = ladoDoVertice(peca, id); return lado ? [[lado, texto] as const] : []; });
  const travados = peca.lockedEdges.flatMap((id) => ladoDoVertice(peca, id) ?? []);
  // O canto de baixo à esquerda passa a ser a origem da peça (como na forma paramétrica), sem ela sair do lugar.
  const origem = world({ x: minX, y: minY }, peca);
  const parameters = { arm: 600, ...peca.parameters, shape: raio > 0 ? 'ROUNDED' as const : 'RECTANGLE' as const, width: maxX - minX, length: maxY - minY, radius: Math.max(0, raio) };
  Object.assign(peca, { geometryMode: 'PARAMETRIC', parameters, contour: contornoDosParametros(peca.id, parameters), x: origem.x, y: origem.y });
  for (const recurso of recursos) if (!recurso.edgeId) { recurso.x -= minX; recurso.y -= minY; }
  const novo = (lado: LadoRetangulo | undefined) => lado ? ladoDaPeca(peca, lado) : undefined;
  for (const { recurso, lado, inteiro } of antes) {
    const aresta = novo(lado);
    if (!aresta) { documento.features = documento.features.filter((entrada) => entrada.id !== recurso.id); continue; }
    const tamanho = edgeLength(peca, aresta);
    recurso.edgeId = aresta;
    recurso.extentMm = inteiro ? tamanho : Math.max(0, Math.min(recurso.extentMm, tamanho - recurso.startMm));
  }
  peca.dimensionLabels = Object.fromEntries(rotulos.flatMap(([lado, texto]) => { const aresta = novo(lado); return aresta ? [[aresta, texto]] : []; }));
  peca.lockedEdges = travados.flatMap((lado) => novo(lado) ?? []);
  const vertices = new Set(peca.contour.map((vertice) => vertice.id));
  documento.dimensions = documento.dimensions.filter((cota) => (cota.from.pieceId !== peca.id || vertices.has(cota.from.vertexId)) && (cota.to.pieceId !== peca.id || vertices.has(cota.to.vertexId)));
}

/** Muda comprimento (x) e largura (y) de uma peça retangular; o que está nela acompanha. */
function redimensionar(peca: Piece, recursos: Feature[], comprimento: number, largura: number) {
  const antes = { ...peca, contour: peca.contour.map((vertice) => ({ ...vertice })) };
  if (peca.geometryMode === 'PARAMETRIC' && peca.parameters) {
    peca.parameters = { ...peca.parameters, width: comprimento, length: largura };
    peca.contour = contornoDosParametros(peca.id, peca.parameters);
  } else {
    const { minX, maxX, minY, maxY } = bounds(peca.contour);
    peca.contour = peca.contour.map((vertice) => ({ ...vertice, x: Math.abs(vertice.x - maxX) < .5 ? minX + comprimento : vertice.x, y: Math.abs(vertice.y - maxY) < .5 ? minY + largura : vertice.y }));
  }
  const limites = bounds(sampleContour(peca.contour));
  for (const recurso of recursos) {
    if (recurso.edgeId) {
      // Saia, rodabanca ou acabamento que cobria o lado inteiro continua cobrindo; os outros não passam do fim.
      const tamanhoAntes = edgeLength(antes, recurso.edgeId), tamanho = edgeLength(peca, recurso.edgeId);
      recurso.extentMm = recurso.startMm < 1 && Math.abs(recurso.extentMm - tamanhoAntes) < 1 ? tamanho : Math.max(0, Math.min(recurso.extentMm, tamanho - recurso.startMm));
    } else {
      recurso.x = Math.min(Math.max(recurso.x, limites.minX), limites.maxX);
      recurso.y = Math.min(Math.max(recurso.y, limites.minY), limites.maxY);
    }
  }
  peca.wetDryZones = peca.wetDryZones.filter((zona) => zona.angleDeg || zona.startMm < comprimento).map((zona) => zona.angleDeg ? zona : ({ ...zona, endMm: Math.min(zona.endMm, comprimento) }));
}

export function sincronizarDesenho(doc: TechnicalDocument, projeto: ProjetoNoOrcamento, anterior: SincroniaDesenho | undefined, catalogo: CatalogoSincronia, novoId: () => string): ResultadoSincronia {
  const documento: TechnicalDocument = structuredClone(doc);
  const sincronia: SincroniaDesenho = anterior ? structuredClone({ ...anterior, base: projeto }) : { pecas: {}, bordas: {}, recortes: {}, base: projeto };
  const avisos: string[] = [];
  let alterado = false;
  // Sem troca anterior: um desenho vazio recebe o projeto inteiro; um desenho já feito passa a acompanhar daqui em diante.
  if (!anterior && documento.pieces.length) return { documento, sincronia, avisos, alterado };
  const base = anterior?.base ?? { nome: projeto.nome, pecas: [], recortes: [] };
  const baseDaPeca = new Map(base.pecas.map((peca) => [peca.id, peca]));
  const pecaDoDesenho = (id: string) => documento.pieces.find((peca) => peca.id === id);
  const recursoDoDesenho = (id: string | undefined) => id ? documento.features.find((recurso) => recurso.id === id) : undefined;
  const recursosDa = (pecaId: string) => documento.features.filter((recurso) => recurso.pieceId === pecaId);
  const removerRecurso = (id: string) => { documento.features = documento.features.filter((recurso) => recurso.id !== id); alterado = true; };
  const material = (materialId: string | undefined, atual?: Piece['material']): Piece['material'] => {
    const escolhido = materialId ? catalogo.materiais.find((entrada) => entrada.id === materialId) : undefined;
    if (!escolhido) return atual;
    const imagem = escolhido.imageUrl && /^\/uploads\/materials\/[a-zA-Z0-9._-]+$/.test(escolhido.imageUrl) ? escolhido.imageUrl : undefined;
    return { id: escolhido.id, name: escolhido.name, ...(imagem ? { imageUrl: imagem } : {}), textureScaleMm: atual?.textureScaleMm ?? 600, veinRotationDeg: atual?.veinRotationDeg ?? 0, roughness: atual?.roughness ?? .25 };
  };

  // 1) Peças removidas no orçamento saem do desenho (a parte de uma peça em L/U só avisa).
  for (const antes of base.pecas) {
    if (projeto.pecas.some((peca) => peca.id === antes.id)) continue;
    const origem = sincronia.pecas[antes.id];
    delete sincronia.pecas[antes.id]; delete sincronia.bordas[antes.id];
    if (!origem) continue;
    if (origem.recursoId) { if (recursoDoDesenho(origem.recursoId)) removerRecurso(origem.recursoId); continue; }
    if (Object.values(sincronia.pecas).some((outra) => outra.pecaId === origem.pecaId && !outra.recursoId)) {
      avisos.push(`${nomeDaParte(antes)}: parte de uma peça em L ou U saiu do orçamento; ajuste o formato no desenho técnico.`);
      continue;
    }
    const removida = origem.pecaId;
    if (!pecaDoDesenho(removida)) continue;
    documento.pieces = documento.pieces.filter((peca) => peca.id !== removida);
    documento.features = documento.features.filter((recurso) => recurso.pieceId !== removida);
    documento.dimensions = documento.dimensions.filter((cota) => cota.from.pieceId !== removida && cota.to.pieceId !== removida);
    documento.constraints = documento.constraints.filter((vinculo) => vinculo.pieceId !== removida && vinculo.targetPieceId !== removida);
    documento.assemblies = documento.assemblies.map((conjunto) => ({ ...conjunto, pieceIds: conjunto.pieceIds.filter((id) => id !== removida) }));
    alterado = true;
  }

  // 2) Peças novas no orçamento entram no desenho como retângulos, à direita das que já estão lá.
  const espessura = documento.pieces[0]?.thicknessMm ?? 20;
  const pontos = documento.pieces.flatMap((peca) => sampleContour(peca.contour).map((ponto) => world(ponto, peca)));
  let proximoX = pontos.length ? bounds(pontos).maxX + ESPACO_ENTRE_PECAS : 0;
  const baseY = pontos.length ? bounds(pontos).minY : 0;
  const novas = new Set<string>();
  const adicionarRetangulo = (peca: PecaNoOrcamento) => {
    const id = novoId();
    const parameters = { shape: peca.raioCantosMm ? 'ROUNDED' as const : 'RECTANGLE' as const, width: Math.max(1, peca.lengthMm), length: Math.max(1, peca.widthMm), radius: peca.raioCantosMm ?? 0, arm: 600 };
    documento.pieces.push(pieceSchema.parse({ id, name: nomeNoDesenho(peca), contour: contornoDosParametros(id, parameters), geometryMode: 'PARAMETRIC', parameters, thicknessMm: espessura, x: proximoX, y: baseY, material: material(peca.materialId) }));
    proximoX += parameters.width + ESPACO_ENTRE_PECAS;
    sincronia.pecas[peca.id] = { pecaId: id, forma: 'RETANGULO', parte: 0 };
    novas.add(peca.id);
    alterado = true;
  };
  const semOrigem = projeto.pecas.filter((peca) => !baseDaPeca.has(peca.id) && !sincronia.pecas[peca.id]);
  for (const peca of semOrigem.filter((entrada) => !ehPecaNoLado(entrada.componentType) || !entrada.paiId)) adicionarRetangulo(peca);
  // Rodabanca ou saia presa a uma peça retangular do desenho entra no lado dela; presa a outra forma, vira peça à parte.
  for (const peca of semOrigem.filter((entrada) => ehPecaNoLado(entrada.componentType) && entrada.paiId)) {
    const origemPai = sincronia.pecas[peca.paiId!];
    const pai = origemPai && !origemPai.recursoId && origemPai.forma === 'RETANGULO' ? pecaDoDesenho(origemPai.pecaId) : undefined;
    const lado = pai && peca.ladoPai ? ladoDaPeca(pai, peca.ladoPai) : undefined;
    if (!pai || !lado) { adicionarRetangulo(peca); continue; }
    const id = novoId();
    documento.features.push(featureSchema.parse({ id, type: peca.componentType, pieceId: pai.id, name: nomeNoDesenho(peca), x: 0, y: 0, edgeId: lado, startMm: 0,
      extentMm: Math.min(Math.max(1, peca.lengthMm), edgeLength(pai, lado)), heightMm: Math.max(1, peca.widthMm) }));
    sincronia.pecas[peca.id] = { pecaId: pai.id, recursoId: id, forma: origemPai.forma, parte: 0 };
    novas.add(peca.id);
    alterado = true;
  }

  // 3) Mudanças nas peças que já estavam no desenho: nome, medidas, pedra; rodabanca e saia: extensão e altura.
  for (const peca of projeto.pecas) {
    const antes = baseDaPeca.get(peca.id), origem = sincronia.pecas[peca.id];
    if (!antes || !origem || novas.has(peca.id)) continue;
    if (origem.recursoId) {
      const faixa = recursoDoDesenho(origem.recursoId), dona = faixa && pecaDoDesenho(faixa.pieceId);
      if (!faixa || !dona) continue;
      if (peca.componentType !== antes.componentType && ehPecaNoLado(peca.componentType)) { faixa.type = peca.componentType; alterado = true; }
      if ((peca.label !== antes.label || peca.componentType !== antes.componentType) && nomeNoDesenho(peca)) { faixa.name = nomeNoDesenho(peca); alterado = true; }
      if (peca.lengthMm !== antes.lengthMm) { faixa.extentMm = Math.min(Math.max(1, peca.lengthMm), edgeLength(dona, faixa.edgeId!) - faixa.startMm); alterado = true; }
      if (peca.widthMm !== antes.widthMm) { faixa.heightMm = Math.max(1, peca.widthMm); alterado = true; }
      continue;
    }
    const alvo = pecaDoDesenho(origem.pecaId);
    if (!alvo) continue;
    if ((peca.label !== antes.label || peca.componentType !== antes.componentType) && origem.forma !== 'COMPOSTA') { alvo.name = nomeNoDesenho(peca); alterado = true; }
    if (peca.lengthMm !== antes.lengthMm || peca.widthMm !== antes.widthMm) {
      if (origem.forma === 'RETANGULO' && formaDaPeca(alvo) === 'RETANGULO' && peca.lengthMm > 0 && peca.widthMm > 0) { redimensionar(alvo, recursosDa(alvo.id), peca.lengthMm, peca.widthMm); alterado = true; }
      else avisos.push(`${nomeDaParte(peca)}: a medida mudou no orçamento, mas peças em L, U, com curva ou em desenho livre mudam de medida só no desenho técnico.`);
    }
    if ((peca.raioCantosMm ?? 0) !== (antes.raioCantosMm ?? 0)) {
      if (origem.forma === 'RETANGULO' && formaDaPeca(alvo) === 'RETANGULO') { arredondarCantos(documento, alvo, peca.raioCantosMm ?? 0); alterado = true; }
      else avisos.push(`${nomeDaParte(peca)}: cantos ${peca.raioCantosMm ? 'arredondados' : 'retos'} no orçamento; em peças em L, U ou com curva, ajuste os cantos no desenho técnico.`);
    }
    if (peca.materialId && peca.materialId !== antes.materialId && peca.materialId !== alvo.material?.id) {
      // Peça em L/U: a pedra é da peça inteira; muda quando todas as partes estão com a mesma.
      const partes = projeto.pecas.filter((outra) => sincronia.pecas[outra.id]?.pecaId === alvo.id && !sincronia.pecas[outra.id]?.recursoId);
      if (partes.every((parte) => parte.materialId === peca.materialId)) { alvo.material = material(peca.materialId, alvo.material); alterado = true; }
    }
  }

  // 4) Acabamento de cada lado — e a saia lançada como acabamento nos orçamentos antigos (nas peças
  //    retangulares; em L/U, só avisa o que não dá para marcar).
  for (const peca of projeto.pecas) {
    const origem = sincronia.pecas[peca.id];
    if (!origem || origem.recursoId) continue;
    const alvo = pecaDoDesenho(origem.pecaId);
    if (!alvo) continue;
    const chaves = (lista: PecaNoOrcamento['bordas']) => new Map(lista.flatMap((borda) => {
      const tipo = borda.side === 'CUSTOM' ? null : tipoDaBorda(borda.serviceId, catalogo.servicos);
      return tipo ? [[`${borda.side}:${tipo}`, borda] as const] : [];
    }));
    const agora = chaves(peca.bordas), antes = chaves(novas.has(peca.id) ? [] : baseDaPeca.get(peca.id)?.bordas ?? []);
    const doLado = (sincronia.bordas[peca.id] ??= {});
    for (const chave of antes.keys()) {
      if (agora.has(chave)) continue;
      const recurso = recursoDoDesenho(doLado[chave]);
      delete doLado[chave];
      if (!recurso) continue;
      // Numa peça em L/U o mesmo acabamento pode seguir por outras partes: quem decide é o desenho.
      if (origem.forma === 'COMPOSTA') { avisos.push(`${nomeDaParte(peca)}: acabamento retirado no orçamento; em peças em L ou U, retire também no desenho técnico.`); continue; }
      removerRecurso(recurso.id);
    }
    for (const [chave, borda] of agora) {
      const [lado, tipo] = chave.split(':') as [LadoRetangulo, TipoBorda];
      const servico = catalogo.servicos.find((entrada) => entrada.id === borda.serviceId)!;
      const recurso = recursoDoDesenho(doLado[chave]);
      if (recurso) {
        const anterior = antes.get(chave);
        if (tipo === 'SKIRT' && borda.heightMm && borda.heightMm !== anterior?.heightMm) { recurso.heightMm = borda.heightMm; alterado = true; }
        if (tipo === 'EDGE_FINISH' && borda.serviceId !== anterior?.serviceId) { recurso.profile = perfilDoAcabamento(servico.name); recurso.name = servico.name; alterado = true; }
        continue;
      }
      if (antes.has(chave)) continue;
      const aresta = origem.forma === 'RETANGULO' ? ladoDaPeca(alvo, lado) : undefined;
      if (!aresta) { avisos.push(`${nomeDaParte(peca)}: ${tipo === 'SKIRT' ? 'saia' : 'acabamento'} novo no orçamento; em peças em L, U ou com curva, marque no desenho técnico.`); continue; }
      const tamanho = edgeLength(alvo, aresta);
      const id = novoId();
      documento.features.push(featureSchema.parse({ id, type: tipo, pieceId: alvo.id, name: tipo === 'SKIRT' ? 'Saia' : servico.name, x: 0, y: 0, edgeId: aresta, startMm: 0,
        extentMm: Math.min(borda.lengthMm && borda.lengthMm > 0 ? borda.lengthMm : tamanho, tamanho), ...(tipo === 'SKIRT' ? { heightMm: Math.max(1, borda.heightMm ?? 100) } : { profile: perfilDoAcabamento(servico.name) }) }));
      doLado[chave] = id;
      alterado = true;
    }
  }

  // 5) Cuba, cooktop e furo: entram na peça (na posição do orçamento ou no centro), mudam e saem com o orçamento.
  const baseDoRecorte = new Map(base.recortes.map((recorte) => [recorte.id, recorte]));
  for (const antes of base.recortes) {
    if (projeto.recortes.some((recorte) => recorte.id === antes.id)) continue;
    const recurso = recursoDoDesenho(sincronia.recortes[antes.id]);
    delete sincronia.recortes[antes.id];
    if (recurso) removerRecurso(recurso.id);
  }
  const parteDa = (alvo: Piece, origem: OrigemNoDesenho): Retangulo => {
    const { retangulos } = retangulosDaPeca(alvo);
    return retangulos[origem.parte] ?? retangulos[0];
  };
  for (const recorte of projeto.recortes) {
    const antes = baseDoRecorte.get(recorte.id);
    const origem = recorte.pecaId ? sincronia.pecas[recorte.pecaId] : undefined;
    const alvo = origem && !origem.recursoId ? pecaDoDesenho(origem.pecaId) : undefined;
    const tipo = TIPO_DO_RECORTE[recorte.cutoutType] ?? TIPO_DO_RECORTE.OTHER;
    const recurso = recursoDoDesenho(sincronia.recortes[recorte.id]);
    const posicao = (r: Retangulo) => ({
      x: recorte.positionX !== undefined ? r.x0 + recorte.positionX : (r.x0 + r.x1) / 2,
      y: recorte.positionY !== undefined ? r.y1 - recorte.positionY : (r.y0 + r.y1) / 2,
    });
    if (recurso) {
      if (!antes) continue;
      const deitado = ((Math.round(recurso.rotationDeg) % 180) + 180) % 180 === 90;
      if (recorte.label !== antes.label && recorte.label.trim()) { recurso.name = recorte.label.trim(); alterado = true; }
      if (recorte.cutoutType !== antes.cutoutType) { Object.assign(recurso, tipo); alterado = true; }
      if (recorte.lengthMm && recorte.lengthMm !== antes.lengthMm) { if (deitado) recurso.lengthMm = recorte.lengthMm; else recurso.widthMm = recorte.lengthMm; alterado = true; }
      if (recorte.widthMm && recorte.widthMm !== antes.widthMm) { if (deitado) recurso.widthMm = recorte.widthMm; else recurso.lengthMm = recorte.widthMm; alterado = true; }
      if (recorte.diameterMm && recorte.diameterMm !== antes.diameterMm) { recurso.diameterMm = recorte.diameterMm; alterado = true; }
      if ((recorte.positionX !== antes.positionX || recorte.positionY !== antes.positionY) && alvo && origem) { Object.assign(recurso, posicao(parteDa(alvo, origem))); alterado = true; }
      continue;
    }
    // Já estava no orçamento na última troca e não está no desenho: foi tirado lá, e lá fica sem.
    if (antes) continue;
    if (!alvo || !origem) { avisos.push(`${recorte.label.trim() || 'Recorte'}: sem peça correspondente no desenho técnico; marque-o no desenho.`); continue; }
    const id = novoId();
    const furo = tipo.type === 'HOLE';
    documento.features.push(featureSchema.parse({ id, ...tipo, pieceId: alvo.id, name: recorte.label.trim() || (furo ? 'Furo' : 'Cuba'), ...posicao(parteDa(alvo, origem)),
      ...(furo ? { diameterMm: Math.max(1, recorte.diameterMm ?? recorte.lengthMm ?? 35) } : { ...(recorte.lengthMm ? { widthMm: recorte.lengthMm } : {}), ...(recorte.widthMm ? { lengthMm: recorte.widthMm } : {}) }) }));
    sincronia.recortes[recorte.id] = id;
    alterado = true;
  }

  // O que não existe mais no desenho sai do vínculo.
  for (const [componente, origem] of Object.entries(sincronia.pecas)) if (!pecaDoDesenho(origem.pecaId) || (origem.recursoId && !recursoDoDesenho(origem.recursoId))) delete sincronia.pecas[componente];
  for (const lados of Object.values(sincronia.bordas)) for (const [chave, id] of Object.entries(lados)) if (!recursoDoDesenho(id)) delete lados[chave];
  for (const [recorte, id] of Object.entries(sincronia.recortes)) if (!recursoDoDesenho(id)) delete sincronia.recortes[recorte];
  return { documento, sincronia, avisos, alterado };
}
