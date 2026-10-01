import type PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/inova-logo.png');
export const pdfMoney = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pdfDate = (value: Date | string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
/** Mantém nomes de materiais em uma única linha, inclusive quando vierem do cadastro com quebra de linha. */
export const normalizarNomeMaterial = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
export const CNPJ_EMPRESA = '32.298.601/0001-19';
export function cabecalhoEmpresaPdf(pdf: PDFKit.PDFDocument, title: string, quote: { number: string }) {
  pdf.fillColor('#b6811e').rect(36, 34, 523, 5).fill();
  if (fs.existsSync(logoPath)) pdf.image(logoPath, 36, 42, { fit: [64, 49] });
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(14).text('INOVA MARMORARIA', 112, 47);
  pdf.font('Helvetica').fontSize(8).fillColor('#5f5a52')
    .text('Av. Visconde de Utinga, Nº 224 - Flores - Manaus AM', 112, 65, { width: 280 })
    .text('Contatos: (92) 98181-7980 / 93994-1402', 112, 77, { width: 280 })
    .text(`CNPJ: ${CNPJ_EMPRESA}`, 112, 89, { width: 280 });
  pdf.fillColor('#17251f').font('Helvetica-Bold').fontSize(title.length > 24 ? 9 : 13).text(title, 385, 49, { width: 174, align: 'right' });
  pdf.font('Helvetica-Bold').fontSize(9).fillColor('#b6811e').text(quote.number, 385, title.length > 24 ? 90 : 67, { width: 174, align: 'right' });
  pdf.moveTo(36, 114).lineTo(559, 114).stroke('#b8b2a8');
}
/** Data de entrega das folhas de OS: a acordada com o cliente ou, sem ela, a data limite. */
export function rotuloEntregaPdf(quote: { deliveryDeadline?: Date | string | null; dueDate?: Date | string | null }) {
  const entrega = quote.deliveryDeadline ?? quote.dueDate;
  return entrega ? pdfDate(entrega) : 'A definir';
}

/**
 * Cabeçalho das folhas de OS (desenhos e desenho técnico impressos pelo orçamento): data de entrega
 * à esquerda, cliente no centro e número da OS à direita, cada coluna separada mesmo com nome
 * longo. Devolve onde o conteúdo da folha começa.
 */
export function cabecalhoOrdemServicoPdf(pdf: PDFKit.PDFDocument, { entrega, cliente, numero }: { entrega: string; cliente: string; numero: string }) {
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#17251f').text('OS', 451, 36, { width: 108, align: 'right' });
  const alturaNumero = pdf.fontSize(10).heightOfString(numero, { width: 108 });
  pdf.text(numero, 451, 52, { width: 108, align: 'right' });
  pdf.fontSize(8).text('DATA DE ENTREGA', 36, 36, { width: 108 });
  pdf.fontSize(10).text(entrega, 36, 52, { width: 108 });
  const nome = normalizarNomeMaterial(cliente);
  let tamanho = 18;
  while (tamanho > 14 && pdf.font('Helvetica-Bold').fontSize(tamanho).widthOfString(nome) > 283) tamanho -= 0.5;
  pdf.font('Helvetica-Bold').fontSize(tamanho);
  const alturaNome = pdf.heightOfString(nome, { width: 283 });
  pdf.text(nome, 156, 36, { width: 283, align: 'center' });
  const fim = Math.max(72, 36 + alturaNome + 12, 52 + alturaNumero + 12);
  pdf.lineWidth(0.7).moveTo(36, fim).lineTo(559, fim).stroke('#b8b2a8');
  return fim + 12;
}
export function assinaturasPdf(pdf: InstanceType<typeof PDFDocument>, y = 735) {
  pdf.strokeColor('#8f887c').lineWidth(0.7).moveTo(76, y).lineTo(284, y).moveTo(311, y).lineTo(519, y).stroke();
  pdf.fillColor('#5f5a52').font('Helvetica').fontSize(8).text('Assinatura do cliente', 76, y + 5, { width: 208, align: 'center' }).text('Responsável Inova Marmoraria', 311, y + 5, { width: 208, align: 'center' });
}
