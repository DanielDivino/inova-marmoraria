import { describe, expect, it } from 'vitest';
import { planoDeProducao, comPlanoDeProducao, precisaRevisao } from './production-plan';

// Plano de produção dos projetos antigos: lido e regravado como está; a divisão em pedras é a emenda do desenho técnico.
describe('leitura/gravação do plano em drawingData e detecção de mudança comercial', () => {
  it('planoDeProducao retorna undefined para orçamentos legados sem plano', () => {
    expect(planoDeProducao(undefined)).toBeUndefined();
    expect(planoDeProducao({ entryMode: 'DETAILED' })).toBeUndefined();
  });
  it('grava e lê o plano de volta sem perder nada', () => {
    const plan = { version: 1 as const, sources: [], pieces: [], cutouts: [] };
    const data = comPlanoDeProducao({ entryMode: 'DETAILED' }, plan);
    expect(data).toMatchObject({ entryMode: 'DETAILED', productionPlan: plan });
    expect(planoDeProducao(data)).toEqual(plan);
  });
  it('marca needsReview quando o comercial muda depois do detalhamento', () => {
    const source = { componentId: 'c1', splitAxis: 'LENGTH' as const, snapshotLengthMm: 3600, snapshotWidthMm: 600, snapshotQuantity: 1, snapshotComponentType: 'TOP' as const, snapshotMaterialId: 'stone' };
    expect(precisaRevisao(source, { lengthMm: 3600, widthMm: 600, quantity: 1, componentType: 'TOP', materialId: 'stone' })).toBe(false);
    expect(precisaRevisao(source, { lengthMm: 3800, widthMm: 600, quantity: 1, componentType: 'TOP', materialId: 'stone' })).toBe(true);
    expect(precisaRevisao(source, { lengthMm: 3600, widthMm: 600, quantity: 2, componentType: 'TOP', materialId: 'stone' })).toBe(true);
  });
});
