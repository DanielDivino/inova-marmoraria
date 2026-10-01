import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorComponentes } from '../componentes/orcamento/ComponentEditor';
import { DesenhoTecnico } from '../componentes/orcamento/TechnicalDrawing';
import { descricaoProducaoRascunho } from './manufacturing-description';
import type { DraftComponent } from '../componentes/orcamento/types';

beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());
const services = [{ id: 'vista', name: 'Vista' }, { id: 'skirt', name: 'Saia' }, { id: 'miter', name: 'Acabamento 45°' }];
const component: DraftComponent = { id: 'top', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '200', widthCm: '60', quantity: 1, edges: [
  { side: 'FRONT', serviceId: 'vista', heightCm: '5', quantity: 1 },
  { side: 'FRONT', serviceId: 'skirt', heightCm: '10', quantity: 1 },
  { side: 'FRONT', serviceId: 'miter', quantity: 1 },
] };

describe('Vista no formulário e desenho', () => {
  it('usa 7,5 cm nas cotas e deixa as medidas laterais acima das faixas', () => {
    const piece = { ...component, lengthCm: '120', widthCm: '7,5', edges: (['LEFT', 'RIGHT'] as const).flatMap((side) => [
      { side, serviceId: 'skirt', heightCm: '7,5', quantity: 1 }, { side, serviceId: 'miter', quantity: 1 },
    ]) };
    const html = renderToStaticMarkup(React.createElement(DesenhoTecnico, { components: [piece], cutouts: [], linearServices: services }));
    expect(html).toContain('>7,5 cm</text>');
    expect(html).not.toContain('0,08 m');
    const sideLabels = [...html.matchAll(/<text class="drawing-skirt-height"[^>]*>/g)].map(([tag]) => tag);
    expect(sideLabels).toHaveLength(2);
    expect(sideLabels.every((tag) => !tag.includes('rotate'))).toBe(true);
    expect(html.match(/class="drawing-miter-detail"/g)).toHaveLength(2);
  });
  it('mostra acabamentos compactos com medidas acessíveis e sem fórmulas', () => {
    const html = renderToStaticMarkup(React.createElement(EditorComponentes, { components: [component], linearServices: services, onChange: vi.fn(), onRemove: vi.fn() }));
    expect(html).toContain('>Vista</span>');
    expect(html).toContain('Largura da vista (cm)');
    expect(html).toContain('Altura da saia (cm)');
    expect(html).toContain('aria-label="Comprimento aplicado (cm)"');
    expect(html.match(/class="edge-finish"/g)).toHaveLength(3);
    expect(html).not.toContain('calculada pela pedra');
    expect(html).not.toContain('Comprimento × largura × preço da pedra por m²');
    expect(html).not.toContain('Comprimento aplicado × preço por metro linear');
  });
  it.each([['BACK', 'Superior'], ['FRONT', 'Inferior'], ['LEFT', 'Esquerdo'], ['RIGHT', 'Direito']] as const)('desenha a vista no lado %s com descrição completa', (side, label) => {
    const piece = { ...component, edges: [{ ...component.edges[0], side, lengthCm: '50' }] };
    const html = renderToStaticMarkup(React.createElement(DesenhoTecnico, { components: [piece], cutouts: [], linearServices: services }));
    expect(html).toContain(`aria-label="Vista no lado ${label}"`);
    expect(html).toContain('class="drawing-skirt"');
    expect(descricaoProducaoRascunho([piece], [], services)[0].lines).toContainEqual({ label: 'Acabamentos', text: `Vista no lado ${label} - comprimento 50 cm · largura 5 cm` });
  });
  it('mantém os três acabamentos e duas faixas visíveis no mesmo lado', () => {
    const html = renderToStaticMarkup(React.createElement(DesenhoTecnico, { components: [component], cutouts: [], linearServices: services }));
    expect(html.match(/class="drawing-skirt"/g)).toHaveLength(2);
    expect(html).toContain('Vista no lado Inferior');
    expect(html).toContain('Saia no lado Inferior');
    expect(html).toContain('Acabamento 45 graus no lado Inferior');
  });
});
