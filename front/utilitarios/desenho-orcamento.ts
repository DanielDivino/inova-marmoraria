import { centimetrosParaMilimetros, dadosEntradaProjeto } from '@inova/domain';
import type { ItemDoDesenho, ProjetoNoOrcamento, SincroniaDesenho } from '@inova/domain/technical';
import type { DraftComponent, DraftCutout, DraftItem } from '../componentes/orcamento/types';
import { criarId } from './id';

/**
 * Vínculo do projeto do orçamento com o desenho técnico dele (guardado em drawingData). `sincronia`:
 * de onde veio cada parte no desenho e como o projeto estava na última troca com ele (o que mudar
 * no orçamento depois disso vai para o desenho quando ele for aberto).
 */
export type VinculoDesenho = { designId: string; nome: string; versao: number; total: number; aceitoEm: string; sincronia?: SincroniaDesenho };

export function vinculoDesenho(projeto: Pick<DraftItem, 'drawingData'>): VinculoDesenho | undefined {
  const valor = projeto.drawingData?.desenhoTecnico as Partial<VinculoDesenho> | undefined;
  return valor && typeof valor === 'object' && typeof valor.designId === 'string' ? valor as VinculoDesenho : undefined;
}

const cm = (mm: number) => String(mm / 10);
const mm = (valor?: string) => valor?.trim() ? centimetrosParaMilimetros(valor) : undefined;

/** Projeto do Orçamento Rápido no formato que o desenho técnico entende (medidas em mm). */
export function projetoParaDesenho(item: DraftItem): ProjetoNoOrcamento {
  const ids = new Set(item.components.map((componente) => componente.id));
  const opcional = <K extends string>(campo: K, valor?: string) => (mm(valor) === undefined ? {} : { [campo]: mm(valor) }) as Partial<Record<K, number>>;
  return {
    nome: item.projectName.trim(),
    pecas: item.components.map((componente) => {
      const pai = componente.parentComponentId && ids.has(componente.parentComponentId) ? componente.parentComponentId : undefined;
      const materialId = componente.materialId || item.materialId;
      return {
        id: componente.id, label: componente.label, componentType: componente.componentType, lengthMm: mm(componente.lengthCm) ?? 0, widthMm: mm(componente.widthCm) ?? 0,
        ...(materialId ? { materialId } : {}), ...opcional('raioCantosMm', componente.raioCantosCm), ...(pai ? { paiId: pai } : {}),
        ...(pai && componente.componentType === 'BACKSPLASH' && componente.parentSide ? { ladoPai: componente.parentSide } : {}),
        bordas: componente.edges.filter((borda) => borda.serviceId).map((borda) => ({ side: borda.side, serviceId: borda.serviceId, ...opcional('lengthMm', borda.lengthCm), ...opcional('heightMm', borda.heightCm) })),
      };
    }),
    recortes: item.cutouts.map((recorte) => {
      const peca = recorte.componentIndex === undefined ? undefined : item.components[recorte.componentIndex];
      return { id: recorte.id, ...(peca ? { pecaId: peca.id } : {}), cutoutType: recorte.cutoutType, label: recorte.label,
        ...opcional('lengthMm', recorte.lengthCm), ...opcional('widthMm', recorte.widthCm), ...opcional('diameterMm', recorte.diameterCm), ...opcional('positionX', recorte.positionXCm), ...opcional('positionY', recorte.positionYCm) };
    }),
  };
}

/**
 * Projeto do orçamento a partir do desenho aceito ("Usar no orçamento"): as
 * mesmas partes, bordas, recortes e serviços que a estimativa do desenho
 * calculou (`desenhoParaOrcamento`), no Orçamento Rápido, onde podem ser
 * conferidos. Borda que cobre o lado inteiro acompanha a medida da parte;
 * a parcial guarda o próprio comprimento.
 */
export function projetoDoDesenho(item: ItemDoDesenho, dados: { id: string; projectName: string; productTypeId: string; m2Fechado: boolean; vinculo: VinculoDesenho }): DraftItem {
  const materialId = item.materialId ?? '';
  const ids = new Map(item.componentes.map((componente) => [componente.id, criarId()]));
  const components: DraftComponent[] = item.componentes.map((componente) => ({
    id: ids.get(componente.id)!, materialId: componente.materialId ?? materialId,
    ...(componente.materialId && componente.materialId !== materialId ? { materialProprio: true } : {}),
    label: componente.label, componentType: componente.componentType, orientation: componente.orientation,
    lengthCm: cm(componente.lengthMm), widthCm: cm(componente.widthMm), quantity: 1,
    ...(componente.raioCantosMm ? { raioCantosCm: cm(componente.raioCantosMm) } : {}),
    edges: componente.bordas.map((borda) => ({
      side: borda.side, serviceId: borda.serviceId ?? '', quantity: 1,
      ...(borda.ladoInteiro ? {} : { lengthCm: cm(borda.lengthMm) }),
      ...(borda.heightMm ? { heightCm: cm(borda.heightMm) } : {}),
      ...(borda.customLabel ? { customLabel: borda.customLabel } : {}),
    })),
    ...(componente.paiId && ids.has(componente.paiId) ? { parentComponentId: ids.get(componente.paiId), parentSide: componente.ladoPai } : {}),
  }));
  const idsRecortes = item.recortes.map(() => criarId());
  const cutouts: DraftCutout[] = item.recortes.map((recorte, indice) => ({
    id: idsRecortes[indice], componentIndex: recorte.componente, cutoutType: recorte.cutoutType, label: recorte.label,
    lengthCm: cm(recorte.lengthMm), widthCm: cm(recorte.widthMm), ...(recorte.diameterMm ? { diameterCm: cm(recorte.diameterMm) } : {}),
    positionXCm: cm(recorte.positionX), positionYCm: cm(recorte.positionY), quantity: 1, ...(recorte.serviceId ? { serviceId: recorte.serviceId } : {}),
  }));
  const projeto: DraftItem = {
    id: dados.id, projectName: dados.projectName, productTypeId: dados.productTypeId, materialId,
    calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components, cutouts,
    serviceIds: item.servicos.map((servico) => servico.serviceId),
    serviceQuantities: Object.fromEntries(item.servicos.map((servico) => [servico.serviceId, String(servico.quantidade)])),
    serviceAppliedValues: {},
    arredondarM2: dados.m2Fechado,
  };
  // De onde veio cada parte no desenho: é por aqui que o que mudar no orçamento volta para o desenho.
  const sincronia: SincroniaDesenho = {
    pecas: Object.fromEntries(item.componentes.map((componente) => [ids.get(componente.id)!, { pecaId: componente.pecaId, ...(componente.recursoId ? { recursoId: componente.recursoId } : {}), forma: componente.forma, parte: componente.parte }])),
    bordas: Object.fromEntries(item.componentes.map((componente) => [ids.get(componente.id)!, Object.fromEntries(componente.bordas.filter((borda) => borda.side !== 'CUSTOM').map((borda) => [`${borda.side}:${borda.tipo}`, borda.recursoId]))])),
    recortes: Object.fromEntries(item.recortes.map((recorte, indice) => [idsRecortes[indice], recorte.recursoId])),
    base: projetoParaDesenho(projeto),
  };
  return { ...projeto, drawingData: { ...dadosEntradaProjeto(undefined, 'QUICK'), desenhoTecnico: { ...dados.vinculo, sincronia } } };
}
