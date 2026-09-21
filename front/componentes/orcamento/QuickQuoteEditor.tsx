'use client';

import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { componentTypeLabels, rotuloLadoBorda, acabamentoBordaPedra } from '@inova/domain';
import type { DraftComponent, DraftCutout, DraftItem, EdgeSide } from './types';
import { SeletorMaterialComponente, type ComponentMaterial } from './ComponentMaterialPicker';
import { ComplementosOrcamento } from './QuoteExtras';
import { ValoresRecortes } from './CutoutValues';
import { removerGrupoComponentes } from '../../utilitarios/component-groups';
import { servicoDeRecorte } from '../../utilitarios/service-groups';
import { aplicarMaterialProjeto, centimetrosRascunhoParaMetros, metrosParaCentimetrosRascunho, criarComponenteRapido } from '../../utilitarios/quick-quote';

type Service = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number };
type Props = { item: DraftItem; materials: ComponentMaterial[]; material?: ComponentMaterial; services: Service[];
  onChange: (patch: Partial<DraftItem>) => void; area: (component: DraftComponent) => number;
  value: (component: DraftComponent) => number; calculateCutout: (cutout: DraftCutout) => number;
  onCreateService?: (input: { name: string; billingUnit: Service['billingUnit']; currentPrice: number }) => Promise<Service>;
};
import { formatarMoeda } from '../../utilitarios/formatadores';
const sides: Exclude<EdgeSide, 'CUSTOM'>[] = ['BACK', 'FRONT', 'LEFT', 'RIGHT'];

function MeterInput({ value, onChange, label, onKeyDown, id }: { value: string; onChange: (value: string) => void; label: string; onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void; id: string }) {
  const [text, setText] = useState(() => centimetrosRascunhoParaMetros(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(centimetrosRascunhoParaMetros(value)); }, [value]);
  return <input id={id} aria-label={label} inputMode="decimal" value={text} placeholder="0,00" onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(centimetrosRascunhoParaMetros(value)); }} onChange={event => { setText(event.target.value); onChange(metrosParaCentimetrosRascunho(event.target.value)); }} onKeyDown={onKeyDown} />;
}

