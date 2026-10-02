import { nomeExibicaoComponente, nomeProjeto } from './component-details.js';
import { planoDeProducao } from './production-plan.js';
import type { ProjectWorkflowStatus } from './fluxo.js';
import { numeroDocumentoRemontagem } from './remontagem.js';
import { pecasFisicasDoDesenho } from '../tecnico/divisao.js';
import type { TechnicalDocument } from '../tecnico/schema.js';

/**
 * Peça física de um projeto, a mesma da OS: com desenho técnico ligado, as pedras do desenho (cada
 * parte entre emendas, rodabancas e saias); senão, as do plano de produção dos projetos antigos
 * (feito no extinto "Com desenho"); senão, as peças do Orçamento Rápido; sem peças (área manual),
 * o próprio projeto.
 */
export type PecaProjeto = { chave: string; nome: string; material: string | null; lengthMm: number | null; widthMm: number | null; quantidade: number };
/** Quantidade de cada peça, pela chave. */
export type MapaPecas = Record<string, number>;

type ComponenteComPeca = { id: string; label?: string | null; componentType?: string; lengthMm: number; widthMm: number; quantity: number; materialNameSnapshot?: string | null };
export type ProjetoComPecas = { projectName?: string | null; quantity: number; materialNameSnapshot?: string | null; drawingData?: unknown; components?: ComponenteComPeca[] };

/** Chave da única "peça" de um projeto sem componentes (área manual). */
export const CHAVE_PROJETO_INTEIRO = 'projeto';

export function pecasDoProjeto(projeto: ProjetoComPecas, desenho?: TechnicalDocument | null): PecaProjeto[] {
  const componentes = projeto.components ?? [];
  const materialDoProjeto = projeto.materialNameSnapshot ?? null;
  const daLinha = (componente: ComponenteComPeca): PecaProjeto => ({ chave: componente.id, nome: nomeExibicaoComponente(componente), lengthMm: componente.lengthMm, widthMm: componente.widthMm,
    quantidade: componente.quantity, material: componente.materialNameSnapshot ?? materialDoProjeto });
  if (desenho?.pieces.length) {
    // Linha do orçamento → peça (ou rodabanca/saia) do desenho: a quantidade da linha vale para as pedras dela.
    const origens = (projeto.drawingData as { desenhoTecnico?: { sincronia?: { pecas?: Record<string, { pecaId: string; recursoId?: string }> } } } | null)?.desenhoTecnico?.sincronia?.pecas;
    const linhaDa = new Map<string, ComponenteComPeca>();
    for (const componente of componentes) {
      const origem = origens?.[componente.id];
      if (origem && !linhaDa.has(origem.recursoId ?? origem.pecaId)) linhaDa.set(origem.recursoId ?? origem.pecaId, componente);
    }
    const pedras = pecasFisicasDoDesenho(desenho).map((peca) => {
      const linha = linhaDa.get(peca.recursoId ?? peca.pecaId);
      return { chave: peca.chave, nome: peca.nome, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantidade: Math.max(1, linha?.quantity ?? 1), material: peca.material ?? linha?.materialNameSnapshot ?? materialDoProjeto };
    });
    // Linhas que ainda não foram para o desenho (entram nele quando ele for aberto pelo orçamento).
    const fora = origens ? componentes.filter((componente) => componente.quantity > 0 && !origens[componente.id]).map(daLinha) : [];
    return [...pedras, ...fora];
  }
  const plano = planoDeProducao(projeto.drawingData);
  if (plano?.pieces.length) {
    return plano.pieces.filter((peca) => peca.quantity > 0).map((peca) => ({
      chave: peca.id, nome: nomeExibicaoComponente(peca), lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantidade: peca.quantity,
      material: componentes.find((componente) => componente.id === peca.sourceComponentId)?.materialNameSnapshot ?? materialDoProjeto,
    }));
  }
  if (componentes.length) return componentes.filter((componente) => componente.quantity > 0).map(daLinha);
  return [{ chave: CHAVE_PROJETO_INTEIRO, nome: nomeProjeto(projeto), material: materialDoProjeto, lengthMm: null, widthMm: null, quantidade: Math.max(1, projeto.quantity) }];
}

export const totalPecas = (mapa: MapaPecas) => Object.values(mapa).reduce((total, quantidade) => total + quantidade, 0);
const semZeros = (mapa: MapaPecas): MapaPecas => Object.fromEntries(Object.entries(mapa).filter(([, quantidade]) => quantidade > 0));
export const somarPecas = (a: MapaPecas, b: MapaPecas): MapaPecas => semZeros(Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((chave) => [chave, (a[chave] ?? 0) + (b[chave] ?? 0)])));
export const subtrairPecas = (a: MapaPecas, b: MapaPecas): MapaPecas => semZeros(Object.fromEntries(Object.entries(a).map(([chave, quantidade]) => [chave, Math.max(0, quantidade - (b[chave] ?? 0))])));

