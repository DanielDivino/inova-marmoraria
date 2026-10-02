'use client';

import { CONSULTA_CELULAR } from '../../utilitarios/tela';

import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { componentTypeLabels, rotuloLadoBorda, acabamentoBordaPedra, tipoPresoAoLado } from '@inova/domain';
import type { DraftComponent, DraftCutout, DraftItem, EdgeSide } from './types';
import { SeletorMaterialComponente, componentMaterialImage, materialImageSrc, type ComponentMaterial } from './ComponentMaterialPicker';
import { Icone } from '../filtros/Filtros';
import { ValoresRecortes } from './CutoutValues';
import { moverComponente, pecasParaPrender, prenderNaPeca, removerGrupoComponentes } from '../../utilitarios/component-groups';
import { servicoDeRecorte } from '../../utilitarios/service-groups';
import { SeletorTipoDescricao } from './TypeDescriptionSelector';
import { aplicarMaterialProjeto, criarComponenteRapido, escolherPedraDaPeca } from '../../utilitarios/quick-quote';
import { CampoMetros } from './CampoMetros';
import { OpcoesPeitoril, peitorilComLargura } from './OpcoesPeitoril';

type Service = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number };
type Props = { item: DraftItem; materials: ComponentMaterial[]; material?: ComponentMaterial; services: Service[];
  title?: string; showAssembly?: boolean; showRounding?: boolean;
  /** M² fechado vale para este projeto (ajuste da empresa; aqui só é mostrado, travado). */
  m2Fechado?: boolean; renderComponentInfo?: (component: DraftComponent) => ReactNode;
  /** "Duplicar projeto": cria outro projeto no orçamento, cópia deste. */
  onDuplicate?: () => void;
  onChange: (patch: Partial<DraftItem>) => void; area: (component: DraftComponent) => number;
  value: (component: DraftComponent) => number; calculateCutout: (cutout: DraftCutout) => number;
  onCreateService?: (input: { name: string; billingUnit: Service['billingUnit']; currentPrice: number }) => Promise<Service>;
};
import { Janela } from '../Janela';
import { formatarMoeda } from '../../utilitarios/formatadores';
const sides: Exclude<EdgeSide, 'CUSTOM'>[] = ['BACK', 'FRONT', 'LEFT', 'RIGHT'];
const centimetros = (valor?: string) => { const numero = Number((valor ?? '').replace(',', '.')); return Number.isFinite(numero) ? numero : 0; };
/** Raio máximo dos cantos arredondados: metade do lado menor da peça (cm). */
const raioMaximo = (component: DraftComponent) => Math.min(centimetros(component.lengthCm), centimetros(component.widthCm)) / 2;
/** Raio sugerido ao arredondar: 10 cm, ou menos se a peça for estreita. */
const raioSugerido = (component: DraftComponent) => { const maximo = raioMaximo(component); return String(maximo > 0 ? Math.min(10, Math.floor(maximo * 10) / 10) : 10).replace('.', ','); };
const formatarCm = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
/** Campo do raio dos cantos arredondados, com o aviso quando passa da metade do lado menor. */
function CampoRaio({ component, onChange, rotulo }: { component: DraftComponent; onChange: (raioCantosCm: string) => void; rotulo: string }) {
  const maximo = raioMaximo(component), excede = maximo > 0 && centimetros(component.raioCantosCm) > maximo;
  return <>
    <label className="quick-acabamento-campo">Raio<input aria-label={rotulo} inputMode="decimal" aria-invalid={excede || undefined} value={component.raioCantosCm ?? ''} onChange={event => onChange(event.target.value)} />cm</label>
    {excede && <span className="quick-cantos-aviso" role="alert">Máx. {formatarCm(maximo)} cm</span>}
  </>;
}

/** Janela dos acabamentos, cortes e furos e outros serviços (a Janela padrão, com "Concluir" no rodapé). */
/**
 * Rodabanca, saia e vista (Tipo/descrição, cobradas pela área): em que peça e lado ficam. É por aqui
 * que elas vão para o lado certo no desenho técnico e na ordem de serviço.
 */
