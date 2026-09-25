import { centimetrosParaMilimetros, pecaInicial, dividirComponente, dividirIgualmente, validarDivisao, calcularUltimaPeca, seguirDivisao, planoDeProducao, comPlanoDeProducao, precisaRevisao,
  type ProductionPlan, type ProductionPiece, type ProductionSource, type ProductionCutout, type ProductionEdge, type ProductionEdgeSide, type ResultadoDivisao, type ProductionSplitAxis } from '@inova/domain';
import type { DraftComponent, DraftCutout, DraftItem } from '../componentes/orcamento/types';
import { criarId } from './id';

export type { ProductionPlan, ProductionPiece, ProductionSource, ProductionCutout, ProductionEdge, ProductionEdgeSide, ResultadoDivisao, ProductionSplitAxis };
export { dividirIgualmente, validarDivisao, calcularUltimaPeca, planoDeProducao, precisaRevisao };

const cm = (mm?: number) => mm === undefined || mm <= 0 ? undefined : String(mm / 10);
const mm = (value?: string) => { if (!value?.trim()) return undefined; try { const parsed = centimetrosParaMilimetros(value); return parsed; } catch { return undefined; } };

/** Peça de produção -> DraftComponent, só para reaproveitar EditorComponentes/
 * MapaBordasComponente (que operam em DraftComponent). Nunca carrega materialId
 * nem appliedTotal — produção não tem preço. */
export function pecaParaComponente(piece: ProductionPiece): DraftComponent {
  return {
    id: piece.id, label: piece.label, componentType: piece.componentType, orientation: piece.orientation,
    lengthCm: cm(piece.lengthMm) ?? '', widthCm: cm(piece.widthMm) ?? '', quantity: piece.quantity,
    edges: piece.edges.map((edge) => ({ side: edge.side, serviceId: edge.serviceId, lengthCm: cm(edge.lengthMm), heightCm: cm(edge.heightMm), quantity: edge.quantity })),
    parentComponentId: piece.parentPieceId, parentSide: piece.parentSide,
    sillDetailCm: cm(piece.sillDetailMm), sillDetailHeightCm: cm(piece.sillDetailHeightMm),
    sillTopWidthCm: cm(piece.sillTopWidthMm), sillBottomWidthCm: cm(piece.sillBottomWidthMm),
    sillFinalWidthCm: cm(piece.sillFinalWidthMm), sillOverlapCm: cm(piece.sillOverlapMm),
  };
}

/** DraftComponent editado de volta pra ProductionPiece. `servicos` resolve o nome
 * (snapshot) de cada acabamento a partir do serviceId. */
export function componenteParaPeca(component: DraftComponent, sourceComponentId: string, servicos: { id: string; name: string }[]): ProductionPiece {
  return {
    id: component.id, sourceComponentId, label: component.label, componentType: component.componentType, orientation: component.orientation,
    lengthMm: mm(component.lengthCm) ?? 1, widthMm: mm(component.widthCm) ?? 1, quantity: Math.max(1, component.quantity),
    edges: component.edges.map((edge) => ({ side: edge.side, serviceId: edge.serviceId, serviceName: servicos.find((entry) => entry.id === edge.serviceId)?.name ?? 'Acabamento', lengthMm: mm(edge.lengthCm), heightMm: mm(edge.heightCm), quantity: edge.quantity })),
    parentPieceId: component.parentComponentId, parentSide: component.parentSide,
    sillDetailMm: mm(component.sillDetailCm), sillDetailHeightMm: mm(component.sillDetailHeightCm),
    sillTopWidthMm: mm(component.sillTopWidthCm), sillBottomWidthMm: mm(component.sillBottomWidthCm),
    sillFinalWidthMm: mm(component.sillFinalWidthCm), sillOverlapMm: mm(component.sillOverlapCm),
  };
}

function newId(): string { return criarId(); }
const converterEdges = (edges: DraftComponent['edges'], servicos: { id: string; name: string }[]): ProductionEdge[] => edges.map((edge) => ({ side: edge.side, serviceId: edge.serviceId, serviceName: servicos.find((entry) => entry.id === edge.serviceId)?.name ?? 'Acabamento', lengthMm: mm(edge.lengthCm), heightMm: mm(edge.heightCm), quantity: edge.quantity }));

