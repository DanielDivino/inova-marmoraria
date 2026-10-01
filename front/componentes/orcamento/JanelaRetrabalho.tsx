'use client';

import { useState } from 'react';
import { Janela } from '../Janela';

export type DestinoRetrabalho = 'IN_PROGRESS' | 'DONE';

/**
 * Retrabalho de um projeto (erro de produção ou de entrega): escolhe para onde as peças voltam no
 * fluxo de trabalho e, se quiser, o motivo. O orçamento passa para a situação "Retrabalho".
 */
export function JanelaRetrabalho({ projeto, ocupada, erro, aoFechar, aoConfirmar }: {
  projeto: string; ocupada: boolean; erro: string;
  aoFechar: () => void;
  aoConfirmar: (destino: DestinoRetrabalho, motivo: string) => void;
}) {
  const [destino, setDestino] = useState<DestinoRetrabalho>('IN_PROGRESS');
  const [motivo, setMotivo] = useState('');
  const opcoes: [DestinoRetrabalho, string, string][] = [
    ['IN_PROGRESS', 'Produção', 'As peças produzidas e entregues voltam para “Em andamento”, para serem refeitas.'],
    ['DONE', 'Entrega', 'As peças entregues voltam para “Produzido – entrega/montagem”, para serem entregues de novo.'],
  ];
  return <Janela aberta aoFechar={aoFechar} ocupada={ocupada} icone="refazer" titulo="Retrabalho" subtitulo={projeto} className="janela-retrabalho"
    aoEnviar={(event) => { event.preventDefault(); aoConfirmar(destino, motivo.trim()); }}
    dica="O orçamento passa para a situação “Retrabalho”; as notas de entrega já emitidas continuam guardadas."
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button>
      <button className="botao-principal" disabled={ocupada}>{ocupada ? 'Enviando…' : 'Colocar em retrabalho'}</button></>}>
    <p className="aprovacao-pergunta">Para onde o projeto volta?</p>
    <div className="aprovacao-opcoes" role="radiogroup" aria-label="Para onde o projeto volta?">
      {opcoes.map(([valor, titulo, texto]) => <label key={valor} className={destino === valor ? 'ativa' : undefined}>
        <input type="radio" name="retrabalho-destino" checked={destino === valor} onChange={() => setDestino(valor)} />
        <span><strong>{titulo}</strong><small>{texto}</small></span>
      </label>)}
    </div>
    <div className="editar-contato-campos">
      <label className="largo">Motivo (opcional)<textarea rows={2} maxLength={500} value={motivo} placeholder="Ex.: peça entregue com medida errada" onChange={(event) => setMotivo(event.target.value)} /></label>
    </div>
    {erro && <p role="alert" className="form-error">{erro}</p>}
  </Janela>;
}
