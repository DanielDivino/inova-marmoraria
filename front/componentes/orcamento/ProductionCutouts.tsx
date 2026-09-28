import type { ProductionCutout } from '../../utilitarios/production-plan';
import { criarId } from '../../utilitarios/id';

const cm = (mm?: number) => mm === undefined ? '' : String(mm / 10);
const decimal = (value: string) => { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) : undefined; };
const cutoutTypeLabels: Record<ProductionCutout['cutoutType'], string> = { SINK: 'Cuba retangular', SCULPTED_SINK: 'Cuba esculpida', OVAL_SINK: 'Cuba oval', COOKTOP: 'Cooktop', FAUCET_HOLE: 'Furo de torneira', GENERIC_HOLE: 'Furo genérico', OTHER: 'Outro' };

const furo = (cutout: ProductionCutout) => ['FAUCET_HOLE', 'GENERIC_HOLE'].includes(cutout.cutoutType);

/**
 * Recortes/cubas de uma peça de produção, dentro do cartão da peça (etapa 1):
 * só geometria (tipo, medidas, quantidade, posição), sem preço nem cobrança —
 * o valor cobrado continua definido no Orçamento Rápido.
 */
export function RecortesDaPeca({ pieceId, cutouts, onChange }: { pieceId: string; cutouts: ProductionCutout[]; onChange: (cutouts: ProductionCutout[]) => void }) {
  const daPeca = cutouts.filter((cutout) => cutout.pieceId === pieceId);
  const add = () => onChange([...cutouts, { id: criarId(), pieceId, cutoutType: 'SINK', label: 'Recorte / cuba', quantity: 1 }]);
  const patch = (id: string, changes: Partial<ProductionCutout>) => onChange(cutouts.map((cutout) => cutout.id === id ? { ...cutout, ...changes } : cutout));
  const remove = (id: string) => onChange(cutouts.filter((cutout) => cutout.id !== id));
  return <div className="recortes-peca">
    {daPeca.map((cutout, index) => <div className="recorte-peca" key={cutout.id}>
      <select aria-label={`Tipo do recorte ${index + 1}`} value={cutout.cutoutType} onChange={(event) => patch(cutout.id, { cutoutType: event.target.value as ProductionCutout['cutoutType'] })}>{Object.entries(cutoutTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label={`Medidas do recorte ${index + 1}`} value={cutout.sizePending ? 'PENDING' : 'DEFINED'} onChange={(event) => patch(cutout.id, { sizePending: event.target.value === 'PENDING', ...(event.target.value === 'PENDING' ? { lengthMm: undefined, widthMm: undefined, diameterMm: undefined } : {}) })}><option value="DEFINED">Com medidas</option><option value="PENDING">A definir</option></select>
      {!cutout.sizePending && !furo(cutout) && <span className="recorte-peca-medidas"><input aria-label={`Comprimento do recorte ${index + 1} (cm)`} inputMode="decimal" value={cm(cutout.lengthMm)} onChange={(event) => patch(cutout.id, { lengthMm: decimal(event.target.value) })} placeholder="Comp." />×<input aria-label={`Largura do recorte ${index + 1} (cm)`} inputMode="decimal" value={cm(cutout.widthMm)} onChange={(event) => patch(cutout.id, { widthMm: decimal(event.target.value) })} placeholder="Larg." />cm</span>}
      {!cutout.sizePending && furo(cutout) && <span className="recorte-peca-medidas">Ø<input aria-label={`Diâmetro do recorte ${index + 1} (cm)`} inputMode="decimal" value={cm(cutout.diameterMm)} onChange={(event) => patch(cutout.id, { diameterMm: decimal(event.target.value) })} placeholder="Ø" />cm</span>}
      <label className="recorte-peca-qtd">Qtd<input aria-label={`Quantidade do recorte ${index + 1}`} type="number" min="1" value={cutout.quantity} onChange={(event) => patch(cutout.id, { quantity: Math.max(1, Number(event.target.value)) })} /></label>
      {/* Posição e descrição ficam recolhidas: o recorte ocupa uma linha só. */}
      <details className="recorte-peca-posicao"><summary title="Posição e descrição">Mais{cutout.positionXMm || cutout.positionYMm ? ' · posição própria' : ''}</summary><div>
        <input className="recorte-peca-descricao" aria-label={`Descrição do recorte ${index + 1}`} value={cutout.label} onChange={(event) => patch(cutout.id, { label: event.target.value })} placeholder="Descrição (opcional)" />
        <label>Centro a partir do Esquerdo (cm)<input inputMode="decimal" value={cm(cutout.positionXMm)} onChange={(event) => patch(cutout.id, { positionXMm: decimal(event.target.value) })} placeholder="X (cm)" /></label>
        <label>Centro a partir do Superior (cm)<input inputMode="decimal" value={cm(cutout.positionYMm)} onChange={(event) => patch(cutout.id, { positionYMm: decimal(event.target.value) })} placeholder="Y (cm)" /></label>
      </div></details>
      <button type="button" className="recorte-peca-remover" aria-label={`Remover recorte ${index + 1}`} onClick={() => remove(cutout.id)}>×</button>
    </div>)}
    <button type="button" className="text-button recorte-peca-adicionar" onClick={add}>+ Recorte / cuba</button>
  </div>;
}
