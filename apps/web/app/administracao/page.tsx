'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, token } from '../../utilitarios/api';

type BillingUnit = 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED';
type MaterialImage = { id: string; url: string; alt?: string | null; isPrimary: boolean };
type Material = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; isActive: boolean; images?: MaterialImage[] };
type Service = { id: string; name: string; category: string; billingUnit: BillingUnit; currentPrice: number; isActive: boolean };
type MaterialFilter = 'ALL' | 'WHITE' | 'BLACK' | 'GRANITE' | 'MARBLE' | 'ULTRACOMPACT';
type PhotoFilter = 'ALL' | 'WITH_IMAGE' | 'WITHOUT_IMAGE';
type PriceFilter = 'ALL' | 'WITH_PRICE' | 'WITHOUT_PRICE';

import { AbasFiltro, AtalhosCabecalho, Icone, ModalFiltros, useCelular } from '../../componentes/filtros/Filtros';
import { Janela } from '../../componentes/Janela';
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

const temFoto = (material: Material) => Boolean(material.images?.length);
const temValor = (material: Material) => Number(material.currentPrice) > 0;
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
  /** M² fechado da empresa: sempre marcado nos orçamentos, só se desliga aqui. */
  const [m2Fechado, setM2Fechado] = useState<boolean | null>(null);
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);
  const requestVersion = useRef(0);

  async function alternarM2Fechado(ligado: boolean) {
    setSalvandoAjuste(true); setError(''); setNotice('');
    try {
      const salvo = await api<{ closedSquareMeter: boolean }>('/catalog/settings', { method: 'PATCH', body: JSON.stringify({ closedSquareMeter: ligado }) });
      setM2Fechado(salvo.closedSquareMeter);
      setNotice(salvo.closedSquareMeter ? 'M² fechado ativado: os novos orçamentos arredondam as peças em múltiplos de 5 cm.' : 'M² fechado desativado: os novos orçamentos utilizam as medidas exatas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o M² fechado.'); }
    finally { setSalvandoAjuste(false); }
  }
  const load = async () => {
    const version = ++requestVersion.current;
    try {
      const [loadedMaterials, loadedServices, ajustes] = await Promise.all([api<Material[]>('/catalog/materials?active=all'), api<Service[]>('/catalog/services'), api<{ closedSquareMeter: boolean }>('/catalog/settings')]);
      if (version === requestVersion.current) { setMaterials(loadedMaterials); setServices(loadedServices); setM2Fechado(ajustes.closedSquareMeter); }
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'Acesso administrativo não disponível.');
    }
  };

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => {
    const term = normalizar(search);
    if (tab === 'materials') return materials.filter((material) => {
      return material.isActive
        && atendeFiltro(material, materialFilter)
        && (photoFilter === 'ALL' || (photoFilter === 'WITH_IMAGE') === temFoto(material))
        && (priceFilter === 'ALL' || (priceFilter === 'WITH_PRICE') === temValor(material))
        && normalizar(`${material.name} ${material.category}`).includes(term);
    });
    return services.filter(service => normalizar(`${service.name} ${service.category}`).includes(term));
  }, [materials, services, tab, materialFilter, photoFilter, priceFilter, search]);
  const archivedMaterials = useMemo(() => materials.filter((material) => !material.isActive), [materials]);
  const ativos = useMemo(() => materials.filter((material) => material.isActive), [materials]);
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

  // Pedra, foto e valor ficam em "Mais filtros" (no celular, numa janela).
  const [maisFiltros, setMaisFiltros] = useState(false);
  const celular = useCelular();
  const filtrosAtivos = [materialFilter !== 'ALL', photoFilter !== 'ALL', priceFilter !== 'ALL'].filter(Boolean).length;
  const limparFiltros = () => { setSearch(''); setMaterialFilter('ALL'); setPhotoFilter('ALL'); setPriceFilter('ALL'); };
  const abasMaterial = <>
    <AbasFiltro variante="grade" rotulo="Filtrar por pedra" valor={materialFilter} aoEscolher={setMaterialFilter} grupos={[{ titulo: 'Pedra', opcoes: materialFilters.map((filter) => ({ valor: filter.id, rotulo: filter.label, icone: filter.id === 'ALL' ? 'todos' : 'pedra', total: ativos.filter((material) => atendeFiltro(material, filter.id)).length })) }]} />
    <AbasFiltro variante="grade" rotulo="Filtrar por foto" valor={photoFilter} aoEscolher={setPhotoFilter} grupos={[{ titulo: 'Foto', opcoes: [
      { valor: 'ALL', rotulo: 'Todas', icone: 'todos', total: ativos.length },
      { valor: 'WITH_IMAGE', rotulo: 'Com foto', icone: 'foto', total: ativos.filter(temFoto).length },
      { valor: 'WITHOUT_IMAGE', rotulo: 'Sem foto', icone: 'inativo', total: ativos.filter((material) => !temFoto(material)).length },
    ] }]} />
    <AbasFiltro variante="grade" rotulo="Filtrar por valor" valor={priceFilter} aoEscolher={setPriceFilter} grupos={[{ titulo: 'Valor', opcoes: [
      { valor: 'ALL', rotulo: 'Todos', icone: 'todos', total: ativos.length },
      { valor: 'WITH_PRICE', rotulo: 'Com valor', icone: 'valor', total: ativos.filter(temValor).length },
      { valor: 'WITHOUT_PRICE', rotulo: 'Sem valor', icone: 'inativo', total: ativos.filter((material) => !temValor(material)).length },
    ] }]} />
  </>;
  return <main className="list-page catalog-admin-page">
    <header className="list-header">
      <div className="titulo-no-topo"><span className="catalog-eyebrow">CATÁLOGO DA MARMORARIA</span><h1>Materiais e serviços</h1></div>
      <AtalhosCabecalho />
    </header>

    <div className="admin-tabs" role="tablist" aria-label="Catálogo">
      <button type="button" role="tab" aria-selected={tab === 'materials'} onClick={() => changeTab('materials')} className={tab === 'materials' ? 'selected' : ''}>Materiais</button>
      <button type="button" role="tab" aria-selected={tab === 'services'} onClick={() => changeTab('services')} className={tab === 'services' ? 'selected' : ''}>Serviços e acabamentos</button>
    </div>

    <div className="barra-lista">
      {tab === 'materials' && <button className="botao-contorno catalog-archive-button" type="button" onClick={() => setArchiveOpen(true)}>Arquivados <b>{archivedMaterials.length}</b></button>}
      <button className="botao-destaque" type="button" onClick={() => { setForm(empty); setEditing(''); }}><Icone nome="mais" />Criar novo {tab === 'materials' ? 'material' : 'serviço'}</button>
    </div>

    <form className="barra-filtros" role="search" aria-label="Buscar no catálogo" onSubmit={(event) => event.preventDefault()}>
      <label className="barra-filtros-busca"><Icone nome="buscar" tamanho={20} /><input type="search" aria-label={tab === 'materials' ? 'Buscar material' : 'Buscar serviço'} placeholder={tab === 'materials' ? 'Nome ou categoria do material' : 'Nome ou categoria do serviço'} value={search} onChange={event => setSearch(event.target.value)} /></label>
      {tab === 'materials' && <button type="button" className="botao-contorno" aria-expanded={maisFiltros} onClick={() => setMaisFiltros((aberto) => !aberto)}><Icone nome="filtro" />{celular ? 'Filtros' : 'Mais filtros'}{filtrosAtivos ? <b>{filtrosAtivos}</b> : null}</button>}
      <i className="barra-filtros-separador" aria-hidden="true" />
      <button type="button" className="botao-contorno" disabled={!search && !filtrosAtivos} onClick={limparFiltros}><Icone nome="limpar" />Limpar</button>
      {tab === 'materials' && !celular && maisFiltros && <div className="barra-filtros-mais">{abasMaterial}</div>}
    </form>
    {tab === 'materials' && celular && <ModalFiltros aberto={maisFiltros} aoFechar={() => setMaisFiltros(false)} titulo="Filtros de materiais"
      rodape={<><button type="button" className="botao-contorno" disabled={!filtrosAtivos} onClick={limparFiltros}><Icone nome="limpar" />Limpar</button><button type="button" className="botao-destaque" onClick={() => setMaisFiltros(false)}>Ver resultados</button></>}>
      {abasMaterial}
    </ModalFiltros>}

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}

    {tab === 'materials' ? <div className="material-admin-grid">
      {(rows as Material[]).map(material => <article className="material-admin-card" key={material.id}>
        <img className="material-sample-image" src={imageSrc(material)} alt={material.name} />
        <div className="material-admin-copy"><strong>{material.name}</strong><small>{material.category} · {unitLabel[material.billingUnit]}</small><b>{formatarMoeda(material.currentPrice)} / {material.billingUnit === 'SQUARE_METER' ? 'm²' : unitLabel[material.billingUnit]}</b><button className="text-button" type="button" onClick={() => edit(material)}>Editar material</button></div>
      </article>)}
      {!rows.length && <p className="catalog-empty">Nenhum material encontrado para este filtro.</p>}
    </div> : <><section className="catalog-ajuste" aria-label="M² fechado">
      <div><strong>M² fechado</strong><small>O valor da pedra é calculado com cada peça arredondada para cima, em múltiplos de 5 cm; medidas, desenhos e PDF mantêm os valores exatos. A opção permanece ativa em todos os orçamentos e somente pode ser desativada nesta tela.</small></div>
      <label className="catalog-ajuste-chave"><input type="checkbox" role="switch" aria-label="M² fechado nos orçamentos" checked={!!m2Fechado} disabled={m2Fechado === null || salvandoAjuste} onChange={event => void alternarM2Fechado(event.target.checked)} /><span>{m2Fechado === null ? '…' : m2Fechado ? 'Ligado' : 'Desligado'}</span></label>
    </section><div className="admin-rows">
      {(rows as Service[]).map(service => <article key={service.id}><div><strong>{service.name}</strong><small>{service.category} · {unitLabel[service.billingUnit]} · {service.isActive ? 'Ativo' : 'Inativo'}</small></div><b>{formatarMoeda(service.currentPrice)}</b><button className="text-button" type="button" onClick={() => edit(service)}>Editar</button></article>)}
      {!rows.length && <p className="catalog-empty">Nenhum serviço encontrado.</p>}
    </div></>}

    {editing !== null && <Janela aberta aoFechar={closeForm} className="catalog-modal" icone={tab === 'materials' ? 'pedra' : 'valor'} titulo={`${editing ? 'Editar' : 'Novo'} ${tab === 'materials' ? 'material' : 'serviço'}`} aoEnviar={submit}
      rodape={<><button type="button" className="botao-contorno" onClick={closeForm}>Cancelar</button><button className="botao-principal">{editing ? 'Salvar alterações' : 'Criar cadastro'}</button></>}>
        <div className="admin-form">
          <label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Categoria<input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} required /></label>
          <label>Unidade<select value={form.billingUnit} onChange={event => setForm({ ...form, billingUnit: event.target.value as BillingUnit })}>{Object.entries(unitLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Preço<input inputMode="decimal" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} required /></label>
          <label className="active-toggle"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Ativo</label>
        </div>
        {tab === 'materials' && editing && <div className="material-photo-upload"><div className="material-photo-upload-header"><div><strong>Foto da pedra</strong><small>{editingMaterial?.images?.length ? 'Selecione outra imagem para substituir a foto exibida no catálogo e no mostruário.' : 'Adicione uma imagem para exibição no catálogo e no mostruário.'}</small></div>{editingMaterial?.images?.length ? <img className="material-photo-preview material-sample-image" src={imageSrc(editingMaterial)} alt={`Foto atual de ${editingMaterial.name}`} /> : null}</div><label className="photo-upload-button">{imageBusy ? 'Enviando…' : editingMaterial?.images?.length ? 'Trocar foto' : '+ Adicionar foto'}<input type="file" accept="image/*" disabled={imageBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ''; }} /></label></div>}
    </Janela>}
    {archiveOpen && <Janela aberta aoFechar={() => setArchiveOpen(false)} className="catalog-modal catalog-archive-modal" icone="camadas" titulo="Materiais arquivados" subtitulo="Materiais inativos não são exibidos nos orçamentos nem no mostruário." largura="grande">
        
        <div className="catalog-archive-list">
          {archivedMaterials.map((material) => <article key={material.id}><img className="material-sample-image" src={imageSrc(material)} alt="" /><div><strong>{material.name}</strong><small>{material.category} · {formatarMoeda(material.currentPrice)} / {material.billingUnit === 'SQUARE_METER' ? 'm²' : unitLabel[material.billingUnit]}</small></div><button type="button" className="secondary-button" disabled={restoringId === material.id} onClick={() => void restoreMaterial(material)}>{restoringId === material.id ? 'Desarquivando…' : 'Desarquivar'}</button></article>)}
          {!archivedMaterials.length && <p className="catalog-empty">Nenhum material arquivado.</p>}
        </div>
    </Janela>}
  </main>;
}
