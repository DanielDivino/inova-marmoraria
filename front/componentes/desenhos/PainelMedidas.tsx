'use client';

import { deletePiece, duplicatePiece, formatMeasure, nomeDaPeca, updatePiece, type Diagnostic, type Feature, type TechnicalDocument } from '@inova/domain/technical';
import { criarId } from '../../utilitarios/id';
import { CampoMedida } from './CampoMedida';
import { pontoDaCota } from './CotasLivres';
import { PainelPeca } from './PainelPeca';
import { PainelRecurso } from './PainelRecurso';
import { FONTE_TEXTO_PADRAO_MM, type MaterialVisual, type Selecao } from './tipos';

/** Painel de propriedades: o que estiver selecionado (peça, componente, vértice ou texto) e a conferência do desenho. */
export function PainelMedidas({ documento, selecao, materiais, diagnosticos, aoMudar, aoSelecionar, aoAbrirLado, aoMarcarArea }: {
  documento: TechnicalDocument; selecao: Selecao; materiais: MaterialVisual[]; diagnosticos: Diagnostic[];
  aoMudar: (documento: TechnicalDocument) => void; aoSelecionar: (selecao: Selecao) => void; aoAbrirLado: (pecaId: string, ladoId: string) => void;
  /** Liga a ferramenta de marcar área seca/molhada no desenho. */
  aoMarcarArea?: () => void;
}) {
  const peca = selecao?.tipo === 'peca' ? documento.pieces.find((entrada) => entrada.id === selecao.id) : undefined;
  const recurso = selecao?.tipo === 'recurso' ? documento.features.find((entrada) => entrada.id === selecao.id) : undefined;
  const paiDoRecurso = recurso && documento.pieces.find((entrada) => entrada.id === recurso.pieceId);
  const pecaDoVertice = selecao?.tipo === 'vertice' ? documento.pieces.find((entrada) => entrada.id === selecao.pecaId) : undefined;
  const vertice = selecao?.tipo === 'vertice' ? pecaDoVertice?.contour.find((entrada) => entrada.id === selecao.verticeId) : undefined;
  const texto = selecao?.tipo === 'texto' ? documento.annotations.find((entrada) => entrada.id === selecao.id) : undefined;

  const mudarRecurso = (id: string, patch: Partial<Feature>) => aoMudar({ ...documento, features: documento.features.map((entrada) => entrada.id === id ? { ...entrada, ...patch } : entrada) });
  const mudarContorno = (contour: NonNullable<typeof pecaDoVertice>['contour']) => pecaDoVertice && aoMudar(updatePiece(documento, pecaDoVertice.id, { contour, geometryMode: 'FREE', parameters: undefined }));

  return <div className="tec-painel">
    {peca && <PainelPeca key={peca.id} documento={documento} peca={peca} materiais={materiais} aoMudar={aoMudar} aoAbrirLado={(ladoId) => aoAbrirLado(peca.id, ladoId)} aoMarcarArea={aoMarcarArea}
      aoDuplicar={() => { const id = criarId(); aoMudar(duplicatePiece(documento, peca.id, id)); aoSelecionar({ tipo: 'peca', id }); }}
      aoExcluir={() => { if (window.confirm(`Excluir ${nomeDaPeca(peca, documento.pieces)}? Cubas, recortes e faixas dela também saem.`)) { aoMudar(deletePiece(documento, peca.id)); aoSelecionar(null); } }} />}
    {recurso && paiDoRecurso && <PainelRecurso key={recurso.id} recurso={recurso} peca={paiDoRecurso} nomePeca={nomeDaPeca(paiDoRecurso, documento.pieces)} aoMudar={(patch) => mudarRecurso(recurso.id, patch)}
      aoExcluir={() => { aoMudar({ ...documento, features: documento.features.filter((entrada) => entrada.id !== recurso.id) }); aoSelecionar(null); }} />}
    {vertice && pecaDoVertice && <section className="tec-painel-secao" aria-label="Vértice">
      <h3>Vértice {pecaDoVertice.contour.indexOf(vertice) + 1} · {pecaDoVertice.name}</h3>
      <label className="tec-campo">Curvatura do lado seguinte
        <input type="range" min="-1" max="1" step=".05" value={vertice.bulge} onChange={(evento) => mudarContorno(pecaDoVertice.contour.map((entrada) => entrada.id === vertice.id ? { ...entrada, bulge: Number(evento.target.value) } : entrada))} />
      </label>
      <small className="tec-dica">0 deixa o lado reto; perto de 1 ou −1 vira meio círculo para um lado ou para o outro.</small>
      <div className="tec-acoes">
        <button type="button" className="botao-contorno" onClick={() => mudarContorno(pecaDoVertice.contour.map((entrada) => entrada.id === vertice.id ? { ...entrada, bulge: 0 } : entrada))}>Tornar reto</button>
        <button type="button" className="botao-contorno" disabled={pecaDoVertice.contour.length <= 3} onClick={() => { mudarContorno(pecaDoVertice.contour.filter((entrada) => entrada.id !== vertice.id)); aoSelecionar({ tipo: 'peca', id: pecaDoVertice.id }); }}>Remover vértice</button>
      </div>
    </section>}
    {texto && <section className="tec-painel-secao" aria-label="Texto">
      <label className="tec-campo">Texto<textarea rows={3} value={texto.text} autoFocus onChange={(evento) => aoMudar({ ...documento, annotations: documento.annotations.map((entrada) => entrada.id === texto.id ? { ...entrada, text: evento.target.value || ' ' } : entrada) })} /></label>
      <CampoMedida rotulo="Tamanho da letra" valorMm={texto.fontSizeMm ?? FONTE_TEXTO_PADRAO_MM} onChange={(fontSizeMm) => aoMudar({ ...documento, annotations: documento.annotations.map((entrada) => entrada.id === texto.id ? { ...entrada, fontSizeMm } : entrada) })} />
      <small className="tec-dica">Arraste o texto no desenho para mudar de lugar. Sai igual no PDF técnico.</small>
      <button type="button" className="botao-contorno tec-perigo" onClick={() => { aoMudar({ ...documento, annotations: documento.annotations.filter((entrada) => entrada.id !== texto.id) }); aoSelecionar(null); }}>Excluir texto</button>
    </section>}
    {!peca && !recurso && !vertice && !texto && <section className="tec-painel-secao">
      <p className="tec-dica">Arraste um lado para esticar ou encolher a peça (os lados vizinhos acompanham). Toque num lado ou na medida para digitar outra; toque numa cuba ou num texto para editar. Com uma peça selecionada, Delete apaga (Ctrl+Z desfaz).</p>
      {documento.pieces.length > 0 && <div className="tec-lista-pecas">{documento.pieces.map((entrada) => <button type="button" key={entrada.id} className="botao-contorno" onClick={() => aoSelecionar({ tipo: 'peca', id: entrada.id })}>{entrada.locked ? '🔒 ' : ''}{nomeDaPeca(entrada, documento.pieces)}</button>)}</div>}
    </section>}
    {documento.dimensions.length > 0 && <section className="tec-painel-secao" aria-label="Cotas livres">
      <h3>Cotas livres</h3>
      {documento.dimensions.map((cota, indice) => {
        const a = pontoDaCota(documento, cota.from), b = pontoDaCota(documento, cota.to);
        return <div key={cota.id} className="tec-cota-livre">
          <span>Cota {indice + 1} · <strong>{a && b ? formatMeasure(Math.hypot(b.x - a.x, b.y - a.y)) : 'ponto removido'}</strong></span>
          <CampoMedida rotulo="Afastamento" minimo={-100000} valorMm={cota.offsetMm} onChange={(offsetMm) => aoMudar({ ...documento, dimensions: documento.dimensions.map((entrada) => entrada.id === cota.id ? { ...entrada, offsetMm } : entrada) })} />
          <button type="button" className="botao-contorno tec-perigo" aria-label={`Excluir cota ${indice + 1}`} onClick={() => aoMudar({ ...documento, dimensions: documento.dimensions.filter((entrada) => entrada.id !== cota.id) })}>Excluir</button>
        </div>;
      })}
    </section>}
    <section className="tec-conferencia" aria-label="Conferência">
      <h3>Conferência</h3>
      {diagnosticos.length ? diagnosticos.map((diagnostico, indice) => <p key={`${diagnostico.code}-${indice}`} className={diagnostico.severity.toLowerCase()}>{diagnostico.message}</p>) : <p className="ok">Geometria pronta para conferência.</p>}
    </section>
  </div>;
}
