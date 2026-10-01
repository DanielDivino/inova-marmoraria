'use client';

import { useEffect, useMemo, useState } from 'react';
import { estimarDesenho, type CatalogoEstimativa, type OpcoesEstimativa, type TechnicalDocument } from '@inova/domain/technical';
import { api } from '../../utilitarios/api';

type CatalogoApi = { materials: { id: string; name: string; billingUnit: CatalogoEstimativa['materials'][number]['billingUnit']; currentPrice: number | null }[]; services: { id: string; name: string; billingUnit: CatalogoEstimativa['services'][number]['billingUnit']; currentPrice: number }[]; settings?: { closedSquareMeter: boolean } };

/**
 * As escolhas da estimativa (serviço de cada componente, serviços gerais) não
 * entram no documento técnico, que não guarda nada comercial: ficam neste
 * aparelho, por desenho. Sem armazenamento, a estimativa usa as sugestões.
 */
const chave = (designId: string) => `inova-estimativa-${designId}`;
function lerOpcoes(designId: string): OpcoesEstimativa {
  try { const salvo = window.localStorage.getItem(chave(designId)); return salvo ? JSON.parse(salvo) as OpcoesEstimativa : {}; } catch { return {}; }
}

/** Catálogo vigente (mesma rota do orçamento, com o M² fechado da empresa) e a estimativa calculada a cada mudança do desenho. */
export function useEstimativa(designId: string, documento: TechnicalDocument | null) {
  const [catalogo, setCatalogo] = useState<CatalogoEstimativa | null>(null);
  const [erro, setErro] = useState('');
  const [opcoes, setOpcoes] = useState<OpcoesEstimativa>({});
  const [m2Fechado, setM2Fechado] = useState(true);
  useEffect(() => { setOpcoes(lerOpcoes(designId)); }, [designId]);
  useEffect(() => {
    api<CatalogoApi>('/catalog').then((resposta) => {
      setM2Fechado(resposta.settings?.closedSquareMeter ?? true);
      setCatalogo({
        materials: resposta.materials.map(({ id, name, billingUnit, currentPrice }) => ({ id, name, billingUnit, currentPrice })),
        services: resposta.services.map(({ id, name, billingUnit, currentPrice }) => ({ id, name, billingUnit, currentPrice: Number(currentPrice) })),
      });
    }).catch(() => setErro('Não foi possível carregar os preços do catálogo.'));
  }, []);
  const mudarOpcoes = (proximas: OpcoesEstimativa) => {
    setOpcoes(proximas);
    try { window.localStorage.setItem(chave(designId), JSON.stringify(proximas)); } catch { /* sem armazenamento local */ }
  };
  const estimativa = useMemo(() => documento && catalogo ? estimarDesenho(documento, catalogo, { ...opcoes, m2Fechado }) : null, [documento, catalogo, opcoes, m2Fechado]);
  return { catalogo, estimativa, opcoes, mudarOpcoes, erro, m2Fechado };
}
