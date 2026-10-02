import { geometriaDaArea, areasDaPeca, cotasDaPeca, edgeLength, edgePoint, faixaDentroDaPeca, formatMeasure, linhaDaEmenda, NOME_AREA, sampleContour, type Feature, type Piece } from '@inova/domain/technical';
import { CotasPeca } from './CotasPeca';
import { anguloLegivel, pontosSvg, Texto } from './svg';
import { ROTULO_PERFIL, type Selecao } from './tipos';
import { urlImagem } from './operacoes';

type Props = { aoTocarLado: (pecaId: string, ladoId: string) => void; peca: Piece; recursos: Feature[]; escala: number; selecao: Selecao; destacarLados: boolean; mostrarVertices?: boolean; verticeMarcado?: string };

/**
 * Alças nas quatro bordas da cuba/recorte selecionado: puxar uma borda muda o
 * tamanho daquele lado (o canvas trata o arraste, data-alvo "borda-recurso").
 */
function BordasDoRecurso({ recurso, giro, px, giroPeca }: { recurso: Feature; giro: string; px: (valor: number) => number; giroPeca: number }) {
  const [meiaLargura, meioComprimento, cx, cy] = [recurso.widthMm / 2, recurso.lengthMm / 2, recurso.x, recurso.y];
  // Na tela, a borda de lado anda na horizontal quando o giro total fica perto de 0° ou 180°.
  const deitado = Math.abs(((recurso.rotationDeg + giroPeca) % 180 + 180) % 180 - 90) > 45;
  const bordas = [
    { lado: 'D', a: [cx + meiaLargura, cy - meioComprimento], b: [cx + meiaLargura, cy + meioComprimento], cursor: deitado ? 'ew-resize' : 'ns-resize' },
    { lado: 'E', a: [cx - meiaLargura, cy - meioComprimento], b: [cx - meiaLargura, cy + meioComprimento], cursor: deitado ? 'ew-resize' : 'ns-resize' },
    { lado: 'C', a: [cx - meiaLargura, cy + meioComprimento], b: [cx + meiaLargura, cy + meioComprimento], cursor: deitado ? 'ns-resize' : 'ew-resize' },
    { lado: 'B', a: [cx - meiaLargura, cy - meioComprimento], b: [cx + meiaLargura, cy - meioComprimento], cursor: deitado ? 'ns-resize' : 'ew-resize' },
  ];
  return <g transform={giro}>
    {bordas.map(({ lado, a, b, cursor }) => {
      const dados = { 'data-alvo': 'borda-recurso', 'data-id': recurso.id, 'data-lado': lado, style: { cursor } };
      const meio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return <g key={lado}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="tec-borda-recurso" strokeWidth={px(14)} {...dados} />
        <rect x={meio[0] - px(5)} y={meio[1] - px(5)} width={px(10)} height={px(10)} rx={px(2)} className="tec-alca-recurso" strokeWidth={px(1.5)} aria-label={`Puxar borda ${lado}`} {...dados} />
      </g>;
    })}
  </g>;
}
const pontosDoLado = (peca: Piece, ladoId: string, inicio = 0, extensao = edgeLength(peca, ladoId)) =>
  Array.from({ length: 17 }, (_, i) => edgePoint(peca, ladoId, inicio + extensao * i / 16));

/**
 * Uma peça na planta, em coordenadas locais (o grupo aplica posição e giro):
 * pedra, faixas de rodabanca/saia para fora do lado, acabamentos, cubas,
 * recortes e furos, áreas de toque dos lados e alças dos vértices.
 * Os atributos data-alvo dizem ao canvas o que foi tocado.
 */
