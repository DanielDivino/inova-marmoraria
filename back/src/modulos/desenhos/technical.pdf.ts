import { dataAtualEmpresa } from '@inova/domain';
import { areasDaPeca, contourArea, distanciasAteBordas, edgeLength, formatMeasure, NOME_AREA, rotate, sampleContour, type Feature, type Piece, type TechnicalDocument } from '@inova/domain/technical';
import { cabecalhoEmpresaPdf, CNPJ_EMPRESA, normalizarNomeMaterial, pdfDate } from '../orcamentos/pdf-layout.js';
import { COR, ROTULO_RECURSO, centimetros, desenharPlanta, ehRecursoDeBorda, planejarPlanta } from './technical-planta.pdf.js';

export type DadosPdfTecnico = { customer: string; project: string; design: string; revision: number; hash: string; status?: string; createdAt?: Date | string };

/** Conteúdo vai até aqui; abaixo fica o rodapé de cada página. */
const LIMITE = 790;
const ROTULO_SITUACAO: Record<string, string> = { IN_REVIEW: 'Em conferência', APPROVED: 'Aprovada', RETURNED: 'Devolvida', RELEASED: 'Liberada para produção', SUPERSEDED: 'Substituída' };
const ROTULO_PERFIL: Record<Feature['profile'], string> = { SIMPLE: 'Simples', MITER45: 'Meia-esquadria 45°', BEVEL: 'Chanfro', ROUND: 'Boleado' };

