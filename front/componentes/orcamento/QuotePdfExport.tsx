'use client';

import { useEffect, useId, useState } from 'react';
import { buscarArquivoApi } from '../../utilitarios/api';
import { nomeArquivoPdf } from '@inova/domain';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import styles from './QuotePdfExport.module.css';

/** Abre só as folhas de OS de um projeto, prontas para imprimir, sem a folha comercial. */
export function ImprimirDesenhoProjeto({ quoteId, itemId, quoteNumber, customerName, projectName }: { quoteId: string; itemId: string; quoteNumber: string; customerName: string; projectName: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function imprimir() {
    if (loading) return;
    setLoading(true); setError('');
    try {
      const file = await buscarArquivoApi(`/quotes/${quoteId}/items/${itemId}/drawing-pdf`);
      abrirPdf(file, nomeArquivoPdf(customerName, `${quoteNumber} - ${projectName}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o desenho.');
    } finally { setLoading(false); }
  }
  return <>
    <button type="button" className={`secondary-button ${styles.printDrawing}`} disabled={loading} onClick={imprimir}>{loading ? 'Gerando…' : 'Imprimir desenho'}</button>
    {error && <p role="alert" className="form-error">{error}</p>}
  </>;
}

export function ExportarPdfOrcamento({ quoteId, quoteNumber, customerName, hasDrawings = true }: { quoteId: string; quoteNumber: string; customerName: string; hasDrawings?: boolean }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [individualPrices, setIndividualPrices] = useState(false);
  const [drawings, setDrawings] = useState(hasDrawings);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pdf') === '1') setOpen(true);
    if (params.has('individualPrices')) setIndividualPrices(params.get('individualPrices') === 'true');
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    if (loading) return;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ individualPrices: String(individualPrices), drawings: String(drawings) });
      const file = await buscarArquivoApi(`/quotes/${quoteId}/pdf?${query}`);
      abrirPdf(file, nomeArquivoPdf(customerName, quoteNumber));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o PDF.');
    } finally { setLoading(false); }
  }

  return <div className={styles.export}>
    <button type="button" className="text-button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>Orçamento / OS PDF</button>
    {open && <section id={panelId} className={styles.panel} aria-label="Opções do PDF" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <strong>Como deseja gerar o PDF?</strong>
      <label><input type="checkbox" checked={individualPrices} disabled={loading} onChange={event => setIndividualPrices(event.target.checked)} />Exibir valores individuais</label>
      <label><input type="checkbox" checked={hasDrawings && drawings} disabled={loading || !hasDrawings} onChange={event => setDrawings(event.target.checked)} />Incluir desenhos e OS</label>
      {!hasDrawings && <small>Desenho pendente. O orçamento usa o modelo habitual, com todos os valores.</small>}
      <small>O total e o desconto no Pix aparecem em todas as versões. Sem desenhos, será gerado apenas o orçamento.</small>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="button" className="primary-button" disabled={loading} onClick={generate}>{loading ? 'Gerando…' : 'Gerar PDF'}</button>
    </section>}
  </div>;
}
