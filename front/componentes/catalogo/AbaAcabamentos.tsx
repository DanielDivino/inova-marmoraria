'use client';

import { useState, type FormEvent } from 'react';
import { APARENCIAS_DE_SUPERFICIE, DESENHOS_DE_BORDA, NOME_DA_APARENCIA, NOME_DO_DESENHO_DE_BORDA, UNIDADE_DO_ACABAMENTO, VALORES_PERCEBIDOS, type AparenciaDeSuperficie, type DesenhoDeBorda, type ValorPercebido } from '@inova/domain';
import { api } from '../../utilitarios/api';
import { formatarMoeda } from '../../utilitarios/formatadores';
import { Icone } from '../filtros/Filtros';
import { Janela } from '../Janela';
import { AmostraDaSuperficie, PerfilDaBorda } from './DesenhoDoAcabamento';
import type { Acabamento } from './tipos';
import './catalogo.css';

export type ServicoDoCatalogo = { id: string; name: string; category: string; billingUnit: 'SQUARE_METER' | 'LINEAR_METER' | 'UNIT' | 'FIXED'; currentPrice: number; isActive: boolean; finishId?: string | null };
const UNIDADE: Record<string, string> = { LINEAR_METER: 'm', SQUARE_METER: 'm²', UNIT: 'un.', FIXED: 'fixo' };
const TITULO = { EDGE: 'Perfis de borda', SURFACE: 'Acabamentos de superfície' } as const;
const desenho = (acabamento: Pick<Acabamento, 'kind' | 'appearance'>, className?: string) => acabamento.kind === 'EDGE'
  ? <PerfilDaBorda desenho={acabamento.appearance as DesenhoDeBorda} className={className} />
  : <AmostraDaSuperficie aparencia={acabamento.appearance as AparenciaDeSuperficie} className={className} />;

/** Bordas e acabamentos de superfície do mostruário, com os serviços (preços) que os cobram. */
export function AbaAcabamentos({ acabamentos, aoEditar }: { acabamentos: Acabamento[]; aoEditar: (acabamento: Acabamento) => void }) {
  return <div className="catalogo-acabamentos">
    {(['EDGE', 'SURFACE'] as const).map((kind) => <section key={kind} aria-labelledby={`catalogo-${kind}`}>
      <h2 id={`catalogo-${kind}`}>{TITULO[kind]}<small>{kind === 'EDGE' ? 'Cobradas por metro linear' : 'Cobrados por m²'}</small></h2>
      <div className="catalogo-grade-acabamentos">
        {acabamentos.filter((acabamento) => acabamento.kind === kind).map((acabamento) => <article key={acabamento.id} className={`catalogo-cartao catalogo-acabamento${acabamento.isActive ? '' : ' inativo'}`}>
          {desenho(acabamento)}
          <header>
            <h3>{acabamento.name}</h3>
            {acabamento.perceivedValue && <span className={`catalogo-valor valor-${acabamento.perceivedValue === 'Técnico' ? 'tecnico' : acabamento.perceivedValue === 'Médio' ? 'medio' : acabamento.perceivedValue.toLowerCase()}`}>Valor {acabamento.perceivedValue.toLocaleLowerCase('pt-BR')}</span>}
            {!acabamento.isActive && <span className="catalogo-valor">Inativo</span>}
          </header>
          <p>{acabamento.description}</p>
          <small>{kind === 'EDGE' ? 'Onde usar' : 'Ideal para'}: {acabamento.uses}</small>
          {acabamento.services.length
            ? <ul className="catalogo-precos">{acabamento.services.map((servico) => <li key={servico.id} className={servico.isActive ? undefined : 'inativo'}><span>{servico.name}</span><b>{formatarMoeda(servico.currentPrice)} / {UNIDADE[servico.billingUnit]}</b></li>)}</ul>
            : <p className="catalogo-sem-preco"><Icone nome="alerta" tamanho={15} />Sem preço: ligue um serviço para usar no orçamento.</p>}
          <button type="button" className="text-button" onClick={() => aoEditar(acabamento)}><Icone nome="lapis" tamanho={16} />Editar</button>
        </article>)}
      </div>
    </section>)}
  </div>;
}

type Rascunho = { kind: 'EDGE' | 'SURFACE'; name: string; appearance: string; description: string; uses: string; perceivedValue: ValorPercebido | null; isActive: boolean };
const vazio = (kind: 'EDGE' | 'SURFACE'): Rascunho => ({ kind, name: '', appearance: kind === 'EDGE' ? 'reta' : 'polido', description: '', uses: '', perceivedValue: kind === 'EDGE' ? 'Médio' : null, isActive: true });

