import { dataAtualEmpresa } from '@inova/domain';
import { AREIA, VERDE, cabecalhoEmpresaPdf, CNPJ_EMPRESA, normalizarNomeMaterial, pdfDate } from '../orcamentos/pdf-layout.js';
import type { Conferencia, DocumentoNotaEntrega, DocumentoNotaEntregaGeral, LinhaConferencia, LinhaNotaEntrega } from './entrega.service.js';

type DadosNota = {
  number: string; createdAt: Date | string;
  quote: { number: string; customerNameSnapshot: string; customerPhoneSnapshot: string | null; workAddressSnapshot: string | null };
};
export type NotaEntregaPdf = DadosNota & { document: DocumentoNotaEntrega };
export type NotaEntregaGeralPdf = DadosNota & { document: DocumentoNotaEntregaGeral };

const COR = { tinta: '#17251f', rotulo: '#6f685e', apagado: '#9a9388', ouro: '#8a6320', linha: '#dfd9cf', forte: '#8f887c', cabecalho: AREIA.claro, zebra: AREIA.zebra, creme: '#fbf5e6', borda: '#e6cf8f' };
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
/** O que falta, com a situação de cada peça (pronta ou em produção) no lugar do "Conferido". */
const COLUNAS_SITUACAO: Coluna[] = [
  { rotulo: 'Item', x: 36, w: 40 }, { rotulo: 'Peça', x: 76, w: 125 }, { rotulo: 'Material', x: 201, w: 115 }, { rotulo: 'Medida', x: 316, w: 100 },
  { rotulo: 'Qtd.', x: 416, w: 36, alinhar: 'right' }, { rotulo: 'Situação', x: 452, w: 107 },
];
type Modo = 'conferir' | 'simples' | 'situacao';

/**
 * Partes da nota (cabeçalho, dados do cliente, faixa de destaque, tabelas, recebimento e rodapé),
 * escritas em sequência; a folha vira sozinha quando o conteúdo não cabe.
 */
