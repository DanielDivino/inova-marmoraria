import { dataAtualEmpresa } from '@inova/domain';
import { cabecalhoEmpresaPdf, CNPJ_EMPRESA, normalizarNomeMaterial, pdfDate } from '../orcamentos/pdf-layout.js';
import type { DocumentoNotaEntrega, LinhaNotaEntrega } from './entrega.service.js';

export type NotaEntregaPdf = {
  number: string; createdAt: Date | string; document: DocumentoNotaEntrega;
  quote: { number: string; customerNameSnapshot: string; customerPhoneSnapshot: string | null; workAddressSnapshot: string | null };
};

const COR = { tinta: '#17251f', rotulo: '#6f685e', apagado: '#9a9388', ouro: '#8a6320', linha: '#dfd9cf', forte: '#8f887c', cabecalho: '#dcd9d3', zebra: '#f7f5f1', creme: '#fbf5e6', borda: '#e6cf8f' };
/** Conteúdo vai até aqui; abaixo fica o rodapé de cada página. */
const LIMITE = 790;

const metros = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const medida = (linha: LinhaNotaEntrega) => linha.lengthMm && linha.widthMm ? `${metros(linha.lengthMm)} × ${metros(linha.widthMm)} m` : '';
const pecas = (quantidade: number) => `${quantidade} ${quantidade === 1 ? 'peça' : 'peças'}`;
const soma = (linhas: LinhaNotaEntrega[]) => linhas.reduce((total, linha) => total + linha.quantity, 0);

type Coluna = { rotulo: string; x: number; w: number; alinhar?: 'left' | 'right' | 'center' };
const COLUNAS: Coluna[] = [
  { rotulo: 'Item', x: 36, w: 40 }, { rotulo: 'Peça', x: 76, w: 135 }, { rotulo: 'Material', x: 211, w: 135 }, { rotulo: 'Medida', x: 346, w: 115 },
  { rotulo: 'Qtd.', x: 461, w: 36, alinhar: 'right' }, { rotulo: 'Conferido', x: 497, w: 62, alinhar: 'center' },
];

/**
 * Nota de entrega de um projeto: dados do cliente, as peças entregues para
 * conferir, as que ainda faltam (entrega parcial), o recebimento e as
 * assinaturas. Sem valores. O documento precisa de `bufferPages` para o
 * rodapé "Página x de y".
 */
