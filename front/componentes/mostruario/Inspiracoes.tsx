'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AbasFiltro, Icone } from '../filtros/Filtros';
import { INSPIRACOES, USOS, type GrupoInspiracao, type UsoId } from './conhecimento';
import { comTransicao, revelar } from './efeitos';

const GRUPOS = [...new Set(INSPIRACOES.map((item) => item.grupo))];
const foto = (arquivo: string, pequena = false) => `/mostruario/inspiracoes/${arquivo}${pequena ? '-560' : ''}.webp`;
const TRANSICAO = 'inspiracao-aberta';

/** Inspirações do catálogo de projetos: referências visuais para conversar com o cliente. */
export function Inspiracoes({ aoVerPedras }: { aoVerPedras: (uso: UsoId) => void }) {
  const [grupo, setGrupo] = useState<GrupoInspiracao | 'todos'>('todos');
  const [aberta, setAberta] = useState<number | null>(null);
  const lista = INSPIRACOES.filter((item) => grupo === 'todos' || item.grupo === grupo);
  const atual = aberta === null ? undefined : INSPIRACOES[aberta];

  const abrir = (indice: number) => {
    const imagem = document.querySelector<HTMLElement>(`[data-inspiracao="${indice}"]`);
    if (imagem) imagem.style.viewTransitionName = TRANSICAO;
    comTransicao(() => { if (imagem) imagem.style.viewTransitionName = ''; setAberta(indice); });
  };
  /** Fecha a ampliada; a foto volta para o mosaico. `depois` roda com a janela já fechada. */
  const fechar = (depois?: () => void) => {
    const indice = aberta;
    let imagem: HTMLElement | null = null;
    const transicao = comTransicao(() => {
      setAberta(null);
      imagem = depois ? null : document.querySelector<HTMLElement>(`[data-inspiracao="${indice}"]`);
      if (imagem) imagem.style.viewTransitionName = TRANSICAO;
    });
    const fim = () => { if (imagem) imagem.style.viewTransitionName = ''; depois?.(); };
    if (transicao) transicao.finished.finally(fim); else fim();
  };
  const vizinha = (passo: number) => {
    if (aberta === null) return;
    const posicao = lista.indexOf(INSPIRACOES[aberta]);
    const proxima = lista[(posicao + passo + lista.length) % lista.length];
    comTransicao(() => setAberta(INSPIRACOES.indexOf(proxima)));
  };

  return <section id="inspiracoes" className="vitrine-secao" aria-labelledby="vitrine-inspiracoes-titulo" ref={revelar} data-revelar="">
    <header className="vitrine-cabecalho">
      <span className="vitrine-sobretitulo vitrine-numero">04</span>
      <h2 id="vitrine-inspiracoes-titulo">Ideias para o projeto do cliente</h2>
      <p>Referências de cozinhas, banheiros, escadas, painéis e áreas gourmet. Toque para ampliar.</p>
    </header>
    <AbasFiltro rotulo="Tipo de projeto" valor={grupo} aoEscolher={(valor) => setGrupo(valor === grupo ? 'todos' : valor)} grupos={[{ opcoes: [
      { valor: 'todos' as const, rotulo: 'Todos', icone: 'todos', total: INSPIRACOES.length },
      ...GRUPOS.map((nome) => ({ valor: nome, rotulo: nome, icone: 'foto' as const, total: INSPIRACOES.filter((item) => item.grupo === nome).length })),
    ] }]} />
    <ul className="vitrine-inspiracoes" key={grupo}>
      {lista.map((item, posicao) => {
        const indice = INSPIRACOES.indexOf(item);
        return <li key={item.arquivo} style={{ '--i': posicao } as CSSProperties}>
          <button type="button" onClick={() => abrir(indice)} aria-label={`Ampliar: ${item.titulo}`}>
            <img data-inspiracao={indice} src={foto(item.arquivo, true)} srcSet={`${foto(item.arquivo, true)} 560w, ${foto(item.arquivo)} 1040w`} sizes="(max-width: 760px) 100vw, 33vw" alt="" loading="lazy" decoding="async" width={560} height={172} />
            <span><strong>{item.titulo}</strong></span>
          </button>
        </li>;
      })}
    </ul>
    {atual && <Ampliada item={atual} indice={aberta!} aoFechar={() => fechar()} aoVizinha={vizinha} aoVerPedras={(uso) => fechar(() => aoVerPedras(uso))} />}
  </section>;
}

function Ampliada({ item, indice, aoFechar, aoVizinha, aoVerPedras }: {
  item: (typeof INSPIRACOES)[number]; indice: number; aoFechar: () => void; aoVizinha: (passo: number) => void; aoVerPedras: (uso: UsoId) => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const raiz = document.documentElement;
    const rolagem = raiz.style.overflow;
    raiz.style.overflow = 'hidden';
    painel.current?.querySelector<HTMLElement>('.vitrine-ficha-fechar')?.focus({ preventScroll: true });
    return () => { raiz.style.overflow = rolagem; antes?.focus?.({ preventScroll: true }); };
  }, []);
  const teclado = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); aoFechar(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); aoVizinha(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); aoVizinha(1); }
  };
  return <div className="vitrine-ficha vitrine-ampliada" onMouseDown={(event) => { if (event.target === event.currentTarget) aoFechar(); }}>
    <div className="vitrine-ficha-painel" ref={painel} role="dialog" aria-modal="true" aria-labelledby="vitrine-ampliada-titulo" onKeyDown={teclado}>
      <button type="button" className="vitrine-ficha-fechar" aria-label="Fechar inspiração" onClick={aoFechar}><Icone nome="fechar" tamanho={20} /></button>
      <img className="vitrine-ampliada-foto" src={foto(item.arquivo)} alt={item.texto} style={{ viewTransitionName: TRANSICAO }} key={indice} />
      <div className="vitrine-ampliada-texto">
        <div><small className="vitrine-sobretitulo">{item.grupo}</small><h3 id="vitrine-ampliada-titulo">{item.titulo}</h3><p>{item.texto}</p></div>
        <div className="vitrine-ampliada-acoes">
          <button type="button" className="vitrine-redondo" aria-label="Inspiração anterior" onClick={() => aoVizinha(-1)}><Icone nome="seta" tamanho={18} /></button>
          <button type="button" className="vitrine-redondo proxima" aria-label="Próxima inspiração" onClick={() => aoVizinha(1)}><Icone nome="seta" tamanho={18} /></button>
          {item.uso && <button type="button" className="vitrine-botao vitrine-botao-destaque" onClick={() => aoVerPedras(item.uso!)}>Pedras para {USOS[item.uso].nome.toLocaleLowerCase('pt-BR')}</button>}
        </div>
      </div>
      <p className="vitrine-ampliada-aviso">Imagem de referência para inspirar o projeto: pedra, borda e acabamento são definidos no orçamento.</p>
    </div>
  </div>;
}
