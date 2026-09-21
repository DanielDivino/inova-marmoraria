import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { descricaoProducaoRecorte, formatoRecorte } from '@inova/domain';
import { MapaBordasComponente } from '../componentes/orcamento/ComponentEdgeMap';
import { DesenhoTecnico } from '../componentes/orcamento/TechnicalDrawing';
import { quoteCutoutSchema } from '../../back/src/modulos/orcamentos/quote.schema';
import type { DraftComponent, DraftCutout } from '../componentes/orcamento/types';

beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());
const component: DraftComponent = { id: 'top', componentType: 'TOP', label: 'Balcão', orientation: 'HORIZONTAL', lengthCm: '130', widthCm: '50', quantity: 1, edges: [] };

describe('Cuba oval como tipo de recorte', () => {
  it.each(['OVAL_SINK', 'FAUCET_HOLE', 'GENERIC_HOLE'] as const)('representa %s como elipse em ambos os desenhos', cutoutType => {
    const cutout: DraftCutout = { id: 'cut', componentIndex: 0, cutoutType, label: '', lengthCm: '56', widthCm: '34', quantity: 1 };
    const map = renderToStaticMarkup(React.createElement(MapaBordasComponente, { component, cutouts: [cutout], services: [], onChange: vi.fn() }));
    const drawing = renderToStaticMarkup(React.createElement(DesenhoTecnico, { components: [component], cutouts: [cutout] }));
    expect(map).toContain('<ellipse');
    expect(drawing).toMatch(/<ellipse[^>]+class="drawing-cutout"/);
    expect(quoteCutoutSchema.parse({ cutoutType, lengthMm: 560, widthMm: 340 }).cutoutType).toBe(cutoutType);
  });
  it('preserva cubas retangulares e cooktops', () => {
    expect(formatoRecorte('SINK')).toBe('rectangle');
    expect(formatoRecorte('COOKTOP')).toBe('rectangle');
  });
  it('descreve o formato oval, suas medidas e área elíptica na fabricação', () => {
    const description = descricaoProducaoRecorte({ cutoutType: 'OVAL_SINK', lengthMm: 560, widthMm: 340, quantity: 1 });
    expect(description[0].text).toContain('Recorte para cuba oval');
    expect(description[0].text).toContain('56 × 34 cm');
    expect(description[1].text).toBe('0,1495 m² por recorte');
  });
});
