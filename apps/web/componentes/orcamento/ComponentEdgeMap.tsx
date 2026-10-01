import { useId, useState } from 'react';
import { edgeSideLabels, acabamentoBordaPedra, formatoRecorte } from '@inova/domain';
import type { DraftComponent, DraftCutout, DraftEdge, EdgeSide } from './types';

type Props = {
  component: DraftComponent;
  cutouts?: DraftCutout[];
  materialName?: string;
  materialImage?: string;
  services: { id: string; name: string }[];
  onChange: (edges: DraftEdge[]) => void;
  onAddComponent?: (type: DraftComponent['componentType'], attached: boolean) => void;
  backsplashes?: DraftComponent[];
  onAddBacksplash?: (side: Exclude<EdgeSide, 'CUSTOM'>) => void;
  onUpdateBacksplash?: (id: string, patch: Partial<DraftComponent>) => void;
  onRemoveBacksplash?: (id: string) => void;
  onEditBacksplash?: (id: string) => void;
};
const sides = ['BACK', 'LEFT', 'RIGHT', 'FRONT'] as const;
const numeric = (value?: string) => Number(value?.replace(',', '.')) || 0;
const shortName = (name: string) => name.replace(/^Acabamento\s+/i, '');

export function MapaBordasComponente({ component, cutouts = [], materialName, materialImage, services, onChange, onAddComponent, backsplashes = [], onAddBacksplash, onUpdateBacksplash, onRemoveBacksplash, onEditBacksplash }: Props) {
  const [active, setActive] = useState<EdgeSide | null>(component.edges[0]?.side ?? null);
  const panelId = useId();
  const serviceName = (edge: DraftEdge) => services.find(service => service.id === edge.serviceId)?.name ?? 'Acabamento';
  const description = (edge: DraftEdge) => {
    const strip = acabamentoBordaPedra(serviceName(edge));
    return shortName(serviceName(edge)) + (strip ? ` ${edge.heightCm || '?'} cm` : '') + (edge.lengthCm ? ` · ${edge.lengthCm} cm` : '') + (edge.quantity > 1 ? ` ×${edge.quantity}` : '');
  };
  const update = (index: number, patch: Partial<DraftEdge> | null) => onChange(component.edges.flatMap((edge, current) => current === index ? patch ? [{ ...edge, ...patch }] : [] : [edge]));
  const sideLength = active === 'LEFT' || active === 'RIGHT' ? component.widthCm : component.lengthCm;
  const selected = component.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => edge.side === active);
  const available = services.filter(service => !selected.some(({ edge }) => edge.serviceId === service.id));
  const canAddBacksplash = !!onAddBacksplash && active !== 'CUSTOM';
  const hasSideDetail = (side: EdgeSide) => component.edges.some(edge => edge.side === side) || backsplashes.some(piece => piece.parentSide === side);
  return <div className="component-edge-layout">
    <div className="component-edge-map" role="group" aria-label="Lados e acabamentos da peça">
      {sides.map(side => {
        const edges = component.edges.filter(edge => edge.side === side);
        const labels = [...edges.map(description), ...backsplashes.filter(piece => piece.parentSide === side).map(piece => `Rodabanca ${piece.widthCm || '?'} cm · ${piece.lengthCm || '?'} cm${piece.quantity > 1 ? ` ×${piece.quantity}` : ''}`)];
        return <button key={side} type="button" className={`map-side map-side-${side.toLowerCase()}${labels.length ? ' has-finishes' : ''}`} aria-label={`Editar acabamentos — ${edgeSideLabels[side]}`} aria-expanded={active === side} aria-controls={panelId} onClick={() => setActive(active === side ? null : side)}>
          <strong>{edgeSideLabels[side]} <span aria-hidden="true">{labels.length ? '✎' : '+'}</span></strong>
          {labels.length > 0 && <span>{labels.join(' + ')}</span>}
        </button>;
      })}
      <div className="map-stone" style={{ borderTopColor: hasSideDetail('BACK') ? '#a47730' : undefined, borderBottomColor: hasSideDetail('FRONT') ? '#a47730' : undefined, borderLeftColor: hasSideDetail('LEFT') ? '#a47730' : undefined, borderRightColor: hasSideDetail('RIGHT') ? '#a47730' : undefined }}>
        {materialImage && <img src={materialImage} alt="" />}
        <svg viewBox="0 0 200 90" preserveAspectRatio="none" aria-hidden="true">
          {cutouts.map(cutout => {
            const length = numeric(component.lengthCm) || 1;
            const width = numeric(component.widthCm) || 1;
            const w = Math.min(180, Math.max(4, numeric(cutout.lengthCm || cutout.diameterCm) / length * 200));
            const h = Math.min(80, Math.max(4, numeric(cutout.widthCm || cutout.diameterCm) / width * 90));
            const x = Math.min(200 - w / 2, Math.max(w / 2, cutout.positionXCm ? numeric(cutout.positionXCm) / length * 200 : 100));
            const y = Math.min(90 - h / 2, Math.max(h / 2, cutout.positionYCm ? numeric(cutout.positionYCm) / width * 90 : 45));
            return formatoRecorte(cutout.cutoutType) === 'ellipse' ? <ellipse key={cutout.id} cx={x} cy={y} rx={w / 2} ry={h / 2} /> : <rect key={cutout.id} x={x - w / 2} y={y - h / 2} width={w} height={h} rx="2" />;
          })}
        </svg>
        <span>{component.lengthCm || '—'} × {component.widthCm || '—'} cm</span>
      </div>
      <small className="map-caption">{materialName || 'Selecione a pedra'} · Vista superior ilustrativa{cutouts.length ? ` · ${cutouts.length} recorte(s)` : ''}</small>
      {onAddComponent && <div className="map-component-add">
        <label><span>Adicionar peça</span><select aria-label="Adicionar peça" value="" onChange={event => {
          const [type, relation] = event.target.value.split('|');
          if (type) onAddComponent(type as DraftComponent['componentType'], relation === 'attached');
        }}>
          <option value="">Selecionar</option>
          <optgroup label="Peça colada">
            <option value="TOP|attached">Tampo</option>
            <option value="BACKSPLASH|attached">Rodabanca</option>
            <option value="SIDE_LEFT|attached">Lateral</option>
          </optgroup>
          <optgroup label="Peça separada">
            <option value="TOP|separate">Tampo separado</option>
            <option value="BACKSPLASH|separate">Rodabanca separada</option>
            <option value="SIDE_LEFT|separate">Lateral separada</option>
          </optgroup>
        </select></label>
      </div>}
    </div>
    <div className="map-edge-editor" id={panelId}>
      {active ? <>
        <div className="map-editor-heading"><strong>{edgeSideLabels[active]}</strong><button type="button" onClick={() => setActive(null)} aria-label="Fechar edição do lado">Concluir ✓</button></div>
        {selected.map(({ edge, index }) => {
          const strip = acabamentoBordaPedra(serviceName(edge));
          const dimensionLabel = strip === 'VISTA' ? 'Largura da vista (cm)' : 'Altura da saia (cm)';
          return <div className="edge-finish" key={edge.id ?? `${edge.side}-${edge.serviceId}-${index}`}>
            <span className="edge-finish-name">{serviceName(edge)}</span>
            {strip && <label className="edge-finish-measure"><span>{strip === 'VISTA' ? 'Larg.' : 'Alt.'}</span><input aria-label={dimensionLabel} inputMode="decimal" value={edge.heightCm ?? ''} onChange={event => update(index, { heightCm: event.target.value })} placeholder="—" /><span>cm</span></label>}
            <details className="edge-length-editor"><summary aria-label={`Editar comprimento — ${serviceName(edge)}`}>{edge.lengthCm || sideLength || '—'} cm <span aria-hidden="true">✎</span></summary><label className="edge-finish-measure"><input aria-label="Comprimento aplicado (cm)" inputMode="decimal" value={edge.lengthCm ?? ''} onChange={event => update(index, { lengthCm: event.target.value })} placeholder={sideLength || '—'} /><span>cm</span></label></details>
            {edge.quantity > 1 && <label className="edge-finish-measure"><span>Qtd.</span><input aria-label="Quantidade do acabamento" type="number" min="1" value={edge.quantity} onChange={event => update(index, { quantity: Math.max(1, Number(event.target.value)) })} /></label>}
            <button className="edge-finish-remove" type="button" aria-label={`Remover ${serviceName(edge)} — ${edgeSideLabels[active]}`} onClick={() => update(index, null)}>×</button>
          </div>;
        })}
        {backsplashes.filter(piece => piece.parentSide === active).map(piece => <div className="edge-finish" key={piece.id}>
          <span className="edge-finish-name">Rodabanca <button className="backsplash-details-button" type="button" onClick={() => onEditBacksplash?.(piece.id)} aria-label={`Detalhes da rodabanca — ${edgeSideLabels[active]}`}>✎</button></span>
          <label className="edge-finish-measure"><span>Alt.</span><input aria-label="Altura da rodabanca (cm)" inputMode="decimal" value={piece.widthCm} onChange={event => onUpdateBacksplash?.(piece.id, { widthCm: event.target.value })} placeholder="—" /><span>cm</span></label>
          <details className="edge-length-editor"><summary aria-label="Editar comprimento — Rodabanca">{piece.lengthCm || '—'} cm <span aria-hidden="true">✎</span></summary><label className="edge-finish-measure"><input aria-label="Comprimento da rodabanca (cm)" inputMode="decimal" value={piece.lengthCm} onChange={event => onUpdateBacksplash?.(piece.id, { lengthCm: event.target.value })} placeholder={sideLength || '—'} /><span>cm</span></label></details>
          <button className="edge-finish-remove" type="button" aria-label={`Remover Rodabanca — ${edgeSideLabels[active]}`} onClick={() => onRemoveBacksplash?.(piece.id)}>×</button>
        </div>)}
        <select aria-label={`Adicionar acabamento — ${edgeSideLabels[active]}`} value="" disabled={!available.length && !canAddBacksplash} onChange={event => {
          if (event.target.value === '__backsplash' && active !== 'CUSTOM') onAddBacksplash?.(active);
          else if (event.target.value) onChange([...component.edges, { side: active, serviceId: event.target.value, quantity: 1 }]);
        }}><option value="">+ Adicionar acabamento</option>{canAddBacksplash && <option value="__backsplash">Rodabanca</option>}{available.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
      </> : <p className="map-editor-empty">Toque em um lado do desenho<br />para adicionar ou editar acabamentos.</p>}
      {component.edges.some(edge => edge.side === 'CUSTOM') && active !== 'CUSTOM' && <button type="button" className="text-button" onClick={() => setActive('CUSTOM')}>Outros acabamentos ({component.edges.filter(edge => edge.side === 'CUSTOM').length})</button>}
    </div>
  </div>;
}
