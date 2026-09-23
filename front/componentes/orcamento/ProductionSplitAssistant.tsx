import { useState } from 'react';
import { componentTypeLabels } from '@inova/domain';
import { validarDivisao, calcularUltimaPeca, type ProductionPlan, type ProductionSource, type ProductionPiece } from '../../utilitarios/production-plan';

type ComponentSnapshot = { label: string; componentType: ProductionPiece['componentType']; orientation: ProductionPiece['orientation']; edges: ProductionPiece['edges'] };
type Props = {
  plan: ProductionPlan;
  componentSnapshots: Record<string, ComponentSnapshot>;
  onSplitEqual: (source: ProductionSource, snapshot: ComponentSnapshot, parts: number) => void;
  onSplitManual: (source: ProductionSource, snapshot: ComponentSnapshot, lengthsMm: number[]) => void;
  onReconcile: (source: ProductionSource) => void;
  onDismissReview: (source: ProductionSource) => void;
  onResetSplit: (source: ProductionSource) => void;
};
const metros = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const paraMm = (metrosStr: string) => { const parsed = Number(metrosStr.replace(',', '.')); return Number.isFinite(parsed) ? Math.round(parsed * 1000) : 0; };

function AssistenteDivisao({ source, snapshot, onSplitEqual, onSplitManual }: { source: ProductionSource; snapshot: ComponentSnapshot; onSplitEqual: Props['onSplitEqual']; onSplitManual: Props['onSplitManual'] }) {
  const totalMm = source.splitAxis === 'LENGTH' ? source.snapshotLengthMm : source.snapshotWidthMm;
  const [manual, setManual] = useState(false);
  const [partes, setPartes] = useState<string[]>(['', '']);
  const medidasMm = partes.map(paraMm);
  const preenchidas = medidasMm.filter((value) => value > 0);
  const resultado = preenchidas.length ? validarDivisao(totalMm, preenchidas) : null;
  const usarRestante = (index: number) => {
    const anteriores = medidasMm.slice(0, index).filter((value) => value > 0);
    try { setPartes(partes.map((value, current) => current === index ? metros(calcularUltimaPeca(totalMm, anteriores)) : value)); } catch { /* nada restante: ignora */ }
  };
  return <div className="split-assistant-source">
    <div className="split-assistant-available">Disponível: <strong>{metros(source.snapshotLengthMm)} × {metros(source.snapshotWidthMm)} m</strong>{source.snapshotQuantity > 1 && <span> · {source.snapshotQuantity} peças iguais</span>}</div>
    {!manual && <>
      <p className="split-assistant-question">Em quantas peças?</p>
      <div className="split-assistant-quick">
        {[1, 2, 3, 4].map((n) => <button key={n} type="button" onClick={() => onSplitEqual(source, snapshot, n)}>{n}</button>)}
        <button type="button" onClick={() => { setManual(true); setPartes(['', '']); }}>+ Manual</button>
      </div>
    </>}
    {manual && <div className="split-assistant-manual">
      {partes.map((value, index) => <div className="split-assistant-manual-row" key={index}>
          <label>Peça {index + 1} (m)
            <input inputMode="decimal" value={value} onChange={(event) => setPartes(partes.map((current, i) => i === index ? event.target.value : current))} placeholder="0,00" />
          </label>
          {index === partes.length - 1 && <button type="button" className="text-button" onClick={() => usarRestante(index)}>Usar restante</button>}
        </div>)}
      <div className="split-assistant-actions">
        <button type="button" className="text-button" onClick={() => setPartes([...partes, ''])}>+ Adicionar peça</button>
        {partes.length > 2 && <button type="button" className="text-button" onClick={() => setPartes(partes.slice(0, -1))}>Remover última</button>}
      </div>
      {resultado && <p className={`split-assistant-status split-assistant-status-${resultado.status}`}>
        {resultado.status === 'completo' && `Utilizado: ${metros(resultado.usadoMm)} / ${metros(totalMm)} m · Restante: 0,00 m`}
        {resultado.status === 'incompleto' && `Utilizado: ${metros(resultado.usadoMm)} / ${metros(totalMm)} m · Restante: ${metros(resultado.restanteMm)} m`}
        {resultado.status === 'excedeu' && `Excedeu: ${metros(resultado.excedenteMm)} m`}
      </p>}
      <button type="button" className="primary-compact-button" disabled={resultado?.status !== 'completo'} onClick={() => resultado?.status === 'completo' && onSplitManual(source, snapshot, medidasMm)}>Confirmar divisão</button>
      <button type="button" className="text-button" onClick={() => setManual(false)}>Cancelar</button>
    </div>}
  </div>;
}

/** Assistente de divisão: uma peça de produção por componente comercial ainda
 * não dividido oferece [1][2][3][4][+manual]; um componente já dividido (mais
 * de uma peça) mostra a lista de peças resultantes em vez do assistente. */
export function AssistenteDivisaoProducao({ plan, componentSnapshots, onSplitEqual, onSplitManual, onReconcile, onDismissReview, onResetSplit }: Props) {
  return <div className="split-assistant">
    {plan.sources.map((source) => {
      const snapshot = componentSnapshots[source.componentId];
      if (!snapshot) return null;
      const pecas = plan.pieces.filter((piece) => piece.sourceComponentId === source.componentId && !piece.parentPieceId);
      const dividido = pecas.length > 1;
      return <div className="split-assistant-card" key={source.componentId}>
        <strong>{snapshot.label || componentTypeLabels[snapshot.componentType]}</strong>
        {source.needsReview && <div className="split-assistant-review" role="alert">
          <p>O orçamento comercial mudou depois do detalhamento. Revise a divisão das peças.</p>
          <button type="button" className="secondary-button" onClick={() => onReconcile(source)}>Reconciliar</button>
          <button type="button" className="text-button" onClick={() => onDismissReview(source)}>Manter desenho e revisar manualmente</button>
        </div>}
        {dividido ? <div className="split-assistant-result">
          <ul className="split-assistant-pieces">{pecas.map((piece, index) => <li key={piece.id}>{index + 1}. {metros(piece.lengthMm)} × {metros(piece.widthMm)} m{piece.quantity > 1 ? ` ×${piece.quantity}` : ''}</li>)}</ul>
          <button type="button" className="text-button" onClick={() => { if (window.confirm('Reiniciar a divisão desta peça? As peças atuais (e seus acabamentos/recortes de produção) serão substituídas por uma peça única, para dividir de novo.')) onResetSplit(source); }}>← Reiniciar divisão</button>
        </div>
          : <AssistenteDivisao source={source} snapshot={snapshot} onSplitEqual={onSplitEqual} onSplitManual={onSplitManual} />}
      </div>;
    })}
  </div>;
}
