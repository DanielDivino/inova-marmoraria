'use client';

import { useState, type FormEvent } from 'react';
import { componentTypeLabels, type ComponentType } from '@inova/domain';
import { Janela } from '../Janela';

type Peca = { id: string; label: string; componentType: string; lengthMm: number; widthMm: number; quantity: number };
const metros = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Corrigir nomes do projeto (o nome dele e a descrição de cada peça), em qualquer situação, até
 * entregue: medidas, valores e o que já foi entregue não mudam.
 */
export function JanelaNomes({ nomeProjeto, pecas, ocupada, erro, aoFechar, aoSalvar }: {
  nomeProjeto: string; pecas: Peca[]; ocupada: boolean; erro: string;
  aoFechar: () => void; aoSalvar: (dados: { projectName: string | null; components: { id: string; label: string }[] }) => void;
}) {
  const [nome, setNome] = useState(nomeProjeto);
  const [rotulos, setRotulos] = useState<Record<string, string>>(() => Object.fromEntries(pecas.map((peca) => [peca.id, peca.label])));
  const salvar = (evento: FormEvent) => {
    evento.preventDefault();
    aoSalvar({ projectName: nome.trim() || null, components: pecas.map((peca) => ({ id: peca.id, label: (rotulos[peca.id] ?? '').trim() })) });
  };
  return <Janela aberta aoFechar={aoFechar} className="janela-nomes" icone="lapis" largura="media" ocupada={ocupada} aoEnviar={salvar}
    titulo="Editar nomes" subtitulo="Só os nomes mudam: medidas, valores e o que já foi entregue continuam iguais."
    rodape={<><button type="button" className="botao-contorno" disabled={ocupada} onClick={aoFechar}>Cancelar</button><button className="botao-principal" disabled={ocupada}>{ocupada ? 'Salvando…' : 'Salvar nomes'}</button></>}>
    <div className="janela-nomes-campos">
      <label>Nome do projeto<input value={nome} maxLength={120} onChange={(evento) => setNome(evento.target.value)} placeholder="Ex.: Cozinha" /></label>
      {pecas.length > 0 && <fieldset>
        <legend>Descrição das peças</legend>
        {pecas.map((peca, indice) => <label key={peca.id}>
          <span>{String(indice + 1).padStart(2, '0')} · {componentTypeLabels[peca.componentType as ComponentType] ?? 'Peça'} · {metros(peca.lengthMm)} × {metros(peca.widthMm)} m{peca.quantity > 1 ? ` · ${peca.quantity} un.` : ''}</span>
          <input aria-label={`Descrição da peça ${indice + 1}`} value={rotulos[peca.id] ?? ''} maxLength={120} placeholder={componentTypeLabels[peca.componentType as ComponentType] ?? 'Peça'}
            onChange={(evento) => setRotulos((atual) => ({ ...atual, [peca.id]: evento.target.value }))} />
        </label>)}
      </fieldset>}
      {erro && <p className="form-error" role="alert">{erro}</p>}
    </div>
  </Janela>;
}
