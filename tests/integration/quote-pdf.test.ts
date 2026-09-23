import { describe, expect, it, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderizarPdfOrcamento } from '../../back/src/modulos/orcamentos/quote.pdf.js';

const sides = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];
const component = (edges: any[] = []) => ({ id: 'top', label: 'Tampo', lengthMm: 2000, widthMm: 600, quantity: 1, billableArea: 1.2, edges });
const edge = (side: string, name = 'Acabamento simples') => {
  const lengthMm = ['FRONT', 'BACK'].includes(side) ? 2000 : 600;
  const skirt = name === 'Saia';
  return { side, serviceNameSnapshot: name, lengthMm, heightMm: skirt ? 100 : null, billedQuantity: skirt ? lengthMm * 100 / 1_000_000 : lengthMm / 1000, billingUnitSnapshot: skirt ? 'SQUARE_METER' : 'LINEAR_METER' };
};
const quote = (components = [component()], notes: string | null = 'Conferir medidas no local.\nAlinhar os veios das peças.') => ({
  number: 'INO-2026-TESTE', customerNameSnapshot: 'Cliente de demonstração', customerPhoneSnapshot: '(92) 98800-2200', workAddressSnapshot: 'Manaus - AM',
  createdAt: '2026-09-14T12:00:00Z', validUntil: '2026-10-14T12:00:00Z', netTotal: 1440, notes,
  items: [{ projectName: 'Bancada da cozinha', materialNameSnapshot: 'Verde Ubatuba', productType: { name: 'Bancada' }, billedQuantity: 2.4, services: [], components, cutouts: [] }],
});

async function render(input: ReturnType<typeof quote>, artifact?: string) {
  const pdf = new PDFDocument({ margin: 36 });
  const strokes = vi.spyOn(pdf, 'strokeColor');
  const printed = vi.spyOn(pdf, 'text');
  const rectangles = vi.spyOn(pdf, 'rect');
  const paths = vi.spyOn(pdf, 'path');
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
  renderizarPdfOrcamento(pdf, input); pdf.end();
  const buffer = await done;
  if (artifact) { mkdirSync('.test-artifacts/pdf', { recursive: true }); writeFileSync(`.test-artifacts/pdf/${artifact}.pdf`, buffer); }
  const directory = mkdtempSync(join(tmpdir(), 'inova-pdf-test-'));
  const inputPath = join(directory, 'quote.pdf');
  let text: string;
  try {
    writeFileSync(inputPath, buffer);
    text = execFileSync('pdftotext', ['-layout', inputPath, '-'], { encoding: 'utf8', timeout: 10000 });
  } finally { unlinkSync(inputPath); rmdirSync(directory); }
  return { text, pages: text.split('\f').filter((page) => page.trim()), redMarkers: strokes.mock.calls.filter(([color]) => color === '#c9473c').length, printed: printed.mock.calls, rectangles: rectangles.mock.calls, paths: paths.mock.calls };
}

