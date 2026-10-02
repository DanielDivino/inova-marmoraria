'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Icone } from '../filtros/Filtros';
import { CenaComPedra } from './CenaComPedra';
import { ambientes } from './cenas';
import { precoDaPedra, type Pedra } from './colecao';
import { NOME_DO_DESENHO_DE_BORDA } from '@inova/domain';
import type { Acabamento, Familia } from '../catalogo/tipos';
import { BORDAS_POR_USO, ROTULO_TOM, USOS, cenasDosUsos } from './conhecimento';
import { fotoDaPedra } from './imagens';

/** Nome da transição que faz a foto do cartão crescer até a ficha (e voltar). */
export const TRANSICAO_FOTO = 'pedra-aberta';

/** Foto grande da ficha: começa com a miniatura do cartão (já carregada) e ganha nitidez; lupa no mouse. */
function FotoDaFicha({ pedra }: { pedra: Pedra }) {
  const [nitida, setNitida] = useState(false);
  const [lupa, setLupa] = useState<{ x: number; y: number } | null>(null);
  const grande = fotoDaPedra(pedra, 1600);
  const mover = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !grande) return;
    const caixa = event.currentTarget.getBoundingClientRect();
    setLupa({ x: ((event.clientX - caixa.left) / caixa.width) * 100, y: ((event.clientY - caixa.top) / caixa.height) * 100 });
  };
  return <div className={`vitrine-ficha-foto${lupa ? ' com-lupa' : ''}`} style={{ viewTransitionName: TRANSICAO_FOTO }} onPointerMove={mover} onPointerLeave={() => setLupa(null)}>
    <img src={fotoDaPedra(pedra, 480) ?? '/stone-placeholder.svg'} alt="" />
    {fotoDaPedra(pedra, 960) && <img className={`vitrine-ficha-nitida${nitida ? ' pronta' : ''}`} src={fotoDaPedra(pedra, 960)} alt={`Amostra de ${pedra.name}`} onLoad={() => setNitida(true)} />}
    {lupa && <div className="vitrine-lupa" aria-hidden="true" style={{ backgroundImage: `url(${grande})`, backgroundPosition: `${lupa.x}% ${lupa.y}%` }} />}
    {grande && <span className="vitrine-lupa-dica" aria-hidden="true"><Icone nome="buscar" tamanho={14} />Passe o mouse para ampliar</span>}
  </div>;
}

/** Notas do comparativo do guia, em barras; sem notas, o desempenho depende da ficha do produto. */
export function Desempenho({ familia }: { familia?: Familia }) {
  const notas = familia?.desempenho;
  if (!notas) return <p className="vitrine-desempenho-ficha"><Icone nome="info" tamanho={16} />Desempenho conforme a ficha do fabricante.</p>;
  const linhas: [string, number][] = [['Resistência a riscos', notas.scratchResistance], ['Resistência a manchas', notas.stainResistance], ['Resistência ao calor', notas.heatResistance]];
  return <dl className="vitrine-desempenho">
    {linhas.map(([rotulo, nota]) => <div key={rotulo}><dt>{rotulo}</dt><dd><span className="vitrine-barra" style={{ '--nota': nota } as CSSProperties} role="img" aria-label={`${nota} de 5`} /></dd></div>)}
    <div><dt>Manutenção</dt><dd><strong>{notas.maintenance}</strong></dd></div>
  </dl>;
}

