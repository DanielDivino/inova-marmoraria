'use client';

import { useState, type CSSProperties } from 'react';
import { AbasFiltro, Icone } from '../filtros/Filtros';
import type { Pedra } from './colecao';
import type { Familia } from '../catalogo/tipos';
import { CUIDADOS, DICAS, familiasIndicadas, ORDEM_USOS, USOS, type UsoId } from './conhecimento';
import { revelar } from './efeitos';
import { fotoDaPedra } from './imagens';

type Aba = 'ambientes' | 'comparar' | 'cuidados' | 'dicas';

/** Guia de escolha: por ambiente, comparativo das famílias, cuidados e dicas (dos guias da Inova). */
export function Guia({ pedras, familias, aoVerPedras, aoAbrir }: { pedras: Pedra[]; familias: Familia[]; aoVerPedras: (uso: UsoId) => void; aoAbrir: (id: string) => void }) {
  const [aba, setAba] = useState<Aba>('ambientes');
  const comNotas = familias.filter((familia) => familia.desempenho);
  return <section id="guia" className="vitrine-secao" aria-labelledby="vitrine-guia-titulo" ref={revelar} data-revelar="">
    <header className="vitrine-cabecalho">
      <span className="vitrine-sobretitulo vitrine-numero">05</span>
      <h2 id="vitrine-guia-titulo">A pedra certa para cada uso</h2>
      <p>Resumo dos guias técnicos para orientar o atendimento.</p>
    </header>
    <AbasFiltro rotulo="Assunto do guia" valor={aba} aoEscolher={setAba} grupos={[{ opcoes: [
      { valor: 'ambientes', rotulo: 'Por ambiente', icone: 'casa' },
      { valor: 'comparar', rotulo: 'Comparar materiais', icone: 'valor' },
      { valor: 'cuidados', rotulo: 'Cuidados', icone: 'escudo' },
      { valor: 'dicas', rotulo: 'Dicas para escolher', icone: 'brilho' },
    ] }]} />

    {aba === 'ambientes' && <ul className="vitrine-usos" key="ambientes">
      {ORDEM_USOS.map((uso, indice) => {
        const indicadas = pedras.filter((pedra) => pedra.ficha.onde.includes(uso));
        return <li key={uso} style={{ '--i': indice } as CSSProperties}>
          <h3>{USOS[uso].nome}</h3>
          <p className="vitrine-usos-indicados">{familiasIndicadas(uso, familias)}</p>
          <p>{USOS[uso].atencao}</p>
          {indicadas.length > 0 && <div className="vitrine-usos-pedras">
            <span className="vitrine-pilha">{indicadas.slice(0, 5).map((pedra) => <button type="button" key={pedra.id} onClick={() => aoAbrir(pedra.id)} aria-label={`Ver ficha: ${pedra.name}`} title={pedra.name}>
              <img src={fotoDaPedra(pedra, 96) ?? '/stone-placeholder.svg'} alt="" loading="lazy" decoding="async" /></button>)}</span>
            <button type="button" className="vitrine-link" onClick={() => aoVerPedras(uso)}>Ver {indicadas.length} {indicadas.length === 1 ? 'pedra' : 'pedras'} <Icone nome="seta" tamanho={14} /></button>
          </div>}
        </li>;
      })}
    </ul>}

    {aba === 'comparar' && <div className="vitrine-comparativo" key="comparar">
      <table>
        <thead><tr><th scope="col">Material</th><th scope="col">Riscos</th><th scope="col">Manchas</th><th scope="col">Calor</th><th scope="col">Estética</th><th scope="col">Manutenção</th><th scope="col">Custo</th></tr></thead>
        <tbody>{comNotas.map((familia, indice) => {
          const notas = familia.desempenho!;
          return <tr key={familia.id} style={{ '--i': indice } as CSSProperties}>
            <th scope="row">{familia.name}</th>
            {[notas.scratchResistance, notas.stainResistance, notas.heatResistance, notas.aesthetics].map((nota, coluna) => <td key={coluna}><span className="vitrine-barra" style={{ '--nota': nota } as CSSProperties} role="img" aria-label={`${nota} de 5`} /></td>)}
            <td>{notas.maintenance}</td>
            <td><span className="vitrine-custo" aria-label={`Custo ${notas.costLevel} de 5`}>{'$'.repeat(notas.costLevel)}<i>{'$'.repeat(5 - notas.costLevel)}</i></span></td>
          </tr>;
        })}</tbody>
      </table>
      <ul className="vitrine-resumo-rapido">
        <li><strong>Custo-benefício na cozinha</strong>Granito ou quartzo</li>
        <li><strong>Lavabo sofisticado</strong>Mármore ou quartzito</li>
        <li><strong>Área gourmet resistente</strong>Ultracompacto ou quartzo</li>
        <li><strong>Área externa</strong>Granito</li>
      </ul>
      <p className="vitrine-nota-rodape">Industrializados e superfícies especiais ficam fora da tabela: cada produto tem o seu desempenho.</p>
    </div>}

    {aba === 'cuidados' && <ul className="vitrine-cuidados" key="cuidados">
      {CUIDADOS.map((cuidado, indice) => <li key={cuidado.titulo} style={{ '--i': indice } as CSSProperties}><h3>{cuidado.titulo}</h3><p>{cuidado.texto}</p></li>)}
    </ul>}

    {aba === 'dicas' && <ol className="vitrine-dicas" key="dicas">
      {DICAS.map((dica, indice) => <li key={dica.titulo} style={{ '--i': indice } as CSSProperties}><span>{String(indice + 1).padStart(2, '0')}</span><div><h3>{dica.titulo}</h3><p>{dica.texto}</p></div></li>)}
    </ol>}
  </section>;
}
