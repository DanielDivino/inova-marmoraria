import { describe, expect, it, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { renderizarPdfOrcamento, renderizarExportacao } from './quote.pdf.js';
import { montarLinhasPdf } from './quote.pdf-lines.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { QuotePdfOptions } from './quote.pdf-options.js';

const item = { materialNameSnapshot: 'Branco Dallas', productType: { name: 'Bancada' }, billedQuantity: 1, services: [], components: [], cutouts: [] };
async function render(netTotal: number, items: any[] = [item], artifact?: string, notes?: string, options?: Pick<QuotePdfOptions, 'individualPrices' | 'drawings'>, details?: { customerNameSnapshot?: string; dueDate?: string; deliveryDeadline?: string | null }) {
  const quote = { number: 'TESTE-PIX', customerNameSnapshot: 'Cliente', netTotal, grossTotal: 2000, discountAmount: 100, items, notes, ...details };
  const pdf = new PDFDocument({ margin: 36 });
  const printed = vi.spyOn(pdf, 'text');
  // Observe actual rendered lines, not just the text passed to PDFKit.
  const fragments = vi.spyOn(pdf as any, '_fragment');
  const pages = vi.spyOn(pdf, 'addPage');
  const rectangles = vi.spyOn(pdf, 'rect');
  const ellipses = vi.spyOn(pdf, 'ellipse');
  const arredondados = vi.spyOn(pdf, 'roundedRect');
  const chunks: Buffer[] = [];
  const buffer = new Promise<void>((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.on('end', resolve); pdf.on('error', reject); });
  renderizarPdfOrcamento(pdf, quote, options);
  pdf.end();
  await buffer;
  if (artifact) { mkdirSync('.test-artifacts/pdf', { recursive: true }); writeFileSync(`.test-artifacts/pdf/${artifact}.pdf`, Buffer.concat(chunks)); }
  // PDFKit's last overload omits coordinates, but these calls use text(text, x, y, options).
  return { quote, fragments: fragments.mock.calls as [string, number, number][], calls: printed.mock.calls as unknown as [string, number?, number?, unknown?][], pages: pages.mock.calls.length, rectangles: rectangles.mock.calls, arredondados: arredondados.mock.calls, ellipses: ellipses.mock.calls };
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

  it('a ordem de serviço sai para todo projeto, com as peças do Orçamento Rápido (sem "desenho pendente")', async () => {
    const quick = { ...item, projectName: 'Cozinha rápida', drawingData: { entryMode: 'QUICK', detailingStatus: 'PENDING' }, components: [{ id: 'top', label: 'Bancada', lengthMm: 2400, widthMm: 600, quantity: 1, billableArea: 1.44, edges: [] }] };
    const result = await render(1008, [quick], 'orcamento-rapido');
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('VALOR DO ORÇAMENTO À VISTA');
    expect(texts).toContain('VALOR DO ORÇAMENTO TOTAL NO CARTÃO');
    const start = result.calls.findIndex(([text]) => text === 'OS');
    expect(start).toBeGreaterThan(0);
    expect(result.calls.slice(start).some(([text]) => text.includes('Cozinha rápida'))).toBe(true);
  });
  it.each(['Verde Ubatuba', 'Verde\nUbatuba'])('mantém %s em uma linha efetivamente renderizada no comercial e nos desenhos', async (materialNameSnapshot) => {
    const component = { id: 'top', label: 'Bancada', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, edges: [] };
    const result = await render(1000, [{ ...item, materialNameSnapshot, components: [component] }], 'nome-material-verde', undefined, { individualPrices: false, drawings: true });
    const texts = result.calls.map(([text]) => text);
    expect(texts).toContain('VERDE UBATUBA');
    expect(texts).toContain('1. Verde Ubatuba / 1 peça');
    expect(texts.filter(text => text.includes('VERDE') || text.includes('Verde')).every(text => !text.includes('\n'))).toBe(true);
    const materialLines = result.fragments.filter(([text]) => /VERDE|UBATUBA/.test(text));
    expect(materialLines).toHaveLength(1);
    expect(materialLines[0][0]).toBe('VERDE UBATUBA');
    expect(materialLines[0][2]).toBe(result.fragments.find(([text]) => text === 'MATERIAL: ')?.[2]);
  });
  it('mantém o perfil pequeno ao lado de cada peitoril, com as quatro medidas', async () => {
    const component = { id: 'sill', label: 'Peitoril', componentType: 'SILL', lengthMm: 1040, widthMm: 140, quantity: 1, billableArea: 0.1456, edges: [] };
    const detail = { sillTopWidthMm: 50, sillBottomWidthMm: 110, sillOverlapMm: 20, sillFinalWidthMm: 140 };
    const result = await render(1000, [{ ...item, materialNameSnapshot: 'Verde Ubatuba', drawingData: { componentDetails: [detail, detail] }, components: [component, { ...component, id: 'sill-2' }] }], 'peitoril-duplo', undefined, { individualPrices: false, drawings: true });
    const texts = result.calls.map(([text]) => text);
    for (const label of ['0,14 m', '5 cm', '11 cm', '2 cm', '14 cm total']) expect(texts.filter(text => text === label)).toHaveLength(2);
    expect(texts).not.toContain('Detalhe do peitoril — duas pedras');
    expect(texts).not.toContain('104,0 × 5,0 cm');
    const main = result.rectangles.filter(([, , width]) => Math.abs(width - 120) < 0.01);
    const profiles = result.rectangles.filter(([, , width]) => Math.abs(width - 42) < 0.01);
    expect(main).toHaveLength(2);
    expect(profiles).toHaveLength(2);
    profiles.forEach(([x, y, width], index) => {
      const [mainX, mainY, mainWidth, mainHeight] = main[index];
      expect(x).toBeGreaterThan(mainX + mainWidth);
      expect(width).toBeLessThan(mainWidth / 2);
      expect(Math.abs(y - (mainY + mainHeight / 2))).toBeLessThan(20);
      expect(x + width).toBeLessThan(36 + index * 263 + 250);
    });
    expect(result.pages + 1).toBe(2);
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
    expect(texts.includes('DESCONTO CONCEDIDO')).toBe(true);
    expect(texts.includes('OS')).toBe(options.drawings);
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
    const start = result.calls.findIndex(([text]) => text === 'OS');
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
  it.each([
    ['2026-10-20T00:00:00.000Z', '2026-10-15T00:00:00.000Z', '20/10/2026'],
    ['2026-10-22T00:00:00.000Z', '2026-10-15T00:00:00.000Z', '22/10/2026'],
    [null, '2026-10-15T00:00:00.000Z', '15/10/2026'],
    [null, undefined, 'A definir'],
  ])('prioriza a data acordada %s sobre o prazo automático %s', async (deliveryDeadline, dueDate, expected) => {
    const components = [{ id: 'top', label: 'Tampo', lengthMm: 1040, widthMm: 140, quantity: 1, edges: [] }];
    const result = await render(1000, [{ ...item, components }], deliveryDeadline?.startsWith('2026-10-22') ? 'os-data-acordada' : undefined, undefined, undefined, { deliveryDeadline, dueDate });
    const start = result.calls.findIndex(([text]) => text === 'OS');
    const headerDate = result.calls.slice(start).find(([, x, y]) => x === 36 && y === 52);
    expect(headerDate?.[0]).toBe(expected);
    const commercialDate = result.calls.find(([text]) => text.startsWith('PRAZO DE EXECUÇÃO:'));
    expect(commercialDate?.[0]).toContain(`ENTREGA: ${expected}`);
  });
  it.each(['Cliente Inova', 'Maria Aparecida de Oliveira dos Santos e Silva'])('identifica todas as folhas de desenhos sem invadir as colunas: %s', async (customer) => {
    const components = Array.from({ length: 10 }, (_, index) => ({ id: `piece-${index}`, label: `Peça ${index + 1}`, componentType: 'TOP', lengthMm: 1200, widthMm: 600, quantity: 1, billableArea: .72, edges: [] }));
    const result = await render(1000, [{ ...item, components }], customer === 'Cliente Inova' ? 'os-cabecalho-compacto' : 'os-cliente-longo', undefined, undefined, { customerNameSnapshot: customer, dueDate: '2026-10-05T00:00:00.000Z' });
    const pages = result.calls.reduce<[string, number?, number?, unknown?][][]>((list, call) => {
      if (call[0] === 'OS') list.push([]);
      list.at(-1)?.push(call);
      return list;
    }, []);
    expect(pages.length).toBeGreaterThan(1);
    expect(result.calls.filter(([text]) => text === 'INOVA MARMORARIA')).toHaveLength(1);
    for (const page of pages) {
      expect(page.find(([text]) => text === 'OS')?.[1]).toBeGreaterThan(440);
      expect(page.find(([text]) => text === 'DATA DE ENTREGA')?.[1]).toBe(36);
      expect(page.some(([text]) => text === '05/10/2026')).toBe(true);
      const name = page.find(([text]) => text === customer)!;
      expect(name[1]).toBe(156);
      expect(name[3]).toMatchObject({ width: 283, align: 'center' });
      expect(page.some(([text]) => /PEDIDO |ENDEREÇO:|CNPJ:/.test(text))).toBe(false);
    }
    const shapes = result.rectangles.filter(([x, , width]) => x > 36 && width === 170);
    expect(shapes).toHaveLength(10);
    for (const [x, y, width, height] of shapes) {
      expect(x + width).toBeLessThanOrEqual(559);
      expect(y).toBeGreaterThan(84);
      expect(y + height).toBeLessThan(700);
    }
    expect(shapes[0][1]).toBeLessThan(200);
    for (let i = 1; i <= 10; i++) expect(result.calls.some(([text]) => text === `${i}. Peça ${i}`)).toBe(true);
  });
  it('mantém a observação com as três peças de 70 cm do ORC-2026-20', async () => {
    const components = [30, 5, 2].map((quantity, index) => ({ id: `walkway-${index}`, label: ['Calçada', 'calçada 3,30', 'calçada 2,70'][index], componentType: index === 1 ? 'OTHER' : 'TOP', orientation: index === 1 ? 'VERTICAL' : 'HORIZONTAL', lengthMm: 700, widthMm: 700, quantity, billableArea: .49 * quantity, edges: [] }));
    const result = await render(10878, [{ ...item, projectName: 'Calçada 10,25', materialNameSnapshot: 'Cinza Corumbazinho', components }], 'observacao-calcada', 'Pagamento em dinheiro, metade no inicio da obra, metade no fim');
    expect(result.pages + 1).toBe(2);
    const lastHeader = result.calls.map(([text]) => text).lastIndexOf('OS');
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
    const lastHeader = result.calls.map(([text]) => text).lastIndexOf('OS');
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
    const lastHeader = result.calls.map(([text]) => text).lastIndexOf('OS');
    expect(result.calls.slice(lastHeader).some(([text]) => text === 'Instrução 70: conferir medida.')).toBe(true);
    expect(result.calls.at(-1)?.[0]).toBe('Desenho ilustrativo, sem escala · X vermelho = acabamento simples · Área tracejada = recorte');
  });
  it('não cria uma página adicional para uma observação curta', async () => {
    const items = Array.from({ length: 7 }, () => item);
    const withoutNote = await render(1440, items);
    const withNote = await render(1440, items, undefined, 'Pagamento em dinheiro, metade no início da obra, metade no fim.');
    expect(withNote.pages).toBe(withoutNote.pages);
    expect(withNote.calls.some(([text]) => text === 'Pagamento em dinheiro, metade no início da obra, metade no fim.')).toBe(true);
  });
});

describe('Valores do orçamento no PDF', () => {
  it.each([[1440, 'R$ 1.584,00', 'R$ 1.440,00'], [100.10, 'R$ 110,11', 'R$ 100,10'], [0, 'R$ 0,00', 'R$ 0,00']])('à vista de %s: o total (no cartão, 10%% a mais) em cima e, embaixo e maior, o valor à vista', async (total, cartao, aVista) => {
    const result = await render(total);
    const totalIndex = result.calls.findIndex(([text]) => text === 'VALOR DO ORÇAMENTO TOTAL NO CARTÃO');
    const vistaIndex = result.calls.findIndex(([text]) => text === 'VALOR DO ORÇAMENTO À VISTA');
    expect(vistaIndex).toBeGreaterThan(totalIndex);
    expect(result.calls[totalIndex + 1][0].replaceAll('\u00a0', ' ')).toBe(cartao);
    expect(result.calls[vistaIndex + 1][0].replaceAll('\u00a0', ' ')).toBe(aVista);
    expect(Number(result.calls[vistaIndex][2])).toBeGreaterThan(Number(result.calls[totalIndex][2]));
    expect(result.calls.some(([text]) => text === 'À vista: 50% do valor antecipado para o início do trabalho.')).toBe(true);
    expect(result.calls.filter(([text]) => text === 'VALOR DO ORÇAMENTO TOTAL NO CARTÃO')).toHaveLength(1);
    expect(result.quote.netTotal).toBe(total);
    expect(result.quote.discountAmount).toBe(100);
  });
  it('reserva espaço para os valores e as assinaturas ao terminar uma página cheia', async () => {
    const result = await render(1440, Array.from({ length: 7 }, () => item));
    const total = result.calls.find(([text]) => text === 'VALOR DO ORÇAMENTO TOTAL NO CARTÃO')!;
    const vista = result.calls.find(([text]) => text === 'VALOR DO ORÇAMENTO À VISTA')!;
    expect(total[2]).toBeGreaterThan(52);
    expect(Number(vista[2])).toBeGreaterThan(Number(total[2]));
    expect(result.pages).toBeGreaterThanOrEqual(2);
  });
});

describe('Ordem de serviço de um projeto (Exportar do projeto, só a OS)', () => {
  const soOs = { orcamento: false, valoresIndividuais: false, ordemServico: true, tecnicos: new Map() };
  it('imprime só as folhas de OS do projeto escolhido, com o número da OS completa', async () => {
    const component = { id: 'top', label: 'Bancada', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, edges: [] };
    const items = [
      { ...item, id: 'cozinha', projectName: 'Cozinha', components: [component] },
      { ...item, id: 'banheiro', projectName: 'Banheiro', components: [component] },
    ];
    const pdf = new PDFDocument({ margin: 36 });
    const printed = vi.spyOn(pdf, 'text');
    const pages = vi.spyOn(pdf, 'addPage');
    const finished = new Promise<void>((resolve) => { pdf.on('data', () => undefined); pdf.on('end', resolve); });
    renderizarExportacao(pdf, { number: 'OS-1', customerNameSnapshot: 'Cliente', items }, soOs, 'banheiro');
    pdf.end();
    await finished;
    const texts = printed.mock.calls.map(([text]) => String(text));
    expect(texts).toContain('2. Banheiro');
    expect(texts.some((text) => text.includes('Cozinha'))).toBe(false);
    expect(texts).not.toContain('VALOR DO ORÇAMENTO À VISTA');
    // A primeira folha do documento já é a folha de desenho.
    expect(pages.mock.calls).toHaveLength(0);
  });
  it('não imprime o tipo de produto interno ("Bancada") em projeto que só tem soleira', async () => {
    const soleira = { id: 'soleira', label: '', componentType: 'THRESHOLD', lengthMm: 1250, widthMm: 150, quantity: 3, billableArea: .5625, edges: [] };
    for (const projectName of ['SOLEIRAS', '']) {
      const pdf = new PDFDocument({ margin: 36 });
      const printed = vi.spyOn(pdf, 'text');
      const finished = new Promise<void>((resolve) => { pdf.on('data', () => undefined); pdf.on('end', resolve); });
      renderizarExportacao(pdf, { number: 'SET-1', customerNameSnapshot: 'Cliente', items: [{ ...item, id: 'soleiras', projectName, components: [soleira] }] }, soOs, 'soleiras');
      pdf.end();
      await finished;
      const texts = printed.mock.calls.map(([text]) => String(text));
      expect(texts).toContain(projectName ? '1. SOLEIRAS' : '1. Soleira');
      expect(texts.some((text) => /bancada/i.test(text))).toBe(false);
    }
  });
});

describe('Cantos arredondados na folha de OS', () => {
  it('a peça sai com os cantos arredondados e a descrição diz o raio', async () => {
    const projeto = { ...item, projectName: 'Cozinha', drawingData: { componentDetails: [{ cornerRadiusMm: 100 }] },
      components: [{ id: 'top', label: 'Bancada', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, edges: [] }] };
    const result = await render(1000, [projeto], 'os-cantos-arredondados', undefined, { individualPrices: false, drawings: true });
    expect(result.arredondados).toHaveLength(1);
    const [, , largura, altura, raio] = result.arredondados[0] as number[];
    expect(raio).toBeCloseTo(largura * 100 / 2000, 1);
    expect(raio).toBeLessThan(altura / 2);
    expect(result.calls.map(([texto]) => texto)).toContain('Cantos: arredondados nas 4 pontas · raio 10 cm');
  });
});

describe('Condições e informações do orçamento no PDF', () => {
  const textos = (resultado: Awaited<ReturnType<typeof render>>) => resultado.calls.map(([texto]) => String(texto));
  it('todo PDF de orçamento traz as condições de pagamento e as informações importantes', async () => {
    const lista = textos(await render(1500, [item], 'orcamento-condicoes'));
    expect(lista).toEqual(expect.arrayContaining([
      'CONDIÇÕES DE PAGAMENTO', 'À vista: 50% do valor antecipado para o início do trabalho.', 'Cartão de crédito: pagamento no fechamento do orçamento, parcelado em até 6x sem juros.',
      'INFORMAÇÕES IMPORTANTES', 'As medidas serão conferidas no local da obra; por isso, a medição e os valores podem ser ajustados após essa conferência.',
      'Em bordas de piscina e escadas, a argamassa é fornecida pelo cliente.', 'Pedras naturais podem apresentar variação de tonalidade e veios.',
    ]));
    // Orçamento sem M² fechado (medidas exatas): não fala em múltiplos de 5 cm.
    expect(lista.some((texto) => texto.includes('múltiplos de 5 cm'))).toBe(false);
  });
  it('com M² fechado, explica que o metro quadrado é calculado em múltiplos de 5 cm', async () => {
    const lista = textos(await render(1500, [{ ...item, drawingData: { m2Fechado: true } }]));
    expect(lista).toContain('O metro quadrado é comercializado e calculado em múltiplos de 5 cm: as medidas de cada peça são arredondadas para cima no cálculo.');
  });
});

