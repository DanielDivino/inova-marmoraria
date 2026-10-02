'use client';

import { useId, useState, type ReactNode } from 'react';
import { Icone, useCelular, type NomeIcone } from './filtros/Filtros';

/** Recolhe detalhes no celular sem desmontar os campos nem perder alterações. */
export function SecaoRecolhivel({ titulo, rotulo, icone, className = '', children }: {
  titulo: string; rotulo?: string; icone?: NomeIcone; className?: string; children: ReactNode;
}) {
  const celular = useCelular();
  const [aberta, setAberta] = useState(false);
  const id = useId();
  const expandida = !celular || aberta;
  return <section className={`secao-recolhivel ${className}`} aria-label={rotulo ?? titulo}>
    <h2><button type="button" aria-expanded={expandida} aria-controls={id} tabIndex={celular ? 0 : -1} onClick={() => { if (celular) setAberta(valor => !valor); }}>
      {icone && <Icone nome={icone} tamanho={18} />}<span>{titulo}</span><Icone nome="seta" tamanho={18} />
    </button></h2>
    <div id={id} hidden={!expandida}>{children}</div>
  </section>;
}
