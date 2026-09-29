import { calcularLinha, calcularLinhaServico, calcularTotalCartao, calcularTotalOrcamento, type BillingUnit } from '../calculos/quote-calculator.js';
import { calcularAreaRetangularM2, medidaM2Fechado, somarAreasComponentes } from '../calculos/components.js';
import { calcularAcabamentoBorda } from '../orcamentos/edge-finishes.js';
import { formatMeasure, nomeDaPeca, type Piece, type TechnicalDocument } from './schema.js';
import { desenhoParaOrcamento, nomeDoRecurso, retangulosDaPeca, type ComponenteDoDesenho, type ItemDoDesenho, type OpcoesConversao } from './orcamento.js';

/**
 * Valor do desenho técnico, calculado sobre o mesmo projeto que vai para o
 * orçamento (`desenhoParaOrcamento`) e com as mesmas contas do resumo do
 * orçamento e da API (montarItem):
 * - pedra: área de cada parte × preço vigente; com M² fechado, cada medida da
 *   parte arredondada para cima de 5 em 5 cm (só a pedra; o resto usa a medida exata);
 * - rodabanca: peça da mesma pedra (extensão × altura), com a mesma regra;
 * - saia: borda "Saia", área (extensão × altura) no preço da pedra;
 * - acabamento de borda: serviço por metro linear;
 * - cuba, recorte e furo: serviço por unidade (ou m²/fixo, conforme o catálogo);
 * - serviços do projeto: calcularLinhaServico sobre a área exata de todas as peças;
 * - à vista (Pix) é o próprio total; no cartão, +10% (calcularTotalCartao).
 * Só entra no orçamento quando o desenho é usado nele ("Usar no orçamento").
 */
export type MaterialCatalogo = { id: string; name: string; billingUnit: BillingUnit; currentPrice: number | null };
export type ServicoCatalogo = { id: string; name: string; billingUnit: BillingUnit; currentPrice: number };
export type CatalogoEstimativa = { materials: MaterialCatalogo[]; services: ServicoCatalogo[] };
export type OpcoesEstimativa = OpcoesConversao & {
  /** M² fechado da empresa (Materiais e serviços): arredonda as medidas das peças só para cobrar a pedra. */
  m2Fechado?: boolean;
};
export type LinhaEstimativa = {
  id: string; pieceId?: string; grupo: 'PEDRA' | 'SERVICO';
  descricao: string; quantidade: number; unidade: 'm²' | 'm' | 'un' | 'serviço';
  precoUnitario: number | null; subtotal: number | null;
  /** Partes da peça, retângulo cobrado ou M² fechado. */
  detalhe?: string;
  /** Por que a linha ficou sem preço (não entra no total e impede usar no orçamento). */
  semPreco?: string;
};
export type EstimativaDesenho = {
  /** Área exata das peças e a cobrada pela pedra (com M² fechado, as medidas arredondadas; é a que o resumo do orçamento mostra). */
  areaTotalM2: number; areaCobradaM2: number; linhas: LinhaEstimativa[]; total: number; totalPix: number; totalCartao: number; itensSemPreco: number;
  /** O projeto que vai para o orçamento (mesmas peças, bordas, recortes e serviços destas linhas). */
  item: ItemDoDesenho;
  /** O que falta para o desenho poder ir para o orçamento. */
  problemas: string[];
};

const arredondarArea = (m2: number) => Math.round(m2 * 1_000_000) / 1_000_000;
/** Área cobrada de uma parte (ou rodabanca), com o M² fechado quando ligado. */
export const areaCobradaComponenteM2 = (componente: Pick<ComponenteDoDesenho, 'lengthMm' | 'widthMm'>, m2Fechado = false) => m2Fechado
  ? calcularAreaRetangularM2(medidaM2Fechado(componente.lengthMm), medidaM2Fechado(componente.widthMm))
  : calcularAreaRetangularM2(componente.lengthMm, componente.widthMm);
/** Área cobrada da peça: as partes em esquadro (L, U) ou o retângulo que envolve a peça curva; cubas não descontam. */
export const areaCobradaPecaM2 = (peca: Piece, m2Fechado = false) => arredondarArea(retangulosDaPeca(peca).retangulos
  .reduce((soma, r) => soma + areaCobradaComponenteM2({ lengthMm: r.x1 - r.x0, widthMm: r.y1 - r.y0 }, m2Fechado), 0));
const medidas = (componente: Pick<ComponenteDoDesenho, 'lengthMm' | 'widthMm'>) => `${formatMeasure(componente.lengthMm)} × ${formatMeasure(componente.widthMm)}`;
const fechadas = (componente: Pick<ComponenteDoDesenho, 'lengthMm' | 'widthMm'>) => ({ lengthMm: medidaM2Fechado(componente.lengthMm), widthMm: medidaM2Fechado(componente.widthMm) });

