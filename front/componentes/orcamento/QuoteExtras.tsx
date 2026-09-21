import type { DraftComponent, DraftCutout, DraftItem } from './types';
import { servicoDeRecorte } from '../../utilitarios/service-groups';
import { TituloEtapaProjeto } from './ProjectStageHeading';

type Service = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number };
type Props = { mode?: 'all' | 'cutouts' | 'services' | 'unassigned'; componentIndex?: number; calculateCutout?: (cutout: DraftCutout) => number; cutouts: DraftCutout[]; components: DraftComponent[]; services: Service[]; serviceIds: string[]; serviceQuantities: DraftItem['serviceQuantities']; serviceAppliedValues: DraftItem['serviceAppliedValues']; onChange: (patch: Pick<DraftItem, 'cutouts' | 'serviceIds' | 'serviceQuantities' | 'serviceAppliedValues'>) => void };
const numeric = (value?: string) => Number((value ?? '').replace(',', '.')) || 0;
import { formatarMoeda } from '../../utilitarios/formatadores';
const unitLabel = (service: Service) => service.billingUnit === 'SQUARE_METER' ? 'por m²' : service.billingUnit === 'UNIT' ? 'por unidade' : 'valor fixo';

export function ComplementosOrcamento({ mode = 'all', componentIndex, calculateCutout, cutouts, components, services, serviceIds, serviceQuantities, serviceAppliedValues, onChange }: Props) {
  const cutoutCalculated = (cutout: DraftCutout) => {
    const service = services.find((entry) => entry.id === cutout.serviceId);
    if (!service) return 0;
    const quantity = service.billingUnit === 'SQUARE_METER' ? numeric(cutout.lengthCm) / 100 * (numeric(cutout.widthCm) / 100) * cutout.quantity : service.billingUnit === 'FIXED' ? 1 : cutout.quantity;
    return quantity > 0 ? quantity * service.currentPrice : 0;
  };
  const patchCutout = (index: number, patch: Partial<DraftCutout>) => onChange({ cutouts: cutouts.map((entry, current) => current === index ? { ...entry, ...patch } : entry), serviceIds, serviceQuantities, serviceAppliedValues });
  const changeType = (index: number, cutoutType: DraftCutout['cutoutType']) => {
    const current = cutouts[index];
    const patch: Partial<DraftCutout> = { cutoutType };
    if (cutoutType === 'SCULPTED_SINK') {
      const service = services.find(entry => entry.name.trim().toLocaleLowerCase('pt-BR') === 'cuba esculpida');
      if (service) { patch.serviceId = service.id; patch.appliedTotal = undefined; }
    }
    if (cutoutType === 'SCULPTED_SINK' && (!current.label.trim() || current.label === 'Recorte / cuba')) patch.label = 'Cuba esculpida';
    if (cutoutType !== 'SCULPTED_SINK' && current.label === 'Cuba esculpida') patch.label = 'Recorte / cuba';
    if (!['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutoutType)) patch.diameterCm = undefined;
    if (cutoutType === 'OVAL_SINK' || (current.cutoutType === 'OVAL_SINK' && cutoutType === 'SINK')) {
      const name = cutoutType === 'OVAL_SINK' ? 'Corte de cuba oval' : 'Recorte de cuba';
      const service = services.find(entry => entry.name.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
      if (service && service.id !== current.serviceId) { patch.serviceId = service.id; patch.appliedTotal = undefined; }
    }
    patchCutout(index, patch);
  };
  const addCutout = () => onChange({ cutouts: [...cutouts, { id: String(Date.now()), componentIndex: components.length ? 0 : undefined, cutoutType: 'SINK', label: 'Recorte / cuba', quantity: 1 }], serviceIds, serviceQuantities, serviceAppliedValues });
  const toggleService = (serviceId: string) => {
    const selected = serviceIds.includes(serviceId);
    const service = services.find((entry) => entry.id === serviceId);
    const nextQuantities = !selected && service?.billingUnit === 'UNIT' && !serviceQuantities[serviceId]
      ? { ...serviceQuantities, [serviceId]: '1' }
      : serviceQuantities;
    onChange({ cutouts, serviceIds: selected ? serviceIds.filter((id) => id !== serviceId) : [...serviceIds, serviceId], serviceQuantities: nextQuantities, serviceAppliedValues });
  };
  const cutoutServices = services.filter((service) => service.billingUnit !== 'LINEAR_METER' && servicoDeRecorte(service));
  const generalServices = services.filter((service) => service.billingUnit !== 'LINEAR_METER' && !servicoDeRecorte(service));
  // Older quotes can store a sink as a direct service. Keep it editable in its
  // proper section without converting its price snapshot or charging it twice.
  const existingCutoutServices = cutoutServices.filter((service) => serviceIds.includes(service.id));
  const generalCount = generalServices.filter((service) => serviceIds.includes(service.id)).length;
  const visibleCutouts = cutouts.map((cutout, index) => ({ cutout, index })).filter(({ cutout }) => componentIndex !== undefined ? cutout.componentIndex === componentIndex : mode === 'unassigned' ? cutout.componentIndex === undefined || !components[cutout.componentIndex] : true);
  const legacyServices = componentIndex === undefined ? existingCutoutServices : [];
  const cutoutCount = visibleCutouts.length + legacyServices.length;
  if ((componentIndex !== undefined || mode === 'unassigned') && !cutoutCount) return null;
  const renderService = (service: Service) => {
    const selected = serviceIds.includes(service.id);
    return <div className={'compact-option ' + (selected ? 'selected' : '')} key={service.id}>
      <button type="button" className="service-main" onClick={() => toggleService(service.id)}><span><strong>{service.name}</strong><small>{service.category} · {formatarMoeda(service.currentPrice)} · {unitLabel(service)}</small></span><b>{selected ? '✓' : '+'}</b></button>
      {selected && service.billingUnit === 'UNIT' && <input inputMode="decimal" aria-label={'Quantidade — ' + service.name} placeholder="Quantidade" value={serviceQuantities[service.id] ?? '1'} onChange={(event) => onChange({ cutouts, serviceIds, serviceQuantities: { ...serviceQuantities, [service.id]: event.target.value }, serviceAppliedValues })} />}
    </div>;
  };
  return <section className={componentIndex !== undefined ? 'component-cutouts' : 'section quote-extras'}>
    {mode === 'all' && <TituloEtapaProjeto number={4} title="Recortes, cubas e serviços" description="Configure os recortes e selecione os serviços que fazem parte do projeto." />}
    {mode !== 'services' && <>
    <details className="compact-menu cutouts-menu" open><summary>{mode === 'unassigned' ? 'Recortes sem peça vinculada / serviços anteriores' : 'Recortes e cubas'} {cutoutCount ? '(' + cutoutCount + ')' : ''}</summary><div className="compact-menu-content">
      {!cutoutCount && <p className="extras-empty">A peça precisa de cuba, cooktop ou furação? Adicione aqui. Se não precisar, pode continuar.</p>}
      {componentIndex === undefined && mode !== 'unassigned' && <button type="button" className="text-button" onClick={addCutout}>+ Adicionar recorte/cuba</button>}
      {legacyServices.map(renderService)}
      {visibleCutouts.map(({ cutout, index }) => {
        const calculated = calculateCutout ? calculateCutout(cutout) : cutoutCalculated(cutout);
        const selectedService = services.find((service) => service.id === cutout.serviceId);
        const choices = selectedService && !cutoutServices.some((service) => service.id === selectedService.id) ? [...cutoutServices, selectedService] : cutoutServices;
        return <div className="cutout-row" key={cutout.id}>
          <label>Tipo<select aria-label="Tipo de recorte ou cuba" value={cutout.cutoutType} onChange={(event) => changeType(index, event.target.value as DraftCutout['cutoutType'])}><option value="SINK">Cuba retangular</option><option value="SCULPTED_SINK">Cuba esculpida</option><option value="OVAL_SINK">Cuba oval</option><option value="COOKTOP">Cooktop</option><option value="FAUCET_HOLE">Furo de torneira redondo</option><option value="GENERIC_HOLE">Furo genérico</option><option value="OTHER">Outro</option></select></label>
          {componentIndex === undefined && <label>Peça<select aria-label="Componente do recorte ou cuba" value={cutout.componentIndex ?? ''} onChange={(event) => patchCutout(index, { componentIndex: event.target.value === '' ? undefined : Number(event.target.value) })}><option value="">Sem componente</option>{components.map((component, componentIndex) => <option key={component.id} value={componentIndex}>{component.label || 'Componente ' + (componentIndex + 1)}</option>)}</select></label>}
          <label>Serviço<select aria-label="Serviço de recorte ou cuba" value={cutout.serviceId ?? ''} onChange={(event) => patchCutout(index, { serviceId: event.target.value || undefined, appliedTotal: undefined })}><option value="">Sem cobrança de serviço</option>{choices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label>Descrição<input value={cutout.label} onChange={(event) => patchCutout(index, { label: event.target.value })} placeholder="Descrição" /></label>
          <label>Medidas<select aria-label="Definição das medidas do recorte" value={cutout.sizePending ? 'PENDING' : 'DEFINED'} onChange={event => patchCutout(index, { sizePending: event.target.value === 'PENDING', ...(event.target.value === 'PENDING' ? { lengthCm: undefined, widthCm: undefined, diameterCm: undefined } : {}) })}><option value="DEFINED">Informar medidas</option><option value="PENDING">A definir com o cliente</option></select></label>
          {!cutout.sizePending && !['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType) && <><label>Comprimento (cm)<input inputMode="decimal" value={cutout.lengthCm ?? ''} onChange={(event) => patchCutout(index, { lengthCm: event.target.value })} placeholder="Comprimento (cm)" /></label>
          <label>Largura (cm)<input inputMode="decimal" value={cutout.widthCm ?? ''} onChange={(event) => patchCutout(index, { widthCm: event.target.value })} placeholder="Largura (cm)" /></label></>}
          {!cutout.sizePending && ['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType) && <label>Diâmetro (cm)<input aria-label="Diâmetro do furo (cm)" inputMode="decimal" value={cutout.diameterCm ?? ''} onChange={(event) => patchCutout(index, { diameterCm: event.target.value })} placeholder="Diâmetro do furo (cm)" /></label>}
          <label>Quantidade<input aria-label="Quantidade de recortes ou furos" type="number" min="1" value={cutout.quantity} onChange={(event) => patchCutout(index, { quantity: Math.max(1, Number(event.target.value)) })} /></label>
          <details className="cutout-position"><summary>Posição {cutout.positionXCm || cutout.positionYCm ? 'personalizada' : 'centralizada'}</summary><div><label>Centro a partir do Esquerdo (cm)<input inputMode="decimal" value={cutout.positionXCm ?? ''} onChange={(event) => patchCutout(index, { positionXCm: event.target.value })} placeholder="Posição X (cm)" /></label>
          <label>Centro a partir do Superior (cm)<input inputMode="decimal" value={cutout.positionYCm ?? ''} onChange={(event) => patchCutout(index, { positionYCm: event.target.value })} placeholder="Posição Y (cm)" /></label></div></details>
          {cutout.serviceId && <><small>Valor calculado: {formatarMoeda(calculated)}</small><small>Valor final: {formatarMoeda(cutout.appliedTotal === undefined ? calculated : Number(cutout.appliedTotal.includes(',') ? cutout.appliedTotal.replace(/\./g, '').replace(',', '.') : cutout.appliedTotal) || 0)}</small></>}
          <button type="button" onClick={() => onChange({ cutouts: cutouts.filter((_, current) => current !== index), serviceIds, serviceQuantities, serviceAppliedValues })}>Remover</button>
        </div>;
      })}
    </div></details></>}
    {(mode === 'all' || mode === 'services') && <details className="compact-menu general-services-menu" open><summary>Cubas e serviços adicionais {generalCount ? '(' + generalCount + ')' : ''}</summary><div className="compact-menu-content">{generalServices.length ? generalServices.map(renderService) : <p className="extras-empty">Nenhum item adicional cadastrado.</p>}</div></details>}
  </section>;
}
