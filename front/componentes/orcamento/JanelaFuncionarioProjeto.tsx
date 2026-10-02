'use client';

import { Janela } from '../Janela';

export type FuncionarioProjeto = { id: string; name: string; workColor: string };

export function JanelaFuncionarioProjeto({ projeto, funcionarios, selecionado, ocupada, aoFechar, aoSalvar }: {
  projeto: string; funcionarios: FuncionarioProjeto[]; selecionado: string; ocupada: boolean;
  aoFechar: () => void; aoSalvar: (workerId: string | null) => void;
}) {
  return <Janela aberta aoFechar={aoFechar} ocupada={ocupada} icone="equipe" titulo="Funcionário do projeto" subtitulo={projeto}
    aoEnviar={(event) => { event.preventDefault(); const id = new FormData(event.currentTarget).get('workerId'); aoSalvar(typeof id === 'string' && id ? id : null); }}
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button><button className="botao-principal" disabled={ocupada}>{ocupada ? 'Salvando…' : 'Salvar funcionário'}</button></>}>
    <label className="campo-edicao-orcamento">Escolha um funcionário
      <select name="workerId" defaultValue={selecionado}><option value="">Sem funcionário</option>{funcionarios.map((funcionario) => <option key={funcionario.id} value={funcionario.id}>{funcionario.name}</option>)}</select>
    </label>
  </Janela>;
}
