import { escopoClientes, escopoOrcamentos } from '../../compartilhado/acesso.js';
import type { Prisma } from '@prisma/client';
import { arredondarMoeda, calcularLimiteDesconto, podeEditarOrcamento, itemSalvoParaEntrada, somarAreasComponentes, calcularComponente, calcularLinha, calcularLinhaServico, calcularSubtotalMaterial, calcularAreaRetangularM2, calcularTotalOrcamento, podeUsarM2Manual, acabamentoBordaPedra, calcularAcabamentoBorda } from '@inova/domain';
import { AppError, type AuthUser } from '../../compartilhado/http.js';
import type { z } from 'zod';
import { quoteItemSchema, type createQuoteSchema, type editQuoteSchema } from './quote.schema.js';
import { formatarNumeroOrcamento, periodoNumeroOrcamento } from './quote-number.js';

type Tx = Prisma.TransactionClient;
type QuoteInput = z.infer<typeof createQuoteSchema>;
type QuoteItemInput = z.infer<typeof quoteItemSchema>;
type BuiltItem = any;

const quoteInclude = { parentQuote: { select: { id: true, number: true } }, complements: { select: { id: true, number: true, netTotal: true, status: true } }, customer: true, createdBy: { select: { id: true, name: true, email: true } }, workerAssignments: { include: { worker: { select: { id: true, name: true, workColor: true } } }, orderBy: { assignedAt: 'desc' as const } }, items: { include: { productType: true, material: { include: { images: { orderBy: { isPrimary: 'desc' as const } } } }, services: { include: { service: true } }, components: { include: { edges: true }, orderBy: { sortOrder: 'asc' as const } }, cutouts: { orderBy: { sortOrder: 'asc' as const } } }, orderBy: { id: 'asc' as const } } } as const satisfies Prisma.QuoteInclude;
export { quoteInclude };
export const incluirOrcamento = (user: AuthUser) => ({ ...quoteInclude,
  parentQuote: { ...quoteInclude.parentQuote, where: escopoOrcamentos(user) },
  complements: { ...quoteInclude.complements, where: escopoOrcamentos(user) },
});

export function validarDesconto(user: AuthUser, gross: number, discount: number) {
  const grossValue = arredondarMoeda(gross);
  const discountValue = arredondarMoeda(discount);
  const allowed = user.role === 'SUPER_ADMIN' ? grossValue : calcularLimiteDesconto(grossValue, user.maxDiscountPercent);
  if (discountValue > allowed) throw new AppError(403, `Desconto acima do limite permitido (${user.role === 'SUPER_ADMIN' ? '100' : user.maxDiscountPercent}%).`, 'DISCOUNT_NOT_ALLOWED');
}
function comprimentoBorda(component: z.infer<typeof import('./quote.schema.js').quoteComponentSchema>, edge: z.infer<typeof import('./quote.schema.js').quoteEdgeSchema>) { if (edge.lengthMm) return edge.lengthMm; return edge.side === 'FRONT' || edge.side === 'BACK' ? component.lengthMm : component.widthMm; }

