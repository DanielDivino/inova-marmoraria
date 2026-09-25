'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, buscarArquivoApi } from '../../utilitarios/api';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import { criarId } from '../../utilitarios/id';
import {
  makePiece, parametricContour, rotate, edgeLength, edgePoint, sampleContour, bounds as pieceBounds, formatMeasure, parseFriendlyMeasure,
  updatePiece as updatePieceCommand, deletePiece as deletePieceCommand, duplicatePiece as duplicatePieceCommand, snapPoint,
  type TechnicalDocument, type Piece, type Feature, type Diagnostic, type Vertex,
} from '@inova/domain/technical';
import '../../app/technical-editor.css';

type MaterialVisual = { id: string; name: string; category: string; imageUrl: string | null };
type Revision = { id: string; number: number; status: 'IN_REVIEW' | 'APPROVED' | 'RETURNED' | 'RELEASED' | 'SUPERSEDED'; contentHash: string; createdAt: string; createdBy: { name: string }; decisions: { decision: string; note?: string | null; decidedBy: { name: string }; decidedAt: string }[]; releases: { id: string; releasedAt: string }[] };
type DraftResponse = { design: { id: string; name: string; project: { id: string; name: string; job: { customer: { name: string; phone: string } } } }; draft: { id: string; version: number; document: TechnicalDocument; updatedAt: string }; diagnostics: Diagnostic[] };
type DesignResponse = { revisions: Revision[] };
type Selection = { type: 'piece'; id: string } | { type: 'feature'; id: string } | { type: 'vertex'; pieceId: string; vertexId: string } | { type: 'annotation'; id: string } | null;
type EdgeFeatureType = 'SKIRT' | 'BACKSPLASH' | 'EDGE_FINISH';
type Point = { x: number; y: number };

const CLOSE_TOLERANCE_MM = 80;
const MIN_BOX_SIDE_MM = 50;
/** Posição local (relativa à peça) de cada canto da caixa delimitadora, dadas a largura e o comprimento. */
const BOX_CORNER_LOCAL = [
  (_width: number, _length: number) => ({ x: 0, y: 0 }),
  (width: number, _length: number) => ({ x: width, y: 0 }),
  (width: number, length: number) => ({ x: width, y: length }),
  (_width: number, length: number) => ({ x: 0, y: length }),
];
/** Sinal de (largura, comprimento) na diferença canto-oposto→canto-arrastado de cada canto da caixa. */
const BOX_CORNER_SIGN: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

function computeDrawPreview(points: Point[], cursor: Point | null, typed: string): Point | null {
  if (!points.length) return cursor ? { x: Math.round(cursor.x / 5) * 5, y: Math.round(cursor.y / 5) * 5 } : null;
  if (!cursor && !typed) return null;
  const last = points[points.length - 1];
  if (!typed && cursor && points.length >= 3 && Math.hypot(cursor.x - points[0].x, cursor.y - points[0].y) < CLOSE_TOLERANCE_MM) return points[0];
  const dx = (cursor?.x ?? last.x) - last.x, dy = (cursor?.y ?? last.y) - last.y;
  if (!typed && Math.hypot(dx, dy) < 1) return null;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = typed ? Number(typed.replace(',', '.')) : Math.round(Math.hypot(dx, dy) / 5) * 5;
  if (!Number.isFinite(length) || length <= 0) return null;
  return { x: last.x + Math.cos(angle) * length, y: last.y + Math.sin(angle) * length };
}

const uid = criarId;
const revisionLabel: Record<Revision['status'], string> = { IN_REVIEW: 'Em conferência', APPROVED: 'Aprovada', RETURNED: 'Devolvida', RELEASED: 'Liberada', SUPERSEDED: 'Substituída' };
const featureLabel: Record<Feature['type'], string> = { SINK: 'Cuba', SCULPTED_SINK: 'Cuba esculpida', CUTOUT: 'Recorte', HOLE: 'Furo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', EDGE_FINISH: 'Acabamento de borda' };
const profileLabel: Record<Feature['profile'], string> = { SIMPLE: 'Simples', MITER45: 'Meia-esquadria 45°', BEVEL: 'Chanfro', ROUND: 'Arredondado' };
const worldPoint = (point: { x: number; y: number }, piece: Piece) => { const v = rotate(point, piece.rotationDeg); return { x: v.x + piece.x, y: v.y + piece.y }; };

/** Campo de medida no formato "1m15" (metros e centímetros), como usado pelos marceneiros e marmoristas. */
function MeasureField({ label, valueMm, min = 1, onChange }: { label: string; valueMm: number; min?: number; onChange: (mm: number) => void }) {
  const [text, setText] = useState(() => formatMeasure(valueMm));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(formatMeasure(valueMm)); }, [valueMm]);
  const commit = () => {
    const parsed = parseFriendlyMeasure(text);
    if (parsed !== null && parsed >= min) onChange(Math.round(parsed * 10) / 10);
    else setText(formatMeasure(valueMm));
  };
  return <label>{label}<input type="text" inputMode="decimal" placeholder="ex.: 1m15" value={text} onFocus={() => { focused.current = true; }} onChange={event => setText(event.target.value)} onBlur={() => { focused.current = false; commit(); }} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} /></label>;
}