function folhaDaNota(pdf: PDFKit.PDFDocument, nota: DadosNota, titulo: string) {
  cabecalhoEmpresaPdf(pdf, titulo, { number: nota.number });
  let y = 130;
  const novaPagina = () => {
    pdf.addPage();
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(COR.tinta).text(`${nota.number} · Continuação`, 36, 36, { lineBreak: false });
    y = 58;
  };
  const espaco = (altura: number) => { if (y + altura > LIMITE) novaPagina(); };

  /** Dados em duas colunas: rótulo discreto e valor; o que não foi informado fica apagado. */
  const dados = (linhas: [string, string | null, boolean][][]) => {
    for (const linha of linhas) {
      let altura = 0;
      linha.forEach(([rotulo, valor, negrito], coluna) => {
        const [xRotulo, xValor, largura] = coluna ? [382, 436, 123] : [36, 92, 270];
        pdf.font('Helvetica').fontSize(8.5).fillColor(COR.rotulo).text(rotulo, xRotulo, y, { lineBreak: false });
        pdf.font(negrito && valor ? 'Helvetica-Bold' : 'Helvetica').fillColor(valor ? COR.tinta : COR.apagado).text(valor || 'Não informado', xValor, y, { width: largura });
        altura = Math.max(altura, pdf.heightOfString(valor || 'Não informado', { width: largura }));
      });
      y += altura + 5;
    }
  };
  /** Faixa de destaque: entrega final ou parcial, com a contagem de peças. */
  const destaque = (titulo: string, resumo: string) => {
    y += 10;
    pdf.font('Helvetica').fontSize(9);
    const altura = pdf.heightOfString(titulo + resumo, { width: 499 }) + 14;
    pdf.lineWidth(0.8).roundedRect(36, y, 523, altura, 4).fillAndStroke(COR.creme, COR.borda);
    pdf.font('Helvetica-Bold').fillColor(COR.ouro).text(titulo, 48, y + 7, { width: 499, continued: true }).font('Helvetica').fillColor(COR.tinta).text(resumo);
    y += altura + 14;
  };
  const subtitulo = (texto: string, tamanho = 10) => {
    espaco(18 + 22 + 26);
    pdf.font('Helvetica-Bold').fontSize(tamanho).fillColor(COR.tinta).text(texto, 36, y, { lineBreak: false });
    y += tamanho + 8;
  };
  /** Tabela de peças: as entregues em verde, as que faltam na areia. */
  const tabela = (linhas: LinhaConferencia[], modo: Modo, rotuloTotal: string, tom: 'entregue' | 'falta') => {
    const cores = tom === 'entregue' ? { cabecalho: VERDE.claro, zebra: VERDE.zebra, forte: VERDE.forte } : { cabecalho: COR.cabecalho, zebra: COR.zebra, forte: COR.forte };
    const conferir = modo === 'conferir';
    const colunas = modo === 'situacao' ? COLUNAS_SITUACAO : conferir ? COLUNAS : COLUNAS.slice(0, 5);
    const qtd = colunas[4];
    const cabecalho = () => {
      pdf.rect(36, y, 523, 22).fill(cores.cabecalho);
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(COR.tinta);
      for (const coluna of colunas) pdf.text(coluna.rotulo, coluna.x + 8, y + 7, { width: coluna.w - 16, align: coluna.alinhar ?? 'left', lineBreak: false });
      y += 22;
    };
    espaco(22 + 26);
    cabecalho();
    linhas.forEach((linha, indice) => {
      const celulas = [String(indice + 1).padStart(2, '0'), linha.name, normalizarNomeMaterial(linha.material), medida(linha), String(linha.quantity), ...(modo === 'situacao' ? [linha.situacao ?? ''] : [])];
      pdf.font('Helvetica').fontSize(8.5);
      const altura = Math.max(26, ...celulas.map((celula, coluna) => pdf.heightOfString(celula, { width: colunas[coluna].w - 16 }) + 14));
      if (y + altura > LIMITE) { novaPagina(); cabecalho(); }
      if (indice % 2) pdf.rect(36, y, 523, altura).fill(cores.zebra);
      pdf.font('Helvetica').fontSize(8.5).fillColor(COR.tinta);
      celulas.forEach((celula, coluna) => pdf.text(celula, colunas[coluna].x + 8, y + 8, { width: colunas[coluna].w - 16, align: colunas[coluna].alinhar ?? 'left' }));
      if (conferir) pdf.lineWidth(0.8).rect(523, y + altura / 2 - 5, 10, 10).stroke(cores.forte);
      y += altura;
      pdf.lineWidth(0.5).moveTo(36, y).lineTo(559, y).stroke(COR.linha);
    });
    pdf.lineWidth(1).moveTo(36, y).lineTo(559, y).stroke(cores.forte);
    y += 9;
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(COR.tinta).text(rotuloTotal, qtd.x - 200, y, { width: 192, align: 'right', lineBreak: false })
      .text(String(soma(linhas)), qtd.x + 8, y, { width: qtd.w - 16, align: 'right', lineBreak: false });
    y += 22;
  };
  /** Recebimento: observações, declaração, data e as duas assinaturas ficam juntas na mesma folha. */
  const recebimento = (declaracao: string) => {
    y += 14;
    espaco(215);
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(COR.tinta).text('Observações de entrega', 36, y, { lineBreak: false });
    y += 12;
    for (let linha = 0; linha < 3; linha++) { y += 20; pdf.lineWidth(0.5).moveTo(36, y).lineTo(559, y).stroke('#cfc9bf'); }
    y += 24;
    pdf.font('Helvetica').fontSize(8.5).fillColor(COR.tinta).text(declaracao, 36, y, { width: 523 });
    y = pdf.y + 16;
    pdf.text('Data da entrega: ____ / ____ / ________', 36, y, { lineBreak: false });
    y += 50;
    for (const [x, titulo, detalhe] of [[36, 'Cliente / recebedor', 'Assinatura e nome legível'], [322, 'Responsável pela entrega', 'Inova Marmoraria']] as const) {
      pdf.lineWidth(0.7).moveTo(x, y).lineTo(x + 237, y).stroke(COR.tinta);
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(COR.tinta).text(titulo, x, y + 6, { width: 237, align: 'center', lineBreak: false });
      pdf.font('Helvetica').fontSize(7.5).fillColor(COR.rotulo).text(detalhe, x, y + 17, { width: 237, align: 'center', lineBreak: false });
    }
  };
  /** Rodapé de todas as folhas, escrito no fim para saber o total de páginas. */
  const rodape = (identificacao = nota.number) => {
    const { start, count } = pdf.bufferedPageRange();
    for (let pagina = start; pagina < start + count; pagina++) {
      pdf.switchToPage(pagina);
      const margem = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0; // Escrever abaixo da margem sem abrir outra folha.
      pdf.lineWidth(0.5).moveTo(36, 808).lineTo(559, 808).stroke(COR.linha);
      pdf.font('Helvetica').fontSize(7).fillColor(COR.apagado).text(`Inova Marmoraria · CNPJ ${CNPJ_EMPRESA}`, 36, 814, { lineBreak: false })
        .text(`${identificacao} · Página ${pagina - start + 1} de ${count}`, 300, 814, { width: 259, align: 'right', lineBreak: false });
      pdf.page.margins.bottom = margem;
    }
  };
  const cliente = (rotuloData = 'Data', data = pdfDate(dataAtualEmpresa(new Date(nota.createdAt)))): [string, string | null, boolean][][] => [
    [['Cliente', nota.quote.customerNameSnapshot, true], ['Orçamento', nota.quote.number, false]],
    [['Telefone', nota.quote.customerPhoneSnapshot, false], [rotuloData, data, false]],
  ];
  /** Linha de texto corrido (ex.: as notas de entrega emitidas). */
  const paragrafo = (texto: string) => {
    pdf.font('Helvetica').fontSize(8.5);
    const altura = pdf.heightOfString(texto, { width: 523 });
    espaco(altura + 4);
    pdf.fillColor(COR.rotulo).text(texto, 36, y, { width: 523 });
    y += altura + 10;
  };
  /** Assinatura de quem conferiu (nota de conferência). */
  const conferidoPor = () => {
    y += 18;
    espaco(70);
    pdf.font('Helvetica').fontSize(8.5).fillColor(COR.tinta).text('Data da conferência: ____ / ____ / ________', 36, y, { lineBreak: false });
    y += 46;
    pdf.lineWidth(0.7).moveTo(36, y).lineTo(273, y).stroke(COR.tinta);
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(COR.tinta).text('Conferido por', 36, y + 6, { width: 237, align: 'center', lineBreak: false });
  };
  return { dados, destaque, subtitulo, tabela, recebimento, rodape, cliente, paragrafo, conferidoPor, avancar: (altura: number) => { y += altura; } };
}

