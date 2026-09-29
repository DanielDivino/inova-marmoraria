import { z } from 'zod';

const n = z.number().finite().min(-1e6).max(1e6);
const id = z.string().min(1).max(100);
const point = z.object({ id, x: n, y: n, bulge: z.number().finite().min(-10).max(10).default(0) }).strict();
const visual = z.object({ id: z.string().optional(), name: z.string().max(160).optional(), imageUrl: z.string().regex(/^\/uploads\/materials\/[a-zA-Z0-9._-]+$/).optional(), textureScaleMm: z.number().positive().max(100000).default(600), veinRotationDeg: n.default(0), roughness: z.number().min(0).max(1).default(.25) }).strict();
export const pieceSchema = z.object({
  id, name: z.string().trim().min(1).max(160), contour: z.array(point).min(3).max(1000), thicknessMm: n,
  x: n, y: n, z: n.default(0), rotationDeg: n.default(0), tiltDeg: n.default(0), locked: z.boolean().default(false),
  material: visual.optional(), layerId: id.default('pieces'), geometryMode: z.enum(['PARAMETRIC', 'FREE']).default('FREE'),
  // U: width = comprimento total, length = fundo (profundidade do trecho do fundo), braços com comprimento e largura próprios.
  parameters: z.object({
    shape: z.enum(['RECTANGLE', 'L', 'CIRCLE', 'ROUNDED', 'U']), width: n, length: n, radius: n.default(0), arm: n.default(600),
    leftArm: n.optional(), rightArm: n.optional(), leftArmWidth: n.optional(), rightArmWidth: n.optional(),
  }).strict().optional(),
  /** Texto livre no lugar da medida de um lado (ex.: "medir no local"), pela id do vértice que inicia o lado. */
  dimensionLabels: z.record(id, z.string().trim().max(120)).default({}),
  /** Lados com cadeado: não mudam quando outro lado é redimensionado. */
  lockedEdges: z.array(id).max(1000).default([]),
}).strict();
export const featureSchema = z.object({
  id, type: z.enum(['SINK', 'SCULPTED_SINK', 'CUTOUT', 'HOLE', 'SKIRT', 'BACKSPLASH', 'EDGE_FINISH']), pieceId: id,
  name: z.string().max(160).default('Componente'), x: n, y: n, rotationDeg: n.default(0), widthMm: n.default(500), lengthMm: n.default(300),
  diameterMm: n.default(35), depthMm: n.default(180), heightMm: n.default(100), thicknessMm: n.default(20), radiusMm: n.default(0),
  shape: z.enum(['RECTANGLE', 'OVAL']).default('RECTANGLE'), installation: z.enum(['UNDERMOUNT', 'TOPMOUNT', 'SCULPTED']).default('UNDERMOUNT'),
  cutoutId: id.optional(), edgeId: id.optional(), startMm: n.default(0), extentMm: n.default(600), offsetMm: n.default(0),
  profile: z.enum(['SIMPLE', 'MITER45', 'BEVEL', 'ROUND']).default('SIMPLE'), layerId: id.default('features'),
  wallMm: n.default(20), bottomMm: n.default(20), slopePercent: z.number().min(0).max(30).default(0), drainX: n.default(0), drainY: n.default(0), drainDiameterMm: n.default(40),
}).strict();
const layerSchema = z.object({ id, name: z.string().min(1).max(80), visible: z.boolean().default(true), locked: z.boolean().default(false) }).strict();
const ref = z.object({ pieceId: id, vertexId: id }).strict();
export const technicalDocumentSchema = z.object({
  schemaVersion: z.literal(1), unit: z.literal('mm'), coordinateSystem: z.object({ x: z.literal('right'), y: z.literal('up'), rotation: z.literal('clockwise-degrees') }).strict(),
  assemblies: z.array(z.object({ id, name: z.string().min(1).max(120), pieceIds: z.array(id), locked: z.boolean().default(false) }).strict()).max(100),
  pieces: z.array(pieceSchema).max(500), features: z.array(featureSchema).max(1000), layers: z.array(layerSchema).max(50),
  annotations: z.array(z.object({ id, text: z.string().min(1).max(2000), x: n, y: n, layerId: id.default('annotations'), fontSizeMm: z.number().positive().max(2000).optional() }).strict()).max(500),
  dimensions: z.array(z.object({ id, from: ref, to: ref, offsetMm: n.default(100), layerId: id.default('dimensions') }).strict()).max(1000).default([]),
  constraints: z.array(z.object({ id, pieceId: id, targetPieceId: id, dx: n, dy: n, rotationOffset: n.default(0) }).strict()).max(500).default([]),
  views: z.array(z.object({ id, name: z.string().min(1).max(80), mode: z.enum(['TOP','FRONT','SIDE','ISO']), x: n.default(0), y: n.default(0), width: z.number().positive().default(4000) }).strict()).max(50).default([]),
  manufacturing: z.object({ minimumClearanceMm: z.number().nonnegative().max(1000).nullable().default(null), toleranceMm: z.number().nonnegative().max(100).nullable().default(null), notes: z.string().max(2000).default('') }).strict().default({}),
}).strict();
export type TechnicalDocument = z.infer<typeof technicalDocumentSchema>;
export type Piece = TechnicalDocument['pieces'][number];
export type Feature = TechnicalDocument['features'][number];
export type Vertex = Piece['contour'][number];
export type Annotation = TechnicalDocument['annotations'][number];
export type PieceShape = NonNullable<Piece['parameters']>['shape'];
export type PieceParameters = NonNullable<Piece['parameters']>;
export type Point = { x: number; y: number };
export type Diagnostic = { severity: 'STRUCTURAL' | 'TECHNICAL' | 'WARNING'; code: string; message: string; elementId?: string };
export const emptyTechnicalDocument = (): TechnicalDocument => technicalDocumentSchema.parse({ schemaVersion: 1, unit: 'mm', coordinateSystem: { x: 'right', y: 'up', rotation: 'clockwise-degrees' }, assemblies: [], pieces: [], features: [], annotations: [], layers: ['pieces', 'features', 'dimensions', 'references', 'annotations'].map((id, i) => ({ id, name: ['Peças', 'Recortes e cubas', 'Cotas', 'Referências', 'Anotações'][i], visible: true, locked: false })) });
export function parseMeasure(text: string, unit: 'mm' | 'cm' | 'm') {
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text.trim())) throw new Error('Informe uma medida numérica.');
  const value = Number(text.replace(',', '.')) * ({mm: 1, cm: 10, m: 1000}[unit]);
  if (!Number.isFinite(value) || Math.abs(value) > 1e6) throw new Error('Medida fora do limite.');
  return Math.round(value * 10) / 10;
}
/** Formata uma medida em mm como "1m15" (metros e centímetros) ou "65cm" quando menor que 1 m. */
export function formatMeasure(mm: number): string {
  const rounded = Math.round(mm);
  const negative = rounded < 0;
  const value = Math.abs(rounded);
  const meters = Math.trunc(value / 1000);
  const centimeters = Math.round((value % 1000) / 10);
  const text = meters > 0 ? (centimeters > 0 ? `${meters}m${centimeters.toString().padStart(2, '0')}` : `${meters}m`) : `${centimeters}cm`;
  return negative ? `-${text}` : text;
}
/** Lê medidas escritas como "1m15", "1m15cm", "1,15m", "115cm", "1150mm" ou "1150" (mm). */
export function parseFriendlyMeasure(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(',', '.');
  if (!raw) return null;
  let match = raw.match(/^(-?\d+(?:\.\d+)?)\s*m\s*(\d+(?:\.\d+)?)?\s*(?:cm)?$/);
  if (match) { const meters = Number(match[1]); const centimeters = Number(match[2] ?? 0); return meters * 1000 + Math.sign(meters || 1) * centimeters * 10; }
  match = raw.match(/^(-?\d+(?:\.\d+)?)\s*cm$/);
  if (match) return Number(match[1]) * 10;
  match = raw.match(/^(-?\d+(?:\.\d+)?)\s*mm$/);
  if (match) return Number(match[1]);
  match = raw.match(/^(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]);
  return null;
}
