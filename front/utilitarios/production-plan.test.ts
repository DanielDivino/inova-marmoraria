import { describe, expect, it } from 'vitest';
import { comPlanoDeProducao, type ProductionPlan } from '@inova/domain';
import { conciliarPlanoParaSalvar, lerPlanoDeProducao, pecaParaComponente, planoParaDesenho, reconciliarPlano } from './production-plan';
import { criarComponenteRapido } from './quick-quote';
import type { DraftItem } from '../componentes/orcamento/types';

// Plano de produção dos projetos antigos (do extinto "Com desenho"): continua sendo lido para a OS,
// o fluxo e as entregas, e acompanha as peças quando o orçamento é editado.
const draft = (): DraftItem => ({ id: 'p', projectName: 'Cozinha', materialId: 'stone', productTypeId: 'type', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '',
  components: [{ ...criarComponenteRapido('stone'), id: 'comp-1', lengthCm: '360', widthCm: '60' }], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {} });
/** Bancada de 3m60 dividida em duas pedras, como ficou num projeto antigo. */
const planoDividido = (item: DraftItem): ProductionPlan => {
  const plano = reconciliarPlano(item, undefined);
  const [peca] = plano.pieces;
  return { ...plano, pieces: [{ ...peca, id: 'a', lengthMm: 2000 }, { ...peca, id: 'b', lengthMm: 1600 }] };
};

describe('plano de produção antigo', () => {
  it('vira o desenho das peças sem material nem preço', () => {
    const { components } = planoParaDesenho(planoDividido(draft()));
    expect(components.map((componente) => [componente.id, componente.lengthCm, componente.widthCm])).toEqual([['a', '200', '60'], ['b', '160', '60']]);
    expect(pecaParaComponente(planoDividido(draft()).pieces[0])).not.toHaveProperty('materialId');
  });

  it('ao editar o orçamento, a divisão feita continua; medida mudada marca a revisão; peça nova entra inteira', () => {
    const item = draft();
    const plano = planoDividido(item);
    expect(reconciliarPlano(item, plano).pieces.map((peca) => peca.lengthMm)).toEqual([2000, 1600]);
    const mudado = { ...item, components: [{ ...item.components[0], lengthCm: '400' }, { ...criarComponenteRapido('stone'), id: 'comp-2', lengthCm: '90', widthCm: '15', quantity: 3 }] };
    const reconciliado = reconciliarPlano(mudado, plano);
    expect(reconciliado.sources.map((origem) => [origem.componentId, !!origem.needsReview])).toEqual([['comp-1', true], ['comp-2', false]]);
    expect(reconciliado.pieces.map((peca) => [peca.sourceComponentId, peca.lengthMm, peca.quantity])).toEqual([['comp-1', 2000, 1], ['comp-1', 1600, 1], ['comp-2', 900, 3]]);
  });

  it('ao salvar, peça trocada por outra não deixa o plano apontando para a que saiu; sem plano, nada muda', () => {
    const original = draft();
    const salvo = { ...original, drawingData: comPlanoDeProducao(undefined, reconciliarPlano(original, undefined)) };
    const trocado = { ...salvo, components: [{ ...salvo.components[0], id: 'comp-novo' }] };
    const plano = lerPlanoDeProducao(conciliarPlanoParaSalvar(trocado).drawingData)!;
    expect(plano.sources.map((origem) => origem.componentId)).toEqual(['comp-novo']);
    expect(plano.pieces.map((peca) => peca.sourceComponentId)).toEqual(['comp-novo']);
    expect(conciliarPlanoParaSalvar(original)).toBe(original);
  });
});
