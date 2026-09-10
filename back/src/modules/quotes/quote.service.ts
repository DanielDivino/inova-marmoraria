import type { Prisma } from '@prisma/client';
import { canEditQuote, savedItemInput, aggregateComponentArea, calculateComponent, calculateLinearMeters, calculateLine, calculateMaterialSubtotal, calculateQuoteTotal, calculateRectangleAreaM2, canUseManualM2 } from '@inova/domain';
import { AppError, type AuthUser } from '../../shared/http.js';
import type { z } from 'zod';
import { quoteItemSchema, type createQuoteSchema, type editQuoteSchema } from './quote.schema.js';

type Tx = Prisma.TransactionClient;
type QuoteInput = z.infer<typeof createQuoteSchema>;
type QuoteItemInput = z.infer<typeof quoteItemSchema>;
type BuiltItem = any;

const quoteInclude = { parentQuote: { select: { id: true, number: true } }, complements: { select: { id: true, number: true, netTotal: true, status: true } }, customer: true, createdBy: { select: { id: true, name: true, email: true } }, items: { include: { productType: true, material: { include: { images: { orderBy: { isPrimary: 'desc' as const } } } }, services: { include: { service: true } }, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' as const } }, cutouts: { orderBy: { sortOrder: 'asc' as const } } }, orderBy: { id: 'asc' as const } } } as const satisfies Prisma.QuoteInclude;
export { quoteInclude };

function assertDiscount(user: AuthUser, gross: number, discount: number) { const allowed = user.role === 'SUPER_ADMIN' ? gross : gross * (user.maxDiscountPercent / 100); if (discount > allowed + 0.001) throw new AppError(403, `Desconto acima do limite permitido (${user.role === 'SUPER_ADMIN' ? '100' : user.maxDiscountPercent}%).`, 'DISCOUNT_NOT_ALLOWED'); }
function edgeLength(component: z.infer<typeof import('./quote.schema.js').quoteComponentSchema>, edge: z.infer<typeof import('./quote.schema.js').quoteEdgeSchema>) { if (edge.lengthMm) return edge.lengthMm; return edge.side === 'FRONT' || edge.side === 'BACK' ? component.lengthMm : component.widthMm; }

async function buildItem(tx: Tx, input: QuoteItemInput, user: AuthUser, snapshot?: Prisma.QuoteItemGetPayload<{ include: typeof quoteInclude.items.include }>): Promise<BuiltItem> {
  const [productType, material] = await Promise.all([tx.productType.findUnique({ where: { id: input.productTypeId } }), tx.material.findUnique({ where: { id: input.materialId }, include: { prices: { where: { validTo: null }, orderBy: { validFrom: 'desc' }, take: 1 } } })]);
  if (!productType || (!productType.isActive && snapshot?.productTypeId !== input.productTypeId)) throw new AppError(422, 'Tipo de peça inválido ou inativo.', 'PRODUCT_TYPE_UNAVAILABLE');
  if (!material || ((!material.isActive || !material.prices[0]) && snapshot?.materialId !== input.materialId)) throw new AppError(422, 'Material inválido, inativo ou sem preço vigente.', 'MATERIAL_UNAVAILABLE');
  const sameMaterial = snapshot?.materialId === input.materialId;
  const unitPrice = sameMaterial ? Number(snapshot.unitPriceSnapshot) : Number(material.prices[0].amount);
  if (sameMaterial) { material.name = snapshot.materialNameSnapshot; material.billingUnit = snapshot.billingUnitSnapshot; }
  // Existing prices belong to this quote, never to today's catalog.
  const getService = async (id: string, source?: { id?: string; kind: 'edge' | 'cutout' | 'service' }) => {
    const current = await tx.service.findUnique({ where: { id } });
    const saved = source?.kind === 'service' ? snapshot?.services.find((row) => row.serviceId === id)
      : source?.kind === 'edge' ? snapshot?.components.flatMap((component) => component.edges).find((row) => row.id === source.id && row.serviceId === id) : undefined;
    if (saved) return { ...current, id, isActive: true, name: saved.serviceNameSnapshot,
      billingUnit: saved.serviceNameSnapshot.toLocaleLowerCase('pt-BR') === 'saia' ? 'LINEAR_METER' as const : saved.billingUnitSnapshot,
      currentPrice: Number(saved.unitPriceSnapshot) };
    const cutout = source?.kind === 'cutout' ? snapshot?.cutouts.find((row) => row.id === source.id && row.serviceId === id) : undefined;
    if (cutout?.billingUnitSnapshot && cutout.unitPriceSnapshot !== null) return { ...current, id, isActive: true, name: cutout.serviceNameSnapshot ?? current?.name ?? 'Recorte / cuba', billingUnit: cutout.billingUnitSnapshot, currentPrice: Number(cutout.unitPriceSnapshot) };
    if (cutout && current) {
      const billed = current.billingUnit === 'FIXED' ? 1 : current.billingUnit === 'SQUARE_METER' ? (cutout.lengthMm ?? 0) * (cutout.widthMm ?? 0) * cutout.quantity / 1_000_000 : cutout.quantity;
      if (billed > 0) return { ...current, isActive: true, currentPrice: Number(cutout.calculatedSubtotal) / billed };
    }
    return current;
  };
  let billedQuantity: number; let componentRows: any[] = [];
  if (input.calculationMode === 'MANUAL_M2') {
    if (user.role !== 'SUPER_ADMIN') throw new AppError(403, 'Somente Super Admin pode informar m² manual.', 'MANUAL_M2_FORBIDDEN');
    if (!canUseManualM2(user.role, input.billedQuantity, input.manualJustification)) throw new AppError(422, 'm² manual exige justificativa e quantidade.', 'MANUAL_M2_INVALID');
    billedQuantity = input.billedQuantity!;
  } else {
    if (material.billingUnit !== 'SQUARE_METER') throw new AppError(422, 'Cálculo por componentes exige material cobrado por m².', 'DIMENSIONS_UNIT_UNSUPPORTED');
    billedQuantity = aggregateComponentArea(input.components);
    componentRows = input.components.map((component) => { const calculated = calculateComponent(component); return { ...calculated, subtotal: calculateMaterialSubtotal(calculated.billableArea, unitPrice), edges: component.edges }; });
  }
  const materialSubtotal = calculateMaterialSubtotal(billedQuantity, unitPrice);
  const edgeRowsByComponent: any[][] = [];
  for (const component of componentRows) {
    const edges: any[] = [];
    for (const edge of component.edges) {
      const service = await getService(edge.serviceId, { kind: 'edge', id: edge.id });
      if (!service || !service.isActive || service.billingUnit !== 'LINEAR_METER') throw new AppError(422, 'A borda deve usar um serviço ativo por metro linear.', 'EDGE_SERVICE_INVALID');
      const lengthMm = edgeLength(component, edge);
      const isSkirt = service.name.toLocaleLowerCase('pt-BR') === 'saia';
      if (isSkirt && !edge.heightMm) throw new AppError(422, 'Informe a altura da saia em centímetros.', 'SKIRT_HEIGHT_REQUIRED');
      const effectiveQuantity = component.quantity * edge.quantity;
      const billed = isSkirt ? calculateRectangleAreaM2(lengthMm, edge.heightMm!, effectiveQuantity) : calculateLinearMeters(lengthMm, effectiveQuantity);
      const subtotal = isSkirt ? calculateMaterialSubtotal(billed, unitPrice) : calculateLine({ billingUnit: 'LINEAR_METER', unitPrice: Number(service.currentPrice), billedQuantity: billed }).subtotal;
      edges.push({ side: edge.side, customLabel: edge.customLabel, lengthMm, heightMm: isSkirt ? edge.heightMm : null, serviceId: service.id, serviceNameSnapshot: service.name, billingUnitSnapshot: isSkirt ? 'SQUARE_METER' : 'LINEAR_METER', unitPriceSnapshot: isSkirt ? unitPrice : Number(service.currentPrice), billedQuantity: billed, subtotal, calculatedSubtotal: subtotal, appliedSubtotal: edge.appliedSubtotal ?? subtotal, hasManualPriceOverride: edge.appliedSubtotal !== undefined, sortOrder: edges.length });
    }
    edgeRowsByComponent.push(edges);
  }
  const serviceRows: any[] = [];
  for (const selected of input.services) {
    const service = await getService(selected.serviceId, { kind: 'service' }); if (!service || !service.isActive) throw new AppError(422, 'Serviço inválido ou inativo.', 'SERVICE_UNAVAILABLE');
    const billed = service.billingUnit === 'SQUARE_METER' ? billedQuantity : service.billingUnit === 'FIXED' ? 1 : selected.billedQuantity;
    if (!billed || billed <= 0) throw new AppError(422, 'Informe a quantidade do serviço selecionado.', 'SERVICE_QUANTITY_REQUIRED');
    const line = calculateLine({ billingUnit: service.billingUnit, unitPrice: Number(service.currentPrice), billedQuantity: billed });
    serviceRows.push({ serviceId: service.id, serviceNameSnapshot: service.name, billingUnitSnapshot: service.billingUnit, unitPriceSnapshot: Number(service.currentPrice), ...line, calculatedSubtotal: line.subtotal, appliedSubtotal: selected.appliedSubtotal ?? line.subtotal, hasManualPriceOverride: selected.appliedSubtotal !== undefined });
  }
  const cutoutRows: any[] = [];
  for (const cutout of input.cutouts) {
    if (!cutout.serviceId) { cutoutRows.push({ ...cutout, calculatedSubtotal: 0, appliedSubtotal: 0, hasManualPriceOverride: false }); continue; }
    const service = await getService(cutout.serviceId, { kind: 'cutout', id: cutout.id });
    if (!service || !service.isActive || service.billingUnit === 'LINEAR_METER') throw new AppError(422, 'Serviço de recorte/cuba inválido.', 'CUTOUT_SERVICE_INVALID');
    const dimensionsArea = cutout.lengthMm && cutout.widthMm ? calculateRectangleAreaM2(cutout.lengthMm, cutout.widthMm, cutout.quantity) : 0;
    const billed = service.billingUnit === 'SQUARE_METER' ? dimensionsArea : service.billingUnit === 'FIXED' ? 1 : cutout.quantity;
    if (billed <= 0) throw new AppError(422, 'Informe a quantidade ou medidas do recorte.', 'CUTOUT_QUANTITY_REQUIRED');
    const line = calculateLine({ billingUnit: service.billingUnit, unitPrice: Number(service.currentPrice), billedQuantity: billed });
    cutoutRows.push({ ...cutout, serviceNameSnapshot: service.name, billingUnitSnapshot: service.billingUnit, unitPriceSnapshot: Number(service.currentPrice), billedQuantity: billed, calculatedSubtotal: line.subtotal, appliedSubtotal: cutout.appliedSubtotal ?? line.subtotal, hasManualPriceOverride: cutout.appliedSubtotal !== undefined });
  }
  const componentRowsWithValues = componentRows.map((component, index) => {
    const edgeSubtotal = edgeRowsByComponent[index].reduce((sum, edge) => sum + edge.calculatedSubtotal, 0);
    const appliedEdgeSubtotal = edgeRowsByComponent[index].reduce((sum, edge) => sum + edge.appliedSubtotal, 0);
    const calculatedTotal = Math.round((component.subtotal + edgeSubtotal) * 100) / 100;
    const appliedTotal = component.appliedTotal === undefined ? Math.round((component.subtotal + appliedEdgeSubtotal) * 100) / 100 : component.appliedTotal;
    return { ...component, calculatedTotal, appliedTotal, hasManualPriceOverride: component.appliedTotal !== undefined, edges: edgeRowsByComponent[index] };
  });
  const edgeSubtotal = edgeRowsByComponent.flat().reduce((sum, edge) => sum + edge.subtotal, 0); const directServicesSubtotal = serviceRows.reduce((sum, row) => sum + row.subtotal, 0); const servicesSubtotal = Math.round((edgeSubtotal + directServicesSubtotal) * 100) / 100;
  const appliedComponentsTotal = componentRowsWithValues.reduce((sum, component) => sum + component.appliedTotal, 0);
  const appliedDirectServicesSubtotal = serviceRows.reduce((sum, row) => sum + row.appliedSubtotal, 0);
  const appliedCutoutsSubtotal = cutoutRows.reduce((sum, row) => sum + row.appliedSubtotal, 0);
  const total = input.calculationMode === 'MANUAL_M2' ? materialSubtotal + appliedDirectServicesSubtotal + appliedCutoutsSubtotal : Math.round((appliedComponentsTotal + appliedDirectServicesSubtotal + appliedCutoutsSubtotal) * 100) / 100;
  return { projectName: input.projectName ?? null, environment: input.environment ?? null, productTypeId: productType.id, materialId: material.id, materialNameSnapshot: material.name, billingUnitSnapshot: material.billingUnit, unitPriceSnapshot: unitPrice, quantity: input.quantity, calculationMode: input.calculationMode, manualJustification: input.manualJustification, drawingSchemaVersion: input.drawingData ? 1 : null, drawingData: input.drawingData, billedQuantity, materialSubtotal, servicesSubtotal: Math.round((servicesSubtotal + appliedCutoutsSubtotal) * 100) / 100, total, services: serviceRows, components: componentRowsWithValues, cutouts: cutoutRows };
}

async function persistItem(tx: Tx, quoteId: string, item: BuiltItem, existingId?: string) {
  const created = await tx.quoteItem.create({ data: { ...(existingId ? { id: existingId } : {}), quoteId, projectName: item.projectName, environment: item.environment, productTypeId: item.productTypeId, materialId: item.materialId, materialNameSnapshot: item.materialNameSnapshot, billingUnitSnapshot: item.billingUnitSnapshot, unitPriceSnapshot: item.unitPriceSnapshot, quantity: item.quantity, calculationMode: item.calculationMode, manualJustification: item.manualJustification, drawingSchemaVersion: item.drawingSchemaVersion, drawingData: item.drawingData, billedQuantity: item.billedQuantity, materialSubtotal: item.materialSubtotal, servicesSubtotal: item.servicesSubtotal, total: item.total, services: { create: item.services }, components: { create: item.components.map((component: any) => ({ label: component.label, componentType: component.componentType, orientation: component.orientation, shape: component.shape, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity, billableArea: component.billableArea, subtotal: component.subtotal, calculatedTotal: component.calculatedTotal, appliedTotal: component.appliedTotal, hasManualPriceOverride: component.hasManualPriceOverride, sortOrder: component.sortOrder, edges: { create: component.edges } })) } }, include: { components: { orderBy: { sortOrder: 'asc' } } } });
  for (const cutout of item.cutouts) { const component = cutout.componentIndex === undefined ? undefined : created.components[cutout.componentIndex]; await tx.quoteItemCutout.create({ data: { quoteItemId: created.id, componentId: component?.id, cutoutType: cutout.cutoutType, label: cutout.label, lengthMm: cutout.lengthMm, widthMm: cutout.widthMm, diameterMm: cutout.diameterMm, positionX: cutout.positionX, positionY: cutout.positionY, quantity: cutout.quantity, serviceId: cutout.serviceId, serviceNameSnapshot: cutout.serviceNameSnapshot, billingUnitSnapshot: cutout.billingUnitSnapshot, unitPriceSnapshot: cutout.unitPriceSnapshot, billedQuantity: cutout.billedQuantity, calculatedSubtotal: cutout.calculatedSubtotal, appliedSubtotal: cutout.appliedSubtotal, hasManualPriceOverride: cutout.hasManualPriceOverride, sortOrder: cutout.sortOrder } }); }
  return tx.quoteItem.findUniqueOrThrow({ where: { id: created.id }, include: quoteInclude.items.include });
}

export async function createQuote(tx: Tx, input: QuoteInput, user: AuthUser) {
  const customer = await tx.customer.findUnique({ where: { id: input.customerId } }); if (!customer) throw new AppError(422, 'Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
  if (input.parentQuoteId) {
    const parent = await tx.quote.findUnique({ where: { id: input.parentQuoteId } });
    if (!parent || parent.customerId !== input.customerId) throw new AppError(422, 'O complemento deve pertencer ao mesmo cliente do orçamento vinculado.', 'INVALID_PARENT_QUOTE');
  }
  const items = []; for (const item of input.items) items.push(await buildItem(tx, item, user)); const grossTotal = items.reduce((sum, item) => sum + item.total, 0); assertDiscount(user, grossTotal, input.discountAmount);
  const year = new Date().getFullYear(); const sequence = await tx.quoteSequence.upsert({ where: { year }, create: { year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
  const number = `ORC-${year}-${String(sequence.lastNumber).padStart(2, '0')}`;
  const quote = await tx.quote.create({ data: { number, parentQuoteId: input.parentQuoteId, customerId: input.customerId, customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, workAddressSnapshot: customer.address, createdById: user.id, validUntil: input.validUntil, notes: input.notes, discountAmount: input.discountAmount, grossTotal, netTotal: calculateQuoteTotal([grossTotal], input.discountAmount) } });
  for (const item of items) await persistItem(tx, quote.id, item);
  return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude });
}

export async function addQuoteItem(tx: Tx, quoteId: string, input: QuoteItemInput, user: AuthUser) {
  const quote = await tx.quote.findUnique({ where: { id: quoteId } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (quote.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
  const item = await buildItem(tx, input, user); const grossTotal = Number(quote.grossTotal) + item.total; const discount = Number(quote.discountAmount); assertDiscount(user, grossTotal, discount); const created = await persistItem(tx, quoteId, item); await tx.quote.update({ where: { id: quoteId }, data: { grossTotal, netTotal: calculateQuoteTotal([grossTotal], discount) } }); return created;
}

export async function recalculateQuote(tx: Tx, quoteId: string, user: AuthUser) { const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { items: true } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); const grossTotal = quote.items.reduce((sum, item) => sum + Number(item.total), 0); const discount = Number(quote.discountAmount); assertDiscount(user, grossTotal, discount); return tx.quote.update({ where: { id: quoteId }, data: { grossTotal, netTotal: calculateQuoteTotal([grossTotal], discount) }, include: quoteInclude }); }

export async function editQuote(tx: Tx, id: string, input: z.infer<typeof editQuoteSchema>, user: AuthUser) {
  const before = await tx.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  if (!canEditQuote(before)) throw new AppError(409, 'Este registro está encerrado. Crie um complemento ou reabra como retrabalho.', 'QUOTE_NOT_EDITABLE');
  const claimed = await tx.quote.updateMany({ where: { id, updatedAt: new Date(input.expectedUpdatedAt) }, data: { updatedAt: new Date() } });
  if (!claimed.count) throw new AppError(409, 'Este orçamento foi alterado em outra sessão. Reabra antes de salvar.', 'QUOTE_CONFLICT');
  if (before.parentQuoteId && before.customerId !== input.customerId) throw new AppError(422, 'Não é possível trocar o cliente de um complemento vinculado.', 'INVALID_PARENT_QUOTE');
  if (before.complements.length && before.customerId !== input.customerId) throw new AppError(422, 'Este orçamento possui complementos vinculados ao cliente atual.', 'INVALID_PARENT_QUOTE');
  const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new AppError(422, 'Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
  const ids = input.items.map((item) => item.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new AppError(422, 'Projetos repetidos no envio.', 'DUPLICATE_ITEMS');
  let grossTotal = 0;
  for (const item of input.items) {
    const saved = item.id ? before.items.find((entry) => entry.id === item.id) : undefined;
    if (item.id && !saved) throw new AppError(422, 'Projeto não pertence a este orçamento.', 'INVALID_ITEM');
    const canonical = (value: unknown) => JSON.stringify(quoteItemSchema.parse(value));
    const financial = (value: unknown) => canonical({ ...quoteItemSchema.parse(value), projectName: null, environment: null });
    if (saved && financial(item) === financial(savedItemInput(saved))) {
      await tx.quoteItem.update({ where: { id: saved.id }, data: { projectName: item.projectName, environment: item.environment } });
      grossTotal += Number(saved.total); continue;
    }
    const built = await buildItem(tx, item, user, saved);
    if (saved) await tx.quoteItem.delete({ where: { id: saved.id } });
    await persistItem(tx, id, built, saved?.id);
    grossTotal += built.total;
  }
  await tx.quoteItem.deleteMany({ where: { quoteId: id, id: { in: before.items.filter((item) => !ids.includes(item.id)).map((item) => item.id) } } });
  assertDiscount(user, grossTotal, input.discountAmount);
  const result = await tx.quote.update({ where: { id }, data: {
    customerId: input.customerId,
    ...(before.customerId !== input.customerId ? { customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, workAddressSnapshot: customer.address } : {}),
    validUntil: input.validUntil, notes: input.notes, discountAmount: input.discountAmount, grossTotal,
    netTotal: calculateQuoteTotal([grossTotal], input.discountAmount),
    ...(before.status === 'DRAFT' ? { status: 'SENT' as const } : {}),
  }, include: quoteInclude });
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE', entityId: id, action: 'UPDATED',
    previous: JSON.parse(JSON.stringify(before)), current: JSON.parse(JSON.stringify(result)) } });
  return result;
}
