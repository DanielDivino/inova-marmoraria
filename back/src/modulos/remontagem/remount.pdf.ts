import { calcularComponente, nomeExibicaoComponente, rotuloLadoBorda, type RemountDocument } from '@inova/domain';
import { cabecalhoEmpresaPdf, assinaturasPdf, pdfDate, pdfMoney } from '../orcamentos/pdf-layout.js';

type Customer = { number: string; customerNameSnapshot: string; customerPhoneSnapshot: string | null; workAddressSnapshot: string | null };
const meters = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dimensions = (length?: number | null, width?: number | null) => length && width ? `${meters(length)} × ${meters(width)} m` : '';

/** Entrega tem sua própria projeção sem valores: nunca reutiliza células comerciais. */
export function renderizarRemontagemPdf(pdf: PDFKit.PDFDocument, quote: Customer, document: RemountDocument, options: { delivery: boolean; individualPrices: boolean }) {
  const { delivery } = options;
  const priced = !delivery && options.individualPrices;
  const title = delivery ? 'NOTA DE ENTREGA E CONFERÊNCIA' : 'PROPOSTA DE DESMONTAGEM E REMONTAGEM';
  const number = delivery ? document.deliveryNumber : document.number;
  cabecalhoEmpresaPdf(pdf, title, { number });
  let y = 126;
  const space = (height: number) => {
    if (y + height <= 755) return;
    pdf.addPage(); y = 60;
    pdf.font('Helvetica-Bold').fontSize(9).fillColor('#17251f').text(`${number} · Continuação`, 36, 36);
  };
  const paragraph = (text: string, bold = false, size = 9, align: 'left' | 'center' = 'left') => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    // Quebra em blocos pequenos para notas extensas não escaparem do controle de páginas.
    const words = text.split(/\s+/);
    let line = '';
    for (const word of [...words, '']) {
      const candidate = line ? `${line} ${word}` : word;
      if ((!word || pdf.widthOfString(candidate) > 515) && line) {
        space(size + 9); pdf.fillColor('#17251f').text(line, 40, y, { width: 515, align }); y += size + 5; line = word;
      } else line = candidate;
    }
    y += 1;
  };
  paragraph(`Cliente: ${quote.customerNameSnapshot}`, true);
  paragraph(`Telefone: ${quote.customerPhoneSnapshot || 'Não informado'} · Orçamento: ${quote.number}`);
  paragraph(`Endereço: ${quote.workAddressSnapshot || 'Não informado'}`);
  paragraph(`Data: ${pdfDate(delivery ? new Date() : document.updatedAt)}`);
  paragraph(delivery ? 'Materiais e serviços para conferência no recebimento.' : 'Serviço de desmontagem e remontagem dos materiais descritos nesta proposta.', false, 9, 'center');

  const columns = delivery
    ? [{ label: 'Item', w: 27 }, { label: 'Descrição', w: 144 }, { label: 'Material', w: 123 }, { label: 'Medida', w: 104 }, { label: 'Qtd.', w: 45 }, { label: 'Conferido', w: 80 }]
    : [{ label: 'Descrição / material', w: priced ? 248 : 245 }, { label: 'Medida', w: 100 }, { label: 'Qtd.', w: 38 }, { label: 'm²', w: 55 }, ...(priced ? [{ label: 'Total', w: 82 }] : [{ label: '', w: 85 }])];
  const tableHeader = () => {
    space(25); pdf.fillColor('#d1cfcc').rect(36, y, 523, 21).fill();
    let x = 36; pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(8);
    for (const col of columns) { pdf.text(col.label, x + 4, y + 6, { width: col.w - 8 }); x += col.w; }
    y += 21;
  };
  tableHeader();
  let itemNumber = 0;
  const row = (description: string, material: string, measure: string, quantity: number | string, area: string, total?: number) => {
    const cells = delivery ? [String(++itemNumber), description, material, measure, String(quantity), '']
      : [`${description}${material ? `\n${material}` : ''}`, measure, String(quantity), area, ...(priced ? [total === undefined ? '' : pdfMoney(total)] : [''])];
    pdf.font('Helvetica').fontSize(8);
    const height = Math.max(28, ...cells.map((cell, index) => pdf.heightOfString(cell, { width: columns[index].w - 8 }) + 12));
    if (y + height > 755) { space(height + 21); tableHeader(); }
    pdf.font('Helvetica').fontSize(8).fillColor('#17251f');
    let x = 36;
    cells.forEach((cell, index) => { pdf.text(cell, x + 4, y + 6, { width: columns[index].w - 8 }); x += columns[index].w; });
    if (delivery) pdf.rect(508, y + 8, 10, 10).stroke('#8f887c');
    y += height;
    pdf.moveTo(36, y).lineTo(559, y).stroke('#dfd9cf');
  };
  for (const item of document.items) {
    for (const component of item.components) {
      const area = calcularComponente(component).billableArea;
      const note = document.itemNotes[component.id];
      row(`${nomeExibicaoComponente(component)}${item.projectName ? ` · ${item.projectName}` : ''}${note ? `\nObs.: ${note}` : ''}`, component.materialNameSnapshot ?? item.materialNameSnapshot,
        dimensions(component.lengthMm, component.widthMm), component.quantity, area.toLocaleString('pt-BR', { maximumFractionDigits: 4 }), Number(component.appliedTotal));
      for (const edge of component.edges) row(`${edge.serviceNameSnapshot} · ${rotuloLadoBorda(edge.side)}`, '', edge.heightMm ? dimensions(edge.lengthMm, edge.heightMm) : `${meters(edge.lengthMm)} m`, '', '');
      // O valor da peça acima já inclui as bordas: evita somá-las novamente.
    }
    for (const cut of item.cutouts) row(cut.serviceNameSnapshot || cut.label || 'Recorte / cuba', '', cut.sizePending ? 'A definir' : dimensions(cut.lengthMm, cut.widthMm) || (cut.diameterMm ? `Ø ${meters(cut.diameterMm)} m` : ''), cut.quantity, '', Number(cut.appliedSubtotal));
    for (const service of item.services) row(service.serviceNameSnapshot, '', '', Number(service.billedQuantity), '', Number(service.appliedSubtotal));
  }
  row('Montagem', '', '', 1, '', document.assembly);
  row('Desmontagem', '', '', 1, '', document.disassembly);
  y += 15;
  if (document.notes) { paragraph('Observações', true); paragraph(document.notes); }
  if (delivery) {
    space(280);
    paragraph('Observações de entrega', true);
    for (let i = 0; i < 4; i++) { y += 20; pdf.moveTo(40, y).lineTo(555, y).stroke('#b8b2a8'); }
    y += 14;
    paragraph('Declaro que recebi e conferi os materiais e/ou serviços descritos acima, estando ciente das informações registradas neste documento.');
    for (const label of ['Nome do cliente/recebedor:', 'CPF ou documento:', 'Data da entrega: ____ / ____ / ______', 'Assinatura do cliente/recebedor:']) {
      paragraph(label); pdf.moveTo(label.startsWith('Data') ? 320 : 210, y - 8).lineTo(555, y - 8).stroke('#8f887c'); y += 8;
    }
  } else {
    space(155);
    paragraph('Pagamento', true, 11);
    paragraph(`Cartão: ${pdfMoney(document.cardTotal)}`, true, 11);
    paragraph(`À vista: ${pdfMoney(document.pixTotal)}`, true, 11);
    paragraph(`Desconto à vista: ${pdfMoney(document.cashDiscount)}`);
    assinaturasPdf(pdf, 775);
  }
}
