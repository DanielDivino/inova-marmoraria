import { describe, expect, it } from 'vitest';
import { dividirIgualmente, validarDivisao, calcularUltimaPeca, ladoHerdado, dividirComponente, dividirPorMedida, quantidadeAteAcabar, validarDivisaoPorMedida, areaDaOrigemMm2, seguirDivisao, planoDeProducao, comPlanoDeProducao, precisaRevisao, type ProductionEdge, type ProductionPiece } from './production-plan.js';

let counter = 0;
const newId = () => `id-${++counter}`;

describe('divisão de medidas (mm inteiro)', () => {
  it('divisão igual exata', () => {
    expect(dividirIgualmente(3600, 3)).toEqual([1200, 1200, 1200]);
  });
  it('divisão igual com resto distribuído nas primeiras peças, soma sempre exata', () => {
    const partes = dividirIgualmente(1000, 3);
    expect(partes).toEqual([334, 333, 333]);
    expect(partes.reduce((sum, mm) => sum + mm, 0)).toBe(1000);
  });
  it('divisão manual válida', () => {
    expect(validarDivisao(3600, [1400, 900, 1300])).toEqual({ status: 'completo', usadoMm: 3600 });
  });
  it('erro por excesso', () => {
    expect(validarDivisao(3600, [1500, 1200, 1200])).toEqual({ status: 'excedeu', usadoMm: 3900, excedenteMm: 300 });
  });
  it('restante incompleto', () => {
    expect(validarDivisao(3600, [1400, 800, 1200])).toEqual({ status: 'incompleto', usadoMm: 3400, restanteMm: 200 });
  });
  it('preenchimento automático da última peça', () => {
    expect(calcularUltimaPeca(3600, [1400, 900])).toBe(1300);
    expect(() => calcularUltimaPeca(3600, [1400, 2200])).toThrow('restante');
  });
});

const edge = (side: ProductionEdge['side'], overrides: Partial<ProductionEdge> = {}): ProductionEdge => ({ side, serviceId: 'svc', serviceName: 'Acabamento 45°', quantity: 1, ...overrides });

describe('herança de acabamentos ao dividir pelo comprimento', () => {
  it('45° inferior (FRONT) é herdado por todas as peças', () => {
    expect(ladoHerdado('FRONT', 'LENGTH', 0, 3)).toBe(true);
    expect(ladoHerdado('FRONT', 'LENGTH', 1, 3)).toBe(true);
    expect(ladoHerdado('FRONT', 'LENGTH', 2, 3)).toBe(true);
    expect(ladoHerdado('BACK', 'LENGTH', 1, 3)).toBe(true);
  });
  it('lateral esquerda só na primeira peça', () => {
    expect(ladoHerdado('LEFT', 'LENGTH', 0, 3)).toBe(true);
    expect(ladoHerdado('LEFT', 'LENGTH', 1, 3)).toBe(false);
    expect(ladoHerdado('LEFT', 'LENGTH', 2, 3)).toBe(false);
  });
  it('lateral direita só na última peça', () => {
    expect(ladoHerdado('RIGHT', 'LENGTH', 0, 3)).toBe(false);
    expect(ladoHerdado('RIGHT', 'LENGTH', 1, 3)).toBe(false);
    expect(ladoHerdado('RIGHT', 'LENGTH', 2, 3)).toBe(true);
  });
  it('dividir 3,60 m com 45° inferior em 1,40/0,90/1,30 sugere o acabamento nas três peças', () => {
    const source = { id: 'comp-1', label: 'Bancada', componentType: 'TOP' as const, orientation: 'HORIZONTAL' as const, lengthMm: 3600, widthMm: 600, quantity: 1, edges: [edge('FRONT')] };
    const pieces = dividirComponente(source, [1400, 900, 1300], 'LENGTH', newId);
    expect(pieces).toHaveLength(3);
    expect(pieces.map((piece) => piece.lengthMm)).toEqual([1400, 900, 1300]);
    expect(pieces.every((piece) => piece.edges.some((entry) => entry.side === 'FRONT'))).toBe(true);
    // O comprimento do acabamento FRONT acompanha o comprimento de cada peça.
    expect(pieces.map((piece) => piece.edges[0].lengthMm)).toEqual([1400, 900, 1300]);
  });
  it('lateral esquerda e direita não se copiam para o meio', () => {
    const source = { id: 'comp-1', label: 'Bancada', componentType: 'TOP' as const, orientation: 'HORIZONTAL' as const, lengthMm: 3600, widthMm: 600, quantity: 1, edges: [edge('LEFT'), edge('RIGHT')] };
    const pieces = dividirComponente(source, [1400, 900, 1300], 'LENGTH', newId);
    expect(pieces[0].edges.map((entry) => entry.side)).toEqual(['LEFT']);
    expect(pieces[1].edges).toHaveLength(0);
    expect(pieces[2].edges.map((entry) => entry.side)).toEqual(['RIGHT']);
  });
  it('rejeita divisão cuja soma não bate com o comprimento comercial', () => {
    const source = { id: 'comp-1', label: 'Bancada', componentType: 'TOP' as const, orientation: 'HORIZONTAL' as const, lengthMm: 3600, widthMm: 600, quantity: 1, edges: [] };
    expect(() => dividirComponente(source, [1400, 900, 1200], 'LENGTH', newId)).toThrow('comprimento comercial');
  });
  it('quantidade comercial > 1: cada peça resultante herda a quantidade, não vira um comprimento único', () => {
    const source = { id: 'comp-1', label: 'Tampo', componentType: 'TOP' as const, orientation: 'HORIZONTAL' as const, lengthMm: 700, widthMm: 300, quantity: 3, edges: [] };
    const inicial = dividirComponente(source, [700], 'LENGTH', newId);
    expect(inicial).toEqual([expect.objectContaining({ lengthMm: 700, widthMm: 300, quantity: 3 })]);
  });
});

