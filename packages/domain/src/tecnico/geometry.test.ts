import { describe, expect, it } from 'vitest';
import { emptyTechnicalDocument, technicalDocumentSchema, type Feature, type TechnicalDocument } from './schema.js';
import { validateTechnicalDocument, makePiece, contourArea, parametricContour, contornoDosParametros, problemaParametros } from './geometry.js';

function rectangleDocument(): TechnicalDocument {
  const document = emptyTechnicalDocument();
  const piece = makePiece('p1', 'RECTANGLE', 0);
  document.pieces.push({ ...piece, contour: [{ id: 'a', x: 0, y: 0, bulge: 0 }, { id: 'b', x: 2000, y: 0, bulge: 0 }, { id: 'c', x: 2000, y: 600, bulge: 0 }, { id: 'd', x: 0, y: 600, bulge: 0 }], geometryMode: 'FREE', parameters: undefined, x: 0, y: 0 });
  return document;
}

function cutout(overrides: Partial<Feature> = {}): Feature {
  return { id: 'r1', type: 'CUTOUT', pieceId: 'p1', name: 'Recorte', x: 1000, y: 300, rotationDeg: 0, widthMm: 500, lengthMm: 300, diameterMm: 35, depthMm: 180, heightMm: 100, thicknessMm: 20, radiusMm: 0, shape: 'RECTANGLE', installation: 'UNDERMOUNT', startMm: 0, extentMm: 600, offsetMm: 0, profile: 'SIMPLE', layerId: 'features', wallMm: 20, bottomMm: 20, slopePercent: 0, drainX: 0, drainY: 0, drainDiameterMm: 40, ...overrides };
}

describe('validação do documento técnico', () => {
  it('aceita uma bancada e um recorte dentro de seus limites', () => {
    const document = rectangleDocument();
    document.features.push(cutout());
    document.manufacturing = { minimumClearanceMm: 10, toleranceMm: 1, notes: '' };
    expect(validateTechnicalDocument(document)).toEqual([]);
  });

  it('aponta recorte que ultrapassa a peça', () => {
    const document = rectangleDocument();
    document.features.push(cutout({ id: 'r1', x: 1850 }));
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'FEATURE_OUTSIDE_PIECE', severity: 'TECHNICAL' }));
  });

  it('rejeita preços no contrato técnico', () => {
    const document = { ...rectangleDocument(), total: 2500 };
    expect(() => technicalDocumentSchema.parse(document)).toThrow();
  });

  it('rejeita contorno com aresta de comprimento zero', () => {
    const document = rectangleDocument();
    document.pieces[0].contour = [{ id: 'a', x: 0, y: 0, bulge: 0 }, { id: 'a2', x: 0, y: 0, bulge: 0 }, { id: 'b', x: 2000, y: 0, bulge: 0 }, { id: 'c', x: 2000, y: 600, bulge: 0 }];
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'ZERO_EDGE' }));
  });

  it('aponta recortes sobrepostos na mesma peça', () => {
    const document = rectangleDocument();
    document.features.push(cutout({ id: 'r1', x: 1000, y: 300 }), cutout({ id: 'r2', x: 1050, y: 300 }));
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'CUTOUT_OVERLAP' }));
  });

  it('calcula um contorno com arco (bulge) com área maior que o polígono reto equivalente', () => {
    const straight = contourArea([{ id: 'a', x: 0, y: 0, bulge: 0 }, { id: 'b', x: 100, y: 0, bulge: 0 }, { id: 'c', x: 100, y: 100, bulge: 0 }, { id: 'd', x: 0, y: 100, bulge: 0 }]);
    const bulged = contourArea([{ id: 'a', x: 0, y: 0, bulge: 0.5 }, { id: 'b', x: 100, y: 0, bulge: 0 }, { id: 'c', x: 100, y: 100, bulge: 0 }, { id: 'd', x: 0, y: 100, bulge: 0 }]);
    expect(bulged).toBeGreaterThan(straight);
  });

  it('exige folga e tolerância de fabricação antes da liberação, como aviso', () => {
    const document = rectangleDocument();
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'MANUFACTURING_UNSET', severity: 'WARNING' }));
  });

  it('aponta parâmetros incompatíveis de cuba esculpida', () => {
    const document = rectangleDocument();
    document.features.push(cutout({ id: 'r1', type: 'SCULPTED_SINK', widthMm: 400, lengthMm: 300, wallMm: 250 }));
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'SCULPTED_PARAMETERS' }));
  });

  it('detecta relações de encaixe em ciclo', () => {
    const document = rectangleDocument();
    const second = makePiece('p2', 'RECTANGLE', 1);
    document.pieces.push(second);
    document.constraints = [{ id: 'c1', pieceId: 'p1', targetPieceId: 'p2', dx: 0, dy: 0, rotationOffset: 0 }, { id: 'c2', pieceId: 'p2', targetPieceId: 'p1', dx: 0, dy: 0, rotationOffset: 0 }];
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'CONSTRAINT_CYCLE' }));
  });
});

describe('peça em U', () => {
  it('gera o contorno com fundo, dois braços e larguras próprias', () => {
    const contorno = parametricContour('u', 'U', 3000, 600, 0, 600, { leftArm: 1800, rightArm: 1200, leftArmWidth: 650, rightArmWidth: 550 });
    expect(contorno.map((vertice) => [vertice.x, vertice.y])).toEqual([[0, 0], [650, 0], [650, 1200], [2450, 1200], [2450, 600], [3000, 600], [3000, 1800], [0, 1800]]);
    // Área = fundo 3,0 × 0,6 + braço esquerdo 0,65 × 1,2 + braço direito 0,55 × 0,6.
    expect(contourArea(contorno)).toBeCloseTo(3000 * 600 + 650 * 1200 + 550 * 600);
  });
  it('é aceito pela validação e aponta braços incompatíveis', () => {
    const document = emptyTechnicalDocument();
    const u = makePiece('u', 'U');
    document.pieces.push(u);
    expect(validateTechnicalDocument(document).filter((diagnostico) => diagnostico.severity !== 'WARNING')).toEqual([]);
    const parametros = { ...u.parameters!, leftArmWidth: 1500, rightArmWidth: 1500 };
    document.pieces[0] = { ...u, parameters: parametros, contour: contornoDosParametros('u', parametros) };
    expect(problemaParametros(parametros)).toMatch(/larguras dos braços/);
    expect(validateTechnicalDocument(document)).toContainEqual(expect.objectContaining({ code: 'PARAMETERS' }));
  });
});
