import type { Prisma, ProjectWorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { conferirSelecaoPecas, dataCalendario, dataConclusaoAoMover, distribuirPecas, EXECUCOES_FORA_DO_FLUXO, faseOrcamentoFluxo, mapaPecasSalvo, nomeProjeto, pecasDoProjeto, posicaoEntre, prazoEfetivo, PROJECT_WORKFLOW_STATUSES, somarPecas, subtrairPecas, totalPecas, type MapaPecas } from '@inova/domain';
import { escopoOrcamentos } from '../../compartilhado/acesso.js';
import { AppError, type AuthUser } from '../../compartilhado/http.js';

type Tx = Prisma.TransactionClient;

/** Quantidade de cada peça (chave da peça → unidades). */
export const mapaPecasSchema = z.record(z.string().min(1).max(64), z.number().int().min(0).max(100_000));

export const moverProjetoSchema = z.object({
  status: z.enum(PROJECT_WORKFLOW_STATUSES),
  // Vizinhos onde o cartão foi solto, como aparecem na tela (que pode estar filtrada).
  afterId: z.string().cuid().nullish(),
  beforeId: z.string().cuid().nullish(),
  // Só parte das peças do cartão (ex.: produziu 2 de 3): elas viram outro cartão na coluna de destino.
  pieces: mapaPecasSchema.optional(),
});

/** Só projetos de orçamentos aprovados e já iniciados podem ser movidos no quadro. O vendedor vê apenas os seus. */
export const escopoFluxo = (user: AuthUser) => ({ declinedAt: null, quote: { status: 'APPROVED', executionStatus: { notIn: [...EXECUCOES_FORA_DO_FLUXO] }, ...escopoOrcamentos(user) } }) satisfies Prisma.QuoteItemWhereInput;

/** A listagem traz também os que ainda não iniciaram (coluna "Aguardando início"); histórico e entregues ficam fora. */
const escopoListagem = (user: AuthUser) => ({ declinedAt: null, quote: { ...escopoOrcamentos(user), OR: [{ status: { in: ['DRAFT', 'SENT'] } }, { status: 'APPROVED', executionStatus: { not: 'COMPLETED' } }] } }) satisfies Prisma.QuoteItemWhereInput;

/** O que é preciso para saber as peças do projeto (as mesmas da OS). */
export const selectPecas = {
  id: true, projectName: true, quantity: true, materialNameSnapshot: true, drawingData: true,
  components: { select: { id: true, label: true, componentType: true, lengthMm: true, widthMm: true, quantity: true, materialNameSnapshot: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.QuoteItemSelect;
/** Cartões na ordem de criação: é a ordem em que as partes separadas reservam as peças. */
export const ordemDosCartoes = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.WorkflowCardOrderByWithRelationInput[];

const selectCartao = {
  id: true, status: true, position: true, completedAt: true, materialMissing: true, pieces: true,
  quoteItem: { select: {
    ...selectPecas,
    workflowCards: { select: { id: true, pieces: true }, orderBy: ordemDosCartoes },
    quote: { select: {
      id: true, number: true, customerId: true, customerNameSnapshot: true, status: true, executionStatus: true, completedAt: true, installationDeadline: true, deliveryDeadline: true,
      workerAssignments: { where: { releasedAt: null }, orderBy: { assignedAt: 'desc' }, take: 1, select: { worker: { select: { id: true, name: true, workColor: true } } } },
    } },
  } },
} satisfies Prisma.WorkflowCardSelect;
type CartaoSalvo = Prisma.WorkflowCardGetPayload<{ select: typeof selectCartao }>;

/** Peças de cada cartão do projeto: o principal fica com o que não está nos outros. */
function pecasDosCartoes(projeto: CartaoSalvo['quoteItem']) {
  const pecas = pecasDoProjeto(projeto);
  return { pecas, porCartao: distribuirPecas(pecas, projeto.workflowCards) };
}

function paraCartao(cartao: CartaoSalvo) {
  const projeto = cartao.quoteItem;
  const { pecas, porCartao } = pecasDosCartoes(projeto);
  const mapa = porCartao.get(cartao.id) ?? {};
  const prazo = prazoEfetivo(projeto.quote);
  const responsavel = projeto.quote.workerAssignments[0]?.worker;
  return {
    id: cartao.id,
    projectId: projeto.id,
    name: nomeProjeto(projeto),
    status: cartao.status,
    position: cartao.position,
    completedAt: cartao.completedAt,
    materialMissing: cartao.materialMissing,
    // Peças deste cartão e do projeto inteiro (diferentes quando o projeto foi dividido).
    pieces: totalPecas(mapa),
    totalPieces: pecas.reduce((total, peca) => total + peca.quantidade, 0),
    pieceList: pecas.filter((peca) => mapa[peca.chave]).map((peca) => ({ key: peca.chave, name: peca.nome, lengthMm: peca.lengthMm, widthMm: peca.widthMm, quantity: mapa[peca.chave] })),
    quote: {
      id: projeto.quote.id, number: projeto.quote.number, customerId: projeto.quote.customerId, customerName: projeto.quote.customerNameSnapshot, deadline: prazo ? dataCalendario(prazo) : null,
      phase: faseOrcamentoFluxo(projeto.quote)!,
      worker: responsavel ? { id: responsavel.id, name: responsavel.name, color: responsavel.workColor } : null,
    },
  };
}

/** Cartão sem peças (o principal, quando as partes ficaram com tudo após uma edição) não aparece no quadro. */
const cartoesVisiveis = (cartoes: CartaoSalvo[]) => cartoes.map((cartao) => ({ cartao, dados: paraCartao(cartao) }))
  .filter(({ cartao, dados }) => dados.pieces > 0 || cartao.quoteItem.workflowCards.length === 1).map(({ dados }) => dados);

export async function listarProjetosFluxo(tx: Tx, user: AuthUser) {
  const cartoes = await tx.workflowCard.findMany({ where: { quoteItem: escopoListagem(user) }, select: selectCartao, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  return cartoesVisiveis(cartoes);
}

async function cartoesDoProjeto(tx: Tx, quoteItemId: string) {
  return cartoesVisiveis(await tx.workflowCard.findMany({ where: { quoteItemId }, select: selectCartao, orderBy: [{ position: 'asc' }, { id: 'asc' }] }));
}

/**
 * Posição do cartão logo depois de `afterId` (ou logo antes de `beforeId`) na
 * coluna inteira, não só na parte visível: projetos escondidos por filtro ou de
 * outros vendedores mantêm a ordem entre si. Sem vizinhos, vai para o fim.
 */
async function posicaoNaColuna(tx: Tx, status: ProjectWorkflowStatus, cardId: string, afterId?: string | null, beforeId?: string | null): Promise<number> {
  const coluna = { status, id: { not: cardId } } satisfies Prisma.WorkflowCardWhereInput;
  const posicaoDe = async (id: string) => {
    const vizinho = await tx.workflowCard.findFirst({ where: { ...coluna, id }, select: { position: true } });
    if (!vizinho) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');
    return vizinho.position;
  };
  let anterior: number | undefined, seguinte: number | undefined;
  if (afterId) {
    anterior = await posicaoDe(afterId);
    seguinte = (await tx.workflowCard.findFirst({ where: { ...coluna, position: { gt: anterior } }, orderBy: { position: 'asc' }, select: { position: true } }))?.position;
  } else if (beforeId) {
    seguinte = await posicaoDe(beforeId);
    anterior = (await tx.workflowCard.findFirst({ where: { ...coluna, position: { lt: seguinte } }, orderBy: { position: 'desc' }, select: { position: true } }))?.position;
  } else {
    anterior = (await tx.workflowCard.aggregate({ where: coluna, _max: { position: true } }))._max.position ?? undefined;
  }
  const posicao = posicaoEntre(anterior, seguinte);
  if (anterior === undefined || seguinte === undefined || (posicao > anterior && posicao < seguinte)) return posicao;
  // Depois de muitas divisões o intervalo pode acabar: renumera a coluna e calcula de novo.
  await tx.$executeRaw`UPDATE "WorkflowCard" SET "position" = ordem.posicao FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "position", id) - 1 AS posicao FROM "WorkflowCard" WHERE "status" = ${status}::"ProjectWorkflowStatus") ordem WHERE "WorkflowCard".id = ordem.id`;
  return posicaoNaColuna(tx, status, cardId, afterId, beforeId);
}

/**
 * Cartões do mesmo projeto na mesma coluna voltam a ser um só, no lugar em que
 * o cartão movido ficou. O principal absorve os outros (as peças deles voltam
 * para ele); entre partes, as quantidades se somam. Devolve o cartão que ficou.
 */
async function juntarNaColuna(tx: Tx, quoteItemId: string, status: ProjectWorkflowStatus, movidoId: string) {
  const cartoes = await tx.workflowCard.findMany({ where: { quoteItemId, status }, select: { id: true, pieces: true, position: true, completedAt: true, materialMissing: true }, orderBy: ordemDosCartoes });
  if (cartoes.length < 2) return movidoId;
  const movido = cartoes.find((cartao) => cartao.id === movidoId)!;
  const principal = cartoes.find((cartao) => cartao.pieces === null);
  const fica = principal ?? movido;
  const conclusoes = cartoes.flatMap((cartao) => cartao.completedAt ? [cartao.completedAt.getTime()] : []);
  await tx.workflowCard.deleteMany({ where: { id: { in: cartoes.filter((cartao) => cartao.id !== fica.id).map((cartao) => cartao.id) } } });
  await tx.workflowCard.update({ where: { id: fica.id }, data: {
    position: movido.position,
    completedAt: conclusoes.length ? new Date(Math.max(...conclusoes)) : null,
    materialMissing: cartoes.some((cartao) => cartao.materialMissing),
    ...(principal ? {} : { pieces: cartoes.reduce<MapaPecas>((soma, cartao) => somarPecas(soma, mapaPecasSalvo(cartao.pieces) ?? {}), {}) }),
  } });
  return fica.id;
}

/**
 * Leva o cartão (ou só as peças escolhidas dele) para `status`. Parte das peças
 * vira um cartão novo no destino e o resto fica onde estava. Devolve o cartão
 * que ficou com as peças movidas, já juntado ao que o projeto tinha no destino.
 */
async function moverPecas(tx: Tx, cartao: CartaoSalvo, status: ProjectWorkflowStatus, selecao?: MapaPecas, afterId?: string | null, beforeId?: string | null) {
  const disponivel = pecasDosCartoes(cartao.quoteItem).porCartao.get(cartao.id) ?? {};
  let parcial: MapaPecas | undefined;
  if (selecao) {
    const conferida = conferirSelecaoPecas(disponivel, selecao);
    if ('erro' in conferida) throw new AppError(422, conferida.erro, 'INVALID_PIECES');
    if (!conferida.completa) parcial = conferida.selecao;
  }
  if (parcial && status === cartao.status) throw new AppError(422, 'Essas peças já estão nesta etapa.', 'INVALID_PIECES');
  const completedAt = dataConclusaoAoMover({ status: cartao.status, completedAt: cartao.completedAt }, status, new Date());
  // Produzido ou entregue já não espera material: a marca sai sozinha.
  const materialMissing = status === 'DONE' || status === 'DELIVERED' ? false : cartao.materialMissing;
  if (!parcial) {
    const position = await posicaoNaColuna(tx, status, cartao.id, afterId, beforeId);
    await tx.workflowCard.update({ where: { id: cartao.id }, data: { status, position, completedAt, materialMissing } });
    return juntarNaColuna(tx, cartao.quoteItem.id, status, cartao.id);
  }
  const position = await posicaoNaColuna(tx, status, '', afterId, beforeId);
  const novo = await tx.workflowCard.create({ data: { quoteItemId: cartao.quoteItem.id, status, position, completedAt, materialMissing, pieces: parcial }, select: { id: true } });
  // O principal fica sozinho com o resto; uma parte guarda só o que sobrou nela.
  if (cartao.pieces !== null) await tx.workflowCard.update({ where: { id: cartao.id }, data: { pieces: subtrairPecas(disponivel, parcial) } });
  return juntarNaColuna(tx, cartao.quoteItem.id, status, novo.id);
}

export async function moverProjeto(tx: Tx, cardId: string, input: z.infer<typeof moverProjetoSchema>, user: AuthUser) {
  const cartao = await tx.workflowCard.findFirst({ where: { id: cardId, quoteItem: escopoFluxo(user) }, select: selectCartao });
  if (!cartao) throw new AppError(404, 'Projeto não encontrado no fluxo de trabalho.', 'NOT_FOUND');
  const ficouId = await moverPecas(tx, cartao, input.status, input.pieces, input.afterId, input.beforeId);
  const quoteDelivered = input.status === 'DELIVERED' && await entregarOrcamentoSeCompleto(tx, cartao.quoteItem.quote, user);
  const projectCards = await cartoesDoProjeto(tx, cartao.quoteItem.id);
  return { card: { ...projectCards.find((entrada) => entrada.id === ficouId)!, quoteDelivered, projectCards }, previousStatus: cartao.status };
}

/**
 * Entrega as peças escolhidas de um projeto (nota de entrega): saem primeiro
 * das já produzidas e vão para "Entregue", dividindo os cartões quando preciso.
 */
export async function entregarPecas(tx: Tx, quoteItemId: string, alocacao: Map<string, MapaPecas>) {
  for (const [cardId, selecao] of alocacao) {
    const cartao = await tx.workflowCard.findUniqueOrThrow({ where: { id: cardId }, select: selectCartao });
    if (cartao.quoteItem.id !== quoteItemId) throw new AppError(409, 'O quadro foi alterado em outra sessão. Recarregue e tente de novo.', 'WORKFLOW_CONFLICT');
    await moverPecas(tx, cartao, 'DELIVERED', selecao);
  }
}

export const faltaMaterialSchema = z.object({ faltaMaterial: z.boolean() });

/** Marca (ou tira) a falta de material de um cartão visível no fluxo; não muda a etapa nem a ordem. */
export async function marcarFaltaMaterial(tx: Tx, cardId: string, input: z.infer<typeof faltaMaterialSchema>, user: AuthUser) {
  const cartao = await tx.workflowCard.findFirst({ where: { id: cardId, quoteItem: escopoListagem(user) }, select: { materialMissing: true } });
  if (!cartao) throw new AppError(404, 'Projeto não encontrado no fluxo de trabalho.', 'NOT_FOUND');
  const updated = await tx.workflowCard.update({ where: { id: cardId }, data: { materialMissing: input.faltaMaterial }, select: selectCartao });
  return { card: paraCartao(updated), previous: cartao.materialMissing };
}

/**
 * Última peça em "Entregue": o orçamento é marcado como entregue, como em
 * "Marcar como entregue" — sai de Orçamentos e vai para o Histórico.
 */
export async function entregarOrcamentoSeCompleto(tx: Tx, quote: { id: string; status: string; executionStatus: string; completedAt: Date | null }, user: AuthUser) {
  const projetos = await tx.quoteItem.findMany({ where: { quoteId: quote.id, declinedAt: null }, select: { ...selectPecas, workflowCards: { select: { id: true, pieces: true, status: true }, orderBy: ordemDosCartoes } } });
  const faltaEntregar = projetos.some((projeto) => {
    const porCartao = distribuirPecas(pecasDoProjeto(projeto), projeto.workflowCards);
    return projeto.workflowCards.some((cartao) => cartao.status !== 'DELIVERED' && totalPecas(porCartao.get(cartao.id) ?? {}) > 0);
  });
  if (faltaEntregar) return false;
  const completedAt = quote.completedAt ?? new Date();
  await tx.quote.update({ where: { id: quote.id }, data: { executionStatus: 'COMPLETED', completedAt } });
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE', entityId: quote.id, action: 'STATUS_CHANGED',
    previous: { status: quote.status, executionStatus: quote.executionStatus, completedAt: quote.completedAt },
    current: { status: quote.status, executionStatus: 'COMPLETED', completedAt, reason: 'Todos os projetos entregues no fluxo de trabalho' } } });
  return true;
}

/**
 * Retrabalho de um projeto: as peças voltam no fluxo de trabalho — para "Em andamento" (refazer: as
 * produzidas e as entregues) ou para "Produzido – entrega/montagem" (entregar de novo: as entregues) —
 * e o orçamento fica "Em retrabalho" (se já tinha sido entregue, sai do Histórico). As notas de
 * entrega continuam guardadas.
 */
export async function retrabalharProjeto(tx: Tx, quoteId: string, quoteItemId: string, destino: 'IN_PROGRESS' | 'DONE', motivo: string | undefined, user: AuthUser) {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, ...escopoOrcamentos(user) }, select: { status: true, executionStatus: true, completedAt: true, items: { where: { id: quoteItemId }, select: { id: true, projectName: true, declinedAt: true, components: { select: { label: true, componentType: true } } } } } });
  const projeto = quote?.items[0];
  if (!quote || !projeto) throw new AppError(404, 'Projeto não encontrado neste orçamento.', 'NOT_FOUND');
  if (quote.status !== 'APPROVED' || quote.executionStatus === 'NOT_STARTED') throw new AppError(409, 'O retrabalho fica disponível depois que o serviço do orçamento é iniciado.', 'REWORK_UNAVAILABLE');
  if (projeto.declinedAt) throw new AppError(409, 'Este projeto não foi aprovado pelo cliente.', 'ITEM_DECLINED');
  const voltam: ProjectWorkflowStatus[] = destino === 'IN_PROGRESS' ? ['DONE', 'DELIVERED'] : ['DELIVERED'];
  const cartoes = await tx.workflowCard.findMany({ where: { quoteItemId, status: { in: voltam } }, select: { id: true }, orderBy: ordemDosCartoes });
  if (!cartoes.length) throw new AppError(409, destino === 'IN_PROGRESS' ? 'Este projeto ainda não foi produzido nem entregue.' : 'Este projeto ainda não teve peças entregues.', 'NOTHING_TO_REWORK');
  let position = ((await tx.workflowCard.aggregate({ where: { status: destino }, _max: { position: true } }))._max.position ?? 0) + 1;
  for (const cartao of cartoes) await tx.workflowCard.update({ where: { id: cartao.id }, data: { status: destino, position: position++, completedAt: null } });
  await juntarNaColuna(tx, quoteItemId, destino, cartoes[0].id);
  const nome = nomeProjeto(projeto);
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE_ITEM', entityId: quoteItemId, action: 'REWORK_STARTED', current: { quoteId, destino, ...(motivo ? { motivo } : {}) } } });
  if (quote.executionStatus !== 'REWORK') {
    await tx.quote.update({ where: { id: quoteId }, data: { executionStatus: 'REWORK', completedAt: null } });
    await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE', entityId: quoteId, action: 'STATUS_CHANGED',
      previous: { status: quote.status, executionStatus: quote.executionStatus, completedAt: quote.completedAt },
      current: { status: quote.status, executionStatus: 'REWORK', reason: `Retrabalho: ${nome}` } } });
  }
}
