import type { DraftComponent, DraftCutout } from './types';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const currency = (value: string) => Number(value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value) || 0;
type Props = {
  cutouts: DraftCutout[];
  components: DraftComponent[];
  services: { id: string; name: string }[];
  calculate: (cutout: DraftCutout) => number;
  onChange: (cutouts: DraftCutout[]) => void;
};

export function ValoresRecortes({ cutouts, components, services, calculate, onChange }: Props) {
  return <>{cutouts.map((cutout, index) => {
    const service = services.find((entry) => entry.id === cutout.serviceId);
    const calculated = calculate(cutout);
    const applied = cutout.appliedTotal === undefined ? calculated : currency(cutout.appliedTotal);
    const difference = calculated - applied;
    const component = cutout.componentIndex === undefined ? undefined : components[cutout.componentIndex];
    const update = (appliedTotal?: string) => onChange(cutouts.map((entry, current) => current === index ? { ...entry, appliedTotal } : entry));
    return <article className="quote-value-row cutout-value-row" key={cutout.id}>
      <div><strong>{service?.name ?? (cutout.label?.trim() || 'Recorte / cuba')}</strong>
        {service && cutout.label?.trim() && cutout.label !== service.name && cutout.label !== 'Recorte / cuba' && <small>{cutout.label}</small>}
        <small>Recortes e cubas · Quantidade: {cutout.quantity}{component ? ` · ${component.label || `Componente ${(cutout.componentIndex ?? 0) + 1}`}` : ''}</small>
        <small>Valor calculado: {money.format(calculated)}</small>
        {!cutout.serviceId && <small>Sem cobrança de serviço</small>}
        {cutout.appliedTotal !== undefined && Math.abs(difference) > 0.005 && <small className="manual-warning">⚠ Cálculo atualizado; valor manual aplicado.</small>}
      </div>
      <label><span>Valor final</span><input aria-label={`Valor final — ${service?.name ?? cutout.label ?? 'Recorte / cuba'} ${index + 1}`} inputMode="decimal" disabled={!cutout.serviceId} value={cutout.appliedTotal ?? calculated.toFixed(2).replace('.', ',')} onChange={(event) => update(event.target.value)} /></label>
      <div className="quote-value-discount">Desconto: <strong>{money.format(Math.max(0, difference))}</strong>{cutout.appliedTotal !== undefined && <button type="button" className="text-button" onClick={() => update()}>Restaurar cálculo</button>}</div>
    </article>;
  })}</>;
}
