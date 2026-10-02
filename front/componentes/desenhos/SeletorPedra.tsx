'use client';

import { useState } from 'react';
import { ModalFiltros } from '../filtros/Filtros';
import type { MaterialVisual } from './tipos';

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Busca dentro da seleção, incluindo nomes com ou sem acento. */
export function SeletorPedra({ materiais, id, nome, desativado, aoEscolher }: {
  materiais: MaterialVisual[]; id?: string; nome?: string; desativado?: boolean; aoEscolher: (material: MaterialVisual | undefined) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const resultados = materiais.filter(material => termos.every(termo => normalizar(`${material.name} ${material.category}`).includes(termo)));
  const escolher = (material?: MaterialVisual) => { aoEscolher(material); setAberto(false); };
  return <div className="tec-campo">
    <span>Pedra (visual e estimativa)</span>
    <button type="button" className="botao-contorno tec-seletor-pedra" disabled={desativado} aria-haspopup="dialog" aria-label={`Escolher pedra: ${nome || 'Sem pedra'}`} onClick={() => { setBusca(''); setAberto(true); }}>{nome || 'Sem pedra'}<span aria-hidden="true">⌕</span></button>
    <ModalFiltros aberto={aberto} aoFechar={() => setAberto(false)} titulo="Escolher pedra" rotuloFechar="Fechar seleção de pedra" className="tec-busca-pedra" rodape={<button type="button" className="botao-contorno" onClick={() => setAberto(false)}>Cancelar</button>}>
      {aberto && <label className="tec-campo">Buscar pedra<input autoFocus type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite o nome da pedra…" autoComplete="off" /></label>}
      <div className="tec-resultados-pedra" aria-label="Pedras disponíveis">
        <button type="button" aria-pressed={!id} onClick={() => escolher()}>Sem pedra</button>
        {resultados.map(material => <button type="button" key={material.id} aria-pressed={id === material.id} onClick={() => escolher(material)}><strong>{material.name}</strong><small>{material.category}</small>{id === material.id && <span aria-label="Selecionada">✓</span>}</button>)}
        {!resultados.length && <p role="status">Nenhuma pedra encontrada para “{busca}”.</p>}
      </div>
    </ModalFiltros>
  </div>;
}
