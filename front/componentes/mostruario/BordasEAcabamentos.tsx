'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { AparenciaDeSuperficie, DesenhoDeBorda } from '@inova/domain';
import { formatarMoeda } from '../../utilitarios/formatadores';
import { AmostraDaSuperficie, PerfilDaBorda } from '../catalogo/DesenhoDoAcabamento';
import { precoAPartirDe, type Acabamento } from '../catalogo/tipos';
import { AbasFiltro, Icone } from '../filtros/Filtros';
import type { Pedra } from './colecao';
import { comTransicao, revelar } from './efeitos';
import { fotoDaPedra } from './imagens';

const TRANSICAO = 'acabamento-aberto';
const classeDoValor = (valor: string) => `vitrine-valor valor-${valor === 'Técnico' ? 'tecnico' : valor === 'Médio' ? 'medio' : valor.toLowerCase()}`;
const preco = (acabamento: Acabamento) => {
  const valor = precoAPartirDe(acabamento);
  return valor === undefined ? undefined : `A partir de ${formatarMoeda(valor)} / ${acabamento.kind === 'EDGE' ? 'm' : 'm²'}`;
};

/** Desenho da borda ou amostra do acabamento, com a pedra escolhida. */
function Imagem({ acabamento, textura, grande }: { acabamento: Acabamento; textura?: string; grande?: boolean }) {
  return acabamento.kind === 'EDGE'
    ? <PerfilDaBorda desenho={acabamento.appearance as DesenhoDeBorda} textura={textura} className={grande ? 'grande' : undefined} />
    : <AmostraDaSuperficie aparencia={acabamento.appearance as AparenciaDeSuperficie} textura={textura} className={grande ? 'grande' : undefined} />;
}

/**
 * Bordas e acabamentos do catálogo (Materiais e serviços), desenhados com a pedra escolhida. Tocar
 * num deles amplia a imagem (ela cresce do cartão até a janela) com a descrição e o preço.
 */
export function BordasEAcabamentos({ pedra, acabamentos }: { pedra?: Pedra; acabamentos: Acabamento[] }) {
  const [aba, setAba] = useState<'EDGE' | 'SURFACE'>('EDGE');
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const ativos = acabamentos.filter((acabamento) => acabamento.isActive);
  const lista = ativos.filter((acabamento) => acabamento.kind === aba);
  const aberto = ativos.find((acabamento) => acabamento.id === abertoId);
  const textura = fotoDaPedra(pedra, 480);

  const imagemDoCartao = (id: string | null) => id ? document.querySelector<HTMLElement>(`[data-acabamento="${CSS.escape(id)}"]`) : null;
  const abrir = (id: string) => {
    const imagem = imagemDoCartao(id);
    if (imagem) imagem.style.viewTransitionName = TRANSICAO;
    comTransicao(() => { if (imagem) imagem.style.viewTransitionName = ''; setAbertoId(id); });
  };
  const fechar = () => {
    let imagem: HTMLElement | null = null;
    const transicao = comTransicao(() => {
      setAbertoId(null);
      imagem = imagemDoCartao(abertoId);
      if (imagem) imagem.style.viewTransitionName = TRANSICAO;
    });
    const fim = () => { if (imagem) imagem.style.viewTransitionName = ''; };
    if (transicao) transicao.finished.finally(fim); else fim();
  };
  const vizinho = (passo: number) => {
    if (!aberto) return;
    const posicao = lista.indexOf(aberto);
    comTransicao(() => setAbertoId(lista[(posicao + passo + lista.length) % lista.length].id));
  };

  return <section id="bordas" className="vitrine-secao" aria-labelledby="vitrine-bordas-titulo" ref={revelar} data-revelar="">
    <header className="vitrine-cabecalho">
      <span className="vitrine-sobretitulo vitrine-numero">03</span>
      <h2 id="vitrine-bordas-titulo">O detalhe que muda o valor da peça</h2>
      <p>O mesmo material parece simples ou sofisticado conforme a borda e o acabamento.{pedra && <> Desenhados em <strong>{pedra.name}</strong>.</>} Toque para ampliar.</p>
    </header>
    <AbasFiltro rotulo="Bordas ou acabamentos" valor={aba} aoEscolher={setAba} grupos={[{ opcoes: [
      { valor: 'EDGE', rotulo: 'Perfis de borda', icone: 'esquadro', total: ativos.filter((acabamento) => acabamento.kind === 'EDGE').length },
      { valor: 'SURFACE', rotulo: 'Acabamentos de superfície', icone: 'brilho', total: ativos.filter((acabamento) => acabamento.kind === 'SURFACE').length },
    ] }]} />
    <ul className={aba === 'EDGE' ? 'vitrine-bordas' : 'vitrine-acabamentos'} key={aba}>
      {lista.map((acabamento, indice) => <li key={acabamento.id} style={{ '--i': indice } as CSSProperties}>
        <button type="button" className="vitrine-acabamento-cartao" onClick={() => abrir(acabamento.id)} aria-label={`Ampliar: ${acabamento.name}`}>
          <span className="vitrine-acabamento-imagem" data-acabamento={acabamento.id}><Imagem acabamento={acabamento} textura={textura} /><i className="vitrine-ampliar" aria-hidden="true"><Icone nome="buscar" tamanho={14} /></i></span>
          <span className="vitrine-acabamento-texto">
            <span className="vitrine-acabamento-titulo"><strong>{acabamento.name}</strong>{acabamento.perceivedValue && <b className={classeDoValor(acabamento.perceivedValue)}>Valor {acabamento.perceivedValue.toLocaleLowerCase('pt-BR')}</b>}</span>
            <span className="vitrine-acabamento-descricao">{acabamento.description}</span>
            <small>{acabamento.uses}</small>
          </span>
        </button>
      </li>)}
    </ul>
    <p className="vitrine-nota-rodape">Acabamento mal explicado vira detalhe grátis; bem apresentado, vira valor percebido. Mostre a borda junto com o acabamento.</p>
    {aberto && <AcabamentoAmpliado acabamento={aberto} textura={fotoDaPedra(pedra, 960) ?? textura} pedra={pedra?.name} total={lista.length} aoFechar={fechar} aoVizinho={vizinho} />}
  </section>;
}

