'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Diagnostic, TechnicalDocument } from '@inova/domain/technical';
import { api } from '../../utilitarios/api';
import type { MaterialVisual, RascunhoResposta, Revisao } from './tipos';

export type EstadoSalvamento = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Rascunho do desenho técnico: carrega, salva (com `baseVersion`; 409 = outra
 * sessão salvou antes), salva sozinho 2 s depois da última mudança e guarda o
 * histórico para desfazer/refazer (Ctrl+Z / Ctrl+Y ou Ctrl+Shift+Z).
 */
export function useDocumentoTecnico(designId: string) {
  const [dados, setDados] = useState<RascunhoResposta | null>(null);
  const [documento, setDocumento] = useState<TechnicalDocument | null>(null);
  const [versao, setVersao] = useState(1);
  const [diagnosticos, setDiagnosticos] = useState<Diagnostic[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [materiais, setMateriais] = useState<MaterialVisual[]>([]);
  // Histórico em refs (sem efeitos dentro de setState); `marcarHistorico` só redesenha os botões.
  const passado = useRef<TechnicalDocument[]>([]);
  const futuro = useRef<TechnicalDocument[]>([]);
  const [, setVersaoHistorico] = useState(0);
  const marcarHistorico = () => setVersaoHistorico((v) => v + 1);
  const [alterado, setAlterado] = useState(false);
  const [salvamento, setSalvamento] = useState<EstadoSalvamento>('idle');
  const [conflito, setConflito] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const atual = useRef<TechnicalDocument | null>(null);
  atual.current = documento;

  const carregar = useCallback(async () => {
    setMensagem('');
    try {
      const [rascunho, desenho, visuais] = await Promise.all([
        api<RascunhoResposta>(`/designs/${designId}/draft`), api<{ revisions: Revisao[] }>(`/designs/${designId}`), api<MaterialVisual[]>('/catalog/materials/visual'),
      ]);
      setDados(rascunho); setDocumento(rascunho.draft.document); setVersao(rascunho.draft.version); setDiagnosticos(rascunho.diagnostics);
      setRevisoes(desenho.revisions); setMateriais(visuais); passado.current = []; futuro.current = []; marcarHistorico(); setAlterado(false); setConflito(false);
    } catch (causa) { setMensagem(causa instanceof Error ? causa.message : 'Não foi possível abrir o desenho técnico.'); }
  }, [designId]);
  useEffect(() => { void carregar(); }, [carregar]);

  /** Só a lista de revisões: ações de revisão não podem descartar o que ainda não foi salvo no rascunho. */
  const recarregarRevisoes = useCallback(async () => {
    const desenho = await api<{ revisions: Revisao[] }>(`/designs/${designId}`);
    setRevisoes(desenho.revisions);
  }, [designId]);

  const salvar = useCallback(async (proximo = atual.current) => {
    if (!proximo || salvamento === 'saving') return false;
    setSalvamento('saving'); setMensagem('');
    try {
      const resultado = await api<{ version: number; diagnostics: Diagnostic[] }>(`/designs/${designId}/draft`, { method: 'PUT', body: JSON.stringify({ baseVersion: versao, document: proximo }) });
      setVersao(resultado.version); setDiagnosticos(resultado.diagnostics); setAlterado(false); setSalvamento('saved');
      window.setTimeout(() => setSalvamento((estado) => estado === 'saved' ? 'idle' : estado), 1800);
      return true;
    } catch (causa) {
      setSalvamento('error');
      const texto = causa instanceof Error ? causa.message : 'Não foi possível salvar o desenho.';
      // Conflito de versão: não salva por cima; o usuário decide recarregar.
      if (/outra sessão/i.test(texto)) setConflito(true);
      setMensagem(texto);
      return false;
    }
  }, [designId, salvamento, versao]);
  useEffect(() => {
    if (!documento || !alterado || conflito) return;
    const temporizador = window.setTimeout(() => { void salvar(); }, 2000);
    return () => window.clearTimeout(temporizador);
  }, [documento, alterado, conflito, salvar]);

  /** Mudança com histórico (botões, campos, fim de um arraste). */
  const aplicar = (proximo: TechnicalDocument) => { atual.current = proximo; setDocumento(proximo); setAlterado(true); setSalvamento('idle'); };
  const mudar = useCallback((proximo: TechnicalDocument, antes = atual.current) => {
    if (!antes || proximo === antes) return;
    passado.current = [...passado.current.slice(-99), antes]; futuro.current = []; aplicar(proximo); marcarHistorico();
  }, []);
  /** Mudança sem histórico (durante um arraste); o arraste chama `concluirGesto` no fim. */
  const substituir = useCallback((proximo: TechnicalDocument) => aplicar(proximo), []);
  const concluirGesto = useCallback((antes: TechnicalDocument) => {
    if (atual.current && atual.current !== antes) { passado.current = [...passado.current.slice(-99), antes]; futuro.current = []; marcarHistorico(); }
  }, []);
  const desfazer = useCallback(() => {
    const anterior = passado.current[passado.current.length - 1];
    if (!anterior || !atual.current) return;
    passado.current = passado.current.slice(0, -1); futuro.current = [atual.current, ...futuro.current].slice(0, 100); aplicar(anterior); marcarHistorico();
  }, []);
  const refazer = useCallback(() => {
    const proximo = futuro.current[0];
    if (!proximo || !atual.current) return;
    futuro.current = futuro.current.slice(1); passado.current = [...passado.current, atual.current].slice(-100); aplicar(proximo); marcarHistorico();
  }, []);
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (!(evento.ctrlKey || evento.metaKey)) return;
      const tecla = evento.key.toLowerCase();
      if (tecla === 'z' && !evento.shiftKey) { evento.preventDefault(); desfazer(); }
      else if (tecla === 'y' || (tecla === 'z' && evento.shiftKey)) { evento.preventDefault(); refazer(); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [desfazer, refazer]);

  return {
    dados, documento, diagnosticos, revisoes, materiais, salvamento, conflito, mensagem, setMensagem,
    podeDesfazer: passado.current.length > 0, podeRefazer: futuro.current.length > 0,
    carregar, recarregarRevisoes, salvar, mudar, substituir, concluirGesto, desfazer, refazer,
  };
}
