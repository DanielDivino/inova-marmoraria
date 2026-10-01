'use client';

import type { Feature, Piece } from '@inova/domain/technical';
import { CampoMedida } from './CampoMedida';
import { RECURSOS_DE_BORDA, ROTULO_PERFIL, ROTULO_RECURSO } from './tipos';

/** Propriedades de cuba, recorte, furo, rodabanca, saia ou acabamento de borda (posição e tamanho digitados). */
export function PainelRecurso({ recurso, peca, nomePeca, aoMudar, aoExcluir }: { recurso: Feature; peca: Piece; nomePeca: string; aoMudar: (patch: Partial<Feature>) => void; aoExcluir: () => void }) {
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