export function EditorOrcamentoRapido({ item, materials, material, services, onChange, area, value, calculateCutout, onCreateService }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [serviceModalComponentId, setServiceModalComponentId] = useState<string | null>(null);
  const [projectModalCategory, setProjectModalCategory] = useState<'CUTOUTS' | 'OTHER' | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [serviceForm, setServiceForm] = useState({ name: '', billingUnit: 'SQUARE_METER' as Service['billingUnit'], currentPrice: '' });
  const [serviceError, setServiceError] = useState('');
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const linearServices = services.filter(service => service.billingUnit === 'LINEAR_METER');
  const miterServices = linearServices.filter(service => /45\s*(?:°|º|graus?)/i.test(service.name));
  const otherLinearServices = linearServices.filter(service => !miterServices.includes(service) && !/\bvista\b/i.test(service.name));
  const cutoutServices = services.filter(service => service.billingUnit !== 'LINEAR_METER' && servicoDeRecorte(service));
  const additionalServices = services.filter(service => service.billingUnit !== 'LINEAR_METER' && !servicoDeRecorte(service));
  const installationServices = additionalServices.filter(service => !/montagem/i.test(service.name));
  const assemblyService = additionalServices.find(service => /montagem/i.test(service.name));
  const linearGroups: Array<{ title: string; services: Service[] }> = [
    { title: 'Acabamento 45° · metro linear', services: miterServices },
    { title: 'Outros acabamentos · metro linear', services: otherLinearServices },
  ];
  useEffect(() => { if (focusRow) { document.getElementById(`quick-${focusRow}-length`)?.focus({ preventScroll: true }); setFocusRow(null); } }, [item.components, focusRow]);
  const update = (id: string, patch: Partial<DraftComponent>) => onChange({ components: item.components.map(component => component.id === id ? { ...component, ...patch,
    ...((patch.lengthCm !== undefined || patch.widthCm !== undefined) ? { edges: component.edges.map(edge => edge.side === 'CUSTOM' ? edge : { ...edge, lengthCm: undefined }) } : {}),
  } : component) });
  const add = () => { const component = criarComponenteRapido(item.materialId || item.components[0]?.materialId); onChange({ components: [...item.components, component] }); setFocusRow(component.id); };
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
    onChange({ ...patch, components: patch.components.length ? patch.components : [criarComponenteRapido(item.materialId)] });
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
  const opcaoServico = (service: Service) => <label key={service.id}><input type="checkbox" checked={item.serviceIds.includes(service.id)} onChange={event => toggleProjectService(service.id, event.target.checked)} />{service.name}</label>;
  const modalComponent = item.components.find(component => component.id === serviceModalComponentId);
  return <section className="section quick-quote" aria-label="Orçamento Rápido">
    <div className="quick-heading"><h2>Orçamento Rápido</h2><small>Medidas em metros · Enter avança e adiciona linhas · Tab e Shift + Tab navegam</small></div>
    <div className="quick-project-fields"><label>Nome do projeto<input id="project-name" value={item.projectName} onChange={event => onChange({ projectName: event.target.value })} placeholder="Ex.: Cozinha" /></label>
      <SeletorMaterialComponente materials={materials.filter(entry => entry.billingUnit === 'SQUARE_METER')} selected={material} onSelect={materialId => onChange(aplicarMaterialProjeto(item, materialId))} />
    </div>
    <div className="quick-table-scroll"><table className="quick-table"><thead><tr><th>Tipo / descrição</th><th>Comp. (m)</th><th>Larg. (m)</th><th>Qtd.</th><th>m²</th><th>Valor da peça</th><th>Ações</th></tr></thead><tbody>
      {item.components.map((component, index) => <Fragment key={component.id}>
        <tr data-quick-row={component.id}>
          <td><select aria-label={`Tipo da peça ${index + 1}`} value={component.componentType} onChange={event => { const componentType = event.target.value as DraftComponent['componentType']; update(component.id, { componentType, orientation: ['TOP', 'COUNTER', 'BASE', 'VISTA', 'SILL', 'THRESHOLD', 'STEP'].includes(componentType) ? 'HORIZONTAL' : 'VERTICAL' }); }}>{Object.entries(componentTypeLabels).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select>{component.parentComponentId && <small>↳ {item.components.find(parent => parent.id === component.parentComponentId)?.label || 'Peça principal'}{component.parentSide ? ` · ${rotuloLadoBorda(component.parentSide)}` : ''}</small>}</td>
          <td><MeterInput id={`quick-${component.id}-length`} label={`Comprimento da peça ${index + 1} (m)`} value={component.lengthCm} onChange={lengthCm => update(component.id, { lengthCm })} onKeyDown={event => enter(event, index, 'length')} /></td>
          <td><MeterInput id={`quick-${component.id}-width`} label={`Largura da peça ${index + 1} (m)`} value={component.widthCm} onChange={widthCm => update(component.id, { widthCm })} onKeyDown={event => enter(event, index, 'width')} /></td>
          <td><input id={`quick-${component.id}-quantity`} aria-label={`Quantidade da peça ${index + 1}`} type="number" min="1" step="1" value={component.quantity || ''} onChange={event => update(component.id, { quantity: Number(event.target.value) })} onKeyDown={event => enter(event, index, 'quantity')} /></td>
          <td className="quick-number">{area(component).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
          <td className="quick-number"><strong>{formatarMoeda(value(component))}</strong>{component.appliedTotal !== undefined && <small>Valor ajustado</small>}</td>
          <td><div className="quick-row-actions"><button type="button" aria-expanded={expanded === component.id} onClick={() => setExpanded(expanded === component.id ? null : component.id)}>Detalhar</button><button type="button" aria-label={`Remover peça ${index + 1}`} onClick={() => remove(index)}>×</button></div></td>
        </tr>
        {expanded === component.id && <tr><td colSpan={7}><div className="quick-services">
          <strong>Acabamentos e complementos por lado</strong>
          <div className="quick-sides">{sides.map(side => <div key={side}><b>{rotuloLadoBorda(side)}</b>
            {component.edges.map((edge, edgeIndex) => edge.side === side && <div className="quick-edge" key={edgeIndex}><span>{services.find(service => service.id === edge.serviceId)?.name || 'Acabamento'}</span>{acabamentoBordaPedra(services.find(service => service.id === edge.serviceId)?.name ?? '') && <label>Altura/largura (cm)<input aria-label={`Altura do acabamento ${edgeIndex + 1}`} inputMode="decimal" value={edge.heightCm ?? ''} onChange={event => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, heightCm: event.target.value } : entry) })} /></label>}<label>Repetições<input type="number" min="1" value={edge.quantity} onChange={event => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, quantity: Number(event.target.value) } : entry) })} /></label><label>Valor final (R$)<input inputMode="decimal" placeholder="Automático" value={edge.appliedTotal ?? ''} onChange={event => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, appliedTotal: event.target.value || undefined } : entry) })} /></label><button type="button" aria-label={`Remover acabamento ${edgeIndex + 1}`} onClick={() => update(component.id, { edges: component.edges.filter((_, i) => i !== edgeIndex) })}>×</button></div>)}
            <small>Selecione os lados no campo Acabamentos da peça.</small>
          </div>)}</div>
          <button type="button" onClick={() => onChange({ cutouts: [...item.cutouts, { id: crypto.randomUUID(), componentIndex: index, cutoutType: 'SINK', label: 'Recorte / cuba', quantity: 1, sizePending: true }] })}>+ Recorte / cuba / furo</button>
          <ComplementosOrcamento mode="cutouts" componentIndex={index} {...item} services={services} calculateCutout={calculateCutout} onChange={onChange} />
          <label className="quick-price">Valor final da peça (material + acabamentos)<input inputMode="decimal" value={component.appliedTotal ?? ''} placeholder={formatarMoeda(value(component))} onChange={event => update(component.id, { appliedTotal: event.target.value || undefined })} /></label><small>Recortes e serviços do projeto são somados separadamente no resumo.</small>
        </div></td></tr>}
      </Fragment>)}
    </tbody></table></div>
    {modalComponent && <div className="quick-services-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setServiceModalComponentId(null); }}><section className="quick-services-modal" role="dialog" aria-modal="true" aria-label={`Acabamentos de ${modalComponent.label || 'peça'}`}><header><div><strong>Acabamentos e serviços da peça</strong><small>{componentTypeLabels[modalComponent.componentType]} · escolha por categoria</small></div><button type="button" aria-label="Fechar acabamentos" onClick={() => setServiceModalComponentId(null)}>×</button></header>{linearGroups.map(group => group.services.length > 0 && <div className="quick-modal-category" key={group.title}><h3>{group.title}</h3><div className="quick-modal-service-list">{group.services.map(service => <fieldset key={service.id}><legend>{service.name}</legend><div className="quick-inline-sides"><label className="quick-all-sides"><input type="checkbox" checked={sides.every(side => modalComponent.edges.some(edge => edge.serviceId === service.id && edge.side === side))} onChange={event => setAllServiceSides(modalComponent, service.id, event.target.checked)} />Todos os lados</label>{sides.map(side => <label key={side}><input type="checkbox" checked={modalComponent.edges.some(edge => edge.serviceId === service.id && edge.side === side)} onChange={event => setServiceSide(modalComponent, service.id, side, event.target.checked)} />{rotuloLadoBorda(side)}</label>)}</div></fieldset>)}</div></div>)}<div className="quick-modal-category"><h3>Cortes e furos</h3><div className="quick-modal-simple-list">{cutoutServices.map(opcaoServico)}</div></div><div className="quick-modal-category"><h3>Outros serviços</h3><div className="quick-modal-simple-list">{installationServices.map(opcaoServico)}</div></div><footer><button type="button" className="secondary-button" onClick={() => setServiceModalComponentId(null)}>Concluir</button></footer></section></div>}
    <button type="button" className="secondary-button" onClick={add}>+ Adicionar item</button>
    <div className="quick-project-actions"><button type="button" onClick={() => item.components[0] && setServiceModalComponentId(item.components[0].id)}>+ Acabamentos</button><button type="button" onClick={() => setProjectModalCategory('CUTOUTS')}>+ Cortes e furos</button><button type="button" onClick={() => setProjectModalCategory('OTHER')}>+ Outros serviços</button></div>
    {assemblyService && <label className="quick-assembly-service"><span><input type="checkbox" checked={item.serviceIds.includes(assemblyService.id)} onChange={event => toggleProjectService(assemblyService.id, event.target.checked)} /> Montagem</span>{item.serviceIds.includes(assemblyService.id) && <input aria-label="Valor manual da montagem" inputMode="decimal" placeholder="Valor da montagem" value={item.serviceAppliedValues[assemblyService.id] ?? ''} onChange={event => onChange({ serviceAppliedValues: { ...item.serviceAppliedValues, [assemblyService.id]: event.target.value } })} />}</label>}
    {projectModalCategory && <div className="quick-services-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setProjectModalCategory(null); }}><section className="quick-services-modal" role="dialog" aria-modal="true" aria-label={projectModalCategory === 'CUTOUTS' ? 'Cortes e furos' : 'Outros serviços'}><header><div><strong>{projectModalCategory === 'CUTOUTS' ? 'Cortes e furos' : 'Outros serviços'}</strong><small>Selecione os itens que entram neste orçamento</small></div><button type="button" aria-label="Fechar serviços" onClick={() => setProjectModalCategory(null)}>×</button></header>{projectModalCategory === 'OTHER' && <button type="button" className="quick-modal-add" onClick={() => { setCreatingService(value => !value); setServiceError(''); }}>+ Novo serviço</button>}{projectModalCategory === 'OTHER' && creatingService && <form className="quick-new-service-form" onSubmit={createService}><label>Nome<input autoFocus value={serviceForm.name} onChange={event => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder="Ex.: Impermeabilização" required /></label><label>Unidade<select value={serviceForm.billingUnit} onChange={event => setServiceForm({ ...serviceForm, billingUnit: event.target.value as Service['billingUnit'] })}><option value="SQUARE_METER">m²</option><option value="LINEAR_METER">metro linear</option><option value="UNIT">unidade</option><option value="FIXED">valor fixo</option></select></label><label>Preço<input inputMode="decimal" value={serviceForm.currentPrice} onChange={event => setServiceForm({ ...serviceForm, currentPrice: event.target.value })} placeholder="0,00" required /></label>{serviceError && <p className="form-error">{serviceError}</p>}<button type="submit" className="primary-button">Criar e adicionar</button></form>}<div className="quick-modal-simple-list">{(projectModalCategory === 'CUTOUTS' ? cutoutServices : installationServices).map(service => <div className="quick-service-choice" key={service.id}><label><input type="checkbox" checked={item.serviceIds.includes(service.id)} onChange={event => toggleProjectService(service.id, event.target.checked)} />{service.name}</label>{item.serviceIds.includes(service.id) && service.billingUnit !== 'FIXED' && <input type="number" min="1" step="1" inputMode="numeric" aria-label={`Quantidade de ${service.name}`} value={item.serviceQuantities[service.id] ?? '1'} onChange={event => onChange({ serviceQuantities: { ...item.serviceQuantities, [service.id]: event.target.value } })} />}</div>)}</div><footer><button type="button" className="secondary-button" onClick={() => setProjectModalCategory(null)}>Concluir</button></footer></section></div>}
    {item.cutouts.length > 0 && <details className="quick-project-services"><summary>Valores dos recortes e cubas</summary><ValoresRecortes cutouts={item.cutouts} components={item.components} services={services} calculate={calculateCutout} onChange={cutouts => onChange({ cutouts })} /></details>}
  </section>;
}
