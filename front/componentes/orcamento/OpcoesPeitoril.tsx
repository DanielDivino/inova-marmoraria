'use client';

import type { DraftComponent } from './types';
import { DetalhePeitorilDuplo } from './SillDetail';

/** Peitoril de duas pedras: a largura final é sempre a largura da peça
 * (a da linha do Orçamento Rápido) — nunca digitada de novo. Escolhida a
 * sobreposição (1 ou 2 cm), a soma das duas pedras (largura + sobreposição)
 * é dividida ao meio e o nível de balanço desloca centímetros de uma pedra
 * para a outra sem mudar a soma nem a largura final. */
export const larguraPeitorilPar = (finalWidthCm: string, overlapCm: string, deltaCm: number): { top: string; bottom: string } | undefined => {
  const final = Number(finalWidthCm.replace(',', '.'));
  const overlap = Number(overlapCm.replace(',', '.'));
  if (!Number.isFinite(final) || final <= 0 || !Number.isFinite(overlap) || overlap <= 0) return undefined;
  const metade = (final + overlap) / 2;
  const arredondar = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');
  return { top: arredondar(metade + deltaCm), bottom: arredondar(metade - deltaCm) };
};
/** Deriva o nível de balanço atual (cm que a pedra de cima tem a mais que a
 * metade) a partir das larguras já salvas, para o controle refletir o valor
 * certo ao reabrir um orçamento. */
export const deltaPeitorilAtual = (topCm: string | undefined, bottomCm: string | undefined) => {
  const top = Number((topCm ?? '').replace(',', '.'));
  const bottom = Number((bottomCm ?? '').replace(',', '.'));
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
  return Math.round((top - bottom) / 2);
};
/** Maior deslocamento possível sem zerar nenhuma das duas pedras (deixa ao
 * menos 1 cm de cada lado). */
export const limitePeitorilBalanco = (finalWidthCm: string, overlapCm: string) => {
  const final = Number(finalWidthCm.replace(',', '.'));
  const overlap = Number(overlapCm.replace(',', '.'));
  if (!Number.isFinite(final) || final <= 0 || !Number.isFinite(overlap) || overlap <= 0) return 0;
  return Math.max(0, Math.floor((final + overlap) / 2 - 1));
};

/** Peitoril de uma pedra só: sem sobreposição nem as larguras das duas pedras. */
const UMA_PEDRA: Partial<DraftComponent> = { sillOverlapCm: undefined, sillTopWidthCm: undefined, sillBottomWidthCm: undefined, sillFinalWidthCm: undefined };

/** Largura da peça mudou: com duas pedras, elas acompanham (mesma sobreposição e mesmo balanço). */
export function peitorilComLargura(component: DraftComponent, widthCm: string): Partial<DraftComponent> {
  if (component.componentType !== 'SILL' || !component.sillOverlapCm) return { widthCm };
  const par = larguraPeitorilPar(widthCm, component.sillOverlapCm, deltaPeitorilAtual(component.sillTopWidthCm, component.sillBottomWidthCm));
  return { widthCm, sillFinalWidthCm: widthCm, sillTopWidthCm: par?.top, sillBottomWidthCm: par?.bottom };
}

/** Opções do peitoril no Orçamento Rápido (Opções da peça): uma pedra ou duas pedras sobrepostas. */
export function OpcoesPeitoril({ component, onChange }: { component: DraftComponent; onChange: (patch: Partial<DraftComponent>) => void }) {
  const limite = component.sillOverlapCm ? limitePeitorilBalanco(component.widthCm, component.sillOverlapCm) : 0;
  const delta = deltaPeitorilAtual(component.sillTopWidthCm, component.sillBottomWidthCm);
  const escolherSobreposicao = (valor: string) => {
    const par = larguraPeitorilPar(component.widthCm, valor, deltaPeitorilAtual(component.sillTopWidthCm, component.sillBottomWidthCm));
    onChange({ sillOverlapCm: valor, sillFinalWidthCm: component.widthCm, sillTopWidthCm: par?.top, sillBottomWidthCm: par?.bottom });
  };
  const ajustarBalanco = (novoDelta: number) => {
    if (!component.sillOverlapCm) return;
    const par = larguraPeitorilPar(component.widthCm, component.sillOverlapCm, novoDelta);
    if (par) onChange({ sillTopWidthCm: par.top, sillBottomWidthCm: par.bottom });
  };
  return <div className="sill-detail-editor sill-detail-editor-duplo">
    <strong>Peitoril de duas pedras sobrepostas</strong>
    {component.sillOverlapCm && <button type="button" className="text-button sill-uma-pedra" onClick={() => onChange(UMA_PEDRA)}>Voltar a uma pedra só</button>}
    <small>A largura final é a largura da peça{component.widthCm ? ` (${component.widthCm} cm)` : ''}. Escolha a sobreposição; ajuste o nível se quiser tirar centímetros de uma pedra e passar para a outra.</small>
    <DetalhePeitorilDuplo topWidth={component.sillTopWidthCm} bottomWidth={component.sillBottomWidthCm} finalWidth={component.sillFinalWidthCm} overlap={component.sillOverlapCm} />
    <div className="sill-overlap-choice">
      <span>Sobreposição / encaixe</span>
      <div className="sill-overlap-buttons">
        {['1', '2'].map((valor) => <button key={valor} type="button" aria-pressed={component.sillOverlapCm === valor} onClick={() => escolherSobreposicao(valor)}>{valor} cm</button>)}
      </div>
      {!component.widthCm && <small>Informe a largura da peça, acima, para calcular as pedras.</small>}
    </div>
    {component.sillOverlapCm && limite > 0 && <div className="sill-balance">
      <span>Balanço entre as pedras</span>
      <div className="sill-balance-slider">
        <small>Pedra de cima: <strong>{component.sillTopWidthCm ?? '—'} cm</strong></small>
        <input type="range" aria-label="Balanço entre a pedra de cima e a de baixo" min={-limite} max={limite} step={1} value={-delta} onChange={(event) => ajustarBalanco(-Number(event.target.value))} />
        <small>Pedra de baixo: <strong>{component.sillBottomWidthCm ?? '—'} cm</strong></small>
      </div>
    </div>}
  </div>;
}
