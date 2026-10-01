import { memo } from 'react';
import type { DraftComponent, DraftCutout } from './types';
import { centimetrosParaMilimetros, formatoRecorte, nomeExibicaoComponente, escalasDesenhoTecnico, isMiterFinish, miterJointPath, posicaoMarcadorMeiaEsquadria, rotuloLadoBorda, acabamentoBordaPedra, faixasBordaPedra, rotuloMedidaDesenho, posicaoMedidaFaixa } from '@inova/domain';
import { DetalhePeitoril, DetalhePeitorilDuplo } from './SillDetail';
import { descricaoProducaoRascunho } from '../../utilitarios/manufacturing-description';
import { ehPeitorilDuplo } from '../../utilitarios/quick-quote';

type Props = { components: DraftComponent[]; cutouts: DraftCutout[]; materialName?: string; materialNames?: Record<string, string>; linearServices?: { id: string; name: string }[]; services?: { id: string; name: string }[]; additionalServices?: { name: string; quantity?: string }[]; notes?: string | null };
type NormalizedComponent = DraftComponent & { componentIndex: number; lengthMm: number; widthMm: number };
const piecesPerRow = 5;
const cellWidth = 160;
const cellHeight = 230;
const safeMm = (value: string) => { try { return centimetrosParaMilimetros(value); } catch { return 0; } };

