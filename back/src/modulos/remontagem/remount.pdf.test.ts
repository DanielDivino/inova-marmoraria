import { describe, it, expect, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { mkdirSync, writeFileSync } from 'node:fs';
import { calcularPagamentoRemontagem, type RemountDocument } from '@inova/domain';
import { renderizarRemontagemPdf } from './remount.pdf.js';

const quote = { number: 'ORC-00215', customerNameSnapshot: 'Cliente de demonstração', customerPhoneSnapshot: '(92) 98800-2200', workAddressSnapshot: 'Manaus - AM' };
const document: RemountDocument = {
  id: 'test', quoteId: 'quote', version: 1, number: 'REM-00215', deliveryNumber: 'ENT-00215', createdAt: '2026-09-23', updatedAt: '2026-09-23',
  assembly: 250, disassembly: 450, cardOverride: 5500, pixPercent: 5, notes: 'Conferir medidas no local e proteger o piso durante a montagem.', itemNotes: { stone: 'Peça de reposição.' },
  ...calcularPagamentoRemontagem({ itemTotals: [828], assembly: 250, disassembly: 450, cardOverride: 5500, pixPercent: 5 }),
  items: [{ id: 'item', projectName: 'Cozinha', productTypeId: 'type', materialId: 'material', materialNameSnapshot: 'Granito Preto São Gabriel', billingUnitSnapshot: 'SQUARE_METER', unitPriceSnapshot: 600, calculationMode: 'DIMENSIONS', quantity: 1, billedQuantity: 1.38, total: 828, materialSubtotal: 828, servicesSubtotal: 0, components: [{ id: 'stone', label: 'Bancada cozinha', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 1150, widthMm: 600, quantity: 2, sortOrder: 0, calculatedTotal: 828, appliedTotal: 828, hasManualPriceOverride: false, edges: [] }], services: [], cutouts: [] }],
};
async function render(delivery: boolean, individualPrices: boolean, data = document) {
  const pdf = new PDFDocument({ margin: 36, size: 'A4' });
  const printed = vi.spyOn(pdf, 'text');
  const pages = vi.spyOn(pdf, 'addPage');
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>(resolve => { pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); });
  renderizarRemontagemPdf(pdf, quote, data, { delivery, individualPrices }); pdf.end();
  const buffer = await done;
  mkdirSync('.test-artifacts/remontagem', { recursive: true });
  writeFileSync(`.test-artifacts/remontagem/${delivery ? 'entrega' : individualPrices ? 'detalhada' : 'total'}${data === document ? '' : '-longa'}.pdf`, buffer);
  return { text: printed.mock.calls.map(([text]) => text).join('\n'), pages: pages.mock.calls.length + 1 };
}
describe('Documentos de remontagem', () => {
  it('G: proposta detalhada contém valores individuais e pagamentos finais', async () => {
    const result = await render(false, true);
    for (const expected of ['INOVA MARMORARIA', 'PROPOSTA DE DESMONTAGEM E REMONTAGEM', '1,15 × 0,60 m', 'R$ 828,00', 'R$ 250,00', 'R$ 450,00', 'Cartão: R$ 5.500,00', 'À vista: R$ 1.528,00', 'Desconto à vista: R$ 3.972,00']) expect(result.text).toContain(expected);
    expect(result.text).not.toContain('Unitário'); expect(result.text).not.toContain('Subtotal:');
    expect(result.text).not.toContain('Acréscimo'); expect(result.pages).toBe(1);
  });
  it('H: somente total não expõe nenhum preço individual nem subtotal', async () => {
    const result = await render(false, false);
    for (const hidden of ['R$ 828,00', 'R$ 250,00', 'R$ 450,00', 'R$ 600,00', 'Subtotal:', 'Unitário']) expect(result.text).not.toContain(hidden);
    expect(result.text.match(/R\$/g)).toHaveLength(3);
    expect(result.text).toContain('Cartão: R$ 5.500,00'); expect(result.text).toContain('À vista: R$ 1.528,00'); expect(result.text).toContain('Desconto à vista: R$ 3.972,00');
  });
  it('I: entrega nunca mostra valores, mesmo com individualPrices=true', async () => {
    const result = await render(true, true);
    for (const expected of ['NOTA DE ENTREGA E CONFERÊNCIA', 'ENT-00215', 'Bancada cozinha', 'Granito Preto São Gabriel', '1,15 × 0,60 m', 'Conferido', 'Observações de entrega', 'Declaro que recebi', 'CPF ou documento:', 'Assinatura do cliente/recebedor:']) expect(result.text).toContain(expected);
    expect(result.text).not.toMatch(/R\$|Pix|Cartão|Subtotal|Unitário/); expect(result.pages).toBe(1);
  });
  it('pagina uma entrega extensa preservando todas as peças e o recebimento', async () => {
    const input = { ...document, items: Array.from({ length: 40 }, (_, index) => ({ ...document.items[0], projectName: `Projeto ${index + 1}` })) };
    const result = await render(true, false, input);
    expect(result.pages).toBeGreaterThan(2);
    for (let i = 1; i <= 40; i++) expect(result.text).toContain(`Projeto ${i}`);
    expect(result.text).toContain('Assinatura do cliente/recebedor:'); expect(result.text).not.toContain('R$');
  });
});