/** Recorte/cuba de produção -> DraftCutout, só para reaproveitar DesenhoTecnico
 * (que espera DraftCutout com `componentIndex` apontando pra posição na lista
 * de peças exibida). Nunca carrega preço — produção não cobra. */
export function recorteParaDraftCutout(cutout: ProductionCutout, pieces: ProductionPiece[]): DraftCutout {
  return {
    id: cutout.id, componentIndex: pieces.findIndex((piece) => piece.id === cutout.pieceId), cutoutType: cutout.cutoutType, label: cutout.label, sizePending: cutout.sizePending,
    lengthCm: cm(cutout.lengthMm), widthCm: cm(cutout.widthMm), diameterCm: cm(cutout.diameterMm),
    positionXCm: cutout.positionXMm !== undefined ? String(cutout.positionXMm / 10) : undefined, positionYCm: cutout.positionYMm !== undefined ? String(cutout.positionYMm / 10) : undefined, quantity: cutout.quantity,
  };
}

/** Peças + recortes do plano de produção prontos para o DesenhoTecnico (mesmo
 * adaptador usado no editor e nos desenhos salvos), evitando duplicar a
 * conversão em cada tela que exibe o desenho técnico. */
export function planoParaDesenho(plan: ProductionPlan): { components: DraftComponent[]; cutouts: DraftCutout[] } {
  return { components: plan.pieces.map(pecaParaComponente), cutouts: plan.cutouts.map((cutout) => recorteParaDraftCutout(cutout, plan.pieces)) };
}

/** Cria (ou reconcilia) o plano de produção a partir dos componentes comerciais
 * atuais. Componentes já presentes no plano (mesmo id) mantêm suas peças —
 * novos componentes comerciais ganham uma peça inicial (sem dividir); e marca
 * needsReview nas origens cuja medida/quantidade/tipo/material mudou desde o
 * detalhamento. Nunca apaga peças de produção já criadas pelo usuário.
 */
