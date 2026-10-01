import type { ComponentType } from '@inova/domain';
export type { ComponentType } from '@inova/domain';
export type Orientation = 'HORIZONTAL' | 'VERTICAL';
export type EdgeSide = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'CUSTOM';
export type CutoutType = 'SINK' | 'SCULPTED_SINK' | 'OVAL_SINK' | 'COOKTOP' | 'FAUCET_HOLE' | 'GENERIC_HOLE' | 'OTHER';
export type DraftEdge = { id?: string; side: EdgeSide; serviceId: string; lengthCm?: string; heightCm?: string; quantity: number; customLabel?: string; appliedTotal?: string };
export type DraftComponent = { materialId?: string;
  /** A peça tem pedra própria (escolhida nela): não acompanha a troca da pedra do projeto. Só existe no rascunho. */
  materialProprio?: boolean; id: string; label: string; componentType: ComponentType; orientation: Orientation; lengthCm: string; widthCm: string; quantity: number; edges: DraftEdge[]; appliedTotal?: string; parentComponentId?: string; parentSide?: Exclude<EdgeSide, 'CUSTOM'>; sillDetailCm?: string; sillDetailHeightCm?: string;
  /** Orçamento Rápido, peitoril de duas pedras sobrepostas — ver DetalhePeitorilDuplo.
   * O comprimento é o normal (lengthCm, compartilhado pelas duas pedras); só a
   * largura se divide nesses 4 valores independentes (sem fórmula entre eles). */
  sillTopWidthCm?: string; sillBottomWidthCm?: string; sillFinalWidthCm?: string; sillOverlapCm?: string;
  /** Acabamento "Cantos arredondados": as 4 pontas com este raio (cm); vira a peça "Arredondada" do desenho técnico. */
  raioCantosCm?: string };
export type DraftCutout = { id: string; componentIndex?: number; cutoutType: CutoutType; sizePending?: boolean; label: string; lengthCm?: string; widthCm?: string; diameterCm?: string; positionXCm?: string; positionYCm?: string; quantity: number; serviceId?: string; appliedTotal?: string };
export type DraftItem = {
  id: string;
  projectName: string;
  productTypeId: string;
  materialId: string;
  calculationMode: 'DIMENSIONS' | 'MANUAL_M2';
  manualM2: string;
  manualJustification: string;
  components: DraftComponent[];
  cutouts: DraftCutout[];
  serviceIds: string[];
  serviceQuantities: Record<string, string>;
  serviceAppliedValues: Record<string, string>;
  drawingData?: Record<string, unknown>;
  /** Orçamento Rápido: arredonda a área de cada peça para cima (múltiplo de 5 cm por lado) só para o cálculo do valor do material — a medida exibida/salva permanece exata. */
  arredondarM2?: boolean;
};
