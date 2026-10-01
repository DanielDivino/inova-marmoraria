'use client';

import { useEffect, useRef, useState } from 'react';
import { Janela } from '../Janela';

const mesmoNome = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/**
 * "Duplicar projeto": pergunta o nome do novo projeto (o do desenho técnico copiado é o mesmo),
 * para não ficarem projetos com o mesmo nome e só "(cópia)" no fim.
 */
export function JanelaDuplicarProjeto({ original, nomesDoOrcamento, comDesenho, ocupada, erro, aoFechar, aoDuplicar }: {
  original: string;
  /** Nomes dos projetos que já estão no orçamento. */
  nomesDoOrcamento: string[];
  comDesenho: boolean;
  ocupada: boolean;
  erro: string;
  aoFechar: () => void;
  aoDuplicar: (nome: string) => void;
}) {
  const [nome, setNome] = useState(original);
  const [aviso, setAviso] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.select(); }, []);
  const duplicar = () => {
    const escolhido = nome.trim();
    if (!escolhido) { setAviso('Informe o nome do novo projeto.'); return; }
    if (nomesDoOrcamento.some((existente) => mesmoNome(existente, escolhido))) { setAviso('Já existe um projeto com esse nome neste orçamento. Escolha outro nome.'); return; }
    aoDuplicar(escolhido);
  };
  return <Janela aberta aoFechar={aoFechar} ocupada={ocupada} icone="copiar" titulo="Duplicar projeto" subtitulo={`Cópia de “${original}”`} largura="pequena" className="duplicar-projeto"
    aoEnviar={(event) => { event.preventDefault(); duplicar(); }}
    dica={comDesenho ? 'O desenho técnico do projeto também é copiado, com este nome.' : 'Pedra, peças, medidas, acabamentos e valores são copiados.'}
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button><button className="botao-principal" disabled={ocupada}>{ocupada ? 'Duplicando…' : 'Duplicar'}</button></>}>
    <div className="editar-contato-campos">
      <label className="largo">Nome do novo projeto<input ref={campo} value={nome} maxLength={120} autoFocus disabled={ocupada} aria-invalid={!!aviso || undefined}
        onChange={(event) => { setNome(event.target.value); setAviso(''); }} /></label>
    </div>
    {(aviso || erro) && <p role="alert" className="form-error">{aviso || erro}</p>}
  </Janela>;
}