/**
 * Borda ou acabamento novo/editado: desenho (ou aparência), descrição, onde usar e valor percebido;
 * e os preços, que são os serviços ligados a ele (novo preço, ligar um serviço já cadastrado ou desligar).
 */
export function FormularioAcabamento({ acabamento: inicial, servicos, aoFechar, aoMudou }: {
  acabamento?: Acabamento; servicos: ServicoDoCatalogo[]; aoFechar: () => void; aoMudou: (aviso: string) => Promise<void>;
}) {
  const [acabamento, setAcabamento] = useState(inicial);
  const [rascunho, setRascunho] = useState<Rascunho>(() => inicial ? { kind: inicial.kind, name: inicial.name, appearance: inicial.appearance, description: inicial.description, uses: inicial.uses, perceivedValue: inicial.perceivedValue, isActive: inicial.isActive } : vazio('EDGE'));
  const [novoPreco, setNovoPreco] = useState({ name: '', price: '' });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const mudar = (parcial: Partial<Rascunho>) => setRascunho((atual) => ({ ...atual, ...parcial }));
  const unidade = UNIDADE_DO_ACABAMENTO[rascunho.kind];
  const ligados = servicos.filter((servico) => acabamento && servico.finishId === acabamento.id);
  const paraLigar = servicos.filter((servico) => servico.billingUnit === unidade && servico.finishId !== acabamento?.id);

  const executar = async (acao: () => Promise<void>) => {
    setErro(''); setOcupado(true);
    try { await acao(); } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar.'); } finally { setOcupado(false); }
  };
  const recarregar = async (aviso: string) => {
    await aoMudou(aviso);
    if (acabamento) setAcabamento((await api<Acabamento[]>('/catalog/finishes')).find((item) => item.id === acabamento.id));
  };
  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (rascunho.name.trim().length < 2) return setErro('Informe o nome.');
    if (rascunho.description.trim().length < 10) return setErro('Descreva o acabamento (ao menos uma frase).');
    if (rascunho.uses.trim().length < 3) return setErro(rascunho.kind === 'EDGE' ? 'Informe onde usar.' : 'Informe para que é ideal.');
    await executar(async () => {
      const salvo = await api<Acabamento>(acabamento ? `/catalog/finishes/${acabamento.id}` : '/catalog/finishes', { method: acabamento ? 'PATCH' : 'POST', body: JSON.stringify(rascunho) });
      if (acabamento) { await aoMudou(`${salvo.name} atualizado.`); aoFechar(); return; }
      // Recém-criado: continua aberto para ligar os preços.
      setAcabamento(salvo);
      await aoMudou(`${salvo.name} criado. Agora ligue o preço.`);
    });
  }
  const ligar = (servico: ServicoDoCatalogo, finishId: string | null) => executar(async () => {
    await api(`/catalog/services/${servico.id}`, { method: 'PATCH', body: JSON.stringify({ finishId }) });
    await recarregar(finishId ? `${servico.name} passa a cobrar ${rascunho.name}.` : `${servico.name} desligado de ${rascunho.name}.`);
  });
  const criarPreco = () => executar(async () => {
    const preco = Number(novoPreco.price.replace(',', '.'));
    if (novoPreco.name.trim().length < 2) throw new Error('Dê um nome ao serviço (ex.: Bisotê — Granito).');
    if (!Number.isFinite(preco) || preco <= 0) throw new Error('Informe o preço.');
    await api('/catalog/services', { method: 'POST', body: JSON.stringify({ name: novoPreco.name.trim(), category: 'Acabamentos', billingUnit: unidade, currentPrice: preco, isActive: true, finishId: acabamento!.id }) });
    setNovoPreco({ name: '', price: '' });
    await recarregar(`Preço de ${rascunho.name} criado.`);
  });

  const opcoes: readonly string[] = rascunho.kind === 'EDGE' ? DESENHOS_DE_BORDA : APARENCIAS_DE_SUPERFICIE;
  return <Janela aberta aoFechar={aoFechar} className="catalog-modal catalogo-acabamento-janela" icone="esquadro" largura="grande" ocupada={ocupado} aoEnviar={salvar}
    titulo={acabamento ? `Editar ${acabamento.name}` : 'Nova borda ou acabamento'} subtitulo="O desenho, a descrição e o valor percebido aparecem no mostruário; os preços são os serviços ligados."
    rodape={<><button type="button" className="botao-contorno" onClick={aoFechar}>{acabamento && !inicial ? 'Concluir' : 'Cancelar'}</button><button className="botao-principal" disabled={ocupado}>{acabamento ? 'Salvar' : 'Criar'}</button></>}>
    <div className="catalogo-formulario">
      <fieldset className="catalogo-marcar inteira" disabled={!!ligados.length}>
        <legend>Tipo</legend>
        {(['EDGE', 'SURFACE'] as const).map((kind) => <label key={kind} className={rascunho.kind === kind ? 'marcado' : undefined}>
          <input type="radio" name="tipo" checked={rascunho.kind === kind} onChange={() => setRascunho((atual) => ({ ...vazio(kind), name: atual.name, description: atual.description, uses: atual.uses, isActive: atual.isActive }))} />
          {kind === 'EDGE' ? 'Borda (perfil)' : 'Acabamento de superfície'}</label>)}
      </fieldset>
      <label className="inteira">Nome<input value={rascunho.name} onChange={(event) => mudar({ name: event.target.value })} maxLength={60} /></label>
      <fieldset className="catalogo-desenhos inteira">
        <legend>{rascunho.kind === 'EDGE' ? 'Desenho do perfil' : 'Aparência'}</legend>
        {opcoes.map((opcao) => <label key={opcao} className={rascunho.appearance === opcao ? 'marcado' : undefined}>
          <input type="radio" name="aparencia" checked={rascunho.appearance === opcao} onChange={() => mudar({ appearance: opcao })} />
          {desenho({ kind: rascunho.kind, appearance: opcao as Acabamento['appearance'] })}
          <span>{rascunho.kind === 'EDGE' ? NOME_DO_DESENHO_DE_BORDA[opcao as DesenhoDeBorda] : NOME_DA_APARENCIA[opcao as AparenciaDeSuperficie]}</span>
        </label>)}
      </fieldset>
      <label className="inteira">Descrição<textarea rows={2} value={rascunho.description} onChange={(event) => mudar({ description: event.target.value })} maxLength={400} /></label>
      <label className="inteira">{rascunho.kind === 'EDGE' ? 'Onde usar' : 'Ideal para'}<input value={rascunho.uses} onChange={(event) => mudar({ uses: event.target.value })} maxLength={160} /></label>
      {rascunho.kind === 'EDGE' && <fieldset className="catalogo-marcar inteira">
        <legend>Valor percebido pelo cliente</legend>
        {VALORES_PERCEBIDOS.map((valor) => <label key={valor} className={rascunho.perceivedValue === valor ? 'marcado' : undefined}><input type="radio" name="valor" checked={rascunho.perceivedValue === valor} onChange={() => mudar({ perceivedValue: valor })} />{valor}</label>)}
      </fieldset>}
      <label className="active-toggle inteira"><input type="checkbox" checked={rascunho.isActive} onChange={(event) => mudar({ isActive: event.target.checked })} />Ativo (aparece no mostruário)</label>

      {acabamento && <fieldset className="catalogo-precos-editar inteira">
        <legend>Preços · por {unidade === 'LINEAR_METER' ? 'metro linear' : 'm²'}</legend>
        {ligados.length ? <ul>{ligados.map((servico) => <li key={servico.id}>
          <span>{servico.name}{!servico.isActive && <small> · inativo</small>}</span><b>{formatarMoeda(servico.currentPrice)}</b>
          <button type="button" className="text-button" onClick={() => void ligar(servico, null)}>Desligar</button>
        </li>)}</ul> : <p className="catalogo-sem-preco"><Icone nome="alerta" tamanho={15} />Ainda sem preço.</p>}
        <div className="catalogo-novo-preco">
          <input aria-label="Nome do novo serviço" placeholder={`Ex.: ${rascunho.name || 'Bisotê'} — Granito`} value={novoPreco.name} onChange={(event) => setNovoPreco({ ...novoPreco, name: event.target.value })} />
          <input aria-label="Preço do novo serviço" inputMode="decimal" placeholder="Preço (R$)" value={novoPreco.price} onChange={(event) => setNovoPreco({ ...novoPreco, price: event.target.value })} />
          <button type="button" className="botao-contorno" onClick={() => void criarPreco()}><Icone nome="mais" tamanho={16} />Novo preço</button>
        </div>
        {paraLigar.length > 0 && <label className="catalogo-ligar">Ou ligue um serviço já cadastrado
          <select value="" onChange={(event) => { const servico = paraLigar.find((item) => item.id === event.target.value); if (servico) void ligar(servico, acabamento.id); }}>
            <option value="">Escolher serviço…</option>
            {paraLigar.map((servico) => <option key={servico.id} value={servico.id}>{servico.name} · {formatarMoeda(servico.currentPrice)}{servico.finishId ? ' (ligado a outro)' : ''}</option>)}
          </select></label>}
      </fieldset>}
      {erro && <p className="form-error inteira" role="alert">{erro}</p>}
    </div>
  </Janela>;
}
