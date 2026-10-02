import { describe, expect, it } from 'vitest';
import { comPlanoDeProducao, planoDeProducao } from '@inova/domain';
import { duplicarProjeto } from './duplicar-projeto';
import { reconciliarPlano } from './production-plan';
import type { DraftItem } from '../componentes/orcamento/types';

const projeto = (): DraftItem => {
  const item: DraftItem = {
    id: 'p1', projectName: 'Cozinha', productTypeId: 'tipo', materialId: 'granito', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', arredondarM2: true,
    components: [
      { id: 'c1', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '240', widthCm: '60', quantity: 1, materialId: 'granito', appliedTotal: '1500', edges: [{ id: 'b1', side: 'FRONT', serviceId: 'meia-esquadria', quantity: 1 }] },
      { id: 'c2', label: 'Rodabanca', componentType: 'BACKSPLASH', orientation: 'VERTICAL', lengthCm: '240', widthCm: '10', quantity: 1, materialId: 'granito', parentComponentId: 'c1', parentSide: 'BACK', edges: [] },
    ],
    cutouts: [{ id: 'r1', componentIndex: 0, cutoutType: 'SINK', label: 'Cuba', quantity: 1 }],
    serviceIds: ['instalacao'], serviceQuantities: { instalacao: '1' }, serviceAppliedValues: { instalacao: '200' },
    drawingData: { desenhoTecnico: { designId: 'd1', nome: 'Cozinha', versao: 2, total: 1700, aceitoEm: '2026-09-29' } },
  };
  return { ...item, drawingData: comPlanoDeProducao(item.drawingData, reconciliarPlano(item, undefined)) };
};
let contador = 0;
const novoId = () => `novo-${++contador}`;

describe('duplicar projeto', () => {
  it('copia tudo com ids novos, sem mexer no original', () => {
    const original = projeto();
    const antes = JSON.stringify(original);
    const copia = duplicarProjeto(original, 'Cozinha (cópia)', novoId);
    expect(JSON.stringify(original)).toBe(antes);
    expect(copia.projectName).toBe('Cozinha (cópia)');
    expect(copia.id).not.toBe(original.id);
    // Mesmas medidas, pedra, bordas, recortes, serviços e valores aplicados.
    expect(copia.components.map(({ label, lengthCm, widthCm, materialId, appliedTotal }) => ({ label, lengthCm, widthCm, materialId, appliedTotal })))
      .toEqual(original.components.map(({ label, lengthCm, widthCm, materialId, appliedTotal }) => ({ label, lengthCm, widthCm, materialId, appliedTotal })));
    expect(copia.cutouts[0]).toMatchObject({ componentIndex: 0, cutoutType: 'SINK', label: 'Cuba' });
    expect(copia.components[0].edges[0]).toMatchObject({ side: 'FRONT', serviceId: 'meia-esquadria' });
    expect([copia.materialId, copia.serviceIds, copia.serviceQuantities, copia.serviceAppliedValues, copia.arredondarM2]).toEqual([original.materialId, original.serviceIds, original.serviceQuantities, original.serviceAppliedValues, true]);
    // Nenhum id do original sobra na cópia.
    const texto = JSON.stringify(copia);
    for (const id of ['p1', 'c1', 'c2', 'b1', 'r1', ...planoDeProducao(original.drawingData)!.pieces.map((peca) => peca.id)]) expect(texto).not.toContain(`"${id}"`);
  });

  it('as referências internas acompanham os ids novos (rodabanca e plano de produção)', () => {
    const copia = duplicarProjeto(projeto(), 'Cozinha (cópia)', novoId);
    const [bancada, rodabanca] = copia.components;
    expect(rodabanca.parentComponentId).toBe(bancada.id);
    const plano = planoDeProducao(copia.drawingData)!;
    expect(plano.sources.map((origem) => origem.componentId)).toEqual([bancada.id, rodabanca.id]);
    expect(plano.pieces.map((peca) => peca.sourceComponentId)).toEqual([bancada.id, rodabanca.id]);
  });

  it('com a cópia do desenho técnico, a cópia do projeto fica ligada a ela, com o mapa de peças nos ids novos', () => {
    const original = projeto();
    original.drawingData = { ...original.drawingData, desenhoTecnico: { designId: 'd1', nome: 'Cozinha', versao: 2, total: 1700, aceitoEm: '2026-09-29',
      sincronia: { pecas: { c1: { pecaId: 'p1', forma: 'RETANGULO', parte: 0 } }, bordas: { c1: { 'FRONT:SKIRT': 'saia1' } }, recortes: { r1: 'cuba1' }, base: { nome: 'Cozinha', pecas: [{ id: 'c1' }], recortes: [{ id: 'r1', pecaId: 'c1' }] } } } };
    const copia = duplicarProjeto(original, 'Cozinha gourmet', novoId, { designId: 'd2', nome: 'Cozinha gourmet', versao: 1 });
    const vinculo = copia.drawingData!.desenhoTecnico as any;
    expect(vinculo).toMatchObject({ designId: 'd2', nome: 'Cozinha gourmet', versao: 1, total: 1700 });
    const [peca] = copia.components, [recorte] = copia.cutouts;
    expect(vinculo.sincronia.pecas).toEqual({ [peca.id]: { pecaId: 'p1', forma: 'RETANGULO', parte: 0 } });
    expect(vinculo.sincronia.bordas).toEqual({ [peca.id]: { 'FRONT:SKIRT': 'saia1' } });
    expect(vinculo.sincronia.recortes).toEqual({ [recorte.id]: 'cuba1' });
    expect(vinculo.sincronia.base).toEqual({ nome: 'Cozinha', pecas: [{ id: peca.id }], recortes: [{ id: recorte.id, pecaId: peca.id }] });
  });

  it('continua no Orçamento Rápido, mas sem o vínculo com o desenho técnico', () => {
    const copia = duplicarProjeto(projeto(), 'Cozinha (cópia)', novoId);
    expect(copia.drawingData).not.toHaveProperty('desenhoTecnico');
  });
});