describe('Desenho e observações do PDF', () => {
  it('mostra comprimento e largura comerciais em metros com duas casas decimais', async () => {
    const result = await render(quote([{ ...component(), lengthMm: 1150, widthMm: 600 }]));
    expect(result.text).toContain('COMP. m');
    expect(result.text).toContain('LARG. m');
    expect(result.printed.some(([text]) => text === '1,15')).toBe(true);
    expect(result.printed.some(([text]) => text === '0,60')).toBe(true);
    expect(result.text).not.toContain('COMP. cm');
    expect(result.text).not.toContain('LARG. cm');
  });

  it('desenha vista e saia no mesmo lado e descreve suas medidas separadamente', async () => {
    const vista = { ...edge('FRONT', 'Vista'), heightMm: 50, billingUnitSnapshot: 'SQUARE_METER', billedQuantity: 0.1 };
    const result = await render(quote([component([vista, edge('FRONT', 'Saia'), edge('FRONT', 'Acabamento 45°')])]), 'os-vista');
    expect(result.text).toContain('Vista no lado Inferior');
    expect(result.text).toContain('largura 5 cm');
    expect(result.text).toContain('Saia no lado Inferior');
    expect(result.text).toContain('altura 10 cm');
    expect(result.text).toContain('Acabamento 45° no lado Inferior');
    const shapes = result.rectangles.filter((rect) => rect[2] === 170);
    expect(shapes).toHaveLength(3);
    expect(shapes[1][1]).toBeCloseTo(shapes[0][1] + shapes[0][3]);
    expect(shapes[2][1]).toBeCloseTo(shapes[1][1] + shapes[1][3]);
  });
  it('inclui uma marcação para cada lado com 45 graus', async () => {
    const input = quote([
      { ...component([edge('BACK', 'Acabamento 45°'), edge('LEFT', 'Acabamento 45°')]), id: 'first', label: 'Superior e Esquerdo' },
      { ...component([edge('FRONT', 'Acabamento 45°'), edge('RIGHT', 'Acabamento 45°')]), id: 'second', label: 'Inferior e Direito' },
    ], null);
    const result = await render(input, 'os-45-lados');
    expect(result.printed.filter(([text]) => text === '45°')).toHaveLength(4);
    expect(result.paths.filter(([path]) => path === 'M0 0 H20 V18 H12 V8 H0 Z M20 0 L12 8')).toHaveLength(4);
  });
  it('mostra a união e 45° sem metragem junto ao símbolo, preservando o comprimento na descrição', async () => {
    const input = quote([component([{ ...edge('FRONT', 'Acabamento 45°'), lengthMm: 1750, billedQuantity: 1.75 }, edge('FRONT', 'Saia')])], null);
    const result = await render(input, 'os-acabamento-45');
    const os = result.pages.slice(1).join('\n');
    expect(result.paths.some(([path]) => path === 'M0 0 H20 V18 H12 V8 H0 Z M20 0 L12 8')).toBe(true);
    expect(result.printed.filter(([text]) => text === '45°')).toHaveLength(1);
    expect(os).toContain('Acabamento 45° no lado Inferior - 1,75 m');
    expect(result.printed.filter(([text]) => text === '1,75 ml')).toHaveLength(1); // Only the commercial table, never the drawing.
    const without = await render(quote([component([edge('FRONT', 'Acabamento Meia Cana')])], null));
    expect(without.printed.filter(([text]) => text === '45°')).toHaveLength(0);
  });
  it('alinha cada descrição abaixo do desenho correspondente, em duas colunas', async () => {
    const pieces = [
      { ...component([{ ...edge('BACK'), lengthMm: 3000, billedQuantity: 3 }]), id: 'left', label: 'cozinha', lengthMm: 3000, widthMm: 50, billableArea: 0.15 },
      { ...component([{ ...edge('BACK'), lengthMm: 1000, billedQuantity: 1 }]), id: 'right', label: 'Componente', lengthMm: 1000, widthMm: 30, billableArea: 0.03 },
    ];
    const input = quote(pieces, null);
    input.items[0].materialNameSnapshot = 'Branco Dallas';
    const result = await render(input, 'os-descricoes-por-peca');
    const drawings = result.rectangles.filter((call) => call[2] === 170);
    expect(drawings).toHaveLength(2);
    drawings.forEach((call, index) => expect(call[3] / call[2]).toBeCloseTo(pieces[index].widthMm / pieces[index].lengthMm));
    expect(result.text).toContain('5 cm');
    expect(result.text).toContain('3 cm');
    const leftTitle = result.printed.find((call) => call[0] === '1. cozinha')!;
    const rightTitle = result.printed.find((call) => call[0] === '2. Componente')!;
    expect(leftTitle[1]).toBe(36);
    expect(rightTitle[1]).toBe(299);
    expect(leftTitle[2]).toBe(rightTitle[2]);
    const rightMaterial = result.printed.find((call) => call[0] === '2. Branco Dallas')!;
    expect(Number(rightTitle[2])).toBeGreaterThan(Number(rightMaterial[2]));
    expect(result.printed.find((call) => call[0] === 'Acabamento simples no lado Superior - 3 m')![1]).toBe(40);
    expect(result.printed.find((call) => call[0] === 'Acabamento simples no lado Superior - 1 m')![1]).toBe(303);
    expect(result.pages).toHaveLength(2);
  });
  it('continua uma descrição longa na sua coluna antes de desenhar a próxima dupla', async () => {
    const input: any = quote([
      { ...component(), id: 'left', label: 'Esquerda curta' },
      { ...component(), id: 'right', label: 'Direita longa' },
      { ...component(), id: 'next', label: 'Próxima peça' },
    ], null);
    input.items[0].cutouts = Array.from({ length: 45 }, (_, index) => ({ componentId: 'right', cutoutType: 'OTHER', label: `Corte ${index + 1}.`, quantity: 1, lengthMm: 100, widthMm: 50 }));
    const result = await render(input, 'os-coluna-longa');
    const continuation = result.printed.filter((call) => call[0] === '2. Direita longa (continuação)');
    expect(continuation.length).toBeGreaterThan(0);
    expect(continuation.every((call) => call[1] === 299)).toBe(true);
    for (let index = 1; index <= 45; index++) {
      const call = result.printed.find((entry) => String(entry[0]).includes(`Corte ${index}.`));
      expect(call?.[1]).toBe(303);
    }
    const lastCutout = result.printed.findIndex((entry) => String(entry[0]).includes('Corte 45.'));
    expect(result.printed.findIndex((entry) => entry[0] === '3. Verde Ubatuba')).toBeGreaterThan(lastCutout);
  });
  it('segue a referência da OS: material acima, descrição sutil e lados padronizados', async () => {
    const piece = { ...component(sides.map((side) => { const lengthMm = ['FRONT', 'BACK'].includes(side) ? 2530 : 120; return { ...edge(side, 'Acabamento Simples'), lengthMm, billedQuantity: lengthMm / 1000 }; })), label: 'PEDRA', componentType: 'OTHER', orientation: 'HORIZONTAL', lengthMm: 2530, widthMm: 120, billableArea: 0.3036 };
    const input = quote([piece], null);
    input.items[0].materialNameSnapshot = 'Cinza Corumbazinho';
    const result = await render(input, 'os-lados-padronizados');
    const os = result.pages.slice(1).join('\n');
    expect(os.match(/Cinza Corumbazinho/g)).toHaveLength(1);
    expect(os.match(/1\. PEDRA/g)).toHaveLength(1);
    expect(os.match(/0,30 m² total/g)).toHaveLength(1);
    expect(os).not.toContain('aplicações por peça');
    for (const [side, length] of [['Inferior', '2,53'], ['Superior', '2,53'], ['Esquerdo', '0,12'], ['Direito', '0,12']]) expect(os).toContain(`Acabamento Simples no lado ${side} - ${length} m`);
    expect(result.text).not.toMatch(/frontal|traseiro|inferior no desenho|superior no desenho|linear por aplicação|\b(?:FRONT|BACK|LEFT|RIGHT|up|down|left|right)\b/);
    const materialIndex = result.printed.findIndex((call) => call[0] === '1. Cinza Corumbazinho');
    const material = result.printed[materialIndex];
    const dimension = result.printed.slice(materialIndex + 1).find((call) => call[0] === '2,53 m')!;
    expect(Number(material[2])).toBeLessThan(Number(dimension[2]));
  });
  it('descreve 45 graus + saia, recorte, cuba, furação, área e serviços sem campos vazios', async () => {
    const input: any = quote([component([edge('FRONT', 'Acabamento 45°'), edge('FRONT', 'Saia')])], null);
    input.items[0].cutouts = [
      { componentId: 'top', cutoutType: 'SINK', lengthMm: 560, widthMm: 340, quantity: 1, serviceNameSnapshot: 'Cuba de embutir' },
      { componentId: 'top', cutoutType: 'FAUCET_HOLE', diameterMm: 35, quantity: 2, positionX: 0, positionY: 100 },
      { cutoutType: 'OTHER', label: 'Corte especial avulso', quantity: 1 },
    ];
    input.items[0].services = [{ serviceNameSnapshot: 'Polimento especial', billingUnitSnapshot: 'FIXED' }];
    const { text } = await render(input, 'fabricacao-completa');
    for (const expected of ['Acabamento 45° no lado Inferior', 'no lado Inferior - 2 m', 'Saia no lado Inferior', 'altura 10 cm', '56 × 34 cm', '0,1904 m²', 'Cuba de embutir', 'Furação:', 'diâmetro 3,5 cm', 'centro X: 0 cm', 'Corte especial avulso', 'Polimento especial']) expect(text).toContain(expected);
    expect(text).not.toContain('Observações do orçamento');
    expect(text).not.toContain('undefined');
  });
  it('pagina descrições extensas sem perder nenhum recorte', async () => {
    const input: any = quote();
    input.items[0].cutouts = Array.from({ length: 45 }, (_, index) => ({ componentId: 'top', cutoutType: 'OTHER', label: `Corte especial número ${index + 1}.`, lengthMm: 100, widthMm: 50, quantity: 1 }));
    const result = await render(input, 'fabricacao-longa');
    expect(result.pages.length).toBeGreaterThan(2);
    for (let index = 1; index <= 45; index++) expect(result.text).toContain(`Corte especial número ${index}.`);
    expect(result.text.match(/Assinatura do cliente/g)).toHaveLength(1);
    expect(result.printed.find(([text]) => text === 'Assinatura do cliente')?.[2]).toBe(740);
  });
  it.each(sides)('marca somente o acabamento simples em %s com X vermelho', async (side) => {
    expect((await render(quote([component([edge(side)])]))).redMarkers).toBe(1);
    expect((await render(quote([component([edge(side, 'Acabamento Meia Cana')])]))).redMarkers).toBe(0);
  });
  it('deixa bordas sem acabamento sem marcações', async () => {
    expect((await render(quote())).redMarkers).toBe(0);
  });
  it('mostra os dados da empresa, pedra acima de cada desenho, saias e observações', async () => {
    const pieces = sides.map((side, index) => ({ ...component([edge(side, 'Saia'), edge(sides[(index + 1) % 4])]), id: `piece-${index}`, label: `Tampo ${index + 1}` }));
    const result = await render(quote(pieces), 'orcamento-revisado');
    expect(result.redMarkers).toBe(4);
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    for (const page of result.pages.slice(0, 2)) {
      expect(page).toContain('Av. Visconde de Itiúba, Nº 224 - Flores - Manaus AM');
      expect(page).toContain('Contatos: (92) 98181-7980 / 93994-1402');
      expect(page).toContain('CNPJ: 32.298.601/0001-19');
    }
    const serviceOrder = result.pages.slice(1).join('\n');
    expect(serviceOrder.match(/Verde Ubatuba/g)).toHaveLength(4);
    expect(serviceOrder).toContain('comprimento 200 cm · altura 10 cm');
    expect(serviceOrder).toContain('comprimento 60 cm · altura 10 cm');
    expect(serviceOrder.indexOf('Observações do orçamento')).toBeGreaterThan(serviceOrder.indexOf('Tampo 4'));
    expect(serviceOrder).toContain('Conferir medidas no local.');
    expect(serviceOrder).toContain('Alinhar os veios das peças.');
  });
  it('continua observações longas em outra página sem perder texto ou assinatura', async () => {
    const notes = Array.from({ length: 70 }, (_, index) => `Instrução ${index + 1}: conferir medida.`).join('\n');
    const result = await render(quote([component()], notes), 'observacoes-longas');
    expect(result.pages.length).toBeGreaterThan(2);
    for (let index = 1; index <= 70; index++) expect(result.text).toContain(`Instrução ${index}: conferir medida.`);
    expect(result.text.match(/Assinatura do cliente/g)).toHaveLength(1);
    expect(result.printed.find(([text]) => text === 'Assinatura do cliente')?.[2]).toBe(740);
    expect(result.pages.at(-1)).not.toContain('CNPJ: 32.298.601/0001-19');
  });
  it('inclui detalhe do peitoril abaixo do desenho somente com as medidas preenchidas', async () => {
    const input: any = quote([{ ...component(), label: '' }, { ...component(), label: 'Peitoril sem medida' }]);
    input.items[0].components.forEach((entry: any) => { entry.componentType = 'SILL'; });
    input.items[0].drawingData = { componentDetails: [{ sillDetailMm: 125, sillDetailHeightMm: 45 }, {}] };
    const result = await render(input, 'peitoril');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1].match(/Detalhe do peitoril/g)).toHaveLength(3);
    expect(result.pages[1]).toContain('Medida horizontal: 12,5 cm');
    expect(result.pages[1]).toContain('4,5 cm');
    expect(result.text).not.toContain('________');
    expect(result.pages[1].indexOf('Detalhe do peitoril')).toBeGreaterThan(result.pages[1].indexOf('Verde Ubatuba'));
  });
  it('não inclui o detalhe de peitoril em uma soleira', async () => {
    const input: any = quote();
    input.items[0].components[0].componentType = 'THRESHOLD';
    input.items[0].components[0].label = '';
    const result = await render(input, 'soleira');
    expect(result.pages[1]).toContain('Soleira');
    expect(result.text).not.toContain('Detalhe do peitoril');
    expect(result.text).not.toContain('Medida horizontal:');
  });
});
