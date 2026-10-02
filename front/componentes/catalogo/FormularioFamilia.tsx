'use client';

import { useState, type FormEvent } from 'react';
import { NIVEIS_DE_MANUTENCAO, NOME_DO_USO, USOS_DA_PEDRA, type NivelDeManutencao, type UsoDaPedra } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { Icone } from '../filtros/Filtros';
import { Janela } from '../Janela';
import type { Desempenho, Familia } from './tipos';
import './catalogo.css';

type Rascunho = Omit<Familia, 'id' | 'sortOrder' | 'materialCount' | 'desempenho'> & { comNotas: boolean; desempenho: Desempenho };
const DESEMPENHO_INICIAL: Desempenho = { scratchResistance: 3, stainResistance: 3, heatResistance: 3, aesthetics: 3, maintenance: 'Média', costLevel: 3 };
const vazio: Rascunho = { name: '', plural: '', summary: '', style: '', advantages: [''], care: [''], uses: [], comNotas: true, desempenho: DESEMPENHO_INICIAL };
const NOTAS: [keyof Desempenho, string][] = [['scratchResistance', 'Resistência a riscos'], ['stainResistance', 'Resistência a manchas'], ['heatResistance', 'Resistência ao calor'], ['aesthetics', 'Estética']];

/** Itens de texto (vantagens, cuidados): de 1 a 6, com adicionar e remover. */
function ListaDeTextos({ rotulo, valores, aoMudar, exemplo }: { rotulo: string; valores: string[]; aoMudar: (valores: string[]) => void; exemplo: string }) {
  return <fieldset className="catalogo-lista">
    <legend>{rotulo}</legend>
    {valores.map((valor, indice) => <div key={indice}>
      <input value={valor} aria-label={`${rotulo} ${indice + 1}`} placeholder={indice ? '' : exemplo} maxLength={120} onChange={(event) => aoMudar(valores.map((atual, posicao) => posicao === indice ? event.target.value : atual))} />
      {valores.length > 1 && <button type="button" className="catalogo-remover" aria-label={`Remover ${rotulo.toLocaleLowerCase('pt-BR')} ${indice + 1}`} onClick={() => aoMudar(valores.filter((_, posicao) => posicao !== indice))}><Icone nome="fechar" tamanho={16} /></button>}
    </div>)}
    {valores.length < 6 && <button type="button" className="text-button" onClick={() => aoMudar([...valores, ''])}><Icone nome="mais" tamanho={16} />Adicionar</button>}
  </fieldset>;
}

/** Mesmas regras da API, com a mensagem de cada campo. */
function conferir(rascunho: Rascunho) {
  const limpos = (valores: string[]) => valores.map((valor) => valor.trim()).filter(Boolean);
  if (rascunho.name.trim().length < 2) return 'Informe o nome da família.';
  if (rascunho.plural.trim().length < 2) return 'Informe o nome no plural (usado nos filtros).';
  if (rascunho.summary.trim().length < 20) return 'Escreva o resumo da família (ao menos uma frase).';
  if (rascunho.style.trim().length < 3) return 'Informe o estilo visual.';
  if (limpos(rascunho.advantages).some((valor) => valor.length < 3) || !limpos(rascunho.advantages).length) return 'Informe ao menos uma vantagem (com 3 letras ou mais).';
  if (limpos(rascunho.care).some((valor) => valor.length < 3) || !limpos(rascunho.care).length) return 'Informe ao menos um cuidado (com 3 letras ou mais).';
  if (!rascunho.uses.length) return 'Marque ao menos um uso.';
  return '';
}

/**
 * Família nova ou editada, com todas as informações que o mostruário mostra: resumo, estilo,
 * vantagens, cuidados, onde usar e as notas de desempenho (ou "conforme a ficha do fabricante").
 */