const metrosQuadrados = (m2: number) => `${m2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const contagem = (n: number, um: string, varios: string) => n ? [`${n} ${n === 1 ? um : varios}`] : [];
const emLista = (partes: string[]) => partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0] ?? '';

/** Largura × profundidade da peça no próprio eixo, sem o giro dela na planta. */
function medidasDaPeca(peca: Piece) {
  const pontos = sampleContour(peca.contour, 2), xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  return `${formatMeasure(Math.max(...xs) - Math.min(...xs))} × ${formatMeasure(Math.max(...ys) - Math.min(...ys))}`;
}
function medidasDoRecorte(recurso: Feature) {
  if (recurso.type === 'HOLE') return `Ø ${Math.round(recurso.diameterMm)}mm`;
  const base = `${formatMeasure(recurso.widthMm)} × ${formatMeasure(recurso.lengthMm)}${recurso.shape === 'OVAL' ? ' (oval)' : ''}`;
  if (recurso.type === 'CUTOUT') return base;
  return `${base} · prof. ${centimetros(recurso.depthMm)}${recurso.type === 'SCULPTED_SINK' && recurso.slopePercent ? ` · caimento ${recurso.slopePercent.toLocaleString('pt-BR')}%` : ''}`;
}
/** Distâncias até as bordas com o lado em que ficam na planta (já com o giro da peça). */
function distanciasDoRecorte(recurso: Feature, peca: Piece) {
  const distancias = distanciasAteBordas(recurso, peca);
  if (!distancias.length) return 'Ver no desenho';
  return distancias.map(({ de, ate, distancia }) => {
    const v = rotate({ x: ate.x - de.x, y: ate.y - de.y }, peca.rotationDeg);
    const lado = Math.abs(v.x) >= Math.abs(v.y) ? (v.x < 0 ? 'esq.' : 'dir.') : (v.y < 0 ? 'abaixo' : 'acima');
    return `${lado} ${formatMeasure(distancia)}`;
  }).join(' · ');
}
/** Tipo do componente com o nome que ele recebeu: "Cuba inox 50×40", "Furo (torneira)"; nome que só repete o tipo ("Cuba 2") fica de fora. */
const tipoDoRecurso = (recurso: Feature) => {
  const tipo = ROTULO_RECURSO[recurso.type], nome = normalizarNomeMaterial(recurso.name);
  const [t, n] = [tipo.toLowerCase(), nome.toLowerCase()];
  if (!nome || nome === 'Componente' || t.includes(n) || n.replace(/\s*\d+$/, '') === t) return tipo;
  return n.startsWith(t) ? nome : `${tipo} (${nome})`;
};

type Coluna = { rotulo: string; w: number; alinhar?: 'left' | 'right' | 'center' };
/** Célula apagada: valor que não foi informado. */
type Celula = string | { fraco: string };

/**
 * PDF de uma revisão do desenho técnico, no mesmo padrão do orçamento e da
 * nota de entrega: cabeçalho da empresa, dados, resumo, a planta em escala e
 * as tabelas de peças, recortes e bordas. Sem valores comerciais. O documento
 * precisa de `bufferPages` para o rodapé "Página x de y".
 */
export function renderizarPdfTecnico(pdf: PDFKit.PDFDocument, documento: TechnicalDocument, dados: DadosPdfTecnico) {
  const revisao = `Revisão ${dados.revision}`;
  cabecalhoEmpresaPdf(pdf, 'DESENHO TÉCNICO', { number: revisao.toUpperCase() });
  let y = 130;
  const novaPagina = () => {
    pdf.addPage();
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(COR.tinta).text(`${dados.design} · ${revisao} · Continuação`, 36, 36, { lineBreak: false });
    y = 58;
  };
  const espaco = (altura: number) => { if (y + altura > LIMITE) novaPagina(); };
  const titulo = (texto: string) => { pdf.font('Helvetica-Bold').fontSize(10).fillColor(COR.tinta).text(texto, 36, y, { lineBreak: false }); y += 18; };

  // Dados em duas colunas: rótulo discreto e valor; o que não foi informado fica apagado.
  const situacao = dados.status ? ROTULO_SITUACAO[dados.status] ?? dados.status : null;
  const linhasDados: [string, string | null, boolean][][] = [
    [['Cliente', dados.customer, true], ['Data', dados.createdAt ? pdfDate(dataAtualEmpresa(new Date(dados.createdAt))) : null, false]],
    [['Projeto', dados.project, false], ['Situação', situacao, false]],
    [['Desenho', dados.design, false], ['Código', dados.hash.slice(0, 12), false]],
  ];
  for (const linha of linhasDados) {
    let altura = 0;
    linha.forEach(([rotulo, valor, negrito], coluna) => {
      const [xRotulo, xValor, largura] = coluna ? [382, 436, 123] : [36, 92, 270];
      pdf.font('Helvetica').fontSize(8.5).fillColor(COR.rotulo).text(rotulo, xRotulo, y, { lineBreak: false });
      pdf.font(negrito && valor ? 'Helvetica-Bold' : 'Helvetica').fillColor(valor ? COR.tinta : COR.apagado).text(valor || 'Não informado', xValor, y, { width: largura });
      altura = Math.max(altura, pdf.heightOfString(valor || 'Não informado', { width: largura }));
    });
    y += altura + 5;
  }
  y += 10;

  const pecas = documento.pieces;
  if (!pecas.length) {
    pdf.lineWidth(.8).roundedRect(36, y, 523, 56, 4).fillAndStroke(COR.creme, COR.borda);
    pdf.font('Helvetica').fontSize(10).fillColor(COR.rotulo).text('Nenhuma peça foi adicionada a esta revisão.', 36, y + 23, { width: 523, align: 'center', lineBreak: false });
  } else {
    const recortes = documento.features.filter((recurso) => !ehRecursoDeBorda(recurso));
    const bordas = documento.features.filter(ehRecursoDeBorda);
    const quantos = (tipos: Feature['type'][]) => documento.features.filter((recurso) => tipos.includes(recurso.type)).length;

    // Faixa de destaque com o resumo da revisão.
    const resumo = ` — ${emLista([
      ...contagem(pecas.length, 'peça', 'peças'), ...contagem(quantos(['SINK', 'SCULPTED_SINK']), 'cuba', 'cubas'), ...contagem(quantos(['CUTOUT']), 'recorte', 'recortes'),
      ...contagem(quantos(['HOLE']), 'furo', 'furos'), ...contagem(quantos(['SKIRT']), 'saia', 'saias'), ...contagem(quantos(['BACKSPLASH']), 'rodabanca', 'rodabancas'),
      ...contagem(quantos(['EDGE_FINISH']), 'acabamento de borda', 'acabamentos de borda'),
    ])}. Medidas em metros: 2m44 = 2,44 m; espessuras em centímetros.`;
    pdf.font('Helvetica').fontSize(9);
    const alturaResumo = pdf.heightOfString(revisao + resumo, { width: 499 }) + 14;
    pdf.lineWidth(.8).roundedRect(36, y, 523, alturaResumo, 4).fillAndStroke(COR.creme, COR.borda);
    pdf.font('Helvetica-Bold').fillColor(COR.ouro).text(revisao, 48, y + 7, { width: 499, continued: true }).font('Helvetica').fillColor(COR.tinta).text(resumo);
    y += alturaResumo + 14;

    // A planta fica inteira numa folha; se sobrar pouco espaço, vai para a próxima.
    if (LIMITE - y - 18 < 240) novaPagina();
    const planta = planejarPlanta(documento, Math.min(470, LIMITE - y - 18));
    titulo('Planta');
    desenharPlanta(pdf, documento, planta, y);
    y += planta.altura + 18;

    const tabela = (nome: string, colunas: Coluna[], linhas: Celula[][], total?: [string, string]) => {
      const xs = colunas.map((_, indice) => 36 + colunas.slice(0, indice).reduce((soma, coluna) => soma + coluna.w, 0));
      const cabecalho = () => {
        pdf.rect(36, y, 523, 22).fill(COR.cabecalho);
        pdf.font('Helvetica-Bold').fontSize(8).fillColor(COR.tinta);
        colunas.forEach((coluna, indice) => pdf.text(coluna.rotulo, xs[indice] + 8, y + 7, { width: coluna.w - 16, align: coluna.alinhar ?? 'left', lineBreak: false }));
        y += 22;
      };
      // Tabela curta fica inteira na mesma folha; a longa começa com pelo menos três linhas.
      pdf.font('Helvetica').fontSize(8.5);
      const alturas = linhas.map((linha) => Math.max(26, ...linha.map((celula, coluna) => pdf.heightOfString(typeof celula === 'string' ? celula : celula.fraco, { width: colunas[coluna].w - 16 }) + 14)));
      const rodape = total ? 22 : 0, soma = (lista: number[]) => lista.reduce((acumulado, altura) => acumulado + altura, 0);
      espaco(18 + 22 + (alturas.length <= 4 ? soma(alturas) + rodape : soma(alturas.slice(0, 3))));
      titulo(nome);
      cabecalho();
      linhas.forEach((linha, indice) => {
        const textos = linha.map((celula) => typeof celula === 'string' ? celula : celula.fraco), altura = alturas[indice];
        if (y + altura + (indice === linhas.length - 1 ? rodape : 0) > LIMITE) { novaPagina(); cabecalho(); }
        if (indice % 2) pdf.rect(36, y, 523, altura).fill(COR.zebra);
        textos.forEach((texto, coluna) => pdf.font('Helvetica').fontSize(8.5).fillColor(typeof linha[coluna] === 'string' ? COR.tinta : COR.apagado)
          .text(texto, xs[coluna] + 8, y + 8, { width: colunas[coluna].w - 16, align: colunas[coluna].alinhar ?? 'left' }));
        y += altura;
        pdf.lineWidth(.5).moveTo(36, y).lineTo(559, y).stroke(COR.linha);
      });
      pdf.lineWidth(1).moveTo(36, y).lineTo(559, y).stroke(COR.forte);
      y += 9;
      if (total) {
        const ultima = colunas[colunas.length - 1], x = xs[xs.length - 1];
        pdf.font('Helvetica-Bold').fontSize(9).fillColor(COR.tinta).text(total[0], x - 200, y, { width: 192, align: 'right', lineBreak: false })
          .text(total[1], x + 8, y, { width: ultima.w - 16, align: 'right', lineBreak: false });
        y += 13;
      }
      y += 16;
    };

    const nomePeca = (id: string) => pecas.find((peca) => peca.id === id)?.name ?? '';
    const areas = pecas.map((peca) => contourArea(peca.contour) / 1e6);
    tabela('Peças', [{ rotulo: 'Item', w: 34 }, { rotulo: 'Peça', w: 130 }, { rotulo: 'Medidas', w: 96 }, { rotulo: 'Espessura', w: 58 }, { rotulo: 'Material', w: 135 }, { rotulo: 'Área', w: 70, alinhar: 'right' }],
      pecas.map((peca, indice) => [String(indice + 1).padStart(2, '0'), peca.name, medidasDaPeca(peca), centimetros(peca.thicknessMm),
        peca.material?.name ? normalizarNomeMaterial(peca.material.name) : { fraco: 'Não informado' }, metrosQuadrados(areas[indice])]),
      ['Área total', metrosQuadrados(areas.reduce((soma, area) => soma + area, 0))]);

    if (recortes.length) tabela('Cubas, recortes e furos', [{ rotulo: 'Item', w: 34 }, { rotulo: 'Tipo', w: 110 }, { rotulo: 'Peça', w: 100 }, { rotulo: 'Medidas', w: 115 }, { rotulo: 'Distância até as bordas', w: 164 }],
      recortes.map((recurso, indice) => {
        const peca = pecas.find((entrada) => entrada.id === recurso.pieceId);
        return [String(indice + 1).padStart(2, '0'), tipoDoRecurso(recurso), nomePeca(recurso.pieceId), medidasDoRecorte(recurso), peca ? distanciasDoRecorte(recurso, peca) : { fraco: 'Peça removida' }];
      }));

    if (bordas.length) tabela('Saias, rodabancas e acabamentos', [{ rotulo: 'Item', w: 34 }, { rotulo: 'Tipo', w: 100 }, { rotulo: 'Peça', w: 95 }, { rotulo: 'Lado', w: 90 }, { rotulo: 'Extensão', w: 60 }, { rotulo: 'Altura', w: 50 }, { rotulo: 'Perfil', w: 94 }],
      bordas.map((recurso, indice) => {
        const peca = pecas.find((entrada) => entrada.id === recurso.pieceId);
        const lado = peca && recurso.edgeId ? peca.contour.findIndex((vertice) => vertice.id === recurso.edgeId) : -1;
        const onde: Celula = peca && lado >= 0 ? `Lado ${lado + 1} (${formatMeasure(edgeLength(peca, recurso.edgeId!))})${recurso.startMm > 0 ? `, a partir de ${formatMeasure(recurso.startMm)}` : ''}` : { fraco: 'Não informado' };
        return [String(indice + 1).padStart(2, '0'), tipoDoRecurso(recurso), nomePeca(recurso.pieceId), onde, formatMeasure(recurso.extentMm),
          recurso.type === 'EDGE_FINISH' ? { fraco: '—' } : centimetros(recurso.heightMm), ROTULO_PERFIL[recurso.profile]];
      }));

    // Área seca e molhada de cada balcão, da ponta esquerda da peça para a direita.
    const secaMolhada = pecas.flatMap((peca) => areasDaPeca(peca).map((area) => ({ peca, area })));
    if (secaMolhada.length) tabela('Áreas seca e molhada', [{ rotulo: 'Item', w: 34 }, { rotulo: 'Peça', w: 140 }, { rotulo: 'Área', w: 120 }, { rotulo: 'Tamanho', w: 80 }, { rotulo: 'Posição (da ponta esquerda)', w: 149 }],
      secaMolhada.map(({ peca, area }, indice) => [String(indice + 1).padStart(2, '0'), peca.name, NOME_AREA[area.tipo], formatMeasure(area.comprimentoMm),
        `de ${formatMeasure(area.inicioMm)} a ${formatMeasure(area.fimMm)}`]));

    const { notes, toleranceMm, minimumClearanceMm } = documento.manufacturing;
    const observacoes = [notes.trim(), toleranceMm !== null ? `Tolerância de fabricação: ${toleranceMm.toLocaleString('pt-BR')} mm.` : '', minimumClearanceMm !== null ? `Folga mínima entre peças: ${minimumClearanceMm.toLocaleString('pt-BR')} mm.` : ''].filter(Boolean);
    if (observacoes.length) {
      pdf.font('Helvetica').fontSize(8.5);
      espaco(18 + pdf.heightOfString(observacoes[0], { width: 523 }));
      titulo('Observações');
      for (const texto of observacoes) {
        espaco(pdf.font('Helvetica').fontSize(8.5).heightOfString(texto, { width: 523 }));
        pdf.fillColor(COR.tinta).text(texto, 36, y, { width: 523 });
        y = pdf.y + 4;
      }
    }
  }

  // Rodapé de todas as folhas, escrito no fim para saber o total de páginas.
  const { start, count } = pdf.bufferedPageRange();
  for (let pagina = start; pagina < start + count; pagina++) {
    pdf.switchToPage(pagina);
    const margem = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0; // Escrever abaixo da margem sem abrir outra folha.
    pdf.lineWidth(.5).moveTo(36, 808).lineTo(559, 808).stroke(COR.linha);
    pdf.font('Helvetica').fontSize(7).fillColor(COR.apagado).text(`Inova Marmoraria · CNPJ ${CNPJ_EMPRESA} · Documento técnico, sem valores comerciais`, 36, 814, { lineBreak: false })
      .text(`${revisao} · Página ${pagina - start + 1} de ${count}`, 380, 814, { width: 179, align: 'right', lineBreak: false });
    pdf.page.margins.bottom = margem;
  }
}
