'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ambientes } from './cenas';

export type Ambiente = (typeof ambientes)[number];
type Fogo = NonNullable<Ambiente['fogo']>;
/** Duração da troca de pedra (a nova aparece sobre a anterior). Igual à animação `cena-entrada` do CSS. */
const TROCA_MS = 650;

// Chamas em gota distribuídas pelo queimador; alturas variam de forma fixa para não mudar a cada render.
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
  return <g className="cena-fogo" aria-hidden="true">
    <defs>
      <clipPath id={`${id}-fornalha`}><path d={fogo.recorte} /></clipPath>
      <linearGradient id={`${id}-chama`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#ffd36b" /><stop offset=".3" stopColor="#ff8a1f" />
        <stop offset=".7" stopColor="#e2440f" stopOpacity=".7" /><stop offset="1" stopColor="#a8200a" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-nucleo`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#fffbe8" /><stop offset=".45" stopColor="#ffe08a" /><stop offset="1" stopColor="#ffb23e" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${id}-brilho`}><stop offset="0" stopColor="#ff9a3c" stopOpacity=".75" /><stop offset="1" stopColor="#ff6a00" stopOpacity="0" /></radialGradient>
      <filter id={`${id}-labareda`} x="-20%" y="-30%" width="140%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency=".018 .05" numOctaves="2" seed="4" />
        <feDisplacementMap in="SourceGraphic" scale="26" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter id={`${id}-difuso`}><feGaussianBlur stdDeviation="9" /></filter>
    </defs>
    <ellipse className="cena-fogo-reflexo" cx={meio} cy={fogo.base + 90} rx={meiaLargura * 1.6} ry="90" fill={`url(#${id}-brilho)`} opacity=".35" />
    <g clipPath={`url(#${id}-fornalha)`}>
      <ellipse className="cena-fogo-brilho" cx={meio} cy={fogo.base - 40} rx={meiaLargura * 1.4} ry="190" fill={`url(#${id}-brilho)`} />
      <ellipse cx={meio} cy={fogo.base + 4} rx={meiaLargura * 1.02} ry="14" fill="#ff7a1a" opacity=".85" filter={`url(#${id}-difuso)`} />
      <g filter={`url(#${id}-labareda)`}>
        {chamas(fogo, 9, 1).map((chama, indice) => <path key={indice} className="cena-chama" d={chama.d} fill={`url(#${id}-chama)`} style={{ animationDelay: chama.atraso, animationDuration: chama.duracao }} />)}
        {chamas(fogo, 7, .55).map((chama, indice) => <path key={`n${indice}`} className="cena-chama" d={chama.d} fill={`url(#${id}-nucleo)`} style={{ animationDelay: chama.atraso, animationDuration: chama.duracao }} />)}
      </g>
    </g>
  </g>;
}

/** Carrega a imagem antes de usar; `undefined` enquanto carrega, `false` se falhou. */
function useImagem(url: string | undefined) {
  const [estado, setEstado] = useState<{ url?: string; ok?: boolean }>({});
  useEffect(() => {
    if (!url) return;
    let ativo = true;
    const imagem = new Image();
    imagem.decoding = 'async';
    imagem.onload = () => { if (ativo) setEstado({ url, ok: true }); };
    imagem.onerror = () => { if (ativo) setEstado({ url, ok: false }); };
    imagem.src = url;
    return () => { ativo = false; };
  }, [url]);
  return !url ? undefined : estado.url === url ? estado.ok : undefined;
}

/**
 * Fotografia do ambiente com a pedra aplicada nos planos de pedra: a amostra preenche cada plano e
 * as sombras da foto (em tons de cinza) são multiplicadas por cima. Trocar a pedra faz a nova surgir
 * sobre a anterior. `revelar` (0–100) mostra a pedra só até essa fração da largura (comparação).
 */
