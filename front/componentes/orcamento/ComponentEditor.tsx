import { calcularComponente, centimetrosParaMilimetros, componentTypeLabels } from '@inova/domain';
import type { DraftComponent, DraftCutout } from './types';
import { MapaBordasComponente } from './ComponentEdgeMap';
import { DetalhePeitorilDuplo } from './SillDetail';
import { useState, type ReactNode } from 'react';
import { componentMaterialImage, materialImageSrc } from './ComponentMaterialPicker';
import { criarRodabancaLateral } from '../../utilitarios/component-groups';
import { SeletorTipoDescricao } from './TypeDescriptionSelector';

type Props = { materialFor?: (component: DraftComponent) => { id: string; name: string; images?: { url: string; isPrimary: boolean }[] } | undefined; renderCutouts?: (componentIndex: number) => ReactNode; components: DraftComponent[]; cutouts?: DraftCutout[]; materialImage?: string; materialName?: string; linearServices: { id: string; name: string }[]; onChange: (components: DraftComponent[]) => void; onAdd: (type: DraftComponent['componentType'], parentIndex?: number, attached?: boolean) => void; onRemove: (index: number) => void; onAddCutout?: (index: number) => void; onActiveMaterialChange?: (componentId: string) => void };
const area = (component: DraftComponent) => {
  try { return calcularComponente({ ...component, lengthMm: centimetrosParaMilimetros(component.lengthCm), widthMm: centimetrosParaMilimetros(component.widthCm) }).billableArea; } catch { return 0; }
};
/** Peitoril de duas pedras: a largura final é sempre a largura da peça
 * (definida no Orçamento Rápido) — nunca digitada de novo aqui. Escolhida a
 * sobreposição (1 ou 2 cm), a soma das duas pedras (largura + sobreposição)
 * é dividida ao meio e o nível de balanço desloca centímetros de uma pedra
 * para a outra sem mudar a soma nem a largura final. */
const larguraPeitorilPar = (finalWidthCm: string, overlapCm: string, deltaCm: number): { top: string; bottom: string } | undefined => {
  const final = Number(finalWidthCm.replace(',', '.'));
  const overlap = Number(overlapCm.replace(',', '.'));
  if (!Number.isFinite(final) || final <= 0 || !Number.isFinite(overlap) || overlap <= 0) return undefined;
  const metade = (final + overlap) / 2;
  const arredondar = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');
  return { top: arredondar(metade + deltaCm), bottom: arredondar(metade - deltaCm) };
};
/** Deriva o nível de balanço atual (cm que a pedra de cima tem a mais que a
 * metade) a partir das larguras já salvas, para o controle refletir o valor
 * certo ao reabrir um orçamento. */
const deltaPeitorilAtual = (topCm: string | undefined, bottomCm: string | undefined) => {
  const top = Number((topCm ?? '').replace(',', '.'));
  const bottom = Number((bottomCm ?? '').replace(',', '.'));
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
  return Math.round((top - bottom) / 2);
};
/** Maior deslocamento possível sem zerar nenhuma das duas pedras (deixa ao
 * menos 1 cm de cada lado). */
const limitePeitorilBalanco = (finalWidthCm: string, overlapCm: string) => {
  const final = Number(finalWidthCm.replace(',', '.'));
  const overlap = Number(overlapCm.replace(',', '.'));
  if (!Number.isFinite(final) || final <= 0 || !Number.isFinite(overlap) || overlap <= 0) return 0;
  return Math.max(0, Math.floor((final + overlap) / 2 - 1));
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
        <SeletorTipoDescricao component={component} descriptions={components.map((entry) => entry.label)} ariaLabel={`Tipo / descrição de ${component.label || componentTypeLabels[component.componentType]}`} showLabel onChange={(patch) => update(index, patch)} />
        <label>Comprimento (cm)<input inputMode="decimal" value={component.lengthCm} onChange={(event) => update(index, { lengthCm: event.target.value })} placeholder="Comprimento (cm)" /></label>
        <label>Largura / altura (cm)<input inputMode="decimal" value={component.widthCm} onChange={(event) => {
          const widthCm = event.target.value;
          if (component.componentType === 'SILL' && component.sillOverlapCm) {
            const delta = deltaPeitorilAtual(component.sillTopWidthCm, component.sillBottomWidthCm);
            const par = larguraPeitorilPar(widthCm, component.sillOverlapCm, delta);
            update(index, { widthCm, sillFinalWidthCm: widthCm, sillTopWidthCm: par?.top, sillBottomWidthCm: par?.bottom });
          } else update(index, { widthCm });
        }} placeholder="Largura/altura (cm)" /></label>
        <label className="component-quantity"><span>Qtd.</span><input aria-label="Quantidade de materiais" type="number" min="1" value={component.quantity} onChange={(event) => update(index, { quantity: Math.max(1, Number(event.target.value)) })} /></label>
      </div>
      {component.componentType === 'SILL' && (() => {
        const limite = component.sillOverlapCm ? limitePeitorilBalanco(component.widthCm, component.sillOverlapCm) : 0;
        const delta = deltaPeitorilAtual(component.sillTopWidthCm, component.sillBottomWidthCm);
        const escolherSobreposicao = (valor: string) => {
          const par = larguraPeitorilPar(component.widthCm, valor, deltaPeitorilAtual(component.sillTopWidthCm, component.sillBottomWidthCm));
          update(index, { sillOverlapCm: valor, sillFinalWidthCm: component.widthCm, sillTopWidthCm: par?.top, sillBottomWidthCm: par?.bottom });
        };
        const ajustarBalanco = (novoDelta: number) => {
          if (!component.sillOverlapCm) return;
          const par = larguraPeitorilPar(component.widthCm, component.sillOverlapCm, novoDelta);
          if (par) update(index, { sillTopWidthCm: par.top, sillBottomWidthCm: par.bottom });
        };
        return <div className="sill-detail-editor sill-detail-editor-duplo">
          <strong>Peitoril de duas pedras sobrepostas</strong>
          <small>A largura final é a largura da peça, acima{component.widthCm ? ` (${component.widthCm} cm)` : ''} — a mesma do Orçamento Rápido. Escolha a sobreposição; ajuste o nível se quiser tirar centímetros de uma pedra e passar para a outra.</small>
          <DetalhePeitorilDuplo topWidth={component.sillTopWidthCm} bottomWidth={component.sillBottomWidthCm} finalWidth={component.sillFinalWidthCm} overlap={component.sillOverlapCm} />
          <div className="sill-overlap-choice">
            <span>Sobreposição / encaixe</span>
            <div className="sill-overlap-buttons">
              {['1', '2'].map((valor) => <button key={valor} type="button" aria-pressed={component.sillOverlapCm === valor} onClick={() => escolherSobreposicao(valor)}>{valor} cm</button>)}
            </div>
            {!component.widthCm && <small>Informe a largura da peça, acima, para calcular as pedras.</small>}
          </div>
          {component.sillOverlapCm && limite > 0 && <div className="sill-balance">
            <span>Balanço entre as pedras</span>
            <div className="sill-balance-slider">
              <small>Pedra de cima: <strong>{component.sillTopWidthCm ?? '—'} cm</strong></small>
              <input type="range" aria-label="Balanço entre a pedra de cima e a de baixo" min={-limite} max={limite} step={1} value={-delta} onChange={(event) => ajustarBalanco(-Number(event.target.value))} />
              <small>Pedra de baixo: <strong>{component.sillBottomWidthCm ?? '—'} cm</strong></small>
            </div>
          </div>}
        </div>;
      })()}
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
