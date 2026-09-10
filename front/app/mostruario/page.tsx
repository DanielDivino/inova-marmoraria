'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

type MaterialImage = { id: string; url: string; alt?: string | null; isPrimary: boolean };
type Material = { id: string; name: string; category: string; description?: string | null; currentPrice: number | null; isActive: boolean; images?: MaterialImage[] };
type Filter = 'Todos' | 'Granitos' | 'Mármores' | 'Claros' | 'Escuros';

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const imageFor = (material: Material) => material.images?.find((image) => image.isPrimary)?.url ?? material.images?.[0]?.url;
const imageSrc = (material: Material) => { const url = imageFor(material); return url ? `/api${url}` : '/hero-kitchen.jpg'; };
const filters: Filter[] = ['Todos', 'Granitos', 'Mármores', 'Claros', 'Escuros'];

function belongsTo(material: Material, filter: Filter) {
  if (filter === 'Todos') return true;
  const value = normalized(`${material.name} ${material.category}`);
  if (filter === 'Granitos') return value.includes('granit');
  if (filter === 'Mármores') return value.includes('marmor');
  if (filter === 'Claros') return /branco|bege|calacat|itaun|prime|nanoglass|ultracompacto|onix|translucido|taj/.test(value);
  return /preto|negro|nero|marrom|cafe|stellar|indiano|ocre/.test(value);
}

export default function MostruarioPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<Filter>('Todos');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api<Material[]>('/catalog/materials?active=all', { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      const withSamples = data.filter((material) => material.images?.length);
      setMaterials(withSamples);
      const dallas = withSamples.find((material) => normalized(material.name) === 'branco dallas');
      setSelectedId(dallas?.id ?? withSamples[0]?.id ?? '');
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o mostruário.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const visibleMaterials = useMemo(() => {
    const query = normalized(search.trim());
    return materials.filter((material) => belongsTo(material, filter) && (!query || normalized(`${material.name} ${material.category}`).includes(query)));
  }, [filter, materials, search]);
  const selected = materials.find((material) => material.id === selectedId) ?? visibleMaterials[0];
  const count = (current: Filter) => materials.filter((material) => belongsTo(material, current)).length;

  return <main className="showcase-page">
    <section className="showcase-hero" style={{ backgroundImage: "linear-gradient(90deg, #241b12c9 0%, #241b125c 47%, #241b121c 100%), url('/hero-kitchen.jpg')" }}>
      <div className="showcase-hero-copy"><span className="showcase-eyebrow">BELEZA NATURAL<br />EM CADA DETALHE</span><h1>Superfícies<br />que valorizam<br />seus espaços</h1><p>Granitos, mármores e superfícies especiais<br />para projetos únicos e duradouros.</p><a className="showcase-outline-button" href="#colecao">Conheça nossa coleção <span>→</span></a></div>
      {selected && <article className="showcase-featured"><img src={imageSrc(selected)} alt={selected.name} /><div className="showcase-featured-copy"><span className="showcase-material-category">{selected.category}</span><h2>{selected.name}</h2><p>{selected.description || 'Uma superfície marcante para bancadas, ilhas e ambientes que pedem personalidade.'}</p><div className="showcase-featured-facts"><span>◇<small>Alta<br />durabilidade</small></span><span>✧<small>Fácil<br />manutenção</small></span><span>⌂<small>Ideal para<br />ambientes internos</small></span></div><div className="showcase-featured-actions"><a href="#colecao" className="showcase-dark-button">Ver mais detalhes <span>→</span></a><button type="button" className="showcase-light-button" onClick={() => setFavorites((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id])}>{favorites.includes(selected.id) ? '♡ Favorito' : '♡ Adicionar aos favoritos'}</button></div></div></article>}
      <div className="showcase-collection-strip" aria-label="Materiais em destaque"><div className="showcase-strip-heading"><strong>Nossa Coleção</strong><small>{materials.length} MATERIAIS COM AMOSTRA</small></div><div className="showcase-strip-items">{materials.map((material) => <button type="button" className={material.id === selected?.id ? 'selected' : ''} key={material.id} onClick={() => setSelectedId(material.id)}><img src={imageSrc(material)} alt="" /><span>{material.name}</span></button>)}</div></div>
    </section>
    <section id="colecao" className="showcase-catalog"><div className="showcase-catalog-heading"><div><span className="showcase-eyebrow">NOSSA COLEÇÃO</span><h2>Escolha sua pedra</h2><p>Explore nossa seleção de granitos, mármores e superfícies especiais.<br />Clique em um material para visualizar os detalhes.</p></div><span className="showcase-side-note">BELEZA NATURAL<br />EM CADA DETALHE</span></div><div className="showcase-toolbar"><div className="showcase-filters">{filters.map((option) => <button type="button" className={filter === option ? 'selected' : ''} key={option} onClick={() => setFilter(option)}>{option} <small>({count(option)})</small></button>)}</div><label className="showcase-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar um material..." /></label></div>{error && <p className="form-error" role="alert">{error}</p>}{loading && <p className="showcase-empty">Carregando materiais…</p>}{!loading && !error && <div className="showcase-grid">{visibleMaterials.map((material) => <button type="button" className={`showcase-material-card ${material.id === selected?.id ? 'selected' : ''}`} key={material.id} onClick={() => { setSelectedId(material.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><img src={imageSrc(material)} alt={material.name} /><span><strong>{material.name}</strong><b>♡</b></span><small>{material.category}</small>{!material.isActive && <em>A confirmar</em>}</button>)}</div>}{!loading && !error && !visibleMaterials.length && <p className="showcase-empty">Nenhum material encontrado para esta busca.</p>}</section>
    <Link className="showcase-request-button" href="/">Solicitar orçamento <span>→</span></Link>
  </main>;
}
