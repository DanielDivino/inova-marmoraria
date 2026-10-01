'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { campoMetrosInicial, editarCampoMetros, type CampoMetros } from '../../utilitarios/quick-quote';

/** mm → campo em metros ("2,44"; com milímetros, "0,035"), no mesmo formato do Orçamento Rápido. */
export function campoDeMm(mm: number): CampoMetros {
  const campo = campoMetrosInicial(String(Math.abs(mm) / 10));
  return mm < 0 && campo.texto ? { ...campo, texto: `-${campo.texto}` } : campo;
}
/** Texto do campo em metros → mm; null quando vazio. */
export function metrosParaMm(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (!limpo || limpo === '-') return null;
  const metros = Number(limpo);
  return Number.isFinite(metros) ? Math.round(metros * 10000) / 10 : null;
}

/**
 * Medida em metros só com números, como no Orçamento Rápido: a vírgula entra
 * sozinha (240 → 2,40) e, se a vírgula for digitada, vale como está (até 3 casas).
 * Com `negativo`, um "-" no começo é aceito (posições).
 */
export function EntradaMetros({ valor, aoMudar, negativo = false, ...resto }: { valor: CampoMetros; aoMudar: (campo: CampoMetros) => void; negativo?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input type="text" inputMode="decimal" placeholder="0,00" {...resto} value={valor.texto} onChange={(evento) => {
    const digitacao = evento.nativeEvent as InputEvent;
    const bruto = evento.target.value;
    const sinal = negativo && bruto.trimStart().startsWith('-') ? '-' : '';
    const proximo = editarCampoMetros({ ...valor, texto: valor.texto.replace(/^-/, '') }, bruto.replace('-', ''), { tipo: digitacao.inputType, dado: digitacao.data === '-' ? '' : digitacao.data });
    aoMudar({ texto: sinal + proximo.texto, livre: proximo.livre });
  }} />;
}

/**
 * Campo de medida do editor: mostra e recebe metros (só números), guarda mm e
 * confirma ao sair do campo ou no Enter. Se `onChange` devolver false (medida
 * recusada), o campo volta para a medida atual.
 */
export function CampoMedida({ rotulo, valorMm, minimo = 1, autoFocus, onChange }: { rotulo: string; valorMm: number; minimo?: number; autoFocus?: boolean; onChange: (mm: number) => void | boolean }) {
  const [campo, setCampo] = useState(() => campoDeMm(valorMm));
  const focado = useRef(false);
  useEffect(() => { if (!focado.current) setCampo(campoDeMm(valorMm)); }, [valorMm]);
  const confirmar = () => {
    const mm = metrosParaMm(campo.texto);
    if (mm !== null && mm >= minimo) setCampo(campoDeMm(Math.abs(mm - valorMm) > .05 && onChange(mm) === false ? valorMm : mm));
    else setCampo(campoDeMm(valorMm));
  };
  return <label className="tec-campo">{rotulo}
    <span className="tec-campo-metros">
      <EntradaMetros aria-label={rotulo} valor={campo} aoMudar={setCampo} negativo={minimo < 0} autoFocus={autoFocus}
        onFocus={(evento) => { focado.current = true; evento.target.select(); }} onBlur={() => { focado.current = false; confirmar(); }}
        onKeyDown={(evento) => { if (evento.key === 'Enter') (evento.target as HTMLInputElement).blur(); }} />
      <i aria-hidden="true">m</i>
    </span>
  </label>;
}
