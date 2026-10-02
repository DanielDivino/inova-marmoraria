'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utilitarios/api';
import { Abertura, NavegacaoSecoes } from '../../componentes/mostruario/Abertura';
import { BordasEAcabamentos } from '../../componentes/mostruario/BordasEAcabamentos';
import { ambientes } from '../../componentes/mostruario/cenas';
import { Colecao } from '../../componentes/mostruario/Colecao';
import { FILTRO_INICIAL, filtrarPedras, montarPedras, type FiltroColecao, type Material, type Pedra } from '../../componentes/mostruario/colecao';
import type { UsoId } from '../../componentes/mostruario/conhecimento';
import { DetalhePedra, TRANSICAO_FOTO } from '../../componentes/mostruario/DetalhePedra';
import { comTransicao, rolarAte } from '../../componentes/mostruario/efeitos';
import { Guia } from '../../componentes/mostruario/Guia';
import { fotoPrincipal } from '../../componentes/mostruario/imagens';
import { Inspiracoes } from '../../componentes/mostruario/Inspiracoes';
import { Simulador } from '../../componentes/mostruario/Simulador';
import type { Acabamento, Familia } from '../../componentes/catalogo/tipos';
import './mostruario.css';

const fotoDoCartao = (id: string) => document.querySelector<HTMLElement>(`[data-pedra-foto="${CSS.escape(id)}"]`);

export default function MostruarioPage() {
  const [pedras, setPedras] = useState<Pedra[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [acabamentos, setAcabamentos] = useState<Acabamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<FiltroColecao>(FILTRO_INICIAL);
  /** Pedra do simulador e das bordas; a ficha aberta passa a ser ela. */
  const [pedraId, setPedraId] = useState('');
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [cena, setCena] = useState(0);
  /** A ficha aberta veio de um cartão da grade (ao fechar, a foto volta para ele). */
  const doCartao = useRef(false);

  useEffect(() => {
    const controle = new AbortController();
    Promise.all([
      api<Material[]>('/catalog/materials', { signal: controle.signal }), api<Familia[]>('/catalog/families', { signal: controle.signal }), api<Acabamento[]>('/catalog/finishes', { signal: controle.signal }),
    ]).then(([catalogo, carregadas, bordasEAcabamentos]) => {
      if (controle.signal.aborted) return;
      const lista = montarPedras(catalogo, carregadas);
      setFamilias(carregadas);
      setAcabamentos(bordasEAcabamentos);
      setPedras(lista);
      setPedraId((lista.find((pedra) => pedra.name === 'Branco Dallas' && fotoPrincipal(pedra)) ?? lista.find((pedra) => fotoPrincipal(pedra)) ?? lista[0])?.id ?? '');
    }).catch((causa) => {
      if (!controle.signal.aborted) setErro(causa instanceof Error ? causa.message : 'Não foi possível carregar o mostruário.');
    }).finally(() => { if (!controle.signal.aborted) setCarregando(false); });
    return () => controle.abort();
  }, []);

  const visiveis = useMemo(() => filtrarPedras(pedras, filtro), [pedras, filtro]);
  const pedra = pedras.find((item) => item.id === pedraId);
  const aberta = pedras.find((item) => item.id === abertaId);
  // Anterior e próxima seguem a ordem da grade (com os filtros); fora dela, a coleção inteira.
  const sequencia = aberta && visiveis.includes(aberta) ? visiveis : pedras;
  const posicao = aberta ? sequencia.indexOf(aberta) : -1;

  /** Abre a ficha: a foto do cartão (se está na tela) cresce até a ficha. */
  const abrir = (id: string) => {
    const foto = fotoDoCartao(id);
    const caixa = foto?.getBoundingClientRect();
    const naTela = !!caixa && caixa.bottom > 0 && caixa.top < window.innerHeight;
    doCartao.current = naTela;
    if (foto && naTela) foto.style.viewTransitionName = TRANSICAO_FOTO;
    comTransicao(() => { if (foto) foto.style.viewTransitionName = ''; setAbertaId(id); setPedraId(id); });
  };
  /**
   * Fecha a ficha. Aberta por um cartão, a foto volta para o cartão da pedra (trazido para a tela);
   * `depois` roda quando a ficha já fechou (ir ao simulador, às bordas).
   */
  const fechar = (depois?: () => void) => {
    const id = abertaId;
    let foto: HTMLElement | null = null;
    const transicao = comTransicao(() => {
      setAbertaId(null);
      foto = id && !depois && doCartao.current ? fotoDoCartao(id) : null;
      if (foto) { foto.style.viewTransitionName = TRANSICAO_FOTO; foto.scrollIntoView({ block: 'nearest' }); }
    });
    const fim = () => { if (foto) foto.style.viewTransitionName = ''; depois?.(); };
    if (transicao) transicao.finished.finally(fim); else fim();
  };
  const navegar = (id: string) => comTransicao(() => { setAbertaId(id); setPedraId(id); });
  const simular = (titulo: string) => fechar(() => {
    setCena(Math.max(0, ambientes.findIndex((ambiente) => ambiente.titulo === titulo)));
    rolarAte('ambientes');
  });
  const verPedras = (uso: UsoId) => { setFiltro({ ...FILTRO_INICIAL, uso }); rolarAte('colecao'); };

  return <main className="vitrine">
    <Abertura pedras={pedras} aoAbrir={abrir} />
    <NavegacaoSecoes />
    <Colecao pedras={pedras} familias={familias} filtro={filtro} aoFiltrar={setFiltro} aoAbrir={abrir} carregando={carregando} erro={erro} />
    <Simulador pedra={pedra} pedras={pedras} cena={cena} aoEscolherCena={setCena} aoEscolherPedra={setPedraId} aoAbrir={abrir} />
    <BordasEAcabamentos pedra={pedra} acabamentos={acabamentos} />
    <Inspiracoes aoVerPedras={verPedras} />
    <Guia pedras={pedras} familias={familias} aoVerPedras={verPedras} aoAbrir={abrir} />
    {aberta && <DetalhePedra pedra={aberta} acabamentos={acabamentos} anterior={sequencia[posicao - 1]} proxima={sequencia[posicao + 1]}
      aoFechar={() => fechar()} aoNavegar={navegar} aoSimular={simular} aoVerBordas={() => fechar(() => rolarAte('bordas'))} />}
  </main>;
}