export async function montarItem(tx: Tx, input: QuoteItemInput, user: AuthUser, snapshot?: import('@inova/domain').SavedQuoteItem): Promise<BuiltItem> {
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
      billingUnit: acabamentoBordaPedra(saved.serviceNameSnapshot) ? 'LINEAR_METER' as const : saved.billingUnitSnapshot,
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
    if (!podeUsarM2Manual(user.role, input.billedQuantity, input.manualJustification)) throw new AppError(422, 'm² manual exige justificativa e quantidade.', 'MANUAL_M2_INVALID');
    billedQuantity = input.billedQuantity!;
  } else {
    if (material.billingUnit !== 'SQUARE_METER') throw new AppError(422, 'Cálculo por componentes exige material cobrado por m².', 'DIMENSIONS_UNIT_UNSUPPORTED');
    billedQuantity = somarAreasComponentes(input.components);
    const materialCache = new Map([[material.id, material]]);
    for (const component of input.components) {
      const materialId = component.materialId ?? input.materialId;
      let selected = materialCache.get(materialId);
      if (!selected) {
        selected = await tx.material.findUnique({ where: { id: materialId }, include: { prices: { where: { validTo: null }, orderBy: { validFrom: 'desc' }, take: 1 } } }) ?? undefined;
        if (selected) materialCache.set(materialId, selected);
      }
      const savedComponent = snapshot?.components.find(row => row.id === component.id);
      const preserve = !!savedComponent && (savedComponent.materialId ?? snapshot?.materialId) === materialId;
      if (!selected || (!preserve && (!selected.isActive || !selected.prices[0]))) throw new AppError(422, 'Material do componente inválido, inativo ou sem preço vigente.', 'MATERIAL_UNAVAILABLE');
      const componentUnit = preserve ? savedComponent.billingUnitSnapshot ?? snapshot!.billingUnitSnapshot : selected.billingUnit;
      if (componentUnit !== 'SQUARE_METER') throw new AppError(422, 'Cálculo por componentes exige material cobrado por m².', 'DIMENSIONS_UNIT_UNSUPPORTED');
      const componentPrice = preserve ? Number(savedComponent.unitPriceSnapshot ?? snapshot!.unitPriceSnapshot) : Number(selected.prices[0].amount);
      const calculated = calcularComponente(component);
      // Preserva o id salvo quando existe; numa criação (sem snapshot), usa o id
      // gerado no cliente em vez de deixar o banco gerar um novo — isso é o que
      // permite drawingData.productionPlan referenciar o componente comercial
      // (sourceComponentId) desde a primeira gravação, sem precisar reconciliar.
      componentRows.push({ ...calculated, id: savedComponent?.id ?? component.id, materialId, materialNameSnapshot: preserve ? savedComponent.materialNameSnapshot ?? snapshot!.materialNameSnapshot : selected.name,
        billingUnitSnapshot: componentUnit, unitPriceSnapshot: componentPrice, subtotal: calcularSubtotalMaterial(calculated.billableArea, componentPrice), edges: component.edges });
    }
  }
  const materialSubtotal = input.calculationMode === 'MANUAL_M2' ? calcularSubtotalMaterial(billedQuantity, unitPrice) : calcularTotalOrcamento(componentRows.map(component => component.subtotal));
  const edgeRowsByComponent: any[][] = [];
  for (const component of componentRows) {
    const edges: any[] = [];
    for (const edge of component.edges) {
      const service = await getService(edge.serviceId, { kind: 'edge', id: edge.id });
      if (!service || !service.isActive || service.billingUnit !== 'LINEAR_METER') throw new AppError(422, 'A borda deve usar um serviço ativo por metro linear.', 'EDGE_SERVICE_INVALID');
      const lengthMm = comprimentoBorda(component, edge);
      const strip = acabamentoBordaPedra(service.name);
      if (strip && !edge.heightMm) throw new AppError(422, strip === 'VISTA' ? 'Informe a largura da vista em centímetros.' : 'Informe a altura da saia em centímetros.', strip === 'VISTA' ? 'VISTA_WIDTH_REQUIRED' : 'SKIRT_HEIGHT_REQUIRED');
      const effectiveQuantity = component.quantity * edge.quantity;
      const calculation = calcularAcabamentoBorda({ name: service.name, lengthMm, heightMm: edge.heightMm, quantity: effectiveQuantity, materialPrice: component.unitPriceSnapshot, servicePrice: Number(service.currentPrice) });
      const subtotal = calculation.subtotal;
      const appliedSubtotal = edge.appliedSubtotal === undefined ? subtotal : arredondarMoeda(edge.appliedSubtotal);
      edges.push({ side: edge.side, customLabel: edge.customLabel, lengthMm, heightMm: strip ? edge.heightMm : null, serviceId: service.id, serviceNameSnapshot: service.name, billingUnitSnapshot: calculation.billingUnit, unitPriceSnapshot: calculation.unitPrice, billedQuantity: calculation.billedQuantity, subtotal, calculatedSubtotal: subtotal, appliedSubtotal, hasManualPriceOverride: edge.appliedSubtotal !== undefined, sortOrder: edges.length });
    }
    edgeRowsByComponent.push(edges);
  }
  const serviceRows: any[] = [];
  for (const selected of input.services) {
    const service = await getService(selected.serviceId, { kind: 'service' }); if (!service || !service.isActive) throw new AppError(422, 'Serviço inválido ou inativo.', 'SERVICE_UNAVAILABLE');
    const billed = service.billingUnit === 'SQUARE_METER' ? billedQuantity * (/rebaixo italiano/i.test(service.name) ? (selected.billedQuantity ?? 1) : 1) : service.billingUnit === 'FIXED' ? 1 : selected.billedQuantity;
    if (!billed || billed <= 0) throw new AppError(422, 'Informe a quantidade do serviço selecionado.', 'SERVICE_QUANTITY_REQUIRED');
    const line = calcularLinhaServico({ serviceName: service.name, billingUnit: service.billingUnit, unitPrice: Number(service.currentPrice), billedQuantity: billed });
    const appliedSubtotal = selected.appliedSubtotal === undefined ? line.subtotal : arredondarMoeda(selected.appliedSubtotal);
    serviceRows.push({ serviceId: service.id, serviceNameSnapshot: service.name, billingUnitSnapshot: service.billingUnit, unitPriceSnapshot: Number(service.currentPrice), ...line, calculatedSubtotal: line.subtotal, appliedSubtotal, hasManualPriceOverride: selected.appliedSubtotal !== undefined });
  }
  const cutoutRows: any[] = [];
  for (const cutout of input.cutouts) {
    if (!cutout.serviceId) { cutoutRows.push({ ...cutout, calculatedSubtotal: 0, appliedSubtotal: 0, hasManualPriceOverride: false }); continue; }
    const service = await getService(cutout.serviceId, { kind: 'cutout', id: cutout.id });
    if (!service || !service.isActive || service.billingUnit === 'LINEAR_METER') throw new AppError(422, 'Serviço de recorte/cuba inválido.', 'CUTOUT_SERVICE_INVALID');
    const dimensionsArea = cutout.lengthMm && cutout.widthMm ? calcularAreaRetangularM2(cutout.lengthMm, cutout.widthMm, cutout.quantity) : 0;
    const billed = service.billingUnit === 'SQUARE_METER' ? dimensionsArea : service.billingUnit === 'FIXED' ? 1 : cutout.quantity;
    if (billed <= 0 && !(cutout.sizePending && service.billingUnit === 'SQUARE_METER')) throw new AppError(422, 'Informe a quantidade ou medidas do recorte.', 'CUTOUT_QUANTITY_REQUIRED');
    const line = billed > 0 ? calcularLinha({ billingUnit: service.billingUnit, unitPrice: Number(service.currentPrice), billedQuantity: billed }) : { subtotal: 0 };
    const appliedSubtotal = cutout.appliedSubtotal === undefined ? line.subtotal : arredondarMoeda(cutout.appliedSubtotal);
    cutoutRows.push({ ...cutout, serviceNameSnapshot: service.name, billingUnitSnapshot: service.billingUnit, unitPriceSnapshot: Number(service.currentPrice), billedQuantity: billed, calculatedSubtotal: line.subtotal, appliedSubtotal, hasManualPriceOverride: cutout.appliedSubtotal !== undefined });
  }
  const componentRowsWithValues = componentRows.map((component, index) => {
    const edgeSubtotal = calcularTotalOrcamento(edgeRowsByComponent[index].map(edge => edge.calculatedSubtotal));
    const appliedEdgeSubtotal = calcularTotalOrcamento(edgeRowsByComponent[index].map(edge => edge.appliedSubtotal));
    const calculatedTotal = calcularTotalOrcamento([component.subtotal, edgeSubtotal]);
    const appliedTotal = component.appliedTotal === undefined ? calcularTotalOrcamento([component.subtotal, appliedEdgeSubtotal]) : arredondarMoeda(component.appliedTotal);
    return { ...component, calculatedTotal, appliedTotal, hasManualPriceOverride: component.appliedTotal !== undefined, edges: edgeRowsByComponent[index] };
  });
  const servicesSubtotal = calcularTotalOrcamento([
    ...edgeRowsByComponent.flat().map(edge => edge.appliedSubtotal),
    ...serviceRows.map(row => row.appliedSubtotal),
    ...cutoutRows.map(row => row.appliedSubtotal),
  ]);
  const appliedComponentsTotal = componentRowsWithValues.reduce((sum, component) => sum + component.appliedTotal, 0);
  const appliedDirectServicesSubtotal = serviceRows.reduce((sum, row) => sum + row.appliedSubtotal, 0);
  const appliedCutoutsSubtotal = cutoutRows.reduce((sum, row) => sum + row.appliedSubtotal, 0);
  const total = input.calculationMode === 'MANUAL_M2'
    ? calcularTotalOrcamento([materialSubtotal, appliedDirectServicesSubtotal, appliedCutoutsSubtotal])
    : calcularTotalOrcamento([appliedComponentsTotal, appliedDirectServicesSubtotal, appliedCutoutsSubtotal]);
  return { projectName: input.projectName ?? null, environment: input.environment ?? null, productTypeId: productType.id, materialId: material.id, materialNameSnapshot: material.name, billingUnitSnapshot: material.billingUnit, unitPriceSnapshot: unitPrice, quantity: input.quantity, calculationMode: input.calculationMode, manualJustification: input.manualJustification, drawingSchemaVersion: input.drawingData ? 1 : null, drawingData: input.drawingData, billedQuantity, materialSubtotal, servicesSubtotal, total, services: serviceRows, components: componentRowsWithValues, cutouts: cutoutRows };
}

