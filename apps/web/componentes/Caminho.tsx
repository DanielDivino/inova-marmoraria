'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { useVoltarNoTopo } from './ApplicationShell';
import type { ItemCaminho } from '../utilitarios/rotas';

/**
 * Caminho no topo da tela (ex.: Fluxo de trabalho › ORC-2026-30). O último item é também
 * a seta de voltar do celular, na barra de cima.
 */
export function Caminho({ itens, atual }: { itens: ItemCaminho[]; atual?: string }) {
  useVoltarNoTopo(itens.at(-1) ?? null);
  return <nav aria-label="Caminho" className="caminho">{itens.map((item, indice) => <Fragment key={item.href + item.rotulo}>{indice > 0 && <span aria-hidden="true">›</span>}<Link href={item.href}>{item.rotulo}</Link></Fragment>)}
    {atual ? <><span aria-hidden="true">›</span><span className="caminho-atual" aria-current="page">{atual}</span></> : <span aria-hidden="true">›</span>}</nav>;
}
