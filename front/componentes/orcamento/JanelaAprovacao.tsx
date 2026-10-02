'use client';

import { useState } from 'react';
import { arredondarMoeda } from '@inova/domain';
import { Janela } from '../Janela';
import { formatarMoeda } from '../../utilitarios/formatadores';

export type ProjetoParaAprovar = { id: string; nome: string; total: number };
export type ConfirmacaoAprovacao = { naoAprovados: string[]; deliveryDeadline?: string | null; projectDeadlines?: { projectId: string; deliveryDeadline: string | null }[] };

/** Valor à vista dos projetos aprovados: o desconto geral acompanha na mesma proporção (como no servidor). */
export function valorAprovado(projetos: ProjetoParaAprovar[], aprovados: Set<string>, descontoCompleto: number) {
  const soma = (lista: ProjetoParaAprovar[]) => arredondarMoeda(lista.reduce((total, projeto) => total + projeto.total, 0));
  const bruto = soma(projetos.filter((projeto) => aprovados.has(projeto.id))), completo = soma(projetos);
  const desconto = aprovados.size === projetos.length ? descontoCompleto : completo > 0 ? Math.min(bruto, arredondarMoeda(descontoCompleto * bruto / completo)) : 0;
  return arredondarMoeda(bruto - desconto);
}

/**
 * "Confirmar aprovação": o cliente aprovou todos os projetos? Se não, marca quais foram aprovados.
 * Os aprovados vão para o fluxo de trabalho; os outros ficam no orçamento, fora do valor e do fluxo.
 */
export function JanelaAprovacao({ numero, cliente, projetos, descontoCompleto, ocupada, aoFechar, aoConfirmar }: {
  numero: string; cliente: string; projetos: ProjetoParaAprovar[];
  /** Desconto geral negociado para o orçamento completo. */
  descontoCompleto: number;
  ocupada: boolean;
  aoFechar: () => void;
  aoConfirmar: (dados: ConfirmacaoAprovacao) => void;
}) {
  const [todos, setTodos] = useState(true);
  const [marcados, setMarcados] = useState(() => new Set(projetos.map((projeto) => projeto.id)));
  const [modoPrazo, setModoPrazo] = useState<'todos' | 'individual'>('todos');
  const [prazoGeral, setPrazoGeral] = useState('');
  const [prazosProjetos, setPrazosProjetos] = useState<Record<string, string>>({});
  const aprovados = todos ? new Set(projetos.map((projeto) => projeto.id)) : marcados;
  const parcial = aprovados.size < projetos.length;
  const alternar = (id: string, marcado: boolean) => setMarcados((atual) => { const proximo = new Set(atual); if (marcado) proximo.add(id); else proximo.delete(id); return proximo; });
  return <Janela aberta aoFechar={aoFechar} ocupada={ocupada} icone="marcado" titulo="Confirmar aprovação" subtitulo={`${numero} · ${cliente}`} className="janela-aprovacao"
    aoEnviar={(event) => { event.preventDefault(); if (!aprovados.size) return; const selecionados = projetos.filter((projeto) => aprovados.has(projeto.id)); aoConfirmar({ naoAprovados: projetos.filter((projeto) => !aprovados.has(projeto.id)).map((projeto) => projeto.id), ...(modoPrazo === 'todos' ? { deliveryDeadline: prazoGeral || null } : { projectDeadlines: selecionados.map((projeto) => ({ projectId: projeto.id, deliveryDeadline: prazosProjetos[projeto.id] || null })) }) }); }}
    dica={parcial ? 'Os projetos não aprovados ficam no orçamento para consulta, fora do valor e do fluxo de trabalho.' : 'Os projetos aprovados vão para o fluxo de trabalho.'}
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button>
      <button className="botao-principal" disabled={ocupada || !aprovados.size}>{ocupada ? 'Confirmando…' : parcial ? `Aprovar ${aprovados.size} de ${projetos.length} projetos` : 'Confirmar aprovação'}</button></>}>
    {projetos.length > 1 ? <>
      <p className="aprovacao-pergunta">O cliente aprovou todos os projetos?</p>
      <div className="aprovacao-opcoes" role="radiogroup" aria-label="O cliente aprovou todos os projetos?">
        <label className={todos ? 'ativa' : undefined}><input type="radio" name="aprovacao-todos" checked={todos} onChange={() => setTodos(true)} /><span><strong>Sim, todos</strong><small>Os {projetos.length} projetos vão para o fluxo de trabalho.</small></span></label>
        <label className={todos ? undefined : 'ativa'}><input type="radio" name="aprovacao-todos" checked={!todos} onChange={() => setTodos(false)} /><span><strong>Não, só alguns</strong><small>Marque os projetos que o cliente aprovou.</small></span></label>
      </div>
      {!todos && <fieldset className="aprovacao-projetos">
        <legend>Projetos aprovados ({marcados.size} de {projetos.length})</legend>
        {projetos.map((projeto) => <label key={projeto.id}><input type="checkbox" checked={marcados.has(projeto.id)} onChange={(event) => alternar(projeto.id, event.target.checked)} /><span>{projeto.nome}</span><b>{formatarMoeda(projeto.total)}</b></label>)}
        {!marcados.size && <p role="alert" className="form-error">Marque pelo menos um projeto. Se o cliente não aprovou nenhum, use “Marcar como não aprovado” no menu ⋯.</p>}
      </fieldset>}
    </> : <p className="aprovacao-pergunta">Confirmar que o cliente aprovou o projeto “{projetos[0]?.nome}”?</p>}
    <section className="aprovacao-prazos" aria-label="Prazo acordado">
      <h3>Prazo de entrega acordado</h3>
      {projetos.length > 1 && <div className="aprovacao-prazo-modos" role="radiogroup" aria-label="Como definir os prazos">
        <label className={modoPrazo === 'todos' ? 'ativa' : undefined}><input type="radio" name="prazo-modo" checked={modoPrazo === 'todos'} onChange={() => setModoPrazo('todos')} />Um prazo para todos</label>
        <label className={modoPrazo === 'individual' ? 'ativa' : undefined}><input type="radio" name="prazo-modo" checked={modoPrazo === 'individual'} onChange={() => setModoPrazo('individual')} />Um prazo por projeto</label>
      </div>}
      {modoPrazo === 'todos' || projetos.length === 1 ? <label className="acompanhamento-data-label">Prazo de entrega<input type="date" value={prazoGeral} onChange={(event) => setPrazoGeral(event.target.value)} /></label>
        : projetos.filter((projeto) => aprovados.has(projeto.id)).map((projeto) => <label className="acompanhamento-data-label" key={projeto.id}>{projeto.nome}<input type="date" value={prazosProjetos[projeto.id] ?? ''} onChange={(event) => setPrazosProjetos((atual) => ({ ...atual, [projeto.id]: event.target.value }))} /></label>)}
      <small>O prazo pode ser preenchido agora ou editado depois no menu do orçamento ou do projeto.</small>
    </section>
    <p className="aprovacao-valor"><span>Valor aprovado à vista</span><strong>{formatarMoeda(valorAprovado(projetos, aprovados, descontoCompleto))}</strong></p>
  </Janela>;
}
