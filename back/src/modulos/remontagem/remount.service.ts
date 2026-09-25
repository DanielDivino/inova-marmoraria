import { Prisma, type Remount } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { calcularPagamentoRemontagem, numeroDocumentoRemontagem, type RemountDocument, type RemountItem } from '@inova/domain';
import { AppError, type AuthUser } from '../../compartilhado/http.js';
import { montarItem } from '../orcamentos/quote.service.js';
import type { RemountInput } from './remount.schema.js';

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function buscarOrigemRemontagem(tx: Tx, id: string) {
  const quote = await tx.quote.findUnique({ where: { id }, select: { id: true, number: true, customerNameSnapshot: true, customerPhoneSnapshot: true, workAddressSnapshot: true, notes: true, createdAt: true } });
  if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  return quote;
}
export function serializarRemontagem(row: Remount, quoteNumber: string): RemountDocument {
  return { id: row.id, quoteId: row.quoteId, version: row.version, number: numeroDocumentoRemontagem(quoteNumber, 'REM'), deliveryNumber: numeroDocumentoRemontagem(quoteNumber, 'ENT'),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), items: row.items as unknown as RemountItem[],
    assembly: Number(row.assembly), disassembly: Number(row.disassembly), assemblyDiscount: Number(row.assemblyDiscount), disassemblyDiscount: Number(row.disassemblyDiscount),
    cardOverride: row.cardOverride === null ? null : Number(row.cardOverride), pixPercent: row.pixPercent as RemountDocument['pixPercent'],
    itemsTotal: Number(row.itemsTotal), subtotal: Number(row.subtotal), cardTotal: Number(row.cardTotal), cashDiscount: Number(row.cashDiscount), pixTotal: Number(row.pixTotal),
    notes: row.notes, itemNotes: row.itemNotes as Record<string, string> };
}
export async function calcularRemontagem(tx: Tx, id: string, input: RemountInput, user: AuthUser, saved?: Remount | null) {
  await buscarOrigemRemontagem(tx, id);
  const previous = saved === undefined ? await tx.remount.findUnique({ where: { quoteId: id } }) : saved;
  const snapshots = (previous?.items ?? []) as unknown as RemountItem[];
  const items: RemountItem[] = [];
  for (const entry of input.items) {
    const snapshot = snapshots.find(item => item.id === entry.id);
    const built = await montarItem(tx, entry, user, snapshot);
    // Mantém identidades e preços para futuras edições, como no orçamento.
    built.id = entry.id;
    built.components.forEach((component: any, index: number) => {
      component.edges.forEach((edge: any, edgeIndex: number) => { edge.id = entry.components[index].edges[edgeIndex].id ?? randomUUID(); });
    });
    built.cutouts.forEach((cutout: any) => {
      cutout.id ??= randomUUID();
      cutout.componentId = cutout.componentIndex === undefined ? null : built.components[cutout.componentIndex].id;
    });
    items.push(built);
  }
  const totals = calcularPagamentoRemontagem({ ...input, itemTotals: items.map(item => Number(item.total)) });
  if (Object.values(totals).some(value => !Number.isFinite(value) || value > 9999999999.99)) throw new AppError(422, 'Total excede o limite permitido.', 'TOTAL_INVALID');
  return { items, ...totals };
}
export async function salvarRemontagem(tx: Tx, id: string, input: RemountInput, user: AuthUser) {
  const quote = await buscarOrigemRemontagem(tx, id);
  const before = await tx.remount.findUnique({ where: { quoteId: id } });
  if ((before?.version ?? 0) !== input.expectedVersion) throw new AppError(409, 'A remontagem foi alterada em outra sessão. Reabra antes de salvar.', 'REMOUNT_CONFLICT');
  const calculated = await calcularRemontagem(tx, id, input, user, before);
  const data = { ...calculated, items: json(calculated.items), input: json(input), assembly: input.assembly, disassembly: input.disassembly,
    cardOverride: input.cardOverride, pixPercent: input.pixPercent, notes: input.notes, itemNotes: json(input.itemNotes) };
  let row: Remount;
  if (before) {
    const claimed = await tx.remount.updateMany({ where: { id: before.id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
    if (!claimed.count) throw new AppError(409, 'A remontagem foi alterada em outra sessão. Reabra antes de salvar.', 'REMOUNT_CONFLICT');
    row = await tx.remount.findUniqueOrThrow({ where: { id: before.id } });
  } else row = await tx.remount.create({ data: { ...data, quoteId: id } });
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'REMOUNT', entityId: row.id, action: before ? 'UPDATED' : 'CREATED',
    previous: before ? json(before) : Prisma.JsonNull, current: json(row) } });
  return serializarRemontagem(row, quote.number);
}
