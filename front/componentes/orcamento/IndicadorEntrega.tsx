'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { nomeArquivoPdf } from '@inova/domain';
import { Icone } from '../filtros/Filtros';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import { buscarArquivoApi } from '../../utilitarios/api';
import { medidaPeca } from '../../utilitarios/fluxo';
import type { EntregasProjeto, PecaEntrega } from './NotaEntregaProjeto';
import './nota-entrega.css';

/**
 * Nota de conferência (PDF gerado na hora): o que já foi entregue e o que falta, do orçamento todo
 * ou de um projeto. Muda a cada entrega registrada.
 */
export async function abrirNotaConferencia({ quoteId, itemId, quoteNumber, customerName, projectName }: { quoteId: string; itemId?: string; quoteNumber: string; customerName: string; projectName?: string }) {
  const caminho = itemId ? `/quotes/${quoteId}/items/${itemId}/conferencia/pdf` : `/quotes/${quoteId}/conferencia/pdf`;
  abrirPdf(await buscarArquivoApi(caminho), nomeArquivoPdf(customerName, `${quoteNumber} - ${projectName ? `Conferência - ${projectName}` : 'Conferência geral'}`));
}

const somar = (pecas: PecaEntrega[], campo: (peca: PecaEntrega) => number) => pecas.reduce((total, peca) => total + campo(peca), 0);

/**
 * No cabeçalho do projeto: ícone de entrega com "3/6" e a barrinha (cinza, âmbar ou verde). Tocando, abre a lista do que foi
 * entregue e do que falta, sem aumentar o bloco, e a nota de conferência do projeto.
 */
export function IndicadorEntrega({ projeto, quoteId, quoteNumber, customerName }: { projeto: EntregasProjeto; quoteId: string; quoteNumber: string; customerName: string }) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const painel = useId();
  const total = somar(projeto.pieces, (peca) => peca.quantity), entregues = somar(projeto.pieces, (peca) => peca.delivered);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => { if (!caixa.current?.contains(evento.target as Node)) setAberto(false); };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);
  if (!total) return null;
  const tom = entregues === 0 ? 'nenhuma' : entregues < total ? 'parcial' : 'completa';
  const faltam = projeto.pieces.filter((peca) => peca.quantity > peca.delivered);
  const jaEntregues = projeto.pieces.filter((peca) => peca.delivered > 0);
  const situacao = (peca: PecaEntrega) => [peca.ready ? `${peca.ready} ${peca.ready === 1 ? 'pronta' : 'prontas'}` : '', peca.inProduction ? `${peca.inProduction} em produção` : ''].filter(Boolean).join(' · ');
  async function conferencia() {
    setGerando(true); setErro('');
    try { await abrirNotaConferencia({ quoteId, itemId: projeto.id, quoteNumber, customerName, projectName: projeto.name }); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : 'Não foi possível gerar a nota de conferência.'); }
    finally { setGerando(false); }
  }
  return <div className="indicador-entrega" ref={caixa} onKeyDown={(evento) => { if (evento.key === 'Escape' && aberto) { evento.stopPropagation(); setAberto(false); } }}>
    <button type="button" className={`indicador-entrega-botao ${tom}`} aria-expanded={aberto} aria-controls={painel} onClick={() => setAberto(!aberto)}
      title={`${entregues} de ${total} peças entregues`} aria-label={`Entregas de ${projeto.name}: ${entregues} de ${total} peças entregues`}>
      <Icone nome={tom === 'completa' ? 'aprovado' : 'entregue'} tamanho={13} />
      <span>{entregues}/{total}</span>
      <i aria-hidden="true"><b style={{ width: `${(entregues / total) * 100}%` }} /></i>
    </button>
    {aberto && <section id={painel} className="indicador-entrega-painel" aria-label={`Entregas de ${projeto.name}`}>
      <header><strong>Entregas · {projeto.name}</strong><small>{entregues} de {total} {total === 1 ? 'peça' : 'peças'}</small></header>
      {jaEntregues.length > 0 && <div><h4>Entregues</h4><ul>{jaEntregues.map((peca) => <li key={peca.key} className="entregue">
        <Icone nome="aprovado" tamanho={14} /><span>{peca.name}<small>{[medidaPeca(peca), `${peca.delivered} de ${peca.quantity}`].filter(Boolean).join(' · ')}</small></span>
      </li>)}</ul></div>}
      {faltam.length > 0 && <div><h4>Faltam</h4><ul>{faltam.map((peca) => <li key={peca.key}>
        <i aria-hidden="true" /><span>{peca.name}<small>{[medidaPeca(peca), `${peca.quantity - peca.delivered} ${peca.quantity - peca.delivered === 1 ? 'falta' : 'faltam'}`, situacao(peca)].filter(Boolean).join(' · ')}</small></span>
      </li>)}</ul></div>}
      {erro && <p role="alert" className="form-error">{erro}</p>}
      <button type="button" className="botao-contorno" disabled={gerando} onClick={() => void conferencia()}><Icone nome="documento" tamanho={16} />{gerando ? 'Gerando…' : 'Nota de conferência'}</button>
    </section>}
  </div>;
}