function PresaNaPeca({ item, component, numero, onChange }: { item: DraftItem; component: DraftComponent; numero: number; onChange: (patch: Pick<DraftItem, 'components' | 'cutouts'>) => void }) {
  const pecas = pecasParaPrender(item, component.id);
  const tipo = componentTypeLabels[component.componentType].toLocaleLowerCase('pt-BR');
  const nome = (peca: DraftComponent) => `Peça ${item.components.indexOf(peca) + 1} · ${peca.label.trim() || componentTypeLabels[peca.componentType]}`;
  const lado = component.parentSide ?? (component.componentType === 'BACKSPLASH' ? 'BACK' : 'FRONT');
  if (!pecas.length) return null;
  return <div className="quick-presa">
    <span aria-hidden="true">↳ Fica em</span>
    <select aria-label={`Peça onde fica a ${tipo} ${numero}`} value={component.parentComponentId ?? ''}
      onChange={(event) => onChange(prenderNaPeca(item, component.id, event.target.value ? { id: event.target.value, side: lado } : undefined))}>
      <option value="">Sem peça</option>
      {pecas.map((peca) => <option key={peca.id} value={peca.id}>{nome(peca)}</option>)}
    </select>
    {component.parentComponentId && <><span aria-hidden="true">lado</span><select aria-label={`Lado da ${tipo} ${numero}`} value={lado}
      onChange={(event) => onChange(prenderNaPeca(item, component.id, { id: component.parentComponentId!, side: event.target.value as typeof lado }))}>
      {sides.map((side) => <option key={side} value={side}>{rotuloLadoBorda(side)}</option>)}
    </select></>}
  </div>;
}

function DialogoServicos({ titulo, subtitulo, rotuloFechar, onClose, children }: { titulo: string; subtitulo: string; rotuloFechar: string; onClose: () => void; children: ReactNode }) {
  return <Janela aberta aoFechar={onClose} className="quick-services-modal" titulo={titulo} subtitulo={subtitulo} rotuloFechar={rotuloFechar}
    rodape={<button type="button" className="botao-principal" onClick={onClose}>Concluir</button>}>{children}</Janela>;
}

/** Alça para arrastar a peça (a partir de 2 peças). Só a alça inicia o arraste: rolar a lista no celular continua normal. */
type Alca = (desktop?: boolean) => ReactNode;
/** A peça vai para onde o dedo/mouse está (uma peça aberta é alta); sem ponteiro (teclado), a mais próxima. */
const destinoDaPeca: CollisionDetection = (args) => { const sob = pointerWithin(args); return sob.length ? sob : closestCenter(args); };
function GrupoPeca({ id, numero, ordenavel, recolhido, children }: { id: string; numero: number; ordenavel: boolean; recolhido: boolean; children: (alca: Alca) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !ordenavel });
  const alca: Alca = (desktop = false) => ordenavel ? <button type="button" className="quick-drag-handle" ref={desktop ? setActivatorNodeRef : undefined} {...attributes} {...listeners} aria-label={`Arrastar peça ${numero} para mudar a ordem`} title="Arrastar para mudar a ordem">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
  </button> : null;
  return <tbody ref={setNodeRef} className="quick-item-group" role="rowgroup" data-collapsed={recolhido} data-dragging={isDragging || undefined}
    style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}>{children(alca)}</tbody>;
}

