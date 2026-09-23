import { describe, expect, it } from 'vitest';
import { rascunhoParaEntradaItem, itemSalvoParaRascunho } from './saved-quote';
import type { DraftItem } from '../componentes/orcamento/types';
import { itemSalvoParaEntrada, type SavedQuoteItem } from '@inova/domain';
import { criarRodabancaLateral, removerGrupoComponentes, restaurarNomesComponentes } from './component-groups';

const draft = (): DraftItem => ({ id: 'draft', projectName: 'Cozinha', productTypeId: 'product', materialId: 'material', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, cutouts: [], components: [{ id: 'component', label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '190,5', widthCm: '40', quantity: 2, edges: [] }] });
describe('Dados do formulário enviados ao servidor', () => {
  it('salva rodabancas dos lados como peças independentes e reabre o mesmo lado com as medidas', () => {
    const input = draft();
    input.components.push({ ...criarRodabancaLateral(input.components[0], 'BACK', 'back'), widthCm: '10' },
      { ...criarRodabancaLateral(input.components[0], 'RIGHT', 'right'), widthCm: '7,5' });
    const payload = rascunhoParaEntradaItem(input);
    expect(payload.components).toHaveLength(3);
    expect(payload.components[1]).toMatchObject({ componentType: 'BACKSPLASH', lengthMm: 1905, widthMm: 100, quantity: 2, edges: [] });
    expect(payload.components[2]).toMatchObject({ componentType: 'BACKSPLASH', lengthMm: 400, widthMm: 75, quantity: 2 });
    expect(payload.drawingData?.componentDetails).toEqual([{}, { parentComponentIndex: 0, parentSide: 'BACK' }, { parentComponentIndex: 0, parentSide: 'RIGHT' }]);
    const saved: SavedQuoteItem = { ...payload, id: 'saved', billedQuantity: 1.965, materialNameSnapshot: 'Pedra', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: 600, total: 1179, cutouts: [], services: [],
      components: payload.components.map((entry, index) => ({ ...entry, id: `saved-${index}`, calculatedTotal: 0, appliedTotal: 0, hasManualPriceOverride: false, edges: [] })) };
    const reopened = itemSalvoParaRascunho(saved);
    expect(reopened.components[2]).toMatchObject({ parentComponentId: 'saved-0', parentSide: 'RIGHT', lengthCm: '40', widthCm: '7.5' });
    expect(rascunhoParaEntradaItem(reopened, saved).drawingData).toEqual(payload.drawingData);
    expect(removerGrupoComponentes(reopened, 2).components.map(piece => piece.id)).toEqual(['saved-0', 'saved-1']);
  });
  it('limpa nomes automáticos de rascunhos antigos e preserva os nomes digitados após a migração', () => {
    const oldDraft = draft();
    expect(restaurarNomesComponentes([oldDraft])[0].components[0]).toMatchObject({ label: '', lengthCm: '190,5', widthCm: '40', quantity: 2 });
    oldDraft.components[0].label = 'Bancada da cozinha';
    expect(restaurarNomesComponentes([oldDraft])[0].components[0].label).toBe('Bancada da cozinha');
    oldDraft.components[0].label = 'Tampo';
    expect(restaurarNomesComponentes([oldDraft], 1)[0].components[0].label).toBe('Tampo');
  });
  it('mantém nome vazio e salva vínculos e medida do peitoril sem alterar área', () => {
    const input = draft();
    input.components[0] = { ...input.components[0], label: '', componentType: 'SILL', sillDetailCm: '12,5', sillDetailHeightCm: '4,5' };
    input.components.push({ ...input.components[0], id: 'child', parentComponentId: 'component', componentType: 'BACKSPLASH', sillDetailCm: undefined });
    const payload = rascunhoParaEntradaItem(input);
    expect(payload.components[0]).toMatchObject({ label: '', lengthMm: 1905, widthMm: 400 });
    expect(payload.drawingData).toEqual({ componentDetails: [{ sillDetailMm: 125, sillDetailHeightMm: 45 }, { parentComponentIndex: 0 }] });
    const saved: SavedQuoteItem = { ...payload, id: 'saved', billedQuantity: 1.52, materialNameSnapshot: 'Pedra', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: 600, total: 912, cutouts: [], services: [],
      components: payload.components.map((entry, index) => ({ ...entry, id: `saved-${index}`, calculatedTotal: 456, appliedTotal: 456, hasManualPriceOverride: false, edges: [] })) };
    const reopened = itemSalvoParaRascunho(saved);
    expect(reopened.components[0]).toMatchObject({ label: '', sillDetailCm: '12.5', sillDetailHeightCm: '4.5' });
    expect(reopened.components[1].parentComponentId).toBe('saved-0');
    expect(rascunhoParaEntradaItem(reopened, saved).drawingData).toEqual(payload.drawingData);
    reopened.components[0].componentType = 'THRESHOLD';
    expect(rascunhoParaEntradaItem(reopened, saved).drawingData).toEqual({ componentDetails: [{}, { parentComponentIndex: 0 }] });
    expect(rascunhoParaEntradaItem(reopened, saved).components[0].componentType).toBe('THRESHOLD');
  });
  it('remove a peça com seus adicionais e atualiza os vínculos dos recortes restantes', () => {
    const input = draft();
    input.components.push({ ...input.components[0], id: 'second' }, { ...input.components[0], id: 'child', parentComponentId: 'component' });
    input.cutouts = [{ id: 'cut', componentIndex: 1, cutoutType: 'SINK', label: '', quantity: 1 }, { id: 'cut-child', componentIndex: 2, cutoutType: 'SINK', label: '', quantity: 1 }];
    const result = removerGrupoComponentes(input, 0);
    expect(result.components.map((entry) => entry.id)).toEqual(['second']);
    expect(result.cutouts.map((entry) => entry.componentIndex)).toEqual([0, undefined]);
  });
  it.each([['1.234,56', 1234.56], ['1234,56', 1234.56], ['1234.56', 1234.56], ['0,00', 0], ['10', 10]])('converte moeda %s em %s', (text, value) => { const input = draft(); input.components[0].appliedTotal = text; expect(rascunhoParaEntradaItem(input).components[0].appliedTotal).toBe(value); });
  it.each(['', ' ', '-1', 'NaN', 'Infinity', '1,2,3', 'R$ inválido'])('não transforma valor inválido %s em cobrança zero', (text) => { const input = draft(); input.components[0].appliedTotal = text; expect(() => rascunhoParaEntradaItem(input)).toThrow(); });
  it('converte centímetros fracionados para milímetros inteiros', () => expect(rascunhoParaEntradaItem(draft()).components[0]).toMatchObject({ lengthMm: 1905, widthMm: 400, quantity: 2 }));
  it('conserva posição zero de recorte e o vínculo com componente zero', () => { const input = draft(); input.cutouts = [{ id: 'cut', componentIndex: 0, cutoutType: 'SINK', label: '', quantity: 1, positionXCm: '0', positionYCm: '0' }]; expect(rascunhoParaEntradaItem(input).cutouts[0]).toMatchObject({ componentIndex: 0, positionX: 0, positionY: 0 }); });
  it('restaurar valor remove override, não aplica zero', () => { const input = draft(); input.components[0].appliedTotal = undefined; expect(rascunhoParaEntradaItem(input).components[0].appliedTotal).toBeUndefined(); });
  it('não envia UUID local de projeto novo como ID do item, mas envia o ID gerado no cliente para o componente (estável para o plano de produção)', () => { const input = rascunhoParaEntradaItem(draft()); expect(input.id).toBeUndefined(); expect(input.components[0].id).toBe('component'); });
  it('reabre e reenvia dados salvos sem perder ID, quantidades, recorte ou preço manual', () => {
    const saved: SavedQuoteItem = { id: 'item', productTypeId: 'product', materialId: 'material', materialNameSnapshot: 'Material', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: '600', calculationMode: 'DIMENSIONS', quantity: 1, billedQuantity: '1.52', total: '850', components: [{ id: 'component', label: 'Tampo', componentType: 'TOP', orientation: 'VERTICAL', lengthMm: 1900, widthMm: 400, quantity: 2, sortOrder: 0, calculatedTotal: '912', appliedTotal: '850', hasManualPriceOverride: true, edges: [] }], cutouts: [{ id: 'cut', componentId: 'component', cutoutType: 'SINK', label: '', quantity: 1, positionX: 0, positionY: 0, sortOrder: 0, calculatedSubtotal: '70', appliedSubtotal: '0', hasManualPriceOverride: true }], services: [] };
    expect(rascunhoParaEntradaItem(itemSalvoParaRascunho(saved), saved)).toEqual(itemSalvoParaEntrada(saved));
  });
});
