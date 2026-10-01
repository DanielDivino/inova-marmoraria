import { modoEntradaOrcamento, calcularAreaPeitorilDuplo, centimetrosParaMilimetros } from '@inova/domain';
import type { DraftComponent, DraftItem } from '../componentes/orcamento/types';
import { removerGrupoComponentes } from './component-groups';
import { criarId } from './id';

export function metrosParaCentimetrosRascunho(value: string): string {
  if (!value.trim()) return '';
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? String(Math.round(parsed * 100000) / 1000) : value;
}
/**
 * Arredonda uma medida (em cm) para cima, para o múltiplo de 5 cm mais próximo.
 * Usada só para calcular o valor do material a cobrar (m² fechado) — nunca altera
 * a medida digitada, exibida ou salva no orçamento/PDF.
 */
export function arredondarMedidaParaCima(cmValue: string): string {
  if (!cmValue.trim()) return cmValue;
  const parsed = Number(cmValue.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return cmValue;
  return String(Math.ceil(parsed / 5) * 5);
}
/** Peitoril de duas pedras sobrepostas (Orçamento Rápido): true quando o
 * comprimento normal e as duas larguras principais estão preenchidos. */
export function ehPeitorilDuplo(component: Pick<DraftComponent, 'componentType' | 'lengthCm' | 'sillTopWidthCm' | 'sillBottomWidthCm'>): boolean {
  return component.componentType === 'SILL' && !!(component.lengthCm?.trim() && component.sillTopWidthCm?.trim() && component.sillBottomWidthCm?.trim());
}
/**
 * Medidas (mm) "efetivas" de um peitoril de duas pedras: o comprimento normal do
 * componente (compartilhado pelas duas pedras) e uma largura combinada (largura de
 * cima + largura de baixo) — um retângulo real cuja área bate com a soma das duas
 * peças (sem descontar a sobreposição). Reaproveitando lengthMm/widthMm assim, o
 * resto do sistema (preço, área somada, serviços por m²) funciona sem precisar
 * saber que existe um peitoril duplo — só a descrição de fabricação (PDF) usa as
 * larguras reais de cada pedra, separadamente.
 * roundUp aplica o arredondamento de "M² fechado" no comprimento e em cada largura
 * antes de somar — nunca use roundUp para a medida exata salva no orçamento.
 */
export function medidasEfetivasPeitorilDuplo(component: DraftComponent, roundUp: boolean): { lengthMm: number; widthMm: number } | null {
  if (!ehPeitorilDuplo(component)) return null;
  const medida = (value: string) => roundUp ? arredondarMedidaParaCima(value) : value;
  try {
    const lengthMm = centimetrosParaMilimetros(medida(component.lengthCm));
    const topWidthMm = centimetrosParaMilimetros(medida(component.sillTopWidthCm!));
    const bottomWidthMm = centimetrosParaMilimetros(medida(component.sillBottomWidthCm!));
    calcularAreaPeitorilDuplo({ lengthMm, topWidthMm, bottomWidthMm, quantity: 1 }); // valida os valores (lança se algum for <= 0)
    return { lengthMm, widthMm: topWidthMm + bottomWidthMm };
  } catch { return null; }
}
/** Medida do rascunho (cm) no campo em metros: duas casas (120 → 1,20), três quando há milímetros (120,5 → 1,205). */
export function formatarCampoMetros(value: string): string {
  if (!value.trim()) return '';
  const metros = Number(value.replace(',', '.')) / 100;
  if (!Number.isFinite(metros)) return value;
  const texto = (Math.round(metros * 1000) / 1000).toFixed(3);
  return (texto.endsWith('0') ? texto.slice(0, -1) : texto).replace('.', ',');
}

/**
 * Campo de medida em metros do Orçamento Rápido. Só números: a vírgula entra
 * sozinha e os dois últimos dígitos são os centímetros (1 → 0,01 → 0,12 → 1,20).
 * Digitou vírgula (ou ponto): vale o que foi digitado, com uma vírgula só e até
 * três casas (1,2 → 1,20 ao sair do campo). `livre` guarda se a vírgula foi digitada.
 */
export type CampoMetros = { texto: string; livre: boolean };
export const campoMetrosInicial = (valueCm: string): CampoMetros => {
  const texto = formatarCampoMetros(valueCm);
  return { texto, livre: /,\d{3}$/.test(texto) };
};
const digitos = (texto: string) => texto.replace(/\D/g, '');
const semZerosEsquerda = (texto: string) => texto.replace(/^0+(?=\d)/, '');
function mascararMetros(texto: string): string {
  const numeros = semZerosEsquerda(digitos(texto)).slice(0, 6);
  if (!numeros || /^0+$/.test(numeros)) return '';
  const completo = numeros.padStart(3, '0');
  return `${semZerosEsquerda(completo.slice(0, -2))},${completo.slice(-2)}`;
}
function textoLivre(texto: string): string {
  const [inteiro, ...resto] = texto.replace(/\./g, ',').split(',');
  return `${semZerosEsquerda(digitos(inteiro)) || '0'},${digitos(resto.join('')).slice(0, 3)}`;
}
/** `tipo` e `dado` vêm do evento de digitação (inputType/data); sem eles, deduz pela diferença de texto. */
export function editarCampoMetros(atual: CampoMetros, novo: string, entrada: { tipo?: string; dado?: string | null } = {}): CampoMetros {
  if (!novo.trim()) return { texto: '', livre: false };
  const temVirgula = /[.,]/.test(novo);
  // Apagou a vírgula digitada: volta a contar os dígitos como centímetros.
  if (atual.livre) return temVirgula ? { texto: textoLivre(novo), livre: true } : { texto: mascararMetros(novo), livre: false };
  const tipo = entrada.tipo || (novo.length < atual.texto.length ? 'deleteContent' : 'insertText');
  const dado = entrada.tipo ? entrada.dado : novo.startsWith(atual.texto) ? novo.slice(atual.texto.length) : novo;
  if (tipo.startsWith('delete')) return { texto: mascararMetros(novo), livre: false };
  // Vírgula digitada agora: os números já digitados viram a parte inteira (12 → 12,).
  if (dado === ',' || dado === '.') return { texto: `${Number(digitos(atual.texto)) || 0},`, livre: true };
  // Colou ou preencheu de uma vez uma medida com vírgula: vale como está.
  if (temVirgula && (dado?.length ?? 2) > 1) return { texto: textoLivre(novo), livre: true };
  return { texto: mascararMetros(novo), livre: false };
}
export function criarComponenteRapido(materialId = '', id = criarId()): DraftComponent {
  return { id, materialId, label: '', componentType: 'TOP', orientation: 'HORIZONTAL', lengthCm: '', widthCm: '', quantity: 1, edges: [] };
}
/**
 * Troca a pedra do projeto (a de cima): as peças que seguem o projeto (sem pedra
 * ou com a pedra anterior do projeto) passam para a nova; as que receberam uma
 * pedra própria continuam com ela.
 */
export function aplicarMaterialProjeto(item: DraftItem, materialId: string): Partial<DraftItem> {
  return { materialId, components: item.components.map(component => component.materialProprio ? component : { ...component, materialId }) };
}

/** Escolher a pedra de uma peça: a do projeto volta a acompanhar o projeto; outra vira pedra própria. */
export function escolherPedraDaPeca(item: DraftItem, materialId: string | undefined): Partial<DraftComponent> {
  return !materialId || materialId === item.materialId ? { materialId: item.materialId, materialProprio: undefined } : { materialId, materialProprio: true };
}

/**
 * Rascunho vindo do servidor ou salvo no navegador: toda peça fica com a pedra
 * explícita e, se ainda não tiver a marca, é "própria" quando difere da do projeto.
 */
export function normalizarPedrasDasPecas<T extends DraftComponent>(item: { materialId: string }, components: T[]): T[] {
  return components.map((component) => ({ ...component, materialId: component.materialId || item.materialId,
    materialProprio: component.materialProprio ?? ((!!component.materialId && !!item.materialId && component.materialId !== item.materialId) || undefined) }));
}
/**
 * O Orçamento Rápido mudou de fato? Não contam a linha vazia que o Enter cria
 * (e que não é salva) nem só mudar a ordem das peças.
 */
export function alterouOrcamentoRapido(antes: DraftItem, depois: DraftItem): boolean {
  const essencial = (item: DraftItem) => {
    const preparado = prepararItemRapido(item);
    return JSON.stringify({ ...preparado, drawingData: undefined,
      components: [...preparado.components].sort((a, b) => a.id.localeCompare(b.id)),
      cutouts: preparado.cutouts.map((cutout) => ({ ...cutout, componentIndex: cutout.componentIndex === undefined ? undefined : preparado.components[cutout.componentIndex]?.id })) });
  };
  return essencial(antes) !== essencial(depois);
}
/** Enter may leave an unused insertion row. Only completely untouched rows are omitted. */
export function prepararItemRapido(item: DraftItem): DraftItem {
  if (modoEntradaOrcamento(item.drawingData) !== 'QUICK') return item;
  let result = item;
  for (let index = item.components.length - 1; index >= 0; index--) {
    const row = result.components[index];
    if (!row || row.label || row.lengthCm || row.widthCm || row.quantity !== 1 || row.edges.length || row.appliedTotal !== undefined || row.parentComponentId || row.componentType !== 'TOP') continue;
    if (result.cutouts.some(cut => cut.componentIndex === index) || result.components.some(child => child.parentComponentId === row.id)) continue;
    result = { ...result, ...removerGrupoComponentes(result, index) };
  }
  return result;
}
export function duplicarComponenteRapido(item: DraftItem, index: number): Partial<DraftItem> {
  const root = item.components[index];
  const originals = [root, ...item.components.filter(component => component.parentComponentId === root.id)];
  const ids = new Map(originals.map(component => [component.id, criarId()]));
  const components = originals.map(component => ({ ...component, id: ids.get(component.id)!, parentComponentId: ids.get(component.parentComponentId ?? '') ?? component.parentComponentId, edges: component.edges.map(({ id: _id, ...edge }) => ({ ...edge })) }));
  const cutouts = item.cutouts.flatMap(cutout => {
    const source = item.components[cutout.componentIndex ?? -1];
    const offset = originals.indexOf(source);
    return offset < 0 ? [] : [{ ...cutout, id: criarId(), componentIndex: item.components.length + offset }];
  });
  return { components: [...item.components, ...components], cutouts: [...item.cutouts, ...cutouts] };
}
