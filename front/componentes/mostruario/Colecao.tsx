'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { AbasFiltro, CampoFiltro, Icone, MenuSelecao, ModalFiltros, useCelular, type NomeIcone } from '../filtros/Filtros';
import type { Familia } from '../catalogo/tipos';
import { FILTRO_INICIAL, filtrarPedras, precoDaPedra, type FiltroColecao, type Ordem, type Pedra } from './colecao';
import { normalizar, ORDEM_USOS, ROTULO_TOM, USOS, type Tom, type UsoId } from './conhecimento';
import { revelar } from './efeitos';
import { fotoDaPedra } from './imagens';

const OPCOES_USO = [{ valor: 'todos' as const, rotulo: 'Todos os ambientes' }, ...ORDEM_USOS.map((uso) => ({ valor: uso, rotulo: USOS[uso].nome }))];
const OPCOES_TOM: { valor: Tom | 'todos'; rotulo: string }[] = [{ valor: 'todos', rotulo: 'Todos os tons' }, { valor: 'claro', rotulo: 'Claras' }, { valor: 'medio', rotulo: 'Tom médio' }, { valor: 'escuro', rotulo: 'Escuras' }];
const OPCOES_ORDEM: { valor: Ordem; rotulo: string }[] = [{ valor: 'nome', rotulo: 'Nome (A–Z)' }, { valor: 'menor', rotulo: 'Menor preço' }, { valor: 'maior', rotulo: 'Maior preço' }];
// Ícone pelo nome da família (as criadas no catálogo usam o da pedra).
const ICONES: [RegExp, NomeIcone][] = [[/marmore/, 'brilho'], [/quartzito/, 'camadas'], [/ultracompacto/, 'raio'], [/industrializ/, 'material'], [/especia/, 'paleta']];
const iconeDaFamilia = (familia: Familia): NomeIcone => ICONES.find(([padrao]) => padrao.test(normalizar(familia.name)))?.[1] ?? 'pedra';