export function EditorOrcamentoRapido({ item, materials, material, services, onChange, area, value, calculateCutout, onCreateService, title = 'Orçamento Rápido', showAssembly = true, showRounding = true, m2Fechado = false, renderComponentInfo, onDuplicate }: Props) {
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
  // Saia e vista não são acabamento: entram no Tipo/descrição, cobradas pela área como as outras peças.
  const otherLinearServices = linearServices.filter(service => !miterServices.includes(service) && !acabamentoBordaPedra(service.name));
  const cutoutServices = services.filter(service => service.billingUnit !== 'LINEAR_METER' && servicoDeRecorte(service));
  const additionalServices = services.filter(service => service.billingUnit !== 'LINEAR_METER' && !servicoDeRecorte(service));
  const installationServices = additionalServices.filter(service => !/montagem/i.test(service.name));
  const assemblyService = additionalServices.find(service => /montagem/i.test(service.name));
  const linearGroups: Array<{ title: string; services: Service[] }> = [
    { title: 'Acabamento 45° · metro linear', services: miterServices },
    { title: 'Outros acabamentos · metro linear', services: otherLinearServices },
  ];
  useEffect(() => { if (focusRow) { document.getElementById(`quick-${focusRow}-length`)?.focus({ preventScroll: !window.matchMedia(CONSULTA_CELULAR).matches }); setFocusRow(null); } }, [item.components, focusRow]);
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
  // Arrastar pela alça: mouse, toque (segurando) e teclado (Espaço, setas, Espaço).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordenavel = item.components.length > 1;
  const soltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const de = item.components.findIndex((component) => component.id === active.id);
    const para = item.components.findIndex((component) => component.id === over.id);
    if (de >= 0 && para >= 0) onChange(moverComponente(item, de, para));
  };
  // Símbolos da peça: pedra própria (miniatura), acabamento 45° e outros acabamentos.
  const marcasDaPeca = (component: DraftComponent) => {
    const pedra = component.materialProprio && component.materialId ? materials.find((entry) => entry.id === component.materialId) : undefined;
    const nomeServico = (id: string) => services.find((service) => service.id === id)?.name ?? 'Acabamento';
    const com45 = component.edges.filter((edge) => miterServices.some((service) => service.id === edge.serviceId));
    const outros = component.edges.filter((edge) => !com45.includes(edge));
    if (!pedra && !com45.length && !outros.length) return null;
    const imagem = pedra && materialImageSrc(componentMaterialImage(pedra));
    return <span className="quick-marcas">
      {pedra && <span className="quick-marca quick-marca-pedra" role="img" title={`Pedra própria: ${pedra.name}`} aria-label={`Pedra própria: ${pedra.name}`}>{imagem ? <img src={imagem} alt="" /> : <Icone nome="camadas" tamanho={12} />}</span>}
      {com45.length > 0 && <span className="quick-marca quick-marca-45" role="img" title={`Acabamento 45° (${com45.map((edge) => rotuloLadoBorda(edge.side)).join(', ')})`} aria-label="Acabamento 45°">45°</span>}
      {outros.length > 0 && <span className="quick-marca quick-marca-acabamento" role="img" title={[...new Set(outros.map((edge) => nomeServico(edge.serviceId)))].join(', ')} aria-label={`${outros.length} ${outros.length === 1 ? 'acabamento' : 'acabamentos'}`}><Icone nome="brilho" tamanho={11} />{outros.length}</span>}
    </span>;
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
      {((showRounding && m2Fechado) || onDuplicate) && <div className="quick-heading-acoes">
        {showRounding && m2Fechado && <label className="quick-round-toggle travado" title="Opção sempre ativa: o valor da pedra é calculado com cada peça arredondada para cima, em múltiplos de 5 cm (medidas exibidas, desenho e PDF mantêm os valores exatos). A desativação é feita em Materiais e serviços → Serviços."><input type="checkbox" checked disabled readOnly /> M² fechado</label>}
        {onDuplicate && <button type="button" className="quick-duplicar" onClick={onDuplicate} aria-haspopup="dialog" aria-label="Duplicar projeto" title="Cria outro projeto neste orçamento com a mesma pedra, peças, medidas, acabamentos e valores, para ajustar apenas o que for diferente."><Icone nome="copiar" tamanho={15} /><span className="quick-duplicar-texto">Duplicar projeto</span></button>}
      </div>}
    </div>
    <div className="quick-project-fields"><label>Nome do projeto<input id="project-name" value={item.projectName} onChange={event => onChange({ projectName: event.target.value })} placeholder="Ex.: Cozinha" /></label>
      <SeletorMaterialComponente materials={materials.filter(entry => entry.billingUnit === 'SQUARE_METER')} selected={material} onSelect={materialId => onChange(aplicarMaterialProjeto(item, materialId))} />
    </div>
    </div>
    <DndContext sensors={sensors} collisionDetection={destinoDaPeca} onDragEnd={soltar}><div className="quick-table-scroll"><table className="quick-table" role="table" aria-label="Peças do orçamento"><thead role="rowgroup"><tr role="row"><th scope="col">Tipo / descrição</th><th scope="col">Comp. (m)</th><th scope="col">Larg. (m)</th><th scope="col">Qtd.</th><th scope="col" className="quick-th-numero">m²</th><th scope="col" className="quick-th-numero">Valor</th><th scope="col">Ações</th></tr></thead>
      <SortableContext items={item.components.map((component) => component.id)} strategy={verticalListSortingStrategy}>
      {item.components.map((component, index) => <GrupoPeca key={component.id} id={component.id} numero={index + 1} ordenavel={ordenavel} recolhido={!mobileExpanded.has(component.id)}>{(alca) => <>
        <tr className="quick-mobile-summary-row" role="row"><td role="cell" colSpan={7}><div className="quick-mobile-card">
          {alca()}
          <button type="button" className="quick-mobile-card-title" aria-expanded={mobileExpanded.has(component.id)} aria-label={`${mobileExpanded.has(component.id) ? 'Recolher' : 'Expandir'} peça ${index + 1}: ${component.label.trim() || componentTypeLabels[component.componentType]}`} onClick={() => toggleMobileRow(component.id)}><span>{component.label.trim() || componentTypeLabels[component.componentType]}</span>{marcasDaPeca(component)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d={mobileExpanded.has(component.id) ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg></button>
          <strong className="quick-mobile-card-total">{formatarMoeda(value(component))}</strong>
          <div className="quick-mobile-card-actions">
            <button type="button" className="quick-options-button" aria-label={`Opções da peça ${index + 1}`} aria-expanded={expandedOptions.has(component.id)} aria-controls={`quick-options-${component.id}`} onClick={() => toggleOptions(component.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></svg><span>Opções</span></button>
            <button type="button" className="quick-mobile-card-remove" aria-label={`Remover peça ${index + 1}`} onClick={() => remove(index)}>×</button>
          </div>
        </div></td></tr>
        <tr data-quick-row={component.id} role="row">
          <td role="cell" className="quick-description">{alca(true)}<span className="quick-mobile-label">Peça {index + 1} · Tipo / descrição</span><button type="button" className="quick-collapse-toggle" aria-expanded={mobileExpanded.has(component.id)} aria-controls={`quick-fields-${component.id}`} onClick={() => toggleMobileRow(component.id)}><span>Peça {index + 1} · {component.label.trim() || componentTypeLabels[component.componentType]}</span><span aria-hidden="true">{mobileExpanded.has(component.id) ? '⌃' : '⌄'}</span></button><SeletorTipoDescricao component={component} descriptions={item.components.map((entry) => entry.label)} ariaLabel={`Tipo da peça ${index + 1}`} onChange={(patch) => update(component.id, patch)} />{!tipoPresoAoLado(component.componentType) && component.parentComponentId && <small>↳ {item.components.find(parent => parent.id === component.parentComponentId)?.label || 'Peça principal'}{component.parentSide ? ` · ${rotuloLadoBorda(component.parentSide)}` : ''}</small>}</td>
          <td role="cell"><label className="quick-mobile-label" htmlFor={`quick-${component.id}-length`}>Comprimento (m)</label><CampoMetros id={`quick-${component.id}-length`} label={`Comprimento da peça ${index + 1} (m)`} value={component.lengthCm} onChange={lengthCm => update(component.id, { lengthCm })} onKeyDown={event => enter(event, index, 'length')} /></td>
          <td role="cell"><label className="quick-mobile-label" htmlFor={`quick-${component.id}-width`}>Largura (m)</label><CampoMetros id={`quick-${component.id}-width`} label={`Largura da peça ${index + 1} (m)`} value={component.widthCm} onChange={widthCm => update(component.id, peitorilComLargura(component, widthCm))} onKeyDown={event => enter(event, index, 'width')} /></td>
          <td role="cell"><label className="quick-mobile-label" htmlFor={`quick-${component.id}-quantity`}>Quantidade</label><input id={`quick-${component.id}-quantity`} aria-label={`Quantidade da peça ${index + 1}`} inputMode="numeric" enterKeyHint="next" type="number" min="1" step="1" value={component.quantity || ''} onChange={event => update(component.id, { quantity: Number(event.target.value) })} onKeyDown={event => enter(event, index, 'quantity')} /></td>
          <td role="cell" className="quick-number quick-area"><span className="quick-mobile-label">Área (m²)</span><span>{area(component).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</span></td>
          <td role="cell" className="quick-number quick-item-total"><span className="quick-mobile-label">Valor</span><strong>{formatarMoeda(value(component))}</strong>{component.appliedTotal !== undefined && <small>Valor ajustado</small>}</td>
          <td role="cell" className="quick-actions"><div className="quick-row-actions"><button type="button" className="quick-options-button" aria-expanded={expandedOptions.has(component.id)} aria-controls={`quick-options-${component.id}`} onClick={() => toggleOptions(component.id)}>Opções</button><button type="button" aria-label={`Remover peça ${index + 1}`} onClick={() => remove(index)}>×</button>{marcasDaPeca(component)}</div></td>
        </tr>
        {tipoPresoAoLado(component.componentType) && pecasParaPrender(item, component.id).length > 0 && <tr className="quick-presa-row" role="row"><td role="cell" colSpan={7}><PresaNaPeca item={item} component={component} numero={index + 1} onChange={onChange} /></td></tr>}
        {renderComponentInfo && (() => { const info = renderComponentInfo(component); return info ? <tr className="quick-info-row" role="row"><td role="cell" colSpan={7}>{info}</td></tr> : null; })()}
        <tr className="quick-details-row" role="row" id={`quick-options-${component.id}`} hidden={!expandedOptions.has(component.id)}><td role="cell" colSpan={7}><div className="quick-services quick-piece-options">
          {/* Uma barra: pedra desta peça | acabamentos desta peça. A pedra do projeto (em cima) não muda aqui. */}
          <div className="quick-opcoes-barra">
            <div className="quick-opcoes-grupo quick-material-override">
              <span className="quick-opcoes-rotulo"><Icone nome="camadas" />Material desta peça</span>
              <div className="quick-material-controls"><SeletorMaterialComponente emJanela materials={materials.filter(entry => entry.billingUnit === 'SQUARE_METER')} selected={materials.find(entry => entry.id === (component.materialId || item.materialId))} onSelect={materialId => update(component.id, escolherPedraDaPeca(item, materialId))} />
              {component.materialProprio && <button type="button" className="text-button quick-use-project-material" title="Voltar a usar a pedra escolhida para o projeto" onClick={() => update(component.id, escolherPedraDaPeca(item, undefined))}>Usar pedra do projeto</button>}</div>
            </div>
            <i className="quick-opcoes-divisor" aria-hidden="true" />
            <div className="quick-opcoes-grupo">
              <span className="quick-opcoes-rotulo"><Icone nome="brilho" />Acabamentos desta peça</span>
              <button type="button" className="quick-add-acabamento" onClick={() => setServiceModalComponentId(component.id)}><Icone nome="mais" />Adicionar acabamento</button>
            </div>
          </div>
          {component.componentType === 'SILL' && <OpcoesPeitoril component={component} onChange={patch => update(component.id, patch)} />}
          <div className="quick-piece-finishes">
            {/* Um acabamento por linha: nome · lado · (altura, se saia/vista) · Qtd · ×. */}
            {component.edges.length > 0 || component.raioCantosCm !== undefined ? <ul className="quick-acabamentos">
              {component.raioCantosCm !== undefined && <li className="quick-acabamento">
                <span className="quick-acabamento-nome">Cantos arredondados</span>
                <span className="quick-acabamento-lado">4 pontas</span>
                <CampoRaio component={component} rotulo="Raio dos cantos arredondados" onChange={raioCantosCm => update(component.id, { raioCantosCm })} />
                <button type="button" className="quick-acabamento-remover" aria-label="Remover cantos arredondados" onClick={() => update(component.id, { raioCantosCm: undefined })}>×</button>
              </li>}
              {sides.flatMap(side => component.edges.map((edge, edgeIndex) => ({ edge, edgeIndex })).filter(({ edge }) => edge.side === side)).map(({ edge, edgeIndex }) => {
                const nome = services.find(service => service.id === edge.serviceId)?.name || 'Acabamento';
                const alterar = (patch: Partial<typeof edge>) => update(component.id, { edges: component.edges.map((entry, i) => i === edgeIndex ? { ...entry, ...patch } : entry) });
                return <li className="quick-acabamento" key={edgeIndex}>
                  <span className="quick-acabamento-nome" title={nome}>{nome}</span>
                  <span className="quick-acabamento-lado">{rotuloLadoBorda(edge.side)}</span>
                  {acabamentoBordaPedra(nome) && <label className="quick-acabamento-campo">Alt.<input aria-label={`Altura do acabamento ${edgeIndex + 1}`} inputMode="decimal" value={edge.heightCm ?? ''} onChange={event => alterar({ heightCm: event.target.value })} />cm</label>}
                  <label className="quick-acabamento-campo">Qtd<input type="number" min="1" aria-label={`Quantidade do acabamento ${edgeIndex + 1}`} value={edge.quantity} onChange={event => alterar({ quantity: Number(event.target.value) })} /></label>
                  {edge.appliedTotal !== undefined && <span className="quick-acabamento-ajuste" title="Valor deste acabamento ajustado à mão">R$ {edge.appliedTotal}<button type="button" aria-label={`Voltar ao valor automático do acabamento ${edgeIndex + 1}`} title="Voltar ao valor automático" onClick={() => alterar({ appliedTotal: undefined })}>↺</button></span>}
                  <button type="button" className="quick-acabamento-remover" aria-label={`Remover acabamento ${edgeIndex + 1}`} onClick={() => update(component.id, { edges: component.edges.filter((_, i) => i !== edgeIndex) })}>×</button>
                </li>;
              })}
            </ul> : null}
          </div>
        </div></td></tr>
      </>}</GrupoPeca>)}
      </SortableContext>
    </table></div></DndContext>
    {modalComponent && <DialogoServicos titulo="Acabamentos da peça" subtitulo={`${componentTypeLabels[modalComponent.componentType]} · escolha o acabamento e o lado`} rotuloFechar="Fechar acabamentos" onClose={() => setServiceModalComponentId(null)}>
      <div className="quick-modal-category"><h3>Cantos</h3><div className="quick-modal-service-list"><fieldset><legend>Cantos arredondados</legend><div className="quick-inline-sides quick-cantos">
        <label className="quick-all-sides"><input type="checkbox" checked={modalComponent.raioCantosCm !== undefined} onChange={event => update(modalComponent.id, { raioCantosCm: event.target.checked ? raioSugerido(modalComponent) : undefined })} />Arredondar as 4 pontas</label>
        {modalComponent.raioCantosCm !== undefined && <CampoRaio component={modalComponent} rotulo="Raio dos cantos" onChange={raioCantosCm => update(modalComponent.id, { raioCantosCm })} />}
      </div></fieldset></div></div>
      {linearGroups.map(group => group.services.length > 0 && <div className="quick-modal-category" key={group.title}><h3>{group.title}</h3><div className="quick-modal-service-list">{group.services.map(service => <fieldset key={service.id}><legend>{service.name}</legend><div className="quick-inline-sides"><label className="quick-all-sides"><input type="checkbox" checked={sides.every(side => modalComponent.edges.some(edge => edge.serviceId === service.id && edge.side === side))} onChange={event => setAllServiceSides(modalComponent, service.id, event.target.checked)} />Todos os lados</label>{sides.map(side => <label key={side}><input type="checkbox" checked={modalComponent.edges.some(edge => edge.serviceId === service.id && edge.side === side)} onChange={event => setServiceSide(modalComponent, service.id, side, event.target.checked)} />{rotuloLadoBorda(side)}</label>)}</div></fieldset>)}</div></div>)}{!linearGroups.some(group => group.services.length > 0) && <p className="empty">Nenhum acabamento cadastrado para seleção por lado.</p>}</DialogoServicos>}
    <button type="button" className="secondary-button quick-add-item" onClick={add}>+ Adicionar item</button>
    <div className="quick-project-actions"><button type="button" onClick={() => item.components[0] && setServiceModalComponentId(item.components[0].id)}>+ Acabamentos</button><button type="button" onClick={() => setProjectModalCategory('CUTOUTS')}>+ Cortes e furos</button><button type="button" onClick={() => setProjectModalCategory('OTHER')}>+ Outros serviços</button></div>
    {showAssembly && assemblyService && <label className="quick-assembly-service"><span><input type="checkbox" checked={item.serviceIds.includes(assemblyService.id)} onChange={event => toggleProjectService(assemblyService.id, event.target.checked)} /> Montagem</span>{item.serviceIds.includes(assemblyService.id) && <input aria-label="Valor manual da montagem" inputMode="decimal" placeholder="Valor da montagem" value={item.serviceAppliedValues[assemblyService.id] ?? ''} onChange={event => onChange({ serviceAppliedValues: { ...item.serviceAppliedValues, [assemblyService.id]: event.target.value } })} />}</label>}
    {projectModalCategory && <DialogoServicos titulo={projectModalCategory === 'CUTOUTS' ? 'Cortes e furos' : 'Outros serviços'} subtitulo="Selecione os itens que entram neste orçamento" rotuloFechar="Fechar serviços" onClose={() => setProjectModalCategory(null)}>{projectModalCategory === 'OTHER' && onCreateService && <button type="button" className="quick-modal-add" onClick={() => { setCreatingService(value => !value); setServiceError(''); }}>+ Novo serviço</button>}{projectModalCategory === 'OTHER' && onCreateService && creatingService && <form className="quick-new-service-form" onSubmit={createService}><label>Nome<input autoFocus value={serviceForm.name} onChange={event => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder="Ex.: Impermeabilização" required /></label><label>Unidade<select value={serviceForm.billingUnit} onChange={event => setServiceForm({ ...serviceForm, billingUnit: event.target.value as Service['billingUnit'] })}><option value="SQUARE_METER">m²</option><option value="LINEAR_METER">metro linear</option><option value="UNIT">unidade</option><option value="FIXED">valor fixo</option></select></label><label>Preço<input inputMode="decimal" value={serviceForm.currentPrice} onChange={event => setServiceForm({ ...serviceForm, currentPrice: event.target.value })} placeholder="0,00" required /></label>{serviceError && <p className="form-error">{serviceError}</p>}<button type="submit" className="primary-button">Criar e adicionar</button></form>}<div className="quick-modal-simple-list">{(projectModalCategory === 'CUTOUTS' ? cutoutServices : installationServices).map(service => <div className="quick-service-choice" key={service.id}><label><input type="checkbox" checked={item.serviceIds.includes(service.id)} onChange={event => toggleProjectService(service.id, event.target.checked)} />{service.name}</label>{item.serviceIds.includes(service.id) && service.billingUnit !== 'FIXED' && <input type="number" min="1" step="1" inputMode="numeric" aria-label={`Quantidade de ${service.name}`} value={item.serviceQuantities[service.id] ?? '1'} onChange={event => onChange({ serviceQuantities: { ...item.serviceQuantities, [service.id]: event.target.value } })} />}</div>)}</div></DialogoServicos>}
    {item.cutouts.length > 0 && <details className="quick-project-services"><summary>Valores dos recortes e cubas</summary><ValoresRecortes cutouts={item.cutouts} components={item.components} services={services} calculate={calculateCutout} onChange={cutouts => onChange({ cutouts })} /></details>}
  </section>;
}