export function renderizarNotaEntregaPdf(pdf: PDFKit.PDFDocument, nota: NotaEntregaPdf) {
  const { document, quote } = nota;
  cabecalhoEmpresaPdf(pdf, 'NOTA DE ENTREGA E CONFERÊNCIA', { number: nota.number });
  let y = 130;
  const novaPagina = () => {
    pdf.addPage();
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(COR.tinta).text(`${nota.number} · Continuação`, 36, 36, { lineBreak: false });
    y = 58;
  };
  const espaco = (altura: number) => { if (y + altura > LIMITE) novaPagina(); };

  // Dados em duas colunas: rótulo discreto e valor; o que não foi informado fica apagado.
  const dados: [string, string | null, boolean][][] = [
    [['Cliente', quote.customerNameSnapshot, true], ['Orçamento', quote.number, false]],
    [['Telefone', quote.customerPhoneSnapshot, false], ['Data', pdfDate(dataAtualEmpresa(new Date(nota.createdAt))), false]],
    [['Projeto', document.projectName, false], ['Endereço', quote.workAddressSnapshot, false]],
  ];
  for (const linha of dados) {
    let altura = 0;
    linha.forEach(([rotulo, valor, negrito], coluna) => {
      const [xRotulo, xValor, largura] = coluna ? [382, 436, 123] : [36, 92, 270];
      pdf.font('Helvetica').fontSize(8.5).fillColor(COR.rotulo).text(rotulo, xRotulo, y, { lineBreak: false });
      pdf.font(negrito && valor ? 'Helvetica-Bold' : 'Helvetica').fillColor(valor ? COR.tinta : COR.apagado).text(valor || 'Não informado', xValor, y, { width: largura });
      altura = Math.max(altura, pdf.heightOfString(valor || 'Não informado', { width: largura }));
    });
    y += altura + 5;
  }

  // Faixa de destaque: entrega final ou parcial, com a contagem de peças.
  y += 10;
  const entregues = soma(document.delivered), faltam = soma(document.remaining);
  const antes = document.deliveredBefore ? `, ${pecas(document.deliveredBefore)} já ${document.deliveredBefore === 1 ? 'entregue' : 'entregues'} antes` : '';
  const destaque = faltam ? 'Entrega parcial' : 'Entrega final';
  const resumo = faltam
    ? ` — ${pecas(entregues)} nesta nota${antes}. Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${pecas(faltam)}, listadas abaixo.`
    : ` — ${pecas(entregues)} nesta nota${antes}. Com ela, todas as peças do projeto foram entregues.`;
  pdf.font('Helvetica').fontSize(9);
  const alturaDestaque = pdf.heightOfString(destaque + resumo, { width: 499 }) + 14;
  pdf.lineWidth(0.8).roundedRect(36, y, 523, alturaDestaque, 4).fillAndStroke(COR.creme, COR.borda);
  pdf.font('Helvetica-Bold').fillColor(COR.ouro).text(destaque, 48, y + 7, { width: 499, continued: true }).font('Helvetica').fillColor(COR.tinta).text(resumo);
  y += alturaDestaque + 14;

  const tabela = (linhas: LinhaNotaEntrega[], conferir: boolean, rotuloTotal: string) => {
    const colunas = conferir ? COLUNAS : COLUNAS.slice(0, 5);
    const cabecalho = () => {
      pdf.rect(36, y, 523, 22).fill(COR.cabecalho);
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(COR.tinta);
      for (const coluna of colunas) pdf.text(coluna.rotulo, coluna.x + 8, y + 7, { width: coluna.w - 16, align: coluna.alinhar ?? 'left', lineBreak: false });
      y += 22;
    };
    espaco(22 + 26);
    cabecalho();
    linhas.forEach((linha, indice) => {
      const celulas = [String(indice + 1).padStart(2, '0'), linha.name, normalizarNomeMaterial(linha.material), medida(linha), String(linha.quantity)];
      pdf.font('Helvetica').fontSize(8.5);
      const altura = Math.max(26, ...celulas.map((celula, coluna) => pdf.heightOfString(celula, { width: colunas[coluna].w - 16 }) + 14));
      if (y + altura > LIMITE) { novaPagina(); cabecalho(); }
      if (indice % 2) pdf.rect(36, y, 523, altura).fill(COR.zebra);
      pdf.font('Helvetica').fontSize(8.5).fillColor(COR.tinta);
      celulas.forEach((celula, coluna) => pdf.text(celula, colunas[coluna].x + 8, y + 8, { width: colunas[coluna].w - 16, align: colunas[coluna].alinhar ?? 'left' }));
      if (conferir) pdf.lineWidth(0.8).rect(523, y + altura / 2 - 5, 10, 10).stroke(COR.forte);
      y += altura;
      pdf.lineWidth(0.5).moveTo(36, y).lineTo(559, y).stroke(COR.linha);
    });
    pdf.lineWidth(1).moveTo(36, y).lineTo(559, y).stroke(COR.forte);
    y += 9;
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(COR.tinta).text(rotuloTotal, 260, y, { width: 192, align: 'right', lineBreak: false })
      .text(String(soma(linhas)), 469, y, { width: 20, align: 'right', lineBreak: false });
    y += 22;
  };
  tabela(document.delivered, true, 'Total de peças');
  if (document.remaining.length) {
    y += 8;
    espaco(18 + 22 + 26);
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(COR.tinta).text('Peças que ainda faltam entregar', 36, y, { lineBreak: false });
    y += 18;
    tabela(document.remaining, false, 'Total que falta');
  }

  // Recebimento: observações, declaração, data e as duas assinaturas ficam juntas na mesma folha.
  y += 14;
  espaco(215);
  pdf.font('Helvetica-Bold').fontSize(10).fillColor(COR.tinta).text('Observações de entrega', 36, y, { lineBreak: false });
  y += 12;
  for (let linha = 0; linha < 3; linha++) { y += 20; pdf.lineWidth(0.5).moveTo(36, y).lineTo(559, y).stroke('#cfc9bf'); }
  y += 24;
  pdf.font('Helvetica').fontSize(8.5).fillColor(COR.tinta)
    .text(`Declaro que recebi e conferi as peças descritas acima, em perfeito estado e conforme o projeto contratado${faltam ? ', ciente das que ainda faltam entregar' : ''}.`, 36, y, { width: 523 });
  y = pdf.y + 16;
  pdf.text('Data da entrega: ____ / ____ / ________', 36, y, { lineBreak: false });
  y += 50;
  for (const [x, titulo, detalhe] of [[36, 'Cliente / recebedor', 'Assinatura e nome legível'], [322, 'Responsável pela entrega', 'Inova Marmoraria']] as const) {
    pdf.lineWidth(0.7).moveTo(x, y).lineTo(x + 237, y).stroke(COR.tinta);
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(COR.tinta).text(titulo, x, y + 6, { width: 237, align: 'center', lineBreak: false });
    pdf.font('Helvetica').fontSize(7.5).fillColor(COR.rotulo).text(detalhe, x, y + 17, { width: 237, align: 'center', lineBreak: false });
  }

  // Rodapé de todas as folhas, escrito no fim para saber o total de páginas.
  const { start, count } = pdf.bufferedPageRange();
  for (let pagina = start; pagina < start + count; pagina++) {
    pdf.switchToPage(pagina);
    const margem = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0; // Escrever abaixo da margem sem abrir outra folha.
    pdf.lineWidth(0.5).moveTo(36, 808).lineTo(559, 808).stroke(COR.linha);
    pdf.font('Helvetica').fontSize(7).fillColor(COR.apagado).text(`Inova Marmoraria · CNPJ ${CNPJ_EMPRESA}`, 36, 814, { lineBreak: false })
      .text(`${nota.number} · Página ${pagina - start + 1} de ${count}`, 300, 814, { width: 259, align: 'right', lineBreak: false });
    pdf.page.margins.bottom = margem;
  }
}
