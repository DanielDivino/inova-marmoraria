import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { alocarCancelamento, arredondarMoeda, calcularTotalOrcamento, conferirSelecaoPecas, distribuirPecas, itemSalvoParaEntrada, nomeExibicaoComponente, pecasDoProjeto, planoDeProducao, somarPecas, subtrairPecas, totalPecas, type MapaPecas } from '@inova/domain';
import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import { AppError, type AuthUser } from '../../compartilhado/http.js';
import { desenhosParaPecas } from '../desenhos/desenho-tecnico-do-orcamento.js';
import { entregarOrcamentoSeCompleto, mapaPecasSchema, ordemDosCartoes } from '../fluxo/workflow.service.js';
import { definirProjetosNaoAprovados } from './aprovacao-projetos.js';
import { quoteItemSchema } from './quote.schema.js';
import { montarItem, persistirItem, quoteInclude } from './quote.service.js';

type Tx = Prisma.TransactionClient;

/** As peças (e quantas de cada) que o cliente não aprovou, ou todas as que ainda não foram entregues. */
export const naoAprovarPecasSchema = z.object({ pieces: mapaPecasSchema.optional(), todas: z.literal(true).optional() }).strict()
  .refine((corpo) => !!corpo.pieces !== !!corpo.todas, { message: 'Escolha as peças ou todas.' });

/** Fica no projeto (drawingData.pecasNaoAprovadas): o que o cliente não aprovou, para consulta. */
export type PecaNaoAprovada = { nome: string; lengthMm: number; widthMm: number; quantidade: number; valor: number; em: string };

const proporcional = (valor: number | undefined, novo: number, antigo: number) => valor === undefined ? undefined : arredondarMoeda(valor * novo / antigo);
const area = (pecas: { lengthMm: number; widthMm: number; quantity: number }[]) => pecas.reduce((soma, peca) => soma + peca.lengthMm * peca.widthMm * peca.quantity, 0);

/**
 * "Não aprovado / alterar": o cliente não aprovou parte das peças de um projeto. As escolhidas saem
 * do projeto (e do valor, com bordas, recortes e valores aplicados na mesma proporção) e do fluxo de
 * trabalho, primeiro das que nem começaram; as entregues nunca. Tirar todas, sem nada entregue, é
 * marcar o projeto inteiro como não aprovado. O desconto geral acompanha na mesma porcentagem.
 */
