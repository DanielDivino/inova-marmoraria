import { describe, expect, it } from 'vitest';
import { aplicarMedidaReferencia, arredondarPontos, endireitarAngulo, ladoMaisComprido, organizarTraco, paraContorno, recorteDoTraco, simplificarRdp } from './freehand.js';
import { contornoValido } from './geometry.js';
import type { Point } from './schema.js';

/** Ruído pseudoaleatório com semente fixa: o mesmo traço torto em todo teste. */
function ruido(semente: number) {
  let estado = semente;
  return () => { estado = (estado * 1103515245 + 12345) % 2147483648; return estado / 2147483648 - .5; };
}
/** Traço de dedo passando pelos cantos, com tremida e sem ângulos exatos. */
function tracoTorto(cantos: Point[], { fechar = true, tremida = 18, semente = 7, desvioGraus = 4 } = {}): Point[] {
  const aleatorio = ruido(semente);
  const caminho = fechar ? [...cantos, cantos[0]] : cantos;
  const pontos: Point[] = [];
  for (let i = 0; i < caminho.length - 1; i++) {
    const a = caminho[i], b = caminho[i + 1];
    const passos = Math.max(8, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 12));
    const giro = desvioGraus * Math.PI / 180 * aleatorio();
    for (let k = 0; k < passos; k++) {
      const t = k / passos;
      // Leve curvatura do lado + tremida da mão.
      const x = a.x + (b.x - a.x) * t - Math.sin(giro) * (b.y - a.y) * t * (1 - t);
      const y = a.y + (b.y - a.y) * t + Math.sin(giro) * (b.x - a.x) * t * (1 - t);
      pontos.push({ x: x + aleatorio() * tremida, y: y + aleatorio() * tremida });
    }
  }
  if (!fechar) pontos.push(caminho[caminho.length - 1]);
  else pontos.push({ x: cantos[0].x + 25, y: cantos[0].y - 20 }); // não volta exatamente ao começo
  return pontos;
}
const angulosDosLados = (pontos: Point[]) => pontos.map((p, i) => {
  const q = pontos[(i + 1) % pontos.length];
  return ((Math.round(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI) % 360) + 360) % 360;
});

describe('desenho livre', () => {
  it('traço torto de um retângulo vira 4 lados retos e fecha sozinho', () => {
    const traco = organizarTraco(tracoTorto([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 600 }, { x: 0, y: 600 }]));
    expect(traco).toMatchObject({ fechado: true, valido: true });
    expect(traco.pontos).toHaveLength(4);
    expect(angulosDosLados(traco.pontos).every((angulo) => angulo % 90 === 0)).toBe(true);
  });

  it('L torto vira 6 lados em esquadro (90°)', () => {
    const traco = organizarTraco(tracoTorto([{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 1800 }, { x: 0, y: 1800 }], { semente: 11 }));
    expect(traco).toMatchObject({ fechado: true, valido: true });
    expect(traco.pontos).toHaveLength(6);
    expect(angulosDosLados(traco.pontos).every((angulo) => angulo % 90 === 0)).toBe(true);
  });

  it('lado perto de 45° fica em 45°; fora da tolerância continua como foi desenhado', () => {
    expect(endireitarAngulo(47 * Math.PI / 180).angulo).toBeCloseTo(Math.PI / 4);
    expect(endireitarAngulo(-7 * Math.PI / 180).angulo).toBeCloseTo(0);
    expect(endireitarAngulo(25 * Math.PI / 180)).toEqual({ angulo: 25 * Math.PI / 180, endireitado: false });
  });

  it('traço aberto não fecha sozinho, mas pode ser fechado se o usuário pedir', () => {
    const cantos = [{ x: 0, y: 1200 }, { x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: 1200 }];
    const aberto = organizarTraco(tracoTorto(cantos, { fechar: false, semente: 3 }));
    expect(aberto).toMatchObject({ fechado: false, podeFechar: true, valido: false });
    const fechado = organizarTraco(tracoTorto(cantos, { fechar: false, semente: 3 }), { fechar: true });
    expect(fechado).toMatchObject({ fechado: true, valido: true });
    expect(fechado.pontos).toHaveLength(4);
  });

  it('contorno que se cruza (um "8") é rejeitado', () => {
    const oito = tracoTorto([{ x: 0, y: 0 }, { x: 1500, y: 1000 }, { x: 1500, y: 0 }, { x: 0, y: 1000 }], { semente: 5, desvioGraus: 0 });
    const traco = organizarTraco(oito, { toleranciaAnguloGraus: 0 });
    expect(traco.fechado).toBe(true);
    expect(traco.valido).toBe(false);
    expect(traco.motivo).toMatch(/cruzado/);
  });

  it('dá escala pelo lado mais comprido e arredonda as medidas em centímetros ou em 5 cm', () => {
    const traco = organizarTraco(tracoTorto([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 310 }, { x: 0, y: 310 }], { semente: 9 }));
    const maior = ladoMaisComprido(traco.pontos);
    const real = aplicarMedidaReferencia(traco.pontos, maior, 2000, 10);
    const lados = real.map((p, i) => Math.hypot(real[(i + 1) % real.length].x - p.x, real[(i + 1) % real.length].y - p.y));
    expect(lados).toContain(2000);
    expect(lados.every((lado) => lado % 10 === 0)).toBe(true);
    expect(contornoValido(paraContorno('p', real))).toBe(true);
    expect(arredondarPontos([{ x: 0, y: 0 }, { x: 1234, y: 0 }, { x: 1234, y: 612 }], 50)).toEqual([{ x: 0, y: 0 }, { x: 1250, y: 0 }, { x: 1250, y: 600 }]);
  });

  it('simplifica um traço cheio de pontos mantendo só os cantos', () => {
    const linha = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: i < 50 ? 0 : (i - 50) * 10 }));
    expect(simplificarRdp(linha, 5)).toEqual([{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 500 }]);
  });

  it('recorte desenhado à mão vira cuba retangular ou oval, com medida e posição', () => {
    const retangulo = recorteDoTraco(tracoTorto([{ x: 700, y: 150 }, { x: 1200, y: 150 }, { x: 1200, y: 450 }, { x: 700, y: 450 }], { tremida: 6, semente: 2 }));
    expect(retangulo).toMatchObject({ shape: 'RECTANGLE', rotationDeg: 0 });
    expect(retangulo!.widthMm).toBeGreaterThan(460); expect(retangulo!.widthMm).toBeLessThan(540);
    expect(retangulo!.lengthMm).toBeGreaterThan(260); expect(retangulo!.lengthMm).toBeLessThan(340);
    expect(Math.abs(retangulo!.x - 950)).toBeLessThan(25); expect(Math.abs(retangulo!.y - 300)).toBeLessThan(25);
    const elipse = Array.from({ length: 80 }, (_, i) => ({ x: 950 + 250 * Math.cos(i * Math.PI / 40), y: 300 + 150 * Math.sin(i * Math.PI / 40) }));
    expect(recorteDoTraco(elipse)).toMatchObject({ shape: 'OVAL', widthMm: 500, lengthMm: 300, x: 950, y: 300 });
  });
});