export function DetalhePedra({ pedra, acabamentos, anterior, proxima, aoFechar, aoNavegar, aoSimular, aoVerBordas }: {
  pedra: Pedra; acabamentos: Acabamento[]; anterior?: Pedra; proxima?: Pedra;
  aoFechar: () => void; aoNavegar: (id: string) => void; aoSimular: (cena: string) => void; aoVerBordas: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const familia = pedra.familia;
  // Bordas indicadas para o uso principal: as do catálogo com aquele desenho (ou o nome do desenho).
  const nomeDaBorda = (desenho: keyof typeof NOME_DO_DESENHO_DE_BORDA) => acabamentos.find((acabamento) => acabamento.kind === 'EDGE' && acabamento.isActive && acabamento.appearance === desenho)?.name ?? NOME_DO_DESENHO_DE_BORDA[desenho];
  const usoPrincipal = pedra.ficha.onde[0];
  const cenas = cenasDosUsos(pedra.ficha.onde).map((titulo) => ambientes.find((ambiente) => ambiente.titulo === titulo)!);
  const textura = fotoDaPedra(pedra, 960);

  // Janela modal: rolagem da página presa, foco dentro e devolvido ao fechar.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const raiz = document.documentElement;
    const rolagem = raiz.style.overflow;
    raiz.style.overflow = 'hidden';
    painel.current?.querySelector<HTMLElement>('.vitrine-ficha-fechar')?.focus({ preventScroll: true });
    return () => { raiz.style.overflow = rolagem; antes?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => { painel.current?.scrollTo({ top: 0 }); }, [pedra.id]);

  const teclado = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); aoFechar(); return; }
    const emCampo = (event.target as HTMLElement).closest('input, textarea, select');
    if (!emCampo && event.key === 'ArrowLeft' && anterior) { event.preventDefault(); aoNavegar(anterior.id); }
    if (!emCampo && event.key === 'ArrowRight' && proxima) { event.preventDefault(); aoNavegar(proxima.id); }
    if (event.key === 'Tab' && painel.current) {
      const focaveis = [...painel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]')];
      const [primeiro, ultimo] = [focaveis[0], focaveis.at(-1)];
      if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
    }
  };

  return <div className="vitrine-ficha" onMouseDown={(event) => { if (event.target === event.currentTarget) aoFechar(); }}>
    <div className="vitrine-ficha-painel" ref={painel} role="dialog" aria-modal="true" aria-labelledby="vitrine-ficha-nome" onKeyDown={teclado}>
      <button type="button" className="vitrine-ficha-fechar" aria-label="Fechar ficha" onClick={aoFechar}><Icone nome="fechar" tamanho={20} /></button>
      <div className="vitrine-ficha-topo">
        <FotoDaFicha key={`foto-${pedra.id}`} pedra={pedra} />
        <div className="vitrine-ficha-dados" key={`dados-${pedra.id}`}>
          <span className="vitrine-sobretitulo">{familia?.name ?? pedra.category} · {ROTULO_TOM[pedra.ficha.tom]}</span>
          <h2 id="vitrine-ficha-nome">{pedra.name}</h2>
          <p className="vitrine-ficha-preco"><strong>{precoDaPedra(pedra)}</strong>{pedra.exemplo && <small>Amostra visual · fora do catálogo</small>}</p>
          <p className="vitrine-ficha-resumo">{pedra.description?.trim() || familia?.summary}</p>
          {pedra.ficha.nota && <p className={`vitrine-ficha-nota${pedra.ficha.confirmar ? ' confirmar' : ''}`}><Icone nome={pedra.ficha.confirmar ? 'alerta' : 'info'} tamanho={16} />{pedra.ficha.nota}</p>}
          <Desempenho familia={familia} />
          <div className="vitrine-ficha-onde"><h3>Onde usar</h3><ul>{pedra.ficha.onde.map((uso) => <li key={uso}>{USOS[uso].nome}</li>)}</ul></div>
          {familia && <p className="vitrine-ficha-estilo"><span>Estilo</span>{familia.style}</p>}
        </div>
      </div>

      <section className="vitrine-ficha-bloco" aria-labelledby="vitrine-ficha-exemplos">
        <h3 id="vitrine-ficha-exemplos">Exemplos de aplicação</h3>
        <div className="vitrine-exemplos">
          {cenas.map((cena) => <button type="button" key={cena.titulo} className="vitrine-exemplo" onClick={() => aoSimular(cena.titulo)}>
            {textura ? <CenaComPedra ambiente={cena} pedra={textura} rotulo={`${cena.titulo} em ${pedra.name}`} /> : <img src={cena.imagem} alt="" />}
            <span><strong>{cena.titulo}</strong><small>Abrir no simulador <Icone nome="seta" tamanho={14} /></small></span>
          </button>)}
        </div>
      </section>

      <section className="vitrine-ficha-bloco vitrine-ficha-colunas">
        {familia && <div><h3>Vantagens</h3><ul className="vitrine-lista vitrine-lista-vantagem">{familia.advantages.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {familia && <div><h3>Cuidados</h3><ul className="vitrine-lista vitrine-lista-cuidado">{familia.care.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {usoPrincipal && <div>
          <h3>Bordas para {USOS[usoPrincipal].nome.toLocaleLowerCase('pt-BR')}</h3>
          <ul className="vitrine-ficha-bordas">{BORDAS_POR_USO[usoPrincipal].map((desenho) => <li key={desenho}>{nomeDaBorda(desenho)}</li>)}</ul>
          <button type="button" className="vitrine-link" onClick={aoVerBordas}>Ver perfis e acabamentos <Icone nome="seta" tamanho={14} /></button>
        </div>}
      </section>

      <footer className="vitrine-ficha-rodape">
        {anterior ? <button type="button" className="vitrine-ficha-vizinha" onClick={() => aoNavegar(anterior.id)} aria-label={`Pedra anterior: ${anterior.name}`}>
          <Icone nome="seta" tamanho={18} /><span><small>Anterior</small>{anterior.name}</span></button> : <span />}
        <button type="button" className="vitrine-botao vitrine-botao-destaque" onClick={() => aoSimular(cenas[0]?.titulo ?? ambientes[0].titulo)}><Icone nome="casa" tamanho={18} />Ver no simulador</button>
        {proxima ? <button type="button" className="vitrine-ficha-vizinha proxima" onClick={() => aoNavegar(proxima.id)} aria-label={`Próxima pedra: ${proxima.name}`}>
          <span><small>Próxima</small>{proxima.name}</span><Icone nome="seta" tamanho={18} /></button> : <span />}
      </footer>
    </div>
  </div>;
}
