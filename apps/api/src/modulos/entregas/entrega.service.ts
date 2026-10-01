import type { Prisma } from '@inova/database';
import { z } from 'zod';
import { alocarEntrega, conferirSelecaoPecas, distribuirPecas, nomeProjeto, numeroNotaEntrega, pecasDoProjeto, situacaoDasPecas, somarPecas, totalPecas, type MapaPecas, type PecaProjeto } from '@inova/domain';
import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import { AppError, type AuthUser } from '../../compartilhado/http.js';
import { entregarOrcamentoSeCompleto, entregarPecas, mapaPecasSchema, ordemDosCartoes, selectPecas } from '../fluxo/workflow.service.js';

type Tx = Prisma.TransactionClient;

export const novaEntregaSchema = z.object({ pieces: mapaPecasSchema });

/** Linha impressa na nota: a peça e a quantidade. */
export type LinhaNotaEntrega = { name: string; material: string | null; lengthMm: number | null; widthMm: number | null; quantity: number };
/** O que a nota imprime, guardado como foi gerado para reimprimir igual. */
export type DocumentoNotaEntrega = { projectName: string; delivered: LinhaNotaEntrega[]; remaining: LinhaNotaEntrega[]; deliveredBefore: number };

const selectProjetoEntrega = { ...selectPecas, workflowCards: { select: { id: true, pieces: true, status: true, position: true }, orderBy: ordemDosCartoes } } satisfies Prisma.QuoteItemSelect;
type ProjetoEntrega = Prisma.QuoteItemGetPayload<{ select: typeof selectProjetoEntrega }>;
type CartaoComPecas = { id: string; status: ProjetoEntrega['workflowCards'][number]['status']; position: number; mapa: MapaPecas };

function cartoesComPecas(projeto: ProjetoEntrega) {
  const pecas = pecasDoProjeto(projeto);
  const porCartao = distribuirPecas(pecas, projeto.workflowCards);
  const cartoes: CartaoComPecas[] = projeto.workflowCards.map((cartao) => ({ id: cartao.id, status: cartao.status, position: cartao.position, mapa: porCartao.get(cartao.id) ?? {} }));
  return { pecas, cartoes };
}
const somaDosCartoes = (cartoes: CartaoComPecas[], entregues: boolean) => cartoes.filter((cartao) => (cartao.status === 'DELIVERED') === entregues).reduce<MapaPecas>((soma, cartao) => somarPecas(soma, cartao.mapa), {});
const linhasDaNota = (pecas: PecaProjeto[], mapa: MapaPecas): LinhaNotaEntrega[] => pecas.filter((peca) => mapa[peca.chave])
  .map((peca) => ({ name: peca.nome, material: peca.material, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantity: mapa[peca.chave] }));

/** Por que o orçamento ainda não (ou já não) registra entregas; null quando pode. */
export function motivoSemEntrega(quote: { status: string; executionStatus: string }) {
  if (quote.status !== 'APPROVED') return 'A nota de entrega fica disponível depois que o orçamento é aprovado.';
  if (quote.executionStatus === 'NOT_STARTED') return 'Inicie o serviço para registrar entregas.';
  if (quote.executionStatus === 'PAUSED') return 'A produção está parada. Retome a produção para registrar entregas.';
  if (quote.executionStatus === 'COMPLETED') return 'Este orçamento já foi entregue.';
  return null;
}