export const DesenhoTecnico = memo(function DesenhoTecnico({ components, cutouts, materialName, materialNames, linearServices = [], services = [], additionalServices = [], notes }: Props) {
  const valid = components.map((component, componentIndex) => ({ ...component, componentIndex, lengthMm: safeMm(component.lengthCm), widthMm: safeMm(component.widthCm) })).filter((component): component is NormalizedComponent => component.lengthMm > 0 && component.widthMm > 0);
  const descriptions = descricaoProducaoRascunho(components, cutouts, [...linearServices, ...services]);
  const columns = Math.min(piecesPerRow, valid.length);
  const rows = Math.ceil(valid.length / piecesPerRow);
  const svgWidth = Math.max(410, columns * cellWidth + 28);

  return <figure className="technical-drawing">
    <figcaption>{materialNames ? [...new Set(Object.values(materialNames))].join(' · ') : materialName ?? 'Material não selecionado'} · desenho ilustrativo, sem escala</figcaption>
    {!valid.length && <div className="drawing-empty">Informe as medidas para visualizar o desenho técnico 2D.</div>}
    {valid.length > 0 && <svg viewBox={`0 0 ${svgWidth} ${rows * cellHeight + 34}`} role="img" aria-label="Desenho técnico dos componentes">
      {valid.map((component, index) => {
        const column = index % piecesPerRow;
        const row = Math.floor(index / piecesPerRow);
        const finishedEdges = component.edges.map((edge) => {
          const lengthCm = edge.lengthCm || (edge.side === 'FRONT' || edge.side === 'BACK' ? component.lengthCm : component.widthCm);
          const lengthMm = safeMm(lengthCm);
          const serviceName = linearServices.find((service) => service.id === edge.serviceId)?.name ?? 'Acabamento';
          const isSimple = serviceName.toLocaleLowerCase('pt-BR') === 'acabamento simples';
          const isStrip = !!acabamentoBordaPedra(serviceName);
          const heightMm = isStrip ? safeMm(edge.heightCm ?? '') : 0;
          return { edge, side: edge.side, serviceName, isSimple, isStrip, lengthMm, heightMm, label: rotuloMedidaDesenho(lengthMm) };
        });
        const { strips, extra: skirtExtra } = faixasBordaPedra(finishedEdges);
        const { scaleX, scaleY } = escalasDesenhoTecnico(component.lengthMm, component.widthMm, skirtExtra, 108, 116);
        const width = component.lengthMm * scaleX;
        const height = component.widthMm * scaleY;
        const totalWidth = (component.lengthMm + skirtExtra.left + skirtExtra.right) * scaleX;
        const totalHeight = (component.widthMm + skirtExtra.top + skirtExtra.bottom) * scaleY;
        const x = 42 + column * cellWidth + (110 - totalWidth) / 2 + skirtExtra.left * scaleX;
        const y = 48 + row * cellHeight + (116 - totalHeight) / 2 + skirtExtra.top * scaleY;
        const componentCutouts = cutouts.filter((cutout) => cutout.componentIndex === component.componentIndex);
        const visualBottom = y + height + skirtExtra.bottom * scaleY;
        const dimensionY = y - skirtExtra.top * scaleY;
        const dimensionX = x - skirtExtra.left * scaleX;
        const hasMiter = finishedEdges.some((entry) => isMiterFinish(entry.serviceName));
        return <g key={component.id}>
          {materialNames && <text className="drawing-material-label" x={column * cellWidth + 90} y={row * cellHeight + 18} textAnchor="middle">{materialNames[component.id]}</text>}
          <line className="drawing-dimension" x1={x} y1={dimensionY - 18} x2={x + width} y2={dimensionY - 18} /><line className="drawing-dimension" x1={x} y1={dimensionY - 24} x2={x} y2={dimensionY - 12} /><line className="drawing-dimension" x1={x + width} y1={dimensionY - 24} x2={x + width} y2={dimensionY - 12} /><text className="drawing-dimension-label" x={x + width / 2} y={dimensionY - 25} textAnchor="middle">{rotuloMedidaDesenho(component.lengthMm)}</text>
          <line className="drawing-dimension" x1={dimensionX - 20} y1={y} x2={dimensionX - 20} y2={y + height} /><line className="drawing-dimension" x1={dimensionX - 26} y1={y} x2={dimensionX - 14} y2={y} /><line className="drawing-dimension" x1={dimensionX - 26} y1={y + height} x2={dimensionX - 14} y2={y + height} /><text className="drawing-dimension-label" x={dimensionX - 31} y={y + height / 2} textAnchor="middle" transform={`rotate(-90 ${dimensionX - 31} ${y + height / 2})`}>{rotuloMedidaDesenho(component.widthMm)}</text>
          <rect x={x} y={y} width={width} height={height} className={component.orientation === 'VERTICAL' ? 'drawing-vertical' : 'drawing-horizontal'}
            {...(component.raioCantosCm && safeMm(component.raioCantosCm) > 0 ? { rx: Math.min(safeMm(component.raioCantosCm) * scaleX, width / 2), ry: Math.min(safeMm(component.raioCantosCm) * scaleY, height / 2) } : {})} />
          {strips.map(({ edge, offsetMm }, stripIndex) => {
            const horizontal = edge.edge.side === 'FRONT' || edge.edge.side === 'BACK';
            const skirtLength = Math.min(edge.lengthMm, horizontal ? component.lengthMm : component.widthMm) * (horizontal ? scaleX : scaleY);
            const skirtHeight = edge.heightMm * (horizontal ? scaleY : scaleX);
            const offset = offsetMm * (horizontal ? scaleY : scaleX);
            const skirtX = edge.edge.side === 'LEFT' ? x - offset - skirtHeight : edge.edge.side === 'RIGHT' ? x + width + offset : x;
            const skirtY = edge.edge.side === 'BACK' ? y - offset - skirtHeight : edge.edge.side === 'FRONT' ? y + height + offset : y;
            const skirtWidth = horizontal ? skirtLength : skirtHeight;
            const skirtVisualHeight = horizontal ? skirtHeight : skirtLength;
            const lane = strips.slice(0, stripIndex).filter((strip) => strip.edge.side === edge.side).length;
            const label = posicaoMedidaFaixa(edge.side, { x: skirtX, y: skirtY, width: skirtWidth, height: skirtVisualHeight }, dimensionY, lane);
            return <g key={`strip-${stripIndex}`} aria-label={`${edge.serviceName} no lado ${rotuloLadoBorda(edge.side)}`}><rect x={skirtX} y={skirtY} width={skirtWidth} height={skirtVisualHeight} className="drawing-skirt" /><text className="drawing-skirt-height" x={label.x} y={label.y} textAnchor={label.anchor} dominantBaseline="middle">{rotuloMedidaDesenho(edge.heightMm, 'cm')}</text></g>;
          })}
          {(['BACK', 'FRONT', 'LEFT', 'RIGHT'] as const).map((side) => {
            const sideEdges = finishedEdges.filter((entry) => entry.edge.side === side);
            const x1 = side === 'LEFT' ? x : side === 'RIGHT' ? x + width : x;
            const y1 = side === 'FRONT' ? y + height : y;
            const x2 = side === 'LEFT' || side === 'RIGHT' ? x1 : x + width;
            const y2 = side === 'LEFT' || side === 'RIGHT' ? y + height : y1;
            const markerX = (x1 + x2) / 2; const markerY = (y1 + y2) / 2;
            if (!sideEdges.length) return null;
            const line = sideEdges.find((entry) => !entry.isSimple && !entry.isStrip);
            const labelX = side === 'LEFT' ? x - 8 : side === 'RIGHT' ? x + width + 8 : markerX;
            const labelY = side === 'BACK' ? y - 5 : side === 'FRONT' ? y + height + 11 : markerY + 3;
            const anchor = side === 'LEFT' ? 'end' : side === 'RIGHT' ? 'start' : 'middle';
            return <g key={side}>
              {sideEdges.some((entry) => !entry.isSimple) && <line x1={x1} y1={y1} x2={x2} y2={y2} className="drawing-edge" />}
              {sideEdges.some((entry) => entry.isSimple) && <><line x1={markerX - 3} y1={markerY - 3} x2={markerX + 3} y2={markerY + 3} className="drawing-simple-finish-marker" /><line x1={markerX - 3} y1={markerY + 3} x2={markerX + 3} y2={markerY - 3} className="drawing-simple-finish-marker" /></>}
              {line && !sideEdges.some((entry) => isMiterFinish(entry.serviceName)) && <text className="drawing-edge-label" x={labelX} y={labelY} textAnchor={anchor}>{line.label}</text>}
            </g>;
          })}
          {componentCutouts.map((cutout) => { const cutoutWidth = safeMm(cutout.lengthCm || cutout.diameterCm || '') * scaleX || 22; const cutoutHeight = safeMm(cutout.widthCm || cutout.diameterCm || '') * scaleY || 16; const cx = x + ((cutout.positionXCm?.trim() ? Number(cutout.positionXCm.replace(',', '.')) * 10 : component.lengthMm / 2) * scaleX); const cy = y + ((cutout.positionYCm?.trim() ? Number(cutout.positionYCm.replace(',', '.')) * 10 : component.widthMm / 2) * scaleY); return formatoRecorte(cutout.cutoutType) === 'ellipse' ? <ellipse key={cutout.id} cx={cx} cy={cy} rx={cutoutWidth / 2} ry={cutoutHeight / 2} className="drawing-cutout" /> : <rect key={cutout.id} x={cx - cutoutWidth / 2} y={cy - cutoutHeight / 2} width={cutoutWidth} height={cutoutHeight} className="drawing-cutout" />; })}
          {(['BACK', 'FRONT', 'LEFT', 'RIGHT'] as const).filter((side) => finishedEdges.some((entry) => entry.edge.side === side && isMiterFinish(entry.serviceName))).map((side) => {
            const marker = posicaoMarcadorMeiaEsquadria(side, { x, y, width, height }, { left: skirtExtra.left * scaleX, right: skirtExtra.right * scaleX, top: skirtExtra.top * scaleY, bottom: skirtExtra.bottom * scaleY })!;
            return <g key={`miter-${side}`} className="drawing-miter-detail" transform={`translate(${marker.x} ${marker.y}) rotate(${marker.rotation})`} role="img" aria-label={`Acabamento 45 graus no lado ${rotuloLadoBorda(side)}`}><path d={miterJointPath} transform="scale(0.7)" fill="none" stroke="#6e5830" strokeWidth="1.5" strokeLinejoin="round" /><text x="18" y="11" fontWeight="700">45°</text></g>;
          })}
          <text className="drawing-description" x={x + width / 2} y={visualBottom + (hasMiter ? 49 : 27)} textAnchor="middle">{component.componentIndex + 1}. {nomeExibicaoComponente(component)}</text>
        </g>;
      })}
    </svg>}
    {valid.filter((component) => component.componentType === 'SILL' && !ehPeitorilDuplo(component)).map((component) => <div className="sill-drawing-detail" key={component.id}><strong>{nomeExibicaoComponente(component)}</strong><DetalhePeitoril measure={component.sillDetailCm} height={component.sillDetailHeightCm} showEmpty={false} /></div>)}
    {components.filter((component) => component.componentType === 'SILL' && ehPeitorilDuplo(component)).map((component) => <div className="sill-drawing-detail" key={component.id}><strong>{nomeExibicaoComponente(component)}</strong><DetalhePeitorilDuplo topWidth={component.sillTopWidthCm} bottomWidth={component.sillBottomWidthCm} finalWidth={component.sillFinalWidthCm} overlap={component.sillOverlapCm} showEmpty={false} /></div>)}
    <small>Um desenho por peça, com até 5 desenhos por linha.</small>
    <small className="drawing-legend">X = Acabamento simples · Área tracejada = recorte.</small>
    <div className="manufacturing-description">
      {descriptions.map((section, index) => <section key={index}><h4>{section.title}</h4>{section.lines.map((line, lineIndex) => <p key={lineIndex}>{line.label !== 'Acabamentos' && <><strong>{line.label}:</strong> </>}{line.text}</p>)}</section>)}
      {additionalServices.length > 0 && <section><h4>Serviços e detalhes do projeto</h4>{additionalServices.map((service, index) => <p key={index}>{service.name}{service.quantity ? ` · quantidade: ${service.quantity}` : ''}</p>)}</section>}
      {notes?.trim() && <section><h4>Observações do orçamento</h4><p className="manufacturing-notes">{notes.trim()}</p></section>}
    </div>
  </figure>;
});
