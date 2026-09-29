import { cotasDaPeca, edgeLength, edgePoint, sampleContour, type Feature, type Piece } from '@inova/domain/technical';
import { CotasPeca } from './CotasPeca';
import { anguloLegivel, pontosSvg, Texto } from './svg';
import { ROTULO_PERFIL, type Selecao } from './tipos';
import { urlImagem } from './operacoes';

type Props = { peca: Piece; recursos: Feature[]; escala: number; selecao: Selecao; destacarLados: boolean };
const pontosDoLado = (peca: Piece, ladoId: string, inicio = 0, extensao = edgeLength(peca, ladoId)) =>
  Array.from({ length: 17 }, (_, i) => edgePoint(peca, ladoId, inicio + extensao * i / 16));

/**
 * Uma peça na planta, em coordenadas locais (o grupo aplica posição e giro):
 * pedra, faixas de rodabanca/saia para fora do lado, acabamentos, cubas,
 * recortes e furos, áreas de toque dos lados e alças dos vértices.
 * Os atributos data-alvo dizem ao canvas o que foi tocado.
 */
export function PecaSvg({ peca, recursos, escala, selecao, destacarLados }: Props) {
  const px = (valor: number) => valor / escala;
  const selecionada = (selecao?.tipo === 'peca' && selecao.id === peca.id) || (selecao?.tipo === 'vertice' && selecao.pecaId === peca.id)
    || (selecao?.tipo === 'recurso' && recursos.some((recurso) => recurso.id === selecao.id));
  const normais = new Map(cotasDaPeca(peca).map((cota) => [cota.ladoId, cota.normal]));
  const imagem = urlImagem(peca.material?.imageUrl);
  const textura = peca.material?.textureScaleMm ?? 600;
  const contorno = pontosSvg(sampleContour(peca.contour, Math.max(1, px(1.5))));
  const recursoSelecionado = (id: string) => selecao?.tipo === 'recurso' && selecao.id === id;
  // Nome no meio da peça; se uma cuba/recorte estiver ali, logo abaixo dela.
  const meio = sampleContour(peca.contour, 20).reduce((soma, p, _, lista) => ({ x: soma.x + p.x / lista.length, y: soma.y + p.y / lista.length }), { x: 0, y: 0 });
  const embaixo = recursos.filter((r) => !r.edgeId && Math.abs(r.x - meio.x) < Math.max(r.widthMm, r.diameterMm) / 2 + px(30) && Math.abs(r.y - meio.y) < Math.max(r.lengthMm, r.diameterMm) / 2 + px(10));
  const centro = embaixo.length ? { x: meio.x, y: Math.min(...embaixo.map((r) => r.y - Math.max(r.lengthMm, r.diameterMm) / 2)) - px(12) } : meio;
  // Alças dos vértices menores quando a peça aparece pequena na tela.
  const caixa = sampleContour(peca.contour, 20).reduce((c, p) => ({ minX: Math.min(c.minX, p.x), maxX: Math.max(c.maxX, p.x), minY: Math.min(c.minY, p.y), maxY: Math.max(c.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const alca = Math.max(4, Math.min(9, Math.min(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) * escala / 8));

  return <g transform={`translate(${peca.x} ${peca.y}) rotate(${-peca.rotationDeg})`} className={`tec-peca${selecionada ? ' selecionada' : ''}${peca.locked ? ' travada' : ''}`}>
    {imagem && <defs><pattern id={`pedra-${peca.id}`} width={textura} height={textura} patternUnits="userSpaceOnUse" patternTransform={`rotate(${peca.material?.veinRotationDeg ?? 0})`}>
      <image href={imagem} width={textura} height={textura} preserveAspectRatio="xMidYMid slice" />
    </pattern></defs>}
    {/* Estilo inline: a regra de CSS da cor neutra venceria o atributo fill. */}
    <polygon points={contorno} className="tec-pedra" style={imagem ? { fill: `url(#pedra-${peca.id})` } : undefined} data-alvo="peca" data-id={peca.id} />
    <polygon points={contorno} className="tec-contorno" strokeWidth={px(selecionada ? 2.6 : 1.6)} pointerEvents="none" />

    {recursos.map((recurso) => {
      const ativo = recursoSelecionado(recurso.id);
      const dados = { 'data-alvo': 'recurso', 'data-id': recurso.id };
      const classe = `tec-recurso tipo-${recurso.type.toLowerCase()}${ativo ? ' selecionado' : ''}`;
      if (recurso.edgeId && ['SKIRT', 'BACKSPLASH', 'EDGE_FINISH'].includes(recurso.type)) {
        if (!peca.contour.some((vertice) => vertice.id === recurso.edgeId)) return null;
        const trecho = pontosDoLado(peca, recurso.edgeId, recurso.startMm, recurso.extentMm);
        if (recurso.type === 'EDGE_FINISH') {
          const meio = trecho[8];
          return <g key={recurso.id} className={classe} {...dados}>
            <polyline points={pontosSvg(trecho)} strokeWidth={px(ativo ? 6 : 4)} fill="none" {...dados} />
            <Texto x={meio.x} y={meio.y} tamanho={px(10)} className="tec-recurso-rotulo" pointerEvents="none">{ROTULO_PERFIL[recurso.profile]}</Texto>
          </g>;
        }
        // Rodabanca e saia vistas de cima: faixa colada ao lado, por fora da peça.
        const n = normais.get(recurso.edgeId) ?? { x: 0, y: 0 };
        const largura = Math.max(recurso.thicknessMm, 15);
        const fora = trecho.map((p) => ({ x: p.x + n.x * largura, y: p.y + n.y * largura })).reverse();
        const meio = { x: (trecho[8].x + fora[8].x) / 2, y: (trecho[8].y + fora[8].y) / 2 };
        const a = trecho[0], b = trecho[16];
        const angulo = anguloLegivel(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI - peca.rotationDeg) + peca.rotationDeg;
        return <g key={recurso.id} className={classe} {...dados}>
          <polygon points={pontosSvg([...trecho, ...fora])} strokeWidth={px(1.2)} strokeDasharray={recurso.type === 'SKIRT' ? `${px(5)} ${px(3)}` : undefined} {...dados} />
          <Texto x={meio.x + n.x * px(9)} y={meio.y + n.y * px(9)} tamanho={px(9.5)} angulo={angulo} className="tec-recurso-rotulo" pointerEvents="none">{recurso.name} {Math.round(recurso.heightMm / 10)}cm</Texto>
        </g>;
      }
      if (recurso.type === 'HOLE') return <circle key={recurso.id} cx={recurso.x} cy={recurso.y} r={recurso.diameterMm / 2} className={classe} strokeWidth={px(1.4)} {...dados} />;
      const giro = `rotate(${-recurso.rotationDeg} ${recurso.x} ${recurso.y})`;
      return <g key={recurso.id} className={classe} {...dados}>
        {recurso.shape === 'OVAL'
          ? <ellipse cx={recurso.x} cy={recurso.y} rx={recurso.widthMm / 2} ry={recurso.lengthMm / 2} transform={giro} strokeWidth={px(1.4)} {...dados} />
          : <rect x={recurso.x - recurso.widthMm / 2} y={recurso.y - recurso.lengthMm / 2} width={recurso.widthMm} height={recurso.lengthMm} rx={recurso.radiusMm} transform={giro} strokeWidth={px(1.4)} {...dados} />}
        <Texto x={recurso.x} y={recurso.y} tamanho={px(10)} className="tec-recurso-rotulo" pointerEvents="none">{recurso.name}</Texto>
      </g>;
    })}

    <CotasPeca peca={peca} recursos={recursos} escala={escala} mostrarDistancias={selecionada} />
    {/* Selecionada com cubas, as distâncias ocupam o meio: o nome sai para não embolar. */}
    {!(selecionada && embaixo.length) && <Texto x={centro.x} y={centro.y} tamanho={px(12)} className="tec-peca-nome" pointerEvents="none">{peca.locked ? '🔒 ' : ''}{peca.name}</Texto>}

    {/* Área de toque de cada lado: tocar abre a medida; com rodabanca/saia/acabamento escolhido, coloca nele. */}
    {peca.contour.map((vertice) => <polyline key={`lado-${vertice.id}`} points={pontosSvg(pontosDoLado(peca, vertice.id))} className={`tec-lado${destacarLados ? ' destacado' : ''}`}
      strokeWidth={px(22)} fill="none" data-alvo="lado" data-peca={peca.id} data-lado={vertice.id} />)}
    {selecionada && !peca.locked && peca.contour.map((vertice) => <circle key={vertice.id} cx={vertice.x} cy={vertice.y} r={px(selecao?.tipo === 'vertice' && selecao.verticeId === vertice.id ? alca + 3 : alca)}
      className={`tec-vertice${selecao?.tipo === 'vertice' && selecao.verticeId === vertice.id ? ' selecionado' : ''}`} strokeWidth={px(2)} data-alvo="vertice" data-peca={peca.id} data-vertice={vertice.id} />)}
  </g>;
}
