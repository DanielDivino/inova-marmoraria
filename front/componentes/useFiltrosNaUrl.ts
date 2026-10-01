'use client';

import { useEffect } from 'react';
import { comParametros, lembrarLista, type Lista } from '../utilitarios/rotas';

/**
 * Os filtros da lista ficam no endereço: voltar (pelo caminho, pela seta ou pelo navegador)
 * reabre a lista como estava. Valores vazios ou iguais ao padrão saem do endereço.
 */
export function useFiltrosNaUrl(lista: Lista, filtros: Record<string, string | number | null | undefined>, padroes: Record<string, string> = {}) {
  const chave = JSON.stringify(filtros);
  useEffect(() => {
    const atual = window.location.pathname + window.location.search + window.location.hash;
    const valores = Object.fromEntries(Object.entries(filtros).map(([nome, valor]) => [nome, valor === null || valor === undefined || valor === '' || String(valor) === padroes[nome] ? null : String(valor)]));
    const endereco = comParametros(atual, valores);
    if (endereco !== atual) window.history.replaceState(window.history.state, '', endereco);
    lembrarLista(lista, endereco.split('#')[0]);
  }, [lista, chave]); // eslint-disable-line react-hooks/exhaustive-deps
}
