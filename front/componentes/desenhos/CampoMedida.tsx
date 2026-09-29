'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMeasure, parseFriendlyMeasure } from '@inova/domain/technical';

/** Medida no formato dos marmoristas: aceita "1m15", "115cm", "1,15m" ou "1150" (mm) e mostra "1m15". */
export function CampoMedida({ rotulo, valorMm, minimo = 1, autoFocus, onChange }: { rotulo: string; valorMm: number; minimo?: number; autoFocus?: boolean; onChange: (mm: number) => void }) {
  const [texto, setTexto] = useState(() => formatMeasure(valorMm));
  const focado = useRef(false);
  useEffect(() => { if (!focado.current) setTexto(formatMeasure(valorMm)); }, [valorMm]);
  const confirmar = () => {
    const lido = parseFriendlyMeasure(texto);
    if (lido !== null && lido >= minimo) { if (Math.abs(lido - valorMm) > .05) onChange(Math.round(lido * 10) / 10); }
    else setTexto(formatMeasure(valorMm));
  };
  return <label className="tec-campo">{rotulo}
    <input type="text" inputMode="decimal" placeholder="ex.: 1m15" value={texto} autoFocus={autoFocus} aria-label={rotulo}
      onFocus={(evento) => { focado.current = true; evento.target.select(); }} onChange={(evento) => setTexto(evento.target.value)}
      onBlur={() => { focado.current = false; confirmar(); }} onKeyDown={(evento) => { if (evento.key === 'Enter') (evento.target as HTMLInputElement).blur(); }} />
  </label>;
}
