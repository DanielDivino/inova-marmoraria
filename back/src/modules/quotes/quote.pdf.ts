import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type PdfDocument = InstanceType<typeof PDFDocument>;

const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: number, digits = 2) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const date = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não definida';
const cm = (value: number) => number(value / 10, 1);
const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/inova-logo.png');
const line = (pdf: PdfDocument, y: number) => pdf.moveTo(36, y).lineTo(559, y).stroke('#b8b2a8');
const header = (pdf: PdfDocument, title: string, quote: any) => {
  pdf.fillColor('#b6811e').rect(36, 34, 523, 5).fill();
  if (fs.existsSync(logoPath)) pdf.image(logoPath, 36, 45, { fit: [48, 31] });
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(14).text('INOVA MARMORARIA', 91, 47);
  pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52').text('Mármores, granitos e superfícies especiais', 91, 65);
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(13).text(title, 350, 49, { width: 209, align: 'right' });
  pdf.font('Helvetica-Bold').fontSize(9).fillColor('#b6811e').text(quote.number, 350, 67, { width: 209, align: 'right' });
  line(pdf, 82);
};
const tableHeader = (pdf: PdfDocument, y: number) => {
  pdf.fillColor('#d1cfcc').rect(36, y, 523, 17).fill();
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(7);
  [['NOME DA PEÇA', 40, 170], ['COMP.', 215, 45], ['LARG.', 263, 45], ['TOTAL M²', 311, 57], ['QTDE', 372, 40], ['VALOR R$/M²', 416, 65], ['VALOR TOTAL', 486, 69]].forEach(([label, x, width]) => pdf.text(String(label), Number(x), y + 5, { width: Number(width), align: 'center' }));
};
const row = (pdf: PdfDocument, y: number, values: string[], emphasis = false) => {
  const cells = [[40, 170], [215, 45], [263, 45], [311, 57], [372, 40], [416, 65], [486, 69]];
  pdf.font(emphasis ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#1f1f1f');
  values.forEach((value, index) => pdf.text(value, cells[index][0], y + 4, { width: cells[index][1], align: index ? 'center' : 'left' }));
  line(pdf, y + 16);
};
const clientTableHeader = (pdf: PdfDocument, y: number) => {
  pdf.fillColor('#d1cfcc').rect(36, y, 523, 17).fill();
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(7);
  [['COMPONENTE', 40, 205], ['COMP.', 250, 55], ['LARG.', 310, 55], ['ÁREA M²', 370, 70], ['QTDE', 445, 100]].forEach(([label, x, width]) => pdf.text(String(label), Number(x), y + 5, { width: Number(width), align: 'center' }));
};
const clientRow = (pdf: PdfDocument, y: number, values: string[]) => {
  const cells = [[40, 205], [250, 55], [310, 55], [370, 70], [445, 100]];
  pdf.font('Helvetica').fontSize(7.5).fillColor('#1f1f1f');
  values.forEach((value, index) => pdf.text(value, cells[index][0], y + 4, { width: cells[index][1], align: index ? 'center' : 'left' }));
  line(pdf, y + 16);
};

const edgeCode = (edge: any) => {
  const name = String(edge.serviceNameSnapshot ?? '').toLocaleLowerCase('pt-BR');
  if (name.includes('simples')) return 'S';
  if (name.includes('45')) return '45°';
  if (name.includes('saia')) return '';
  return 'A';
};

const cross = (pdf: PdfDocument, x: number, y: number, size = 4) => {
  pdf.save().strokeColor('#c94331').lineWidth(1.7)
    .moveTo(x - size, y - size).lineTo(x + size, y + size)
    .moveTo(x - size, y + size).lineTo(x + size, y - size).stroke().restore();
};

/** Renders the same simple technical drawing language used by the web SVG.
 * All dimensions are real millimetres; the scale is only visual and never
 * participates in the quote calculation.
 */
const technicalComponent = (pdf: PdfDocument, component: any, cutouts: any[], top: number, column = 0) => {
  const cellW = 250;
  const areaX = 36 + column * 263;
  const areaW = cellW;
  // Keep several components on the same sheet while preserving the real
  // proportions. The drawing scale is visual only.
  const maxW = 170;
  const maxH = 115;
  const lengthMm = Math.max(1, Number(component.lengthMm));
  const widthMm = Math.max(1, Number(component.widthMm));
  const scale = Math.min(maxW / lengthMm, maxH / widthMm);
  const width = Math.max(18, lengthMm * scale);
  const height = Math.max(18, widthMm * scale);
  const x = areaX + (cellW - width) / 2;
  const y = top + 46 + (maxH - height) / 2;
  const right = x + width;
  const bottom = y + height;
  const dimColor = '#80776a';
  const ink = '#6e5830';
  const edges = new Map((component.edges ?? []).map((edge: any) => [String(edge.side), edge]));
  const sides = [
    ['BACK', x, y, right, y, (x + right) / 2, y - 4],
    ['FRONT', x, bottom, right, bottom, (x + right) / 2, bottom + 4],
    ['LEFT', x, y, x, bottom, x - 6, (y + bottom) / 2],
    ['RIGHT', right, y, right, bottom, right + 6, (y + bottom) / 2],
  ] as const;

  pdf.save();
  pdf.strokeColor(dimColor).fillColor(dimColor).lineWidth(0.8);
  // Horizontal dimension, kept well away from the rectangle.
  pdf.moveTo(x, y - 20).lineTo(right, y - 20).stroke();
  pdf.moveTo(x, y - 27).lineTo(x, y - 13).stroke();
  pdf.moveTo(right, y - 27).lineTo(right, y - 13).stroke();
  const dimensionWidth = Math.max(width, 48);
  pdf.font('Helvetica-Bold').fontSize(10).text(`${number(lengthMm / 1000)} m`, x + width / 2 - dimensionWidth / 2, y - 39, { width: dimensionWidth, align: 'center' });
  // Vertical dimension, outside the left edge and rotated like the web drawing.
  pdf.moveTo(x - 28, y).lineTo(x - 28, bottom).stroke();
  pdf.moveTo(x - 35, y).lineTo(x - 21, y).stroke();
  pdf.moveTo(x - 35, bottom).lineTo(x - 21, bottom).stroke();
  pdf.save().font('Helvetica-Bold').fontSize(10).translate(x - 43, (y + bottom) / 2).rotate(-90)
    .text(`${number(widthMm / 1000)} m`, -35, -5, { width: 70, align: 'center' }).restore();
  pdf.restore();

  pdf.save().fillColor('#fff7e5').strokeColor('#b6811e').lineWidth(1.4)
    .rect(x, y, width, height).fillAndStroke().restore();
  // Selected finishes are highlighted; an absent finish is marked with X.
  for (const [side, x1, y1, x2, y2, labelX, labelY] of sides) {
    const edge = edges.get(side);
    if (!edge) {
      cross(pdf, (x1 + x2) / 2, (y1 + y2) / 2, 4);
      continue;
    }
    pdf.save().strokeColor('#b6811e').lineWidth(2.2).moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
    const code = edgeCode(edge);
    if (code) pdf.font('Helvetica-Bold').fontSize(9).fillColor('#8a6320').text(code, labelX - 9, labelY - 5, { width: 18, align: 'center' });
  }
  // Cutouts are visual only; their geometry does not subtract from the stone.
  for (const cutout of cutouts) {
    const cw = Math.max(10, Number(cutout.lengthMm ?? cutout.diameterMm ?? 180) * scale);
    const ch = Math.max(10, Number(cutout.widthMm ?? cutout.diameterMm ?? 120) * scale);
    const cx = x + (Number(cutout.positionX ?? lengthMm / 2) * scale);
    const cy = y + (Number(cutout.positionY ?? widthMm / 2) * scale);
    pdf.save().dash(3, { space: 2 }).strokeColor('#8b6b3a').lineWidth(0.9).rect(cx - cw / 2, cy - ch / 2, cw, ch).stroke().undash().restore();
  }
  const area = Number(component.billableArea ?? 0);
  const detailY = bottom + 30;
  pdf.fillColor('#5f5a52').font('Helvetica').fontSize(9).text(String(component.label ?? 'Componente'), areaX, detailY, { width: areaW, align: 'center' });
  pdf.fontSize(9).text(`${Number(component.quantity) || 1} ${Number(component.quantity) === 1 ? 'peça' : 'peças'} · ${number(area)} m² total`, areaX, detailY + 14, { width: areaW, align: 'center' });
  const skirts = (component.edges ?? []).filter((edge: any) => String(edge.serviceNameSnapshot ?? '').toLocaleLowerCase('pt-BR').includes('saia'));
  skirts.forEach((edge: any, index: number) => pdf.text(`Saia ${number(Number(edge.lengthMm) / 10, 0)} × ${number(Number(edge.heightMm ?? 0) / 10, 0)} cm`, areaX, detailY + 28 + index * 12, { width: areaW, align: 'center' }));
  return detailY + 26 + skirts.length * 12;
};

export function renderQuotePdf(pdf: PdfDocument, quote: any) {
  header(pdf, 'ORÇAMENTO', quote);
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#17251f').text('CLIENTE:', 36, 92).font('Helvetica').text(quote.customerNameSnapshot, 92, 92);
  pdf.font('Helvetica-Bold').text('ENDEREÇO:', 36, 105).font('Helvetica').text(quote.workAddressSnapshot ?? 'Não informado', 92, 105);
  pdf.font('Helvetica-Bold').text('FONE:', 36, 118).font('Helvetica').text(quote.customerPhoneSnapshot ?? 'Não informado', 92, 118);
  pdf.font('Helvetica').text(`DATA DE EMISSÃO: ${date(quote.createdAt)}`, 330, 118, { width: 229, align: 'right' });
  pdf.fontSize(7.5).text(`VÁLIDO ATÉ: ${date(quote.validUntil)}  ·  APROVAÇÃO: ${date(quote.approvedAt)}`, 36, 132, { width: 523, align: 'right' });
  pdf.text(`PRAZO DE EXECUÇÃO: ${quote.estimatedBusinessDays ? `${quote.estimatedBusinessDays} dias úteis após aprovação` : 'A definir'}  ·  ENTREGA: ${date(quote.dueDate)}`, 36, 143, { width: 523, align: 'right' });
  let y = 158;
  quote.items.forEach((item: any) => {
    if (y > 650) { pdf.addPage(); header(pdf, 'ORÇAMENTO', quote); y = 94; }
    pdf.fillColor('#aaa7a4').rect(36, y, 523, 16).fill(); pdf.fillColor('#111').font('Helvetica-Bold').fontSize(8).text(`${item.projectName ? item.projectName.toUpperCase() + ' · ' : ''}MATERIAL: ${item.materialNameSnapshot.toUpperCase()} · ${item.productType.name.toUpperCase()}`, 40, y + 4, { width: 515, align: 'center' }); y += 18;
    clientTableHeader(pdf, y); y += 17;
    item.components.forEach((component: any) => { clientRow(pdf, y, [component.label.toUpperCase(), cm(component.lengthMm), cm(component.widthMm), number(Number(component.billableArea)), `${component.quantity} ${component.quantity === 1 ? 'peça' : 'peças'}`]); y += 16; });
    item.components.forEach((component: any) => component.edges.forEach((edge: any) => { clientRow(pdf, y, [`${edge.serviceNameSnapshot.toUpperCase()} · ${edge.side}`, '', '', `${number(Number(edge.billedQuantity))} ${edge.billingUnitSnapshot === 'SQUARE_METER' ? 'm²' : 'm'}`, '']); y += 16; }));
    item.services.forEach((service: any) => { clientRow(pdf, y, [service.serviceNameSnapshot.toUpperCase(), '', '', `${number(Number(service.billedQuantity))} ${service.billingUnitSnapshot === 'SQUARE_METER' ? 'm²' : service.billingUnitSnapshot === 'LINEAR_METER' ? 'm' : ''}`, '']); y += 16; });
    pdf.fillColor('#f1efec').rect(36, y, 523, 18).fill(); pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(8).text(`ÁREA TOTAL · ${item.productType.name.toUpperCase()}`, 40, y + 5).text(`${number(Number(item.billedQuantity))} m²`, 445, y + 5, { width: 100, align: 'right' }); y += 27;
  });
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(10).text('VALOR DO ORÇAMENTO TOTAL', 36, y + 8, { width: 400, align: 'center' }).text(money(Number(quote.netTotal)), 455, y + 8, { width: 100, align: 'right' });
  pdf.font('Helvetica').fontSize(7).fillColor('#5f5a52').text('Valores sujeitos à conferência de medidas em obra. Pedras naturais podem apresentar variação de tonalidade e veios.', 36, y + 36, { width: 523, align: 'center' });
  const signatureY = Math.min(704, Math.max(y + 62, 668));
  pdf.strokeColor('#8f887c').lineWidth(0.7).moveTo(76, signatureY).lineTo(284, signatureY).moveTo(311, signatureY).lineTo(519, signatureY).stroke();
  pdf.fillColor('#5f5a52').font('Helvetica').fontSize(8).text('Assinatura do cliente', 76, signatureY + 5, { width: 208, align: 'center' }).text('Responsável Inova Marmoraria', 311, signatureY + 5, { width: 208, align: 'center' });

  pdf.addPage(); header(pdf, 'ORDEM DE SERVIÇO', quote);
  // The service-order sheet is intentionally spacious: the drawing is the
  // primary production reference and the order number is easy to locate.
  pdf.fillColor('#b6811e').font('Helvetica-Bold').fontSize(16).text(`PEDIDO ${quote.number}`, 36, 91, { width: 523, align: 'center' });
  pdf.font('Helvetica').fontSize(9).fillColor('#17251f').text(`CLIENTE: ${quote.customerNameSnapshot}`, 36, 118).text(`ENDEREÇO: ${quote.workAddressSnapshot ?? 'Não informado'}`, 36, 132);
  y = 153;
  quote.items.forEach((item: any, itemIndex: number) => {
    if (y > 650) { pdf.addPage(); header(pdf, 'ORDEM DE SERVIÇO', quote); y = 94; }
    pdf.fillColor('#b6811e').font('Helvetica-Bold').fontSize(10).text(`${itemIndex + 1}. ${item.projectName ? item.projectName + ' · ' : ''}${item.productType.name} · ${item.materialNameSnapshot}`, 36, y); y += 16;
    // Two drawings per row: left and right. A new sheet is opened only when
    // the next complete row would exceed the usable page area.
    for (let componentIndex = 0; componentIndex < item.components.length; componentIndex += 2) {
      if (y + 230 > 718) { pdf.addPage(); header(pdf, 'ORDEM DE SERVIÇO', quote); y = 94; }
      const rowTop = y;
      const left = item.components[componentIndex];
      const leftCutouts = (item.cutouts ?? []).filter((cutout: any) => cutout.componentId === left.id);
      technicalComponent(pdf, left, leftCutouts, rowTop, 0);
      const right = item.components[componentIndex + 1];
      if (right) {
        const rightCutouts = (item.cutouts ?? []).filter((cutout: any) => cutout.componentId === right.id);
        technicalComponent(pdf, right, rightCutouts, rowTop, 1);
      }
      y = rowTop + 230;
    }
    item.cutouts.forEach((cutout: any) => { pdf.font('Helvetica').fontSize(8).fillColor('#17251f').text(`Recorte/cuba: ${cutout.label ?? cutout.cutoutType}`, 36, y); y += 12; });
    y += 12;
  });
  pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52').text('Observações: ' + (quote.notes ?? 'Sem observações.'), 36, y + 8, { width: 523 });
  const serviceSignatureY = 724;
  pdf.strokeColor('#8f887c').lineWidth(0.7).moveTo(155, serviceSignatureY).lineTo(405, serviceSignatureY).stroke();
  pdf.fillColor('#5f5a52').font('Helvetica').fontSize(8).text('Assinatura do cliente', 155, serviceSignatureY + 5, { width: 250, align: 'center' });
}
