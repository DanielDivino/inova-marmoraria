/** Converte snapshots decimais para os números usados pelo contrato HTTP. */
function serializarServico(servico: any) {
  return {
    ...servico,
    unitPriceSnapshot: Number(servico.unitPriceSnapshot),
    billedQuantity: Number(servico.billedQuantity),
    subtotal: Number(servico.subtotal),
    calculatedSubtotal: Number(servico.calculatedSubtotal ?? servico.subtotal),
    appliedSubtotal: Number(servico.appliedSubtotal ?? servico.subtotal),
  };
}

export function serializarOrcamento(orcamento: any) {
  return {
    ...orcamento,
    discountAmount: Number(orcamento.discountAmount),
    grossTotal: Number(orcamento.grossTotal),
    netTotal: Number(orcamento.netTotal),
    fullDiscountAmount: orcamento.fullDiscountAmount == null ? null : Number(orcamento.fullDiscountAmount),
    items: orcamento.items?.map((item: any) => ({
      ...item,
      unitPriceSnapshot: Number(item.unitPriceSnapshot),
      billedQuantity: Number(item.billedQuantity),
      materialSubtotal: Number(item.materialSubtotal),
      servicesSubtotal: Number(item.servicesSubtotal),
      total: Number(item.total),
      services: item.services?.map(serializarServico),
      cutouts: item.cutouts?.map((recorte: any) => ({
        ...recorte,
        calculatedSubtotal: Number(recorte.calculatedSubtotal),
        appliedSubtotal: Number(recorte.appliedSubtotal ?? recorte.calculatedSubtotal),
      })),
      components: item.components?.map((componente: any) => ({
        ...componente,
        unitPriceSnapshot: componente.unitPriceSnapshot == null ? null : Number(componente.unitPriceSnapshot),
        billableArea: Number(componente.billableArea),
        subtotal: Number(componente.subtotal),
        calculatedTotal: Number(componente.calculatedTotal ?? componente.subtotal),
        appliedTotal: Number(componente.appliedTotal ?? componente.subtotal),
        edges: componente.edges?.map(serializarServico),
      })),
    })),
  };
}
