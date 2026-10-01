'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utilitarios/api';
import { assinaturas, conteudoParaServidor, juntarRascunhos, lerDadosServidor, LIMITE_REMOVIDOS, type EspacoSincronizavel } from '../../utilitarios/rascunho-servidor';

type RascunhoNoServidor = { data: unknown; version: number; updatedAt: string };
type RespostaLeitura = { version: number | null; draft?: RascunhoNoServidor };
type RespostaGravacao = { saved: true; version: number } | { saved: false; draft: RascunhoNoServidor | null };
/** Guardado neste aparelho ao lado do rascunho: versão do servidor que ele conhece e se falta mandar mudanças. */
type Sincronia = { versao: number | null; pendente: boolean; removidos: string[] };

const esperar = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
/** Nada aberto e nada removido: não há o que mandar ao servidor. */
const semNada = (conteudo: string) => { const dados = JSON.parse(conteudo) as { workspaces: unknown[]; removedWorkspaceIds: unknown[] }; return !dados.workspaces.length && !dados.removedWorkspaceIds.length; };
const INTERVALO_CONSULTA_MS = 15_000;
const ESPERA_ENVIO_MS = 1_000;

/**
 * Mantém os atendimentos do Novo orçamento (clientes abertos e os seus projetos) iguais em todos
 * os aparelhos do usuário: manda as mudanças ao servidor, traz as feitas em outro aparelho
 * (ao voltar para a tela e a cada 15 s) e, se os dois mudaram, junta os atendimentos dos dois.
 */
