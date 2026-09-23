import type { ProductionCutout, ProductionPiece } from '../../utilitarios/production-plan';

type Props = { pieces: ProductionPiece[]; cutouts: ProductionCutout[]; onChange: (cutouts: ProductionCutout[]) => void };
const cm = (mm?: number) => mm === undefined ? '' : String(mm / 10);
const decimal = (value: string) => { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) : undefined; };
const cutoutTypeLabels: Record<ProductionCutout['cutoutType'], string> = { SINK: 'Cuba retangular', SCULPTED_SINK: 'Cuba esculpida', OVAL_SINK: 'Cuba oval', COOKTOP: 'Cooktop', FAUCET_HOLE: 'Furo de torneira', GENERIC_HOLE: 'Furo genérico', OTHER: 'Outro' };

/**
 * Recortes/cubas em modo produção: só geometria (tipo, medidas, posição,
 * quantidade), sem preço nem cobrança — reaproveita o mesmo vocabulário de
 * tipos de recorte do orçamento comercial (ComplementosOrcamento), mas nunca
 * mostra valor calculado/final nem grava em serviceAppliedValues.
 */
export function RecortesProducao({ pieces, cutouts, onChange }: Props) {
  const add = (pieceId: string) => onChange([...cutouts, { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, pieceId, cutoutType: 'SINK', label: 'Recorte / cuba', quantity: 1 }]);
  const patch = (id: string, changes: Partial<ProductionCutout>) => onChange(cutouts.map((cutout) => cutout.id === id ? { ...cutout, ...changes } : cutout));
  const remove = (id: string) => onChange(cutouts.filter((cutout) => cutout.id !== id));
  if (!pieces.length) return null;
  return <section className="production-cutouts">
    <strong>Recortes e cubas de produção</strong>
    <small>Só geometria — o valor cobrado já está definido no Orçamento Rápido.</small>
    {cutouts.map((cutout) => <div className="cutout-row production-cutout-row" key={cutout.id}>
      <label>Peça<select aria-label="Peça do recorte" value={cutout.pieceId} onChange={(event) => patch(cutout.id, { pieceId: event.target.value })}>{pieces.map((piece, index) => <option key={piece.id} value={piece.id}>{piece.label || `Peça ${index + 1}`}</option>)}</select></label>
      <label>Tipo<select aria-label="Tipo de recorte ou cuba de produção" value={cutout.cutoutType} onChange={(event) => patch(cutout.id, { cutoutType: event.target.value as ProductionCutout['cutoutType'] })}>{Object.entries(cutoutTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Descrição<input value={cutout.label} onChange={(event) => patch(cutout.id, { label: event.target.value })} placeholder="Descrição" /></label>
      <label>Medidas<select aria-label="Definição das medidas do recorte de produção" value={cutout.sizePending ? 'PENDING' : 'DEFINED'} onChange={(event) => patch(cutout.id, { sizePending: event.target.value === 'PENDING', ...(event.target.value === 'PENDING' ? { lengthMm: undefined, widthMm: undefined, diameterMm: undefined } : {}) })}><option value="DEFINED">Informar medidas</option><option value="PENDING">A definir com o cliente</option></select></label>
      {!cutout.sizePending && !['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType) && <><label>Comprimento (cm)<input inputMode="decimal" value={cm(cutout.lengthMm)} onChange={(event) => patch(cutout.id, { lengthMm: decimal(event.target.value) })} placeholder="Comprimento (cm)" /></label>
        <label>Largura (cm)<input inputMode="decimal" value={cm(cutout.widthMm)} onChange={(event) => patch(cutout.id, { widthMm: decimal(event.target.value) })} placeholder="Largura (cm)" /></label></>}
      {!cutout.sizePending && ['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType) && <label>Diâmetro (cm)<input aria-label="Diâmetro do furo de produção (cm)" inputMode="decimal" value={cm(cutout.diameterMm)} onChange={(event) => patch(cutout.id, { diameterMm: decimal(event.target.value) })} placeholder="Diâmetro (cm)" /></label>}
      <label>Quantidade<input aria-label="Quantidade do recorte de produção" type="number" min="1" value={cutout.quantity} onChange={(event) => patch(cutout.id, { quantity: Math.max(1, Number(event.target.value)) })} /></label>
      <details className="cutout-position"><summary>Posição {cutout.positionXMm || cutout.positionYMm ? 'personalizada' : 'centralizada'}</summary><div>
        <label>Centro a partir do Esquerdo (cm)<input inputMode="decimal" value={cm(cutout.positionXMm)} onChange={(event) => patch(cutout.id, { positionXMm: decimal(event.target.value) })} placeholder="Posição X (cm)" /></label>
        <label>Centro a partir do Superior (cm)<input inputMode="decimal" value={cm(cutout.positionYMm)} onChange={(event) => patch(cutout.id, { positionYMm: decimal(event.target.value) })} placeholder="Posição Y (cm)" /></label>
      </div></details>
      <button type="button" onClick={() => remove(cutout.id)}>Remover</button>
    </div>)}
    <button type="button" className="text-button" onClick={() => add(pieces[0].id)}>+ Adicionar recorte/cuba</button>
  </section>;
}
