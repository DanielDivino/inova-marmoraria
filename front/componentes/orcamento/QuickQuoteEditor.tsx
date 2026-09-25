'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { componentTypeLabels, rotuloLadoBorda, acabamentoBordaPedra } from '@inova/domain';
import type { DraftComponent, DraftCutout, DraftItem, EdgeSide } from './types';
import { SeletorMaterialComponente, type ComponentMaterial } from './ComponentMaterialPicker';
import { ValoresRecortes } from './CutoutValues';
import { removerGrupoComponentes } from '../../utilitarios/component-groups';
import { servicoDeRecorte } from '../../utilitarios/service-groups';
import { SeletorTipoDescricao } from './TypeDescriptionSelector';
import { aplicarMaterialProjeto, centimetrosRascunhoParaMetros, metrosParaCentimetrosRascunho, criarComponenteRapido } from '../../utilitarios/quick-quote';

type Service = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number };
type Props = { item: DraftItem; materials: ComponentMaterial[]; material?: ComponentMaterial; services: Service[];
  title?: string; showAssembly?: boolean; showRounding?: boolean; renderComponentInfo?: (component: DraftComponent) => ReactNode;
  onChange: (patch: Partial<DraftItem>) => void; area: (component: DraftComponent) => number;
  value: (component: DraftComponent) => number; calculateCutout: (cutout: DraftCutout) => number;
  onCreateService?: (input: { name: string; billingUnit: Service['billingUnit']; currentPrice: number }) => Promise<Service>;
};
import { formatarMoeda } from '../../utilitarios/formatadores';
const sides: Exclude<EdgeSide, 'CUSTOM'>[] = ['BACK', 'FRONT', 'LEFT', 'RIGHT'];

function DialogoServicos({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="quick-services-modal" aria-label={label} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>{children}</dialog>;
}

function MeterInput({ value, onChange, label, onKeyDown, id }: { value: string; onChange: (value: string) => void; label: string; onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void; id: string }) {
  const [text, setText] = useState(() => centimetrosRascunhoParaMetros(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(centimetrosRascunhoParaMetros(value)); }, [value]);
  return <input id={id} aria-label={label} inputMode="decimal" enterKeyHint="next" value={text} placeholder="0,00" onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(centimetrosRascunhoParaMetros(value)); }} onChange={event => { setText(event.target.value); onChange(metrosParaCentimetrosRascunho(event.target.value)); }} onKeyDown={onKeyDown} />;
}

