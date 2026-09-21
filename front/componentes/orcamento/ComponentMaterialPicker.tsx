import { useId, useState } from 'react';

export type ComponentMaterial = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number; images?: { url: string; isPrimary: boolean }[] };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const unit = { SQUARE_METER: 'm²', LINEAR_METER: 'm', UNIT: 'un', FIXED: 'fixo' };
export const componentMaterialImage = (material?: Pick<ComponentMaterial, 'images'>) => material?.images?.find(image => image.isPrimary)?.url ?? material?.images?.[0]?.url;
export const materialImageSrc = (url?: string) => !url ? undefined : url.startsWith('/api/') ? url : url.startsWith('/') ? `/api${url}` : url;

export function SeletorMaterialComponente({ materials, selected, onSelect }: { materials: ComponentMaterial[]; selected?: ComponentMaterial; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const labelId = useId();
  const selectionId = useId();
  const shown = materials.filter(material => material.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="component-material-field">
    <span className="component-material-label" id={labelId}>Material</span>
    <details className="material-picker component-material-picker">
    <summary className={`picker-summary${selected ? ' has-selection' : ''}`} aria-labelledby={`${labelId} ${selectionId}`}>
      {materialImageSrc(componentMaterialImage(selected)) && <img className="material-sample-image material-thumbnail" src={materialImageSrc(componentMaterialImage(selected))} alt="" />}
      <span className="material-selection-text" id={selectionId}>{selected?.name || 'Escolha a pedra desta peça'}</span>
      <svg className="material-picker-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </summary>
    <div className="material-picker-panel"><input aria-label="Buscar material" className="material-search-inline" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar material" />
      {shown.map(material => <button type="button" className={`material ${selected?.id === material.id ? 'selected' : ''}`} key={material.id} onClick={event => { onSelect(material.id); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
        {materialImageSrc(componentMaterialImage(material)) && <img className="stone material-sample-image material-thumbnail" src={materialImageSrc(componentMaterialImage(material))} alt="" />}<span className="material-name"><strong>{material.name}</strong><small>{material.category}</small></span><span className="material-price">{money.format(material.currentPrice)}<small>/{unit[material.billingUnit]}</small></span>
      </button>)}{!shown.length && <p className="customer-help">Nenhum material encontrado.</p>}
    </div>
  </details></div>;
}
