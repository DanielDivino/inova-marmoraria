import { calcularComponente, centimetrosParaMilimetros, componentTypeLabels } from '@inova/domain';
import type { DraftComponent, DraftCutout } from './types';
import { MapaBordasComponente } from './ComponentEdgeMap';
import { DetalhePeitoril } from './SillDetail';
import { useState, type ReactNode } from 'react';
import { componentMaterialImage, materialImageSrc } from './ComponentMaterialPicker';
import { criarRodabancaLateral } from '../../utilitarios/component-groups';

type Props = { materialFor?: (component: DraftComponent) => { id: string; name: string; images?: { url: string; isPrimary: boolean }[] } | undefined; renderCutouts?: (componentIndex: number) => ReactNode; components: DraftComponent[]; cutouts?: DraftCutout[]; materialImage?: string; materialName?: string; linearServices: { id: string; name: string }[]; onChange: (components: DraftComponent[]) => void; onAdd: (type: DraftComponent['componentType'], parentIndex?: number, attached?: boolean) => void; onRemove: (index: number) => void; onAddCutout?: (index: number) => void; onActiveMaterialChange?: (componentId: string) => void };
const area = (component: DraftComponent) => {
  try { return calcularComponente({ ...component, lengthMm: centimetrosParaMilimetros(component.lengthCm), widthMm: centimetrosParaMilimetros(component.widthCm) }).billableArea; } catch { return 0; }
};

export function EditorComponentes({ materialFor, renderCutouts, components, cutouts = [], materialImage, materialName, linearServices, onChange, onAdd, onRemove, onAddCutout, onActiveMaterialChange }: Props) {
  const [editingBacksplash, setEditingBacksplash] = useState<string | null>(null);
  const update = (index: number, patch: Partial<DraftComponent>) => onChange(components.map((component, current) => current === index ? { ...component, ...patch } : component));
  const roots = components.filter((component) => !component.parentComponentId || !components.some((entry) => entry.id === component.parentComponentId));
  const renderComponent = (component: DraftComponent, rootNumber: number, attached = false): React.ReactNode => {
    const index = components.indexOf(component);
    const selectedMaterial = materialFor?.(component);
    const children = attached ? [] : components.filter((entry) => entry.parentComponentId === component.id);
    const sideBacksplashes = children.filter(entry => entry.componentType === 'BACKSPLASH' && entry.parentSide);
    const visibleChildren = children.filter(entry => !sideBacksplashes.includes(entry) || entry.id === editingBacksplash);
    return <details className={'component-card' + (attached ? ' attached-component' : '')} key={component.id} open onFocusCapture={() => onActiveMaterialChange?.(component.id)} onClickCapture={() => onActiveMaterialChange?.(component.id)}>
      <summary className="component-card-title"><strong>{component.label || (attached ? componentTypeLabels[component.componentType] : 'Componente ' + rootNumber)}</strong><span>{area(component).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m²</span></summary>
      <div className="component-card-body">
      <div className="component-fields">
        <label className="component-name-field">Nome<input value={component.label} maxLength={120} onChange={(event) => update(index, { label: event.target.value })} placeholder="Nome" /></label>
        <label>Tipo<select value={component.componentType} onChange={(event) => update(index, { componentType: event.target.value as DraftComponent['componentType'] })}>{Object.entries(componentTypeLabels).filter(([value]) => value !== 'SKIRT' || component.componentType === 'SKIRT').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Comprimento (cm)<input inputMode="decimal" value={component.lengthCm} onChange={(event) => update(index, { lengthCm: event.target.value })} placeholder="Comprimento (cm)" /></label>
        <label>Largura / altura (cm)<input inputMode="decimal" value={component.widthCm} onChange={(event) => update(index, { widthCm: event.target.value })} placeholder="Largura/altura (cm)" /></label>
        <label className="component-quantity"><span>Qtd.</span><input aria-label="Quantidade de materiais" type="number" min="1" value={component.quantity} onChange={(event) => update(index, { quantity: Math.max(1, Number(event.target.value)) })} /></label>
      </div>
      {component.componentType === 'SILL' && <div className="sill-detail-editor"><DetalhePeitoril measure={component.sillDetailCm} height={component.sillDetailHeightCm} /><label>Medida horizontal (cm)<input inputMode="decimal" value={component.sillDetailCm ?? ''} onChange={(event) => update(index, { sillDetailCm: event.target.value })} placeholder="Medida em cm" /></label><label>Medida vertical (cm)<input inputMode="decimal" value={component.sillDetailHeightCm ?? ''} onChange={(event) => update(index, { sillDetailHeightCm: event.target.value })} placeholder="Medida em cm" /></label></div>}
      <MapaBordasComponente component={component} cutouts={cutouts.filter(cutout => cutout.componentIndex === index)} materialImage={selectedMaterial ? materialImageSrc(componentMaterialImage(selectedMaterial)) : materialImage} materialName={selectedMaterial?.name ?? materialName} services={linearServices} onChange={edges => update(index, { edges })} onAddComponent={!attached ? (type, isAttached) => onAdd(type, isAttached ? index : undefined, isAttached) : undefined}
        backsplashes={sideBacksplashes}
        onAddBacksplash={!attached ? side => onChange([...components, criarRodabancaLateral(component, side, globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)]) : undefined}
        onUpdateBacksplash={(id, patch) => update(components.findIndex(entry => entry.id === id), patch)}
        onRemoveBacksplash={id => onRemove(components.findIndex(entry => entry.id === id))}
        onEditBacksplash={id => setEditingBacksplash(current => current === id ? null : id)} />
      <div className="component-actions">
        <button type="button" onClick={() => onAddCutout?.(index)}>+ Adicionar recorte/cuba</button>
        <button type="button" disabled={!attached && roots.length === 1} onClick={() => onRemove(index)}>Remover</button>
      </div>
      {renderCutouts?.(index)}
      {visibleChildren.length > 0 && <div className="attached-components"><p>Peças adicionadas a este componente</p>{visibleChildren.map((child) => renderComponent(child, rootNumber, true))}</div>}
      </div>
    </details>;
  };
  return <section className="component-editor"><div className="quick-components"><button type="button" onClick={() => onAdd('TOP')}>+ Tampo</button><button type="button" onClick={() => onAdd('OTHER')}>+ Adicionar componente</button></div>{roots.map((component, index) => renderComponent(component, index + 1))}</section>;
}
