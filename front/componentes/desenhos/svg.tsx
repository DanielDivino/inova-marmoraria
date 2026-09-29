import type { ReactNode, SVGProps } from 'react';

/** Ângulo (graus, sentido anti-horário) virado para o texto nunca ficar de cabeça para baixo. */
export function anguloLegivel(graus: number) {
  let angulo = ((graus % 360) + 360) % 360;
  if (angulo > 90 && angulo <= 270) angulo -= 180;
  return angulo;
}

/**
 * Texto dentro do grupo do mundo (que tem o y invertido): desvira o texto e o
 * gira `angulo` graus no sentido anti-horário, centralizado em (x, y).
 */
export function Texto({ x, y, tamanho, angulo = 0, children, ...resto }: { x: number; y: number; tamanho: number; angulo?: number; children: ReactNode } & Omit<SVGProps<SVGTextElement>, 'x' | 'y'>) {
  return <text transform={`translate(${x} ${y}) scale(1 -1) rotate(${-angulo})`} fontSize={tamanho} textAnchor="middle" dominantBaseline="central" {...resto}>{children}</text>;
}

export const pontosSvg = (pontos: { x: number; y: number }[]) => pontos.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ');
