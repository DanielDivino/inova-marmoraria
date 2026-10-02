'use client';

import { formatMeasure, rotate, type Feature, type ParteDaPeca, type Piece } from '@inova/domain/technical';
import { CampoMedida } from './CampoMedida';
import { RECURSOS_DE_BORDA, ROTULO_PERFIL, ROTULO_RECURSO } from './tipos';

/** De qual ponta do lado a emenda é medida, como se vê na tela (o lado começa no vértice dele). */
function pontaDoLado(peca: Piece, ladoId?: string) {
  const indice = peca.contour.findIndex((vertice) => vertice.id === ladoId);
  if (indice < 0) return 'do início do lado';
  const a = peca.contour[indice], b = peca.contour[(indice + 1) % peca.contour.length];
  const sentido = rotate({ x: b.x - a.x, y: b.y - a.y }, peca.rotationDeg);
  return Math.abs(sentido.x) >= Math.abs(sentido.y) ? (sentido.x > 0 ? 'da ponta esquerda' : 'da ponta direita') : (sentido.y > 0 ? 'da ponta de baixo' : 'da ponta de cima');
}

/** Emenda: onde começa no lado e as pedras em que a peça fica dividida. */
function PainelEmenda({ recurso, peca, nomePeca, pedras, aoMudar, aoExcluir }: { recurso: Feature; peca: Piece; nomePeca: string; pedras: ParteDaPeca[]; aoMudar: (patch: Partial<Feature>) => void; aoExcluir: () => void }) {
  return <section className="tec-painel-secao" aria-label="Emenda">
    <small className="tec-dica">Emenda em {nomePeca} · lado {peca.contour.findIndex((vertice) => vertice.id === recurso.edgeId) + 1}: corta a peça de lado a lado. O valor do orçamento não muda; as pedras saem na ordem de serviço, no fluxo e na entrega.</small>
    <div className="tec-grade-campos">
      <CampoMedida rotulo={`Distância ${pontaDoLado(peca, recurso.edgeId)}`} minimo={1} valorMm={recurso.startMm} onChange={(startMm) => aoMudar({ startMm })} />
    </div>
    <p className="tec-pedras" aria-label="Pedras da peça"><strong>{pedras.length} {pedras.length === 1 ? 'pedra' : 'pedras'}</strong>{pedras.map((pedra, indice) => <span key={indice}>{indice + 1}. {formatMeasure(pedra.comprimentoMm)} × {formatMeasure(pedra.larguraMm)}</span>)}</p>
    <button type="button" className="botao-contorno tec-perigo" onClick={aoExcluir}>Excluir emenda</button>
  </section>;
}

