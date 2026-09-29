import { cotasDaPeca, distanciasAteBordas, formatMeasure, type Feature, type Piece } from '@inova/domain/technical';
import { anguloLegivel, Texto } from './svg';

const FAIXAS: Feature['type'][] = ['BACKSPLASH', 'SKIRT'];

/**
 * Cotas de todos os lados (do lado de fora da peça, com linhas de chamada) e,
 * na peça selecionada, a distância de cada cuba/recorte até as bordas.
 * Coordenadas locais da peça; `escala` (px/mm) mantém traços e textos do mesmo
 * tamanho na tela em qualquer zoom. Tocar numa cota abre a medida daquele lado.
 */
export function CotasPeca({ peca, recursos, escala, mostrarDistancias }: { peca: Piece; recursos: Feature[]; escala: number; mostrarDistancias: boolean }) {
  const px = (valor: number) => valor / escala;
  const fonte = px(12);
  return <g className="tec-cotas">
    {cotasDaPeca(peca).map((cota) => {
      // As faixas (rodabanca/saia) ficam coladas ao lado; a cota vai por fora delas.
      const faixa = Math.max(0, ...recursos.filter((recurso) => recurso.edgeId === cota.ladoId && FAIXAS.includes(recurso.type)).map((recurso) => Math.max(recurso.thicknessMm, 15)));
      const afastamento = faixa + px(22);
      const { a, b, normal: n } = cota;
      const a2 = { x: a.x + n.x * afastamento, y: a.y + n.y * afastamento }, b2 = { x: b.x + n.x * afastamento, y: b.y + n.y * afastamento };
      const travado = peca.lockedEdges.includes(cota.ladoId);
      const texto = `${travado ? '🔒 ' : ''}${cota.curvo ? 'arco ' : ''}${cota.texto}`;
      const localAngulo = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const angulo = anguloLegivel(localAngulo - peca.rotationDeg) + peca.rotationDeg;
      const centro = cota.curvo ? { x: cota.meio.x + n.x * afastamento, y: cota.meio.y + n.y * afastamento } : { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
      const largura = px(texto.length * 7.2 + 14);
      const dados = { 'data-alvo': 'cota', 'data-peca': peca.id, 'data-lado': cota.ladoId };
      const tique = (p: { x: number; y: number }) => {
        const d = { x: (b.x - a.x) / (cota.comprimento || 1), y: (b.y - a.y) / (cota.comprimento || 1) };
        return <line x1={p.x - (d.x + n.x) * px(4)} y1={p.y - (d.y + n.y) * px(4)} x2={p.x + (d.x + n.x) * px(4)} y2={p.y + (d.y + n.y) * px(4)} />;
      };
      return <g key={cota.ladoId} className={`tec-cota${cota.livre ? ' livre' : ''}`}>
        {!cota.curvo && <>
          <line className="tec-chamada" x1={a.x + n.x * px(4)} y1={a.y + n.y * px(4)} x2={a2.x + n.x * px(5)} y2={a2.y + n.y * px(5)} strokeWidth={px(1)} />
          <line className="tec-chamada" x1={b.x + n.x * px(4)} y1={b.y + n.y * px(4)} x2={b2.x + n.x * px(5)} y2={b2.y + n.y * px(5)} strokeWidth={px(1)} />
          <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} strokeWidth={px(1)} />
          <g strokeWidth={px(1.4)}>{tique(a2)}{tique(b2)}</g>
        </>}
        <g transform={`translate(${centro.x} ${centro.y}) rotate(${angulo})`} {...dados} role="button" aria-label={`Medida do lado ${cota.indice + 1}: ${cota.texto}`}>
          <rect className="tec-cota-fundo" x={-largura / 2} y={-px(10)} width={largura} height={px(20)} rx={px(5)} {...dados} />
        </g>
        <Texto x={centro.x} y={centro.y} tamanho={fonte} angulo={angulo} className="tec-cota-texto" {...dados}>{texto}</Texto>
      </g>;
    })}
    {mostrarDistancias && recursos.flatMap((recurso) => distanciasAteBordas(recurso, peca).filter((d) => d.distancia >= 1).map((d, indice) => {
      const meio = { x: (d.de.x + d.ate.x) / 2, y: (d.de.y + d.ate.y) / 2 };
      const vertical = Math.abs(d.ate.x - d.de.x) < 1;
      return <g key={`${recurso.id}-${indice}`} className="tec-distancia">
        <line x1={d.de.x} y1={d.de.y} x2={d.ate.x} y2={d.ate.y} strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} />
        <Texto x={meio.x + (vertical ? px(10) : 0)} y={meio.y + (vertical ? 0 : px(9))} tamanho={px(10)} angulo={vertical ? anguloLegivel(90 - peca.rotationDeg) + peca.rotationDeg : anguloLegivel(-peca.rotationDeg) + peca.rotationDeg}>{formatMeasure(d.distancia)}</Texto>
      </g>;
    }))}
  </g>;
}

