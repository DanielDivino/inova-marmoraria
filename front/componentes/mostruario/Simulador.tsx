'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Icone } from '../filtros/Filtros';
import { CenaComPedra } from './CenaComPedra';
import { ambientes } from './cenas';
import type { Pedra } from './colecao';
import { normalizar } from './conhecimento';
import { revelar } from './efeitos';
import { fotoDaPedra } from './imagens';

/**
 * Simulador: a pedra escolhida aplicada nos ambientes. Arrastar sobre a foto (ou a régua, no
 * celular) compara com o ambiente original.
 */
export function Simulador({ pedra, pedras, cena, aoEscolherCena, aoEscolherPedra, aoAbrir }: {
  pedra?: Pedra; pedras: Pedra[]; cena: number;
  aoEscolherCena: (indice: number) => void; aoEscolherPedra: (id: string) => void; aoAbrir: (id: string) => void;
}) {
  const [revelado, setRevelado] = useState(100);
  const [comparou, setComparou] = useState(false);
  const [busca, setBusca] = useState('');
  const ambiente = ambientes[cena] ?? ambientes[0];
  const textura = fotoDaPedra(pedra, 960);
  const filtradas = useMemo(() => pedras.filter((item) => normalizar(item.name).includes(normalizar(busca.trim()))), [pedras, busca]);

  return <section id="ambientes" className="vitrine-secao vitrine-simulador" aria-labelledby="vitrine-simulador-titulo" ref={revelar} data-revelar="">
    <header className="vitrine-cabecalho">
      <span className="vitrine-sobretitulo vitrine-numero">02</span>
      <h2 id="vitrine-simulador-titulo">Veja a pedra no ambiente</h2>
      <p>Doze ambientes para mostrar ao cliente como a pedra fica aplicada.</p>
    </header>
    <div className="vitrine-cenas" role="group" aria-label="Ambiente">
      {ambientes.map((item, indice) => <button type="button" key={item.titulo} aria-pressed={indice === cena} onClick={() => aoEscolherCena(indice)}>{item.titulo}</button>)}
    </div>
    <div className="vitrine-simulador-corpo">
      <figure className="vitrine-palco">
        <div className="vitrine-palco-area" style={{ '--revelar': `${revelado}%` } as CSSProperties}>
          <div className="vitrine-palco-foto" key={ambiente.titulo}>
            <CenaComPedra ambiente={ambiente} pedra={textura} revelar={revelado} rotulo={`${ambiente.titulo}${textura && revelado > 0 ? ` em ${pedra?.name}` : ' original'}`} />
          </div>
          {revelado < 100 && <span className="vitrine-palco-linha" aria-hidden="true"><i /></span>}
          {revelado < 100 && <span className="vitrine-palco-rotulos" aria-hidden="true"><b>{pedra?.name}</b><b>Original</b></span>}
          {textura && <input className="vitrine-comparar" type="range" min={0} max={100} step={1} value={revelado} aria-label="Comparar com o ambiente original"
            onChange={(event) => { setRevelado(Number(event.target.value)); setComparou(true); }} />}
          {textura && !comparou && <span className="vitrine-comparar-dica" aria-hidden="true"><i />Arraste sobre a foto para comparar com o original</span>}
          {pedra && !textura && <p className="vitrine-palco-aviso" role="status">{pedra.name} ainda não tem foto para a simulação.</p>}
        </div>
        <figcaption>
          <span><small>{ambiente.titulo}</small>{pedra?.name}</span>
          {pedra && <button type="button" className="vitrine-link" onClick={() => aoAbrir(pedra.id)}>Ver ficha da pedra <Icone nome="seta" tamanho={14} /></button>}
        </figcaption>
      </figure>
      <aside className="vitrine-amostras" aria-label="Pedras para o ambiente">
        <label className="vitrine-amostras-busca"><Icone nome="buscar" tamanho={18} /><input type="search" aria-label="Buscar pedra no simulador" placeholder="Buscar pedra" value={busca} onChange={(event) => setBusca(event.target.value)} /></label>
        <ul>
          {filtradas.map((item) => <li key={item.id}><button type="button" aria-pressed={item.id === pedra?.id} onClick={() => { aoEscolherPedra(item.id); setRevelado(100); }} title={item.name}>
            <img src={fotoDaPedra(item, 96) ?? '/stone-placeholder.svg'} alt="" loading="lazy" decoding="async" />
            <span>{item.name}<small>{item.familia?.name ?? item.category}</small></span>
          </button></li>)}
        </ul>
        {!filtradas.length && <p className="vitrine-vazio">Nenhuma pedra com esse nome.</p>}
      </aside>
    </div>
    <p className="vitrine-nota-rodape">Simulação ilustrativa: tom, escala e veios mudam de chapa para chapa.</p>
  </section>;
}
