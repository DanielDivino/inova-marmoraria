import { describe, expect, it } from 'vitest';
import { descricaoProducaoRascunho } from './manufacturing-description';
import { rotuloLadoBorda, escalasDesenhoTecnico, posicaoMarcadorMeiaEsquadria } from '@inova/domain';
import type { DraftComponent, DraftCutout } from '../componentes/orcamento/types';

const component: DraftComponent = { id: 'top', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '200', widthCm: '60', quantity: 2, edges: [
  { side: 'FRONT', serviceId: 'miter', quantity: 1 }, { side: 'FRONT', serviceId: 'skirt', lengthCm: '180', heightCm: '10', quantity: 1 },
] };
const services = [{ id: 'miter', name: 'Acabamento 45°' }, { id: 'skirt', name: 'Saia' }, { id: 'sink', name: 'Cuba de embutir' }];
describe('Descrição automática de fabricação', () => {
  it('posiciona o símbolo junto ao lado selecionado, acompanhando a saia', () => {
    const piece = { x: 100, y: 100, width: 170, height: 60 };
    expect(posicaoMarcadorMeiaEsquadria('BACK', piece)).toEqual({ x: 165, y: 84, rotation: 0 });
    expect(posicaoMarcadorMeiaEsquadria('FRONT', piece)).toEqual({ x: 165, y: 164, rotation: 0 });
    expect(posicaoMarcadorMeiaEsquadria('LEFT', piece)).toEqual({ x: 84, y: 150, rotation: -90 });
    expect(posicaoMarcadorMeiaEsquadria('RIGHT', piece)).toEqual({ x: 286, y: 110, rotation: 90 });
    expect(posicaoMarcadorMeiaEsquadria('FRONT', piece, { left: 0, right: 0, top: 0, bottom: 20 })?.y).toBe(184);
  });
  it('amplia visualmente peças estreitas e mantém espaço para saias', () => {
    const extra = { left: 0, right: 0, top: 0, bottom: 100 };
    const { scaleX, scaleY } = escalasDesenhoTecnico(3000, 50, extra, 170, 100);
    expect(50 * scaleY).toBe(24);
    expect((50 + extra.bottom) * scaleY).toBeLessThanOrEqual(100);
    expect(3000 * scaleX).toBe(170);
    const vertical = escalasDesenhoTecnico(30, 3000, { left: 0, right: 0, top: 0, bottom: 0 }, 170, 100);
    expect(30 * vertical.scaleX).toBe(24);
    expect(3000 * vertical.scaleY).toBe(100);
  });
  it.each([['BACK', 'Superior'], ['FRONT', 'Inferior'], ['LEFT', 'Esquerdo'], ['RIGHT', 'Direito'], ['up', 'Superior'], ['down', 'Inferior'], ['left', 'Esquerdo'], ['right', 'Direito']])('padroniza %s como %s', (side, label) => {
    expect(rotuloLadoBorda(side)).toBe(label);
  });
  it('usa os quatro lados padronizados nos acabamentos, sem expressões redundantes', () => {
    const piece = { ...component, lengthCm: '253', widthCm: '12', edges: (['FRONT', 'BACK', 'RIGHT', 'LEFT'] as const).map((side) => ({ side, serviceId: 'simple', quantity: 1 })) };
    const lines = descricaoProducaoRascunho([piece], [], [{ id: 'simple', name: 'Acabamento Simples' }])[0].lines;
    expect(lines.filter((line) => line.label === 'Acabamentos').map((line) => line.text)).toEqual([
      'Acabamento Simples no lado Inferior - 2,53 m', 'Acabamento Simples no lado Superior - 2,53 m',
      'Acabamento Simples no lado Direito - 0,12 m', 'Acabamento Simples no lado Esquerdo - 0,12 m',
    ]);
  });
  it('descreve os dois acabamentos do mesmo lado com medidas independentes', () => {
    const text = JSON.stringify(descricaoProducaoRascunho([component], [], services));
    expect(text).toContain('Acabamento 45° no lado Inferior');
    expect(text).toContain('no lado Inferior - 2 m');
    expect(text).toContain('Saia no lado Inferior');
    expect(text).toContain('comprimento 180 cm · altura 10 cm');
    expect(text).not.toContain('Recorte');
    expect(text).not.toContain('Observações');
  });
  it('lista recorte, área, cuba, furação, diâmetro e posição zero sem omiti-los', () => {
    const cutouts: DraftCutout[] = [
      { id: 'sink', componentIndex: 0, cutoutType: 'SINK', label: 'Cuba da cozinha', lengthCm: '56', widthCm: '34', quantity: 1, serviceId: 'sink' },
      { id: 'hole', componentIndex: 0, cutoutType: 'FAUCET_HOLE', label: '', diameterCm: '3,5', positionXCm: '0', positionYCm: '10', quantity: 2 },
    ];
    const text = JSON.stringify(descricaoProducaoRascunho([component], cutouts, services));
    for (const expected of ['56 × 34 cm', '0,1904 m²', 'Cuba de embutir', 'Furação', 'diâmetro 3,5 cm', 'centro X: 0 cm', 'centro Y: 10 cm', 'quantidade: 2']) expect(text).toContain(expected);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });
  it('vincula adicionais e mantém recortes sem componente descritos', () => {
    const child = { ...component, id: 'child', label: '', componentType: 'BACKSPLASH' as const, parentComponentId: 'top', edges: [] };
    const sections = descricaoProducaoRascunho([component, child], [{ id: 'cut', cutoutType: 'OTHER', label: 'Corte especial', quantity: 1 }], services);
    expect(sections[0].lines).toContainEqual({ label: 'Componentes adicionados', text: '2. Rodabanca' });
    expect(sections[1].lines).toContainEqual({ label: 'Vínculo', text: 'Adicional de 1. Bancada' });
    expect(sections[2].title).toBe('Recortes sem componente vinculado');
    expect(sections[2].lines).toHaveLength(1);
  });
});