export function reconciliarPlano(item: DraftItem, planoAtual: ProductionPlan | undefined, servicos: { id: string; name: string }[] = []): ProductionPlan {
  const sourcesAtuais = new Map((planoAtual?.sources ?? []).map((source) => [source.componentId, source]));
  const pecasPorOrigem = new Map<string, ProductionPiece[]>();
  for (const piece of planoAtual?.pieces ?? []) {
    if (!pecasPorOrigem.has(piece.sourceComponentId)) pecasPorOrigem.set(piece.sourceComponentId, []);
    pecasPorOrigem.get(piece.sourceComponentId)!.push(piece);
  }
  const sources: ProductionSource[] = [];
  const pieces: ProductionPiece[] = [];
  for (const component of item.components) {
    const lengthMm = mm(component.lengthCm); const widthMm = mm(component.widthCm);
    if (!lengthMm || !widthMm) continue; // sem medida ainda: nada pra planejar
    const existente = sourcesAtuais.get(component.id);
    const atual = { lengthMm, widthMm, quantity: component.quantity, componentType: component.componentType, materialId: component.materialId };
    if (existente) {
      sources.push({ ...existente, needsReview: precisaRevisao(existente, atual) });
      pieces.push(...(pecasPorOrigem.get(component.id) ?? []));
    } else {
      sources.push({ componentId: component.id, splitAxis: 'LENGTH', snapshotLengthMm: lengthMm, snapshotWidthMm: widthMm, snapshotQuantity: component.quantity, snapshotComponentType: component.componentType, snapshotMaterialId: component.materialId });
      pieces.push(pecaInicial({ id: component.id, label: component.label, componentType: component.componentType, orientation: component.orientation, lengthMm, widthMm, quantity: component.quantity, edges: converterEdges(component.edges, servicos),
        sillDetailMm: mm(component.sillDetailCm), sillDetailHeightMm: mm(component.sillDetailHeightCm), sillTopWidthMm: mm(component.sillTopWidthCm), sillBottomWidthMm: mm(component.sillBottomWidthCm), sillFinalWidthMm: mm(component.sillFinalWidthCm), sillOverlapMm: mm(component.sillOverlapCm) }, newId));
    }
  }
  // Peça comercial recém-anexada a outra (ex.: rodabanca criada no Orçamento
  // Rápido) ainda não tem peça de produção própria — vincula à peça (ainda não
  // dividida) da origem comercial pai, para a divisão/desenho já nascer
  // agrupados. Se a origem pai já foi dividida em várias peças, a ligação é
  // ambígua e a peça anexada nasce como raiz solta (o usuário reorganiza no
  // assistente de divisão). Nunca muta peças existentes — sempre gera um novo
  // objeto, preservando a imutabilidade do plano guardado em drawingData.
  const paiPorComponentId = new Map(item.components.filter((component) => component.parentComponentId).map((component) => [component.id, component.parentComponentId!]));
  const raizesPorComponente = new Map<string, ProductionPiece[]>();
  for (const piece of pieces) { if (piece.parentPieceId) continue; if (!raizesPorComponente.has(piece.sourceComponentId)) raizesPorComponente.set(piece.sourceComponentId, []); raizesPorComponente.get(piece.sourceComponentId)!.push(piece); }
  const pecaRaizPorComponente = new Map([...raizesPorComponente].filter(([, raizes]) => raizes.length === 1).map(([componentId, raizes]) => [componentId, raizes[0]]));
  const pecasVinculadas = pieces.map((piece) => {
    if (piece.parentPieceId) return piece;
    const paiComponentId = paiPorComponentId.get(piece.sourceComponentId);
    const pai = paiComponentId ? pecaRaizPorComponente.get(paiComponentId) : undefined;
    if (!pai) return piece;
    const component = item.components.find((entry) => entry.id === piece.sourceComponentId)!;
    return { ...piece, parentPieceId: pai.id, parentSide: component.parentSide };
  });
  pieces.length = 0; pieces.push(...pecasVinculadas);
  // Recortes comerciais sem produção equivalente ainda: entram como recorte de
  // produção apontando pra peça-raiz (ainda não dividida) da origem comercial —
  // se a origem já foi dividida em várias peças, a ligação é ambígua e o
  // recorte só aparece depois que o usuário o reatribui em RecortesProducao.
  const cutoutsExistentes = (planoAtual?.cutouts ?? []).filter((cutout) => pieces.some((piece) => piece.id === cutout.pieceId));
  const sourceCutoutIdsExistentes = new Set(cutoutsExistentes.map((cutout) => cutout.sourceCutoutId).filter(Boolean));
  const novosCutouts: ProductionCutout[] = [];
  for (const cutout of item.cutouts) {
    if (sourceCutoutIdsExistentes.has(cutout.id)) continue;
    const component = cutout.componentIndex !== undefined ? item.components[cutout.componentIndex] : undefined;
    const peca = component ? pecaRaizPorComponente.get(component.id) : undefined;
    if (!peca) continue;
    novosCutouts.push({ id: newId(), pieceId: peca.id, sourceCutoutId: cutout.id, cutoutType: cutout.cutoutType, label: cutout.label, sizePending: cutout.sizePending,
      lengthMm: mm(cutout.lengthCm), widthMm: mm(cutout.widthCm), diameterMm: mm(cutout.diameterCm),
      positionXMm: mm(cutout.positionXCm), positionYMm: mm(cutout.positionYCm), quantity: cutout.quantity });
  }
  return { version: 1, sources, pieces, cutouts: [...cutoutsExistentes, ...novosCutouts] };
}

/** Confirma a divisão de uma origem em N peças iguais (sugestão inicial). */
export function aplicarDivisaoIgual(plano: ProductionPlan, source: ProductionSource, componentSnapshot: { label: string; componentType: ProductionPiece['componentType']; orientation: ProductionPiece['orientation']; edges: ProductionPiece['edges'] }, partes: number): ProductionPlan {
  const totalMm = source.splitAxis === 'LENGTH' ? source.snapshotLengthMm : source.snapshotWidthMm;
  const medidas = dividirIgualmente(totalMm, partes);
  return aplicarDivisaoManual(plano, source, componentSnapshot, medidas);
}