/**
 * Nota de entrega de um projeto: dados do cliente, as peças entregues para
 * conferir, as que ainda faltam (entrega parcial), o recebimento e as
 * assinaturas. Sem valores. O documento precisa de `bufferPages` para o
 * rodapé "Página x de y".
 */
export function renderizarNotaEntregaPdf(pdf: PDFKit.PDFDocument, nota: NotaEntregaPdf) {
  const { document } = nota;
  const folha = folhaDaNota(pdf, nota, 'NOTA DE ENTREGA E CONFERÊNCIA');
  folha.dados([...folha.cliente(), [['Projeto', document.projectName, false], ['Endereço', nota.quote.workAddressSnapshot, false]]]);
  const entregues = soma(document.delivered), faltam = soma(document.remaining);
  const antes = document.deliveredBefore ? `, ${pecas(document.deliveredBefore)} já ${document.deliveredBefore === 1 ? 'entregue' : 'entregues'} antes` : '';
  folha.destaque(faltam ? 'Entrega parcial' : 'Entrega final', faltam
    ? ` — ${pecas(entregues)} nesta nota${antes}. Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${pecas(faltam)}, listadas abaixo.`
    : ` — ${pecas(entregues)} nesta nota${antes}. Com ela, todas as peças do projeto foram entregues.`);
  folha.tabela(document.delivered, 'conferir', 'Total de peças', 'entregue');
  if (document.remaining.length) {
    folha.avancar(8);
    folha.subtitulo('Peças que ainda faltam entregar');
    folha.tabela(document.remaining, 'simples', 'Total que falta', 'falta');
  }
  folha.recebimento(`Declaro que recebi e conferi as peças descritas acima, em perfeito estado e conforme o projeto contratado${faltam ? ', ciente das que ainda faltam entregar' : ''}.`);
  folha.rodape();
}

/**
 * Nota de entrega geral: todos os projetos do orçamento. De cada projeto, as peças entregues nesta
 * nota (para conferir), as já entregues antes e as que ainda faltam; no alto, o resumo geral.
 */
