export type ComponentType = 'TOP' | 'SKIRT' | 'BACKSPLASH' | 'SIDE_LEFT' | 'SIDE_RIGHT' | 'SILL' | 'STEP' | 'OTHER';
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

function positiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} deve ser um inteiro maior que zero.`);
  return value;
}

export function centimetersToMillimeters(value: string | number): number {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const centimeters = typeof normalized === 'string' ? Number(normalized) : normalized;
  if (!Number.isFinite(centimeters) || centimeters <= 0) throw new Error('A medida em centímetros deve ser maior que zero.');
  return Math.round(centimeters * 10);
}

export function millimetersToMeters(value: number): number {
  return positiveInteger(value, 'Medida') / 1000;
}

export function calculateRectangleAreaM2(lengthMm: number, widthMm: number, quantity = 1): number {
  return (positiveInteger(lengthMm, 'Comprimento') * positiveInteger(widthMm, 'Largura') * positiveInteger(quantity, 'Quantidade')) / 1_000_000;
}

export function calculateComponent(component: ComponentDimensions): CalculatedComponent {
  const quantity = component.quantity ?? 1;
  return { ...component, shape: component.shape ?? 'RECTANGLE', quantity, billableArea: calculateRectangleAreaM2(component.lengthMm, component.widthMm, quantity) };
}

export function aggregateComponentArea(components: ComponentDimensions[]): number {
  if (!components.length) throw new Error('Informe ao menos um componente.');
  const squareMillimeters = components.reduce((total, component) => {
    const quantity = component.quantity ?? 1;
    return total + positiveInteger(component.lengthMm, 'Comprimento') * positiveInteger(component.widthMm, 'Largura') * positiveInteger(quantity, 'Quantidade');
  }, 0);
  return squareMillimeters / 1_000_000;
}

export function calculateLinearMeters(lengthMm: number, quantity = 1): number {
  return millimetersToMeters(lengthMm) * positiveInteger(quantity, 'Quantidade');
}

export function calculateMaterialSubtotal(areaM2: number, unitPrice: number): number {
  if (!Number.isFinite(areaM2) || areaM2 < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Área e preço devem ser valores não negativos.');
  return Math.round((areaM2 * unitPrice + Number.EPSILON) * 100) / 100;
}
