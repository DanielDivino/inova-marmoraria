import { nomeExibicaoComponente, rotuloLadoBorda, acabamentoBordaPedra } from '@inova/domain';

export type QuotePdfLine = {
  description: string;
  lengthMm?: number;
  widthMm?: number;
  measure?: number;
  unit?: string;
  quantity?: number;
  total: number;
  adjustment?: boolean;
};
const amount = (line: any) => Number(line.appliedSubtotal ?? line.calculatedSubtotal ?? line.subtotal ?? 0);
const cents = (value: number) => Math.round(value * 100);
const unit = (billing: string) => billing === 'SQUARE_METER' ? 'm²' : billing === 'LINEAR_METER' ? 'm' : billing === 'UNIT' ? 'un' : 'serviço';

/** Presentation only: snapshots remain unchanged and negotiated totals are preserved. */
export function montarLinhasPdf(items: any[]): { items: QuotePdfLine[][]; linear: QuotePdfLine[] } {
  const linear = new Map<string, QuotePdfLine>();
  const addLinear = (name: string, quantity: number, total: number) => {
    const key = name.trim().normalize('NFC').toLocaleLowerCase('pt-BR');
    const group = linear.get(key) ?? { description: name, measure: 0, unit: 'm', total: 0 };
    // Quantities already include repetitions and the number of pieces.
    group.measure = Math.round(((group.measure ?? 0) + quantity) * 10000) / 10000;
    group.total = (cents(group.total) + cents(total)) / 100;
    linear.set(key, group);
  };
  const rows = items.map(item => {
    const result: QuotePdfLine[] = [];
    const components = new Map<string, QuotePdfLine>();
    const areaFinishes = new Map<string, QuotePdfLine>();
    const mountedServices = new Map<string, QuotePdfLine & { positions: Set<string> }>();
    const backsplashes = new Map<string, { line: QuotePdfLine; count: number; adjustment: number }>();
    const mixed = new Set((item.components ?? []).map((component: any) => component.materialId ?? component.materialNameSnapshot ?? item.materialId)).size > 1;
    const materialLabel = (component: any) => component.materialNameSnapshot ?? item.materialNameSnapshot;
    const addAreaFinish = (name: string, quantity: number, total: number) => {
      const key = name.trim().normalize('NFC').toLocaleLowerCase('pt-BR');
      const group = areaFinishes.get(key) ?? { description: name.trim(), measure: 0, unit: 'm²', total: 0 };
      group.measure = Math.round(((group.measure ?? 0) + quantity) * 10000) / 10000;
      group.total = (cents(group.total) + cents(total)) / 100;
      areaFinishes.set(key, group);
    };
    // Peitoril (SILL) não tem um "comprimento × largura" único e significativo
    // nesta tabela resumo — o peitoril duplo, em especial, guarda um retângulo
    // sintético (mesma área, mas sem corresponder a nenhuma pedra real) em
    // lengthMm/widthMm só para o cálculo do valor. Deixa em branco pros dois casos.
    const sillMm = (component: any, mm: number | undefined) => component.componentType === 'SILL' ? undefined : mm;
    for (const component of item.components ?? []) {
      const material = Number(component.subtotal ?? Number(component.billableArea ?? 0) * Number(component.unitPriceSnapshot ?? item.unitPriceSnapshot ?? 0));
      const name = nomeExibicaoComponente(component) + (mixed ? ` · ${materialLabel(component)}` : '');
      const isBacksplash = component.componentType === 'BACKSPLASH';
      const backsplashKey = component.materialId ?? materialLabel(component) ?? '';
      if (isBacksplash) {
        const group = backsplashes.get(backsplashKey) ?? { line: { description: 'Rodabanca' + (mixed ? ` · ${materialLabel(component)}` : ''), measure: 0, quantity: 0, total: 0, unit: 'm²', lengthMm: sillMm(component, component.lengthMm), widthMm: sillMm(component, component.widthMm) }, count: 0, adjustment: 0 };
        group.count++;
        group.line.measure = Math.round(((group.line.measure ?? 0) + Number(component.billableArea ?? 0)) * 10000) / 10000;
        group.line.quantity = (group.line.quantity ?? 0) + Number(component.quantity ?? 1);
        group.line.total = (cents(group.line.total) + cents(material)) / 100;
        if (group.line.lengthMm !== component.lengthMm || group.line.widthMm !== component.widthMm) { group.line.lengthMm = undefined; group.line.widthMm = undefined; }
        backsplashes.set(backsplashKey, group);
      } else {
        const key = name.trim().normalize('NFC').toLocaleLowerCase('pt-BR');
        const group = components.get(key);
        if (group) {
          group.measure = Math.round(((group.measure ?? 0) + Number(component.billableArea ?? 0)) * 10000) / 10000;
          group.quantity = (group.quantity ?? 0) + Number(component.quantity ?? 1);
          group.total = (cents(group.total) + cents(material)) / 100;
          if (group.lengthMm !== component.lengthMm || group.widthMm !== component.widthMm) {
            group.lengthMm = undefined;
            group.widthMm = undefined;
          }
        } else {
          const line = {
            description: name,
            lengthMm: sillMm(component, component.lengthMm),
            widthMm: sillMm(component, component.widthMm),
            measure: Number(component.billableArea ?? 0),
            unit: 'm²',
            quantity: Number(component.quantity ?? 1),
            total: material,
          };
          components.set(key, line);
          result.push(line);
        }
      }
      let edgeCents = 0;
      for (const edge of component.edges ?? []) {
        const value = amount(edge);
        edgeCents += cents(value);
        const billing = edge.billingUnitSnapshot ?? (acabamentoBordaPedra(edge.serviceNameSnapshot ?? '') ? 'SQUARE_METER' : 'LINEAR_METER');
        const quantity = Number(edge.billedQuantity ?? 0);
        if (billing === 'LINEAR_METER') addLinear(edge.serviceNameSnapshot, quantity, value);
        else if (acabamentoBordaPedra(edge.serviceNameSnapshot ?? '') === 'VISTA') addAreaFinish(edge.serviceNameSnapshot + (mixed ? ` · ${materialLabel(component)}` : ''), quantity, value);
        else {
          const serviceName = String(edge.serviceNameSnapshot ?? 'Serviço').trim();
          const key = serviceName.normalize('NFC').toLocaleLowerCase('pt-BR') + '|' + name.normalize('NFC').toLocaleLowerCase('pt-BR');
          const group = mountedServices.get(key) ?? { description: serviceName, measure: 0, unit: unit(billing), total: 0, positions: new Set<string>() };
          group.measure = Math.round(((group.measure ?? 0) + quantity) * 10000) / 10000;
          group.total = (cents(group.total) + cents(value)) / 100;
          group.positions!.add(rotuloLadoBorda(edge.side));
          mountedServices.set(key, group);
        }
      }
      // A manual component price covers stone AND edges. Show its delta once,
      // rather than counting the grouped edge prices again inside the component.
      if (component.appliedTotal != null) {
        const delta = cents(Number(component.appliedTotal)) - cents(material) - edgeCents;
        if (delta) {
          if (isBacksplash) backsplashes.get(backsplashKey)!.adjustment += delta;
          else result.push({ description: `Ajuste negociado · ${name}`, total: delta / 100, adjustment: true });
        }
      }
    }
    for (const group of backsplashes.values()) {
      group.line.total = (cents(group.line.total) + group.adjustment) / 100;
      result.push(group.line);
    }
    result.push(...areaFinishes.values());
    for (const group of mountedServices.values()) {
      const order = ['Superior', 'Inferior', 'Esquerdo', 'Direito'];
      const positions = [...group.positions!].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      group.description = group.description + (positions.length ? ' - ' + positions.join(' / ') : '');
      const { positions: _positions, ...line } = group;
      void _positions;
      result.push(line);
    }
    if (!(item.components ?? []).length) result.push({ description: 'Material · área informada', measure: Number(item.billedQuantity), unit: unit(item.billingUnitSnapshot ?? 'SQUARE_METER'), total: Number(item.materialSubtotal ?? 0) });
    for (const service of item.services ?? []) {
      if (service.billingUnitSnapshot === 'LINEAR_METER') addLinear(service.serviceNameSnapshot, Number(service.billedQuantity), amount(service));
      else result.push({ description: service.serviceNameSnapshot, measure: Number(service.billedQuantity), unit: unit(service.billingUnitSnapshot), total: amount(service) });
    }
    for (const cutout of item.cutouts ?? []) {
      const name = cutout.serviceNameSnapshot || cutout.label || (cutout.cutoutType === 'OVAL_SINK' ? 'Recorte para cuba oval' : 'Recorte');
      if (cutout.billingUnitSnapshot === 'LINEAR_METER') addLinear(name, Number(cutout.billedQuantity ?? 0), amount(cutout));
      else result.push({ description: name, lengthMm: cutout.lengthMm, widthMm: cutout.widthMm, measure: Number(cutout.billedQuantity ?? cutout.quantity), unit: unit(cutout.billingUnitSnapshot ?? 'UNIT'), total: amount(cutout) });
    }
    return result;
  });
  return { items: rows, linear: [...linear.values()] };
}