export function PecaSvg({ aoTocarLado, peca, recursos, escala, selecao, destacarLados, mostrarVertices = false, verticeMarcado }: Props) {
  const px = (valor: number) => valor / escala;
  const selecionada = (selecao?.tipo === 'peca' && selecao.id === peca.id) || (selecao?.tipo === 'vertice' && selecao.pecaId === peca.id)
    || (selecao?.tipo === 'recurso' && recursos.some((recurso) => recurso.id === selecao.id));
  const normais = new Map(cotasDaPeca(peca).map((cota) => [cota.ladoId, cota.normal]));
  const imagem = urlImagem(peca.material?.imageUrl);
  const textura = peca.material?.textureScaleMm ?? 600;
  const contorno = pontosSvg(sampleContour(peca.contour, Math.max(1, px(1.5))));
  const recursoSelecionado = (id: string) => selecao?.tipo === 'recurso' && selecao.id === id;
  const recursoAtivo = recursos.find((recurso) => recursoSelecionado(recurso.id) && !recurso.edgeId && recurso.type !== 'HOLE');
  // Nome no meio da peça; se uma cuba/recorte estiver ali, logo abaixo dela.
  const meio = sampleContour(peca.contour, 20).reduce((soma, p, _, lista) => ({ x: soma.x + p.x / lista.length, y: soma.y + p.y / lista.length }), { x: 0, y: 0 });
  const embaixo = recursos.filter((r) => !r.edgeId && Math.abs(r.x - meio.x) < Math.max(r.widthMm, r.diameterMm) / 2 + px(30) && Math.abs(r.y - meio.y) < Math.max(r.lengthMm, r.diameterMm) / 2 + px(10));
  const caixa = sampleContour(peca.contour, 20).reduce((c, p) => ({ minX: Math.min(c.minX, p.x), maxX: Math.max(c.maxX, p.x), minY: Math.min(c.minY, p.y), maxY: Math.max(c.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const topoRecursos = Math.max(...embaixo.map((r) => r.y + Math.max(r.lengthMm, r.diameterMm) / 2)), baseRecursos = Math.min(...embaixo.map((r) => r.y - Math.max(r.lengthMm, r.diameterMm) / 2));
  // Com cuba no meio, o nome vai para o lado (acima ou abaixo dela) com mais espaço.
  const centro = !embaixo.length ? meio : caixa.maxY - topoRecursos >= baseRecursos - caixa.minY ? { x: meio.x, y: (topoRecursos + caixa.maxY) / 2 } : { x: meio.x, y: (baseRecursos + caixa.minY) / 2 };
  // Alças dos vértices menores quando a peça aparece pequena na tela.
  const alca = Math.max(4, Math.min(9, Math.min(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) * escala / 8));
  const areas = areasDaPeca(peca);
  // Textos de dentro da peça (nome, cuba, áreas) sempre na horizontal para quem olha, em qualquer giro
  // (o grupo gira a peça; este ângulo desfaz o giro só no texto).
  const anguloTexto = peca.rotationDeg;
  const girando = selecao?.tipo === 'peca' && selecao.id === peca.id && !peca.locked;

  return <g transform={`translate(${peca.x} ${peca.y}) rotate(${-peca.rotationDeg})`} className={`tec-peca${selecionada ? ' selecionada' : ''}${peca.locked ? ' travada' : ''}`}>
    {imagem && <defs><pattern id={`pedra-${peca.id}`} width={textura} height={textura} patternUnits="userSpaceOnUse" patternTransform={`rotate(${peca.material?.veinRotationDeg ?? 0})`}>
      <image href={imagem} width={textura} height={textura} preserveAspectRatio="xMidYMid slice" />
    </pattern></defs>}
    {/* Estilo inline: a regra de CSS da cor neutra venceria o atributo fill. */}
    <polygon points={contorno} className="tec-pedra" style={imagem ? { fill: `url(#pedra-${peca.id})` } : undefined} data-alvo="peca" data-id={peca.id} />
    {/* Área seca e molhada: a molhada tingida, divisas tracejadas e o nome com o tamanho junto à frente do balcão. */}
    {areas.length > 0 && <g className="tec-areas-balcao" pointerEvents="none">
      <defs><clipPath id={`areas-${peca.id}`}><polygon points={contorno} /></clipPath></defs>
      <g clipPath={`url(#areas-${peca.id})`}>
        {areas.map(area => <polygon key={area.indice} points={pontosSvg(geometriaDaArea(peca, area).pontos)} className={area.tipo === 'WET' ? 'tec-area-molhada' : 'tec-area-seca'} stroke="#638b97" strokeWidth={px(1.6)} strokeDasharray={`${px(6)} ${px(4)}`} />)}
      </g>
    </g>}
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
            <Texto x={meio.x} y={meio.y} tamanho={px(10)} angulo={anguloTexto} className="tec-recurso-rotulo" pointerEvents="none">{ROTULO_PERFIL[recurso.profile]}</Texto>
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
      // Emenda: linha de corte tracejada de lado a lado (a de baixo, larga e invisível, é para tocar).
      if (recurso.type === 'SEAM') {
        const linha = linhaDaEmenda(peca, recurso);
        if (!linha) return null;
        const { a, b } = linha;
        return <g key={recurso.id} className={classe} {...dados}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="tec-emenda-toque" strokeWidth={px(16)} {...dados} />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="tec-emenda" strokeWidth={px(ativo ? 3.2 : 2.2)} strokeDasharray={`${px(9)} ${px(5)}`} {...dados} />
        </g>;
      }
      if (recurso.type === 'HOLE') return <circle key={recurso.id} cx={recurso.x} cy={recurso.y} r={recurso.diameterMm / 2} className={classe} strokeWidth={px(1.4)} {...dados} />;
      const giro = `rotate(${-recurso.rotationDeg} ${recurso.x} ${recurso.y})`;
      return <g key={recurso.id} className={classe} {...dados}>
        {recurso.shape === 'OVAL'
          ? <ellipse cx={recurso.x} cy={recurso.y} rx={recurso.widthMm / 2} ry={recurso.lengthMm / 2} transform={giro} strokeWidth={px(1.4)} {...dados} />
          : <rect x={recurso.x - recurso.widthMm / 2} y={recurso.y - recurso.lengthMm / 2} width={recurso.widthMm} height={recurso.lengthMm} rx={recurso.radiusMm} transform={giro} strokeWidth={px(1.4)} {...dados} />}
        <Texto x={recurso.x} y={recurso.y} tamanho={px(10)} angulo={anguloTexto} className="tec-recurso-rotulo" pointerEvents="none">{recurso.name}</Texto>
      </g>;
    })}

    {/* Nome e tamanho de cada área, por cima dos componentes e no maior trecho da área sem cuba/recorte. */}
    {areas.length > 0 && <g className="tec-areas-rotulos" pointerEvents="none">
      {areas.map((area, indice) => {
        if (peca.wetDryZones[area.indice]?.angleDeg) { const centro = geometriaDaArea(peca, area).centro; return <Texto key={indice} x={centro.x} y={centro.y} tamanho={px(10)} angulo={anguloTexto} className="tec-area-rotulo">{NOME_AREA[area.tipo]} · {formatMeasure(area.comprimentoMm)}</Texto>; }
        const ocupados = recursos.filter((recurso) => !recurso.edgeId).map((recurso) => {
          const meia = recurso.type === 'HOLE' ? recurso.diameterMm / 2 : Math.max(recurso.widthMm, recurso.lengthMm) / 2;
          return [recurso.x - meia, recurso.x + meia] as const;
        }).sort((a, b) => a[0] - b[0]);
        // Trechos livres dentro da área; sem nenhum, fica no meio dela.
        const livres: [number, number][] = [];
        let de = area.x0;
        for (const [a, b] of ocupados) { if (a > de) livres.push([de, Math.min(a, area.x1)]); de = Math.max(de, b); if (de >= area.x1) break; }
        if (de < area.x1) livres.push([de, area.x1]);
        const maior = livres.filter(([a, b]) => b > a).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
        const meioX = maior ? (maior[0] + maior[1]) / 2 : (area.x0 + area.x1) / 2, faixa = faixaDentroDaPeca(peca, meioX);
        if (!faixa) return null;
        // Texto na horizontal da tela: afasta da frente da peça o quanto a caixa do texto ocupa na direção dela (depende do giro).
        const texto = `${NOME_AREA[area.tipo]} · ${formatMeasure(area.comprimentoMm)}`, giro = peca.rotationDeg * Math.PI / 180;
        const recuo = Math.abs(px(texto.length * 3.1) * Math.sin(giro)) + Math.abs(px(6) * Math.cos(giro)) + px(6);
        return <Texto key={`rotulo-${indice}`} x={meioX} y={faixa.y0 + Math.min(recuo, (faixa.y1 - faixa.y0) / 2)} tamanho={px(10)} angulo={anguloTexto} className={`tec-area-rotulo ${area.tipo === 'WET' ? 'molhada' : 'seca'}`}>{texto}</Texto>;
      })}
    </g>}
    <CotasPeca peca={peca} recursos={recursos} escala={escala} mostrarDistancias={selecionada} />
    {/* Selecionada com cubas, as distâncias ocupam o meio: o nome sai para não embolar. */}
    {!(selecionada && embaixo.length) && (peca.name.trim() || peca.locked) && <Texto x={centro.x} y={centro.y} tamanho={px(12)} angulo={anguloTexto} className="tec-peca-nome" pointerEvents="none">{peca.locked ? '🔒 ' : ''}{peca.name}</Texto>}

    {/* Área de toque de cada lado: tocar abre a medida; com rodabanca/saia/acabamento escolhido, coloca nele. */}
    {peca.contour.map((vertice, indice) => {
      // Cursor de esticar na direção em que o lado anda ao ser puxado.
      const seguinte = peca.contour[(indice + 1) % peca.contour.length];
      const angulo = Math.abs(((Math.atan2(seguinte.y - vertice.y, seguinte.x - vertice.x) * 180 / Math.PI - peca.rotationDeg) % 180 + 180) % 180);
      const cursor = angulo < 30 || angulo > 150 ? 'ns-resize' : angulo > 60 && angulo < 120 ? 'ew-resize' : 'move';
      return <polyline key={`lado-${vertice.id}`} points={pontosSvg(pontosDoLado(peca, vertice.id))} className={`tec-lado${destacarLados ? ' destacado' : ''}`} style={peca.locked ? undefined : { cursor }}
        strokeWidth={px(22)} fill="none" data-alvo="lado" data-peca={peca.id} data-lado={vertice.id} />;
    })}
    {((selecionada && !peca.locked) || mostrarVertices) && peca.contour.map((vertice) => { const marcado = (selecao?.tipo === 'vertice' && selecao.verticeId === vertice.id) || verticeMarcado === vertice.id; return <circle key={vertice.id} cx={vertice.x} cy={vertice.y} r={px(marcado ? alca + 3 : alca)}
      className={`tec-vertice${marcado ? ' selecionado' : ''}`} strokeWidth={px(2)} data-alvo="vertice" data-peca={peca.id} data-vertice={vertice.id} />; })}
    {!peca.locked && peca.contour.map((vertice, indice) => {
      const meio = edgePoint(peca, vertice.id, edgeLength(peca, vertice.id) / 2), n = normais.get(vertice.id)!;
      const faixa = Math.max(0, ...recursos.filter(recurso => recurso.edgeId === vertice.id && ['BACKSPLASH', 'SKIRT'].includes(recurso.type)).map(recurso => Math.max(recurso.thicknessMm, 15)));
      const afastamento = faixa + px(60);
      const x = meio.x + n.x * afastamento, y = meio.y + n.y * afastamento;
      return <g key={`mais-${vertice.id}`} data-alvo="mais-lado" data-peca={peca.id} data-lado={vertice.id} className="tec-mais-lado" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); aoTocarLado(peca.id, vertice.id); } }} aria-label={`Opções do lado ${indice + 1}`}>
        <circle cx={x} cy={y} r={px(22)} fill="transparent" />
        <circle cx={x} cy={y} r={px(13)} fill="white" stroke="#937444" strokeWidth={px(1.5)} />
        <Texto x={x} y={y} tamanho={px(22)} angulo={anguloTexto} pointerEvents="none">+</Texto>
      </g>;
    })}
    {/* Bolinha de girar, presa em cima da peça selecionada (acima da medida de cima): segurar e arrastar gira em volta do centro. */}
    {girando && <g className="tec-girar">
      <line x1={(caixa.minX + caixa.maxX) / 2} y1={caixa.maxY + px(82)} x2={(caixa.minX + caixa.maxX) / 2} y2={caixa.maxY + px(94)} strokeWidth={px(1.6)} pointerEvents="none" />
      <circle cx={(caixa.minX + caixa.maxX) / 2} cy={caixa.maxY + px(106)} r={px(12)} strokeWidth={px(2)} className="tec-girar-bolinha" pointerEvents="none" />
      <Texto x={(caixa.minX + caixa.maxX) / 2} y={caixa.maxY + px(106)} tamanho={px(15)} angulo={anguloTexto} className="tec-girar-icone" pointerEvents="none">↻</Texto>
      <Texto x={(caixa.minX + caixa.maxX) / 2 + px(38)} y={caixa.maxY + px(106)} tamanho={px(12)} angulo={anguloTexto} className="tec-girar-graus" pointerEvents="none">{Math.round(peca.rotationDeg)}°</Texto>
      {/* Área de toque maior que a bolinha, para o dedo. */}
      <circle cx={(caixa.minX + caixa.maxX) / 2} cy={caixa.maxY + px(106)} r={px(22)} className="tec-girar-toque" data-alvo="girar" data-peca={peca.id} role="button" aria-label={`Girar ${peca.name || 'a peça'}`} />
    </g>}
    {/* Alças da cuba/recorte selecionado por último: ficam acima das distâncias e dos lados da peça. */}
    {recursoAtivo && !peca.locked && <BordasDoRecurso recurso={recursoAtivo} giro={`rotate(${-recursoAtivo.rotationDeg} ${recursoAtivo.x} ${recursoAtivo.y})`} px={px} giroPeca={peca.rotationDeg} />}
  </g>;
}
