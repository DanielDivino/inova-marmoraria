import { calcularLinha, calcularLinhaServico, calcularTotalCartao, calcularTotalOrcamento, type BillingUnit } from '../calculos/quote-calculator.js';
import { calcularSubtotalMaterial } from '../calculos/components.js';
import { calcularAcabamentoBorda } from '../orcamentos/edge-finishes.js';
import { contourArea } from './geometry.js';
import type { Feature, Piece, TechnicalDocument } from './schema.js';

/**
 * Estimativa de valor a partir do desenho técnico. Só é exibida: o valor do
 * orçamento nunca muda por causa do desenho. Usa as mesmas funções e regras do
 * orçamento (quote.service / montarItem):
 * - pedra: área × preço vigente do material (m²);
 * - rodabanca: peça da mesma pedra, área = extensão × altura;
 * - saia: acabamento de borda cobrado pela área (extensão × altura) no preço da pedra;
 * - acabamentos de borda: serviço por metro linear;
 * - cuba, recorte e furo: serviço por unidade (ou m²/fixo, conforme o catálogo);
 * - serviços gerais: calcularLinhaServico (com os incrementos de área do jateado/rebaixo);
 * - à vista (Pix) é o próprio total; no cartão, +10% (calcularTotalCartao).
 */
export type MaterialCatalogo = { id: string; name: string; billingUnit: BillingUnit; currentPrice: number | null };
export type ServicoCatalogo = { id: string; name: string; billingUnit: BillingUnit; currentPrice: number };
export type CatalogoEstimativa = { materials: MaterialCatalogo[]; services: ServicoCatalogo[] };
export type OpcoesEstimativa = {
  /** Serviço escolhido para um componente (cuba, furo, acabamento), no lugar do sugerido. */
  servicoDoRecurso?: Record<string, string>;
  /** Serviços do projeto inteiro (ex.: jateado, instalação). */
  servicosGerais?: { serviceId: string; quantidade?: number }[];
};
export type LinhaEstimativa = {
  id: string; pieceId?: string; grupo: 'PEDRA' | 'SERVICO';
  descricao: string; quantidade: number; unidade: 'm²' | 'm' | 'un' | 'serviço';
  precoUnitario: number | null; subtotal: number | null;
  /** Por que a linha ficou sem preço (não entra no total). */
  semPreco?: string;
};
export type EstimativaDesenho = { areaTotalM2: number; linhas: LinhaEstimativa[]; total: number; totalPix: number; totalCartao: number; itensSemPreco: number };

const arredondarArea = (m2: number) => Math.round(m2 * 1_000_000) / 1_000_000;
/**
 * Área cobrada da peça: o contorno inteiro, sem descontar cubas e recortes — a
 * pedra é cortada da chapa inteira, como no orçamento (comprimento × largura).
 * Se a regra mudar (ex.: cobrar o retângulo que envolve a peça irregular), mude só aqui.
 */
export const areaCobradaPecaM2 = (peca: Piece) => arredondarArea(contourArea(peca.contour) / 1_000_000);
const areaFaixaM2 = (recurso: Feature) => arredondarArea(Math.max(0, recurso.extentMm) * Math.max(0, recurso.heightMm) / 1_000_000);
const mmInteiro = (mm: number) => Math.max(1, Math.round(mm));

const normalizarNome = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
/** Serviço sugerido para cada componente, pelos nomes usados no orçamento (o primeiro que existir). */
const SUGESTOES: Record<string, string[]> = {
  SINK: ['recorte de cuba', 'corte de cuba quadrado'], SINK_OVAL: ['corte de cuba oval', 'recorte de cuba'],
  SCULPTED_SINK: ['cuba esculpida', 'cuba escupido'], HOLE: ['furo de torneira', 'furo de cuba'],
  CUTOUT: ['corte para fogao', 'furo de cooktop/lixeira/torre'],
  EDGE_SIMPLE: ['acabamento simples'], EDGE_MITER45: ['acabamento 45°', 'acabamento 45° — granito/marmore'],
  EDGE_ROUND: ['acabamento boleado', 'acabamento meia cana'], EDGE_BEVEL: ['chanfro', 'acabamento chanfrado'],
};
export function servicoSugerido(recurso: Pick<Feature, 'type' | 'shape' | 'profile'>, servicos: ServicoCatalogo[]): ServicoCatalogo | undefined {
  const chave = recurso.type === 'EDGE_FINISH' ? `EDGE_${recurso.profile}` : recurso.type === 'SINK' && recurso.shape === 'OVAL' ? 'SINK_OVAL' : recurso.type;
  for (const nome of SUGESTOES[chave] ?? []) {
    const encontrado = servicos.find((servico) => normalizarNome(servico.name) === normalizarNome(nome));
    if (encontrado) return encontrado;
  }
  return undefined;
}

