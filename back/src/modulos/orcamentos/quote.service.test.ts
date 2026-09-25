import { describe, expect, it } from 'vitest';
import { montarItem, validarDesconto } from './quote.service.js';
import { montarLinhasPdf } from './quote.pdf-lines.js';

const input = (appliedTotal?: number) => ({
  productTypeId: 'product', materialId: 'stone', calculationMode: 'DIMENSIONS', quantity: 1,
  components: [{ id: 'piece', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 1000, quantity: 1,
    ...(appliedTotal === undefined ? {} : { appliedTotal }),
    edges: [
      { id: 'edge-linear', side: 'FRONT', quantity: 2, serviceId: 'miter', appliedSubtotal: 5.005 },
      { id: 'edge-vista', side: 'BACK', heightMm: 50, quantity: 1, serviceId: 'vista', appliedSubtotal: 4 },
    ],
  }],
  services: [{ serviceId: 'assembly', billedQuantity: 1, appliedSubtotal: 8.005 }],
  cutouts: [{ id: 'hole', cutoutType: 'FAUCET_HOLE', quantity: 1, serviceId: 'hole-service', appliedSubtotal: 2.005 }],
});

const transaction = {
  productType: { findUnique: async () => ({ id: 'product', isActive: true }) },
  material: { findUnique: async () => ({ id: 'stone', name: 'Granito', billingUnit: 'SQUARE_METER', isActive: true, prices: [{ amount: 100 }] }) },
  service: { findUnique: async ({ where: { id } }: { where: { id: string } }) => ({
    id, isActive: true,
    ...(id === 'miter' ? { name: 'Acabamento 45°', billingUnit: 'LINEAR_METER', currentPrice: 10 }
      : id === 'vista' ? { name: 'Vista', billingUnit: 'LINEAR_METER', currentPrice: 999 }
      : id === 'skirt' ? { name: 'Saia', billingUnit: 'LINEAR_METER', currentPrice: 999 }
      : id === 'assembly' ? { name: 'Montagem', billingUnit: 'FIXED', currentPrice: 10 }
      : { name: 'Furo de torneira', billingUnit: 'UNIT', currentPrice: 3 }),
  }) },
} as never;

describe('Montagem financeira do item do orçamento na API', () => {
  it('usa a mesma autorização de desconto em criação, edição e atualização do rascunho', () => {
    const seller = { id: 'seller', name: 'Vendedor', role: 'SELLER' as const, maxDiscountPercent: 10 };
    expect(() => validarDesconto(seller, 100.05, 10.01)).not.toThrow();
    expect(() => validarDesconto(seller, 100.05, 10.02)).toThrow('Desconto acima do limite permitido');
    expect(() => validarDesconto({ ...seller, role: 'SUPER_ADMIN' }, 100, 100)).not.toThrow();
  });

  it('reconcilia material, acabamentos por lado, vista, serviço e furo pelos valores aplicados', async () => {
    const result = await montarItem(transaction, input() as never, { role: 'SUPER_ADMIN' } as never);
    expect(result.components[0]).toMatchObject({ subtotal: 100, calculatedTotal: 125, appliedTotal: 109.01 });
    expect(result.components[0].edges.map((edge: { billedQuantity: number; subtotal: number; appliedSubtotal: number; unitPriceSnapshot: number }) => [edge.billedQuantity, edge.subtotal, edge.appliedSubtotal, edge.unitPriceSnapshot])).toEqual([
      [2, 20, 5.01, 10],
      [0.05, 5, 4, 100],
    ]);
    expect(result.services[0]).toMatchObject({ calculatedSubtotal: 10, appliedSubtotal: 8.01 });
    expect(result.cutouts[0]).toMatchObject({ calculatedSubtotal: 3, appliedSubtotal: 2.01 });
    expect(result.materialSubtotal).toBe(100);
    expect(result.servicesSubtotal).toBe(19.03);
    expect(result.total).toBe(119.03);
    const pdf = montarLinhasPdf([result]);
    const pdfCents = Math.round((pdf.items.flat().reduce((sum, line) => sum + line.total, 0) + pdf.linear.reduce((sum, line) => sum + line.total, 0)) * 100);
    expect(pdfCents).toBe(Math.round(result.total * 100));
  });

  it.each([[0.005, 0.01], [0, 0]])('normaliza override manual da peça para centavos e respeita zero (%s → %s)', async (manual, expected) => {
    const result = await montarItem(transaction, input(manual) as never, { role: 'SUPER_ADMIN' } as never);
    expect(result.components[0].appliedTotal).toBe(expected);
    expect(result.total).toBe(expected + 8.01 + 2.01);
  });

  it.each([
    ['FRONT', undefined, 2], ['BACK', undefined, 2], ['LEFT', undefined, 0.6], ['RIGHT', undefined, 0.6], ['CUSTOM', 750, 0.75],
  ] as const)('mede o acabamento de borda no lado %s sem perder comprimento próprio', async (side, lengthMm, expectedMeters) => {
    const payload: any = input();
    payload.components[0].lengthMm = 2000;
    payload.components[0].widthMm = 600;
    payload.components[0].edges = [{ id: 'side-edge', side, ...(lengthMm ? { lengthMm } : {}), quantity: 1, serviceId: 'miter' }];
    payload.services = [];
    payload.cutouts = [];
    const result = await montarItem(transaction, payload, { role: 'SUPER_ADMIN' } as never);
    expect(result.components[0].edges[0]).toMatchObject({ billedQuantity: expectedMeters, subtotal: expectedMeters * 10 });
  });

  it.each([['vista', 'Vista'], ['skirt', 'Saia']])('cobra %s pela área da pedra e não pelo preço de serviço', async (serviceId, serviceName) => {
    const payload: any = input();
    payload.components[0].lengthMm = 2000;
    payload.components[0].widthMm = 600;
    payload.components[0].edges = [{ id: 'strip-edge', side: 'FRONT', heightMm: 50, quantity: 2, serviceId }];
    payload.services = [];
    payload.cutouts = [];
    const result = await montarItem(transaction, payload, { role: 'SUPER_ADMIN' } as never);
    expect(result.components[0].edges[0]).toMatchObject({ serviceNameSnapshot: serviceName, billingUnitSnapshot: 'SQUARE_METER', billedQuantity: 0.2, unitPriceSnapshot: 100, subtotal: 20 });
  });

  it.each(['SINK', 'SCULPTED_SINK', 'OVAL_SINK', 'COOKTOP', 'FAUCET_HOLE', 'GENERIC_HOLE', 'OTHER'] as const)('mantém a cobrança por quantidade do recorte %s', async cutoutType => {
    const payload: any = input();
    payload.components[0].edges = [];
    payload.services = [];
    payload.cutouts = [{ id: 'cutout', cutoutType, quantity: 2, serviceId: 'hole-service' }];
    const result = await montarItem(transaction, payload, { role: 'SUPER_ADMIN' } as never);
    expect(result.cutouts[0]).toMatchObject({ billedQuantity: 2, calculatedSubtotal: 6, appliedSubtotal: 6 });
    expect(result.total).toBe(106);
  });
});