/** Peças de cada projeto (entregues, prontas e em produção) e as notas já geradas. */
export async function listarEntregas(tx: Tx, quoteId: string, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: {
    number: true, status: true, executionStatus: true,
    items: { where: { declinedAt: null }, select: selectProjetoEntrega, orderBy: { id: 'asc' } },
    projectDeliveries: { orderBy: { sequence: 'asc' }, select: { id: true, quoteItemId: true, sequence: true, document: true, createdAt: true, createdBy: { select: { name: true } } } },
  } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  const reason = motivoSemEntrega(quote);
  return { canDeliver: !reason, reason, projects: quote.items.map((projeto) => {
    const { pecas, cartoes } = cartoesComPecas(projeto);
    return {
      id: projeto.id, name: nomeProjeto(projeto),
      pieces: situacaoDasPecas(pecas, cartoes).map((peca) => ({ key: peca.chave, name: peca.nome, material: peca.material, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantity: peca.quantidade, delivered: peca.entregues, ready: peca.prontas, inProduction: peca.emProducao })),
      notes: quote.projectDeliveries.filter((nota) => nota.quoteItemId === projeto.id).map((nota) => ({
        id: nota.id, number: numeroNotaEntrega(quote.number, nota.sequence), createdAt: nota.createdAt, createdBy: nota.createdBy.name,
        pieces: (nota.document as DocumentoNotaEntrega).delivered.reduce((total, linha) => total + linha.quantity, 0),
      })),
    };
  }) };
}

/**
 * Registra a entrega das peças escolhidas: elas vão para "Entregue" no fluxo
 * (dividindo o cartão quando é só parte) e a nota guarda o que foi entregue e o
 * que ainda falta. Entregue a última peça do orçamento, ele vai para o Histórico.
 */
export async function registrarEntrega(tx: Tx, quoteId: string, quoteItemId: string, input: z.infer<typeof novaEntregaSchema>, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: { id: true, number: true, status: true, executionStatus: true, completedAt: true } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  const reason = motivoSemEntrega(quote);
  if (reason) throw new AppError(409, reason, 'DELIVERY_UNAVAILABLE');
  const projeto = await tx.quoteItem.findFirst({ where: { id: quoteItemId, quoteId }, select: selectProjetoEntrega });
  if (!projeto) throw new AppError(404, 'Projeto não encontrado.', 'NOT_FOUND');
  const { pecas, cartoes } = cartoesComPecas(projeto);
  const conferida = conferirSelecaoPecas(somaDosCartoes(cartoes, false), input.pieces);
  if ('erro' in conferida) throw new AppError(422, conferida.erro, 'INVALID_PIECES');
  const alocacao = alocarEntrega(cartoes, conferida.selecao);
  if (!alocacao) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');
  await entregarPecas(tx, projeto.id, alocacao);

  const depois = cartoesComPecas(await tx.quoteItem.findUniqueOrThrow({ where: { id: projeto.id }, select: selectProjetoEntrega }));
  const document: DocumentoNotaEntrega = {
    projectName: nomeProjeto(projeto),
    delivered: linhasDaNota(pecas, conferida.selecao),
    remaining: linhasDaNota(pecas, somaDosCartoes(depois.cartoes, false)),
    deliveredBefore: totalPecas(somaDosCartoes(cartoes, true)),
  };
  const sequence = ((await tx.projectDelivery.aggregate({ where: { quoteId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
  const nota = await tx.projectDelivery.create({ data: { quoteId, quoteItemId: projeto.id, sequence, document: document as unknown as Prisma.InputJsonObject, createdById: user.id }, select: { id: true } });
  const number = numeroNotaEntrega(quote.number, sequence);
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE_ITEM', entityId: projeto.id, action: 'PROJECT_DELIVERY_CREATED', current: { quoteId, number, pieces: conferida.selecao } } });
  const quoteDelivered = await entregarOrcamentoSeCompleto(tx, quote, user);
  return { id: nota.id, number, quoteDelivered };
}

export async function buscarNotaEntrega(tx: Tx, quoteId: string, deliveryId: string, user: AuthUser) {
  const nota = await tx.projectDelivery.findFirst({ where: { id: deliveryId, quoteId, quote: escopoOrcamentos(user) }, select: {
    sequence: true, document: true, createdAt: true,
    quote: { select: { number: true, customerNameSnapshot: true, customerPhoneSnapshot: true, workAddressSnapshot: true } },
  } });
  if (!nota) throw new AppError(404, 'Nota de entrega não encontrada.', 'NOT_FOUND');
  return { number: numeroNotaEntrega(nota.quote.number, nota.sequence), createdAt: nota.createdAt, quote: nota.quote, document: nota.document as unknown as DocumentoNotaEntrega };
}
