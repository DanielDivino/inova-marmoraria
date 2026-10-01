'use client';

import { useEffect, useState } from 'react';
import { BUSINESS_TIME_ZONE, dataAtualEmpresa, deslocarDataCalendario } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { Janela } from '../Janela';
import { Icone, type NomeIcone } from '../filtros/Filtros';

type Evento = { id: string; data: string; titulo: string; detalhe?: string; usuario?: string | null; tom: 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'neutro'; icone: 'criado' | 'editado' | 'situacao' | 'prazo' | 'contato' | 'equipe' | 'fluxo' | 'entrega' | 'desenho' | 'material' };
type Historico = { eventos: Evento[]; marcos: { rotulo: string; data: string | null }[] };

const ICONES: Record<Evento['icone'], NomeIcone> = { criado: 'documento', editado: 'lapis', situacao: 'marcado', prazo: 'calendario', contato: 'pessoa', equipe: 'equipe', fluxo: 'andamento', entrega: 'entregue', desenho: 'esquadro', material: 'material' };
const diaCurto = (dia: string) => dia.split('-').reverse().join('/');
const diaPorExtenso = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const hora = (data: string) => new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE });

/** Botão "Histórico" (ao lado da situação do orçamento) com a linha do tempo numa janela. */
export function HistoricoOrcamento({ quoteId, numero, cliente }: { quoteId: string; numero: string; cliente: string }) {
  const [aberto, setAberto] = useState(false);
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!aberto) return;
    const controller = new AbortController();
    setErro('');
    api<Historico>(`/quotes/${quoteId}/historico`, { signal: controller.signal }).then(setHistorico)
      .catch((cause) => { if (!controller.signal.aborted) setErro(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.'); });
    return () => controller.abort();
  }, [aberto, quoteId]);
  // Eventos do mais recente ao mais antigo, agrupados pelo dia (no fuso da empresa).
  const hoje = dataAtualEmpresa();
  const ontem = deslocarDataCalendario(hoje, -1);
  const dias = historico ? historico.eventos.reduce<{ dia: string; eventos: Evento[] }[]>((grupos, evento) => {
    const dia = dataAtualEmpresa(new Date(evento.data));
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === dia) ultimo.eventos.push(evento); else grupos.push({ dia, eventos: [evento] });
    return grupos;
  }, []) : [];
  return <>
    <button type="button" className="orcamento-botao-historico" onClick={() => setAberto(true)} aria-haspopup="dialog"><Icone nome="historico" tamanho={14} />Histórico</button>
    {aberto && <Janela aberta aoFechar={() => setAberto(false)} icone="historico" titulo="Histórico do orçamento" subtitulo={`${numero} · ${cliente}`} largura="media" className="janela-historico"
      rodape={<button type="button" className="botao-contorno" onClick={() => setAberto(false)}>Fechar</button>}>
      {erro && <p role="alert" className="form-error">{erro}</p>}
      {!historico && !erro && <p role="status" className="historico-carregando">Carregando histórico…</p>}
      {historico && <>
        <dl className="historico-marcos">{historico.marcos.map((marco) => <div key={marco.rotulo} className={marco.data ? undefined : 'vazio'}><dt>{marco.rotulo}</dt><dd>{marco.data ? diaCurto(marco.data) : '—'}</dd></div>)}</dl>
        <ol className="historico-linha" aria-label="Linha do tempo">
          {dias.map(({ dia, eventos }) => <li key={dia} className="historico-dia">
            <h3>{dia === hoje ? 'Hoje' : dia === ontem ? 'Ontem' : diaPorExtenso(dia)}</h3>
            <ol>{eventos.map((evento) => <li key={evento.id} className={`historico-evento tom-${evento.tom}`}>
              <span className="historico-ponto" aria-hidden="true"><Icone nome={ICONES[evento.icone]} tamanho={13} /></span>
              <div>
                <p className="historico-titulo"><strong>{evento.titulo}</strong><time dateTime={evento.data}>{hora(evento.data)}</time></p>
                {evento.detalhe && <p className="historico-detalhe">{evento.detalhe}</p>}
                {evento.usuario && <p className="historico-usuario">por {evento.usuario}</p>}
              </div>
            </li>)}</ol>
          </li>)}
        </ol>
      </>}
    </Janela>}
  </>;
}