async function persistirItem(tx: Tx, quoteId: string, item: BuiltItem, existingId?: string) {
  const created = await tx.quoteItem.create({ data: { ...(existingId ? { id: existingId } : {}), quoteId, projectName: item.projectName, environment: item.environment, productTypeId: item.productTypeId, materialId: item.materialId, materialNameSnapshot: item.materialNameSnapshot, billingUnitSnapshot: item.billingUnitSnapshot, unitPriceSnapshot: item.unitPriceSnapshot, quantity: item.quantity, calculationMode: item.calculationMode, manualJustification: item.manualJustification, drawingSchemaVersion: item.drawingSchemaVersion, drawingData: item.drawingData, billedQuantity: item.billedQuantity, materialSubtotal: item.materialSubtotal, servicesSubtotal: item.servicesSubtotal, total: item.total, services: { create: item.services }, components: { create: item.components.map((component: any) => ({ ...(component.id ? { id: component.id } : {}), materialId: component.materialId, materialNameSnapshot: component.materialNameSnapshot, billingUnitSnapshot: component.billingUnitSnapshot, unitPriceSnapshot: component.unitPriceSnapshot, label: component.label, componentType: component.componentType, orientation: component.orientation, shape: component.shape, lengthMm: component.lengthMm, widthMm: component.widthMm, quantity: component.quantity, billableArea: component.billableArea, subtotal: component.subtotal, calculatedTotal: component.calculatedTotal, appliedTotal: component.appliedTotal, hasManualPriceOverride: component.hasManualPriceOverride, sortOrder: component.sortOrder, edges: { create: component.edges } })) } }, include: { components: { orderBy: { sortOrder: 'asc' } } } });
  // Mesma razão do id de componente: preserva o id do cliente desde a criação,
  // pra productionPlan.cutouts (sourceCutoutId) não precisar reconciliar depois.
  for (const cutout of item.cutouts) { const component = cutout.componentIndex === undefined ? undefined : created.components[cutout.componentIndex]; await tx.quoteItemCutout.create({ data: { ...(cutout.id ? { id: cutout.id } : {}), quoteItemId: created.id, componentId: component?.id, cutoutType: cutout.cutoutType, sizePending: cutout.sizePending ?? false, label: cutout.label, lengthMm: cutout.lengthMm, widthMm: cutout.widthMm, diameterMm: cutout.diameterMm, positionX: cutout.positionX, positionY: cutout.positionY, quantity: cutout.quantity, serviceId: cutout.serviceId, serviceNameSnapshot: cutout.serviceNameSnapshot, billingUnitSnapshot: cutout.billingUnitSnapshot, unitPriceSnapshot: cutout.unitPriceSnapshot, billedQuantity: cutout.billedQuantity, calculatedSubtotal: cutout.calculatedSubtotal, appliedSubtotal: cutout.appliedSubtotal, hasManualPriceOverride: cutout.hasManualPriceOverride, sortOrder: cutout.sortOrder } }); }
  return tx.quoteItem.findUniqueOrThrow({ where: { id: created.id }, include: quoteInclude.items.include });
}

