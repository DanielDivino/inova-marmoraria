// Presentation/review of the same applied values used by the quote service.
export function appliedComponentValue(materialSubtotal: number, edges: { calculatedSubtotal: number; appliedSubtotal?: number }[], manualValue?: number) {
  return manualValue ?? Math.round((materialSubtotal + edges.reduce((sum, edge) => sum + (edge.appliedSubtotal ?? edge.calculatedSubtotal), 0)) * 100) / 100;
}
type Numeric = number | string | { toString(): string };
type Line = { calculatedSubtotal: Numeric; appliedSubtotal: Numeric };
export function individualDiscounts(items: { components: { calculatedTotal: Numeric; appliedTotal: Numeric }[]; services: Line[]; cutouts?: Line[] }[]) {
  // Component appliedTotal already includes edge adjustments (or supersedes them).
  // Summing the edges again would count their discount twice.
  const discount = (calculated: Numeric, applied: Numeric) => Math.max(0, Math.round((Number(calculated) - Number(applied)) * 100));
  return items.reduce((sum, item) => sum
    + item.components.reduce((total, component) => total + discount(component.calculatedTotal, component.appliedTotal), 0)
    + [...item.services, ...(item.cutouts ?? [])].reduce((total, line) => total + discount(line.calculatedSubtotal, line.appliedSubtotal), 0), 0) / 100;
}
