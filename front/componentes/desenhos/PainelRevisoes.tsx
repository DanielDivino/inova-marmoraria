'use client';

import { useState } from 'react';
import { exportDxf, technicalDocumentSchema } from '@inova/domain/technical';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import { api, buscarArquivoApi } from '../../utilitarios/api';
import { ROTULO_REVISAO, type Revisao } from './tipos';

/**
 * Revisões e produção (mesmo fluxo de antes): cada revisão é congelada; dá para
 * abrir o PDF técnico, baixar o DXF, devolver (com motivo), aprovar e liberar.
 */
export function PainelRevisoes({ revisoes, aoAtualizar, aoMensagem }: { revisoes: Revisao[]; aoAtualizar: () => Promise<void>; aoMensagem: (texto: string) => void }) {
  const [devolvendo, setDevolvendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const agir = async (acao: () => Promise<unknown>, falha: string) => {
    setOcupado(true);
    try { await acao(); await aoAtualizar(); } catch (causa) { aoMensagem(causa instanceof Error ? causa.message : falha); } finally { setOcupado(false); }
  };
  const nome = (revisao: Revisao) => `R${revisao.number.toString().padStart(2, '0')}`;
  const baixarDxf = (revisao: Revisao) => {
    try {
      const { data } = exportDxf(technicalDocumentSchema.parse(revisao.document), nome(revisao));
      const url = URL.createObjectURL(new Blob([data], { type: 'application/dxf' }));
      const link = document.createElement('a');
      link.href = url; link.download = `desenho-tecnico-${nome(revisao).toLowerCase()}.dxf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { aoMensagem('Não foi possível gerar o DXF desta revisão.'); }
  };
  return <section className="tec-revisoes" aria-label="Revisões e produção">
    <header><div><p>CONTROLE TÉCNICO</p><h2>Revisões e produção</h2></div><small>Uma revisão fica congelada. O que mudar depois fica só no rascunho.</small></header>
    {revisoes.length ? <ul>{revisoes.map((revisao) => <li key={revisao.id}>
      <div><strong>{nome(revisao)}</strong><span className={`tec-status ${revisao.status.toLowerCase()}`}>{ROTULO_REVISAO[revisao.status]}</span>
        <small>{new Date(revisao.createdAt).toLocaleString('pt-BR')} · {revisao.createdBy.name}</small>
        {revisao.decisions[0]?.note && <small>Motivo: {revisao.decisions[0].note}</small>}</div>
      <div className="tec-acoes">
        <button type="button" className="botao-contorno" onClick={() => void buscarArquivoApi(`/revisions/${revisao.id}/pdf`).then((arquivo) => abrirPdf(arquivo, `desenho-tecnico-r${revisao.number}.pdf`)).catch(() => aoMensagem('Não foi possível abrir o PDF técnico.'))}>PDF técnico</button>
        {revisao.document !== undefined && <button type="button" className="botao-contorno" onClick={() => baixarDxf(revisao)}>DXF</button>}
        {revisao.status === 'IN_REVIEW' && <>
          <button type="button" className="botao-contorno" disabled={ocupado} onClick={() => { setDevolvendo(revisao.id); setMotivo(''); }}>Devolver</button>
          <button type="button" className="botao-destaque" disabled={ocupado} onClick={() => void agir(() => api(`/revisions/${revisao.id}/decisions`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVE' }) }), 'Não foi possível aprovar.')}>Aprovar</button>
        </>}
        {revisao.status === 'APPROVED' && <button type="button" className="botao-destaque" disabled={ocupado} onClick={() => void agir(() => api(`/revisions/${revisao.id}/release`, { method: 'POST' }), 'Não foi possível liberar a revisão.')}>Liberar produção</button>}
      </div>
      {devolvendo === revisao.id && <form className="tec-devolver" onSubmit={(evento) => { evento.preventDefault(); void agir(() => api(`/revisions/${revisao.id}/decisions`, { method: 'POST', body: JSON.stringify({ decision: 'RETURN', note: motivo.trim() }) }), 'Não foi possível devolver.').then(() => setDevolvendo(null)); }}>
        <label className="tec-campo">Motivo da devolução<textarea rows={2} required value={motivo} autoFocus onChange={(evento) => setMotivo(evento.target.value)} placeholder="O que precisa ser corrigido?" /></label>
        <div className="tec-acoes"><button type="button" className="botao-contorno" onClick={() => setDevolvendo(null)}>Cancelar</button><button type="submit" className="botao-destaque" disabled={ocupado || !motivo.trim()}>Devolver revisão</button></div>
      </form>}
    </li>)}</ul> : <p className="tec-dica">Salve o rascunho e envie a primeira revisão quando as medidas estiverem conferidas.</p>}
  </section>;
}
