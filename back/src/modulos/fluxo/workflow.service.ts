import type { Prisma, ProjectWorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { dataCalendario, dataConclusaoAoMover, EXECUCOES_FORA_DO_FLUXO, faseOrcamentoFluxo, planoDeProducao, posicaoEntre, prazoEfetivo, PROJECT_WORKFLOW_STATUSES } from '@inova/domain';
import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import { AppError, type AuthUser } from '../../compartilhado/http.js';

type Tx = Prisma.TransactionClient;

export const moverProjetoSchema = z.object({
  status: z.enum(PROJECT_WORKFLOW_STATUSES),
  // Vizinhos onde o cartão foi solto, como aparecem na tela (que pode estar filtrada).
  afterId: z.string().cuid().nullish(),
  beforeId: z.string().cuid().nullish(),
});

/** Só projetos de orçamentos aprovados e já iniciados podem ser movidos no quadro. O vendedor vê apenas os seus. */
const escopoFluxo = (user: AuthUser) => ({ quote: { status: 'APPROVED', executionStatus: { notIn: [...EXECUCOES_FORA_DO_FLUXO] }, ...escopoOrcamentos(user) } }) satisfies Prisma.QuoteItemWhereInput;

/** A listagem traz também os que ainda não iniciaram (coluna "Aguardando início"); histórico e entregues ficam fora. */
const escopoListagem = (user: AuthUser) => ({ quote: { ...escopoOrcamentos(user), OR: [{ status: { in: ['DRAFT', 'SENT'] } }, { status: 'APPROVED', executionStatus: { not: 'COMPLETED' } }] } }) satisfies Prisma.QuoteItemWhereInput;

const selectCartao = {
  id: true, projectName: true, workflowStatus: true, workflowPosition: true, workflowCompletedAt: true, quantity: true, drawingData: true,
  productType: { select: { name: true } },
  components: { select: { quantity: true } },
  quote: { select: {
    id: true, number: true, customerId: true, customerNameSnapshot: true, status: true, executionStatus: true, installationDeadline: true, deliveryDeadline: true,
    workerAssignments: { where: { releasedAt: null }, orderBy: { assignedAt: 'desc' }, take: 1, select: { worker: { select: { id: true, name: true, workColor: true } } } },
  } },
} satisfies Prisma.QuoteItemSelect;

/** Mesma contagem da OS: as peças do plano de produção, quando existe; senão, as dos componentes. */
function quantidadePecas(item: Prisma.QuoteItemGetPayload<{ select: typeof selectCartao }>) {
  const plano = planoDeProducao(item.drawingData);
  if (plano?.pieces.length) return plano.pieces.reduce((total, peca) => total + peca.quantity, 0);
  return item.components.length ? item.components.reduce((total, componente) => total + componente.quantity, 0) : item.quantity;
}

function paraCartao(item: Prisma.QuoteItemGetPayload<{ select: typeof selectCartao }>) {
  const prazo = prazoEfetivo(item.quote);
  const responsavel = item.quote.workerAssignments[0]?.worker;
  return {
    id: item.id,
    name: item.projectName || item.productType.name,
    status: item.workflowStatus,
    position: item.workflowPosition,
    completedAt: item.workflowCompletedAt,
    pieces: quantidadePecas(item),
    quote: {
      id: item.quote.id, number: item.quote.number, customerId: item.quote.customerId, customerName: item.quote.customerNameSnapshot, deadline: prazo ? dataCalendario(prazo) : null,
      phase: faseOrcamentoFluxo(item.quote)!,
      worker: responsavel ? { id: responsavel.id, name: responsavel.name, color: responsavel.workColor } : null,
    },
  };
}

export async function listarProjetosFluxo(tx: Tx, user: AuthUser) {
  const items = await tx.quoteItem.findMany({ where: escopoListagem(user), select: selectCartao, orderBy: [{ workflowPosition: 'asc' }, { id: 'asc' }] });
  return items.map(paraCartao);
}

/**
 * Posição do cartão logo depois de `afterId` (ou logo antes de `beforeId`) na
 * coluna inteira, não só na parte visível: projetos escondidos por filtro ou de
 * outros vendedores mantêm a ordem entre si.
 */
async function posicaoNaColuna(tx: Tx, status: ProjectWorkflowStatus, itemId: string, afterId?: string | null, beforeId?: string | null): Promise<number> {
  const coluna = { workflowStatus: status, id: { not: itemId } } satisfies Prisma.QuoteItemWhereInput;
  const posicaoDe = async (id: string) => {
    const vizinho = await tx.quoteItem.findFirst({ where: { ...coluna, id }, select: { workflowPosition: true } });
    if (!vizinho) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');
    return vizinho.workflowPosition;
  };
  let anterior: number | undefined, seguinte: number | undefined;
  if (afterId) {
    anterior = await posicaoDe(afterId);
    seguinte = (await tx.quoteItem.findFirst({ where: { ...coluna, workflowPosition: { gt: anterior } }, orderBy: { workflowPosition: 'asc' }, select: { workflowPosition: true } }))?.workflowPosition;
  } else if (beforeId) {
    seguinte = await posicaoDe(beforeId);
    anterior = (await tx.quoteItem.findFirst({ where: { ...coluna, workflowPosition: { lt: seguinte } }, orderBy: { workflowPosition: 'desc' }, select: { workflowPosition: true } }))?.workflowPosition;
  } else {
    anterior = (await tx.quoteItem.aggregate({ where: coluna, _max: { workflowPosition: true } }))._max.workflowPosition ?? undefined;
  }
  const posicao = posicaoEntre(anterior, seguinte);
  if (anterior === undefined || seguinte === undefined || (posicao > anterior && posicao < seguinte)) return posicao;
  // Depois de muitas divisões o intervalo pode acabar: renumera a coluna e calcula de novo.
  await tx.$executeRaw`UPDATE "QuoteItem" SET "workflowPosition" = ordem.posicao FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "workflowPosition", id) - 1 AS posicao FROM "QuoteItem" WHERE "workflowStatus" = ${status}::"ProjectWorkflowStatus") ordem WHERE "QuoteItem".id = ordem.id`;
  return posicaoNaColuna(tx, status, itemId, afterId, beforeId);
}

export async function moverProjeto(tx: Tx, itemId: string, input: z.infer<typeof moverProjetoSchema>, user: AuthUser) {
  const item = await tx.quoteItem.findFirst({ where: { id: itemId, ...escopoFluxo(user) }, select: { workflowStatus: true, workflowCompletedAt: true, quote: { select: { id: true, status: true, executionStatus: true, completedAt: true } } } });
  if (!item) throw new AppError(404, 'Projeto não encontrado no fluxo de trabalho.', 'NOT_FOUND');
  const workflowPosition = await posicaoNaColuna(tx, input.status, itemId, input.afterId, input.beforeId);
  const workflowCompletedAt = dataConclusaoAoMover({ status: item.workflowStatus, completedAt: item.workflowCompletedAt }, input.status, new Date());
  const updated = await tx.quoteItem.update({ where: { id: itemId }, data: { workflowStatus: input.status, workflowPosition, workflowCompletedAt }, select: selectCartao });
  const quoteDelivered = input.status === 'DELIVERED' && await entregarOrcamentoSeCompleto(tx, item.quote, user);
  return { card: { ...paraCartao(updated), quoteDelivered }, previousStatus: item.workflowStatus };
}

/**
 * Último projeto em "Entregue": o orçamento é marcado como entregue, como em
 * "Marcar como entregue" — sai de Orçamentos e vai para o Histórico.
 */
async function entregarOrcamentoSeCompleto(tx: Tx, quote: { id: string; status: string; executionStatus: string; completedAt: Date | null }, user: AuthUser) {
  if (await tx.quoteItem.count({ where: { quoteId: quote.id, workflowStatus: { not: 'DELIVERED' } } })) return false;
  const completedAt = quote.completedAt ?? new Date();
  await tx.quote.update({ where: { id: quote.id }, data: { executionStatus: 'COMPLETED', completedAt } });
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE', entityId: quote.id, action: 'STATUS_CHANGED',
    previous: { status: quote.status, executionStatus: quote.executionStatus, completedAt: quote.completedAt },
    current: { status: quote.status, executionStatus: 'COMPLETED', completedAt, reason: 'Todos os projetos entregues no fluxo de trabalho' } } });
  return true;
}
