'use client';

import { useId } from 'react';
import type { AparenciaDeSuperficie, DesenhoDeBorda } from '@inova/domain';
import './acabamentos.css';

/** Amostra usada quando ainda não há pedra escolhida (admin): granulado claro, que mostra bem o perfil. */
export const AMOSTRA_PADRAO = '/mostruario-pedras/bege-arabesco-480.webp';

// Corte da peça (perfil) perto da quina: tampo de 2 cm (h = 24) com a borda trabalhada à direita.
// A esquerda tem a linha ondulada de "continua". `junta`: linha da colagem entre as peças.
const E = 96, D = 196, T = 40, H = 24, B = T + H;
const continua = `C${E - 7} ${B - 8} ${E + 7} ${T + 8} ${E} ${T}`;
const PERFIS: Record<DesenhoDeBorda, { contorno: string; junta?: string; brilho?: boolean }> = {
  reta: { contorno: `M${E} ${T} H${D} V${B} H${E} ${continua} Z` },
  boleada: { contorno: `M${E} ${T} H${D - 12} A12 12 0 0 1 ${D} ${T + 12} V${B - 3} A3 3 0 0 1 ${D - 3} ${B} H${E} ${continua} Z` },
  'meia-cana': { contorno: `M${E} ${T} H${D - 12} A12 12 0 0 1 ${D - 12} ${B} H${E} ${continua} Z` },
  chanfrada: { contorno: `M${E} ${T} H${D - 6} L${D} ${T + 6} V${B} H${E} ${continua} Z` },
  bisote: { contorno: `M${E} ${T} H${D - 20} L${D} ${T + 10} V${B} H${E} ${continua} Z` },
  'meia-esquadria': { contorno: `M${E} ${T} H${D} V${B + 38} H${D - H} V${B} H${E} ${continua} Z`, junta: `M${D} ${T} L${D - H} ${B}` },
  saia: { contorno: `M${E} ${T} H${D} V${B + 38} H${D - H} V${B} H${E} ${continua} Z`, junta: `M${D - H} ${T} V${B}` },
  engrossada: { contorno: `M${E} ${T} H${D} V${B + H} H${D - 46} V${B} H${E} ${continua} Z`, junta: `M${D - 46} ${B} H${D}` },
  pingadeira: { contorno: `M${E} ${T} H${D} V${B} H${D - 12} V${B - 6} H${D - 17} V${B} H${E} ${continua} Z` },
  polida: { contorno: `M${E} ${T} H${D} V${B} H${E} ${continua} Z`, brilho: true },
};

/** Perfil da borda desenhado com a pedra (corte da peça perto da quina, com sombra e volume). */
export function PerfilDaBorda({ desenho, textura = AMOSTRA_PADRAO, className }: { desenho: DesenhoDeBorda; textura?: string; className?: string }) {
  const chave = useId().replace(/:/g, '');
  const perfil = PERFIS[desenho] ?? PERFIS.reta;
  return <svg className={`perfil-borda${className ? ` ${className}` : ''}`} viewBox="82 22 134 96" aria-hidden="true">
    <defs>
      <pattern id={`${chave}-pedra`} patternUnits="userSpaceOnUse" width="200" height="200" x="60" y="-40">
        <image href={textura} width="200" height="200" preserveAspectRatio="xMidYMid slice" />
      </pattern>
      <linearGradient id={`${chave}-volume`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".28" />
      </linearGradient>
      <linearGradient id={`${chave}-brilho`} x1="0" y1="0" x2="1" y2="0">
        <stop offset=".7" stopColor="#fff" stopOpacity="0" /><stop offset=".93" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity=".2" />
      </linearGradient>
      <filter id={`${chave}-sombra`} x="-10%" y="-10%" width="120%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
    </defs>
    <path d={perfil.contorno} transform="translate(3 8)" fill="#000" opacity=".2" filter={`url(#${chave}-sombra)`} />
    <path d={perfil.contorno} fill={`url(#${chave}-pedra)`} />
    <path d={perfil.contorno} fill={`url(#${chave}-volume)`} />
    {perfil.brilho && <path d={perfil.contorno} fill={`url(#${chave}-brilho)`} />}
    <path d={perfil.contorno} fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" />
    {perfil.junta && <path d={perfil.junta} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1.2" strokeDasharray="3 2" />}
  </svg>;
}

/** Amostra da pedra com a aparência do acabamento de superfície (simulação ilustrativa). */
export function AmostraDaSuperficie({ aparencia, textura = AMOSTRA_PADRAO, className }: { aparencia: AparenciaDeSuperficie; textura?: string; className?: string }) {
  return <div className={`amostra-superficie aparencia-${aparencia}${className ? ` ${className}` : ''}`}><img src={textura} alt="" loading="lazy" decoding="async" /></div>;
}