/** Propriedades de cuba, recorte, furo, rodabanca, saia ou acabamento de borda (posição e tamanho digitados); a emenda tem o painel dela. */
export function PainelRecurso({ recurso, peca, nomePeca, pedras = [], aoMudar, aoExcluir }: { recurso: Feature; peca: Piece; nomePeca: string; pedras?: ParteDaPeca[]; aoMudar: (patch: Partial<Feature>) => void; aoExcluir: () => void }) {
  if (recurso.type === 'SEAM') return <PainelEmenda recurso={recurso} peca={peca} nomePeca={nomePeca} pedras={pedras} aoMudar={aoMudar} aoExcluir={aoExcluir} />;
  const deBorda = RECURSOS_DE_BORDA.includes(recurso.type);
  const numero = (rotulo: string, valor: number, patch: (n: number) => Partial<Feature>, passo = 1) =>
    <label className="tec-campo">{rotulo}<input type="number" inputMode="decimal" step={passo} value={valor} onChange={(evento) => aoMudar(patch(Number(evento.target.value) || 0))} /></label>;
  return <section className="tec-painel-secao" aria-label={ROTULO_RECURSO[recurso.type]}>
    <label className="tec-campo">Nome<input value={recurso.name} placeholder={`Sem nome (aparece como ${ROTULO_RECURSO[recurso.type]})`} onChange={(evento) => aoMudar({ name: evento.target.value })} /></label>
    <small className="tec-dica">{ROTULO_RECURSO[recurso.type]} em {nomePeca}{deBorda ? ` · lado ${peca.contour.findIndex((vertice) => vertice.id === recurso.edgeId) + 1}` : recurso.type === 'HOLE' ? '' : ' · puxe as bordas no desenho para mudar o tamanho'}</small>
    {deBorda ? <div className="tec-grade-campos">
      <CampoMedida rotulo="Início no lado" minimo={0} valorMm={recurso.startMm} onChange={(startMm) => aoMudar({ startMm })} />
      <CampoMedida rotulo="Extensão" valorMm={recurso.extentMm} onChange={(extentMm) => aoMudar({ extentMm })} />
      {recurso.type !== 'EDGE_FINISH' && <CampoMedida rotulo="Altura" valorMm={recurso.heightMm} onChange={(heightMm) => aoMudar({ heightMm })} />}
      <CampoMedida rotulo="Espessura" valorMm={recurso.thicknessMm} onChange={(thicknessMm) => aoMudar({ thicknessMm })} />
      <label className="tec-campo">Perfil<select value={recurso.profile} onChange={(evento) => aoMudar({ profile: evento.target.value as Feature['profile'] })}>
        {Object.entries(ROTULO_PERFIL).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
      </select></label>
    </div> : <div className="tec-grade-campos">
      <CampoMedida rotulo="Centro X" minimo={-100000} valorMm={recurso.x} onChange={(x) => aoMudar({ x })} />
      <CampoMedida rotulo="Centro Y" minimo={-100000} valorMm={recurso.y} onChange={(y) => aoMudar({ y })} />
      {recurso.type === 'HOLE' ? <CampoMedida rotulo="Diâmetro" valorMm={recurso.diameterMm} onChange={(diameterMm) => aoMudar({ diameterMm })} /> : <>
        {/* Largura e comprimento lado a lado; também mudam puxando as bordas no desenho. */}
        <CampoMedida rotulo="Largura" valorMm={recurso.widthMm} onChange={(widthMm) => aoMudar({ widthMm })} />
        <CampoMedida rotulo="Comprimento" valorMm={recurso.lengthMm} onChange={(lengthMm) => aoMudar({ lengthMm })} />
        <label className="tec-campo">Formato<select value={recurso.shape} onChange={(evento) => aoMudar({ shape: evento.target.value as Feature['shape'] })}><option value="RECTANGLE">Retangular</option><option value="OVAL">Oval</option></select></label>
        {numero('Giro (graus)', recurso.rotationDeg, (rotationDeg) => ({ rotationDeg }))}
      </>}
      {(recurso.type === 'SINK' || recurso.type === 'SCULPTED_SINK') && <CampoMedida rotulo="Profundidade" valorMm={recurso.depthMm} onChange={(depthMm) => aoMudar({ depthMm })} />}
      {recurso.type === 'SCULPTED_SINK' && <>
        <CampoMedida rotulo="Parede" valorMm={recurso.wallMm} onChange={(wallMm) => aoMudar({ wallMm })} />
        <CampoMedida rotulo="Fundo" valorMm={recurso.bottomMm} onChange={(bottomMm) => aoMudar({ bottomMm })} />
        <CampoMedida rotulo="Ralo X" minimo={-10000} valorMm={recurso.drainX} onChange={(drainX) => aoMudar({ drainX })} />
        <CampoMedida rotulo="Ralo Y" minimo={-10000} valorMm={recurso.drainY} onChange={(drainY) => aoMudar({ drainY })} />
        {numero('Caimento (%)', recurso.slopePercent, (slopePercent) => ({ slopePercent: Math.min(30, Math.max(0, slopePercent)) }), .5)}
      </>}
    </div>}
    <button type="button" className="botao-contorno tec-perigo" onClick={aoExcluir}>Excluir {ROTULO_RECURSO[recurso.type].toLowerCase()}</button>
  </section>;
}