function AcabamentoAmpliado({ acabamento, textura, pedra, total, aoFechar, aoVizinho }: {
  acabamento: Acabamento; textura?: string; pedra?: string; total: number; aoFechar: () => void; aoVizinho: (passo: number) => void;
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
    if (event.key === 'ArrowLeft' && total > 1) { event.preventDefault(); aoVizinho(-1); }
    if (event.key === 'ArrowRight' && total > 1) { event.preventDefault(); aoVizinho(1); }
  };
  const valor = preco(acabamento);
  return <div className="vitrine-ficha vitrine-acabamento-ampliado" onMouseDown={(event) => { if (event.target === event.currentTarget) aoFechar(); }}>
    <div className="vitrine-ficha-painel" ref={painel} role="dialog" aria-modal="true" aria-labelledby="vitrine-acabamento-nome" onKeyDown={teclado}>
      <button type="button" className="vitrine-ficha-fechar" aria-label="Fechar" onClick={aoFechar}><Icone nome="fechar" tamanho={20} /></button>
      <div className="vitrine-acabamento-grande" style={{ viewTransitionName: TRANSICAO }} key={acabamento.id}><Imagem acabamento={acabamento} textura={textura} grande /></div>
      <div className="vitrine-acabamento-info" key={`info-${acabamento.id}`}>
        <span className="vitrine-sobretitulo">{acabamento.kind === 'EDGE' ? 'Perfil de borda' : 'Acabamento de superfície'}{pedra ? ` · em ${pedra}` : ''}</span>
        <h3 id="vitrine-acabamento-nome">{acabamento.name}{acabamento.perceivedValue && <b className={classeDoValor(acabamento.perceivedValue)}>Valor {acabamento.perceivedValue.toLocaleLowerCase('pt-BR')}</b>}</h3>
        <p>{acabamento.description}</p>
        <dl>
          <div><dt>{acabamento.kind === 'EDGE' ? 'Onde usar' : 'Ideal para'}</dt><dd>{acabamento.uses}</dd></div>
          {valor && <div><dt>Preço</dt><dd>{valor}</dd></div>}
        </dl>
        {total > 1 && <div className="vitrine-ampliada-acoes">
          <button type="button" className="vitrine-redondo" aria-label="Anterior" onClick={() => aoVizinho(-1)}><Icone nome="seta" tamanho={18} /></button>
          <button type="button" className="vitrine-redondo proxima" aria-label="Próximo" onClick={() => aoVizinho(1)}><Icone nome="seta" tamanho={18} /></button>
        </div>}
      </div>
    </div>
  </div>;
}
