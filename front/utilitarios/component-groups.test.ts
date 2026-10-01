import { describe, expect, it } from 'vitest';
import type { DraftComponent, DraftCutout } from '../componentes/orcamento/types';
import { moverComponente, pecasParaPrender, prenderNaPeca } from './component-groups';

const peca = (id: string, extra: Partial<DraftComponent> = {}): DraftComponent => ({ id, label: '', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '200', widthCm: '60', quantity: 1, edges: [], ...extra });
const recorte = (componentIndex: number): DraftCutout => ({ id: `r${componentIndex}`, componentIndex, cutoutType: 'SINK', label: 'Cuba', quantity: 1 });

describe('saia, vista e rodabanca presas a uma peça', () => {
  it('só as peças principais podem receber; presa, a saia pega o comprimento do lado e vai para logo depois da peça', () => {
    const saia = peca('saia', { componentType: 'SKIRT', orientation: 'VERTICAL', lengthCm: '', widthCm: '4' });
    const item = { components: [saia, peca('bancada'), peca('ilha', { lengthCm: '120', widthCm: '90', materialId: 'branco', materialProprio: true }), peca('roda', { componentType: 'BACKSPLASH', parentComponentId: 'bancada', parentSide: 'BACK' })], cutouts: [recorte(1)] };
    expect(pecasParaPrender(item, 'saia').map((entrada) => entrada.id)).toEqual(['bancada', 'ilha']);

    const presa = prenderNaPeca(item, 'saia', { id: 'ilha', side: 'LEFT' });
    expect(presa.components.map((entrada) => entrada.id)).toEqual(['bancada', 'ilha', 'saia', 'roda']);
    // Pega a pedra da peça onde fica (aqui, uma pedra própria da ilha).
    expect(presa.components[2]).toMatchObject({ parentComponentId: 'ilha', parentSide: 'LEFT', lengthCm: '90', materialId: 'branco', materialProprio: true });
    // A cuba continua na bancada, que mudou de posição na lista.
    expect(presa.cutouts[0].componentIndex).toBe(0);

    // Comprimento já digitado fica; soltar tira o vínculo.
    const outroLado = prenderNaPeca(presa, 'saia', { id: 'ilha', side: 'FRONT' });
    expect(outroLado.components[2]).toMatchObject({ parentSide: 'FRONT', lengthCm: '90' });
    expect(prenderNaPeca(outroLado, 'saia').components[2]).toMatchObject({ parentComponentId: undefined, parentSide: undefined });
  });

  it('arrastar a peça presa para antes da peça dela a devolve para logo depois', () => {
    const item = { components: [peca('bancada'), peca('saia', { componentType: 'SKIRT', parentComponentId: 'bancada', parentSide: 'FRONT' }), peca('ilha')], cutouts: [recorte(0)] };
    expect(moverComponente(item, 1, 0).components.map((entrada) => entrada.id)).toEqual(['bancada', 'saia', 'ilha']);
    const bancadaNoFim = moverComponente(item, 0, 2);
    expect(bancadaNoFim.components.map((entrada) => entrada.id)).toEqual(['ilha', 'bancada', 'saia']);
    expect(bancadaNoFim.cutouts[0].componentIndex).toBe(1);
  });
});
