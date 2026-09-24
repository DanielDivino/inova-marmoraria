'use client';

import { useEffect, useId, useState } from 'react';
import { ambientes } from './ambientes-cenas';
import { exibirPrecoMaterial, type UnidadeMaterial } from '../utilitarios/material-price';

type Material = { id: string; name: string; category: string; currentPrice: number | null; billingUnit?: UnidadeMaterial; images?: { url: string; isPrimary: boolean }[] };

function imagemDaPedra(material?: Material) {
  const url = material?.images?.find((item) => item.isPrimary)?.url ?? material?.images?.[0]?.url;
  if (!url) return undefined;
  return url.startsWith('/uploads/') ? `/api${url}` : url;
}
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function VisualizadorAmbientes({ material, materiais, selecionarMaterial }: {
  material: Material | undefined;
  materiais: Material[];
  selecionarMaterial: (id: string) => void;
}) {
  const [indiceAmbiente, setIndiceAmbiente] = useState(0);
  const [original, setOriginal] = useState(false);
  const [busca, setBusca] = useState('');
  const [imagemCarregada, setImagemCarregada] = useState<string>();
  const [imagemComErro, setImagemComErro] = useState<string>();
  const [cenaCarregada, setCenaCarregada] = useState<string>();
  const [cenaComErro, setCenaComErro] = useState<string>();
  const id = useId().replace(/:/g, '');
  const ambiente = ambientes[indiceAmbiente];
  const pedra = imagemDaPedra(material);
  const filtrados = materiais.filter((item) => normalizar(item.name).includes(normalizar(busca)));

  useEffect(() => {
    let ativo = true;
    setCenaComErro(undefined);
    const imagem = new Image();
    const concluir = () => { if (ativo) { setCenaCarregada(ambiente.imagem); setCenaComErro(undefined); } };
    imagem.onload = concluir;
    imagem.onerror = () => { if (ativo) setCenaComErro(ambiente.imagem); };
    imagem.src = ambiente.imagem;
    if (imagem.complete && imagem.naturalWidth > 0) concluir();
    return () => { ativo = false; };
  }, [ambiente.imagem]);

  useEffect(() => {
    if (!pedra) return;
    let ativo = true;
    const imagem = new Image();
    imagem.onload = () => { if (ativo) { setImagemCarregada(pedra); setImagemComErro(undefined); } };
    imagem.onerror = () => { if (ativo) setImagemComErro(pedra); };
    imagem.src = pedra;
    return () => { ativo = false; };
  }, [pedra]);

  const pronta = !!pedra && imagemCarregada === pedra && imagemComErro !== pedra;
  const cenaPronta = cenaCarregada === ambiente.imagem && cenaComErro !== ambiente.imagem;

  return <section id="ambientes" className="ambientes-showcase" aria-labelledby="ambientes-title">
    <header className="ambientes-heading">
      <div><span className="ambientes-eyebrow">AMBIENTES E ACABAMENTOS</span><h2 id="ambientes-title">Veja a pedra aplicada</h2></div>
      <a href="#colecao">Coleção completa <span aria-hidden="true">↗</span></a>
    </header>
    <div className="ambientes-layout">
      <div className="ambientes-stage">
        <div className="ambientes-tabs" role="group" aria-label="Ambiente">
          {ambientes.map((item, indice) => <button key={item.titulo} type="button" aria-pressed={indice === indiceAmbiente} onClick={() => setIndiceAmbiente(indice)}>{item.titulo}</button>)}
        </div>
        <figure className="ambientes-figure">
          <svg className="ambientes-photo" viewBox="0 0 1448 1086" role="img" aria-busy={!cenaPronta} aria-label={`${ambiente.titulo}${original || !pronta ? ' original' : ` em ${material?.name}`}`}>
            <defs>
              <filter id={`${id}-luz`} colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values="0" /></filter>
              {ambiente.superficies.map((superficie, indice) => <pattern key={indice} id={`${id}-pedra-${indice}`} width="1448" height="1086" patternUnits="userSpaceOnUse" patternTransform={superficie.textura}>
                {pronta && <image href={pedra} width="1448" height="1086" preserveAspectRatio="xMidYMid slice" />}
              </pattern>)}
              {ambiente.superficies.map((superficie, indice) => <clipPath key={indice} id={`${id}-recorte-${indice}`}><path d={superficie.contorno} clipRule="evenodd" /></clipPath>)}
            </defs>
            <image key={ambiente.imagem} href={ambiente.imagem} width="1448" height="1086" />
            {!original && pronta && cenaPronta && ambiente.superficies.map((superficie, indice) => <g key={indice} data-superficie={superficie.nome} clipPath={`url(#${id}-recorte-${indice})`} style={{ isolation: 'isolate' }}>
              <path d={superficie.contorno} fill={`url(#${id}-pedra-${indice})`} fillRule="evenodd" />
              <image href={ambiente.imagem} width="1448" height="1086" filter={`url(#${id}-luz)`} style={{ mixBlendMode: 'multiply' }} opacity="0.45" />
              {superficie.sombra && <path d={superficie.contorno} fill="black" opacity={superficie.sombra} fillRule="evenodd" />}
            </g>)}
          </svg>
          {!cenaPronta && <div className="ambientes-scene-status" role="status">{cenaComErro === ambiente.imagem ? 'Não foi possível carregar o ambiente.' : 'Carregando ambiente…'}</div>}
          <figcaption><span>{ambiente.titulo}</span><strong>{original || !pronta || !cenaPronta ? 'Ambiente original' : material?.name}</strong></figcaption>
        </figure>
        <div className="ambientes-bottom-controls">
          <label className="ambientes-comparison"><input type="checkbox" checked={original} onChange={(event) => setOriginal(event.target.checked)} />Ver original</label>
        </div>
      </div>
      <aside className="ambientes-materials" aria-label="Pedras para o ambiente">
        <div className="ambientes-current"><small>MATERIAL SELECIONADO</small><h3>{material?.name ?? 'Nenhuma pedra selecionada'}</h3><span>{material?.category}</span>{material && <strong>{exibirPrecoMaterial(material.currentPrice, material.billingUnit)}</strong>}</div>
        <label className="ambientes-search">Buscar pedra<input type="search" placeholder="Nome do material" value={busca} onChange={(event) => setBusca(event.target.value)} /></label>
        <div className="ambientes-swatches" role="group" aria-label="Materiais">
          {filtrados.map((item) => <button type="button" key={item.id} aria-pressed={material?.id === item.id} onClick={() => { selecionarMaterial(item.id); setOriginal(false); }}>
            <img className="material-sample-image" src={imagemDaPedra(item) ?? '/stone-placeholder.svg'} alt="" loading="lazy" /><span>{item.name}</span><small>{imagemDaPedra(item) ? exibirPrecoMaterial(item.currentPrice, item.billingUnit) : 'Foto pendente'}</small>
          </button>)}
          {!filtrados.length && <p>Nenhuma pedra encontrada.</p>}
        </div>
        <p className="ambientes-feedback" role="status">{material && !pedra ? 'Esta pedra ainda não tem foto para a simulação.' : imagemComErro === pedra && pedra ? 'Não foi possível carregar esta amostra.' : pedra && !pronta ? 'Carregando amostra…' : ''}</p>
      </aside>
    </div>
    <p className="ambientes-note">Simulação ilustrativa. Tonalidade, escala e veios podem variar na pedra natural.</p>
  </section>;
}