export function useRascunhoServidor<W extends EspacoSincronizavel>({ chave, ativo, espacos, temDados, normalizar, receber }: {
  /** Chave deste aparelho para lembrar a sincronia. */
  chave: string;
  /** Só depois de ler o rascunho deste aparelho (e nunca ao editar um orçamento salvo). */
  ativo: boolean;
  espacos: W[];
  temDados: (espaco: W) => boolean;
  /** Atendimentos vindos do servidor no formato atual do editor. */
  normalizar: (espacos: Partial<W>[]) => W[];
  /** Troca os atendimentos da tela pelos recebidos (cada aparelho mantém o cliente e o projeto que tem abertos). */
  receber: (espacos: W[]) => void;
}) {
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const conteudo = useMemo(() => conteudoParaServidor(espacos, removidos, temDados), [espacos, removidos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tudo o que as rotinas assíncronas leem fica em refs: valem sempre os dados da última tela.
  // "base": como cada atendimento estava na última versão em comum com o servidor, para, ao juntar,
  // saber o que mudou neste aparelho e o que mudou no outro.
  const estado = useRef({ versao: null as number | null, enviado: '', conteudo, base: new Map<string, string>(), enviando: false, buscando: false });
  const atual = useRef({ espacos, removidos, temDados, normalizar, receber });
  estado.current.conteudo = conteudo;
  atual.current = { espacos, removidos, temDados, normalizar, receber };

  const gravarSincronia = () => {
    const { versao, enviado, conteudo: agora } = estado.current;
    const sincronia: Sincronia = { versao, pendente: agora !== enviado, removidos: atual.current.removidos };
    try { localStorage.setItem(chave, JSON.stringify(sincronia)); } catch { /* sem armazenamento local */ }
  };
  const trocarRemovidos = (lista: string[]) => { atual.current.removidos = lista; setRemovidos(lista); };

  /** Chegou uma versão de outro aparelho: sem mudanças pendentes aqui, vale a do servidor; com elas, junta. */
  const receberDoServidor = (rascunho: RascunhoNoServidor) => {
    const e = estado.current;
    if (e.versao !== null && rascunho.version <= e.versao) return;
    const dados = lerDadosServidor<W>(rascunho.data);
    const { temDados: comDados, normalizar: formatar, receber: trocar } = atual.current;
    const doServidor = formatar(dados.workspaces);
    if (e.conteudo === e.enviado) {
      trocar(doServidor);
      trocarRemovidos(dados.removedWorkspaceIds);
      e.conteudo = e.enviado = conteudoParaServidor(doServidor, dados.removedWorkspaceIds, comDados);
      atual.current.espacos = doServidor;
    } else {
      const juntos = juntarRascunhos({ workspaces: atual.current.espacos, removedWorkspaceIds: atual.current.removidos }, { workspaces: doServidor, removedWorkspaceIds: dados.removedWorkspaceIds }, comDados, e.base);
      trocar(juntos.workspaces);
      trocarRemovidos(juntos.removedWorkspaceIds);
      e.conteudo = conteudoParaServidor(juntos.workspaces, juntos.removedWorkspaceIds, comDados);
      e.enviado = ''; // falta mandar o resultado da junção
      atual.current.espacos = juntos.workspaces;
    }
    e.base = assinaturas(doServidor);
    e.versao = rascunho.version;
    gravarSincronia();
  };

  /**
   * Manda as mudanças deste aparelho: "igual" quando o servidor ficou com elas; "juntou" quando
   * outro aparelho tinha gravado antes (já juntou, falta mandar); "ocupado" com outro envio em curso.
   */
  const enviar = async (aoSair = false): Promise<'igual' | 'juntou' | 'ocupado' | 'sem-conexao'> => {
    const e = estado.current;
    if (e.enviando) return 'ocupado';
    if (e.conteudo === e.enviado) return 'igual';
    const conteudoEnviado = e.conteudo;
    // Aparelho novo, sem nada aberto e nada no servidor: não há o que gravar.
    if (e.versao === null && semNada(conteudoEnviado)) { e.enviado = conteudoEnviado; gravarSincronia(); return 'igual'; }
    e.enviando = true;
    let resultado: 'igual' | 'juntou' | 'sem-conexao' = 'sem-conexao';
    try {
      const corpo = `{"data":${conteudoEnviado},"baseVersion":${e.versao ?? 'null'}}`;
      // Ao fechar ou trocar de app, "keepalive" deixa o envio terminar (o navegador só aceita corpos pequenos assim).
      const resposta = await api<RespostaGravacao>('/quote-draft', { method: 'PUT', body: corpo, keepalive: aoSair && corpo.length < 60_000 });
      if (resposta.saved) { e.versao = resposta.version; e.enviado = conteudoEnviado; e.base = assinaturas((JSON.parse(conteudoEnviado) as { workspaces: { id: string }[] }).workspaces); }
      else {
        // Outro aparelho gravou antes (ou o rascunho sumiu do servidor): junta com o atual e manda de novo.
        e.versao = null;
        if (resposta.draft) receberDoServidor(resposta.draft);
      }
      resultado = e.conteudo === e.enviado ? 'igual' : 'juntou';
    } catch { /* sem conexão: continua pendente e tenta de novo na próxima mudança ou consulta */ }
    finally { e.enviando = false; gravarSincronia(); }
    if (resultado === 'juntou') setTentativa((valor) => valor + 1);
    return resultado;
  };

  // Ao abrir: lê a sincronia deste aparelho e traz o que estiver no servidor.
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let sincronia: Sincronia | null = null;
    try { sincronia = JSON.parse(localStorage.getItem(chave) || 'null') as Sincronia | null; } catch { /* sincronia ilegível: trata como rascunho antigo */ }
    const e = estado.current;
    const lembrados = Array.isArray(sincronia?.removidos) ? sincronia.removidos : [];
    trocarRemovidos(lembrados);
    e.versao = typeof sincronia?.versao === 'number' ? sincronia.versao : null;
    e.conteudo = conteudoParaServidor(atual.current.espacos, lembrados, atual.current.temDados);
    // Rascunho de antes da sincronia (ou com mudanças que não chegaram ao servidor): ainda falta mandar.
    // Sem nada aberto neste aparelho, simplesmente vale o que estiver no servidor.
    const emDia = (!!sincronia && !sincronia.pendente) || semNada(e.conteudo);
    e.enviado = emDia ? e.conteudo : '';
    e.base = emDia ? assinaturas(atual.current.espacos.filter(atual.current.temDados)) : new Map();
    api<RespostaLeitura>('/quote-draft')
      .then((resposta) => { if (vivo && resposta.draft) receberDoServidor(resposta.draft); })
      .catch(() => { /* sem conexão: segue com o rascunho deste aparelho */ })
      .finally(() => { if (vivo) setPronto(true); });
    return () => { vivo = false; };
  }, [ativo, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada mudança: lembra que está pendente e manda ao servidor logo depois.
  useEffect(() => {
    if (!ativo) return;
    gravarSincronia();
    if (!pronto || conteudo === estado.current.enviado) return;
    const espera = window.setTimeout(() => void enviar(), ESPERA_ENVIO_MS);
    return () => window.clearTimeout(espera);
  }, [ativo, pronto, conteudo, tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Traz o que foi feito em outro aparelho ao voltar para a tela e a cada 15 s; manda o pendente ao sair.
  useEffect(() => {
    if (!ativo || !pronto) return;
    const atualizar = async () => {
      const e = estado.current;
      if (document.visibilityState !== 'visible' || e.enviando || e.buscando) return;
      if (e.conteudo !== e.enviado) return void enviar();
      e.buscando = true;
      try {
        const resposta = await api<RespostaLeitura>(`/quote-draft${e.versao ? `?known=${e.versao}` : ''}`);
        if (resposta.draft) receberDoServidor(resposta.draft);
      } catch { /* sem conexão: tenta na próxima */ } finally { e.buscando = false; }
    };
    const aoTrocarDeTela = () => { if (document.visibilityState === 'hidden') void enviar(true); else void atualizar(); };
    const aoFechar = () => void enviar(true);
    const consulta = window.setInterval(() => void atualizar(), INTERVALO_CONSULTA_MS);
    window.addEventListener('focus', atualizar);
    document.addEventListener('visibilitychange', aoTrocarDeTela);
    window.addEventListener('pagehide', aoFechar);
    return () => {
      window.clearInterval(consulta);
      window.removeEventListener('focus', atualizar);
      document.removeEventListener('visibilitychange', aoTrocarDeTela);
      window.removeEventListener('pagehide', aoFechar);
    };
  }, [ativo, pronto]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    /** Atendimento apagado aqui: não volta pelo rascunho de outro aparelho. */
    marcarRemovido(id: string) { trocarRemovidos([...atual.current.removidos.filter((outro) => outro !== id), id].slice(-LIMITE_REMOVIDOS)); },
    /**
     * Orçamento salvo: o atendimento sai do rascunho em todos os aparelhos. Espera o servidor
     * (no máximo alguns segundos) e devolve os atendimentos que continuam abertos.
     */
    async concluirAtendimento(id: string, restantes: W[]): Promise<W[]> {
      if (!ativo) return restantes;
      const e = estado.current;
      const lista = [...atual.current.removidos.filter((outro) => outro !== id), id].slice(-LIMITE_REMOVIDOS);
      trocarRemovidos(lista);
      atual.current.espacos = restantes;
      e.conteudo = conteudoParaServidor(restantes, lista, atual.current.temDados);
      gravarSincronia();
      // Sem conexão, fica pendente neste aparelho e vai ao servidor na próxima vez que abrir.
      for (const limite = Date.now() + 5_000; Date.now() < limite;) {
        const resultado = await enviar();
        if (resultado === 'ocupado') await esperar(100);
        else if (resultado !== 'juntou') break;
      }
      const fora = new Set(atual.current.removidos);
      return atual.current.espacos.filter((espaco) => !fora.has(espaco.id));
    },
  };
}