export async function criarOrcamento(tx: Tx, input: QuoteInput, user: AuthUser) {
  const customer = await tx.customer.findUnique({ where: { id: input.customerId, ...escopoClientes(user) } }); if (!customer) throw new AppError(422, 'Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
  if (input.parentQuoteId) {
    const parent = await tx.quote.findUnique({ where: { id: input.parentQuoteId, ...escopoOrcamentos(user) } });
    if (!parent || parent.customerId !== input.customerId) throw new AppError(422, 'O complemento deve pertencer ao mesmo cliente do orçamento vinculado.', 'INVALID_PARENT_QUOTE');
  }
  const items = []; for (const item of input.items) items.push(await montarItem(tx, item, user)); const grossTotal = calcularTotalOrcamento(items.map(item => item.total)); validarDesconto(user, grossTotal, input.discountAmount);
  const createdAt = new Date();
  const { year, month } = periodoNumeroOrcamento(createdAt);
  const sequence = await tx.quoteSequence.upsert({ where: { year_month: { year, month } }, create: { year, month, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
  const number = formatarNumeroOrcamento(createdAt, sequence.lastNumber);
  const quote = await tx.quote.create({ data: { number, createdAt, parentQuoteId: input.parentQuoteId, customerId: input.customerId, customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, workAddressSnapshot: customer.address, createdById: user.id, validUntil: input.validUntil, notes: input.notes, deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline + 'T00:00:00.000Z') : null, installationDeadline: input.installationDeadline ? new Date(input.installationDeadline + 'T00:00:00.000Z') : null, deadlineConfirmed: input.deadlineConfirmed ?? false, deadlineNote: input.deadlineNote, discountAmount: input.discountAmount, grossTotal, netTotal: calcularTotalOrcamento([grossTotal], input.discountAmount) } });
  for (const item of items) await persistirItem(tx, quote.id, item);
  return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: incluirOrcamento(user) });
}

export async function adicionarItemOrcamento(tx: Tx, quoteId: string, input: QuoteItemInput, user: AuthUser) {
  const quote = await tx.quote.findUnique({ where: { id: quoteId } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); if (quote.status !== 'DRAFT') throw new AppError(409, 'Apenas rascunhos podem ser alterados.', 'QUOTE_NOT_EDITABLE');
  const item = await montarItem(tx, input, user); const grossTotal = calcularTotalOrcamento([Number(quote.grossTotal), item.total]); const discount = Number(quote.discountAmount); validarDesconto(user, grossTotal, discount); const created = await persistirItem(tx, quoteId, item); await tx.quote.update({ where: { id: quoteId }, data: { grossTotal, netTotal: calcularTotalOrcamento([grossTotal], discount) } }); return created;
}

export async function recalcularOrcamento(tx: Tx, quoteId: string, user: AuthUser) { const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { items: true } }); if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND'); const grossTotal = calcularTotalOrcamento(quote.items.map(item => Number(item.total))); const discount = Number(quote.discountAmount); validarDesconto(user, grossTotal, discount); return tx.quote.update({ where: { id: quoteId }, data: { grossTotal, netTotal: calcularTotalOrcamento([grossTotal], discount) }, include: incluirOrcamento(user) }); }

export async function editarOrcamento(tx: Tx, id: string, input: z.infer<typeof editQuoteSchema>, user: AuthUser) {
  // Internal validation must also account for complements created by administrators.
  const before = await tx.quote.findUnique({ where: { id, ...escopoOrcamentos(user) }, include: quoteInclude });
  if (!before) throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  if (!podeEditarOrcamento(before)) throw new AppError(409, 'Este registro está encerrado. Crie um complemento ou reabra como retrabalho.', 'QUOTE_NOT_EDITABLE');
  const claimed = await tx.quote.updateMany({ where: { id, updatedAt: new Date(input.expectedUpdatedAt) }, data: { updatedAt: new Date() } });
  if (!claimed.count) throw new AppError(409, 'Este orçamento foi alterado em outra sessão. Reabra antes de salvar.', 'QUOTE_CONFLICT');
  if (before.parentQuoteId && before.customerId !== input.customerId) throw new AppError(422, 'Não é possível trocar o cliente de um complemento vinculado.', 'INVALID_PARENT_QUOTE');
  if (before.complements.length && before.customerId !== input.customerId) throw new AppError(422, 'Este orçamento possui complementos vinculados ao cliente atual.', 'INVALID_PARENT_QUOTE');
  const customer = await tx.customer.findUnique({ where: { id: input.customerId, ...escopoClientes(user) } });
  if (!customer) throw new AppError(422, 'Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
  const ids = input.items.map((item) => item.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new AppError(422, 'Projetos repetidos no envio.', 'DUPLICATE_ITEMS');
  let grossTotal = 0;
  for (const item of input.items) {
    const saved = item.id ? before.items.find((entry) => entry.id === item.id) : undefined;
    if (item.id && !saved) throw new AppError(422, 'Projeto não pertence a este orçamento.', 'INVALID_ITEM');
    const canonical = (value: unknown) => JSON.stringify(quoteItemSchema.parse(value));
    const financial = (value: unknown) => canonical({ ...quoteItemSchema.parse(value), projectName: null, environment: null, drawingData: undefined });
    if (saved && financial(item) === financial(itemSalvoParaEntrada(saved))) {
      await tx.quoteItem.update({ where: { id: saved.id }, data: { projectName: item.projectName, environment: item.environment, ...(item.drawingData ? { drawingData: item.drawingData as Prisma.InputJsonValue, drawingSchemaVersion: 1 } : {}) } });
      grossTotal = calcularTotalOrcamento([grossTotal, Number(saved.total)]); continue;
    }
    const built = await montarItem(tx, item, user, saved);
    if (saved) await tx.quoteItem.delete({ where: { id: saved.id } });
    await persistirItem(tx, id, built, saved?.id);
    grossTotal = calcularTotalOrcamento([grossTotal, built.total]);
  }
  await tx.quoteItem.deleteMany({ where: { quoteId: id, id: { in: before.items.filter((item) => !ids.includes(item.id)).map((item) => item.id) } } });
  validarDesconto(user, grossTotal, input.discountAmount);
  const result = await tx.quote.update({ where: { id }, data: {
    customerId: input.customerId,
    ...(before.customerId !== input.customerId ? { customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, workAddressSnapshot: customer.address } : {}),
    validUntil: input.validUntil, notes: input.notes, ...(input.deliveryDeadline !== undefined ? { deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline + 'T00:00:00.000Z') : null } : {}), ...(input.installationDeadline !== undefined ? { installationDeadline: input.installationDeadline ? new Date(input.installationDeadline + 'T00:00:00.000Z') : null } : {}), ...(input.deadlineConfirmed !== undefined ? { deadlineConfirmed: input.deadlineConfirmed } : {}), ...(input.deadlineNote !== undefined ? { deadlineNote: input.deadlineNote } : {}), discountAmount: input.discountAmount, grossTotal,
    netTotal: calcularTotalOrcamento([grossTotal], input.discountAmount),
    ...(before.status === 'DRAFT' ? { status: 'SENT' as const } : {}),
  }, include: incluirOrcamento(user) });
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'QUOTE', entityId: id, action: 'UPDATED',
    previous: JSON.parse(JSON.stringify(before)), current: JSON.parse(JSON.stringify(result)) } });
  return result;
}
