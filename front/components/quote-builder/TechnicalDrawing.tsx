import { memo } from 'react';
import type { DraftComponent, DraftCutout } from './types';
import { centimetersToMillimeters } from '@inova/domain';

type Props = { components: DraftComponent[]; cutouts: DraftCutout[]; materialName?: string; linearServices?: { id: string; name: string }[] };
type NormalizedComponent = DraftComponent & { componentIndex: number; lengthMm: number; widthMm: number };
const piecesPerRow = 5;
const cellWidth = 160;
const cellHeight = 230;
const safeMm = (value: string) => { try { return centimetersToMillimeters(value); } catch { return 0; } };
const number = (value: number, digits = 2) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const centimeters = (value: number) => (value / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export const TechnicalDrawing = memo(function TechnicalDrawing({ components, cutouts, materialName, linearServices = [] }: Props) {
  const valid = components.map((component, componentIndex) => ({ ...component, componentIndex, lengthMm: safeMm(component.lengthCm), widthMm: safeMm(component.widthCm) })).filter((component): component is NormalizedComponent => component.lengthMm > 0 && component.widthMm > 0);
  if (!valid.length) return <div className="drawing-empty">Informe as medidas para visualizar o desenho técnico 2D.</div>;
  const columns = Math.min(piecesPerRow, valid.length);
  const rows = Math.ceil(valid.length / piecesPerRow);
  const svgWidth = Math.max(410, columns * cellWidth + 28);

  return <figure className="technical-drawing">
    <figcaption>{materialName ?? 'Material não selecionado'} · desenho ilustrativo sem impacto no cálculo</figcaption>
    <svg viewBox={`0 0 ${svgWidth} ${rows * cellHeight + 34}`} role="img" aria-label="Desenho técnico dos componentes">
      {valid.map((component, index) => {
        const column = index % piecesPerRow;
        const row = Math.floor(index / piecesPerRow);
        const finishedEdges = component.edges.map((edge) => {
          const lengthCm = edge.lengthCm || (edge.side === 'FRONT' || edge.side === 'BACK' ? component.lengthCm : component.widthCm);
          const lengthMm = safeMm(lengthCm);
          const serviceName = linearServices.find((service) => service.id === edge.serviceId)?.name ?? 'Acabamento';
          const isSimple = serviceName.toLocaleLowerCase('pt-BR') === 'acabamento simples';
          const isSkirt = serviceName.toLocaleLowerCase('pt-BR') === 'saia';
          const heightMm = isSkirt ? safeMm(edge.heightCm ?? '') : 0;
          return { edge, serviceName, isSimple, isSkirt, lengthMm, heightMm, label: isSimple ? 'S' : `${number(lengthMm / 1000)} m` };
        });
        const skirtExtra = finishedEdges.filter((edge) => edge.isSkirt).reduce((extra, edge) => ({ top: Math.max(extra.top, edge.edge.side === 'BACK' ? edge.heightMm : 0), bottom: Math.max(extra.bottom, edge.edge.side === 'FRONT' ? edge.heightMm : 0), left: Math.max(extra.left, edge.edge.side === 'LEFT' ? edge.heightMm : 0), right: Math.max(extra.right, edge.edge.side === 'RIGHT' ? edge.heightMm : 0) }), { top: 0, bottom: 0, left: 0, right: 0 });
        const scale = Math.min(108 / (component.lengthMm + skirtExtra.left + skirtExtra.right), 116 / (component.widthMm + skirtExtra.top + skirtExtra.bottom));
        const width = component.lengthMm * scale;
        const height = component.widthMm * scale;
        const totalWidth = (component.lengthMm + skirtExtra.left + skirtExtra.right) * scale;
        const totalHeight = (component.widthMm + skirtExtra.top + skirtExtra.bottom) * scale;
        const x = 42 + column * cellWidth + (110 - totalWidth) / 2 + skirtExtra.left * scale;
        const y = 48 + row * cellHeight + (116 - totalHeight) / 2 + skirtExtra.top * scale;
        const totalArea = component.lengthMm * component.widthMm * component.quantity / 1_000_000;
        const componentCutouts = cutouts.filter((cutout) => cutout.componentIndex === component.componentIndex);
        const visualBottom = y + height + skirtExtra.bottom * scale;
        return <g key={component.id}>
          <line className="drawing-dimension" x1={x} y1={y - 18} x2={x + width} y2={y - 18} /><line className="drawing-dimension" x1={x} y1={y - 24} x2={x} y2={y - 12} /><line className="drawing-dimension" x1={x + width} y1={y - 24} x2={x + width} y2={y - 12} /><text className="drawing-dimension-label" x={x + width / 2} y={y - 25} textAnchor="middle">{number(component.lengthMm / 1000)} m</text>
          <line className="drawing-dimension" x1={x - 20} y1={y} x2={x - 20} y2={y + height} /><line className="drawing-dimension" x1={x - 26} y1={y} x2={x - 14} y2={y} /><line className="drawing-dimension" x1={x - 26} y1={y + height} x2={x - 14} y2={y + height} /><text className="drawing-dimension-label" x={x - 31} y={y + height / 2} textAnchor="middle" transform={`rotate(-90 ${x - 31} ${y + height / 2})`}>{number(component.widthMm / 1000)} m</text>
          <rect x={x} y={y} width={width} height={height} className={component.orientation === 'VERTICAL' ? 'drawing-vertical' : 'drawing-horizontal'} />
          {finishedEdges.filter((edge) => edge.isSkirt && edge.heightMm > 0).map((edge) => {
            const horizontal = edge.edge.side === 'FRONT' || edge.edge.side === 'BACK';
            const skirtLength = Math.min(edge.lengthMm, horizontal ? component.lengthMm : component.widthMm) * scale;
            const skirtHeight = edge.heightMm * scale;
            const skirtX = edge.edge.side === 'LEFT' ? x - skirtHeight : edge.edge.side === 'RIGHT' ? x + width : x;
            const skirtY = edge.edge.side === 'BACK' ? y - skirtHeight : edge.edge.side === 'FRONT' ? y + height : y;
            const skirtWidth = horizontal ? skirtLength : skirtHeight;
            const skirtVisualHeight = horizontal ? skirtHeight : skirtLength;
            const isSideSkirt = edge.edge.side === 'LEFT' || edge.edge.side === 'RIGHT';
            const heightLabelX = edge.edge.side === 'LEFT' ? skirtX - 5 : edge.edge.side === 'RIGHT' ? skirtX + skirtWidth + 7 : x + skirtWidth + 10;
            const heightLabelY = horizontal ? skirtY + skirtHeight / 2 : skirtY + skirtVisualHeight / 2;
            return <g key={`skirt-${edge.edge.side}`}><rect x={skirtX} y={skirtY} width={skirtWidth} height={skirtVisualHeight} className="drawing-skirt" /><text className="drawing-skirt-height" x={heightLabelX} y={heightLabelY} textAnchor="middle" transform={isSideSkirt ? `rotate(-90 ${heightLabelX} ${heightLabelY})` : undefined}>{centimeters(edge.heightMm)}</text></g>;
          })}
          {(['BACK', 'FRONT', 'LEFT', 'RIGHT'] as const).map((side) => {
            const edge = component.edges.find((entry) => entry.side === side);
            const x1 = side === 'LEFT' ? x : side === 'RIGHT' ? x + width : x;
            const y1 = side === 'FRONT' ? y + height : y;
            const x2 = side === 'LEFT' || side === 'RIGHT' ? x1 : x + width;
            const y2 = side === 'LEFT' || side === 'RIGHT' ? y + height : y1;
            const markerX = (x1 + x2) / 2; const markerY = (y1 + y2) / 2;
            if (!edge) return <g key={side}><line x1={markerX - 3} y1={markerY - 3} x2={markerX + 3} y2={markerY + 3} className="drawing-no-finish-marker" /><line x1={markerX - 3} y1={markerY + 3} x2={markerX + 3} y2={markerY - 3} className="drawing-no-finish-marker" /></g>;
            const line = finishedEdges.find((entry) => entry.edge === edge)!;
            const labelX = side === 'LEFT' ? x - 8 : side === 'RIGHT' ? x + width + 8 : markerX;
            const labelY = side === 'BACK' ? y - 5 : side === 'FRONT' ? y + height + 11 : markerY + 3;
            const anchor = side === 'LEFT' ? 'end' : side === 'RIGHT' ? 'start' : 'middle';
            return <g key={side}><line x1={x1} y1={y1} x2={x2} y2={y2} className="drawing-edge" />{!line.isSkirt && <text className="drawing-edge-label" x={labelX} y={labelY} textAnchor={anchor}>{line.label}</text>}</g>;
          })}
          {componentCutouts.map((cutout) => { const cutoutWidth = safeMm(cutout.lengthCm ?? '') * scale || 22; const cutoutHeight = safeMm(cutout.widthCm ?? '') * scale || 16; const cx = x + ((safeMm(cutout.positionXCm ?? '') || component.lengthMm / 2) * scale); const cy = y + ((safeMm(cutout.positionYCm ?? '') || component.widthMm / 2) * scale); return <rect key={cutout.id} x={cx - cutoutWidth / 2} y={cy - cutoutHeight / 2} width={cutoutWidth} height={cutoutHeight} className="drawing-cutout" />; })}
          <text className="drawing-description" x={x + width / 2} y={visualBottom + 27} textAnchor="middle">{component.label}</text>
          <text className="drawing-description" x={x + width / 2} y={visualBottom + 40} textAnchor="middle">{component.quantity} {component.quantity === 1 ? 'peça' : 'peças'} · {number(totalArea)} m² total</text>
          {finishedEdges.filter((edge) => edge.isSkirt && edge.heightMm > 0).map((edge, skirtIndex) => <text className="drawing-description" key={`skirt-description-${edge.edge.side}`} x={x + width / 2} y={visualBottom + 54 + skirtIndex * 12} textAnchor="middle">Saia {centimeters(edge.lengthMm)} × {centimeters(edge.heightMm)} cm</text>)}
        </g>;
      })}
    </svg>
    <small>Um desenho representa um componente. Para outra peça, use “Adicionar componente”; até 5 desenhos ficam por linha. S = acabamento simples · X = sem acabamento · Área tracejada = recorte.</small>
  </figure>;
});