export async function naoAprovarPecas(tx: Tx, quoteId: string, quoteItemId: string, corpo: z.infer<typeof naoAprovarPecasSchema>, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, include: quoteInclude });
  const salvo = quote?.items.find((item) => item.id === quoteItemId);
  if (!quote || !salvo) throw new AppError(404, 'Projeto não encontrado neste orçamento.', 'NOT_FOUND');
  if (quote.status !== 'APPROVED' || quote.executionStatus === 'COMPLETED') throw new AppError(409, 'A aprovação das peças só muda em um orçamento aprovado e ainda não entregue.', 'QUOTE_NOT_APPROVED');
  if (salvo.declinedAt) throw new AppError(409, 'Este projeto já está como não aprovado.', 'ITEM_DECLINED');

  const cartoes = await tx.workflowCard.findMany({ where: { quoteItemId }, orderBy: ordemDosCartoes });
  const desenho = (await desenhosParaPecas(tx, [salvo])).get(salvo.id);
  const pecas = pecasDoProjeto(salvo, desenho);
  const porCartao = distribuirPecas(pecas, cartoes);
  const entregues = cartoes.filter((cartao) => cartao.status === 'DELIVERED').reduce<MapaPecas>((soma, cartao) => somarPecas(soma, porCartao.get(cartao.id) ?? {}), {});
  const disponivel = Object.fromEntries(pecas.map((peca) => [peca.chave, peca.quantidade - (entregues[peca.chave] ?? 0)]));
  const conferida = conferirSelecaoPecas(disponivel, corpo.todas ? disponivel : corpo.pieces ?? {});
  if ('erro' in conferida) throw new AppError(422, totalPecas(disponivel) ? conferida.erro : 'Todas as peças deste projeto já foram entregues.', 'INVALID_PIECES');

  // Todas, sem nada entregue: o projeto inteiro fica como não aprovado (dá para aprovar de novo).
  if (conferida.completa && !totalPecas(entregues)) {
    await definirProjetosNaoAprovados(tx, quoteId, [...quote.items.filter((item) => item.declinedAt).map((item) => item.id), quoteItemId]);
    await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE_ITEM', entityId: quoteItemId, action: 'APPROVAL_CHANGED', previous: { aprovado: true }, current: { quoteId, aprovado: false } } });
    return entregueSeCompleto(tx, quote, user);
  }
  if (desenho || planoDeProducao(salvo.drawingData)?.pieces.length || !salvo.components.length) {
    throw new AppError(409, salvo.components.length
      ? 'Este projeto tem desenho técnico: para tirar só algumas peças, altere o desenho. Aqui dá para marcar o projeto inteiro como não aprovado.'
      : 'Projeto em área manual, sem peças separadas: só dá para marcar o projeto inteiro como não aprovado.', 'PARTIAL_DECLINE_UNAVAILABLE');
  }
  const selecao = conferida.selecao;
  const retirada = alocarCancelamento(cartoes.map((cartao) => ({ id: cartao.id, status: cartao.status, position: cartao.position, mapa: porCartao.get(cartao.id) ?? {} })), selecao);
  if (!retirada) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');

  // O projeto de novo, com menos peças: valores aplicados à mão, bordas e recortes de cada peça acompanham a quantidade.
  const entrada = itemSalvoParaEntrada(salvo);
  const novoIndice = new Map<number, number>();
  const componentes: typeof entrada.components = [];
  entrada.components.forEach((componente, indice) => {
    const quantidade = componente.quantity - (selecao[componente.id] ?? 0);
    if (quantidade <= 0) return;
    novoIndice.set(indice, componentes.length);
    componentes.push({ ...componente, quantity: quantidade, sortOrder: componentes.length, appliedTotal: proporcional(componente.appliedTotal, quantidade, componente.quantity),
      edges: componente.edges.map((borda) => ({ ...borda, appliedSubtotal: proporcional(borda.appliedSubtotal, quantidade, componente.quantity) })) });
  });
  const recortes = entrada.cutouts.flatMap((recorte) => {
    if (recorte.componentIndex === undefined) return [recorte];
    const indice = novoIndice.get(recorte.componentIndex);
    if (indice === undefined) return [];
    const antes = entrada.components[recorte.componentIndex].quantity, depois = componentes[indice].quantity;
    // Uma cuba por bancada (ou duas por bancada…) acompanha; uma quantidade solta fica como está.
    const quantidade = recorte.quantity % antes === 0 ? recorte.quantity / antes * depois : recorte.quantity;
    return [{ ...recorte, componentIndex: indice, quantity: quantidade, appliedSubtotal: proporcional(recorte.appliedSubtotal, quantidade, recorte.quantity) }];
  }).map((recorte, sortOrder) => ({ ...recorte, sortOrder }));
  const areaAntes = area(entrada.components), areaDepois = area(componentes);
  const servicos = entrada.services.map((servico, indice) => salvo.services[indice]?.billingUnitSnapshot === 'SQUARE_METER'
    ? { ...servico, appliedSubtotal: proporcional(servico.appliedSubtotal, areaDepois, areaAntes) } : servico);

  const agora = new Date();
  const naoAprovadas: PecaNaoAprovada[] = salvo.components.filter((componente) => selecao[componente.id]).map((componente) => ({
    nome: nomeExibicaoComponente(componente), lengthMm: componente.lengthMm, widthMm: componente.widthMm, quantidade: selecao[componente.id],
    valor: arredondarMoeda(Number(componente.appliedTotal) * selecao[componente.id] / componente.quantity), em: agora.toISOString(),
  }));
  const dados: Record<string, unknown> = { ...entrada.drawingData };
  // Detalhes do desenho (rodabanca presa à bancada…) vão pelo índice da peça: acompanham a nova ordem.
  if (Array.isArray(dados.componentDetails)) {
    const detalhes = dados.componentDetails as Record<string, unknown>[];
    dados.componentDetails = entrada.components.flatMap((_, indice) => {
      if (!novoIndice.has(indice)) return [];
      const detalhe = { ...detalhes[indice] };
      if (typeof detalhe.parentComponentIndex === 'number') {
        const pai = novoIndice.get(detalhe.parentComponentIndex);
        if (pai === undefined) { delete detalhe.parentComponentIndex; delete detalhe.parentSide; } else detalhe.parentComponentIndex = pai;
      }
      return [detalhe];
    });
  }
  dados.pecasNaoAprovadas = [...(Array.isArray(dados.pecasNaoAprovadas) ? dados.pecasNaoAprovadas : []), ...naoAprovadas];

  const montado = await montarItem(tx, quoteItemSchema.parse({ ...entrada, components: componentes, cutouts: recortes, services: servicos, drawingData: dados }), user, salvo);
  // Cada cartão do fluxo perde as peças que saíram dele; parte separada que ficou vazia some (o principal fica com o resto).
  const cartoesFicam = cartoes.flatMap((cartao) => {
    if (cartao.pieces === null) return [cartao];
    const mapa = subtrairPecas(porCartao.get(cartao.id) ?? {}, retirada.get(cartao.id) ?? {});
    return totalPecas(mapa) ? [{ ...cartao, pieces: mapa }] : [];
  });
  await tx.quoteItem.delete({ where: { id: salvo.id } });
  await persistirItem(tx, quoteId, montado, salvo.id, cartoesFicam);

  const itens = await tx.quoteItem.findMany({ where: { quoteId }, select: { total: true, declinedAt: true } });
  const bruto = calcularTotalOrcamento(itens.filter((item) => !item.declinedAt).map((item) => Number(item.total)));
  const brutoCompleto = calcularTotalOrcamento(itens.map((item) => Number(item.total)));
  const brutoAntes = Number(quote.grossTotal), completoAntes = calcularTotalOrcamento(quote.items.map((item) => Number(item.total)));
  const desconto = brutoAntes > 0 ? Math.min(bruto, arredondarMoeda(Number(quote.discountAmount) * bruto / brutoAntes)) : 0;
  const netTotal = calcularTotalOrcamento([bruto], desconto);
  await tx.quote.update({ where: { id: quoteId }, data: { grossTotal: bruto, discountAmount: desconto, netTotal,
    fullDiscountAmount: quote.fullDiscountAmount === null ? null : completoAntes > 0 ? arredondarMoeda(Number(quote.fullDiscountAmount) * brutoCompleto / completoAntes) : 0 } });
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE_ITEM', entityId: quoteItemId, action: 'PIECES_DECLINED',
    previous: { total: Number(salvo.total), netTotal: Number(quote.netTotal) },
    current: { quoteId, pieces: naoAprovadas, total: Number(montado.total), netTotal } } });
  await entregueSeCompleto(tx, quote, user);
}

/** Se só faltavam as peças (ou o projeto) que saíram, o orçamento está entregue. */
async function entregueSeCompleto(tx: Tx, quote: { id: string; status: string; executionStatus: string; completedAt: Date | null }, user: AuthUser) {
  if (quote.executionStatus === 'IN_PROGRESS' || quote.executionStatus === 'REWORK') await entregarOrcamentoSeCompleto(tx, quote, user);
}
