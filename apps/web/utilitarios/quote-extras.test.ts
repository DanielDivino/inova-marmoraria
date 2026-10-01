import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ComplementosOrcamento } from '../componentes/orcamento/QuoteExtras';
import { ValoresRecortes } from '../componentes/orcamento/CutoutValues';
import type { DraftCutout } from '../componentes/orcamento/types';

// The standalone test compiler uses the classic JSX runtime.
beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());
const services = [
  { id: 'sink', name: 'Cuba Grande', category: 'Cubas / Itens', billingUnit: 'UNIT' as const, currentPrice: 350 },
  { id: 'cut', name: 'Furo de Cuba', category: 'Recortes / Furações', billingUnit: 'UNIT' as const, currentPrice: 70 },
  { id: 'polish', name: 'Acabamento Polimento', category: 'Acabamentos', billingUnit: 'SQUARE_METER' as const, currentPrice: 100 },
];
const cutout: DraftCutout = { id: 'one', cutoutType: 'SINK', label: 'Cuba da cozinha', quantity: 2, serviceId: 'sink' };

describe('Seleção e valores de recortes e cubas', () => {
  it('exibe em cada componente somente seus recortes, sem serviços adicionais', () => {
    const html = renderToStaticMarkup(React.createElement(ComplementosOrcamento, { mode: 'cutouts', componentIndex: 1, cutouts: [{ ...cutout, componentIndex: 0 }, { ...cutout, id: 'two', label: 'Cuba do banheiro', componentIndex: 1 }], components: [], services, serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, onChange: vi.fn() }));
    expect(html).toContain('Cuba do banheiro');
    expect(html).not.toContain('Cuba da cozinha');
    expect(html).not.toContain('general-services-menu');
    expect(html).not.toContain('Componente do recorte ou cuba');
  });
  it('mantém recortes sem componente e cobranças antigas acessíveis', () => {
    const html = renderToStaticMarkup(React.createElement(ComplementosOrcamento, { mode: 'unassigned', cutouts: [cutout], components: [], services, serviceIds: ['sink'], serviceQuantities: { sink: '2' }, serviceAppliedValues: {}, onChange: vi.fn() }));
    expect(html).toContain('Cuba da cozinha');
    expect(html).not.toContain('Quantidade — Cuba Grande');
    expect(html).toContain('Componente do recorte ou cuba');
  });
  it('na etapa de valores mostra cubas e serviços adicionais, sem cortes', () => {
    const html = renderToStaticMarkup(React.createElement(ComplementosOrcamento, { mode: 'services', cutouts: [cutout], components: [], services, serviceIds: ['sink'], serviceQuantities: {}, serviceAppliedValues: {}, onChange: vi.fn() }));
    expect(html).toContain('Acabamento Polimento');
    expect(html).toContain('Cuba Grande');
    expect(html).toContain('Quantidade — Cuba Grande');
    expect(html).not.toContain('Furo de Cuba');
    expect(html).not.toContain('cutout-row');
  });
  it('oferece apenas cortes no recorte e as cubas junto dos serviços adicionais', () => {
    const html = renderToStaticMarkup(React.createElement(ComplementosOrcamento, { cutouts: [{ ...cutout, serviceId: 'cut' }], components: [], services, serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, onChange: vi.fn() }));
    const [cutoutMenu, generalMenu] = html.split('general-services-menu');
    expect(cutoutMenu).not.toContain('Cuba Grande');
    expect(cutoutMenu).toContain('Furo de Cuba');
    expect(cutoutMenu).not.toContain('Acabamento Polimento');
    expect(generalMenu).toContain('Acabamento Polimento');
    expect(generalMenu).toContain('Cuba Grande');
    expect(generalMenu).not.toContain('Furo de Cuba');
    expect(cutoutMenu.replaceAll('\u00a0', ' ')).toContain('Valor calculado: R$ 140,00');
  });
  it('mantém uma cuba antiga editável em valores e serviços, sem criar uma segunda cobrança', () => {
    const html = renderToStaticMarkup(React.createElement(ComplementosOrcamento, { cutouts: [], components: [], services, serviceIds: ['sink'], serviceQuantities: { sink: '2' }, serviceAppliedValues: { sink: '650,00' }, onChange: vi.fn() }));
    const [cutoutMenu, generalMenu] = html.split('general-services-menu');
    expect(cutoutMenu).not.toContain('Quantidade — Cuba Grande');
    expect(generalMenu).toContain('Quantidade — Cuba Grande');
    expect(html).not.toContain('cutout-row');
  });
  it('discrimina valor normal, valor aplicado e desconto do recorte', () => {
    const html = renderToStaticMarkup(React.createElement(ValoresRecortes, { cutouts: [{ ...cutout, appliedTotal: '650,00' }], components: [], services, calculate: () => 700, onChange: vi.fn() })).replaceAll('\u00a0', ' ');
    expect(html).toContain('Cuba Grande');
    expect(html).toContain('Valor calculado: R$ 700,00');
    expect(html).toContain('value="650,00"');
    expect(html).toContain('R$ 50,00');
    expect(html).toContain('Restaurar cálculo');
  });
  it('restaura apenas o valor selecionado e mantém os outros recortes', () => {
    const onChange = vi.fn();
    const cutouts = [{ ...cutout, appliedTotal: '650,00' }, { ...cutout, id: 'two', appliedTotal: '600,00' }];
    const tree = ValoresRecortes({ cutouts, components: [], services, calculate: () => 700, onChange });
    const firstRow = tree.props.children[0];
    const discount = firstRow.props.children[2];
    const restore = discount.props.children.find((child: any) => child?.type === 'button');
    restore.props.onClick();
    expect(onChange).toHaveBeenCalledWith([{ ...cutouts[0], appliedTotal: undefined }, cutouts[1]]);
  });
});
