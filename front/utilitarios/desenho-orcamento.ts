import { dadosEntradaProjeto } from '@inova/domain';
import type { ItemDoDesenho } from '@inova/domain/technical';
import type { DraftComponent, DraftCutout, DraftItem } from '../componentes/orcamento/types';
import { criarId } from './id';

/** Vínculo do projeto do orçamento com o desenho técnico que o gerou (guardado em drawingData). */
export type VinculoDesenho = { designId: string; nome: string; versao: number; total: number; aceitoEm: string };

export function vinculoDesenho(projeto: Pick<DraftItem, 'drawingData'>): VinculoDesenho | undefined {
  const valor = projeto.drawingData?.desenhoTecnico as Partial<VinculoDesenho> | undefined;
  return valor && typeof valor === 'object' && typeof valor.designId === 'string' ? valor as VinculoDesenho : undefined;
}

const cm = (mm: number) => String(mm / 10);

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
    edges: componente.bordas.map((borda) => ({
      side: borda.side, serviceId: borda.serviceId ?? '', quantity: 1,
      ...(borda.ladoInteiro ? {} : { lengthCm: cm(borda.lengthMm) }),
      ...(borda.heightMm ? { heightCm: cm(borda.heightMm) } : {}),
      ...(borda.customLabel ? { customLabel: borda.customLabel } : {}),
    })),
    ...(componente.paiId && ids.has(componente.paiId) ? { parentComponentId: ids.get(componente.paiId), parentSide: componente.ladoPai } : {}),
  }));
  const cutouts: DraftCutout[] = item.recortes.map((recorte) => ({
    id: criarId(), componentIndex: recorte.componente, cutoutType: recorte.cutoutType, label: recorte.label,
    lengthCm: cm(recorte.lengthMm), widthCm: cm(recorte.widthMm), ...(recorte.diameterMm ? { diameterCm: cm(recorte.diameterMm) } : {}),
    positionXCm: cm(recorte.positionX), positionYCm: cm(recorte.positionY), quantity: 1, ...(recorte.serviceId ? { serviceId: recorte.serviceId } : {}),
  }));
  return {
    id: dados.id, projectName: dados.projectName, productTypeId: dados.productTypeId, materialId,
    calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components, cutouts,
    serviceIds: item.servicos.map((servico) => servico.serviceId),
    serviceQuantities: Object.fromEntries(item.servicos.map((servico) => [servico.serviceId, String(servico.quantidade)])),
    serviceAppliedValues: {},
    drawingData: { ...dadosEntradaProjeto(undefined, 'QUICK'), desenhoTecnico: dados.vinculo },
    arredondarM2: dados.m2Fechado,
  };
}
