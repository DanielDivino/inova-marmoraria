'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Janela } from './Janela';
import type { NomeIcone } from './filtros/Filtros';

/** Pergunta ou aviso no estilo das janelas do sistema (no lugar do confirm/alert do navegador). */
type Pedido = {
  tipo: 'confirmar' | 'avisar';
  titulo: string;
  mensagem: ReactNode;
  confirmar?: string;
  cancelar?: string;
  /** Segunda ação, ao lado da principal (pergunta de `escolher`). */
  alternativa?: string;
  /** Ação que apaga ou encerra algo: botão vermelho. */
  perigo?: boolean;
  icone?: NomeIcone;
  responder: (resposta: boolean | 'alternativa') => void;
  id: number;
};
type Opcoes = Omit<Pedido, 'tipo' | 'responder' | 'id'>;
let mostrar: ((pedido: Omit<Pedido, 'id'>) => void) | null = null;
let proximo = 0;
const textoSimples = (opcoes: Opcoes) => [opcoes.titulo, typeof opcoes.mensagem === 'string' ? opcoes.mensagem : ''].filter(Boolean).join('\n\n');

/** Pergunta em um texto só: a primeira frase (até o "?") vira o título e o resto, a explicação. */
export function pergunta(texto: string, opcoes: Partial<Omit<Opcoes, 'titulo' | 'mensagem'>> = {}): Opcoes {
  const fim = texto.indexOf('?');
  return { ...opcoes, titulo: fim < 0 ? texto : texto.slice(0, fim + 1), mensagem: fim < 0 ? '' : texto.slice(fim + 1).trim() };
}
/** Pergunta com "Cancelar" e o botão da ação; responde true só se a pessoa confirmar. */
export function confirmar(opcoes: Opcoes): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mostrar) { resolve(window.confirm(textoSimples(opcoes))); return; }
    mostrar({ ...opcoes, tipo: 'confirmar', responder: (resposta) => resolve(resposta === true) });
  });
}
/** Pergunta com duas ações e "Cancelar": responde a ação escolhida, ou null se a pessoa desistir. */
export function escolher(opcoes: Opcoes & { alternativa: string }): Promise<'confirmar' | 'alternativa' | null> {
  return new Promise((resolve) => {
    if (!mostrar) { resolve(window.confirm(textoSimples(opcoes)) ? 'confirmar' : null); return; }
    mostrar({ ...opcoes, tipo: 'confirmar', responder: (resposta) => resolve(resposta === 'alternativa' ? 'alternativa' : resposta ? 'confirmar' : null) });
  });
}
/** Aviso com um único botão "Entendi". */
export function avisar(opcoes: Omit<Opcoes, 'cancelar' | 'perigo'>): Promise<void> {
  return new Promise((resolve) => {
    if (!mostrar) { window.alert(textoSimples(opcoes)); resolve(); return; }
    mostrar({ ...opcoes, tipo: 'avisar', responder: () => resolve() });
  });
}

/** Mostra as perguntas e avisos, um de cada vez (fica na estrutura da aplicação). */
export function JanelasDeConfirmacao() {
  const [fila, setFila] = useState<Pedido[]>([]);
  useEffect(() => {
    mostrar = (pedido) => setFila((atual) => [...atual, { ...pedido, id: ++proximo }]);
    return () => { mostrar = null; };
  }, []);
  const atual = fila[0];
  const responder = (resposta: boolean | 'alternativa') => { atual?.responder(resposta); setFila((lista) => lista.slice(1)); };
  if (!atual) return null;
  return <Janela key={atual.id} aberta alerta largura="pequena" className="janela-confirmacao" icone={atual.icone ?? (atual.perigo ? 'alerta' : atual.tipo === 'avisar' ? 'info' : undefined)} titulo={atual.titulo}
    aoFechar={() => responder(false)} rotuloFechar="Fechar"
    rodape={atual.tipo === 'avisar'
      ? <button type="button" className="botao-principal" autoFocus onClick={() => responder(true)}>{atual.confirmar ?? 'Entendi'}</button>
      : <><button type="button" className="botao-contorno" onClick={() => responder(false)}>{atual.cancelar ?? 'Cancelar'}</button>
        {atual.alternativa && <button type="button" className="botao-contorno" onClick={() => responder('alternativa')}>{atual.alternativa}</button>}
        <button type="button" className={atual.perigo ? 'botao-perigo' : 'botao-principal'} autoFocus onClick={() => responder(true)}>{atual.confirmar ?? 'Confirmar'}</button></>}>
    <div className="janela-mensagem">{atual.mensagem}</div>
  </Janela>;
}
