import { describe, expect, it, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { renderizarPdfOrcamento } from './quote.pdf.js';
import { montarLinhasPdf } from './quote.pdf-lines.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { QuotePdfOptions } from './quote.pdf-options.js';

const item = { materialNameSnapshot: 'Branco Dallas', productType: { name: 'Bancada' }, billedQuantity: 1, services: [], components: [], cutouts: [] };
async function render(netTotal: number, items: any[] = [item], artifact?: string, notes?: string, options?: QuotePdfOptions) {
  const quote = { number: 'TESTE-PIX', customerNameSnapshot: 'Cliente', netTotal, grossTotal: 2000, discountAmount: 100, items, notes };
  const pdf = new PDFDocument({ margin: 36 });
  const printed = vi.spyOn(pdf, 'text');
  const pages = vi.spyOn(pdf, 'addPage');
  const rectangles = vi.spyOn(pdf, 'rect');
  const ellipses = vi.spyOn(pdf, 'ellipse');
  const chunks: Buffer[] = [];
  const buffer = new Promise<void>((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.on('end', resolve); pdf.on('error', reject); });
  renderizarPdfOrcamento(pdf, quote, options);
  pdf.end();
  await buffer;
  if (artifact) { mkdirSync('.test-artifacts/pdf', { recursive: true }); writeFileSync(`.test-artifacts/pdf/${artifact}.pdf`, Buffer.concat(chunks)); }
  // PDFKit's last overload omits coordinates, but these calls use text(text, x, y, options).
  return { quote, calls: printed.mock.calls as unknown as [string, number?, number?, unknown?][], pages: pages.mock.calls.length, rectangles: rectangles.mock.calls, ellipses: ellipses.mock.calls };
}

describe('Opções e agrupamento comercial do PDF', () => {
  it('mostra o total monetário de cada projeto quando os valores individuais estão ocultos', async () => {
    const result = await render(1500, [
      { ...item, projectName: 'Cozinha', total: 900, billedQuantity: 1.2 },
      { ...item, projectName: 'Banheiro', total: 600, billedQuantity: .8 },
    ], undefined, undefined, { individualPrices: false, drawings: false });
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('TOTAL DO PROJETO · COZINHA');
    expect(texts).toContain('TOTAL DO PROJETO · BANHEIRO');
    expect(texts).toContain('R$ 900,00');
    expect(texts).toContain('R$ 600,00');
  });

  it('mantém o total de cada projeto junto dos valores individuais', async () => {
    const result = await render(1500, [{ ...item, projectName: 'Cozinha', total: 1500, billedQuantity: 2 }], undefined, undefined, { individualPrices: true, drawings: false });
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('TOTAL DO PROJETO · COZINHA');
    expect(texts).toContain('R$ 1.500,00');
  });

  it('usa o mesmo orçamento comercial para projetos rápidos e só inclui desenhos concluídos', async () => {
    const quick = { ...item, projectName: 'Cozinha rápida', drawingData: { entryMode: 'QUICK', detailingStatus: 'PENDING' }, components: [{ id: 'top', label: 'Bancada', lengthMm: 2400, widthMm: 600, quantity: 1, billableArea: 1.44, edges: [] }] };
    const result = await render(1008, [quick], 'orcamento-rapido');
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('À VISTA');
    expect(texts).toContain('CARTÃO');
    expect(texts).not.toContain('ORDEM DE SERVIÇO');
    expect(result.pages).toBe(0);
    const detailed = { ...quick, projectName: 'Banheiro detalhado', drawingData: { entryMode: 'DETAILED', detailingStatus: 'COMPLETED' } };
    const mixed = await render(2016, [quick, detailed]);
    const start = mixed.calls.findIndex(([text]) => text === 'ORDEM DE SERVIÇO');
    expect(start).toBeGreaterThan(0);
    expect(mixed.calls.slice(start).some(([text]) => text.includes('Cozinha rápida'))).toBe(false);
    expect(mixed.calls.slice(start).some(([text]) => text.includes('Banheiro detalhado'))).toBe(true);
  });
  it('mantém o nome da pedra em uma única linha no comercial e nos desenhos', async () => {
    const component = { id: 'top', label: 'Bancada', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, edges: [] };
    const result = await render(1000, [{ ...item, materialNameSnapshot: 'Verde\nUbatuba', components: [component] }], undefined, undefined, { individualPrices: false, drawings: true });
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('VERDE UBATUBA');
    expect(texts).toContain('1. Verde Ubatuba');
    expect(texts.filter(text => text.includes('VERDE') || text.includes('Verde')).every(text => !text.includes('\n'))).toBe(true);
  });
  it('desenha o peitoril duplo com as medidas reais das duas pedras', async () => {
    const component = { id: 'sill', label: 'Peitoril', componentType: 'SILL', lengthMm: 1040, widthMm: 140, quantity: 1, billableArea: 0.1456, edges: [] };
    const result = await render(1000, [{ ...item, drawingData: { componentDetails: [{ sillTopWidthMm: 50, sillBottomWidthMm: 110, sillOverlapMm: 20, sillFinalWidthMm: 140 }] }, components: [component] }], 'peitoril-duplo', undefined, { individualPrices: false, drawings: true });
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('104,0 × 5,0 cm');
    expect(texts).toContain('104,0 × 11,0 cm');
    expect(texts).toContain('Largura final: 14,0 cm · encaixe: 2,0 cm');
    expect(result.rectangles.some(([x, y, width, height]) => Number(x) > 36 && Number(y) > 200 && Number(width) > 90 && Number(height) > 10)).toBe(true);
  });
  it.each([
    { individualPrices: false, drawings: false }, { individualPrices: false, drawings: true },
    { individualPrices: true, drawings: false }, { individualPrices: true, drawings: true },
  ])('gera as opções %j', async options => {
    const component = { id: 'top', label: 'Balcão', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, subtotal: 1000, appliedTotal: 1160, edges: ['FRONT', 'LEFT', 'RIGHT'].map(side => ({ side, serviceNameSnapshot: 'Acabamento 45°', lengthMm: side === 'FRONT' ? 2000 : 600, billedQuantity: side === 'FRONT' ? 2 : .6, billingUnitSnapshot: 'LINEAR_METER', appliedSubtotal: side === 'FRONT' ? 100 : 30 })) };
    const result = await render(1060, [{ ...item, billedQuantity: 1.2, components: [component] }], `opcoes-${options.individualPrices}-${options.drawings}`, 'Conferir medidas antes de produzir.', options);
    const texts = result.calls.map(([text]) => text);
    expect(texts.filter(text => text === 'ACABAMENTO 45°')).toHaveLength(1);
    expect(texts).toContain('3,20 ml');
    expect(texts).not.toContain('ACABAMENTOS E SERVIÇOS POR METRO LINEAR · TOTAL DO ORÇAMENTO');
    expect(texts.includes('VALOR TOTAL')).toBe(options.individualPrices);
    expect(texts.includes('R$ 160,00')).toBe(options.individualPrices);
    expect(texts.includes('DESCONTO FINAL')).toBe(true);
    expect(texts.includes('ORDEM DE SERVIÇO')).toBe(options.drawings);
    expect(texts.some(text => text.includes('Acabamento 45° no lado Inferior'))).toBe(options.drawings);
    expect(texts.some(text => text.includes('Conferir medidas antes de produzir.'))).toBe(true);
    expect(texts).toContain('R$ 1.060,00');
    expect(texts).toContain('R$ 1.166,00');
    expect(result.pages + 1).toBe(options.drawings ? 2 : 1);
  });
});

describe('Precisão e medidas das saias no desenho PDF', () => {
  it('agrupa saias e serviços montados do mesmo componente em uma única linha', () => {
    const result = montarLinhasPdf([{ components: [{ label: 'Principal', lengthMm: 700, widthMm: 320, quantity: 1, billableArea: .224, subtotal: 156.8, edges: [
      { side: 'FRONT', serviceNameSnapshot: 'Saia', billedQuantity: .21, appliedSubtotal: 147, billingUnitSnapshot: 'SQUARE_METER' },
      { side: 'RIGHT', serviceNameSnapshot: 'Saia', billedQuantity: .096, appliedSubtotal: 67.2, billingUnitSnapshot: 'SQUARE_METER' },
    ] }] }]);
    const skirts = result.items[0].filter(line => line.description === 'Saia - Inferior / Direito');
    expect(skirts).toHaveLength(1);
    expect(skirts[0]).toMatchObject({ measure: .306, total: 214.2, unit: 'm²' });
  });
  it('mantém a cuba e o furo na mesma escala da pedra, sem tamanho mínimo artificial', async () => {
    const component = { id: 'top', label: 'Bancada', lengthMm: 1200, widthMm: 600, quantity: 1, edges: [] };
    const result = await render(180, [{ ...item, components: [component], cutouts: [
      { componentId: 'top', cutoutType: 'SINK', lengthMm: 400, widthMm: 300, quantity: 1 },
      { componentId: 'top', cutoutType: 'FAUCET_HOLE', diameterMm: 35, lengthMm: 200, widthMm: 200, quantity: 1 },
      { componentId: 'top', cutoutType: 'SINK', sizePending: true, quantity: 1 },
    ] }], 'cuba-proporcional');
    const hole = result.ellipses[0];
    expect(hole[2]).toBeCloseTo(Number(hole[3]));
    expect(Number(hole[2])).toBeLessThan(5);
    const sink = result.rectangles.find(([, , w, h]) => Math.abs(w / h - 4 / 3) < .001)!;
    expect(sink).toBeDefined();
    expect(sink[2] / (Number(hole[2]) * 2)).toBeCloseTo(400 / 35);
    expect(result.calls.some(([text]) => text.includes('Medidas a definir com o cliente'))).toBe(true);
  });
  it('desenha a cuba oval como elipse na OS e identifica o formato na descrição', async () => {
    const component = { id: 'top', label: 'Balcão', componentType: 'TOP', lengthMm: 1300, widthMm: 500, quantity: 1, billableArea: .65, edges: [] };
    const result = await render(180, [{ ...item, components: [component], cutouts: [{ componentId: 'top', cutoutType: 'OVAL_SINK', lengthMm: 560, widthMm: 340, quantity: 1 }] }], 'os-cuba-oval');
    expect(result.ellipses).toHaveLength(1);
    expect(result.ellipses[0][2]).toBeGreaterThan(Number(result.ellipses[0][3]));
    expect(result.calls.some(([text]) => text.includes('Recorte para cuba oval'))).toBe(true);
  });
  it.each([500, 75])('separa 45° das medidas de saia numa peça de largura %s mm', async (widthMm) => {
    const component = { id: 'top', label: 'Tampo', lengthMm: 1200, widthMm, quantity: 1, billableArea: 1200 * widthMm / 1_000_000, edges: ['LEFT', 'RIGHT', 'FRONT'].flatMap((side) => {
      const lengthMm = side === 'FRONT' ? 1200 : widthMm;
      return [
        { side, lengthMm, serviceNameSnapshot: 'Saia', heightMm: 75, billedQuantity: lengthMm * 75 / 1_000_000, billingUnitSnapshot: 'SQUARE_METER' },
        { side, lengthMm, serviceNameSnapshot: 'Acabamento 45°', billedQuantity: lengthMm / 1000, billingUnitSnapshot: 'LINEAR_METER' },
      ];
    }) };
    const result = await render(1440, [{ ...item, components: [component] }], `os-cotas-${widthMm}`);
    const start = result.calls.findIndex(([text]) => text === 'ORDEM DE SERVIÇO');
    const drawing = result.calls.slice(start);
    expect(drawing.some(([text]) => text === '0,08 m')).toBe(false);
    expect(drawing.filter(([text]) => text === '45°')).toHaveLength(3);
    const labels = drawing.filter(([text, , y]) => text === '7,5 cm' && Number(y) > 0);
    expect(labels).toHaveLength(3);
    // The technical piece is the first non-header rectangle after the commercial page.
    const shape = result.rectangles.find(([x, , width]) => x > 36 && width < 200)!;
    expect(labels[0][2]).toBeLessThan(shape[1]);
    expect(labels[1][2]).toBeLessThan(shape[1]);
    if (widthMm === 75) expect(drawing.some(([text, , y]) => text === '7,5 cm' && y === -5)).toBe(true);
  });
});

describe('Paginação final da ordem de serviço', () => {
  it('mantém a observação com as três peças de 70 cm do ORC-2026-20', async () => {
    const components = [30, 5, 2].map((quantity, index) => ({ id: `walkway-${index}`, label: ['Calçada', 'calçada 3,30', 'calçada 2,70'][index], componentType: index === 1 ? 'OTHER' : 'TOP', orientation: index === 1 ? 'VERTICAL' : 'HORIZONTAL', lengthMm: 700, widthMm: 700, quantity, billableArea: .49 * quantity, edges: [] }));
    const result = await render(10878, [{ ...item, projectName: 'Calçada 10,25', materialNameSnapshot: 'Cinza Corumbazinho', components }], 'observacao-calcada', 'Pagamento em dinheiro, metade no inicio da obra, metade no fim');
    expect(result.pages + 1).toBe(2);
    const lastHeader = result.calls.map(([text]) => text).lastIndexOf('ORDEM DE SERVIÇO');
    const lastPage = result.calls.slice(lastHeader);
    expect(lastPage.some(([text]) => text === '3. calçada 2,70')).toBe(true);
    expect(lastPage.some(([text]) => text.includes('Pagamento em dinheiro'))).toBe(true);
    const lastPieceY = Number(lastPage.find(([text]) => text.startsWith('Peça:') && text.includes('0,98'))?.[2]);
    const observationY = Number(lastPage.find(([text]) => text.startsWith('Observação:'))?.[2]);
    expect(observationY).toBeGreaterThanOrEqual(lastPieceY + 12);
    expect(observationY + 14).toBeLessThanOrEqual(700);
  });
  const piece = (label: string, lengthMm: number, widthMm: number, componentType = 'BACKSPLASH', edges: any[] = []) => ({ id: label, label, componentType, orientation: componentType === 'BACKSPLASH' ? 'VERTICAL' : 'HORIZONTAL', lengthMm, widthMm, quantity: 1, billableArea: lengthMm * widthMm / 1_000_000, edges });
  const edge = (side: string, serviceNameSnapshot: string, lengthMm: number, heightMm?: number) => ({ side, serviceNameSnapshot, lengthMm, heightMm, billedQuantity: heightMm ? lengthMm * heightMm / 1_000_000 : lengthMm / 1000, billingUnitSnapshot: heightMm ? 'SQUARE_METER' : 'LINEAR_METER' });
  const items = [
    { ...item, materialNameSnapshot: 'Branco Itaúna', drawingData: { componentDetails: [{}, { parentComponentIndex: 0 }] }, components: [
      piece('Balcao', 1200, 500, 'OTHER', ['RIGHT', 'LEFT', 'FRONT'].flatMap((side) => [edge(side, 'Vista', side === 'FRONT' ? 1200 : 500, 50), edge(side, 'Acabamento 45°', side === 'FRONT' ? 1200 : 500)])),
      piece('Rodabanca', 1200, 80),
    ], cutouts: [{ componentId: 'Balcao', cutoutType: 'SINK', quantity: 1, positionX: 300, serviceNameSnapshot: 'Furo de Cuba' }], services: [{ serviceNameSnapshot: 'Instalação/Montagem', billingUnitSnapshot: 'FIXED' }] },
    { ...item, materialNameSnapshot: 'Preto São Gabriel', drawingData: { componentDetails: [{}, { parentComponentIndex: 0 }, { parentComponentIndex: 0 }] }, components: [
      piece('Balcão', 750, 620, 'OTHER', [edge('FRONT', 'Saia', 750, 50), edge('FRONT', 'Acabamento 45°', 750)]),
      piece('rodabanca 1', 750, 75), piece('rodabanca 2', 620, 75),
    ], services: [{ serviceNameSnapshot: 'Instalação/Montagem', billingUnitSnapshot: 'FIXED' }] },
  ];
  it('mantém a legenda na terceira folha quando todos os detalhes já couberam', async () => {
    const result = await render(1440, items, 'os-sem-folha-extra');
    expect(result.pages + 1).toBe(3);
    const lastHeader = result.calls.map(([text]) => text).lastIndexOf('ORDEM DE SERVIÇO');
    const lastPage = result.calls.slice(lastHeader);
    expect(lastPage.some(([text]) => text === '3. rodabanca 2')).toBe(true);
    expect(lastPage.some(([text]) => text === 'Serviço: Instalação/Montagem')).toBe(true);
    expect(lastPage.some(([text, , y]) => text.startsWith('Desenho ilustrativo') && y === 706)).toBe(true);
    expect(lastPage.some(([text]) => text === 'Assinatura do cliente')).toBe(false);
    expect(lastPage.filter(([text]) => text.startsWith('Serviço:')).every(([, , y]) => Number(y) + 12 <= 700)).toBe(true);
  });
  it('ainda abre páginas quando há observações reais e não corta nenhuma instrução', async () => {
    const notes = Array.from({ length: 70 }, (_, index) => `Instrução ${index + 1}: conferir medida.`).join('\n');
    const result = await render(1440, items, undefined, notes);
    expect(result.pages + 1).toBeGreaterThan(3);
    for (let index = 1; index <= 70; index++) expect(result.calls.some(([text]) => text === `Instrução ${index}: conferir medida.`)).toBe(true);
    const lastHeader = result.calls.map(([text]) => text).lastIndexOf('ORDEM DE SERVIÇO');
    expect(result.calls.slice(lastHeader).some(([text]) => text === 'Instrução 70: conferir medida.')).toBe(true);
    expect(result.calls.at(-1)?.[0]).toBe('Desenho ilustrativo, sem escala · X vermelho = acabamento simples · Área tracejada = recorte');
  });
  it('não cria uma página adicional para uma observação curta', async () => {
    const items = Array.from({ length: 7 }, () => item);
    const withoutNote = await render(1440, items);
    const withNote = await render(1440, items, undefined, 'Pagamento em dinheiro, metade no início da obra, metade no fim.');
    expect(withNote.pages).toBe(withoutNote.pages);
    expect(withNote.calls.some(([text]) => text.includes('Observação: Pagamento em dinheiro'))).toBe(true);
  });
});

describe('Condição de pagamento Pix no PDF', () => {
  it.each([[1440, 'R$ 1.584,00'], [100.10, 'R$ 110,11'], [0, 'R$ 0,00']])('mostra o cartão com 10%% sobre o valor à vista de %s sem alterar o orçamento', async (total, expected) => {
    const result = await render(total);
    const normalIndex = result.calls.findIndex(([text]) => text === 'À VISTA');
    const pixIndex = result.calls.findIndex(([text]) => text === 'CARTÃO');
    expect(pixIndex).toBeGreaterThan(normalIndex);
    expect(result.calls[pixIndex + 1][0].replaceAll('\u00a0', ' ')).toBe(expected);
    expect(result.calls.some(([text]) => text.includes('50% do valor deve ser pago antecipadamente para iniciar o trabalho.'))).toBe(true);
    expect(result.calls[pixIndex][2]).toBe(Number(result.calls[normalIndex][2]) + 19);
    expect(result.calls.filter(([text]) => text === 'CARTÃO')).toHaveLength(1);
    expect(result.quote.netTotal).toBe(total);
    expect(result.quote.discountAmount).toBe(100);
  });
  it('reserva espaço para os dois totais e assinaturas ao terminar uma página cheia', async () => {
    const result = await render(1440, Array.from({ length: 7 }, () => item));
    const normal = result.calls.find(([text]) => text === 'À VISTA')!;
    const pix = result.calls.find(([text]) => text === 'CARTÃO')!;
    expect(normal[2]).toBeGreaterThan(120);
    expect(pix[2]).toBeCloseTo(Number(normal[2]) + 19, 5);
    expect(result.pages).toBeGreaterThanOrEqual(2);
  });
});
