export type ComponentType = 'TOP' | 'COUNTER' | 'BASE' | 'VISTA' | 'SKIRT' | 'BACKSPLASH' | 'SIDE_LEFT' | 'SIDE_RIGHT' | 'SILL' | 'THRESHOLD' | 'STEP' | 'OTHER';
export type ComponentOrientation = 'HORIZONTAL' | 'VERTICAL';
export type ComponentShape = 'RECTANGLE';
export type EdgeSide = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'CUSTOM';
export type CalculationMode = 'DIMENSIONS' | 'MANUAL_M2';

export interface ComponentDimensions {
  label: string;
  componentType: ComponentType;
  orientation: ComponentOrientation;
  shape?: ComponentShape;
  lengthMm: number;
  widthMm: number;
  quantity?: number;
}

export interface CalculatedComponent extends ComponentDimensions {
  shape: ComponentShape;
  quantity: number;
  billableArea: number;
}

function inteiroPositivo(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} deve ser um inteiro maior que zero.`);
  return value;
}

export function centimetrosParaMilimetros(value: string | number): number {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const centimeters = typeof normalized === 'string' ? Number(normalized) : normalized;
  if (!Number.isFinite(centimeters) || centimeters <= 0) throw new Error('A medida em centímetros deve ser maior que zero.');
  return Math.round(centimeters * 10);
}

export function milimetrosParaMetros(value: number): number {
  return inteiroPositivo(value, 'Medida') / 1000;
}

export function calcularAreaRetangularM2(lengthMm: number, widthMm: number, quantity = 1): number {
  return (inteiroPositivo(lengthMm, 'Comprimento') * inteiroPositivo(widthMm, 'Largura') * inteiroPositivo(quantity, 'Quantidade')) / 1_000_000;
}

export function calcularComponente(component: ComponentDimensions): CalculatedComponent {
  const quantity = component.quantity ?? 1;
  return { ...component, shape: component.shape ?? 'RECTANGLE', quantity, billableArea: calcularAreaRetangularM2(component.lengthMm, component.widthMm, quantity) };
}

export function somarAreasComponentes(components: ComponentDimensions[]): number {
  if (!components.length) throw new Error('Informe ao menos um componente.');
  const squareMillimeters = components.reduce((total, component) => {
    const quantity = component.quantity ?? 1;
    return total + inteiroPositivo(component.lengthMm, 'Comprimento') * inteiroPositivo(component.widthMm, 'Largura') * inteiroPositivo(quantity, 'Quantidade');
  }, 0);
  return squareMillimeters / 1_000_000;
}

export function calcularMetrosLineares(lengthMm: number, quantity = 1): number {
  return milimetrosParaMetros(lengthMm) * inteiroPositivo(quantity, 'Quantidade');
}

export function calcularSubtotalMaterial(areaM2: number, unitPrice: number): number {
  if (!Number.isFinite(areaM2) || areaM2 < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Área e preço devem ser valores não negativos.');
  return Math.round((areaM2 * unitPrice + Number.EPSILON) * 100) / 100;
}
