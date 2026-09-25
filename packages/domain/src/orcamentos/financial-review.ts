import { arredondarMoeda } from '../calculos/quote-calculator.js';

// Presentation/review of the same applied values used by the quote service.
export function valorAplicadoComponente(materialSubtotal: number, edges: { calculatedSubtotal: number; appliedSubtotal?: number }[], manualValue?: number) {
  return manualValue === undefined ? arredondarMoeda(materialSubtotal + edges.reduce((sum, edge) => sum + (edge.appliedSubtotal ?? edge.calculatedSubtotal), 0)) : arredondarMoeda(manualValue);
}
type Numeric = number | string | { toString(): string };
type Line = { calculatedSubtotal: Numeric; appliedSubtotal: Numeric };
export function descontosIndividuais(items: { components: { calculatedTotal: Numeric; appliedTotal: Numeric }[]; services: Line[]; cutouts?: Line[] }[]) {
  // Component appliedTotal already includes edge adjustments (or supersedes them).
  // Summing the edges again would count their discount twice.
  const discount = (calculated: Numeric, applied: Numeric) => Math.max(0, Math.round((arredondarMoeda(Number(calculated)) - arredondarMoeda(Number(applied))) * 100));
  return items.reduce((sum, item) => sum
    + item.components.reduce((total, component) => total + discount(component.calculatedTotal, component.appliedTotal), 0)
    + [...item.services, ...(item.cutouts ?? [])].reduce((total, line) => total + discount(line.calculatedSubtotal, line.appliedSubtotal), 0), 0) / 100;
}
