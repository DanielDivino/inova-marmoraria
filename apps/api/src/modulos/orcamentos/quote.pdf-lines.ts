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
/** Peças que são faixas de pedra presas ao lado de outra, e a ordem delas no PDF. */
const STRIP_NAMES: Record<string, string> = { BACKSPLASH: 'Rodabanca', VISTA: 'Vista', SKIRT: 'Saia' };
const STRIP_ORDER = ['Rodabanca', 'Vista', 'Saia'];
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
    const mixed = new Set((item.components ?? []).map((component: any) => component.materialId ?? component.materialNameSnapshot ?? item.materialId)).size > 1;
    const materialLabel = (component: any) => component.materialNameSnapshot ?? item.materialNameSnapshot;
    // Faixas de pedra (rodabanca, vista e saia): uma linha só por tipo e pedra no projeto, com m²,
    // quantidade e valor somados — venham das peças (Tipo/descrição) ou, nos orçamentos antigos, da
    // saia e da vista lançadas como acabamento. Comprimento e largura aparecem quando são os mesmos em
    // todas as peças; os lados, quando a saia (acabamento) é de uma peça só.
    const strips = new Map<string, { line: QuotePdfLine; lengths: Set<number | undefined>; widths: Set<number | undefined>; adjustment: number; sides: Set<string>; pieces: Set<unknown>; fromEdge: boolean; fromComponent: boolean }>();
    const strip = (name: string, component: any) => {
      const description = name + (mixed ? ` · ${materialLabel(component)}` : '');
      const key = description.normalize('NFC').toLocaleLowerCase('pt-BR');
      const group = strips.get(key) ?? { line: { description, measure: 0, quantity: 0, unit: 'm²', total: 0 }, lengths: new Set(), widths: new Set(), adjustment: 0, sides: new Set(), pieces: new Set(), fromEdge: false, fromComponent: false };
      strips.set(key, group);
      return group;
    };
    // Peitoril (SILL) não tem um "comprimento × largura" único e significativo
    // nesta tabela resumo — o peitoril duplo, em especial, guarda um retângulo
    // sintético (mesma área, mas sem corresponder a nenhuma pedra real) em
    // lengthMm/widthMm só para o cálculo do valor. Deixa em branco pros dois casos.
    const sillMm = (component: any, mm: number | undefined) => component.componentType === 'SILL' ? undefined : mm;
    for (const component of item.components ?? []) {
      const material = Number(component.subtotal ?? Number(component.billableArea ?? 0) * Number(component.unitPriceSnapshot ?? item.unitPriceSnapshot ?? 0));
      const name = nomeExibicaoComponente(component) + (mixed ? ` · ${materialLabel(component)}` : '');
      const stripName = STRIP_NAMES[component.componentType];
      const stripGroup = stripName ? strip(stripName, component) : undefined;
      // Só viram uma linha as peças com o mesmo nome E a mesma medida (quantidade e
      // m² somados): comprimento e largura nunca somem do PDF.
      const medidaKey = `${sillMm(component, component.lengthMm) ?? ''}x${sillMm(component, component.widthMm) ?? ''}`;
      if (stripGroup) {
        stripGroup.fromComponent = true;
        stripGroup.lengths.add(component.lengthMm ?? undefined);
        stripGroup.widths.add(component.widthMm ?? undefined);
        stripGroup.line.measure = Math.round(((stripGroup.line.measure ?? 0) + Number(component.billableArea ?? 0)) * 10000) / 10000;
        stripGroup.line.quantity = (stripGroup.line.quantity ?? 0) + Number(component.quantity ?? 1);
        stripGroup.line.total = (cents(stripGroup.line.total) + cents(material)) / 100;
      } else {
        const key = name.trim().normalize('NFC').toLocaleLowerCase('pt-BR') + '|' + medidaKey;
        const group = components.get(key);
        if (group) {
          group.measure = Math.round(((group.measure ?? 0) + Number(component.billableArea ?? 0)) * 10000) / 10000;
          group.quantity = (group.quantity ?? 0) + Number(component.quantity ?? 1);
          group.total = (cents(group.total) + cents(material)) / 100;
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
        if (billing === 'LINEAR_METER') { addLinear(edge.serviceNameSnapshot, quantity, value); continue; }
        // Saia e vista lançadas como acabamento (orçamentos antigos) somam na mesma linha das peças.
        const kind = acabamentoBordaPedra(edge.serviceNameSnapshot ?? '');
        const group = strip(kind ? STRIP_NAMES[kind] : String(edge.serviceNameSnapshot ?? 'Serviço').trim(), component);
        group.fromEdge = true;
        group.line.unit = unit(billing);
        group.line.measure = Math.round(((group.line.measure ?? 0) + quantity) * 10000) / 10000;
        group.line.total = (cents(group.line.total) + cents(value)) / 100;
        group.sides.add(rotuloLadoBorda(edge.side));
        group.pieces.add(component);
      }
      // A manual component price covers stone AND edges. Show its delta once,
      // rather than counting the grouped edge prices again inside the component.
      if (component.appliedTotal != null) {
        const delta = cents(Number(component.appliedTotal)) - cents(material) - edgeCents;
        if (delta) {
          if (stripGroup) stripGroup.adjustment += delta;
          else result.push({ description: `Ajuste negociado · ${name}`, total: delta / 100, adjustment: true });
        }
      }
    }
    const stripOrder = (description: string) => { const index = STRIP_ORDER.indexOf(description.split(' · ')[0]); return index < 0 ? STRIP_ORDER.length : index; };
    for (const group of [...strips.values()].sort((a, b) => stripOrder(a.line.description) - stripOrder(b.line.description))) {
      const { quantity, ...line } = group.line;
      const [lengthMm] = group.lengths, [widthMm] = group.widths;
      // Os lados só dizem algo quando a saia é acabamento de uma peça; somando várias, fica o nome.
      const order = ['Superior', 'Inferior', 'Esquerdo', 'Direito'];
      const sides = !group.fromComponent && group.pieces.size === 1 ? [...group.sides].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : [];
      result.push({
        ...line, description: line.description + (sides.length ? ' - ' + sides.join(' / ') : ''), total: (cents(line.total) + group.adjustment) / 100,
        ...(group.fromEdge ? {} : { quantity }),
        ...(!group.fromEdge && group.lengths.size === 1 && lengthMm ? { lengthMm } : {}), ...(!group.fromEdge && group.widths.size === 1 && widthMm ? { widthMm } : {}),
      });
    }
    if (!(item.components ?? []).length) result.push({ description: 'Material · área informada', measure: Number(item.billedQuantity), unit: unit(item.billingUnitSnapshot ?? 'SQUARE_METER'), total: Number(item.materialSubtotal ?? 0) });
    for (const service of item.services ?? []) {
      // O valor que foi digitado (a montagem, por exemplo), sem linha de desconto à parte.
      const applied = amount(service);
      if (service.billingUnitSnapshot === 'LINEAR_METER') addLinear(service.serviceNameSnapshot, Number(service.billedQuantity), applied);
      else result.push({ description: service.serviceNameSnapshot, measure: Number(service.billedQuantity), unit: unit(service.billingUnitSnapshot), total: applied });
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