type PrecoPedra = { material: MaterialCatalogo; preco: number } | { semPreco: string };
function precoDaPedra(peca: Piece, catalogo: CatalogoEstimativa): PrecoPedra {
  const material = peca.material?.id ? catalogo.materials.find((entrada) => entrada.id === peca.material!.id) : undefined;
  if (!material) return { semPreco: 'Escolha a pedra da peça.' };
  if (material.currentPrice === null || !Number.isFinite(material.currentPrice)) return { semPreco: `${material.name} está sem preço vigente.` };
  if (material.billingUnit !== 'SQUARE_METER') return { semPreco: `${material.name} não é cobrado por m².` };
  return { material, preco: material.currentPrice };
}

export function estimarDesenho(doc: TechnicalDocument, catalogo: CatalogoEstimativa, opcoes: OpcoesEstimativa = {}): EstimativaDesenho {
  const linhas: LinhaEstimativa[] = [];
  let areaTotalM2 = 0;
  const servicoDe = (recurso: Feature) => {
    const escolhido = opcoes.servicoDoRecurso?.[recurso.id];
    return escolhido ? catalogo.services.find((servico) => servico.id === escolhido) : servicoSugerido(recurso, catalogo.services);
  };

  for (const peca of doc.pieces) {
    const pedra = precoDaPedra(peca, catalogo);
    const area = areaCobradaPecaM2(peca);
    areaTotalM2 += area;
    linhas.push({ id: peca.id, pieceId: peca.id, grupo: 'PEDRA', descricao: 'material' in pedra ? `${peca.name} · ${pedra.material.name}` : peca.name, quantidade: area, unidade: 'm²',
      ...('material' in pedra ? { precoUnitario: pedra.preco, subtotal: calcularSubtotalMaterial(area, pedra.preco) } : { precoUnitario: null, subtotal: null, semPreco: pedra.semPreco }) });

    for (const recurso of doc.features.filter((entrada) => entrada.pieceId === peca.id)) {
      const base = { id: recurso.id, pieceId: peca.id };
      if (recurso.type === 'BACKSPLASH') {
        // No orçamento a rodabanca é uma peça da mesma pedra (área = comprimento × altura).
        const area = areaFaixaM2(recurso);
        areaTotalM2 += area;
        linhas.push({ ...base, grupo: 'PEDRA', descricao: `${recurso.name} · ${peca.name}`, quantidade: area, unidade: 'm²',
          ...('material' in pedra ? { precoUnitario: pedra.preco, subtotal: calcularSubtotalMaterial(area, pedra.preco) } : { precoUnitario: null, subtotal: null, semPreco: pedra.semPreco }) });
        continue;
      }
      if (recurso.type === 'SKIRT') {
        const quantidade = areaFaixaM2(recurso);
        if (!('material' in pedra)) { linhas.push({ ...base, grupo: 'SERVICO', descricao: `${recurso.name} · ${peca.name}`, quantidade, unidade: 'm²', precoUnitario: null, subtotal: null, semPreco: pedra.semPreco }); continue; }
        const calculo = calcularAcabamentoBorda({ name: 'Saia', lengthMm: mmInteiro(recurso.extentMm), heightMm: mmInteiro(recurso.heightMm), quantity: 1, materialPrice: pedra.preco, servicePrice: 0 });
        linhas.push({ ...base, grupo: 'SERVICO', descricao: `${recurso.name} · ${peca.name}`, quantidade: calculo.billedQuantity, unidade: 'm²', precoUnitario: calculo.unitPrice, subtotal: calculo.subtotal });
        continue;
      }
      const servico = servicoDe(recurso);
      if (recurso.type === 'EDGE_FINISH') {
        const metros = Math.max(0, recurso.extentMm) / 1000;
        if (!servico) { linhas.push({ ...base, grupo: 'SERVICO', descricao: `${recurso.name} · ${peca.name}`, quantidade: metros, unidade: 'm', precoUnitario: null, subtotal: null, semPreco: 'Escolha o serviço de acabamento.' }); continue; }
        if (servico.billingUnit !== 'LINEAR_METER') { linhas.push({ ...base, grupo: 'SERVICO', descricao: `${servico.name} · ${peca.name}`, quantidade: metros, unidade: 'm', precoUnitario: null, subtotal: null, semPreco: 'Acabamento de borda precisa de serviço por metro linear.' }); continue; }
        const calculo = calcularAcabamentoBorda({ name: servico.name, lengthMm: mmInteiro(recurso.extentMm), quantity: 1, materialPrice: 'material' in pedra ? pedra.preco : 0, servicePrice: servico.currentPrice });
        linhas.push({ ...base, grupo: 'SERVICO', descricao: `${servico.name} · ${peca.name}`, quantidade: calculo.billedQuantity, unidade: calculo.billingUnit === 'SQUARE_METER' ? 'm²' : 'm', precoUnitario: calculo.unitPrice, subtotal: calculo.subtotal });
        continue;
      }
      // Cuba, cuba esculpida, recorte e furo: mesma regra dos recortes do orçamento.
      const descricao = `${servico?.name ?? recurso.name} · ${peca.name}`;
      if (!servico) { linhas.push({ ...base, grupo: 'SERVICO', descricao, quantidade: 1, unidade: 'un', precoUnitario: null, subtotal: null, semPreco: 'Escolha o serviço deste componente.' }); continue; }
      if (servico.billingUnit === 'LINEAR_METER') { linhas.push({ ...base, grupo: 'SERVICO', descricao, quantidade: 1, unidade: 'un', precoUnitario: null, subtotal: null, semPreco: 'Recortes não usam serviço por metro linear.' }); continue; }
      const largura = recurso.type === 'HOLE' ? recurso.diameterMm : recurso.widthMm, comprimento = recurso.type === 'HOLE' ? recurso.diameterMm : recurso.lengthMm;
      const quantidade = servico.billingUnit === 'SQUARE_METER' ? arredondarArea(largura * comprimento / 1_000_000) : 1;
      const linha = calcularLinha({ billingUnit: servico.billingUnit, unitPrice: servico.currentPrice, billedQuantity: quantidade });
      linhas.push({ ...base, grupo: 'SERVICO', descricao, quantidade: linha.billedQuantity, unidade: servico.billingUnit === 'SQUARE_METER' ? 'm²' : servico.billingUnit === 'FIXED' ? 'serviço' : 'un', precoUnitario: servico.currentPrice, subtotal: linha.subtotal });
    }
  }

  areaTotalM2 = arredondarArea(areaTotalM2);
  for (const [indice, geral] of (opcoes.servicosGerais ?? []).entries()) {
    const servico = catalogo.services.find((entrada) => entrada.id === geral.serviceId);
    const id = `geral-${indice}`;
    if (!servico) { linhas.push({ id, grupo: 'SERVICO', descricao: 'Serviço removido do catálogo', quantidade: 0, unidade: 'un', precoUnitario: null, subtotal: null, semPreco: 'Serviço não encontrado.' }); continue; }
    // Como no orçamento: m² usa a área de todas as peças (rebaixo italiano vezes a quantidade); fixo vale 1.
    const quantidade = servico.billingUnit === 'SQUARE_METER' ? areaTotalM2 * (/rebaixo italiano/i.test(servico.name) ? geral.quantidade ?? 1 : 1) : servico.billingUnit === 'FIXED' ? 1 : geral.quantidade ?? 1;
    const unidade = servico.billingUnit === 'SQUARE_METER' ? 'm²' : servico.billingUnit === 'LINEAR_METER' ? 'm' : servico.billingUnit === 'FIXED' ? 'serviço' : 'un';
    if (!(quantidade > 0)) { linhas.push({ id, grupo: 'SERVICO', descricao: servico.name, quantidade: 0, unidade, precoUnitario: servico.currentPrice, subtotal: null, semPreco: 'Informe a quantidade.' }); continue; }
    const linha = calcularLinhaServico({ serviceName: servico.name, billingUnit: servico.billingUnit, unitPrice: servico.currentPrice, billedQuantity: quantidade });
    linhas.push({ id, grupo: 'SERVICO', descricao: servico.name, quantidade: linha.billedQuantity, unidade, precoUnitario: servico.currentPrice, subtotal: linha.subtotal });
  }

  const total = calcularTotalOrcamento(linhas.flatMap((linha) => linha.subtotal === null ? [] : [linha.subtotal]));
  return { areaTotalM2, linhas, total, totalPix: total, totalCartao: calcularTotalCartao(total), itensSemPreco: linhas.filter((linha) => linha.subtotal === null).length };
}