export default function EditorTecnico({ designId }: { designId: string }) {
  const [data, setData] = useState<DraftResponse | null>(null);
  const [document, setDocument] = useState<TechnicalDocument | null>(null);
  const [version, setVersion] = useState(1);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [materials, setMaterials] = useState<MaterialVisual[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [past, setPast] = useState<TechnicalDocument[]>([]);
  const [future, setFuture] = useState<TechnicalDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<'select' | 'dimension' | 'draw' | 'text'>('select');
  const [pendingEdgeFeature, setPendingEdgeFeature] = useState<EdgeFeatureType | null>(null);
  const [dimensionStart, setDimensionStart] = useState<{ pieceId: string; vertexId: string } | null>(null);
  const [drawPoints, setDrawPoints] = useState<Point[] | null>(null);
  const [drawCursor, setDrawCursor] = useState<Point | null>(null);
  const [drawTyped, setDrawTyped] = useState('');
  const [resizePreview, setResizePreview] = useState<{ pieceId: string; width: number; length: number } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const worldGroupRef = useRef<SVGGElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; before: TechnicalDocument; moved: boolean } | null>(null);
  const resizeDragRef = useRef<{ pieceId: string; cornerIndex: number; anchorWorld: Point; grabOffset: Point; before: TechnicalDocument; moved: boolean } | null>(null);
  const annotationDragRef = useRef<{ id: string; offsetX: number; offsetY: number; before: TechnicalDocument; moved: boolean } | null>(null);
  const suppressBackgroundClick = useRef(false);

  const load = useCallback(async () => {
    setMessage('');
    try {
      const [draft, design, visualMaterials] = await Promise.all([api<DraftResponse>(`/designs/${designId}/draft`), api<DesignResponse>(`/designs/${designId}`), api<MaterialVisual[]>('/catalog/materials/visual')]);
      setData(draft); setDocument(draft.draft.document); setVersion(draft.draft.version); setDiagnostics(draft.diagnostics); setRevisions(design.revisions); setMaterials(visualMaterials); setPast([]); setFuture([]); setDirty(false); setSelection(null);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir o desenho técnico.'); }
  }, [designId]);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (next = document) => {
    if (!next || saving === 'saving') return false;
    setSaving('saving'); setMessage('');
    try {
      const result = await api<{ version: number; diagnostics: Diagnostic[] }>(`/designs/${designId}/draft`, { method: 'PUT', body: JSON.stringify({ baseVersion: version, document: next }) });
      setVersion(result.version); setDiagnostics(result.diagnostics); setDirty(false); setSaving('saved'); window.setTimeout(() => setSaving(current => current === 'saved' ? 'idle' : current), 1800); return true;
    } catch (cause) { setSaving('error'); setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar o desenho.'); return false; }
  }, [designId, document, saving, version]);
  useEffect(() => { if (!document || !dirty) return; const timer = window.setTimeout(() => { void save(); }, 2000); return () => window.clearTimeout(timer); }, [document, dirty, save]);

  const change = useCallback((next: TechnicalDocument, before = document) => {
    if (!before) return;
    setPast(history => [...history.slice(-99), before]); setFuture([]); setDocument(next); setDirty(true); setSaving('idle');
  }, [document]);
  const undo = () => { const previous = past.at(-1); if (!previous || !document) return; setPast(history => history.slice(0, -1)); setFuture(history => [document, ...history].slice(0, 100)); setDocument(previous); setDirty(true); };
  const redo = () => { const next = future[0]; if (!next || !document) return; setFuture(history => history.slice(1)); setPast(history => [...history, document].slice(-100)); setDocument(next); setDirty(true); };

  const selectedPiece = useMemo(() => document && selection?.type === 'piece' ? document.pieces.find(piece => piece.id === selection.id) ?? null : null, [document, selection]);
  const selectedFeature = useMemo(() => document && selection?.type === 'feature' ? document.features.find(feature => feature.id === selection.id) ?? null : null, [document, selection]);
  const featureParent = useMemo(() => document && selectedFeature ? document.pieces.find(piece => piece.id === selectedFeature.pieceId) ?? null : null, [document, selectedFeature]);
  const selectedVertex = useMemo(() => {
    if (!document || selection?.type !== 'vertex') return null;
    const piece = document.pieces.find(entry => entry.id === selection.pieceId);
    const vertex = piece?.contour.find(point => point.id === selection.vertexId);
    return piece && vertex ? { piece, vertex } : null;
  }, [document, selection]);
  const activePiece = selectedPiece ?? featureParent ?? selectedVertex?.piece ?? null;
  const selectedAnnotation = useMemo(() => document && selection?.type === 'annotation' ? document.annotations.find(entry => entry.id === selection.id) ?? null : null, [document, selection]);

  const toWorld = useCallback((event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current, group = worldGroupRef.current;
    if (!svg || !group) return { x: 0, y: 0 };
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(group.getScreenCTM()?.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const addPiece = (shape: 'RECTANGLE' | 'L' | 'CIRCLE' | 'ROUNDED') => {
    if (!document) return;
    const piece = makePiece(uid(), shape, document.pieces.length);
    change({ ...document, pieces: [...document.pieces, piece], assemblies: document.assemblies.map((assembly, index) => index === 0 ? { ...assembly, pieceIds: [...assembly.pieceIds, piece.id] } : assembly) });
    setSelection({ type: 'piece', id: piece.id });
  };

  const applyPieceUpdate = (id: string, patch: Partial<Piece>) => { if (!document) return; change(updatePieceCommand(document, id, patch)); };

  const updateShape = (shape: 'RECTANGLE' | 'L' | 'CIRCLE' | 'ROUNDED') => {
    if (!selectedPiece) return;
    const parameters = { shape, width: selectedPiece.parameters?.width ?? 1800, length: selectedPiece.parameters?.length ?? 600, radius: selectedPiece.parameters?.radius ?? 100, arm: selectedPiece.parameters?.arm ?? 600 };
    applyPieceUpdate(selectedPiece.id, { geometryMode: 'PARAMETRIC', parameters, contour: parametricContour(selectedPiece.id, shape, parameters.width, parameters.length, parameters.radius, parameters.arm) });
  };
  const updateParametricSize = (patch: Partial<{ width: number; length: number; radius: number; arm: number }>) => {
    if (!selectedPiece?.parameters) return;
    const parameters = { ...selectedPiece.parameters, ...patch };
    applyPieceUpdate(selectedPiece.id, { parameters, contour: parametricContour(selectedPiece.id, parameters.shape, parameters.width, parameters.length, parameters.radius, parameters.arm) });
  };
  const updateFreeSize = (patch: { width?: number; length?: number }) => {
    if (!selectedPiece) return;
    const box = pieceBounds(selectedPiece.contour); const width = box.maxX - box.minX; const length = box.maxY - box.minY;
    const scaleX = patch.width && width ? patch.width / width : 1; const scaleY = patch.length && length ? patch.length / length : 1;
    applyPieceUpdate(selectedPiece.id, { contour: selectedPiece.contour.map(point => ({ ...point, x: box.minX + (point.x - box.minX) * scaleX, y: box.minY + (point.y - box.minY) * scaleY })) });
  };

  const removePiece = (piece: Piece) => { if (!document || !window.confirm(`Excluir ${piece.name}? Os componentes vinculados também serão removidos.`)) return; change(deletePieceCommand(document, piece.id)); setSelection(null); };
  const duplicateSelected = () => { if (!document || !selectedPiece) return; const newId = uid(); change(duplicatePieceCommand(document, selectedPiece.id, newId)); setSelection({ type: 'piece', id: newId }); };

  const addBodyFeature = (type: 'SINK' | 'CUTOUT' | 'HOLE' | 'SCULPTED_SINK') => {
    if (!document || !activePiece) return;
    const box = pieceBounds(activePiece.contour); const id = uid(); const x = (box.minX + box.maxX) / 2; const y = (box.minY + box.maxY) / 2;
    const feature: Feature = { id, type, pieceId: activePiece.id, name: featureLabel[type], x, y, rotationDeg: 0, widthMm: 500, lengthMm: 300, diameterMm: 35, depthMm: type === 'SINK' || type === 'SCULPTED_SINK' ? 180 : 20, heightMm: 100, thicknessMm: 20, radiusMm: 0, shape: 'RECTANGLE', installation: 'UNDERMOUNT', startMm: 0, extentMm: 600, offsetMm: 0, profile: 'SIMPLE', layerId: 'features', wallMm: 20, bottomMm: 20, slopePercent: 2, drainX: 0, drainY: 0, drainDiameterMm: 40 };
    change({ ...document, features: [...document.features, feature] }); setSelection({ type: 'feature', id });
  };
  const beginEdgeFeature = (type: EdgeFeatureType) => { if (!activePiece) return; setPendingEdgeFeature(type); setMessage(`Clique em uma borda de ${activePiece.name} para posicionar ${featureLabel[type].toLowerCase()}.`); };
  const placeEdgeFeature = (piece: Piece, edgeId: string) => {
    if (!document || !pendingEdgeFeature) return;
    const type = pendingEdgeFeature; const id = uid(); const extent = edgeLength(piece, edgeId);
    const feature: Feature = { id, type, pieceId: piece.id, name: featureLabel[type], x: 0, y: 0, rotationDeg: 0, widthMm: 500, lengthMm: 300, diameterMm: 35, depthMm: 20, heightMm: type === 'BACKSPLASH' ? 100 : 40, thicknessMm: 20, radiusMm: 0, shape: 'RECTANGLE', installation: 'UNDERMOUNT', edgeId, startMm: 0, extentMm: extent, offsetMm: 0, profile: 'SIMPLE', layerId: 'features', wallMm: 20, bottomMm: 20, slopePercent: 0, drainX: 0, drainY: 0, drainDiameterMm: 40 };
    change({ ...document, features: [...document.features, feature] }); setSelection({ type: 'feature', id }); setPendingEdgeFeature(null); setMessage('');
  };
  const updateFeature = (patch: Partial<Feature>) => { if (!document || !selectedFeature) return; change({ ...document, features: document.features.map(feature => feature.id === selectedFeature.id ? { ...feature, ...patch } : feature) }); };
  const removeFeature = (feature: Feature) => { if (!document) return; change({ ...document, features: document.features.filter(entry => entry.id !== feature.id) }); setSelection(null); };

  const addAnnotation = (point: Point) => {
    if (!document) return;
    const id = uid();
    change({ ...document, annotations: [...document.annotations, { id, text: 'Anotação', x: point.x, y: point.y, layerId: 'annotations' }] });
    setSelection({ type: 'annotation', id }); setTool('select');
  };
  const updateAnnotation = (patch: Partial<{ text: string; x: number; y: number }>) => { if (!document || !selectedAnnotation) return; change({ ...document, annotations: document.annotations.map(entry => entry.id === selectedAnnotation.id ? { ...entry, ...patch } : entry) }); };
  const removeAnnotation = (id: string) => { if (!document) return; change({ ...document, annotations: document.annotations.filter(entry => entry.id !== id) }); setSelection(null); };

  const updateVertexBulge = (bulge: number) => {
    if (!document || !selectedVertex) return;
    const { piece, vertex } = selectedVertex;
    const contour = piece.contour.map(point => point.id === vertex.id ? { ...point, bulge } : point);
    applyPieceUpdate(piece.id, { contour, geometryMode: 'FREE', parameters: undefined });
  };

  const drawPreview = useMemo(() => computeDrawPreview(drawPoints ?? [], drawCursor, drawTyped), [drawPoints, drawCursor, drawTyped]);
  const drawCanClose = Boolean(drawPoints && drawPoints.length >= 3 && drawPreview && Math.hypot(drawPreview.x - drawPoints[0].x, drawPreview.y - drawPoints[0].y) < CLOSE_TOLERANCE_MM);

  const beginDraw = () => { setTool('draw'); setDrawPoints([]); setDrawTyped(''); setPendingEdgeFeature(null); setDimensionStart(null); setMessage('Clique para o primeiro ponto. Aponte a direção e digite o comprimento em mm, depois Enter — ou clique para usar o valor mostrado. Clique perto do início para fechar. Esc cancela.'); };
  const cancelDraw = () => { setDrawPoints(null); setDrawCursor(null); setDrawTyped(''); setTool('select'); setMessage(''); };
  const finishDraw = (points: Point[]) => {
    if (!document || points.length < 3) return;
    const id = uid(); const origin = points[0];
    const piece: Piece = { id, name: `Peça ${document.pieces.length + 1}`, contour: points.map((point, index) => ({ id: `${id}-v${index}`, x: point.x - origin.x, y: point.y - origin.y, bulge: 0 })), thicknessMm: 20, x: origin.x, y: origin.y, z: 0, rotationDeg: 0, tiltDeg: 0, locked: false, layerId: 'pieces', geometryMode: 'FREE' };
    change({ ...document, pieces: [...document.pieces, piece], assemblies: document.assemblies.map((assembly, index) => index === 0 ? { ...assembly, pieceIds: [...assembly.pieceIds, id] } : assembly) });
    setSelection({ type: 'piece', id }); setDrawPoints(null); setDrawCursor(null); setDrawTyped(''); setTool('select'); setMessage('');
  };
  const confirmDrawPoint = () => {
    if (!drawPreview) return;
    if (drawCanClose) { finishDraw(drawPoints!); return; }
    setDrawPoints(points => [...(points ?? []), drawPreview]); setDrawTyped('');
  };
  useEffect(() => {
    if (tool !== 'draw') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { cancelDraw(); return; }
      if (event.key === 'Enter') { confirmDrawPoint(); return; }
      if (event.key === 'Backspace') { setDrawTyped(value => value.slice(0, -1)); return; }
      if (/^[0-9.,]$/.test(event.key)) setDrawTyped(value => (value + event.key).slice(0, 8));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, drawPreview, drawCanClose, drawPoints, document]);

  const onClickVertex = (event: React.MouseEvent, piece: Piece, vertex: Vertex) => {
    event.stopPropagation();
    if (suppressBackgroundClick.current) { suppressBackgroundClick.current = false; return; }
    if (tool === 'dimension') {
      if (!dimensionStart) { setDimensionStart({ pieceId: piece.id, vertexId: vertex.id }); setMessage('Clique em um segundo vértice para concluir a cota.'); return; }
      if (dimensionStart.pieceId === piece.id && dimensionStart.vertexId === vertex.id) return;
      if (!document) return;
      const dimension = { id: uid(), from: dimensionStart, to: { pieceId: piece.id, vertexId: vertex.id }, offsetMm: 150, layerId: 'dimensions' };
      change({ ...document, dimensions: [...document.dimensions, dimension] }); setDimensionStart(null); setMessage('');
      return;
    }
    setSelection({ type: 'vertex', pieceId: piece.id, vertexId: vertex.id });
  };
  const onClickEdge = (event: React.MouseEvent, piece: Piece, edgeId: string) => {
    event.stopPropagation();
    if (suppressBackgroundClick.current) { suppressBackgroundClick.current = false; return; }
    if (pendingEdgeFeature) { placeEdgeFeature(piece, edgeId); return; }
    setSelection({ type: 'piece', id: piece.id });
  };

  const onPointerDownPiece = (event: React.PointerEvent, piece: Piece) => {
    if (tool === 'draw') return;
    if (piece.locked || tool !== 'select' || pendingEdgeFeature) { setSelection({ type: 'piece', id: piece.id }); return; }
    if (!document) return;
    const world = toWorld(event);
    dragRef.current = { id: piece.id, offsetX: world.x - piece.x, offsetY: world.y - piece.y, before: document, moved: false };
    setSelection({ type: 'piece', id: piece.id });
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onResizeHandlePointerDown = (event: React.PointerEvent, piece: Piece, cornerIndex: number) => {
    if (tool !== 'select' || piece.locked || pendingEdgeFeature || !document) return;
    event.stopPropagation();
    const box = pieceBounds(piece.contour);
    const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }];
    const draggedWorld = worldPoint(corners[cornerIndex], piece);
    const grab = toWorld(event);
    resizeDragRef.current = { pieceId: piece.id, cornerIndex, anchorWorld: worldPoint(corners[(cornerIndex + 2) % 4], piece), grabOffset: { x: grab.x - draggedWorld.x, y: grab.y - draggedWorld.y }, before: document, moved: false };
    setResizePreview({ pieceId: piece.id, width: box.maxX - box.minX, length: box.maxY - box.minY });
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onAnnotationPointerDown = (event: React.PointerEvent, annotation: { id: string; x: number; y: number }) => {
    if (tool !== 'select' || !document) return;
    event.stopPropagation();
    const world = toWorld(event);
    annotationDragRef.current = { id: annotation.id, offsetX: world.x - annotation.x, offsetY: world.y - annotation.y, before: document, moved: false };
    setSelection({ type: 'annotation', id: annotation.id });
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onPointerMoveCanvas = (event: React.PointerEvent) => {
    if (tool === 'draw') { setDrawCursor(toWorld(event)); return; }
    const annotationDrag = annotationDragRef.current;
    if (annotationDrag && document) {
      annotationDrag.moved = true;
      const world = toWorld(event);
      const snapped = { x: Math.round((world.x - annotationDrag.offsetX) / 5) * 5, y: Math.round((world.y - annotationDrag.offsetY) / 5) * 5 };
      setDocument({ ...document, annotations: document.annotations.map(entry => entry.id === annotationDrag.id ? { ...entry, x: snapped.x, y: snapped.y } : entry) }); setDirty(true); setSaving('idle');
      return;
    }
    const resizeDrag = resizeDragRef.current;
    if (resizeDrag && document) {
      resizeDrag.moved = true;
      const piece = document.pieces.find(entry => entry.id === resizeDrag.pieceId);
      if (piece) {
        const world = toWorld(event);
        const draggedWorld = { x: world.x - resizeDrag.grabOffset.x, y: world.y - resizeDrag.grabOffset.y };
        const snappedDrag = { x: Math.round(draggedWorld.x / 5) * 5, y: Math.round(draggedWorld.y / 5) * 5 };
        const diff = rotate({ x: resizeDrag.anchorWorld.x - snappedDrag.x, y: resizeDrag.anchorWorld.y - snappedDrag.y }, -piece.rotationDeg);
        const [signWidth, signLength] = BOX_CORNER_SIGN[resizeDrag.cornerIndex];
        let width = Math.max(MIN_BOX_SIDE_MM, signWidth * diff.x);
        let length = Math.max(MIN_BOX_SIDE_MM, signLength * diff.y);
        const anchorIndex = (resizeDrag.cornerIndex + 2) % 4;
        if (piece.parameters) {
          const shape = piece.parameters.shape;
          if (shape === 'CIRCLE') { const diameter = Math.max(width, length); width = diameter; length = diameter; }
          const contour = parametricContour(piece.id, shape, width, length, piece.parameters.radius, piece.parameters.arm);
          const anchorLocalNew = BOX_CORNER_LOCAL[anchorIndex](width, length);
          const anchorRotated = rotate(anchorLocalNew, piece.rotationDeg);
          const origin = { x: resizeDrag.anchorWorld.x - anchorRotated.x, y: resizeDrag.anchorWorld.y - anchorRotated.y };
          setDocument(updatePieceCommand(document, piece.id, { contour, parameters: { ...piece.parameters, width, length }, x: origin.x, y: origin.y }));
        } else {
          const box = pieceBounds(piece.contour);
          const anchorLocalOld = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }][anchorIndex];
          const scaleX = box.maxX - box.minX > 0 ? width / (box.maxX - box.minX) : 1;
          const scaleY = box.maxY - box.minY > 0 ? length / (box.maxY - box.minY) : 1;
          const contour = piece.contour.map(point => ({ ...point, x: anchorLocalOld.x + (point.x - anchorLocalOld.x) * scaleX, y: anchorLocalOld.y + (point.y - anchorLocalOld.y) * scaleY }));
          setDocument(updatePieceCommand(document, piece.id, { contour }));
        }
        setResizePreview({ pieceId: piece.id, width, length }); setDirty(true); setSaving('idle');
      }
      return;
    }
    const drag = dragRef.current; if (!drag || !document) return;
    drag.moved = true;
    const world = toWorld(event);
    const snapped = snapPoint(document, { x: world.x - drag.offsetX, y: world.y - drag.offsetY }, drag.id, 50, 20);
    setDocument(updatePieceCommand(document, drag.id, { x: snapped.x, y: snapped.y })); setDirty(true); setSaving('idle');
  };
  const onPointerUpCanvas = () => {
    const annotationDrag = annotationDragRef.current; annotationDragRef.current = null;
    if (annotationDrag) {
      if (annotationDrag.moved) { suppressBackgroundClick.current = true; if (document && document !== annotationDrag.before) { setPast(history => [...history.slice(-99), annotationDrag.before]); setFuture([]); } }
      return;
    }
    const resizeDrag = resizeDragRef.current; resizeDragRef.current = null;
    if (resizeDrag) {
      setResizePreview(null);
      if (resizeDrag.moved) { suppressBackgroundClick.current = true; if (document && document !== resizeDrag.before) { setPast(history => [...history.slice(-99), resizeDrag.before]); setFuture([]); } }
      return;
    }
    const drag = dragRef.current; dragRef.current = null;
    if (drag?.moved) suppressBackgroundClick.current = true;
    if (drag && document && document !== drag.before) { setPast(history => [...history.slice(-99), drag.before]); setFuture([]); }
  };

  const createRevision = async () => { if (!document || !(await save(document))) return; try { await api(`/designs/${designId}/revisions`, { method: 'POST' }); await load(); setMessage('Revisão enviada para conferência.'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível enviar a revisão.'); } };
  const decide = async (revision: Revision, decision: 'APPROVE' | 'RETURN') => { try { await api(`/revisions/${revision.id}/decisions`, { method: 'POST', body: JSON.stringify({ decision }) }); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível registrar a decisão.'); } };
  const release = async (revision: Revision) => { try { await api(`/revisions/${revision.id}/release`, { method: 'POST' }); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível liberar a revisão.'); } };
  const openPdf = async (revision: Revision) => { try { abrirPdf(await buscarArquivoApi(`/revisions/${revision.id}/pdf`), `desenho-tecnico-r${revision.number}.pdf`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir o PDF técnico.'); } };

  if (!data || !document) return <main className="technical-editor-loading">{message || 'Abrindo editor técnico…'}</main>;
  const canvasWidth = 1400 / zoom; const canvasHeight = 900 / zoom;

  return <main className="technical-editor">
    <header className="technical-editor-header"><div><Link href="/orcamentos">← Orçamentos</Link><p>ATENDIMENTO · {data.design.project.job.customer.name}</p><h1>{data.design.project.name}</h1><small>{data.design.name} · unidade real em milímetros</small></div><div className="technical-save-state"><span className={`save-state ${saving}`}>{saving === 'saving' ? 'Salvando…' : saving === 'saved' ? 'Salvo' : saving === 'error' ? 'Falha ao salvar' : 'Rascunho'}</span><button className="secondary-button" onClick={() => void save()}>Salvar agora</button><button className="save-quote-button" onClick={() => void createRevision()}>Enviar revisão</button></div></header>
    {message && <p className="technical-message" role="alert">{message}</p>}
    <section className="technical-workspace">
      <aside className="technical-tools">
        <h2>Ferramentas</h2>
        <button aria-pressed={tool === 'draw'} onClick={() => tool === 'draw' ? cancelDraw() : beginDraw()}>✎ Desenhar peça</button>
        {tool === 'draw' && <div className="technical-draw-controls">
          <button type="button" disabled={!drawCanClose} onClick={() => finishDraw(drawPoints!)}>✓ Concluir forma</button>
          <button type="button" onClick={cancelDraw}>Cancelar</button>
        </div>}
        <button onClick={() => addPiece('RECTANGLE')}>＋ Bancada</button>
        <button onClick={() => addPiece('L')}>⌞ Peça em L</button>
        <button onClick={() => addPiece('CIRCLE')}>◯ Peça circular</button>
        <button onClick={() => addPiece('ROUNDED')}>▢ Peça com cantos</button>
        <hr />
        <button disabled={!activePiece} onClick={() => addBodyFeature('SINK')}>◯ Adicionar cuba</button>
        <button disabled={!activePiece} onClick={() => addBodyFeature('SCULPTED_SINK')}>◐ Cuba esculpida</button>
        <button disabled={!activePiece} onClick={() => addBodyFeature('CUTOUT')}>□ Adicionar recorte</button>
        <button disabled={!activePiece} onClick={() => addBodyFeature('HOLE')}>• Adicionar furo</button>
        <button disabled={!activePiece} aria-pressed={pendingEdgeFeature === 'SKIRT'} onClick={() => beginEdgeFeature('SKIRT')}>▭ Adicionar saia</button>
        <button disabled={!activePiece} aria-pressed={pendingEdgeFeature === 'BACKSPLASH'} onClick={() => beginEdgeFeature('BACKSPLASH')}>▬ Adicionar rodabanca</button>
        <button disabled={!activePiece} aria-pressed={pendingEdgeFeature === 'EDGE_FINISH'} onClick={() => beginEdgeFeature('EDGE_FINISH')}>／ Acabamento de borda</button>
        <hr />
        <button aria-pressed={tool === 'dimension'} onClick={() => { setTool(current => current === 'dimension' ? 'select' : 'dimension'); setDimensionStart(null); setMessage(tool === 'dimension' ? '' : 'Clique em dois vértices da mesma peça para criar uma cota.'); }}>📏 Cota (clique 2 vértices)</button>
        <button aria-pressed={tool === 'text'} onClick={() => { setTool(current => current === 'text' ? 'select' : 'text'); setMessage(tool === 'text' ? '' : 'Clique em qualquer lugar do desenho para escrever um texto livre.'); }}>🖊 Escrever no desenho</button>
        <hr />
        <button disabled={!past.length} onClick={undo}>↶ Desfazer</button>
        <button disabled={!future.length} onClick={redo}>↷ Refazer</button>
        <div className="technical-layers"><h3>Peças</h3>{document.pieces.length ? document.pieces.map(piece => <button key={piece.id} aria-pressed={piece.id === activePiece?.id} onClick={() => setSelection({ type: 'piece', id: piece.id })}><i style={{ backgroundImage: piece.material?.imageUrl ? `url(${piece.material.imageUrl})` : undefined }} />{piece.locked ? '🔒 ' : ''}{piece.name}</button>) : <small>Adicione uma bancada para começar.</small>}</div>
      </aside>
      <section className="technical-canvas-wrap">
        <div className="technical-canvas-bar"><span>Vista superior · escala visual · arraste peças para mover com encaixe automático</span><div><button onClick={() => setZoom(value => Math.max(.55, value - .15))}>−</button><strong>{Math.round(zoom * 100)}%</strong><button onClick={() => setZoom(value => Math.min(1.8, value + .15))}>＋</button></div></div>
        <div className="technical-canvas-scroll">
          <svg ref={svgRef} className="technical-canvas" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} aria-label="Área do desenho técnico" role="img" onPointerMove={onPointerMoveCanvas} onPointerUp={onPointerUpCanvas} onClick={event => { if (tool === 'draw') { confirmDrawPoint(); return; } if (tool === 'text') { addAnnotation(toWorld(event)); return; } if (suppressBackgroundClick.current) { suppressBackgroundClick.current = false; return; } setSelection(null); }}>
            <defs><pattern id="technical-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dfe4dc" strokeWidth="1" /></pattern></defs>
            <rect width="1400" height="900" fill="url(#technical-grid)" />
            <g ref={worldGroupRef} transform="translate(70 760) scale(.1 -.1)">
              {document.pieces.map(piece => {
                const points = sampleContour(piece.contour, 5).map(point => `${point.x},${point.y}`).join(' ');
                const isSelected = piece.id === activePiece?.id;
                return <g key={piece.id} transform={`translate(${piece.x} ${piece.y}) rotate(${-piece.rotationDeg})`} onPointerDown={event => onPointerDownPiece(event, piece)} onClick={event => { if (tool !== 'draw') event.stopPropagation(); suppressBackgroundClick.current = false; }} className={isSelected ? 'technical-piece selected' : 'technical-piece'}>
                  <polygon points={points} fill={piece.material?.imageUrl ? `url(#material-${piece.id})` : '#d9e1d3'} />
                  {piece.material?.imageUrl && <defs><pattern id={`material-${piece.id}`} width="600" height="600" patternUnits="userSpaceOnUse"><image href={piece.material.imageUrl} width="600" height="600" preserveAspectRatio="xMidYMid slice" /></pattern></defs>}
                  <polygon points={points} fill="none" strokeWidth="18" />
                  {isSelected && piece.contour.map((vertex, index) => { const next = piece.contour[(index + 1) % piece.contour.length]; return <line key={`edge-${vertex.id}`} x1={vertex.x} y1={vertex.y} x2={next.x} y2={next.y} className="technical-edge-hit" onClick={event => onClickEdge(event, piece, vertex.id)} />; })}
                  {document.features.filter(feature => feature.pieceId === piece.id).map(feature => {
                    const selectedFeatureNow = selection?.type === 'feature' && selection.id === feature.id;
                    const className = `technical-feature ${feature.type.toLowerCase()}${selectedFeatureNow ? ' selected' : ''}`;
                    const onSelect = (event: React.MouseEvent) => { event.stopPropagation(); if (suppressBackgroundClick.current) { suppressBackgroundClick.current = false; return; } setSelection({ type: 'feature', id: feature.id }); };
                    if (feature.type === 'HOLE') return <circle key={feature.id} cx={feature.x} cy={feature.y} r={feature.diameterMm / 2} className={className} onClick={onSelect} />;
                    if (['SKIRT', 'BACKSPLASH', 'EDGE_FINISH'].includes(feature.type) && feature.edgeId) {
                      const a = edgePoint(piece, feature.edgeId, feature.startMm); const b = edgePoint(piece, feature.edgeId, feature.startMm + feature.extentMm);
                      return <line key={feature.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={feature.type === 'BACKSPLASH' ? 60 : 40} className={className} onClick={onSelect} />;
                    }
                    if (feature.shape === 'OVAL') return <ellipse key={feature.id} cx={feature.x} cy={feature.y} rx={feature.widthMm / 2} ry={feature.lengthMm / 2} transform={`rotate(${-feature.rotationDeg} ${feature.x} ${feature.y})`} className={className} onClick={onSelect} />;
                    return <rect key={feature.id} x={feature.x - feature.widthMm / 2} y={feature.y - feature.lengthMm / 2} width={feature.widthMm} height={feature.lengthMm} transform={`rotate(${-feature.rotationDeg} ${feature.x} ${feature.y})`} className={className} onClick={onSelect} />;
                  })}
                  {isSelected && piece.contour.map(vertex => <circle key={vertex.id} cx={vertex.x} cy={vertex.y} r="70" className={selection?.type === 'vertex' && selection.vertexId === vertex.id ? 'technical-vertex selected' : 'technical-vertex'} onClick={event => onClickVertex(event, piece, vertex)} />)}
                  {isSelected && !piece.locked && (() => {
                    const box = pieceBounds(piece.contour); const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
                    const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }];
                    return corners.map((corner, index) => {
                      const dx = corner.x - center.x, dy = corner.y - center.y, distance = Math.hypot(dx, dy) || 1;
                      const handle = { x: corner.x + (dx / distance) * 150, y: corner.y + (dy / distance) * 150 };
                      return <g key={`resize-${index}`}><line x1={corner.x} y1={corner.y} x2={handle.x} y2={handle.y} className="technical-resize-leader" /><rect x={handle.x - 45} y={handle.y - 45} width="90" height="90" className="technical-resize-handle" onPointerDown={event => onResizeHandlePointerDown(event, piece, index)} /></g>;
                    });
                  })()}
                </g>;
              })}
              {document.dimensions.map(dimension => {
                const fromPiece = document.pieces.find(piece => piece.id === dimension.from.pieceId); const toPiece = document.pieces.find(piece => piece.id === dimension.to.pieceId);
                const fromVertex = fromPiece?.contour.find(vertex => vertex.id === dimension.from.vertexId); const toVertex = toPiece?.contour.find(vertex => vertex.id === dimension.to.vertexId);
                if (!fromPiece || !toPiece || !fromVertex || !toVertex) return null;
                const a = worldPoint(fromVertex, fromPiece); const b = worldPoint(toVertex, toPiece);
                const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
                const nx = -dy / length, ny = dx / length; const offset = dimension.offsetMm;
                const a2 = { x: a.x + nx * offset, y: a.y + ny * offset }; const b2 = { x: b.x + nx * offset, y: b.y + ny * offset };
                const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
                return <g key={dimension.id} className="technical-dimension">
                  <line x1={a.x} y1={a.y} x2={a2.x} y2={a2.y} /><line x1={b.x} y1={b.y} x2={b2.x} y2={b2.y} /><line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
                  <text x={mid.x} y={mid.y} transform={`scale(1 -1) translate(0 ${-2 * mid.y})`}>{formatMeasure(length)}</text>
                </g>;
              })}
              {document.annotations.map(annotation => <text key={annotation.id} className={selection?.type === 'annotation' && selection.id === annotation.id ? 'technical-annotation selected' : 'technical-annotation'} x={annotation.x} y={annotation.y} transform={`scale(1 -1) translate(0 ${-2 * annotation.y})`} onPointerDown={event => onAnnotationPointerDown(event, annotation)} onClick={event => { event.stopPropagation(); if (suppressBackgroundClick.current) { suppressBackgroundClick.current = false; return; } setSelection({ type: 'annotation', id: annotation.id }); }}>{annotation.text}</text>)}
              {resizePreview && (() => {
                const resizedPiece = document.pieces.find(entry => entry.id === resizePreview.pieceId); if (!resizedPiece) return null;
                const box = pieceBounds(resizedPiece.contour); const center = worldPoint({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, resizedPiece);
                return <text className="technical-resize-label" x={center.x} y={center.y} transform={`scale(1 -1) translate(0 ${-2 * center.y})`}>{formatMeasure(resizePreview.width)} × {formatMeasure(resizePreview.length)}</text>;
              })()}
              {tool === 'draw' && drawPoints && <g className="technical-draw-preview">
                {drawPoints.length > 1 && <polyline points={drawPoints.map(point => `${point.x},${point.y}`).join(' ')} />}
                {drawPreview && <line className="technical-draw-rubber" x1={(drawPoints.at(-1) ?? drawPreview).x} y1={(drawPoints.at(-1) ?? drawPreview).y} x2={drawPreview.x} y2={drawPreview.y} />}
                {drawPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="26" />)}
                {drawPreview && <circle className={drawCanClose ? 'technical-draw-close' : 'technical-draw-cursor'} cx={drawPreview.x} cy={drawPreview.y} r={drawCanClose ? 60 : 26} />}
                {drawPreview && drawPoints.length > 0 && <text className="technical-draw-length" transform={`scale(1 -1) translate(0 ${(((drawPoints.at(-1) ?? drawPreview).y + drawPreview.y) / 2) * -2})`} x={((drawPoints.at(-1) ?? drawPreview).x + drawPreview.x) / 2} y={((drawPoints.at(-1) ?? drawPreview).y + drawPreview.y) / 2}>{drawTyped || formatMeasure(Math.hypot(drawPreview.x - (drawPoints.at(-1) ?? drawPreview).x, drawPreview.y - (drawPoints.at(-1) ?? drawPreview).y))}{drawTyped ? ' mm' : ''}{drawCanClose ? ' · fechar' : ''}</text>}
              </g>}
            </g>
          </svg>
        </div>
        <footer><span>Peças: {document.pieces.length}</span><span>Componentes: {document.features.length}</span><span>Cotas: {document.dimensions.length}</span><span>Diagnósticos: {diagnostics.length}</span></footer>
      </section>
      <aside className="technical-properties">
        <h2>Propriedades</h2>
        {selectedPiece && <>
          <label>Nome<input value={selectedPiece.name} onChange={event => applyPieceUpdate(selectedPiece.id, { name: event.target.value })} /></label>
          <label>Formato<select value={selectedPiece.parameters?.shape ?? ''} onChange={event => updateShape(event.target.value as 'RECTANGLE' | 'L' | 'CIRCLE' | 'ROUNDED')}><option value="" disabled>Contorno livre (editado por vértices)</option><option value="RECTANGLE">Retângulo</option><option value="L">Em L</option><option value="CIRCLE">Circular</option><option value="ROUNDED">Cantos arredondados</option></select></label>
          <div className="technical-property-grid">
            <label>Posição X<input type="number" value={Math.round(selectedPiece.x)} onChange={event => applyPieceUpdate(selectedPiece.id, { x: Number(event.target.value) })} /></label>
            <label>Posição Y<input type="number" value={Math.round(selectedPiece.y)} onChange={event => applyPieceUpdate(selectedPiece.id, { y: Number(event.target.value) })} /></label>
            {selectedPiece.parameters ? <>
              <MeasureField label="Largura" valueMm={selectedPiece.parameters.width} onChange={width => updateParametricSize({ width })} />
              <MeasureField label="Comprimento" valueMm={selectedPiece.parameters.length} onChange={length => updateParametricSize({ length })} />
              {selectedPiece.parameters.shape === 'L' && <MeasureField label="Braço" valueMm={selectedPiece.parameters.arm} onChange={arm => updateParametricSize({ arm })} />}
              {selectedPiece.parameters.shape === 'ROUNDED' && <label>Raio do canto<input type="number" min="0" value={Math.round(selectedPiece.parameters.radius)} onChange={event => updateParametricSize({ radius: Number(event.target.value) })} /></label>}
            </> : <>
              <MeasureField label="Largura" valueMm={pieceBounds(selectedPiece.contour).maxX - pieceBounds(selectedPiece.contour).minX} onChange={width => updateFreeSize({ width })} />
              <MeasureField label="Comprimento" valueMm={pieceBounds(selectedPiece.contour).maxY - pieceBounds(selectedPiece.contour).minY} onChange={length => updateFreeSize({ length })} />
            </>}
            <label>Espessura<input type="number" min="1" value={selectedPiece.thicknessMm} onChange={event => applyPieceUpdate(selectedPiece.id, { thicknessMm: Number(event.target.value) })} /></label>
            <label>Rotação<input type="number" value={selectedPiece.rotationDeg} onChange={event => applyPieceUpdate(selectedPiece.id, { rotationDeg: Number(event.target.value) })} /></label>
          </div>
          <label>Material visual<select value={selectedPiece.material?.id ?? ''} onChange={event => { const material = materials.find(entry => entry.id === event.target.value); applyPieceUpdate(selectedPiece.id, { material: material ? { id: material.id, name: material.name, imageUrl: material.imageUrl ?? undefined, textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } : undefined }); }}><option value="">Sem material</option>{materials.map(material => <option value={material.id} key={material.id}>{material.name}</option>)}</select></label>
          <small>O material serve apenas para representação visual. Valores comerciais permanecem no orçamento.</small>
          <div className="technical-property-grid">
            <button onClick={() => applyPieceUpdate(selectedPiece.id, { rotationDeg: (selectedPiece.rotationDeg + 90) % 360 })}>↻ Girar 90°</button>
            <button onClick={() => applyPieceUpdate(selectedPiece.id, { locked: !selectedPiece.locked })}>{selectedPiece.locked ? '🔓 Destravar' : '🔒 Bloquear'}</button>
          </div>
          <button className="secondary-button" onClick={duplicateSelected}>⧉ Duplicar peça</button>
          <button className="technical-danger" onClick={() => removePiece(selectedPiece)}>Excluir peça</button>
        </>}
        {selectedVertex && <>
          <label>Vértice</label>
          <label>Curvatura (arco)<input type="number" step="0.05" min="-1" max="1" value={selectedVertex.vertex.bulge} onChange={event => updateVertexBulge(Number(event.target.value))} /></label>
          <small>0 mantém a aresta reta. Valores entre -1 e 1 criam um arco até um semicírculo entre este vértice e o próximo.</small>
          <button className="secondary-button" onClick={() => updateVertexBulge(0)}>Tornar reto</button>
        </>}
        {selectedFeature && featureParent && <>
          <label>Nome<input value={selectedFeature.name} onChange={event => updateFeature({ name: event.target.value })} /></label>
          <small>{featureLabel[selectedFeature.type]} em {featureParent.name}</small>
          {['SKIRT', 'BACKSPLASH', 'EDGE_FINISH'].includes(selectedFeature.type) ? <div className="technical-property-grid">
            <label>Início na borda<input type="number" min="0" value={Math.round(selectedFeature.startMm)} onChange={event => updateFeature({ startMm: Number(event.target.value) })} /></label>
            <MeasureField label="Extensão" valueMm={selectedFeature.extentMm} onChange={extentMm => updateFeature({ extentMm })} />
            <label>Altura<input type="number" min="1" value={selectedFeature.heightMm} onChange={event => updateFeature({ heightMm: Number(event.target.value) })} /></label>
            <label>Espessura<input type="number" min="1" value={selectedFeature.thicknessMm} onChange={event => updateFeature({ thicknessMm: Number(event.target.value) })} /></label>
            <label>Perfil<select value={selectedFeature.profile} onChange={event => updateFeature({ profile: event.target.value as Feature['profile'] })}>{Object.entries(profileLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          </div> : <div className="technical-property-grid">
            <label>Posição X<input type="number" value={Math.round(selectedFeature.x)} onChange={event => updateFeature({ x: Number(event.target.value) })} /></label>
            <label>Posição Y<input type="number" value={Math.round(selectedFeature.y)} onChange={event => updateFeature({ y: Number(event.target.value) })} /></label>
            <label>Rotação<input type="number" value={selectedFeature.rotationDeg} onChange={event => updateFeature({ rotationDeg: Number(event.target.value) })} /></label>
            {selectedFeature.type === 'HOLE' ? <label>Diâmetro<input type="number" min="1" value={selectedFeature.diameterMm} onChange={event => updateFeature({ diameterMm: Number(event.target.value) })} /></label> : <>
              <label>Formato<select value={selectedFeature.shape} onChange={event => updateFeature({ shape: event.target.value as Feature['shape'] })}><option value="RECTANGLE">Retangular</option><option value="OVAL">Oval</option></select></label>
              <label>Largura<input type="number" min="1" value={selectedFeature.widthMm} onChange={event => updateFeature({ widthMm: Number(event.target.value) })} /></label>
              <label>Comprimento<input type="number" min="1" value={selectedFeature.lengthMm} onChange={event => updateFeature({ lengthMm: Number(event.target.value) })} /></label>
            </>}
            {(selectedFeature.type === 'SINK' || selectedFeature.type === 'SCULPTED_SINK') && <label>Profundidade<input type="number" min="1" value={selectedFeature.depthMm} onChange={event => updateFeature({ depthMm: Number(event.target.value) })} /></label>}
            {selectedFeature.type === 'SCULPTED_SINK' && <>
              <label>Parede<input type="number" min="1" value={selectedFeature.wallMm} onChange={event => updateFeature({ wallMm: Number(event.target.value) })} /></label>
              <label>Fundo<input type="number" min="1" value={selectedFeature.bottomMm} onChange={event => updateFeature({ bottomMm: Number(event.target.value) })} /></label>
              <label>Ralo X<input type="number" value={selectedFeature.drainX} onChange={event => updateFeature({ drainX: Number(event.target.value) })} /></label>
              <label>Ralo Y<input type="number" value={selectedFeature.drainY} onChange={event => updateFeature({ drainY: Number(event.target.value) })} /></label>
            </>}
          </div>}
          <button className="technical-danger" onClick={() => removeFeature(selectedFeature)}>Excluir componente</button>
        </>}
        {selectedAnnotation && <>
          <label>Texto<textarea rows={4} value={selectedAnnotation.text} onChange={event => updateAnnotation({ text: event.target.value })} /></label>
          <small>Arraste o texto no desenho para reposicionar. Aparece exatamente assim no PDF técnico.</small>
          <button className="technical-danger" onClick={() => removeAnnotation(selectedAnnotation.id)}>Excluir texto</button>
        </>}
        {!selectedPiece && !selectedFeature && !selectedVertex && !selectedAnnotation && <p>Selecione uma peça, um vértice, um componente ou um texto na área de trabalho para editar.</p>}
        {document.dimensions.length > 0 && <section className="technical-dimensions-list"><h3>Cotas</h3>{document.dimensions.map(dimension => <div key={dimension.id} className="technical-dimension-row"><label>Deslocamento<input type="number" value={dimension.offsetMm} onChange={event => change({ ...document, dimensions: document.dimensions.map(entry => entry.id === dimension.id ? { ...entry, offsetMm: Number(event.target.value) } : entry) })} /></label><button onClick={() => change({ ...document, dimensions: document.dimensions.filter(entry => entry.id !== dimension.id) })}>×</button></div>)}</section>}
        <section className="technical-diagnostics"><h3>Conferência</h3>{diagnostics.length ? diagnostics.map((diagnostic, index) => <p key={`${diagnostic.code}-${index}`} className={diagnostic.severity.toLowerCase()}>{diagnostic.message}</p>) : <p className="ok">Geometria pronta para conferência.</p>}</section>
      </aside>
    </section>
    <section className="technical-revisions"><header><div><p>CONTROLE TÉCNICO</p><h2>Revisões e produção</h2></div><small>Uma revisão é congelada. Alterações posteriores ficam somente no rascunho.</small></header>{revisions.length ? <div>{revisions.map(revision => <article key={revision.id}><div><strong>R{revision.number.toString().padStart(2, '0')}</strong><span className={`revision-status ${revision.status.toLowerCase()}`}>{revisionLabel[revision.status]}</span><small>{new Date(revision.createdAt).toLocaleString('pt-BR')} · {revision.createdBy.name}</small></div><small className="revision-hash">{revision.contentHash.slice(0, 12)}</small><div className="revision-actions"><button onClick={() => void openPdf(revision)}>PDF técnico</button>{revision.status === 'IN_REVIEW' && <><button onClick={() => void decide(revision, 'RETURN')}>Devolver</button><button className="primary-button" onClick={() => void decide(revision, 'APPROVE')}>Aprovar</button></>}{revision.status === 'APPROVED' && <button className="save-quote-button" onClick={() => void release(revision)}>Liberar produção</button>}</div></article>)}</div> : <p className="technical-empty">Salve o rascunho e envie a primeira revisão quando as medidas estiverem conferidas.</p>}</section>
  </main>;
}