/** "Escolha sua pedra": filtros (família, ambiente, tom, ordem e busca) e a grade de pedras. */
export function Colecao({ pedras, familias: catalogo, filtro, aoFiltrar, aoAbrir, carregando, erro }: {
  pedras: Pedra[]; familias: Familia[]; filtro: FiltroColecao; aoFiltrar: (filtro: FiltroColecao) => void; aoAbrir: (id: string) => void; carregando: boolean; erro: string;
}) {
  const celular = useCelular();
  const [janela, setJanela] = useState(false);
  const visiveis = useMemo(() => filtrarPedras(pedras, filtro), [pedras, filtro]);
  const semFamilia = useMemo(() => filtrarPedras(pedras, filtro, true), [pedras, filtro]);
  const mudar = (parcial: Partial<FiltroColecao>) => aoFiltrar({ ...filtro, ...parcial });
  const ativos = [filtro.familia !== 'todas', filtro.uso !== 'todos', filtro.tom !== 'todos', filtro.ordem !== 'nome', !!filtro.busca.trim()].filter(Boolean).length;
  const ocultos = [filtro.uso !== 'todos', filtro.tom !== 'todos', filtro.ordem !== 'nome'].filter(Boolean).length;
  const limpar = () => aoFiltrar(FILTRO_INICIAL);
  const familias = catalogo.filter((familia) => pedras.some((pedra) => pedra.ficha.familiaId === familia.id));
  // A grade entra de novo (em cascata) quando muda o filtro; ao digitar a busca, não.
  const assinatura = `${filtro.familia}|${filtro.uso}|${filtro.tom}|${filtro.ordem}`;

  return <section id="colecao" className="vitrine-secao" aria-labelledby="vitrine-colecao-titulo" ref={revelar} data-revelar="">
    <header className="vitrine-cabecalho">
      <span className="vitrine-sobretitulo vitrine-numero">01</span>
      <h2 id="vitrine-colecao-titulo">Escolha sua pedra</h2>
      <p>Toque em uma pedra para ver a ficha completa, os cuidados e exemplos de aplicação.</p>
    </header>
    <div className="barra-filtros vitrine-filtros" role="search" aria-label="Filtrar pedras">
      <label className="barra-filtros-busca"><Icone nome="buscar" tamanho={20} /><input type="search" aria-label="Buscar pedra" placeholder="Nome da pedra" value={filtro.busca} onChange={(event) => mudar({ busca: event.target.value })} /></label>
      {celular
        ? <button type="button" className="botao-contorno" aria-expanded={janela} onClick={() => setJanela(true)}><Icone nome="filtro" />Filtros{ocultos ? <b>{ocultos}</b> : null}</button>
        : <>
          <i className="barra-filtros-separador" aria-hidden="true" />
          <MenuSelecao rotulo="Ambiente" icone="casa" valor={filtro.uso} opcoes={OPCOES_USO} aoEscolher={(uso) => mudar({ uso })} />
          <MenuSelecao rotulo="Tom" icone="paleta" valor={filtro.tom} opcoes={OPCOES_TOM} aoEscolher={(tom) => mudar({ tom })} />
          <MenuSelecao rotulo="Ordenar" icone="ordenar" valor={filtro.ordem} opcoes={OPCOES_ORDEM} aoEscolher={(ordem) => mudar({ ordem })} />
          <i className="barra-filtros-separador" aria-hidden="true" />
        </>}
      <button type="button" className="botao-contorno" disabled={!ativos} onClick={limpar}><Icone nome="limpar" />Limpar</button>
    </div>
    <AbasFiltro rotulo="Família da pedra" valor={filtro.familia} aoEscolher={(familia) => mudar({ familia: familia === filtro.familia ? 'todas' : familia })} grupos={[{ opcoes: [
      { valor: 'todas' as const, rotulo: 'Todas', icone: 'todos', total: semFamilia.length },
      ...familias.map((familia) => ({ valor: familia.id, rotulo: familia.plural, icone: iconeDaFamilia(familia), total: semFamilia.filter((pedra) => pedra.ficha.familiaId === familia.id).length })),
    ] }]} />
    {celular && <ModalFiltros aberto={janela} aoFechar={() => setJanela(false)} titulo="Filtros da coleção"
      rodape={<><button type="button" className="botao-contorno" disabled={!ativos} onClick={limpar}><Icone nome="limpar" />Limpar</button><button type="button" className="botao-destaque" onClick={() => setJanela(false)}>Ver {visiveis.length} {visiveis.length === 1 ? 'pedra' : 'pedras'}</button></>}>
      <CampoFiltro rotulo="Ambiente" icone="casa"><select aria-label="Ambiente" value={filtro.uso} onChange={(event) => mudar({ uso: event.target.value as UsoId | 'todos' })}>{OPCOES_USO.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}</select></CampoFiltro>
      <CampoFiltro rotulo="Tom" icone="paleta"><select aria-label="Tom" value={filtro.tom} onChange={(event) => mudar({ tom: event.target.value as Tom | 'todos' })}>{OPCOES_TOM.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}</select></CampoFiltro>
      <CampoFiltro rotulo="Ordenar" icone="ordenar"><select aria-label="Ordenar" value={filtro.ordem} onChange={(event) => mudar({ ordem: event.target.value as Ordem })}>{OPCOES_ORDEM.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}</select></CampoFiltro>
    </ModalFiltros>}

    {erro && <p className="form-error" role="alert">{erro}</p>}
    {carregando && <ul className="vitrine-grade" aria-hidden="true">{Array.from({ length: 10 }, (_, indice) => <li key={indice}><span className="vitrine-cartao vitrine-cartao-carregando" /></li>)}</ul>}
    {!carregando && !erro && <>
      <p className="vitrine-contagem" role="status">{visiveis.length} {visiveis.length === 1 ? 'pedra' : 'pedras'}{filtro.uso !== 'todos' ? ` para ${USOS[filtro.uso].nome.toLocaleLowerCase('pt-BR')}` : ''}</p>
      <ul className="vitrine-grade" key={assinatura}>
        {visiveis.map((pedra, indice) => <li key={pedra.id} style={{ '--i': Math.min(indice, 14) } as CSSProperties}>
          <button type="button" className="vitrine-cartao" onClick={() => aoAbrir(pedra.id)} aria-label={`${pedra.name}: abrir ficha`}>
            <span className="vitrine-cartao-foto">
              <img data-pedra-foto={pedra.id} src={fotoDaPedra(pedra, 320) ?? '/stone-placeholder.svg'} srcSet={fotoDaPedra(pedra, 320) && !pedra.exemplo ? `${fotoDaPedra(pedra, 320)} 320w, ${fotoDaPedra(pedra, 480)} 480w` : undefined}
                sizes="(max-width: 760px) 50vw, 240px" alt="" loading={indice < 10 ? 'eager' : 'lazy'} decoding="async" width={320} height={320} />
              <span className="vitrine-cartao-ver" aria-hidden="true">Ver ficha</span>
            </span>
            <span className="vitrine-cartao-texto">
              <strong>{pedra.name}</strong>
              <small>{pedra.familia?.name ?? pedra.category} · {ROTULO_TOM[pedra.ficha.tom]}</small>
              <b>{precoDaPedra(pedra)}</b>
            </span>
          </button>
        </li>)}
      </ul>
      {!visiveis.length && <div className="vitrine-vazio"><p>Nenhuma pedra com esses filtros.</p><button type="button" className="botao-contorno" onClick={limpar}><Icone nome="limpar" />Limpar filtros</button></div>}
    </>}
  </section>;
}
