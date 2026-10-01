'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { buscarArquivoApi } from '../../utilitarios/api';
import { nomeArquivoPdf } from '@inova/domain';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import styles from './QuotePdfExport.module.css';
import { Icone } from '../filtros/Filtros';

/** O que o orçamento (ou o projeto) tem para ir no PDF; o que não tem fica apagado no Exportar. */
export type PartesDisponiveis = { desenhos: boolean; tecnico: boolean };
type Partes = { orcamento: boolean; valores: boolean; desenhos: boolean; tecnico: boolean };

/**
 * Exportar: caixinhas independentes e tudo no mesmo PDF, nesta ordem — orçamento, desenhos em
 * ordem de serviço e desenho técnico. O mesmo no orçamento todo (topo) e em cada projeto.
 */
function Exportar({ caminho, arquivo, disponivel, titulo, noProjeto = false, abrirAgora = false, aoAbrir }: { caminho: string; arquivo: string; disponivel: PartesDisponiveis; titulo: string; noProjeto?: boolean; abrirAgora?: boolean; aoAbrir?: () => void }) {
  const panelId = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [partes, setPartes] = useState<Partes>({ orcamento: true, valores: false, desenhos: true, tecnico: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (noProjeto) return;
    // Depois de salvar um orçamento, o Exportar do topo já abre (…?pdf=1).
    const params = new URLSearchParams(window.location.search);
    if (params.get('pdf') === '1') setOpen(true);
    if (params.has('individualPrices')) setPartes((atual) => ({ ...atual, valores: params.get('individualPrices') === 'true' }));
  }, [noProjeto]);
  // Pedido de fora (ex.: "Exportar PDF" no ⋯ do projeto): abre as opções e as mostra na tela.
  useEffect(() => {
    if (!abrirAgora) return;
    setOpen(true);
    aoAbrir?.();
    caixa.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [abrirAgora, aoAbrir]);
  useEffect(() => {
    if (!open) return;
    const fora = (event: PointerEvent) => { if (!caixa.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [open]);
  // O que não existe fica desmarcado, mesmo que a última escolha tenha sido marcá-lo.
  const marcado = { ...partes, valores: partes.orcamento && partes.valores, desenhos: partes.desenhos && disponivel.desenhos, tecnico: partes.tecnico && disponivel.tecnico };
  const algumaParte = marcado.orcamento || marcado.desenhos || marcado.tecnico;
  const alternar = (parte: keyof Partes) => (event: ChangeEvent<HTMLInputElement>) => setPartes((atual) => ({ ...atual, [parte]: event.target.checked }));

  async function generate() {
    if (loading || !algumaParte) return;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ commercial: String(marcado.orcamento), individualPrices: String(marcado.valores), drawings: String(marcado.desenhos), technical: String(marcado.tecnico) });
      abrirPdf(await buscarArquivoApi(`${caminho}?${query}`), arquivo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o PDF.');
    } finally { setLoading(false); }
  }

  return <div ref={caixa} className={`${styles.export}${noProjeto ? ` ${styles.doProjeto}` : ''}`} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="botao-contorno" title={titulo} aria-label={noProjeto ? titulo : undefined} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}><Icone nome="download" />Exportar<Icone nome="seta" tamanho={16} /></button>
    {open && <section id={panelId} className={styles.panel} aria-label="Opções do PDF">
      <strong>Como deseja gerar o PDF?</strong>
      <label><input type="checkbox" checked={marcado.orcamento} disabled={loading} onChange={alternar('orcamento')} />Incluir orçamento</label>
      <label className={styles.subopcao}><input type="checkbox" checked={marcado.valores} disabled={loading || !marcado.orcamento} onChange={alternar('valores')} />Exibir valores individuais</label>
      <label title={disponivel.desenhos ? undefined : noProjeto ? 'Este projeto ainda não tem desenho.' : 'Nenhum projeto tem desenho.'}><input type="checkbox" checked={marcado.desenhos} disabled={loading || !disponivel.desenhos} onChange={alternar('desenhos')} />Incluir desenhos em ordem de serviço</label>
      <label title={disponivel.tecnico ? undefined : noProjeto ? 'Este projeto ainda não tem desenho técnico.' : 'Nenhum projeto tem desenho técnico.'}><input type="checkbox" checked={marcado.tecnico} disabled={loading || !disponivel.tecnico} onChange={alternar('tecnico')} />Incluir desenho técnico</label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="button" className="primary-button" disabled={loading || !algumaParte} onClick={generate}>{loading ? 'Gerando…' : 'Gerar PDF'}</button>
    </section>}
  </div>;
}

/** Exportar do orçamento todo (topo da tela do orçamento). */
export function ExportarPdfOrcamento({ quoteId, quoteNumber, customerName, disponivel }: { quoteId: string; quoteNumber: string; customerName: string; disponivel: PartesDisponiveis }) {
  return <Exportar caminho={`/quotes/${quoteId}/pdf`} arquivo={nomeArquivoPdf(customerName, quoteNumber)} disponivel={disponivel} titulo="Orçamento, desenhos e desenho técnico em PDF" />;
}

/** Exportar de um projeto só, no cartão do projeto. */
export function ExportarPdfProjeto({ quoteId, itemId, quoteNumber, customerName, projectName, disponivel, abrirAgora, aoAbrir }: { quoteId: string; itemId: string; quoteNumber: string; customerName: string; projectName: string; disponivel: PartesDisponiveis; abrirAgora?: boolean; aoAbrir?: () => void }) {
  return <Exportar caminho={`/quotes/${quoteId}/items/${itemId}/pdf`} arquivo={nomeArquivoPdf(customerName, `${quoteNumber} - ${projectName}`)} disponivel={disponivel} titulo={`Exportar ${projectName}`} noProjeto abrirAgora={abrirAgora} aoAbrir={aoAbrir} />;
}
