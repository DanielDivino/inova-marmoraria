'use client';

import { useState, type FormEvent } from 'react';
import { SeletorPecas, somaQuantidades, type QuantidadesPecas } from '../fluxo/SeletorPecas';
import { Janela } from '../Janela';
import { formatarMoeda } from '../../utilitarios/formatadores';
import { medidaPeca, rotuloPecas } from '../../utilitarios/fluxo';
import './nota-entrega.css';

/** Peça do projeto: `entregues` não dá para cancelar; `pai` é a peça a que ela está presa (rodabanca na bancada…). */
export type PecaParaAprovacao = { key: string; name: string; lengthMm: number; widthMm: number; material?: string | null; quantity: number; entregues: number; valorUnitario: number; pai?: string };
export type EscolhaNaoAprovado = { pieces: QuantidadesPecas } | { todas: true };

/**
 * "Não aprovado / alterar": as peças do projeto para marcar as que o cliente não aprovou (algumas ou
 * todas). Elas saem do projeto, do valor e do fluxo; as já entregues ficam. Todas, sem nada entregue,
 * é o projeto inteiro como não aprovado (dá para aprovar de novo).
 */
export function JanelaNaoAprovado({ nomeProjeto, pecas, porPecas, motivoSemPecas, unicoAprovado, ocupada, erro, aoFechar, aoConfirmar }: {
  nomeProjeto: string; pecas: PecaParaAprovacao[];
  /** Sem peças separadas (desenho técnico, área manual): só o projeto inteiro. */
  porPecas: boolean; motivoSemPecas?: string;
  /** Único projeto aprovado: tirar tudo seria não aprovar o orçamento. */
  unicoAprovado: boolean;
  ocupada: boolean; erro: string; aoFechar: () => void; aoConfirmar: (escolha: EscolhaNaoAprovado) => void;
}) {
  const [valores, setValores] = useState<QuantidadesPecas>({});
  const abertas = pecas.filter((peca) => peca.quantity > peca.entregues);
  const entregues = pecas.reduce((total, peca) => total + peca.entregues, 0);
  const escolhidas = somaQuantidades(valores);
  const todas = porPecas ? abertas.every((peca) => (valores[peca.key] ?? 0) === peca.quantity - peca.entregues) : true;
  const projetoInteiro = todas && !entregues;
  const valor = abertas.reduce((total, peca) => total + peca.valorUnitario * (valores[peca.key] ?? 0), 0);
  const bloqueado = projetoInteiro && unicoAprovado;
  const nomeDe = (key?: string) => pecas.find((peca) => peca.key === key)?.name;
  // Peça presa (rodabanca, saia) acompanha a principal, na mesma proporção, enquanto não for mudada à parte.
  const livres = (peca: PecaParaAprovacao) => peca.quantity - peca.entregues;
  const mudar = (novos: QuantidadesPecas) => {
    const ajustados = { ...novos };
    for (const peca of abertas) {
      const pai = abertas.find((outra) => outra.key === peca.pai);
      if (!pai || (novos[peca.key] ?? 0) !== (valores[peca.key] ?? 0)) continue;
      const acompanha = (quantas: number) => Math.min(livres(peca), Math.round(quantas * livres(peca) / livres(pai)));
      const antes = valores[pai.key] ?? 0, depois = novos[pai.key] ?? 0;
      if (antes !== depois && (valores[peca.key] ?? 0) === acompanha(antes)) ajustados[peca.key] = acompanha(depois);
    }
    setValores(ajustados);
  };
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (bloqueado || (porPecas && !escolhidas)) return;
    aoConfirmar(porPecas && !todas ? { pieces: Object.fromEntries(Object.entries(valores).filter(([, quantidade]) => quantidade > 0)) } : { todas: true });
  };
  const rotuloBotao = projetoInteiro ? 'Projeto inteiro não aprovado' : todas ? 'Tirar as que faltam entregar' : `Tirar ${rotuloPecas(escolhidas)}`;
  return <Janela aberta aoFechar={aoFechar} className="janela-nao-aprovado" icone="recusado" largura="media" ocupada={ocupada} aoEnviar={enviar}
    titulo={`Não aprovado / alterar · ${nomeProjeto}`}
    subtitulo={porPecas ? 'Marque as peças que o cliente não aprovou: elas saem do projeto, do valor e do fluxo de trabalho.' : 'Este projeto sai inteiro do valor e do fluxo de trabalho, e continua aqui para consulta.'}
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button>
      <button className="botao-perigo" disabled={ocupada || bloqueado || (porPecas && !escolhidas)}>{ocupada ? 'Salvando…' : rotuloBotao}</button></>}>
    <div className="janela-nao-aprovado-corpo">
      {porPecas
        ? <>
          {abertas.length > 0
            ? <SeletorPecas rotulo={`Peças não aprovadas de ${nomeProjeto}`} valores={valores} aoMudar={mudar}
              pecas={abertas.map((peca) => ({ key: peca.key, name: peca.name, max: peca.quantity - peca.entregues,
                detail: [medidaPeca(peca), peca.material, `${formatarMoeda(peca.valorUnitario)} cada`, peca.entregues ? `${peca.entregues} já ${peca.entregues === 1 ? 'entregue' : 'entregues'}` : '', peca.pai ? `presa a: ${nomeDe(peca.pai)}` : ''].filter(Boolean).join(' · ') }))} />
            : <p>Todas as peças deste projeto já foram entregues.</p>}
          {entregues > 0 && <p className="janela-nao-aprovado-nota">As peças já entregues ({entregues}) continuam no projeto.</p>}
        </>
        : <p className="janela-nao-aprovado-nota">{motivoSemPecas}</p>}
      {escolhidas > 0 && !projetoInteiro && <p className="janela-nao-aprovado-resumo"><span>Sai do valor do projeto</span><strong>− {formatarMoeda(valor)}</strong></p>}
      {projetoInteiro && (escolhidas > 0 || !porPecas) && !bloqueado && <p className="janela-nao-aprovado-resumo"><span>O projeto inteiro fica como não aprovado (dá para aprovar de novo depois).</span></p>}
      {bloqueado && (escolhidas > 0 || !porPecas) && <p className="form-error" role="alert">É o único projeto aprovado. Para tirar tudo, marque o orçamento como não aprovado.</p>}
      {erro && <p className="form-error" role="alert">{erro}</p>}
    </div>
  </Janela>;
}