export function CenaComPedra({ ambiente, pedra, revelar = 100, rotulo, className, cobrir }: {
  ambiente: Ambiente; pedra?: string; revelar?: number; rotulo: string; className?: string;
  /** Preenche a caixa toda (cortando as bordas da foto) em vez de caber inteira. */
  cobrir?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const cena = useImagem(ambiente.imagem);
  const pedraCarregada = useImagem(pedra);
  // Camadas de pedra: a última é a atual; as anteriores ficam por baixo até a troca terminar.
  const [camadas, setCamadas] = useState<{ url: string; chave: number }[]>([]);
  const [estavel, setEstavel] = useState(false);
  const contador = useRef(0);
  useEffect(() => {
    if (!pedra) { setCamadas([]); return; }
    if (pedraCarregada !== true) return;
    setCamadas((atuais) => atuais.at(-1)?.url === pedra ? atuais : [...atuais.slice(-1), { url: pedra, chave: ++contador.current }]);
    setEstavel(false);
    const fim = window.setTimeout(() => { setCamadas((atuais) => atuais.slice(-1)); setEstavel(true); }, TROCA_MS);
    return () => window.clearTimeout(fim);
  }, [pedra, pedraCarregada]);

  const atual = camadas.at(-1);
  // Enquanto a nova pedra carrega, a anterior continua na cena.
  const mostrar = cena === true && !!atual;
  const recorte = Math.max(0, Math.min(100, revelar));
  return <svg className={`cena-foto${className ? ` ${className}` : ''}`} viewBox="0 0 1448 1086" preserveAspectRatio={cobrir ? 'xMidYMid slice' : undefined} role="img" aria-label={rotulo} aria-busy={cena !== true}
    data-estavel={mostrar && estavel && atual?.url === pedra ? 'true' : undefined}>
    <defs>
      <filter id={`${id}-luz`} colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values="0" /></filter>
      <clipPath id={`${id}-planos`}>{ambiente.superficies.map((superficie) => <path key={superficie.nome} d={superficie.contorno} clipRule="evenodd" />)}</clipPath>
      {recorte < 100 && <clipPath id={`${id}-revelar`}><rect width={14.48 * recorte} height="1086" /></clipPath>}
      {mostrar && camadas.flatMap((camada) => ambiente.superficies.map((superficie, indice) => <pattern key={`${camada.chave}-${indice}`} id={`${id}-${camada.chave}-${indice}`} width="1448" height="1086" patternUnits="userSpaceOnUse" patternTransform={superficie.textura}>
        <image href={camada.url} width="1448" height="1086" preserveAspectRatio="xMidYMid slice" />
      </pattern>))}
    </defs>
    {cena === true && <image href={ambiente.imagem} width="1448" height="1086" />}
    {mostrar && <g clipPath={recorte < 100 ? `url(#${id}-revelar)` : undefined}>
      {camadas.map((camada) => <g key={camada.chave} className={camada === atual && !estavel ? 'cena-camada cena-entrada' : 'cena-camada'} data-camada={camada === atual ? 'atual' : 'anterior'} clipPath={`url(#${id}-planos)`} style={{ isolation: 'isolate' }}>
        {ambiente.superficies.map((superficie, indice) => <path key={superficie.nome} data-superficie={superficie.nome} d={superficie.contorno} fill={`url(#${id}-${camada.chave}-${indice})`} fillRule="evenodd" />)}
        <image href={ambiente.imagem} width="1448" height="1086" filter={`url(#${id}-luz)`} style={{ mixBlendMode: 'multiply' }} opacity="0.45" />
        {ambiente.superficies.filter((superficie) => superficie.sombra).map((superficie) => <path key={superficie.nome} d={superficie.contorno} fill="black" opacity={superficie.sombra} fillRule="evenodd" />)}
      </g>)}
    </g>}
    {ambiente.fogo && cena === true && <FogoAceso fogo={ambiente.fogo} id={id} />}
  </svg>;
}
