import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarLinhasPdf, type QuotePdfLine } from './quote.pdf-lines.js';
import type { QuotePdfOptions } from './quote.pdf-options.js';
import { projetoTemDesenho, calcularTotalPix } from '@inova/domain';
import { formatoRecorte, detalheDesenhoComponente, descricaoProducaoComponente, descricaoProducaoRecorte, tituloComponenteProducao, escalasDesenhoTecnico, isMiterFinish, miterJointPath, posicaoMarcadorMeiaEsquadria, acabamentoBordaPedra, faixasBordaPedra, rotuloMedidaDesenho, posicaoMedidaFaixa, type ManufacturingLine } from '@inova/domain';

type PdfDocument = InstanceType<typeof PDFDocument>;

const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: number, digits = 2) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const date = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não definida';
const cm = (value: number) => number(value / 10, 1);
const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/inova-logo.png');
const line = (pdf: PdfDocument, y: number) => pdf.moveTo(36, y).lineTo(559, y).stroke('#b8b2a8');
const header = (pdf: PdfDocument, title: string, quote: any) => {
  pdf.fillColor('#b6811e').rect(36, 34, 523, 5).fill();
  if (fs.existsSync(logoPath)) pdf.image(logoPath, 36, 42, { fit: [64, 49] });
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(14).text('INOVA MARMORARIA', 112, 47);
  pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52')
    .text('Av. Visconde de Itiúba, Nº 224 - Flores - Manaus AM', 112, 65, { width: 280 })
    .text('Contatos: (92) 98181-7980 / 93994-1402', 112, 77, { width: 280 })
    .text('CNPJ: 32.298.601/0001-19', 112, 89, { width: 280 });
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(13).text(title, 385, 49, { width: 174, align: 'right' });
  pdf.font('Helvetica-Bold').fontSize(9).fillColor('#b6811e').text(quote.number, 385, 67, { width: 174, align: 'right' });
  line(pdf, 114);
};
const finishName = (edge: any) => String(edge.serviceNameSnapshot ?? '').trim().toLocaleLowerCase('pt-BR');
const hasMiterFinish = (component: any) => (component.edges ?? []).some((edge: any) => isMiterFinish(finishName(edge)));
const materialTitleFontSize = 13;
const materialDimensionGap = 4;

const cross = (pdf: PdfDocument, x: number, y: number, size = 4) => {
  pdf.save().strokeColor('#c9473c').lineWidth(1.7)
    .moveTo(x - size, y - size).lineTo(x + size, y + size)
    .moveTo(x - size, y + size).lineTo(x + size, y - size).stroke().restore();
};

/** Renders the same simple technical drawing language used by the web SVG.
 * All dimensions are real millimetres; the scale is only visual and never
 * participates in the quote calculation.
 */