type PrecoPedra = { material: MaterialCatalogo; preco: number } | { semPreco: string };
function precoDaPedra(materialId: string | undefined, catalogo: CatalogoEstimativa): PrecoPedra {
  const material = materialId ? catalogo.materials.find((entrada) => entrada.id === materialId) : undefined;
  if (!material) return { semPreco: 'Escolha a pedra da peça.' };
  if (material.currentPrice === null || !Number.isFinite(material.currentPrice)) return { semPreco: `${material.name} está sem preço vigente.` };
  if (material.billingUnit !== 'SQUARE_METER') return { semPreco: `${material.name} não é cobrado por m².` };
  return { material, preco: material.currentPrice };
}
const unidadeDe = (billingUnit: BillingUnit): LinhaEstimativa['unidade'] => billingUnit === 'SQUARE_METER' ? 'm²' : billingUnit === 'LINEAR_METER' ? 'm' : billingUnit === 'FIXED' ? 'serviço' : 'un';

export function estimarDesenho(doc: TechnicalDocument, catalogo: CatalogoEstimativa, opcoes: OpcoesEstimativa = {}): EstimativaDesenho {
  const item = desenhoParaOrcamento(doc, catalogo.services, opcoes);
  const m2Fechado = !!opcoes.m2Fechado;
  const linhas: LinhaEstimativa[] = [];
  const valorDaPedra = (componente: ComponenteDoDesenho, preco: number) => calcularLinha({ billingUnit: 'SQUARE_METER', unitPrice: preco, billedQuantity: areaCobradaComponenteM2(componente, m2Fechado) }).subtotal;
  const notaFechado = (lista: ComponenteDoDesenho[]) => m2Fechado && lista.some((c) => medidaM2Fechado(c.lengthMm) !== c.lengthMm || medidaM2Fechado(c.widthMm) !== c.widthMm)
    ? `m² fechado: ${lista.map((c) => medidas(fechadas(c))).join(' + ')}` : '';

  for (const peca of doc.pieces) {
    const nome = nomeDaPeca(peca, doc.pieces);
    const partes = item.componentes.filter((componente) => componente.pecaId === peca.id && componente.componentType === 'TOP');
    const pedra = precoDaPedra(partes[0]?.materialId, catalogo);
    const detalhe = [
      partes.length > 1 ? `${partes.length} partes: ${partes.map(medidas).join(' + ')}` : partes[0]?.envolvente ? `Peça curva ou diagonal: cobrada pelo retângulo ${medidas(partes[0])}` : '',
      notaFechado(partes),
    ].filter(Boolean).join(' · ');
    linhas.push({ id: peca.id, pieceId: peca.id, grupo: 'PEDRA', descricao: 'material' in pedra ? `${nome} · ${pedra.material.name}` : nome,
      quantidade: arredondarArea(partes.reduce((soma, parte) => soma + areaCobradaComponenteM2(parte, m2Fechado), 0)), unidade: 'm²', ...(detalhe ? { detalhe } : {}),
      ...('material' in pedra ? { precoUnitario: pedra.preco, subtotal: calcularTotalOrcamento(partes.map((parte) => valorDaPedra(parte, pedra.preco))) } : { precoUnitario: null, subtotal: null, semPreco: pedra.semPreco }) });

    for (const recurso of doc.features.filter((entrada) => entrada.pieceId === peca.id)) {
      const base = { id: recurso.id, pieceId: peca.id, grupo: 'SERVICO' as const };
      if (recurso.type === 'BACKSPLASH') {
        const rodabanca = item.componentes.find((componente) => componente.recursoId === recurso.id);
        if (!rodabanca) continue;
        const nota = notaFechado([rodabanca]);
        linhas.push({ ...base, grupo: 'PEDRA', descricao: `${nomeDoRecurso(recurso)} · ${nome}`, quantidade: areaCobradaComponenteM2(rodabanca, m2Fechado), unidade: 'm²', ...(nota ? { detalhe: nota } : {}),
          ...('material' in pedra ? { precoUnitario: pedra.preco, subtotal: valorDaPedra(rodabanca, pedra.preco) } : { precoUnitario: null, subtotal: null, semPreco: pedra.semPreco }) });
        continue;
      }
      if (recurso.type === 'SKIRT' || recurso.type === 'EDGE_FINISH') {
        const bordas = item.componentes.flatMap((componente) => componente.bordas.filter((borda) => borda.recursoId === recurso.id));
        if (!bordas.length) continue;
        const servico = catalogo.services.find((entrada) => entrada.id === bordas[0].serviceId);
        const saia = recurso.type === 'SKIRT';
        const metros = bordas.reduce((soma, borda) => soma + borda.lengthMm, 0) / 1000;
        const semPreco = saia
          ? (!servico ? 'Cadastre o serviço “Saia” (metro linear) em Materiais e serviços.' : !('material' in pedra) ? pedra.semPreco : '')
          : (!servico ? 'Escolha o serviço de acabamento.' : servico.billingUnit !== 'LINEAR_METER' ? 'Acabamento de borda precisa de serviço por metro linear.' : '');
        const descricao = `${saia ? nomeDoRecurso(recurso) : servico?.name ?? nomeDoRecurso(recurso)} · ${nome}`;
        const partesTexto = bordas.length > 1 ? { detalhe: `${bordas.length} trechos: ${bordas.map((borda) => formatMeasure(borda.lengthMm)).join(' + ')}` } : {};
        if (semPreco || !servico) { linhas.push({ ...base, descricao, quantidade: saia ? arredondarArea(bordas.reduce((soma, borda) => soma + borda.lengthMm * (borda.heightMm ?? 0), 0) / 1_000_000) : metros, unidade: saia ? 'm²' : 'm', precoUnitario: null, subtotal: null, semPreco: semPreco || 'Escolha o serviço.', ...partesTexto }); continue; }
        const calculos = bordas.map((borda) => calcularAcabamentoBorda({ name: servico.name, lengthMm: borda.lengthMm, heightMm: borda.heightMm, quantity: 1, materialPrice: 'material' in pedra ? pedra.preco : 0, servicePrice: servico.currentPrice }));
        linhas.push({ ...base, descricao, quantidade: arredondarArea(calculos.reduce((soma, calculo) => soma + calculo.billedQuantity, 0)), unidade: calculos[0].billingUnit === 'SQUARE_METER' ? 'm²' : 'm',
          precoUnitario: calculos[0].unitPrice, subtotal: calcularTotalOrcamento(calculos.map((calculo) => calculo.subtotal)), ...partesTexto });
        continue;
      }
      // Cuba, cuba esculpida, recorte e furo: mesma regra dos recortes do orçamento.
      const recorte = item.recortes.find((entrada) => entrada.recursoId === recurso.id);
      if (!recorte) continue;
      const servico = catalogo.services.find((entrada) => entrada.id === recorte.serviceId);
      const descricao = `${servico?.name ?? nomeDoRecurso(recurso)} · ${nome}`;
      if (!servico) { linhas.push({ ...base, descricao, quantidade: 1, unidade: 'un', precoUnitario: null, subtotal: null, semPreco: 'Escolha o serviço deste componente.' }); continue; }
      if (servico.billingUnit === 'LINEAR_METER') { linhas.push({ ...base, descricao, quantidade: 1, unidade: 'un', precoUnitario: null, subtotal: null, semPreco: 'Recortes não usam serviço por metro linear.' }); continue; }
      const quantidade = servico.billingUnit === 'SQUARE_METER' ? calcularAreaRetangularM2(recorte.lengthMm, recorte.widthMm) : 1;
      const linha = calcularLinha({ billingUnit: servico.billingUnit, unitPrice: servico.currentPrice, billedQuantity: quantidade });
      linhas.push({ ...base, descricao, quantidade: linha.billedQuantity, unidade: unidadeDe(servico.billingUnit), precoUnitario: servico.currentPrice, subtotal: linha.subtotal });
    }
  }

  // Serviços do projeto: m² sobre a área exata de todas as peças (como a API), rebaixo italiano vezes a quantidade.
  const areaTotalM2 = item.componentes.length ? arredondarArea(somarAreasComponentes(item.componentes.map((componente) => ({ ...componente, label: componente.label, quantity: 1 })))) : 0;
  for (const geral of item.servicos) {
    const servico = catalogo.services.find((entrada) => entrada.id === geral.serviceId);
    const id = `geral-${geral.serviceId}`;
    if (!servico) { linhas.push({ id, grupo: 'SERVICO', descricao: 'Serviço removido do catálogo', quantidade: 0, unidade: 'un', precoUnitario: null, subtotal: null, semPreco: 'Serviço não encontrado.' }); continue; }
    const quantidade = servico.billingUnit === 'SQUARE_METER' ? areaTotalM2 * (/rebaixo italiano/i.test(servico.name) ? geral.quantidade : 1) : servico.billingUnit === 'FIXED' ? 1 : geral.quantidade;
    if (!(quantidade > 0)) { linhas.push({ id, grupo: 'SERVICO', descricao: servico.name, quantidade: 0, unidade: unidadeDe(servico.billingUnit), precoUnitario: servico.currentPrice, subtotal: null, semPreco: 'Informe a quantidade.' }); continue; }
    const linha = calcularLinhaServico({ serviceName: servico.name, billingUnit: servico.billingUnit, unitPrice: servico.currentPrice, billedQuantity: quantidade });
    linhas.push({ id, grupo: 'SERVICO', descricao: servico.name, quantidade: linha.billedQuantity, unidade: unidadeDe(servico.billingUnit), precoUnitario: servico.currentPrice, subtotal: linha.subtotal });
  }

  const total = calcularTotalOrcamento(linhas.flatMap((linha) => linha.subtotal === null ? [] : [linha.subtotal]));
  const problemas = [...(doc.pieces.length ? [] : ['Desenhe ao menos uma peça.']), ...linhas.filter((linha) => linha.subtotal === null).map((linha) => `${linha.descricao}: ${linha.semPreco ?? 'sem preço'}`)];
  const areaCobradaM2 = arredondarArea(item.componentes.reduce((soma, componente) => soma + areaCobradaComponenteM2(componente, m2Fechado), 0));
  return { areaTotalM2, areaCobradaM2, linhas, total, totalPix: total, totalCartao: calcularTotalCartao(total), itensSemPreco: linhas.filter((linha) => linha.subtotal === null).length, item, problemas };
}