export function EditorOrcamentoRapido({ item, materials, material, services, onChange, area, value, calculateCutout, onCreateService, title = 'Orçamento Rápido', showAssembly = true, showRounding = true, renderComponentInfo }: Props) {
  const [mobileExpanded, setMobileExpanded] = useState<Set<string>>(() => new Set(item.components.slice(-1).map(component => component.id)));
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(() => new Set());
  const [serviceModalComponentId, setServiceModalComponentId] = useState<string | null>(null);
  const [projectModalCategory, setProjectModalCategory] = useState<'CUTOUTS' | 'OTHER' | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [serviceForm, setServiceForm] = useState({ name: '', billingUnit: 'SQUARE_METER' as Service['billingUnit'], currentPrice: '' });
  const [serviceError, setServiceError] = useState('');
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const linearServices = services.filter(service => service.billingUnit === 'LINEAR_METER');
  const miterServices = linearServices.filter(service => /45\s*(?:°|º|graus?)/i.test(service.name));
  const otherLinearServices = linearServices.filter(service => !miterServices.includes(service));
  const cutoutServices = services.filter(service => service.billingUnit !== 'LINEAR_METER' && servicoDeRecorte(service));
  const additionalServices = services.filter(service => service.billingUnit !== 'LINEAR_METER' && !servicoDeRecorte(service));
  const installationServices = additionalServices.filter(service => !/montagem/i.test(service.name));
  const assemblyService = additionalServices.find(service => /montagem/i.test(service.name));
  const linearGroups: Array<{ title: string; services: Service[] }> = [
    { title: 'Acabamento 45° · metro linear', services: miterServices },
    { title: 'Outros acabamentos · metro linear', services: otherLinearServices },
  ];
  useEffect(() => { if (focusRow) { document.getElementById(`quick-${focusRow}-length`)?.focus({ preventScroll: !window.matchMedia('(max-width: 760px)').matches }); setFocusRow(null); } }, [item.components, focusRow]);
  useEffect(() => { setMobileExpanded(new Set(item.components.slice(-1).map(component => component.id))); setExpandedOptions(new Set()); }, [item.id]);
  const update = (id: string, patch: Partial<DraftComponent>) => onChange({ components: item.components.map(component => component.id === id ? { ...component, ...patch,
    ...((patch.lengthCm !== undefined || patch.widthCm !== undefined) ? { edges: component.edges.map(edge => edge.side === 'CUSTOM' ? edge : { ...edge, lengthCm: undefined }) } : {}),
  } : component) });
  const add = () => { const component = criarComponenteRapido(item.materialId || item.components[0]?.materialId); setMobileExpanded(new Set([component.id])); setExpandedOptions(new Set()); onChange({ components: [...item.components, component] }); setFocusRow(component.id); };
  const toggleMobileRow = (id: string) => setMobileExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleOptions = (id: string) => setExpandedOptions(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const enter = (event: KeyboardEvent<HTMLInputElement>, index: number, field: 'length' | 'width' | 'quantity') => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const row = item.components[index];
    if (field !== 'quantity') document.getElementById(`quick-${row.id}-${field === 'length' ? 'width' : 'quantity'}`)?.focus();
    else if (item.components[index + 1]) document.getElementById(`quick-${item.components[index + 1].id}-length`)?.focus();
    else add();
  };
  const remove = (index: number) => {
    const row = item.components[index];
    const removedIds = new Set([row.id, ...item.components.filter(child => child.parentComponentId === row.id).map(child => child.id)]);
    const pruned = { ...item, cutouts: item.cutouts.filter(cut => cut.componentIndex === undefined || !removedIds.has(item.components[cut.componentIndex]?.id)) };
    const patch = removerGrupoComponentes(pruned, index);
    const remaining = patch.components.length ? patch.components : [criarComponenteRapido(item.materialId)];
    if (patch.components.length === 0) setMobileExpanded(new Set([remaining[0].id]));
    onChange({ ...patch, components: remaining });
  };
  const setServiceSide = (component: DraftComponent, serviceId: string, side: Exclude<EdgeSide, 'CUSTOM'>, checked: boolean) => {
    const edges = component.edges.filter(edge => !(edge.serviceId === serviceId && edge.side === side));
    onChange({ components: item.components.map(entry => entry.id === component.id ? { ...entry, edges: checked ? [...edges, { side, serviceId, quantity: 1 }] : edges } : entry) });
  };
  const setAllServiceSides = (component: DraftComponent, serviceId: string, checked: boolean) => {
    const edges = component.edges.filter(edge => edge.serviceId !== serviceId);
    onChange({ components: item.components.map(entry => entry.id === component.id ? { ...entry, edges: checked ? [...edges, ...sides.map(side => ({ side, serviceId, quantity: 1 }))] : edges } : entry) });
  };
  const toggleProjectService = (serviceId: string, checked: boolean) => onChange({ serviceIds: checked ? [...new Set([...item.serviceIds, serviceId])] : item.serviceIds.filter(id => id !== serviceId), serviceQuantities: checked ? { ...item.serviceQuantities, [serviceId]: item.serviceQuantities[serviceId] ?? '1' } : item.serviceQuantities });
  const createService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onCreateService) return;
    const price = Number(serviceForm.currentPrice.replace(',', '.'));
    if (!serviceForm.name.trim() || !Number.isFinite(price) || price < 0) { setServiceError('Informe nome e preço válidos.'); return; }
    setServiceError('');
    try {
      const created = await onCreateService({ name: serviceForm.name.trim(), billingUnit: serviceForm.billingUnit, currentPrice: price });
      toggleProjectService(created.id, true);
      setServiceForm({ name: '', billingUnit: 'SQUARE_METER', currentPrice: '' });
      setCreatingService(false);
    } catch (cause) { setServiceError(cause instanceof Error ? cause.message : 'Não foi possível criar o serviço.'); }
  };
  const modalComponent = item.components.find(component => component.id === serviceModalComponentId);
  return <section className="section quick-quote" aria-label={title}>
    <div className="quick-project-setup">
    <div className="quick-heading">
      <div><h2>{title}</h2><small><span className="quick-desktop-help">Medidas em metros · Enter avança e adiciona linhas · Tab e Shift + Tab navegam</span><span className="quick-mobile-help">Medidas em metros. Ex.: 1,20 × 0,60.</span></small></div>
      {showRounding && <label className="quick-round-toggle" title="Calcula o valor do material como se cada peça fosse arredondada para cima, ao múltiplo de 5 cm mais próximo (vender sempre m² fechado). A medida exibida, o desenho e o PDF continuam mostrando a medida exata."><input type="checkbox" checked={!!item.arredondarM2} onChange={event => { const enabled = event.target.checked; onChange({ arredondarM2: enabled, ...(enabled ? { components: item.components.map(component => ({ ...component, appliedTotal: undefined })) } : {}) }); }} /> M² fechado</label>}
    </div>
    <div className="quick-project-fields"><label>Nome do projeto<input id="project-name" value={item.projectName} onChange={event => onChange({ projectName: event.target.value })} placeholder="Ex.: Cozinha" /></label>
      <SeletorMaterialComponente materials={materials.filter(entry => entry.billingUnit === 'SQUARE_METER')} selected={material} onSelect={materialId => onChange(aplicarMaterialProjeto(item, materialId))} />
    </div>
    </div>
    <div className="quick-table-scroll"><table className="quick-table" role="table" aria-label="Peças do orçamento"><thead role="rowgroup"><tr role="row"><th scope="col">Tipo / descrição</th><th scope="col">Comp. (m)</th><th scope="col">Larg. (m)</th><th scope="col">Qtd.</th><th scope="col">m²</th><th scope="col">Valor da peça</th><th scope="col">Ações</th></tr></thead>
      {item.components.map((component, index) => <tbody className="quick-item-group" key={component.id} role="rowgroup" data-collapsed={!mobileExpanded.has(component.id)}>
        <tr className="quick-mobile-summary-row" role="row"><td role="cell" colSpan={7}><div className="quick-mobile-card">
          <button type="button" className="quick-mobile-card-title" aria-expanded={mobileExpanded.has(component.id)} aria-label={`${mobileExpanded.has(component.id) ? 'Recolher' : 'Expandir'} peça ${index + 1}: ${component.label.trim() || componentTypeLabels[component.componentType]}`} onClick={() => toggleMobileRow(component.id)}><span>{component.label.trim() || componentTypeLabels[component.componentType]}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={mobileExpanded.has(component.id) ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg></button>
          <strong className="quick-mobile-card-total">{formatarMoeda(value(component))}</strong>
          <div className="quick-mobile-card-actions">
            <button type="button" className="quick-options-button" aria-label={`Opções da peça ${index + 1}`} aria-expanded={expandedOptions.has(component.id)} aria-controls={`quick-options-${component.id}`} onClick={() => toggleOptions(component.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></svg><span>Opções</span></button>
            <button type="button" className="quick-mobile-card-remove" aria-label={`Remover peça ${index + 1}`} onClick={() => remove(index)}>×</button>
          </div>
        </div></td></tr>
        <tr data-quick-row={component.id} role="row">
          <td role="cell" className="quick-description"><span className="quick-mobile-label">Peça {index + 1} · Tipo / descrição</span><button type="button" className="quick-collapse-toggle" aria-expanded={mobileExpanded.has(component.id)} aria-controls={`quick-fields-${component.id}`} onClick={() => toggleMobileRow(component.id)}><span>Peça {index + 1} · {component.label.trim() || componentTypeLabels[component.componentType]}</span><span aria-hidden="true">{mobileExpanded.has(component.id) ? '⌃' : '⌄'}</span></button><SeletorTipoDescricao component={component} descriptions={item.components.map((entry) => entry.label)} ariaLabel={`Tipo da peça ${index + 1}`} onChange={(patch) => update(component.id, patch)} />{component.parentComponentId && <small>↳ {item.components.find(parent => parent.id === component.parentComponentId)?.label || 'Peça principal'}{component.parentSide ? ` · ${rotuloLadoBorda(component.parentSide)}` : ''}</small>}</td>
          <td role="cell"><label className="quick-mobile-label" htmlFor={`quick-${component.id}-length`}>Comprimento (m)</label><MeterInput id={`quick-${component.id}-length`} label={`Comprimento da peça ${index + 1} (m)`} value={component.lengthCm} onChange={lengthCm => update(component.id, { lengthCm })} onKeyDown={event => enter(event, index, 'length')} /></td>
          <td role="cell"><label className="quick-mobile-label" htmlFor={`quick-${component.id}-width`}>Largura (m)</label><MeterInput id={`quick-${component.id}-width`} label={`Largura da peça ${index + 1} (m)`} value={component.widthCm} onChange={widthCm => update(component.id, { widthCm })} onKeyDown={event => enter(event, index, 'width')} /></td>
          <td role="cell"><label className="quick-mobile-label" htmlFor={`quick-${component.id}-quantity`}>Quantidade</label><input id={`quick-${component.id}-quantity`} aria-label={`Quantidade da peça ${index + 1}`} inputMode="numeric" enterKeyHint="next" type="number" min="1" step="1" value={component.quantity || ''} onChange={event => update(component.id, { quantity: Number(event.target.value) })} onKeyDown={event => enter(event, index, 'quantity')} /></td>
          <td role="cell" className="quick-number quick-area"><span className="quick-mobile-label">Área (m²)</span><span>{area(component).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</span></td>
          <td role="cell" className="quick-number quick-item-total"><span className="quick-mobile-label">Valor da peça</span><strong>{formatarMoeda(value(component))}</strong>{component.appliedTotal !== undefined && <small>Valor ajustado</small>}</td>
          <td role="cell" className="quick-actions"><div className="quick-row-actions"><button type="button" className="quick-options-button" aria-expanded={expandedOptions.has(component.id)} aria-controls={`quick-options-${component.id}`} onClick={() => toggleOptions(component.id)}>Opções</button><button type="button" aria-label={`Remover peça ${index + 1}`} onClick={() => remove(index)}>×</button></div></td>
        </tr>
        {renderComponentInfo && <tr className="quick-info-row" role="row"><td role="cell" colSpan={7}>{renderComponentInfo(component)}</td></tr>}
        <tr className="quick-details-row" role="row" id={`quick-options-${component.id}`} hidden={!expandedOptions.has(component.id)}><td role="cell" colSpan={7}><div className="quick-services quick-piece-options">
          <div className="quick-material-override">
            <span>Material desta peça</span>
            <div className="quick-material-controls"><SeletorMaterialComponente materials={materials.filter(entry => entry.billingUnit === 'SQUARE_METER')} selected={materials.find(entry => entry.id === (component.materialId || item.materialId))} onSelect={materialId => update(component.id, { materialId })} />
            {component.materialId && component.materialId !== item.materialId && <button type="button" className="text-button quick-use-project-material" title="Usar o material definido no projeto" onClick={() => update(component.id, { materialId: undefined })}>Material do projeto</button>}</div>
          </div>
          <div className="quick-piece-finishes">
            <div className="quick-piece-finishes-heading"><strong>Acabamentos desta peça</strong><button type="button" className="text-button" onClick={() => setServiceModalComponentId(component.id)}>+ Adicionar acabamento</button></div>
            {component.edges.length > 0 ? <div className="quick-sides">
              {sides.filter(side => component.edges.some(edge => edge.side === side)).map(side => <div key={side}><b>{rotuloLadoBorda(side)}</b>
                {component.edges.map((edge, edgeIndex) => edge.side === side && <div className="quick-edge" key={edgeIndex}><span>{services.find(service => service.id === edge.serviceId)?.name || 'Acabamento'}</span>{acabamentoBordaPedra(services.find(service => service.id === edge.serviceId)?.name ?? '') && <label>Altura/largura (cm)<input aria-label={`Altura do acabamento ${edgeIndex + 1}`} inputMode="decimal" value={edge.heightCm ?? ''} onChange={event => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, heightCm: event.target.value } : entry) })} /></label>}<label>Repetições<input type="number" min="1" value={edge.quantity} onChange={event => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, quantity: Number(event.target.value) } : entry) })} /></label><label>Valor do acabamento (R$)<input inputMode="decimal" placeholder="Automático" value={edge.appliedTotal ?? ''} onChange={event => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, appliedTotal: event.target.value || undefined } : entry) })} /></label><button type="button" aria-label={`Remover acabamento ${edgeIndex + 1}`} onClick={() => update(component.id, { edges: component.edges.filter((_, i) => i !== edgeIndex) })}>×</button></div>)}
              </div>)}
            </div> : <small>Use “Adicionar acabamento” para escolher o acabamento e o lado desta peça.</small>}
          </div>
        </div></td></tr>
      </tbody>)}
    </table></div>
    {modalComponent && <DialogoServicos label={`Acabamentos de ${modalComponent.label || 'peça'}`} onClose={() => setServiceModalComponentId(null)}><header><div><strong>Acabamentos da peça</strong><small>{componentTypeLabels[modalComponent.componentType]} · escolha o acabamento e o lado</small></div><button type="button" aria-label="Fechar acabamentos" onClick={() => setServiceModalComponentId(null)}>×</button></header>{linearGroups.map(group => group.services.length > 0 && <div className="quick-modal-category" key={group.title}><h3>{group.title}</h3><div className="quick-modal-service-list">{group.services.map(service => <fieldset key={service.id}><legend>{service.name}</legend><div className="quick-inline-sides"><label className="quick-all-sides"><input type="checkbox" checked={sides.every(side => modalComponent.edges.some(edge => edge.serviceId === service.id && edge.side === side))} onChange={event => setAllServiceSides(modalComponent, service.id, event.target.checked)} />Todos os lados</label>{sides.map(side => <label key={side}><input type="checkbox" checked={modalComponent.edges.some(edge => edge.serviceId === service.id && edge.side === side)} onChange={event => setServiceSide(modalComponent, service.id, side, event.target.checked)} />{rotuloLadoBorda(side)}</label>)}</div></fieldset>)}</div></div>)}{!linearGroups.some(group => group.services.length > 0) && <p className="empty">Nenhum acabamento cadastrado para seleção por lado.</p>}<footer><button type="button" className="secondary-button" onClick={() => setServiceModalComponentId(null)}>Concluir</button></footer></DialogoServicos>}
    <button type="button" className="secondary-button quick-add-item" onClick={add}>+ Adicionar item</button>
    <div className="quick-project-actions"><button type="button" onClick={() => item.components[0] && setServiceModalComponentId(item.components[0].id)}>+ Acabamentos</button><button type="button" onClick={() => setProjectModalCategory('CUTOUTS')}>+ Cortes e furos</button><button type="button" onClick={() => setProjectModalCategory('OTHER')}>+ Outros serviços</button></div>
    {showAssembly && assemblyService && <label className="quick-assembly-service"><span><input type="checkbox" checked={item.serviceIds.includes(assemblyService.id)} onChange={event => toggleProjectService(assemblyService.id, event.target.checked)} /> Montagem</span>{item.serviceIds.includes(assemblyService.id) && <input aria-label="Valor manual da montagem" inputMode="decimal" placeholder="Valor da montagem" value={item.serviceAppliedValues[assemblyService.id] ?? ''} onChange={event => onChange({ serviceAppliedValues: { ...item.serviceAppliedValues, [assemblyService.id]: event.target.value } })} />}</label>}
    {projectModalCategory && <DialogoServicos label={projectModalCategory === 'CUTOUTS' ? 'Cortes e furos' : 'Outros serviços'} onClose={() => setProjectModalCategory(null)}><header><div><strong>{projectModalCategory === 'CUTOUTS' ? 'Cortes e furos' : 'Outros serviços'}</strong><small>Selecione os itens que entram neste orçamento</small></div><button type="button" aria-label="Fechar serviços" onClick={() => setProjectModalCategory(null)}>×</button></header>{projectModalCategory === 'OTHER' && onCreateService && <button type="button" className="quick-modal-add" onClick={() => { setCreatingService(value => !value); setServiceError(''); }}>+ Novo serviço</button>}{projectModalCategory === 'OTHER' && onCreateService && creatingService && <form className="quick-new-service-form" onSubmit={createService}><label>Nome<input autoFocus value={serviceForm.name} onChange={event => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder="Ex.: Impermeabilização" required /></label><label>Unidade<select value={serviceForm.billingUnit} onChange={event => setServiceForm({ ...serviceForm, billingUnit: event.target.value as Service['billingUnit'] })}><option value="SQUARE_METER">m²</option><option value="LINEAR_METER">metro linear</option><option value="UNIT">unidade</option><option value="FIXED">valor fixo</option></select></label><label>Preço<input inputMode="decimal" value={serviceForm.currentPrice} onChange={event => setServiceForm({ ...serviceForm, currentPrice: event.target.value })} placeholder="0,00" required /></label>{serviceError && <p className="form-error">{serviceError}</p>}<button type="submit" className="primary-button">Criar e adicionar</button></form>}<div className="quick-modal-simple-list">{(projectModalCategory === 'CUTOUTS' ? cutoutServices : installationServices).map(service => <div className="quick-service-choice" key={service.id}><label><input type="checkbox" checked={item.serviceIds.includes(service.id)} onChange={event => toggleProjectService(service.id, event.target.checked)} />{service.name}</label>{item.serviceIds.includes(service.id) && service.billingUnit !== 'FIXED' && <input type="number" min="1" step="1" inputMode="numeric" aria-label={`Quantidade de ${service.name}`} value={item.serviceQuantities[service.id] ?? '1'} onChange={event => onChange({ serviceQuantities: { ...item.serviceQuantities, [service.id]: event.target.value } })} />}</div>)}</div><footer><button type="button" className="secondary-button" onClick={() => setProjectModalCategory(null)}>Concluir</button></footer></DialogoServicos>}
    {item.cutouts.length > 0 && <details className="quick-project-services"><summary>Valores dos recortes e cubas</summary><ValoresRecortes cutouts={item.cutouts} components={item.components} services={services} calculate={calculateCutout} onChange={cutouts => onChange({ cutouts })} /></details>}
  </section>;
}
