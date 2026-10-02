'use client';

import type { CSSProperties } from 'react';
import { NOME_DO_USO } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { confirmar } from '../Confirmacao';
import { Icone } from '../filtros/Filtros';
import type { Familia } from './tipos';
import './catalogo.css';

const NOTAS: [keyof NonNullable<Familia['desempenho']>, string][] = [['scratchResistance', 'Riscos'], ['stainResistance', 'Manchas'], ['heatResistance', 'Calor'], ['aesthetics', 'Estética']];

/** Famílias das pedras com as informações do mostruário; editar, criar e excluir (só vazia). */
export function AbaFamilias({ familias, aoEditar, aoMudou, aoErro }: { familias: Familia[]; aoEditar: (familia: Familia) => void; aoMudou: (aviso: string) => void; aoErro: (erro: string) => void }) {
  async function excluir(familia: Familia) {
    if (!await confirmar({ titulo: `Excluir a família ${familia.name}?`, mensagem: 'Ela some do cadastro de materiais e do mostruário.', confirmar: 'Excluir família', perigo: true })) return;
    try { await api(`/catalog/families/${familia.id}`, { method: 'DELETE' }); aoMudou(`Família ${familia.name} excluída.`); }
    catch (causa) { aoErro(causa instanceof Error ? causa.message : 'Não foi possível excluir a família.'); }
  }
  return <div className="catalogo-familias">
    {familias.map((familia) => <article key={familia.id} className="catalogo-cartao">
      <header>
        <div><h2>{familia.name}</h2><small>{familia.plural} · {familia.materialCount} {familia.materialCount === 1 ? 'material' : 'materiais'}</small></div>
        <div className="catalogo-cartao-acoes">
          <button type="button" className="text-button" onClick={() => aoEditar(familia)}><Icone nome="lapis" tamanho={16} />Editar</button>
          {!familia.materialCount && <button type="button" className="text-button perigo" onClick={() => void excluir(familia)}><Icone nome="lixeira" tamanho={16} />Excluir</button>}
        </div>
      </header>
      <p>{familia.summary}</p>
      <ul className="catalogo-etiquetas" aria-label="Onde usar">{familia.uses.map((uso) => <li key={uso}>{NOME_DO_USO[uso]}</li>)}</ul>
      {familia.desempenho
        ? <dl className="catalogo-notas-lidas">
          {NOTAS.map(([campo, rotulo]) => <div key={campo}><dt>{rotulo}</dt><dd><span className="catalogo-barra" style={{ '--nota': familia.desempenho![campo] } as CSSProperties} role="img" aria-label={`${familia.desempenho![campo]} de 5`} /></dd></div>)}
          <div><dt>Manutenção</dt><dd>{familia.desempenho.maintenance}</dd></div>
          <div><dt>Custo</dt><dd className="catalogo-custo">{'$'.repeat(familia.desempenho.costLevel)}</dd></div>
        </dl>
        : <p className="catalogo-sem-notas"><Icone nome="info" tamanho={15} />Desempenho conforme a ficha do fabricante.</p>}
      <div className="catalogo-colunas">
        <div><h3>Vantagens</h3><ul>{familia.advantages.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3>Cuidados</h3><ul>{familia.care.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      <small className="catalogo-estilo">Estilo: {familia.style}</small>
    </article>)}
  </div>;
}
