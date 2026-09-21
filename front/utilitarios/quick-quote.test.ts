import { describe, expect, it } from 'vitest';
import { calcularComponente, calcularAcabamentoBorda, calcularTotalPix, projetoTemDesenho, dadosEntradaProjeto } from '@inova/domain';
import { aplicarMaterialProjeto, duplicarComponenteRapido, metrosParaCentimetrosRascunho, prepararItemRapido, criarComponenteRapido } from './quick-quote';
import { rascunhoParaEntradaItem } from './saved-quote';
import type { DraftItem } from '../componentes/orcamento/types';

const draft = (): DraftItem => ({ id: 'p', projectName: 'Cozinha', materialId: 'stone', productTypeId: 'type', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [{ ...criarComponenteRapido('stone'), lengthCm: '70', widthCm: '30' }], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, drawingData: dadosEntradaProjeto(undefined, 'QUICK') });
describe('Orçamento rápido compartilha o modelo detalhado', () => {
  it.each(['2,40', '2.40'])('converte %s metros para a unidade do desenho sem alterar o cálculo', value => {
    const item = draft(); item.components[0].lengthCm = metrosParaCentimetrosRascunho(value); item.components[0].widthCm = metrosParaCentimetrosRascunho('0,60');
    const input = rascunhoParaEntradaItem(item);
    expect(input.components[0]).toMatchObject({ lengthMm: 2400, widthMm: 600 });
    expect(calcularComponente(input.components[0]).billableArea).toBe(1.44);
  });
  it('remove só linha de inserção vazia e preserva recorte, medidas parciais e material', () => {
    const item = draft(); item.components.unshift(criarComponenteRapido('stone'));
    item.cutouts = [{ id: 'cut', componentIndex: 1, cutoutType: 'SINK', label: '', quantity: 1 }];
    item.components.push({ ...criarComponenteRapido('stone'), lengthCm: '20' });
    const cleaned = prepararItemRapido(item);
    expect(cleaned.components).toHaveLength(2); expect(cleaned.cutouts[0].componentIndex).toBe(0);
    expect(prepararItemRapido(draft()).components).toHaveLength(1);
  });
  it('duplica a composição com novos IDs e vínculos de recortes preservados', () => {
    const item = draft(); item.components.push({ ...criarComponenteRapido('stone'), parentComponentId: item.components[0].id, componentType: 'BACKSPLASH', parentSide: 'BACK' });
    item.cutouts = [{ id: 'cut', componentIndex: 0, cutoutType: 'SCULPTED_SINK', quantity: 1, label: '', sizePending: true }];
    const result = duplicarComponenteRapido(item, 0);
    expect(result.components![2].id).not.toBe(item.components[0].id);
    expect(result.components![3].parentComponentId).toBe(result.components![2].id);
    expect(result.cutouts![1].componentIndex).toBe(2);
    expect(result.cutouts![1].id).not.toBe('cut');
    expect(aplicarMaterialProjeto(item, 'new').components!.every(row => row.materialId === 'new')).toBe(true);
  });
  it('usa a cobrança por lado e o Pix atuais', () => {
    const amounts = [700, 300].map(lengthMm => calcularAcabamentoBorda({ name: 'Acabamento 45°', lengthMm, quantity: 1, materialPrice: 700, servicePrice: 85 }));
    expect(amounts.reduce((n, row) => n + row.billedQuantity, 0)).toBe(1);
    expect(amounts.reduce((n, row) => n + row.subtotal, 0)).toBe(85);
    expect(calcularTotalPix(1350.5)).toBe(1282.98);
  });
  it('abrir o desenho preserva os dados, exige conclusão e mantém compatibilidade legada', () => {
    expect(projetoTemDesenho(undefined)).toBe(true);
    const item = draft();
    expect(projetoTemDesenho(item.drawingData)).toBe(false);
    const next = dadosEntradaProjeto({ ...item.drawingData, componentDetails: [{ sillDetailMm: 20 }] }, 'DETAILED');
    expect(projetoTemDesenho(next)).toBe(false);
    expect(next.componentDetails).toEqual([{ sillDetailMm: 20 }]);
    expect(projetoTemDesenho({ ...next, detailingStatus: 'COMPLETED' })).toBe(true);
  });
});