/** Confirma uma divisão manual (medidas já validadas com validarDivisao). */
export function aplicarDivisaoManual(plano: ProductionPlan, source: ProductionSource, componentSnapshot: { label: string; componentType: ProductionPiece['componentType']; orientation: ProductionPiece['orientation']; edges: ProductionPiece['edges'] }, medidasMm: number[]): ProductionPlan {
  const outraMedida = source.splitAxis === 'LENGTH' ? source.snapshotWidthMm : source.snapshotLengthMm;
  const novasPecas = dividirComponente({ id: source.componentId, label: componentSnapshot.label, componentType: componentSnapshot.componentType, orientation: componentSnapshot.orientation,
    lengthMm: source.splitAxis === 'LENGTH' ? source.snapshotLengthMm : outraMedida, widthMm: source.splitAxis === 'LENGTH' ? outraMedida : source.snapshotWidthMm,
    quantity: source.snapshotQuantity, edges: componentSnapshot.edges }, medidasMm, source.splitAxis, newId);
  const idsAntigos = new Set(plano.pieces.filter((piece) => piece.sourceComponentId === source.componentId).map((piece) => piece.id));
  return {
    ...plano,
    pieces: [...plano.pieces.filter((piece) => piece.sourceComponentId !== source.componentId), ...novasPecas],
    cutouts: plano.cutouts.filter((cutout) => !idsAntigos.has(cutout.pieceId)),
  };
}

/**
 * O comercial mudou depois do detalhamento (needsReview). "Reconciliar" atualiza
 * a origem para a medida atual E reinicia essa origem com uma única peça (o
 * usuário divide de novo do zero). "Manter e revisar manualmente" só reconhece
 * a mudança (limpa needsReview) sem mexer nas peças já criadas — o usuário
 * ajusta à mão no assistente/editor.
 */
export function aceitarMudancaComercial(plano: ProductionPlan, item: DraftItem, componentId: string, resetarPecas: boolean, servicos: { id: string; name: string }[] = []): ProductionPlan {
  const component = item.components.find((entry) => entry.id === componentId);
  const source = plano.sources.find((entry) => entry.componentId === componentId);
  if (!component || !source) return plano;
  const lengthMm = mm(component.lengthCm) ?? source.snapshotLengthMm; const widthMm = mm(component.widthCm) ?? source.snapshotWidthMm;
  const novaFonte: ProductionSource = { ...source, needsReview: false, snapshotLengthMm: lengthMm, snapshotWidthMm: widthMm, snapshotQuantity: component.quantity, snapshotComponentType: component.componentType, snapshotMaterialId: component.materialId };
  const sources = plano.sources.map((entry) => entry.componentId === componentId ? novaFonte : entry);
  if (!resetarPecas) return { ...plano, sources };
  const idsAntigos = new Set(plano.pieces.filter((piece) => piece.sourceComponentId === componentId).map((piece) => piece.id));
  const novaPeca = pecaInicial({ id: componentId, label: component.label, componentType: component.componentType, orientation: component.orientation, lengthMm, widthMm, quantity: component.quantity, edges: converterEdges(component.edges, servicos),
    sillDetailMm: mm(component.sillDetailCm), sillDetailHeightMm: mm(component.sillDetailHeightCm), sillTopWidthMm: mm(component.sillTopWidthCm), sillBottomWidthMm: mm(component.sillBottomWidthCm), sillFinalWidthMm: mm(component.sillFinalWidthCm), sillOverlapMm: mm(component.sillOverlapCm) }, newId);
  return { ...plano, sources, pieces: [...plano.pieces.filter((piece) => piece.sourceComponentId !== componentId), novaPeca], cutouts: plano.cutouts.filter((cutout) => !idsAntigos.has(cutout.pieceId)) };
}

/** Rodabanca/saia/vista seguindo a mesma divisão de uma peça já dividida. */
export function aplicarSeguirDivisao(plano: ProductionPlan, sourceComponentId: string, parentSide: Exclude<ProductionPiece['parentSide'], undefined>, heightMm: number, componentType: ProductionPiece['componentType']): ProductionPlan {
  const pecasOrigem = plano.pieces.filter((piece) => piece.sourceComponentId === sourceComponentId && !piece.parentPieceId);
  const novas = seguirDivisao(pecasOrigem, parentSide, heightMm, componentType, newId);
  return { ...plano, pieces: [...plano.pieces, ...novas] };
}

export { planoDeProducao as lerPlanoDeProducao, comPlanoDeProducao as gravarPlanoDeProducao };
