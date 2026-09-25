import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './component-material-picker.css';

export type ComponentMaterial = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number; images?: { url: string; isPrimary: boolean }[] };
import { formatarMoeda } from '../../utilitarios/formatadores';
const unit = { SQUARE_METER: 'm²', LINEAR_METER: 'm', UNIT: 'un', FIXED: 'fixo' };
export const componentMaterialImage = (material?: Pick<ComponentMaterial, 'images'>) => material?.images?.find(image => image.isPrimary)?.url ?? material?.images?.[0]?.url;
export const materialImageSrc = (url?: string) => !url ? undefined : url.startsWith('/api/') ? url : url.startsWith('/') ? `/api${url}` : url;

export function SeletorMaterialComponente({ materials, selected, onSelect }: { materials: ComponentMaterial[]; selected?: ComponentMaterial; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const labelId = useId();
  const selectionId = useId();
  const shown = materials.filter(material => material.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  useEffect(() => { if (modalOpen) dialog.current?.showModal(); }, [modalOpen]);
  const selectMaterial = (id: string) => {
    onSelect(id);
    if (details.current) details.current.open = false;
    dialog.current?.close();
  };
  const choices = (inModal: boolean) => shown.map(material => <button type="button" className={`${inModal ? 'material-dialog-option' : 'material'}${selected?.id === material.id ? ' selected' : ''}`} aria-pressed={selected?.id === material.id} key={material.id} onClick={() => selectMaterial(material.id)}>
    {materialImageSrc(componentMaterialImage(material)) ? <img className="stone material-sample-image material-thumbnail" src={materialImageSrc(componentMaterialImage(material))} alt="" /> : inModal && <span className="material-dialog-placeholder" aria-hidden="true">◇</span>}
    <span className="material-name"><strong>{material.name}</strong><small>{material.category}</small></span><span className="material-price">{formatarMoeda(material.currentPrice)}<small>/{unit[material.billingUnit]}</small></span>
  </button>);
  return <><div className="component-material-field">
    <span className="component-material-label" id={labelId}>Material</span>
    <details ref={details} className="material-picker component-material-picker">
    <summary ref={trigger} className={`picker-summary${selected ? ' has-selection' : ''}`} aria-labelledby={`${labelId} ${selectionId}`} onClick={event => { if (window.matchMedia('(max-width: 760px)').matches) { event.preventDefault(); setSearch(''); setModalOpen(true); } }}>
      {materialImageSrc(componentMaterialImage(selected)) && <img className="material-sample-image material-thumbnail" src={materialImageSrc(componentMaterialImage(selected))} alt="" />}
      <span className="material-selection-text" id={selectionId}>{selected?.name || 'Escolher material'}</span>
      <svg className="material-picker-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </summary>
    {!modalOpen && <div className="material-picker-panel"><input aria-label="Buscar material" className="material-search-inline" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar material" />
      {choices(false)}{!shown.length && <p className="customer-help">Nenhum material encontrado.</p>}
    </div>}
  </details></div>
  {modalOpen && createPortal(<dialog ref={dialog} className="material-selection-dialog" aria-label="Escolher material" onClose={() => { setModalOpen(false); trigger.current?.focus({ preventScroll: true }); }}>
    <header><h2>Escolher material</h2><button type="button" aria-label="Fechar materiais" onClick={() => dialog.current?.close()}>×</button></header>
    <input autoFocus aria-label="Buscar material" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pedra pelo nome" />
    <div className="material-dialog-list">{choices(true)}{!shown.length && <p role="status">Nenhum material encontrado.</p>}</div>
  </dialog>, document.body)}</>;
}