/** Lê o mapa guardado no cartão; qualquer coisa que não seja chave → inteiro positivo é descartada. */
export function mapaPecasSalvo(valor: unknown): MapaPecas | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return Object.fromEntries(Object.entries(valor).filter((entrada): entrada is [string, number] => Number.isInteger(entrada[1]) && entrada[1] > 0));
}

/**
 * Peças de cada cartão do projeto. O cartão principal (`pieces` nulo) fica com
 * tudo o que não está nos outros; as partes separadas guardam as próprias
 * quantidades, limitadas ao que o projeto tem hoje (se o orçamento for editado,
 * o que sobrar volta para o principal). As partes devem vir na ordem de criação.
 */
export function distribuirPecas(pecas: PecaProjeto[], cartoes: { id: string; pieces: unknown }[]): Map<string, MapaPecas> {
  const livres: MapaPecas = Object.fromEntries(pecas.map((peca) => [peca.chave, peca.quantidade]));
  const resultado = new Map<string, MapaPecas>();
  for (const cartao of cartoes) {
    const mapa = cartao.pieces === null || cartao.pieces === undefined ? null : mapaPecasSalvo(cartao.pieces) ?? {};
    if (!mapa) continue;
    const proprio = semZeros(Object.fromEntries(Object.entries(mapa).filter(([chave]) => chave in livres).map(([chave, quantidade]) => [chave, Math.min(quantidade, livres[chave])])));
    for (const [chave, quantidade] of Object.entries(proprio)) livres[chave] -= quantidade;
    resultado.set(cartao.id, proprio);
  }
  const principal = cartoes.find((cartao) => cartao.pieces === null || cartao.pieces === undefined);
  if (principal) resultado.set(principal.id, semZeros(livres));
  return resultado;
}

/**
 * Confere as quantidades escolhidas contra as disponíveis: inteiros, sem peça
 * desconhecida e sem passar do que existe. Devolve a seleção sem zeros ou a mensagem de erro.
 */
export function conferirSelecaoPecas(disponivel: MapaPecas, selecao: MapaPecas): { selecao: MapaPecas; completa: boolean } | { erro: string } {
  for (const [chave, quantidade] of Object.entries(selecao)) {
    if (!Number.isInteger(quantidade) || quantidade < 0) return { erro: 'Informe quantidades inteiras de peças.' };
    if (quantidade > (disponivel[chave] ?? 0)) return { erro: 'A quantidade escolhida passa do que está disponível. Recarregue e tente de novo.' };
  }
  const limpa = semZeros(selecao);
  if (!totalPecas(limpa)) return { erro: 'Escolha pelo menos uma peça.' };
  return { selecao: limpa, completa: Object.entries(disponivel).every(([chave, quantidade]) => (limpa[chave] ?? 0) === quantidade) };
}

/** Na entrega, as peças saem primeiro das já produzidas, depois das em andamento e por último das que nem começaram. */
const PRIORIDADE_ENTREGA: Partial<Record<ProjectWorkflowStatus, number>> = { DONE: 0, IN_PROGRESS: 1, TODO: 2 };

/**
 * Reparte as peças entregues entre os cartões do projeto (quanto sai de cada
 * um). Cartões já entregues não entram. Devolve null se faltar peça.
 */
export function alocarEntrega(cartoes: { id: string; status: ProjectWorkflowStatus; position: number; mapa: MapaPecas }[], selecao: MapaPecas): Map<string, MapaPecas> | null {
  const candidatos = cartoes.filter((cartao) => PRIORIDADE_ENTREGA[cartao.status] !== undefined)
    .sort((a, b) => PRIORIDADE_ENTREGA[a.status]! - PRIORIDADE_ENTREGA[b.status]! || a.position - b.position);
  const alocacao = new Map<string, MapaPecas>();
  for (const [chave, pedida] of Object.entries(semZeros(selecao))) {
    let falta = pedida;
    for (const cartao of candidatos) {
      const tirar = Math.min(falta, cartao.mapa[chave] ?? 0);
      if (!tirar) continue;
      alocacao.set(cartao.id, { ...alocacao.get(cartao.id), [chave]: tirar });
      falta -= tirar;
      if (!falta) break;
    }
    if (falta) return null;
  }
  return alocacao;
}

/** Quantas unidades de cada peça estão entregues, prontas (produzidas) e ainda em produção. */
export function situacaoDasPecas(pecas: PecaProjeto[], cartoes: { status: ProjectWorkflowStatus; mapa: MapaPecas }[]) {
  return pecas.map((peca) => {
    const em = (...status: ProjectWorkflowStatus[]) => cartoes.filter((cartao) => status.includes(cartao.status)).reduce((total, cartao) => total + (cartao.mapa[peca.chave] ?? 0), 0);
    return { ...peca, entregues: em('DELIVERED'), prontas: em('DONE'), emProducao: em('TODO', 'IN_PROGRESS') };
  });
}

/** Número da nota de entrega de um projeto: o da entrega do orçamento mais a sequência (ex.: ENT-2026-21.2). */
export const numeroNotaEntrega = (quoteNumber: string, sequencia: number) => `${numeroDocumentoRemontagem(quoteNumber, 'ENT')}.${sequencia}`;
