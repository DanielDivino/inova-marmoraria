'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, token } from '../../utilitarios/api';

type BillingUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';
type MaterialImage = { id: string; url: string; alt?: string | null; isPrimary: boolean };
type Material = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; isActive: boolean; images?: MaterialImage[] };
type Service = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; isActive: boolean };
type MaterialFilter = 'ALL' | 'WHITE' | 'BLACK' | 'GRANITE' | 'MARBLE' | 'ULTRACOMPACT';
type PhotoFilter = 'ALL' | 'WITH_IMAGE' | 'WITHOUT_IMAGE';
type PriceFilter = 'ALL' | 'WITH_PRICE' | 'WITHOUT_PRICE';

import { formatarMoeda } from '../../utilitarios/formatadores';
const unitLabel: Record<BillingUnit, string> = { SQUARE_METER: 'm²', LINEAR_METER: 'Metro linear', UNIT: 'Unidade', FIXED: 'Valor fixo' };
const empty = { name: '', category: '', billingUnit: 'SQUARE_METER' as BillingUnit, price: '', isActive: true };
const materialFilters: { id: MaterialFilter; label: string }[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'WHITE', label: 'Pedra branca' },
  { id: 'BLACK', label: 'Pedra preta' },
  { id: 'GRANITE', label: 'Granito' },
  { id: 'MARBLE', label: 'Mármore' },
  { id: 'ULTRACOMPACT', label: 'Ultracompacto' },
];

const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const imageSrc = (material: Material) => {
  const url = material.images?.find(image => image.isPrimary)?.url ?? material.images?.[0]?.url;
  return url ? `/api${url}` : '/stone-placeholder.svg';
};
const atendeFiltro = (material: Material, filter: MaterialFilter) => {
  const descricao = normalizar(`${material.name} ${material.category}`);
  if (filter === 'ALL') return true;
  if (filter === 'WHITE') return /branc|calacata|nanoglass|itauna|cristal|super prime/.test(descricao);
  if (filter === 'BLACK') return /pret|nero|marrom absoluto/.test(descricao);
  if (filter === 'GRANITE') return descricao.includes('granito');
  if (filter === 'MARBLE') return descricao.includes('marmore');
  return descricao.includes('ultracompacto');
};

