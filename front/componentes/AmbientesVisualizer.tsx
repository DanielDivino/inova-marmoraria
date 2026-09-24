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

type Fogo = NonNullable<(typeof ambientes)[number]['fogo']>;

// Chamas em gota distribuidas pelo queimador; alturas variam de forma fixa para nao mudar a cada render.
function chamas({ base, inicio, fim }: Fogo, quantidade: number, escala: number) {
  const passo = (fim - inicio) / quantidade;
  return Array.from({ length: quantidade }, (_, indice) => {
    const centro = inicio + passo * (indice + .5);
    const largura = passo * 1.9 * escala;
    const altura = (110 + ((indice * 37) % 5) * 20 + (indice % 2 ? 0 : 22)) * escala;
    const topo = base - altura;
    const inclinacao = ((indice * 13) % 7 - 3) * 5 * escala;
    return {
      d: `M${centro - largura / 2} ${base + 8} C${centro - largura / 2} ${base - altura * .35} ${centro - largura * .05} ${base - altura * .55} ${centro + inclinacao} ${topo} C${centro + largura * .1} ${base - altura * .55} ${centro + largura / 2} ${base - altura * .35} ${centro + largura / 2} ${base + 8} Z`,
      atraso: `${-((indice * .37) % 1.3)}s`,
      duracao: `${.9 + (indice % 3) * .22}s`,
    };
  });
}

function FogoAceso({ fogo, id }: { fogo: Fogo; id: string }) {
  const meio = (fogo.inicio + fogo.fim) / 2;
  const meiaLargura = (fogo.fim - fogo.inicio) / 2;
  return <g className="ambientes-fogo" aria-hidden="true">
    <defs>
      <clipPath id={`${id}-fornalha`}><path d={fogo.recorte} /></clipPath>
      <linearGradient id={`${id}-chama`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#ffd36b" />
        <stop offset=".3" stopColor="#ff8a1f" />
        <stop offset=".7" stopColor="#e2440f" stopOpacity=".7" />
        <stop offset="1" stopColor="#a8200a" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-nucleo`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#fffbe8" />
        <stop offset=".45" stopColor="#ffe08a" />
        <stop offset="1" stopColor="#ffb23e" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${id}-brilho`}>
        <stop offset="0" stopColor="#ff9a3c" stopOpacity=".75" />
        <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-labareda`} x="-20%" y="-30%" width="140%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency=".018 .05" numOctaves="2" seed="4" />
        <feDisplacementMap in="SourceGraphic" scale="26" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter id={`${id}-difuso`}><feGaussianBlur stdDeviation="9" /></filter>
    </defs>
    <ellipse className="ambientes-fogo-reflexo" cx={meio} cy={fogo.base + 90} rx={meiaLargura * 1.6} ry="90" fill={`url(#${id}-brilho)`} opacity=".35" />
    <g clipPath={`url(#${id}-fornalha)`}>
      <ellipse className="ambientes-fogo-brilho" cx={meio} cy={fogo.base - 40} rx={meiaLargura * 1.4} ry="190" fill={`url(#${id}-brilho)`} />
      <ellipse cx={meio} cy={fogo.base + 4} rx={meiaLargura * 1.02} ry="14" fill="#ff7a1a" opacity=".85" filter={`url(#${id}-difuso)`} />
      <g filter={`url(#${id}-labareda)`}>
        {chamas(fogo, 9, 1).map((chama, indice) => <path key={indice} className="ambientes-chama" d={chama.d} fill={`url(#${id}-chama)`} style={{ animationDelay: chama.atraso, animationDuration: chama.duracao }} />)}
        {chamas(fogo, 7, .55).map((chama, indice) => <path key={`n${indice}`} className="ambientes-chama" d={chama.d} fill={`url(#${id}-nucleo)`} style={{ animationDelay: chama.atraso, animationDuration: chama.duracao }} />)}
      </g>
    </g>
  </g>;
}

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
            {ambiente.fogo && cenaPronta && <FogoAceso fogo={ambiente.fogo} id={id} />}
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
