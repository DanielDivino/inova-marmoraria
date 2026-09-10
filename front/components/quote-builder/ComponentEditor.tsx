import { calculateComponent, centimetersToMillimeters } from '@inova/domain';
import type { DraftComponent, DraftEdge } from './types';

const labels = { TOP: 'Tampo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', SIDE_LEFT: 'Lateral esquerda', SIDE_RIGHT: 'Lateral direita', SILL: 'Soleira / peitoril', STEP: 'Degrau', OTHER: 'Outro' } as const;
const edgeLabels: Record<DraftEdge['side'], string> = { FRONT: 'Inferior', BACK: 'Superior', LEFT: 'Esquerda', RIGHT: 'Direita', CUSTOM: 'Personalizada' };
type Props = { components: DraftComponent[]; linearServices: { id: string; name: string }[]; onChange: (components: DraftComponent[]) => void; onAdd: (type: DraftComponent['componentType']) => void; onRemove: (index: number) => void; onAddCutout?: (index: number) => void };

const area = (component: DraftComponent) => {
  try { return calculateComponent({ label: component.label, componentType: component.componentType, orientation: component.orientation, lengthMm: centimetersToMillimeters(component.lengthCm), widthMm: centimetersToMillimeters(component.widthCm), quantity: component.quantity }).billableArea; } catch { return 0; }
};

export function ComponentEditor({ components, linearServices, onChange, onAdd, onRemove, onAddCutout }: Props) {
  const update = (index: number, patch: Partial<DraftComponent>) => onChange(components.map((component, current) => current === index ? { ...component, ...patch } : component));
  const updateEdge = (componentIndex: number, side: DraftEdge['side'], patch: Partial<DraftEdge> | null) => {
    const component = components[componentIndex]; const existing = component.edges.find((edge) => edge.side === side); const edges = component.edges.filter((edge) => edge.side !== side);
    if (patch) edges.push({ side, serviceId: '', quantity: 1, ...existing, ...patch });
    update(componentIndex, { edges });
  };
  return <section className="component-editor">
    <div className="quick-components"><button type="button" onClick={() => onAdd('OTHER')}>+ Adicionar componente</button><button type="button" onClick={() => onAdd('TOP')}>+ Adicionar tampo</button><button type="button" onClick={() => onAdd('BACKSPLASH')}>+ Adicionar rodabanca</button><button type="button" onClick={() => onAdd('SIDE_LEFT')}>+ Adicionar lateral</button></div>
    {components.map((component, index) => <article className="component-card" key={component.id}>
      <div className="component-card-title"><strong>Componente {index + 1}</strong><span>{area(component).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m²</span></div>
      <div className="component-fields"><label>Nome<input value={component.label} onChange={(event) => update(index, { label: event.target.value })} placeholder="Nome" /></label><label>Tipo<select value={component.componentType} onChange={(event) => update(index, { componentType: event.target.value as DraftComponent['componentType'] })}>{Object.entries(labels).filter(([value]) => value !== 'SKIRT' || component.componentType === 'SKIRT').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Orientação<select value={component.orientation} onChange={(event) => update(index, { orientation: event.target.value as DraftComponent['orientation'] })}><option value="HORIZONTAL">Horizontal</option><option value="VERTICAL">Vertical</option></select></label><label>Comprimento (cm)<input inputMode="decimal" value={component.lengthCm} onChange={(event) => update(index, { lengthCm: event.target.value })} placeholder="Comprimento (cm)" /></label><label>Largura / altura (cm)<input inputMode="decimal" value={component.widthCm} onChange={(event) => update(index, { widthCm: event.target.value })} placeholder="Largura/altura (cm)" /></label><label className="component-quantity"><span>Quantidade de materiais</span><input type="number" min="1" value={component.quantity} onChange={(event) => update(index, { quantity: Math.max(1, Number(event.target.value)) })} /></label></div>
      <details className="edge-menu"><summary>Acabamentos nas bordas</summary><div className="edge-grid">{(['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const).map((side) => { const edge = component.edges.find((entry) => entry.side === side); const selectedService = linearServices.find((service) => service.id === edge?.serviceId); const isSkirt = selectedService?.name.toLocaleLowerCase('pt-BR') === 'saia'; return <label key={side}><span>{edgeLabels[side]}</span><select value={edge?.serviceId ?? ''} onChange={(event) => updateEdge(index, side, event.target.value ? { serviceId: event.target.value } : null)}><option value="">Sem acabamento</option>{linearServices.map((service) => <option key={service.id} value={service.id}>{service.name === 'Saia' ? 'Saia — calculada pela pedra' : service.name}</option>)}</select>{edge && <input inputMode="decimal" value={edge.lengthCm ?? ''} onChange={(event) => updateEdge(index, side, { lengthCm: event.target.value })} placeholder="Comprimento do acabamento (cm)" />}{isSkirt && <input inputMode="decimal" value={edge?.heightCm ?? ''} onChange={(event) => updateEdge(index, side, { heightCm: event.target.value })} placeholder="Altura da saia (cm)" />}</label>; })}</div></details>
      <div className="component-actions"><button type="button" onClick={() => onAddCutout?.(index)}>+ Adicionar recorte/cuba</button><button type="button" onClick={() => onRemove(index)}>Remover</button></div>
    </article>)}
  </section>;
}