export function FormularioFamilia({ familia, aoFechar, aoSalvar }: { familia?: Familia; aoFechar: () => void; aoSalvar: (familia: Familia) => void }) {
  const [rascunho, setRascunho] = useState<Rascunho>(() => !familia ? vazio : {
    name: familia.name, plural: familia.plural, summary: familia.summary, style: familia.style, advantages: familia.advantages, care: familia.care, uses: familia.uses,
    comNotas: !!familia.desempenho, desempenho: familia.desempenho ?? DESEMPENHO_INICIAL,
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (parcial: Partial<Rascunho>) => setRascunho((atual) => ({ ...atual, ...parcial }));
  const nota = (campo: keyof Desempenho, valor: number | NivelDeManutencao) => setRascunho((atual) => ({ ...atual, desempenho: { ...atual.desempenho, [campo]: valor } }));
  const alternarUso = (uso: UsoDaPedra) => mudar({ uses: rascunho.uses.includes(uso) ? rascunho.uses.filter((atual) => atual !== uso) : USOS_DA_PEDRA.filter((item) => item === uso || rascunho.uses.includes(item)) });

  async function salvar(event: FormEvent) {
    event.preventDefault();
    const problema = conferir(rascunho);
    setErro(problema);
    if (problema) return;
    const { comNotas, desempenho, ...dados } = rascunho;
    const corpo = { ...dados, advantages: dados.advantages.map((item) => item.trim()).filter(Boolean), care: dados.care.map((item) => item.trim()).filter(Boolean), desempenho: comNotas ? desempenho : null };
    setSalvando(true);
    try {
      aoSalvar(await api<Familia>(familia ? `/catalog/families/${familia.id}` : '/catalog/families', { method: familia ? 'PATCH' : 'POST', body: JSON.stringify(corpo) }));
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar a família.'); } finally { setSalvando(false); }
  }

  return <Janela aberta aoFechar={aoFechar} className="catalog-modal catalogo-familia-janela" icone="camadas" largura="grande" ocupada={salvando} aoEnviar={salvar}
    titulo={familia ? `Editar ${familia.name}` : 'Nova família'} subtitulo="As informações aparecem na ficha de cada pedra do mostruário e no guia de escolha."
    rodape={<><button type="button" className="botao-contorno" onClick={aoFechar}>Cancelar</button><button className="botao-principal" disabled={salvando}>{familia ? 'Salvar família' : 'Criar família'}</button></>}>
    <div className="catalogo-formulario">
      <label>Nome<input value={rascunho.name} onChange={(event) => mudar({ name: event.target.value })} placeholder="Ex.: Porcelanato" maxLength={60} /></label>
      <label>Plural (filtros)<input value={rascunho.plural} onChange={(event) => mudar({ plural: event.target.value })} placeholder="Ex.: Porcelanatos" maxLength={60} /></label>
      <label className="inteira">Resumo<textarea rows={3} value={rascunho.summary} onChange={(event) => mudar({ summary: event.target.value })} placeholder="O que é, como se comporta no dia a dia" maxLength={600} /></label>
      <label className="inteira">Estilo visual<input value={rascunho.style} onChange={(event) => mudar({ style: event.target.value })} placeholder="Ex.: Versátil, contemporâneo, acessível" maxLength={120} /></label>
      <ListaDeTextos rotulo="Vantagens" valores={rascunho.advantages} aoMudar={(advantages) => mudar({ advantages })} exemplo="Ex.: Leve e fácil de transportar" />
      <ListaDeTextos rotulo="Cuidados" valores={rascunho.care} aoMudar={(care) => mudar({ care })} exemplo="Ex.: Bordas podem lascar" />
      <fieldset className="catalogo-marcar inteira">
        <legend>Onde usar</legend>
        {USOS_DA_PEDRA.map((uso) => <label key={uso} className={rascunho.uses.includes(uso) ? 'marcado' : undefined}><input type="checkbox" checked={rascunho.uses.includes(uso)} onChange={() => alternarUso(uso)} />{NOME_DO_USO[uso]}</label>)}
      </fieldset>
      <fieldset className="catalogo-desempenho inteira">
        <legend>Desempenho</legend>
        <div className="catalogo-marcar" role="radiogroup" aria-label="Desempenho">
          <label className={rascunho.comNotas ? 'marcado' : undefined}><input type="radio" name="com-notas" checked={rascunho.comNotas} onChange={() => mudar({ comNotas: true })} />Com notas (1 a 5)</label>
          <label className={!rascunho.comNotas ? 'marcado' : undefined}><input type="radio" name="com-notas" checked={!rascunho.comNotas} onChange={() => mudar({ comNotas: false })} />Conforme a ficha do fabricante</label>
        </div>
        {rascunho.comNotas && <div className="catalogo-notas">
          {NOTAS.map(([campo, rotulo]) => <div key={campo} role="radiogroup" aria-label={rotulo}>
            <span>{rotulo}</span>
            <div className="catalogo-escala">{[1, 2, 3, 4, 5].map((valor) => <label key={valor} className={valor <= Number(rascunho.desempenho[campo]) ? 'cheio' : undefined}>
              <input type="radio" name={campo} checked={rascunho.desempenho[campo] === valor} onChange={() => nota(campo, valor)} aria-label={`${rotulo}: ${valor}`} /><i aria-hidden="true">{valor}</i></label>)}</div>
          </div>)}
          <div role="radiogroup" aria-label="Manutenção"><span>Manutenção</span><div className="catalogo-marcar">
            {NIVEIS_DE_MANUTENCAO.map((nivel) => <label key={nivel} className={rascunho.desempenho.maintenance === nivel ? 'marcado' : undefined}><input type="radio" name="manutencao" checked={rascunho.desempenho.maintenance === nivel} onChange={() => nota('maintenance', nivel)} />{nivel}</label>)}
          </div></div>
          <div role="radiogroup" aria-label="Custo"><span>Custo</span><div className="catalogo-escala custo">{[1, 2, 3, 4, 5].map((valor) => <label key={valor} className={valor <= rascunho.desempenho.costLevel ? 'cheio' : undefined}>
            <input type="radio" name="custo" checked={rascunho.desempenho.costLevel === valor} onChange={() => nota('costLevel', valor)} aria-label={`Custo: ${valor} de 5`} /><i aria-hidden="true">$</i></label>)}</div></div>
        </div>}
      </fieldset>
      {erro && <p className="form-error inteira" role="alert">{erro}</p>}
    </div>
  </Janela>;
}
