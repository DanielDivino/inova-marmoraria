import type { Prisma } from '@inova/database';
import { arredondarMoeda, calcularTotalOrcamento } from '@inova/domain';
import { AppError } from '../../compartilhado/http.js';

type Tx = Prisma.TransactionClient;

/**
 * Aprovação parcial do orçamento: os projetos que o cliente não aprovou ficam no orçamento (para
 * consulta), mas fora do valor, do fluxo de trabalho, da entrega e do PDF do orçamento aprovado.
 * O valor passa a ser só o dos aprovados, e o desconto geral acompanha na mesma proporção (a mesma
 * porcentagem). O desconto negociado para o orçamento completo fica guardado enquanto houver projeto
 * não aprovado, e é dele que a parte proporcional sai: aprovar de novo devolve o desconto exato.
 */
export async function definirProjetosNaoAprovados(tx: Tx, quoteId: string, naoAprovados: string[]) {
  const quote = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, select: { discountAmount: true, fullDiscountAmount: true, items: { select: { id: true, total: true, declinedAt: true } } } });
  const recusados = new Set(naoAprovados);
  if ([...recusados].some((id) => !quote.items.some((item) => item.id === id))) throw new AppError(422, 'Projeto não pertence a este orçamento.', 'INVALID_ITEM');
  if (quote.items.every((item) => recusados.has(item.id))) throw new AppError(422, 'Pelo menos um projeto precisa estar aprovado. Se o cliente não aprovou nenhum, marque o orçamento como não aprovado.', 'NO_APPROVED_PROJECT');
  const agora = new Date();
  for (const item of quote.items) {
    const recusar = recusados.has(item.id);
    if (recusar !== !!item.declinedAt) await tx.quoteItem.update({ where: { id: item.id }, data: { declinedAt: recusar ? agora : null } });
  }
  const bruto = calcularTotalOrcamento(quote.items.filter((item) => !recusados.has(item.id)).map((item) => Number(item.total)));
  const brutoCompleto = calcularTotalOrcamento(quote.items.map((item) => Number(item.total)));
  const descontoCompleto = Number(quote.fullDiscountAmount ?? quote.discountAmount);
  const desconto = !recusados.size ? descontoCompleto : brutoCompleto > 0 ? Math.min(bruto, arredondarMoeda(descontoCompleto * bruto / brutoCompleto)) : 0;
  await tx.quote.update({ where: { id: quoteId }, data: { grossTotal: bruto, discountAmount: desconto, netTotal: calcularTotalOrcamento([bruto], desconto), fullDiscountAmount: recusados.size ? descontoCompleto : null } });
  return quote.items.filter((item) => recusados.has(item.id)).map((item) => item.id);
}