export default function AdministrationPage() {
  const [tab, setTab] = useState<'materials' | 'services'>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('ALL');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('ALL');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoringId, setRestoringId] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const requestVersion = useRef(0);

  const load = async () => {
    const version = ++requestVersion.current;
    try {
      const [loadedMaterials, loadedServices] = await Promise.all([api<Material[]>('/catalog/materials?active=all'), api<Service[]>('/catalog/services')]);
      if (version === requestVersion.current) { setMaterials(loadedMaterials); setServices(loadedServices); }
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'Acesso administrativo não disponível.');
    }
  };

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => {
    const term = normalizar(search);
    if (tab === 'materials') return materials.filter((material) => {
      const hasImage = Boolean(material.images?.length);
      const hasPrice = Number(material.currentPrice) > 0;
      return material.isActive
        && atendeFiltro(material, materialFilter)
        && (photoFilter === 'ALL' || (photoFilter === 'WITH_IMAGE' ? hasImage : !hasImage))
        && (priceFilter === 'ALL' || (priceFilter === 'WITH_PRICE' ? hasPrice : !hasPrice))
        && normalizar(`${material.name} ${material.category}`).includes(term);
    });
    return services.filter(service => normalizar(`${service.name} ${service.category}`).includes(term));
  }, [materials, services, tab, materialFilter, photoFilter, priceFilter, search]);
  const archivedMaterials = useMemo(() => materials.filter((material) => !material.isActive), [materials]);
  const editingMaterial = useMemo(() => editing && tab === 'materials' ? materials.find((material) => material.id === editing) ?? null : null, [editing, materials, tab]);

  const closeForm = () => { setEditing(null); setForm(empty); };
  const changeTab = (nextTab: 'materials' | 'services') => { setTab(nextTab); setMaterialFilter('ALL'); setPhotoFilter('ALL'); setPriceFilter('ALL'); setArchiveOpen(false); closeForm(); };
  const edit = (row: Material | Service) => {
    setEditing(row.id);
    setForm({ name: row.name, category: row.category, billingUnit: row.billingUnit, price: String(row.currentPrice), isActive: row.isActive });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    const price = Number(form.price.replace(',', '.'));
    try {
      if (!Number.isFinite(price) || price < 0) throw new Error('Informe um preço válido.');
      if (tab === 'materials') {
        if (editing) {
          await api(`/catalog/materials/${editing}`, { method: 'PATCH', body: JSON.stringify({ name: form.name, category: form.category, billingUnit: form.billingUnit, isActive: form.isActive }) });
          await api(`/catalog/materials/${editing}/prices`, { method: 'POST', body: JSON.stringify({ amount: price }) });
        } else {
          await api('/catalog/materials', { method: 'POST', body: JSON.stringify({ ...form, unitPrice: price }) });
        }
      } else {
        const body = { name: form.name, category: form.category, billingUnit: form.billingUnit, currentPrice: price, isActive: form.isActive };
        if (editing) await api(`/catalog/services/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
        else await api('/catalog/services', { method: 'POST', body: JSON.stringify(body) });
      }
      await load();
      closeForm();
      setNotice(editing ? 'Material atualizado.' : 'Material cadastrado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    }
  }

  async function uploadImage(file: File) {
    if (!editing) return;
    setImageBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/catalog/materials/${editing}/images?replace=true`, { method: 'POST', headers: { authorization: `Bearer ${token() ?? ''}` }, body });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || 'Não foi possível enviar a foto.');
      await load();
      setNotice('Foto substituída.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a foto.');
    } finally {
      setImageBusy(false);
    }
  }

  async function restoreMaterial(material: Material) {
    setRestoringId(material.id);
    setError('');
    setNotice('');
    try {
      await api(`/catalog/materials/${material.id}`, { method: 'PATCH', body: JSON.stringify({ name: material.name, category: material.category, billingUnit: material.billingUnit, isActive: true }) });
      await load();
      setNotice(`${material.name} foi desarquivado.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desarquivar o material.');
    } finally {
      setRestoringId('');
    }
  }

  return <main className="list-page catalog-admin-page">
    <header className="list-header">
      <Link href="/">← Orçamento</Link>
      <div><span className="catalog-eyebrow">CATÁLOGO DA MARMORARIA</span><h1>Materiais e serviços</h1></div>
      <Link href="/orcamentos">Orçamentos</Link>
    </header>

    <div className="admin-tabs" role="tablist" aria-label="Catálogo">
      <button type="button" role="tab" aria-selected={tab === 'materials'} onClick={() => changeTab('materials')} className={tab === 'materials' ? 'selected' : ''}>Materiais</button>
      <button type="button" role="tab" aria-selected={tab === 'services'} onClick={() => changeTab('services')} className={tab === 'services' ? 'selected' : ''}>Serviços e acabamentos</button>
    </div>

    {tab === 'materials' && <div className="material-filter-bar" role="group" aria-label="Filtrar materiais">
      <span>Pedra</span>
      {materialFilters.map(filter => <button type="button" key={filter.id} aria-pressed={materialFilter === filter.id} className={materialFilter === filter.id ? 'selected' : ''} onClick={() => setMaterialFilter(filter.id)}>{filter.label}</button>)}
      <i className="material-filter-separator" aria-hidden="true" />
      <span>Foto</span>
      <button type="button" aria-pressed={photoFilter === 'ALL'} className={photoFilter === 'ALL' ? 'selected' : ''} onClick={() => setPhotoFilter('ALL')}>Todas</button>
      <button type="button" aria-pressed={photoFilter === 'WITH_IMAGE'} className={photoFilter === 'WITH_IMAGE' ? 'selected' : ''} onClick={() => setPhotoFilter('WITH_IMAGE')}>Com foto</button>
      <button type="button" aria-pressed={photoFilter === 'WITHOUT_IMAGE'} className={photoFilter === 'WITHOUT_IMAGE' ? 'selected' : ''} onClick={() => setPhotoFilter('WITHOUT_IMAGE')}>Sem foto</button>
      <i className="material-filter-separator" aria-hidden="true" />
      <span>Valor</span>
      <button type="button" aria-pressed={priceFilter === 'ALL'} className={priceFilter === 'ALL' ? 'selected' : ''} onClick={() => setPriceFilter('ALL')}>Todos</button>
      <button type="button" aria-pressed={priceFilter === 'WITH_PRICE'} className={priceFilter === 'WITH_PRICE' ? 'selected' : ''} onClick={() => setPriceFilter('WITH_PRICE')}>Com valor</button>
      <button type="button" aria-pressed={priceFilter === 'WITHOUT_PRICE'} className={priceFilter === 'WITHOUT_PRICE' ? 'selected' : ''} onClick={() => setPriceFilter('WITHOUT_PRICE')}>Sem valor</button>
    </div>}

    <div className="catalog-toolbar">
      <input className="search" placeholder={tab === 'materials' ? 'Buscar material...' : 'Buscar serviço...'} value={search} onChange={event => setSearch(event.target.value)} />
      {tab === 'materials' && <button className="secondary-button catalog-archive-button" type="button" onClick={() => setArchiveOpen(true)}>Arquivados <b>{archivedMaterials.length}</b></button>}
      <button className="primary-button" type="button" onClick={() => { setForm(empty); setEditing(''); }}>+ Criar novo {tab === 'materials' ? 'material' : 'serviço'}</button>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}

    {tab === 'materials' ? <div className="material-admin-grid">
      {(rows as Material[]).map(material => <article className="material-admin-card" key={material.id}>
        <img className="material-sample-image" src={imageSrc(material)} alt={material.name} />
        <div className="material-admin-copy"><strong>{material.name}</strong><small>{material.category} · {unitLabel[material.billingUnit]}</small><b>{formatarMoeda(material.currentPrice)} / {material.billingUnit === 'SQUARE_METER' ? 'm²' : unitLabel[material.billingUnit]}</b><button className="text-button" type="button" onClick={() => edit(material)}>Editar material</button></div>
      </article>)}
      {!rows.length && <p className="catalog-empty">Nenhum material encontrado para este filtro.</p>}
    </div> : <div className="admin-rows">
      {(rows as Service[]).map(service => <article key={service.id}><div><strong>{service.name}</strong><small>{service.category} · {unitLabel[service.billingUnit]} · {service.isActive ? 'Ativo' : 'Inativo'}</small></div><b>{formatarMoeda(service.currentPrice)}</b><button className="text-button" type="button" onClick={() => edit(service)}>Editar</button></article>)}
      {!rows.length && <p className="catalog-empty">Nenhum serviço encontrado.</p>}
    </div>}

    {editing !== null && <div className="catalog-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeForm(); }}>
      <section className="catalog-modal" role="dialog" aria-modal="true" aria-label={tab === 'materials' ? 'Editar material' : 'Editar serviço'}>
        <header><div><span className="catalog-eyebrow">{editing ? 'EDITAR' : 'NOVO CADASTRO'}</span><h2>{tab === 'materials' ? 'Material' : 'Serviço'}</h2></div><button type="button" aria-label="Fechar" onClick={closeForm}>×</button></header>
        <form className="admin-form" onSubmit={submit}>
          <label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Categoria<input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} required /></label>
          <label>Unidade<select value={form.billingUnit} onChange={event => setForm({ ...form, billingUnit: event.target.value as BillingUnit })}>{Object.entries(unitLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Preço<input inputMode="decimal" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} required /></label>
          <label className="active-toggle"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Ativo</label>
          <button className="primary-button">{editing ? 'Salvar alterações' : 'Criar cadastro'}</button>
        </form>
        {tab === 'materials' && editing && <div className="material-photo-upload"><div className="material-photo-upload-header"><div><strong>Foto da pedra</strong><small>{editingMaterial?.images?.length ? 'Escolha outra imagem para substituir a foto exibida no catálogo e no mostruário.' : 'Adicione uma imagem para aparecer no catálogo e no mostruário.'}</small></div>{editingMaterial?.images?.length ? <img className="material-photo-preview material-sample-image" src={imageSrc(editingMaterial)} alt={`Foto atual de ${editingMaterial.name}`} /> : null}</div><label className="photo-upload-button">{imageBusy ? 'Enviando…' : editingMaterial?.images?.length ? 'Trocar foto' : '+ Adicionar foto'}<input type="file" accept="image/*" disabled={imageBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ''; }} /></label></div>}
      </section>
    </div>}
    {archiveOpen && <div className="catalog-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setArchiveOpen(false); }}>
      <section className="catalog-modal catalog-archive-modal" role="dialog" aria-modal="true" aria-label="Materiais arquivados">
        <header><div><span className="catalog-eyebrow">CATÁLOGO</span><h2>Arquivados</h2></div><button type="button" aria-label="Fechar" onClick={() => setArchiveOpen(false)}>×</button></header>
        <p className="catalog-archive-help">Materiais inativos não aparecem em orçamentos nem no mostruário.</p>
        <div className="catalog-archive-list">
          {archivedMaterials.map((material) => <article key={material.id}><img className="material-sample-image" src={imageSrc(material)} alt="" /><div><strong>{material.name}</strong><small>{material.category} · {formatarMoeda(material.currentPrice)} / {material.billingUnit === 'SQUARE_METER' ? 'm²' : unitLabel[material.billingUnit]}</small></div><button type="button" className="secondary-button" disabled={restoringId === material.id} onClick={() => void restoreMaterial(material)}>{restoringId === material.id ? 'Desarquivando…' : 'Desarquivar'}</button></article>)}
          {!archivedMaterials.length && <p className="catalog-empty">Nenhum material arquivado.</p>}
        </div>
      </section>
    </div>}
  </main>;
}