export function renderizarNotaEntregaGeralPdf(pdf: PDFKit.PDFDocument, nota: NotaEntregaGeralPdf) {
  const { projects } = nota.document;
  const folha = folhaDaNota(pdf, nota, 'NOTA DE ENTREGA GERAL E CONFERÊNCIA');
  folha.dados([...folha.cliente(), [['Projetos', `${projects.length} ${projects.length === 1 ? 'projeto' : 'projetos'}`, false], ['Endereço', nota.quote.workAddressSnapshot, false]]]);
  const total = (campo: 'delivered' | 'deliveredBefore' | 'remaining') => projects.reduce((soma_, projeto) => soma_ + soma(projeto[campo]), 0);
  const entregues = total('delivered'), antes = total('deliveredBefore'), faltam = total('remaining');
  const jaAntes = antes ? `, ${pecas(antes)} já ${antes === 1 ? 'entregue' : 'entregues'} antes` : '';
  folha.destaque(faltam ? 'Entrega parcial' : 'Entrega final', faltam
    ? ` — ${pecas(entregues)} nesta nota${jaAntes}. Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${pecas(faltam)}, listadas em cada projeto.`
    : ` — ${pecas(entregues)} nesta nota${jaAntes}. Com ela, todas as peças de todos os projetos foram entregues.`);
  projects.forEach((projeto, indice) => {
    if (indice) folha.avancar(6);
    const [agora, ja, resto] = [soma(projeto.delivered), soma(projeto.deliveredBefore), soma(projeto.remaining)];
    const situacao = [agora ? `${pecas(agora)} nesta nota` : '', ja ? `${pecas(ja)} já ${ja === 1 ? 'entregue' : 'entregues'}` : '', resto ? (resto === 1 ? 'falta 1 peça' : `faltam ${pecas(resto)}`) : ''].filter(Boolean).join(' · ');
    folha.subtitulo(`${String(indice + 1).padStart(2, '0')}. ${projeto.projectName}${situacao ? `  —  ${situacao}` : ''}`, 11);
    if (projeto.delivered.length) folha.tabela(projeto.delivered, 'conferir', 'Entregues nesta nota', 'entregue');
    if (projeto.deliveredBefore.length) { folha.subtitulo('Já entregues antes', 9); folha.tabela(projeto.deliveredBefore, 'simples', 'Já entregues', 'entregue'); }
    if (projeto.remaining.length) { folha.subtitulo('Ainda faltam entregar', 9); folha.tabela(projeto.remaining, 'simples', 'Faltam', 'falta'); }
  });
  folha.recebimento(`Declaro que recebi e conferi as peças entregues nesta nota, em perfeito estado e conforme o projeto contratado${faltam ? ', ciente das que ainda faltam entregar' : ''}.`);
  folha.rodape();
}

/**
 * Nota de conferência: a situação de agora (sem registrar nada), do orçamento todo ou de um projeto.
 * De cada projeto, as peças já entregues (para conferir), as que faltam com a situação (pronta ou em
 * produção) e as notas de entrega emitidas. Gerada de novo, já traz as entregas mais recentes.
 */
export function renderizarNotaConferenciaPdf(pdf: PDFKit.PDFDocument, conferencia: Conferencia, geradaEm: Date) {
  const { projects, quote, geral } = conferencia;
  const identificacao = `${quote.number} · Conferência`;
  const folha = folhaDaNota(pdf, { number: identificacao, createdAt: geradaEm, quote }, geral ? 'NOTA DE CONFERÊNCIA GERAL' : 'NOTA DE CONFERÊNCIA');
  const hora = geradaEm.toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  folha.dados([...folha.cliente('Gerada em', hora), [[geral ? 'Projetos' : 'Projeto', geral ? `${projects.length} ${projects.length === 1 ? 'projeto' : 'projetos'}` : projects[0]?.projectName ?? null, false], ['Endereço', quote.workAddressSnapshot, false]]]);
  const total = (campo: 'delivered' | 'remaining') => projects.reduce((somado, projeto) => somado + soma(projeto[campo]), 0);
  const entregues = total('delivered'), faltam = total('remaining'), todas = entregues + faltam;
  const notas = new Set(projects.flatMap((projeto) => projeto.notas.map((notaEmitida) => notaEmitida.number))).size;
  const emNotas = notas ? ` em ${notas} ${notas === 1 ? 'nota de entrega' : 'notas de entrega'}` : '';
  folha.destaque(faltam ? `Entregue ${entregues} de ${pecas(todas)}` : 'Tudo entregue', faltam
    ? `${emNotas}. ${faltam === 1 ? 'Falta 1 peça' : `Faltam ${pecas(faltam)}`}, com a situação de cada uma.`
    : ` — ${pecas(entregues)}${emNotas}.`);
  projects.forEach((projeto, indice) => {
    if (indice) folha.avancar(6);
    const [ja, resto] = [soma(projeto.delivered), soma(projeto.remaining)];
    const situacao = [`${ja} de ${pecas(ja + resto)} ${ja === 1 ? 'entregue' : 'entregues'}`, resto ? (resto === 1 ? 'falta 1' : `faltam ${resto}`) : 'completo'].join(' · ');
    folha.subtitulo(`${geral ? `${String(indice + 1).padStart(2, '0')}. ` : ''}${projeto.projectName}  —  ${situacao}`, 11);
    if (projeto.delivered.length) { folha.subtitulo('Entregues', 9); folha.tabela(projeto.delivered, 'conferir', 'Entregues', 'entregue'); }
    if (projeto.remaining.length) { folha.subtitulo('Faltam entregar', 9); folha.tabela(projeto.remaining, 'situacao', 'Faltam', 'falta'); }
    if (projeto.notas.length) folha.paragrafo(`Notas de entrega: ${projeto.notas.map((notaEmitida) => `${notaEmitida.number} de ${pdfDate(dataAtualEmpresa(new Date(notaEmitida.createdAt)))} (${pecas(notaEmitida.pieces)})`).join(' · ')}.`);
  });
  folha.conferidoPor();
  folha.rodape(identificacao);
}
