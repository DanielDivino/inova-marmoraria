import { useState } from 'react';
import { edgeSideLabels } from '@inova/domain';
import type { ProductionEdgeSide } from '../../utilitarios/production-plan';

type Props = { label: string; onConfirm: (side: Exclude<ProductionEdgeSide, 'CUSTOM'>, heightMm: number) => void };
const sides: Exclude<ProductionEdgeSide, 'CUSTOM'>[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];

/** "Seguir divisão da bancada": cria uma rodabanca/saia/vista por peça já
 * dividida, com o comprimento de cada uma — só pede o lado e a altura. */
export function SeguirDivisaoRodabanca({ label, onConfirm }: Props) {
  const [side, setSide] = useState<Exclude<ProductionEdgeSide, 'CUSTOM'>>('FRONT');
  const [height, setHeight] = useState('10');
  const heightMm = Math.round(Number(height.replace(',', '.')) * 10);
  return <div className="follow-split-backsplash">
    <strong>{label} — Seguir divisão</strong>
    <label>Em qual lado será aplicada?<select aria-label={`Lado da rodabanca — ${label}`} value={side} onChange={(event) => setSide(event.target.value as typeof side)}>{sides.map((value) => <option key={value} value={value}>{edgeSideLabels[value]}</option>)}</select></label>
    <label>Altura (cm)<input inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="10" /></label>
    <button type="button" className="secondary-button" disabled={!(heightMm > 0)} onClick={() => onConfirm(side, heightMm)}>Criar rodabanca seguindo a divisão</button>
  </div>;
}
