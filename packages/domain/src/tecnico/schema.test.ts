import { describe, expect, it } from 'vitest';
import { formatMeasure, parseFriendlyMeasure, technicalDocumentSchema } from './schema.js';
import { makePiece, validateTechnicalDocument } from './geometry.js';

describe('formatMeasure', () => {
  it('formata medidas acima de 1 metro como metros e centímetros', () => {
    expect(formatMeasure(1150)).toBe('1m15');
    expect(formatMeasure(2440)).toBe('2m44');
    expect(formatMeasure(3000)).toBe('3m');
  });
  it('formata medidas abaixo de 1 metro em centímetros', () => {
    expect(formatMeasure(650)).toBe('65cm');
    expect(formatMeasure(20)).toBe('2cm');
  });
  it('preserva o sinal negativo', () => {
    expect(formatMeasure(-1150)).toBe('-1m15');
  });
});

describe('parseFriendlyMeasure', () => {
  it('lê o formato metros e centímetros', () => {
    expect(parseFriendlyMeasure('1m15')).toBe(1150);
    expect(parseFriendlyMeasure('1m15cm')).toBe(1150);
    expect(parseFriendlyMeasure('2m')).toBe(2000);
  });
  it('lê metros decimais com vírgula ou ponto', () => {
    expect(parseFriendlyMeasure('1,15m')).toBe(1150);
    expect(parseFriendlyMeasure('1.15m')).toBe(1150);
  });
  it('lê centímetros e milímetros explícitos', () => {
    expect(parseFriendlyMeasure('115cm')).toBe(1150);
    expect(parseFriendlyMeasure('1150mm')).toBe(1150);
  });
  it('trata um número puro como milímetros, para compatibilidade com os campos existentes', () => {
    expect(parseFriendlyMeasure('1150')).toBe(1150);
  });
  it('rejeita texto que não é uma medida', () => {
    expect(parseFriendlyMeasure('abc')).toBeNull();
    expect(parseFriendlyMeasure('')).toBeNull();
  });
});

describe('compatibilidade dos rascunhos já salvos', () => {
  // Rascunho gravado antes dos campos novos (sem dimensionLabels, lockedEdges, fontSizeMm nem forma U).
  const antigo = {
    schemaVersion: 1, unit: 'mm', coordinateSystem: { x: 'right', y: 'up', rotation: 'clockwise-degrees' }, assemblies: [],
    pieces: [{ id: 'p1', name: 'Bancada', thicknessMm: 20, x: 0, y: 0, z: 0, rotationDeg: 0, tiltDeg: 0, locked: false, layerId: 'pieces', geometryMode: 'PARAMETRIC',
      parameters: { shape: 'RECTANGLE', width: 2000, length: 600, radius: 0, arm: 600 },
      contour: [{ id: 'p1-v0', x: 0, y: 0, bulge: 0 }, { id: 'p1-v1', x: 2000, y: 0, bulge: 0 }, { id: 'p1-v2', x: 2000, y: 600, bulge: 0 }, { id: 'p1-v3', x: 0, y: 600, bulge: 0 }] }],
    features: [], layers: [{ id: 'pieces', name: 'Peças', visible: true, locked: false }],
    annotations: [{ id: 'a1', text: 'Encosto na parede', x: 100, y: 700, layerId: 'annotations' }],
  };
  it('continua válido e ganha os padrões dos campos novos', () => {
    const documento = technicalDocumentSchema.parse(antigo);
    expect(documento.pieces[0]).toMatchObject({ dimensionLabels: {}, lockedEdges: [] });
    expect(documento.annotations[0].fontSizeMm).toBeUndefined();
    expect(documento.pieces[0].parameters).toEqual(antigo.pieces[0].parameters);
    expect(validateTechnicalDocument(documento).filter((diagnostico) => diagnostico.severity === 'STRUCTURAL')).toEqual([]);
  });
  it('aceita os campos novos: texto no lugar da medida, lado travado, fonte do texto e peça em U', () => {
    const documento = technicalDocumentSchema.parse({ ...antigo, pieces: [{ ...antigo.pieces[0], dimensionLabels: { 'p1-v1': 'medir no local' }, lockedEdges: ['p1-v0'] }], annotations: [{ ...antigo.annotations[0], fontSizeMm: 120 }] });
    expect(documento.pieces[0]).toMatchObject({ dimensionLabels: { 'p1-v1': 'medir no local' }, lockedEdges: ['p1-v0'] });
    expect(documento.annotations[0].fontSizeMm).toBe(120);
    const u = makePiece('u', 'U');
    expect(technicalDocumentSchema.parse({ ...antigo, pieces: [u] }).pieces[0].parameters?.shape).toBe('U');
  });
});