const technicalComponent = (pdf: PdfDocument, component: any, cutouts: any[], materialName: string, top: number, column = 0) => {
  const cellW = 250;
  const areaX = 36 + column * 263;
  const areaW = cellW;
  const materialTitle = `${component.drawingNumber}. ${materialName}`;
  const materialHeight = pdf.font('Helvetica-Bold').fontSize(materialTitleFontSize).heightOfString(materialTitle, { width: areaW });
  const drawingTop = top + materialHeight + 8;
  // The minimum visual thickness keeps narrow pieces readable; labels retain real measurements.
  const maxW = 170;
  const maxH = 100;
  const lengthMm = Math.max(1, Number(component.lengthMm));
  const widthMm = Math.max(1, Number(component.widthMm));
  const stripEdges: { side: string; serviceName: string; lengthMm: number; heightMm: number }[] = (component.edges ?? []).map((edge: any) => ({ side: edge.side, serviceName: finishName(edge), lengthMm: Number(edge.lengthMm ?? (['FRONT', 'BACK'].includes(edge.side) ? lengthMm : widthMm)), heightMm: Number(edge.heightMm) }));
  const { strips, extra } = faixasBordaPedra(stripEdges);
  const { left: leftExtra, right: rightExtra, top: topExtra, bottom: bottomExtra } = extra;
  const { scaleX, scaleY } = escalasDesenhoTecnico(lengthMm, widthMm, { left: leftExtra, right: rightExtra, top: topExtra, bottom: bottomExtra }, maxW, maxH, 0);
  const width = lengthMm * scaleX;
  const height = widthMm * scaleY;
  const totalWidth = (lengthMm + leftExtra + rightExtra) * scaleX;
  const totalHeight = (widthMm + topExtra + bottomExtra) * scaleY;
  const x = areaX + (cellW - totalWidth) / 2 + leftExtra * scaleX;
  const y = drawingTop + 46 + (maxH - totalHeight) / 2 + topExtra * scaleY;
  const right = x + width;
  const bottom = y + height;
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(materialTitleFontSize).text(materialTitle, areaX, y - topExtra * scaleY - 39 - materialDimensionGap - materialHeight, { width: areaW, align: 'center' });
  const dimColor = '#80776a';
  const sides = [
    ['BACK', x, y, right, y, (x + right) / 2, y - 4],
    ['FRONT', x, bottom, right, bottom, (x + right) / 2, bottom + 4],
    ['LEFT', x, y, x, bottom, x - 6, (y + bottom) / 2],
    ['RIGHT', right, y, right, bottom, right + 6, (y + bottom) / 2],
  ] as const;

  // Peitoril duplo: lengthMm é o comprimento real (compartilhado pelas duas
  // pedras, mostrado normalmente); widthMm é a largura de cima + largura de
  // baixo somadas — real, mas não corresponde a nenhuma pedra sozinha, então o
  // rótulo de largura não é desenhado aqui (as duas larguras reais saem no
  // bloco "Detalhe do peitoril" mais abaixo).
  const peitorilDuplo = component.componentType === 'SILL' && component.sillTopWidthMm && component.sillBottomWidthMm;
  pdf.save();
  pdf.strokeColor(dimColor).fillColor(dimColor).lineWidth(0.8);
  // Horizontal dimension, kept well away from the rectangle.
  const dimensionY = y - topExtra * scaleY;
  const dimensionX = x - leftExtra * scaleX;
  pdf.moveTo(x, dimensionY - 20).lineTo(right, dimensionY - 20).stroke();
  pdf.moveTo(x, dimensionY - 27).lineTo(x, dimensionY - 13).stroke();
  pdf.moveTo(right, dimensionY - 27).lineTo(right, dimensionY - 13).stroke();
  const dimensionWidth = Math.max(width, 48);
  pdf.font('Helvetica-Bold').fontSize(10).text(rotuloMedidaDesenho(lengthMm), x + width / 2 - dimensionWidth / 2, dimensionY - 39, { width: dimensionWidth, align: 'center' });
  // Vertical dimension, outside the left edge and rotated like the web drawing.
  pdf.moveTo(dimensionX - 28, y).lineTo(dimensionX - 28, bottom).stroke();
  pdf.moveTo(dimensionX - 35, y).lineTo(dimensionX - 21, y).stroke();
  pdf.moveTo(dimensionX - 35, bottom).lineTo(dimensionX - 21, bottom).stroke();
  if (!peitorilDuplo) pdf.save().font('Helvetica-Bold').fontSize(10).translate(dimensionX - 43, (y + bottom) / 2).rotate(-90)
    .text(rotuloMedidaDesenho(widthMm), -35, -5, { width: 70, align: 'center' }).restore();
  pdf.restore();

  pdf.save().fillColor('#fff7e5').strokeColor('#b6811e').lineWidth(1.4)
    .rect(x, y, width, height).fillAndStroke().restore();
  for (const [stripIndex, { edge, offsetMm }] of strips.entries()) {
    const horizontal = edge.side === 'FRONT' || edge.side === 'BACK';
    if (!['FRONT', 'BACK', 'LEFT', 'RIGHT'].includes(edge.side)) continue;
    const skirtLength = Math.min(Number(edge.lengthMm), horizontal ? lengthMm : widthMm) * (horizontal ? scaleX : scaleY);
    const skirtHeight = Number(edge.heightMm) * (horizontal ? scaleY : scaleX);
    const offset = offsetMm * (horizontal ? scaleY : scaleX);
    const skirtX = edge.side === 'LEFT' ? x - offset - skirtHeight : edge.side === 'RIGHT' ? right + offset : x;
    const skirtY = edge.side === 'BACK' ? y - offset - skirtHeight : edge.side === 'FRONT' ? bottom + offset : y;
    const skirtWidth = horizontal ? skirtLength : skirtHeight;
    const skirtVisualHeight = horizontal ? skirtHeight : skirtLength;
    pdf.save().fillColor('#ead49b').strokeColor('#9b6817').lineWidth(1.2)
      .rect(skirtX, skirtY, skirtWidth, skirtVisualHeight).fillAndStroke().restore();
    const lane = strips.slice(0, stripIndex).filter((strip) => strip.edge.side === edge.side).length;
    const label = posicaoMedidaFaixa(edge.side, { x: skirtX, y: skirtY, width: skirtWidth, height: skirtVisualHeight }, dimensionY, lane);
    pdf.save().fillColor('#635948').font('Helvetica-Bold').fontSize(7);
    const labelText = rotuloMedidaDesenho(edge.heightMm, 'cm');
    const labelWidth = pdf.widthOfString(labelText) + 2;
    pdf.text(labelText, label.x - (label.anchor === 'middle' ? labelWidth / 2 : 0), label.y - 3, { width: labelWidth, lineBreak: false }).restore();
  }
  // Simple finish = red X; an unselected edge has no marker.
  for (const [side, x1, y1, x2, y2, labelX, labelY] of sides) {
    const sideEdges = (component.edges ?? []).filter((edge: any) => edge.side === side);
    if (!sideEdges.length) continue;
    if (sideEdges.some((edge: any) => finishName(edge) === 'acabamento simples')) {
      cross(pdf, (x1 + x2) / 2, (y1 + y2) / 2, 4);
    }
    if (!sideEdges.some((edge: any) => finishName(edge) !== 'acabamento simples')) continue;
    pdf.save().strokeColor('#b6811e').lineWidth(2.2).moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
    const edge = sideEdges.find((edge: any) => !acabamentoBordaPedra(finishName(edge)) && finishName(edge) !== 'acabamento simples');
    if (edge && !sideEdges.some((entry: any) => isMiterFinish(finishName(entry)))) {
      const length = Number((edge as any).lengthMm ?? (side === 'FRONT' || side === 'BACK' ? lengthMm : widthMm));
      const textX = side === 'LEFT' ? labelX - 44 : side === 'RIGHT' ? labelX : labelX - 22;
      const textY = side === 'FRONT' ? labelY : labelY - 10;
      pdf.font('Helvetica-Bold').fontSize(8).fillColor('#8a6320').text(rotuloMedidaDesenho(length), textX, textY, { width: 44, align: side === 'LEFT' ? 'right' : side === 'RIGHT' ? 'left' : 'center' });
    }
  }
  // Cutouts are visual only; their geometry does not subtract from the stone.
  for (const cutout of cutouts) {
    // Unknown dimensions are documented below; never invent a technical size.
    if (cutout.sizePending) continue;
    const hole = ['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType);
    const cutoutLength = Number(hole ? cutout.diameterMm : cutout.lengthMm);
    const cutoutWidth = Number(hole ? cutout.diameterMm : cutout.widthMm);
    if (!(cutoutLength > 0 && cutoutWidth > 0)) continue;
    const cw = cutoutLength * scaleX;
    const ch = cutoutWidth * scaleY;
    const cx = x + (Number(cutout.positionX ?? lengthMm / 2) * scaleX);
    const cy = y + (Number(cutout.positionY ?? widthMm / 2) * scaleY);
    pdf.save().dash(3, { space: 2 }).strokeColor('#8b6b3a').lineWidth(0.9);
    if (formatoRecorte(cutout.cutoutType) === 'ellipse') pdf.ellipse(cx, cy, cw / 2, ch / 2);
    else pdf.rect(cx - cw / 2, cy - ch / 2, cw, ch);
    pdf.stroke().undash().restore();
  }
  const hasMiter = hasMiterFinish(component);
  for (const side of ['BACK', 'FRONT', 'LEFT', 'RIGHT'] as const) {
    if (!(component.edges ?? []).some((edge: any) => edge.side === side && isMiterFinish(finishName(edge)))) continue;
    const marker = posicaoMarcadorMeiaEsquadria(side, { x, y, width, height }, { left: leftExtra * scaleX, right: rightExtra * scaleX, top: topExtra * scaleY, bottom: bottomExtra * scaleY })!;
    pdf.save().translate(marker.x, marker.y).rotate(marker.rotation);
    pdf.save().scale(0.7).strokeColor('#6e5830').lineWidth(1.5).path(miterJointPath).stroke().restore();
    pdf.font('Helvetica-Bold').fontSize(9).fillColor('#635948').text('45°', 18, 3, { width: 22, lineBreak: false });
    pdf.restore();
  }
  const detailY = bottom + bottomExtra * scaleY + (hasMiter ? 36 : 22);
  pdf.y = detailY;
  if (component.componentType === 'SILL' && peitorilDuplo) {
    // Peitoril de duas pedras: lista as medidas reais das duas peças em vez do
    // esquema de uma pedra só — a oficina precisa saber exatamente o que cortar.
    const detailTop = pdf.y + 12;
    pdf.font('Helvetica-Bold').fontSize(9).text('Detalhe do peitoril — duas pedras', areaX, detailTop, { width: areaW, align: 'center' });
    pdf.font('Helvetica').fontSize(8);
    const linhas = [
      `Pedra de cima: ${number(component.lengthMm / 10, 1)} × ${number(component.sillTopWidthMm / 10, 1)} cm`,
      `Pedra de baixo: ${number(component.lengthMm / 10, 1)} × ${number(component.sillBottomWidthMm / 10, 1)} cm`,
      ...(component.sillOverlapMm ? [`Sobreposição/encaixe: ${number(component.sillOverlapMm / 10, 1)} cm`] : []),
      ...(component.sillFinalWidthMm ? [`Largura final montada: ${number(component.sillFinalWidthMm / 10, 1)} cm`] : []),
    ];
    let lineY = detailTop + 16;
    for (const linha of linhas) { pdf.text(linha, areaX, lineY, { width: areaW, align: 'center' }); lineY += 12; }
    pdf.y = Math.max(pdf.y, lineY);
  } else if (component.componentType === 'SILL') {
    const detailTop = pdf.y + 12;
    const detailX = areaX + (cellW - 170) / 2;
    pdf.font('Helvetica-Bold').fontSize(9).text('Detalhe do peitoril', areaX, detailTop, { width: areaW, align: 'center' });
    pdf.save().strokeColor('#6e5830').lineWidth(1.2)
      .rect(detailX, detailTop + 18, 64, 20).stroke()
      .rect(detailX + 36, detailTop + 38, 84, 26).stroke();
    pdf.strokeColor('#8d816e').lineWidth(.7)
      .moveTo(detailX, detailTop + 74).lineTo(detailX + 120, detailTop + 74)
      .moveTo(detailX, detailTop + 69).lineTo(detailX, detailTop + 79)
      .moveTo(detailX + 120, detailTop + 69).lineTo(detailX + 120, detailTop + 79)
      .moveTo(detailX + 78, detailTop + 18).lineTo(detailX + 78, detailTop + 38)
      .moveTo(detailX + 73, detailTop + 18).lineTo(detailX + 83, detailTop + 18)
      .moveTo(detailX + 73, detailTop + 38).lineTo(detailX + 83, detailTop + 38).stroke().restore();
    pdf.font('Helvetica').fontSize(8);
    if (component.sillDetailHeightMm) pdf.text(`${number(component.sillDetailHeightMm / 10, 1)} cm`, detailX + 89, detailTop + 24, { width: 81 });
    if (component.sillDetailMm) pdf.text(`Medida horizontal: ${number(component.sillDetailMm / 10, 1)} cm`, areaX, detailTop + 84, { width: areaW, align: 'center' });
    pdf.y = Math.max(pdf.y, detailTop + 96);
  }
  return pdf.y + 12;
};

export function renderizarPdfOrcamento(pdf: PdfDocument, quote: any, options: QuotePdfOptions = { individualPrices: false, drawings: true }) {
  header(pdf, 'ORÇAMENTO', quote);
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#17251f').text('CLIENTE:', 36, 124).font('Helvetica').text(quote.customerNameSnapshot, 92, 124);
  pdf.font('Helvetica-Bold').text('ENDEREÇO:', 36, 137).font('Helvetica').text(quote.workAddressSnapshot ?? 'Não informado', 92, 137);
  pdf.font('Helvetica-Bold').text('FONE:', 36, 150).font('Helvetica').text(quote.customerPhoneSnapshot ?? 'Não informado', 92, 150);
  pdf.font('Helvetica').text(`DATA DE EMISSÃO: ${date(quote.createdAt)}`, 330, 150, { width: 229, align: 'right' });
  pdf.fontSize(7.5).text(`VÁLIDO ATÉ: ${date(quote.validUntil)}  ·  APROVAÇÃO: ${date(quote.approvedAt)}`, 36, 164, { width: 523, align: 'right' });
  pdf.text(`PRAZO DE EXECUÇÃO: ${quote.estimatedBusinessDays ? `${quote.estimatedBusinessDays} dias úteis após aprovação` : 'A definir'}  ·  ENTREGA: ${date(quote.dueDate)}`, 36, 175, { width: 523, align: 'right' });
  let y = 190;
  const commercial = montarLinhasPdf(quote.items);
  // Keep linear services in the same project table as the other commercial
  // lines.  The helper still exposes the aggregated `linear` collection for
  // callers that need the quote-wide total, while the PDF presents each
  // project's values together in one place.
  // Vista is a component/description in the commercial quote. Do not repeat
  // it as a separate linear-meter service line in the PDF.
  const linearByItem = quote.items.map((item: any) => montarLinhasPdf([item]).linear.filter((entry) => !(/^vista(?:\s|$)/i.test(entry.description) || /^vista\s*[·-]/i.test(entry.description))));
  const columns = options.individualPrices
    ? [{ label: 'DESCRIÇÃO', x: 40, width: 167 }, { label: 'COMP. cm', x: 210, width: 44 }, { label: 'LARG. cm', x: 258, width: 44 }, { label: 'MEDIDA', x: 306, width: 75 }, { label: 'QTDE', x: 385, width: 60 }, { label: 'VALOR TOTAL', x: 449, width: 106 }]
    : [{ label: 'DESCRIÇÃO', x: 40, width: 205 }, { label: 'COMP. cm', x: 250, width: 55 }, { label: 'LARG. cm', x: 310, width: 55 }, { label: 'MEDIDA', x: 370, width: 70 }, { label: 'QTDE', x: 445, width: 100 }];
  const commercialSpace = (height: number) => {
    if (y + height <= 690) return false;
    // Continuation pages stay clean and compact. The full commercial header is
    // intentionally rendered only on the first page of the PDF.
    pdf.addPage(); y = 52;
    return true;
  };
  const commercialHeader = () => {
    pdf.fillColor('#d1cfcc').rect(36, y, 523, 17).fill();
    pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(7);
    columns.forEach(column => pdf.text(column.label, column.x, y + 5, { width: column.width, align: 'center' }));
    y += 17;
  };
  const commercialRow = (entry: QuotePdfLine) => {
    if (entry.adjustment && !options.individualPrices) return;
    // Serviços cobrados por metro linear são apresentados como "ml" no PDF.
    // Mantemos a unidade de domínio como "m" para não alterar cálculos ou
    // integrações; a conversão é apenas visual nesta tabela.
    const displayUnit = entry.unit === 'm' ? 'ml' : (entry.unit ?? '');
    const measure = entry.measure == null || !Number.isFinite(entry.measure) ? '' : entry.measure.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' ' + displayUnit;
    const cells = [entry.description.toUpperCase(), entry.lengthMm ? cm(entry.lengthMm) : '', entry.widthMm ? cm(entry.widthMm) : '', measure, entry.quantity ? String(entry.quantity) : ''];
    if (options.individualPrices) cells.push(money(entry.total));
    pdf.font('Helvetica').fontSize(7.5);
    const height = Math.max(16, ...cells.map((value, index) => pdf.heightOfString(value, { width: columns[index].width }) + 8));
    if (commercialSpace(height + 17)) commercialHeader();
    pdf.font('Helvetica').fontSize(7.5).fillColor('#1f1f1f');
    cells.forEach((value, index) => pdf.text(value, columns[index].x, y + 4, { width: columns[index].width, align: index ? 'center' : 'left' }));
    y += height;
  };
  const commercialTitle = (projectName: string, materialHeading: string) => {
    const prefix = projectName ? `${projectName.toUpperCase()} · ` : '';
    const title = `${prefix}${materialHeading}`;
    pdf.font('Helvetica-Bold').fontSize(8);
    const height = Math.max(16, pdf.heightOfString(title, { width: 515 }) + 8);
    commercialSpace(height + 45);
    pdf.fillColor('#aaa7a4').rect(36, y, 523, height).fill();
    // Keep the project name neutral and give the selected material a subtle
    // mustard highlight so the stone is immediately identifiable.
    const contentWidth = pdf.widthOfString(title);
    let titleX = 36 + (523 - contentWidth) / 2;
    pdf.fillColor('#111').font('Helvetica-Bold').fontSize(8)
      .text(prefix, titleX, y + 4, { width: pdf.widthOfString(prefix), lineBreak: false });
    titleX += pdf.widthOfString(prefix);
    if (materialHeading.startsWith('MATERIAL: ')) {
      const label = 'MATERIAL: ';
      pdf.fillColor('#111').text(label, titleX, y + 4, { width: pdf.widthOfString(label), lineBreak: false });
      titleX += pdf.widthOfString(label);
      pdf.fillColor('#c9473c').text(materialHeading.slice(label.length), titleX, y + 4, { width: pdf.widthOfString(materialHeading.slice(label.length)), lineBreak: false });
    } else {
      pdf.fillColor('#c9473c').text(materialHeading, titleX, y + 4, { width: pdf.widthOfString(materialHeading), lineBreak: false });
    }
    y += height + 2;
    commercialHeader();
  };
  quote.items.forEach((item: any, index: number) => {
    const materialNames = [...new Set((item.components ?? []).map((component: any) => component.materialNameSnapshot ?? item.materialNameSnapshot))];
    const materialHeading = materialNames.length > 1 ? 'MATERIAIS POR COMPONENTE' : `MATERIAL: ${String(materialNames[0] ?? item.materialNameSnapshot).toUpperCase()}`;
    commercialTitle(item.projectName ?? '', materialHeading);
    commercial.items[index].forEach(commercialRow);
    linearByItem[index].forEach(commercialRow);
    commercialSpace(27);
    pdf.fillColor('#f1efec').rect(36, y, 523, 18).fill();
    // Compact project summary: keep the area under the MEDIDA column and the
    // project amount in the value column, avoiding a second summary line.
    const summaryMeasureColumn = columns[3];
    const summaryValueColumn = options.individualPrices ? columns[5] : columns[4];
    pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(8)
      .text(`TOTAL DO PROJETO${item.projectName ? ` · ${String(item.projectName).toUpperCase()}` : ''}`, 40, y + 5, { width: 300 })
      .text(`${number(Number(item.billedQuantity))} m²`, summaryMeasureColumn.x, y + 5, { width: summaryMeasureColumn.width, align: 'center' });
    if (Number.isFinite(Number(item.total))) {
      pdf.text(money(Number(item.total)), summaryValueColumn.x, y + 5, {
        width: summaryValueColumn.width,
        align: options.individualPrices ? 'right' : 'center',
      });
    }
    y += 27;
  });
  // Keep the closing area compact: fixed payment notes and optional customer
  // observations stay on the left, while totals stay close to their values on
  // the right. This avoids a separate footer section on the first sheet.
  const notes = String(quote.notes ?? '').trim();
  pdf.font('Helvetica-Bold').fontSize(7.5);
  const paymentText = 'CONDIÇÃO DE PAGAMENTO: 50% do valor deve ser pago antecipadamente para iniciar o trabalho.';
  const paymentHeight = pdf.heightOfString(paymentText, { width: 292 });
  pdf.font('Helvetica').fontSize(7);
  const caveatText = 'Valores sujeitos à conferência de medidas em obra. Pedras naturais podem\napresentar variação de tonalidade e veios.';
  const caveatHeight = pdf.heightOfString(caveatText, { width: 292 });
  const notesHeight = notes ? pdf.heightOfString(`Observação: ${notes}`, { width: 292 }) : 0;
  const discountHeight = options.individualPrices && Number(quote.discountAmount) > 0 ? 19 : 0;
  const footerSignatureY = 735;
  const closingHeight = Math.max(
    Math.max(paymentHeight + caveatHeight + 16 + (notes ? 16 + notesHeight : 0), 57 + discountHeight) + 70,
    footerSignatureY - y + 20,
  );
  if (y + closingHeight > 770) { pdf.addPage(); y = 52; }
  const pixTotal = calcularTotalPix(Number(quote.netTotal));
  const leftX = 36;
  const leftWidth = 270;
  const totalsX = 285;
  const totalsLabelWidth = 165;
  const totalsValueX = 455;
  const totalsValueWidth = 104;
  const blockTop = y + 5;
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(7.5)
    .text(paymentText, leftX, blockTop, { width: leftWidth });
  pdf.font('Helvetica').fontSize(7).fillColor('#5f5a52')
    .text(caveatText, leftX, blockTop + paymentHeight + 5, { width: leftWidth });
  const observationsTop = blockTop + paymentHeight + caveatHeight + 13;
  if (notes) {
    pdf.font('Helvetica-Bold').fontSize(8).fillColor('#17251f').text('OBSERVAÇÕES', leftX, observationsTop, { width: leftWidth });
    pdf.font('Helvetica').fontSize(7.5).fillColor('#5f5a52').text(`Observação: ${notes}`, leftX, observationsTop + 13, { width: leftWidth });
  }
  let totalsY = blockTop;
  if (options.individualPrices && Number(quote.discountAmount) > 0) {
    pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52')
      .text('DESCONTO GERAL', totalsX, totalsY, { width: totalsLabelWidth, align: 'right' })
      .text('- ' + money(Number(quote.discountAmount)), totalsValueX, totalsY, { width: totalsValueWidth, align: 'right' });
    totalsY += 19;
  }
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(10)
    .text('VALOR DO ORÇAMENTO TOTAL', totalsX, totalsY, { width: totalsLabelWidth, align: 'right' })
    .text(money(Number(quote.netTotal)), totalsValueX, totalsY, { width: totalsValueWidth, align: 'right' });
  pdf.fontSize(9)
    .text('TOTAL COM DESCONTO NO PIX (5%)', totalsX, totalsY + 19, { width: totalsLabelWidth, align: 'right' })
    .text(money(pixTotal), totalsValueX, totalsY + 19, { width: totalsValueWidth, align: 'right' });
  // The signatures belong to the footer of the commercial sheet, regardless
  // of how much content the closing block has above them.
  const signatureY = footerSignatureY;
  pdf.strokeColor('#8f887c').lineWidth(0.7).moveTo(76, signatureY).lineTo(284, signatureY).moveTo(311, signatureY).lineTo(519, signatureY).stroke();
  pdf.fillColor('#5f5a52').font('Helvetica').fontSize(8).text('Assinatura do cliente', 76, signatureY + 5, { width: 208, align: 'center' }).text('Responsável Inova Marmoraria', 311, signatureY + 5, { width: 208, align: 'center' });

  const drawnItems = quote.items.filter((item: any) => projetoTemDesenho(item.drawingData));
  if (!options.drawings || !drawnItems.length) return;
  pdf.addPage(); header(pdf, 'ORDEM DE SERVIÇO', quote);
  // The service-order sheet is intentionally spacious: the drawing is the
  // primary production reference and the order number is easy to locate.
  pdf.fillColor('#b6811e').font('Helvetica-Bold').fontSize(16).text(`PEDIDO ${quote.number}`, 36, 117, { width: 523, align: 'center' });
  pdf.font('Helvetica').fontSize(9).fillColor('#17251f').text(`CLIENTE: ${quote.customerNameSnapshot}`, 36, 144).text(`ENDEREÇO: ${quote.workAddressSnapshot ?? 'Não informado'}`, 36, 158);
  y = 179;
  const ensureSpace = (height: number) => {
    if (y + height <= 700) return;
    // Only the first service-order page carries the full PDF header. Later
    // sheets are reserved for drawings and descriptions, which keeps them
    // visually lighter and gives the content more usable vertical space.
    pdf.addPage(); y = 52;
  };
  const writeDescription = (title: string, lines: ManufacturingLine[]) => {
    if (!lines.length) return;
    ensureSpace(42);
    pdf.font('Helvetica-Bold').fontSize(8).fillColor('#5f5a52').text(title, 36, y, { width: 523 }); y = pdf.y + 5;
    for (const line of lines) {
      // Wrap explicitly so even a very long specification can continue on the next sheet.
      pdf.font('Helvetica').fontSize(7);
      let current = '';
      const wrapped: string[] = [];
      for (const character of line.label === 'Acabamentos' ? line.text : `${line.label}: ${line.text}`) {
        if (character === '\n' || pdf.widthOfString(current + character) > 515) { wrapped.push(current); current = ''; }
        if (character !== '\n') current += character;
      }
      if (current) wrapped.push(current);
      for (const text of wrapped) {
        ensureSpace(12);
        pdf.font('Helvetica').fontSize(7).fillColor('#5f5a52').text(text, 40, y, { width: 515, lineBreak: false }); y += 12;
      }
      y += 2;
    }
    y += 8;
  };
  const cutoutDetail = (cutout: any) => ({ ...cutout, serviceName: cutout.serviceNameSnapshot });
  type DescriptionRow = { text: string; size: number; bold: boolean; height: number };
  const descriptionRows = (title: string, lines: ManufacturingLine[]): DescriptionRow[] => {
    const rows: DescriptionRow[] = [];
    const append = (text: string, size: number, bold: boolean, width: number, gap: number) => {
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      for (const paragraph of text.split('\n')) {
        let current = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          if (current && pdf.widthOfString(`${current} ${word}`) > width) { rows.push({ text: current, size, bold, height: 12 }); current = ''; }
          for (const character of (current ? ' ' : '') + word) {
            if (pdf.widthOfString(current + character) > width) { rows.push({ text: current, size, bold, height: 12 }); current = ''; }
            current += character;
          }
        }
        if (current) rows.push({ text: current, size, bold, height: 12 });
      }
      if (rows.length) rows[rows.length - 1].height += gap;
    };
    append(title, 8, true, 250, 5);
    lines.forEach((line) => append(line.label === 'Acabamentos' ? line.text : `${line.label}: ${line.text}`, 7, false, 242, 2));
    return rows;
  };
  const writeComponentColumns = (columns: { title: string; rows: DescriptionRow[] }[]) => {
    const cursors = columns.map(() => 0);
    while (columns.some((column, index) => cursors[index] < column.rows.length)) {
      let bottom = y;
      columns.forEach((column, index) => {
        let columnY = y;
        while (cursors[index] < column.rows.length) {
          const row = column.rows[cursors[index]];
          if (columnY + row.height > 700) break;
          pdf.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.size).fillColor('#5f5a52')
            .text(row.text, 36 + index * 263 + (row.bold ? 0 : 4), columnY, { width: row.bold ? 250 : 242, lineBreak: false });
          columnY += row.height;
          cursors[index]++;
        }
        bottom = Math.max(bottom, columnY);
      });
      y = bottom + 8;
      if (columns.some((column, index) => cursors[index] < column.rows.length)) {
        pdf.addPage(); y = 52;
        let headerHeight = 0;
        columns.forEach((column, index) => {
          if (cursors[index] >= column.rows.length) return;
          const title = `${column.title} (continuação)`;
          pdf.font('Helvetica-Bold').fontSize(8).fillColor('#5f5a52').text(title, 36 + index * 263, y, { width: 250 });
          headerHeight = Math.max(headerHeight, pdf.y - y);
        });
        y += headerHeight + 5;
      }
    }
  };
  drawnItems.forEach((item: any, itemIndex: number) => {
    // Separate projects without charging the final project for an unused gap.
    // That trailing space could push a short observation onto its own sheet.
    if (itemIndex > 0) y += 12;
    const components = item.components.map((component: any, index: number) => {
      const detail = detalheDesenhoComponente(item.drawingData, index);
      return { ...component, ...detail, drawingNumber: index + 1, drawingTitle: tituloComponenteProducao(component, index) };
    });
    const drawingHeight = (component: any) => {
      const materialHeight = pdf.font('Helvetica-Bold').fontSize(materialTitleFontSize).heightOfString(`${component.drawingNumber}. ${component.materialNameSnapshot ?? item.materialNameSnapshot}`, { width: 250 });
      return materialHeight + 188 + (hasMiterFinish(component) ? 14 : 0) + (component.componentType === 'SILL' ? 108 : 0);
    };
    const descriptions = components.map((component: any) => {
      const lines = descricaoProducaoComponente({ ...component, edges: (component.edges ?? []).map((edge: any) => ({ ...edge,
        serviceName: edge.serviceNameSnapshot,
        quantity: Math.max(1, Math.round(Number(edge.billedQuantity ?? 0) / (component.quantity * edge.lengthMm * (edge.heightMm ? edge.heightMm / 1_000_000 : 1 / 1000)))) || 1,
      })) }, (item.cutouts ?? []).filter((cutout: any) => cutout.componentId === component.id).map(cutoutDetail),
      component.parentComponentIndex === undefined ? undefined : components[component.parentComponentIndex].drawingTitle,
      components.filter((child: any) => child.parentComponentIndex === components.indexOf(component)).map((child: any) => child.drawingTitle));
      return { title: component.drawingTitle, rows: descriptionRows(component.drawingTitle, lines) };
    });
    const rowReservation = (index: number) => {
      const drawings = Math.max(0, ...components.slice(index, index + 2).map(drawingHeight));
      const details = Math.max(0, ...descriptions.slice(index, index + 2).map((description: { rows: DescriptionRow[] }) => description.rows.reduce((sum, row) => sum + row.height, 8)));
      return drawings + details <= 580 ? drawings + details : drawings + Math.min(details, 60);
    };
    const itemTitle = `${itemIndex + 1}. ${item.projectName ? item.projectName + ' · ' : ''}${item.productType.name}${components.length ? '' : ` · ${item.materialNameSnapshot}`}`;
    const titleHeight = pdf.font('Helvetica-Bold').fontSize(10).heightOfString(itemTitle, { width: 523 }) + 8;
    ensureSpace(titleHeight + rowReservation(0));
    pdf.fillColor('#b6811e').font('Helvetica-Bold').fontSize(10).text(itemTitle, 36, y, { width: 523 }); y += titleHeight;
    // Two drawings per row: left and right. A new sheet is opened only when
    // the next complete row would exceed the usable page area.
    for (let componentIndex = 0; componentIndex < components.length; componentIndex += 2) {
      ensureSpace(rowReservation(componentIndex));
      const rowTop = y;
      const left = components[componentIndex];
      const leftCutouts = (item.cutouts ?? []).filter((cutout: any) => cutout.componentId === left.id);
      let rowBottom = technicalComponent(pdf, left, leftCutouts, left.materialNameSnapshot ?? item.materialNameSnapshot, rowTop, 0);
      const right = components[componentIndex + 1];
      if (right) {
        const rightCutouts = (item.cutouts ?? []).filter((cutout: any) => cutout.componentId === right.id);
        rowBottom = Math.max(rowBottom, technicalComponent(pdf, right, rightCutouts, right.materialNameSnapshot ?? item.materialNameSnapshot, rowTop, 1));
      }
      y = rowBottom;
      writeComponentColumns(descriptions.slice(componentIndex, componentIndex + 2));
    }
    writeDescription('Recortes sem componente vinculado', (item.cutouts ?? []).filter((cutout: any) => !components.some((component: any) => component.id === cutout.componentId)).flatMap((cutout: any) => descricaoProducaoRecorte(cutoutDetail(cutout))));
    writeDescription('Serviços e detalhes do projeto', (item.services ?? []).map((service: any) => ({ label: 'Serviço', text: `${service.serviceNameSnapshot}${service.billingUnitSnapshot === 'UNIT' ? ` · quantidade: ${number(Number(service.billedQuantity), 0)}` : ''}` })));
  });
  pdf.font('Helvetica').fontSize(9);
  const noteLines: string[] = [];
  for (const paragraph of String(quote.notes?.trim() || '').split(/\r?\n/).filter(Boolean)) {
    let current = '';
    for (const character of paragraph) {
      if (pdf.widthOfString(current + character) > 523) {
        const breakAt = current.lastIndexOf(' ');
        noteLines.push(breakAt > 0 ? current.slice(0, breakAt) : current);
        current = breakAt > 0 ? current.slice(breakAt + 1) : '';
      }
      current += character;
    }
    noteLines.push(current);
  }
  if (noteLines.length === 1) {
    // A short note fits in the remaining footer space and must not create a
    // page only to show a heading followed by one sentence.
    ensureSpace(14);
    pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52').text(`Observação: ${noteLines[0]}`, 36, y, { width: 523, lineBreak: false }); y += 14;
  } else if (noteLines.length) {
    ensureSpace(28); // Heading plus the first real note, never an empty footer block.
    pdf.font('Helvetica-Bold').fontSize(9).fillColor('#5f5a52').text('Observações do orçamento', 36, y, { width: 523 }); y += 16;
    for (const text of noteLines) {
      ensureSpace(12);
      pdf.font('Helvetica').fontSize(9).fillColor('#5f5a52').text(text, 36, y, { width: 523, lineBreak: false }); y += 12;
    }
  }
  // Body pagination ends at 700. The drawing legend belongs to the reserved
  // footer; the customer signature stays exclusively on the commercial sheet.
  pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52').text('Desenho ilustrativo, sem escala · X vermelho = acabamento simples · Área tracejada = recorte', 36, 706, { width: 523, lineBreak: false });
}
