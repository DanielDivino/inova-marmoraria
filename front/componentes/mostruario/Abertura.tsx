'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icone } from '../filtros/Filtros';
import { CenaComPedra } from './CenaComPedra';
import { ambientes } from './cenas';
import { destaquesDaAbertura, type Pedra } from './colecao';
import { irParaSecao, useMovimentoReduzido, useVisivel } from './efeitos';
import { fotoDaPedra } from './imagens';

const TROCA_MS = 5200;

/** Abertura: a cozinha do simulador trocando de pedra sozinha, com o atalho para a ficha da pedra em cena. */
export function Abertura({ pedras, aoAbrir }: { pedras: Pedra[]; aoAbrir: (id: string) => void }) {
  const destaques = useMemo(() => destaquesDaAbertura(pedras), [pedras]);
  const [indice, setIndice] = useState(0);
  const [pausada, setPausada] = useState(false);
  const raiz = useRef<HTMLElement>(null);
  const visivel = useVisivel(raiz);
  const reduzido = useMovimentoReduzido();
  const girando = !pausada && visivel && !reduzido && destaques.length > 1;
  useEffect(() => {
    if (!girando) return;
    const proxima = window.setTimeout(() => setIndice((atual) => (atual + 1) % destaques.length), TROCA_MS);
    return () => window.clearTimeout(proxima);
  }, [girando, indice, destaques.length]);
  // Já carrega a próxima pedra, para a troca não esperar a foto.
  const seguinte = destaques[(indice + 1) % Math.max(1, destaques.length)];
  useEffect(() => { const url = fotoDaPedra(seguinte, 960); if (url) new Image().src = url; }, [seguinte]);

  const atual = destaques[indice % Math.max(1, destaques.length)];
  const familias = new Set(pedras.map((pedra) => pedra.ficha.familiaId).filter(Boolean)).size;
  return <section className="vitrine-abertura" ref={raiz} aria-labelledby="vitrine-abertura-titulo">
    <div className="vitrine-abertura-texto">
      <span className="vitrine-sobretitulo">Coleção Inova</span>
      <h1 id="vitrine-abertura-titulo">Superfícies que valorizam cada projeto</h1>
      <p>Conheça cada pedra de perto: onde usar, como cuidar, bordas, acabamentos e como ela fica no ambiente.</p>
      <div className="vitrine-abertura-acoes">
        <a className="vitrine-botao vitrine-botao-claro" href="#colecao" onClick={irParaSecao}>Explorar a coleção<Icone nome="seta" tamanho={16} /></a>
        <a className="vitrine-botao vitrine-botao-vazado" href="#ambientes" onClick={irParaSecao}>Simular no ambiente</a>
      </div>
      <dl className="vitrine-numeros">
        <div><dt>Pedras</dt><dd>{pedras.length || '—'}</dd></div>
        <div><dt>Famílias</dt><dd>{familias || '—'}</dd></div>
        <div><dt>Ambientes</dt><dd>{ambientes.length}</dd></div>
      </dl>
    </div>
    <figure className="vitrine-abertura-cena" onMouseEnter={() => setPausada(true)} onMouseLeave={() => setPausada(false)} onFocus={() => setPausada(true)} onBlur={() => setPausada(false)}>
      <CenaComPedra cobrir ambiente={ambientes[0]} pedra={fotoDaPedra(atual, 960)} rotulo={atual ? `Cozinha em ${atual.name}` : 'Cozinha'} />
      {atual && <figcaption>
        <span className="vitrine-abertura-legenda" key={atual.id}><small>Em cena</small><strong>{atual.name}</strong><em>{atual.familia?.name ?? atual.category}</em></span>
        <button type="button" className="vitrine-botao vitrine-botao-claro" onClick={() => aoAbrir(atual.id)}>Ver ficha</button>
      </figcaption>}
      {destaques.length > 1 && <div className="vitrine-abertura-pontos" role="group" aria-label="Pedra em cena">
        {destaques.map((pedra, posicao) => <button type="button" key={pedra.id} aria-label={pedra.name} aria-pressed={posicao === indice} onClick={() => setIndice(posicao)}
          style={{ '--duracao': `${TROCA_MS}ms` } as CSSProperties} className={posicao === indice && girando ? 'girando' : undefined}><i /></button>)}
      </div>}
    </figure>
  </section>;
}

/** Menu das seções, preso no alto ao rolar; marca a seção que está na tela. */
export function NavegacaoSecoes() {
  const secoes = [['colecao', 'Coleção'], ['ambientes', 'Simulador'], ['bordas', 'Bordas e acabamentos'], ['inspiracoes', 'Inspirações'], ['guia', 'Guia de escolha']] as const;
  const [ativa, setAtiva] = useState('');
  // A seção ativa é a última cujo topo já passou de um terço da tela (no topo da página, nenhuma).
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const limite = window.innerHeight / 3;
      const passou = secoes.filter(([id]) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= limite);
      setAtiva(passou.at(-1)?.[0] ?? '');
    };
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(medir); };
    medir();
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    return () => { cancelAnimationFrame(quadro); window.removeEventListener('scroll', agendar); window.removeEventListener('resize', agendar); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <nav className="vitrine-navegacao" aria-label="Seções do mostruário">
    {secoes.map(([id, rotulo]) => <a key={id} href={`#${id}`} onClick={irParaSecao} aria-current={ativa === id ? 'true' : undefined}>{rotulo}</a>)}
  </nav>;
}