describe('rodabanca seguindo a divisão da bancada', () => {
  it('cria uma peça de rodabanca por peça de bancada, com o mesmo comprimento', () => {
    const bancada: ProductionPiece[] = [
      { id: 'p1', sourceComponentId: 'c1', label: 'Bancada 1', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1400, widthMm: 600, quantity: 1, edges: [] },
      { id: 'p2', sourceComponentId: 'c1', label: 'Bancada 2', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 900, widthMm: 600, quantity: 1, edges: [] },
      { id: 'p3', sourceComponentId: 'c1', label: 'Bancada 3', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1300, widthMm: 600, quantity: 1, edges: [] },
    ];
    const rodabancas = seguirDivisao(bancada, 'FRONT', 100, 'BACKSPLASH', newId);
    expect(rodabancas.map((piece) => piece.lengthMm)).toEqual([1400, 900, 1300]);
    expect(rodabancas.every((piece) => piece.widthMm === 100)).toBe(true);
    expect(rodabancas.map((piece) => piece.parentPieceId)).toEqual(['p1', 'p2', 'p3']);
    expect(rodabancas.every((piece) => piece.parentSide === 'FRONT')).toBe(true);
  });
});

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

describe('divisão por medida (comprimento × largura repetidos)', () => {
  const tampo = { snapshotLengthMm: 10250, snapshotWidthMm: 3900, snapshotQuantity: 1 };
  it('repete a medida até a área acabar, arredondando para baixo', () => {
    const area = areaDaOrigemMm2(tampo);
    expect(area).toBe(39_975_000);
    expect(quantidadeAteAcabar(area, 2050, 650)).toBe(30);
    expect(quantidadeAteAcabar(area, 2000, 600)).toBe(33);
    expect(quantidadeAteAcabar(area, 0, 600)).toBe(0);
    expect(quantidadeAteAcabar(0, 2000, 600)).toBe(0);
  });
  it('confere a área usada: sobra permitida, excesso não', () => {
    const area = areaDaOrigemMm2(tampo);
    expect(validarDivisaoPorMedida(area, [{ lengthMm: 2050, widthMm: 650, quantity: 30 }])).toEqual({ status: 'completo', usadoMm: area });
    expect(validarDivisaoPorMedida(area, [{ lengthMm: 2000, widthMm: 600, quantity: 33 }])).toEqual({ status: 'incompleto', usadoMm: 39_600_000, restanteMm: 375_000 });
    expect(validarDivisaoPorMedida(area, [{ lengthMm: 2000, widthMm: 600, quantity: 34 }]).status).toBe('excedeu');
  });
  it('cada medida vira uma peça com a sua quantidade e os acabamentos com comprimento automático', () => {
    const edges: ProductionEdge[] = [{ side: 'FRONT', serviceId: 's', serviceName: '45°', lengthMm: 10250, quantity: 1 }, { side: 'CUSTOM', serviceId: 'c', serviceName: 'Livre', lengthMm: 500, quantity: 1 }];
    const pecas = dividirPorMedida({ id: 'c1', label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', edges }, [{ lengthMm: 2000, widthMm: 600, quantity: 33 }, { lengthMm: 625, widthMm: 600, quantity: 1 }], newId);
    expect(pecas.map(({ label, lengthMm, widthMm, quantity }) => ({ label, lengthMm, widthMm, quantity }))).toEqual([
      { label: 'Tampo 1', lengthMm: 2000, widthMm: 600, quantity: 33 }, { label: 'Tampo 2', lengthMm: 625, widthMm: 600, quantity: 1 },
    ]);
    expect(pecas[0].edges).toEqual([{ side: 'FRONT', serviceId: 's', serviceName: '45°', lengthMm: undefined, quantity: 1 }]);
    expect(dividirPorMedida({ id: 'c1', label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', edges: [] }, [{ lengthMm: 2000, widthMm: 600, quantity: 5 }], newId)[0].label).toBe('Tampo');
    expect(() => dividirPorMedida({ id: 'c1', label: '', componentType: 'TOP', orientation: 'HORIZONTAL', edges: [] }, [{ lengthMm: 2000, widthMm: 0, quantity: 1 }], newId)).toThrow('Largura');
  });
});
