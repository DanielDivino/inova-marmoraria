'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { campoMetrosInicial, editarCampoMetros, metrosParaCentimetrosRascunho } from '../../utilitarios/quick-quote';

/**
 * Medida em metros; `value` e `onChange` usam centímetros (como o rascunho).
 * Só números: a vírgula entra sozinha (120 → 1,20). Vírgula digitada vale como está.
 */
export function CampoMetros({ value, onChange, label, onKeyDown, id }: { value: string; onChange: (value: string) => void; label: string; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void; id?: string }) {
  const [campo, setCampo] = useState(() => campoMetrosInicial(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setCampo(campoMetrosInicial(value)); }, [value]);
  return <input id={id} aria-label={label} inputMode="decimal" enterKeyHint="next" value={campo.texto} placeholder="0,00" onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setCampo(campoMetrosInicial(value)); }} onChange={event => {
    const digitacao = event.nativeEvent as InputEvent;
    const proximo = editarCampoMetros(campo, event.target.value, { tipo: digitacao.inputType, dado: digitacao.data });
    setCampo(proximo); onChange(metrosParaCentimetrosRascunho(proximo.texto));
  }} onKeyDown={onKeyDown} />;
}
