import { centimetrosParaMilimetros, pecaInicial, planoDeProducao, comPlanoDeProducao, precisaRevisao,
  type ProductionPlan, type ProductionPiece, type ProductionSource, type ProductionCutout, type ProductionEdge } from '@inova/domain';
import type { DraftComponent, DraftCutout, DraftItem } from '../componentes/orcamento/types';
import { criarId } from './id';

/**
 * Plano de produção dos projetos antigos (feito no extinto "Com desenho"): a divisão das peças do
 * orçamento em peças físicas. Hoje a divisão é a emenda do desenho técnico; o plano antigo continua
 * valendo para a OS, o fluxo e as entregas desses projetos, e acompanha as peças quando o orçamento
 * é editado (conciliarPlanoParaSalvar). Aqui só ficam a leitura e essa conciliação.
 */
export type { ProductionPlan };

const cm = (mm?: number) => mm === undefined || mm <= 0 ? undefined : String(mm / 10);
const mm = (value?: string) => { if (!value?.trim()) return undefined; try { const parsed = centimetrosParaMilimetros(value); return parsed; } catch { return undefined; } };

/** Peça de produção -> DraftComponent, para o desenho das peças (DesenhoTecnico). Sem preço. */
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

export { planoDeProducao as lerPlanoDeProducao };

/**
 * Para salvar: o plano gravado no rascunho passa a seguir os componentes que vão
 * ser enviados, igual ao que o editor já mostra. Uma peça removida ou trocada
 * por outra não deixa origem órfã no plano (a API recusaria o orçamento).
 */
export function conciliarPlanoParaSalvar(item: DraftItem, servicos: { id: string; name: string }[] = []): DraftItem {
  const plano = planoDeProducao(item.drawingData);
  return plano ? { ...item, drawingData: comPlanoDeProducao(item.drawingData, reconciliarPlano(item, plano, servicos)) } : item;
}
