'use client';

import { Janela } from '../Janela';

export function JanelaAcompanhamento({ projeto, prazo, observacoes, ocupada, aoFechar, aoSalvar }: {
  projeto?: string; prazo?: string | null; observacoes?: string | null; ocupada: boolean;
  aoFechar: () => void; aoSalvar: (dados: { deliveryDeadline: string | null; notes: string | null }) => void;
}) {
  const individual = !!projeto;
  return <Janela aberta aoFechar={aoFechar} ocupada={ocupada} icone="prazo" titulo={individual ? 'Prazo e observações do projeto' : 'Prazo e observações do orçamento'} subtitulo={projeto}
    aoEnviar={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); aoSalvar({ deliveryDeadline: String(form.get('deliveryDeadline') || '') || null, notes: String(form.get('notes') || '').trim() || null }); }}
    dica={individual ? 'As alterações ficam registradas no histórico do projeto.' : 'O prazo geral será aplicado aos projetos não recusados. As alterações ficam registradas no histórico.'}
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button><button className="botao-principal" disabled={ocupada}>{ocupada ? 'Salvando…' : 'Salvar alterações'}</button></>}>
    <div className="acompanhamento-edicao-campos">
      <label className="largo">Prazo de entrega acordado<input type="date" name="deliveryDeadline" defaultValue={prazo?.slice(0, 10) ?? ''} /></label>
      <label>{individual ? 'Observações do projeto' : 'Observações do orçamento'}<textarea name="notes" rows={4} maxLength={3000} defaultValue={observacoes ?? ''} placeholder="Escreva uma observação…" /></label>
    </div>
  </Janela>;
}
