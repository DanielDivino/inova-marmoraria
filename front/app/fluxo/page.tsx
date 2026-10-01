'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { PROJECT_WORKFLOW_LABELS, type ProjectWorkflowStatus } from '@inova/domain';
import { QuadroProjetos, type ColunaId } from '../../componentes/fluxo/QuadroProjetos';
import { useFiltrosNaUrl } from '../../componentes/useFiltrosNaUrl';
import { ResumoOrcamentos } from '../../componentes/fluxo/ResumoOrcamentos';
import { PerguntaPecas, type PedidoPecas } from '../../componentes/fluxo/PerguntaPecas';
import { somaQuantidades, type QuantidadesPecas } from '../../componentes/fluxo/SeletorPecas';
import { api } from '../../utilitarios/api';
import { entregaFinalDoOrcamento, filtrarCartoes, moverCartaoLocal, nomeResponsavel, OPCOES_ENTREGA, OPCOES_MATERIAL, perguntarPecas, rotuloPecas, SEM_RESPONSAVEL, trocarCartoesDoProjeto, type CartaoFluxo, type CartaoMovido, type FiltroEntrega, type FiltroFluxo, type FiltroMaterial } from '../../utilitarios/fluxo';
import { AbasFiltro, CampoFiltro, Icone, MenuSelecao, ModalFiltros, useCelular } from '../../componentes/filtros/Filtros';
import { confirmar } from '../../componentes/Confirmacao';
import '../../componentes/fluxo/fluxo.css';

type Aba = 'QUADRO' | 'RESUMO';
const FILTRO_VAZIO: FiltroFluxo = { customerId: '', quoteId: '', workerId: '', entrega: 'TODAS', entregaDe: '', entregaAte: '', material: '' };
const diaMes = (data?: string) => data ? `${data.slice(8, 10)}/${data.slice(5, 7)}` : '…';

export default function FluxoTrabalhoPage() { return <Suspense fallback={<main className="list-page fluxo-page">Carregando fluxo…</main>}><FluxoTrabalho /></Suspense>; }

/** Filtros guardados no endereço (ex.: ao voltar de um orçamento aberto pelo fluxo). */
function filtroDoEndereco(parametros: URLSearchParams | { get: (nome: string) => string | null }): FiltroFluxo {
  const entrega = OPCOES_ENTREGA.find((opcao) => opcao.valor === parametros.get('entrega'))?.valor ?? 'TODAS';
  const material = OPCOES_MATERIAL.find((opcao) => opcao.valor === parametros.get('material'))?.valor ?? '';
  return { ...FILTRO_VAZIO, customerId: parametros.get('cliente') ?? '', quoteId: parametros.get('orcamento') ?? '', workerId: parametros.get('funcionario') ?? '', entrega, material,
    ...(entrega === 'PERSONALIZADO' ? { entregaDe: parametros.get('entregaDe') ?? '', entregaAte: parametros.get('entregaAte') ?? '' } : {}) };
}

function FluxoTrabalho() {
  const parametros = useSearchParams();
  const [cartoes, setCartoes] = useState<CartaoFluxo[] | null>(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [aba, setAba] = useState<Aba>(parametros.get('aba') === 'RESUMO' ? 'RESUMO' : 'QUADRO');
  const [filtro, setFiltro] = useState<FiltroFluxo>(() => filtroDoEndereco(parametros));
  // Etapa aberta no celular e o cartão para destacar ao voltar de um orçamento aberto por aqui.
  const [coluna, setColuna] = useState(parametros.get('coluna') ?? 'TODO');
  const [destaque] = useState(parametros.get('cartao'));
  useFiltrosNaUrl('fluxo', { aba, cliente: filtro.customerId, orcamento: filtro.quoteId, funcionario: filtro.workerId, entrega: filtro.entrega, entregaDe: filtro.entregaDe, entregaAte: filtro.entregaAte, material: filtro.material, coluna, cartao: null }, { aba: 'QUADRO', entrega: 'TODAS', coluna: 'TODO' });
  // Só a resposta do último movimento de cada cartão atualiza a tela.
  const versoes = useRef<Record<string, number>>({});
  // O desfazer roda depois de outros movimentos: lê sempre a lista mais recente.
  const cartoesAtuais = useRef(cartoes);
  cartoesAtuais.current = cartoes;
  const [aviso, setAviso] = useState('');
  // Cartão com várias peças indo para Produzido/Entregue: espera a resposta de "produziu todas?".
  const [pergunta, setPergunta] = useState<PedidoPecas & { idsDestino: string[]; origem?: 'menu' } | null>(null);
  const [salvandoPecas, setSalvandoPecas] = useState(false);
  const [erroPecas, setErroPecas] = useState('');
  const temporizadorAviso = useRef<number | undefined>(undefined);
  const filtrosAtivos = [filtro.workerId, filtro.customerId, filtro.quoteId, filtro.entrega !== 'TODAS', filtro.material].filter(Boolean).length;
  const limparFiltros = () => setFiltro(FILTRO_VAZIO);
  // Data de entrega: atalhos na hora; "Personalizado" abre a janela com as datas.
  const [periodoAberto, setPeriodoAberto] = useState(false);
  const [rascunho, setRascunho] = useState({ de: '', ate: '' });
  const periodoInvalido = Boolean(rascunho.de && rascunho.ate && rascunho.ate < rascunho.de);
  const escolherEntrega = (valor: FiltroEntrega) => {
    if (valor === 'PERSONALIZADO') { setRascunho({ de: filtro.entregaDe ?? '', ate: filtro.entregaAte ?? '' }); setPeriodoAberto(true); return; }
    setFiltro((atual) => ({ ...atual, entrega: valor, entregaDe: '', entregaAte: '' }));
  };
  const aplicarPeriodo = () => { setFiltro((atual) => ({ ...atual, entrega: 'PERSONALIZADO', entregaDe: rascunho.de, entregaAte: rascunho.ate })); setPeriodoAberto(false); };
  const rotuloEntrega = filtro.entrega === 'PERSONALIZADO' ? `${diaMes(filtro.entregaDe)} – ${diaMes(filtro.entregaAte)}` : undefined;
  const escolherMaterial = (valor: FiltroMaterial) => setFiltro((atual) => ({ ...atual, material: valor }));
  // Mesmo padrão de Orçamentos: menus na barra; no celular, janela de filtros.
  const celular = useCelular();
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // No computador, o título vai para a barra de cima do app e os filtros podem ser recolhidos ("Filtros").
  const [alvoCabecalho, setAlvoCabecalho] = useState<HTMLElement | null>(null);
  useEffect(() => { setAlvoCabecalho(document.getElementById('application-header-tabs')); }, []);
  const [barraFiltros, setBarraFiltros] = useState(true);
  useEffect(() => { try { setBarraFiltros(window.localStorage.getItem('inova-fluxo-filtros') !== 'recolhidos'); } catch { /* Sem armazenamento local, os filtros ficam à mostra. */ } }, []);
  const alternarBarraFiltros = () => setBarraFiltros((atual) => {
    try { window.localStorage.setItem('inova-fluxo-filtros', atual ? 'recolhidos' : 'abertos'); } catch { /* Só não lembra na próxima vez. */ }
    return !atual;
  });
  useEffect(() => () => window.clearTimeout(temporizadorAviso.current), []);
  /** Avisos de movimento somem sozinhos; o de entrega fica até ser fechado. */
  const avisar = (texto: string, temporario = false) => {
    window.clearTimeout(temporizadorAviso.current);
    setAviso(texto);
    if (temporario) temporizadorAviso.current = window.setTimeout(() => setAviso(''), 4000);
  };
  useEffect(() => {
    const controller = new AbortController();
    api<CartaoFluxo[]>('/workflow/projects', { signal: controller.signal }).then(setCartoes)
      .catch((cause) => { if (!controller.signal.aborted) setErro(cause instanceof Error ? cause.message : 'Não foi possível carregar o fluxo de trabalho.'); });
    return () => controller.abort();
  }, [tentativa]);

  const clientes = useMemo(() => [...new Map((cartoes ?? []).map((cartao) => [cartao.quote.customerId, cartao.quote.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [cartoes]);
  // Funcionários vêm dos próprios cartões: o filtro funciona também para quem não gerencia a equipe.
  const funcionarios = useMemo(() => [...new Map((cartoes ?? []).flatMap((cartao) => cartao.quote.worker ? [[cartao.quote.worker.id, cartao.quote.worker] as const] : [])).values()].sort((a, b) => nomeResponsavel(a).localeCompare(nomeResponsavel(b), 'pt-BR')), [cartoes]);
  const temSemResponsavel = useMemo(() => (cartoes ?? []).some((cartao) => !cartao.quote.worker), [cartoes]);
  const orcamentos = useMemo(() => [...new Map(filtrarCartoes(cartoes ?? [], { ...filtro, quoteId: '' }).map((cartao) => [cartao.quote.id, cartao.quote])).values()].sort((a, b) => a.number.localeCompare(b.number)), [cartoes, filtro]);
  const visiveis = useMemo(() => filtrarCartoes(cartoes ?? [], filtro), [cartoes, filtro]);

  /** Liga/desliga a falta de material do projeto (fica marcada no cartão). */
  async function alternarFaltaMaterial(cartao: CartaoFluxo) {
    const valor = !cartao.materialMissing;
    const aplicar = (materialMissing: boolean) => setCartoes((atual) => atual?.map((entrada) => entrada.id === cartao.id ? { ...entrada, materialMissing } : entrada) ?? atual);
    aplicar(valor); setErro('');
    try {
      const salvo = await api<CartaoFluxo>(`/workflow/projects/${cartao.id}/material`, { method: 'PATCH', body: JSON.stringify({ faltaMaterial: valor }) });
      aplicar(!!salvo.materialMissing);
      avisar(valor ? `${cartao.name}: falta de material registrada.` : `${cartao.name}: falta de material regularizada.`, true);
    } catch (cause) {
      aplicar(!valor);
      setErro(cause instanceof Error ? cause.message : 'Não foi possível marcar a falta de material.');
    }
  }

  async function mover(id: string, status: ProjectWorkflowStatus, idsDestino: string[], origem?: 'menu', respondido = false) {
    const atuais = cartoesAtuais.current;
    const cartao = atuais?.find((entrada) => entrada.id === id);
    if (!atuais || !cartao) return;
    if (!respondido && perguntarPecas(cartao, status)) { setErroPecas(''); setPergunta({ cartao, status, idsDestino, origem }); return; }
    // Entregar o último projeto encerra o orçamento, que sai de Orçamentos para o Histórico: confirma antes.
    const entregaFinal = status === 'DELIVERED' && cartao.status !== 'DELIVERED' && entregaFinalDoOrcamento(atuais, id);
    if (entregaFinal && !await confirmar({ titulo: 'Concluir a entrega do orçamento?', mensagem: `Com esta entrega, todos os projetos de ${cartao.quote.number} (${cartao.quote.customerName}) serão concluídos. O orçamento será marcado como entregue e transferido para o Histórico.`, confirmar: 'Marcar como entregue', icone: 'entregue' })) return;
    const { cartoes: atualizados, afterId, beforeId } = moverCartaoLocal(atuais, id, status, idsDestino);
    setCartoes(atualizados); setErro(''); avisar('');
    const versao = (versoes.current[id] ?? 0) + 1;
    versoes.current[id] = versao;
    try {
      const salvo = await api<CartaoMovido>(`/workflow/projects/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status, afterId, beforeId }) });
      if (salvo.quoteDelivered) {
        setCartoes((atual) => atual?.filter((entrada) => entrada.quote.id !== salvo.quote.id) ?? atual);
        avisar(`${salvo.quote.number} · ${salvo.quote.customerName} foi concluído e transferido para o Histórico. Para reabri-lo, utilize "Marcar em retrabalho" no orçamento.`);
      } else {
        // O servidor devolve todos os cartões do projeto: um cartão pode ter se juntado a outro na mesma etapa.
        if (versoes.current[id] === versao) setCartoes((atual) => atual && trocarCartoesDoProjeto(atual, salvo.projectId, salvo.projectCards));
        // Pelo menu do celular o cartão sai da etapa que está na tela: o aviso confirma para onde foi.
        if (origem === 'menu') avisar(`${cartao.name} movido para "${PROJECT_WORKFLOW_LABELS[status]}".`, true);
      }
    } catch (cause) {
      // O quadro volta ao que está salvo para não mostrar uma ordem que não foi gravada.
      setErro(cause instanceof Error ? cause.message : 'Não foi possível mover o projeto.');
      setTentativa((valor) => valor + 1);
    }
  }

  /** "Não, só algumas": as peças marcadas vão para a etapa num cartão novo; as outras ficam onde estavam. */
  async function moverParte(pecas: QuantidadesPecas) {
    if (!pergunta) return;
    const { cartao, status, idsDestino, origem } = pergunta;
    const movidas = somaQuantidades(pecas);
    if (movidas === cartao.pieces) { setPergunta(null); void mover(cartao.id, status, idsDestino, origem, true); return; }
    const indice = idsDestino.indexOf(cartao.id);
    setSalvandoPecas(true); setErroPecas('');
    try {
      const salvo = await api<CartaoMovido>(`/workflow/projects/${cartao.id}/move`, { method: 'PATCH', body: JSON.stringify({ status, afterId: idsDestino[indice - 1] ?? null, beforeId: idsDestino[indice + 1] ?? null, pieces: pecas }) });
      setCartoes((atual) => atual && trocarCartoesDoProjeto(atual, cartao.projectId, salvo.projectCards));
      setPergunta(null);
      const resto = cartao.pieces - movidas;
      avisar(`${cartao.name}: ${rotuloPecas(movidas)} ${movidas === 1 ? 'foi' : 'foram'} para "${PROJECT_WORKFLOW_LABELS[status]}"; ${rotuloPecas(resto)} ${resto === 1 ? 'continua' : 'continuam'} em "${PROJECT_WORKFLOW_LABELS[cartao.status]}".`, true);
    } catch (cause) {
      setErroPecas(cause instanceof Error ? cause.message : 'Não foi possível mover as peças.');
    } finally { setSalvandoPecas(false); }
  }

  const titulo = <h1 className="fluxo-titulo">Fluxo de trabalho</h1>;
  return <main className="list-page fluxo-page">
    {!celular && alvoCabecalho ? createPortal(titulo, alvoCabecalho) : <header className="list-header">{titulo}</header>}
    {/* Uma linha: visualização, filtros e o botão que recolhe os filtros. */}
    <div className="fluxo-barra">
      <AbasFiltro rotulo="Visualização do fluxo" valor={aba} aoEscolher={setAba} grupos={[{ opcoes: [
        { valor: 'QUADRO', rotulo: 'Quadro de projetos', icone: 'camadas' },
        { valor: 'RESUMO', rotulo: 'Resumo por orçamento', icone: 'documento' },
      ] }]} />
      {celular
        ? <form className="barra-filtros" aria-label="Filtros do fluxo" onSubmit={(event) => event.preventDefault()}>
          <button type="button" className="botao-contorno" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(true)}><Icone nome="filtro" />Filtros{filtrosAtivos ? <b>{filtrosAtivos}</b> : null}</button>
          <button type="button" className="botao-contorno barra-filtros-fim" disabled={!filtrosAtivos} onClick={limparFiltros}><Icone nome="limpar" />Limpar</button>
        </form>
        : <>
          {barraFiltros && <form id="fluxo-filtros" className="fluxo-filtros" aria-label="Filtros do fluxo" onSubmit={(event) => event.preventDefault()}>
            <MenuSelecao rotulo="Funcionário" icone="equipe" valor={filtro.workerId} rotuloValor={filtro.workerId ? undefined : 'Todos'} aoEscolher={(valor) => setFiltro((atual) => ({ ...atual, workerId: valor, quoteId: '' }))}
              opcoes={[{ valor: '', rotulo: 'Todos os funcionários' }, ...funcionarios.map((funcionario) => ({ valor: funcionario.id, rotulo: nomeResponsavel(funcionario), cor: funcionario.color })), ...(temSemResponsavel ? [{ valor: SEM_RESPONSAVEL, rotulo: 'Sem responsável' }] : [])]} />
            <MenuSelecao rotulo="Cliente" icone="pessoa" valor={filtro.customerId} rotuloValor={filtro.customerId ? undefined : 'Todos'} aoEscolher={(valor) => setFiltro((atual) => ({ ...atual, customerId: valor, quoteId: '' }))}
              opcoes={[{ valor: '', rotulo: 'Todos os clientes' }, ...clientes.map(([id, nome]) => ({ valor: id, rotulo: nome }))]} />
            <MenuSelecao rotulo="Orçamento" icone="documento" valor={filtro.quoteId} rotuloValor={filtro.quoteId ? undefined : 'Todos'} aoEscolher={(valor) => setFiltro((atual) => ({ ...atual, quoteId: valor }))}
              opcoes={[{ valor: '', rotulo: 'Todos os orçamentos' }, ...orcamentos.map((quote) => ({ valor: quote.id, rotulo: `${quote.number} · ${quote.customerName}` }))]} />
            <MenuSelecao rotulo="Entrega" icone="calendario" valor={filtro.entrega ?? 'TODAS'} rotuloValor={rotuloEntrega} opcoes={OPCOES_ENTREGA} aoEscolher={escolherEntrega} />
            <MenuSelecao rotulo="Material" icone="material" valor={filtro.material ?? ''} opcoes={OPCOES_MATERIAL} aoEscolher={escolherMaterial} />
          </form>}
          <div className="fluxo-barra-acoes">
            {filtrosAtivos > 0 && <button type="button" className="text-button fluxo-limpar" onClick={limparFiltros}><Icone nome="limpar" />Limpar</button>}
            <button type="button" className="botao-contorno fluxo-filtros-botao" aria-expanded={barraFiltros} aria-controls={barraFiltros ? 'fluxo-filtros' : undefined} onClick={alternarBarraFiltros}>
              <Icone nome="filtro" />Filtros{filtrosAtivos ? <b>{filtrosAtivos}</b> : null}<span className="fluxo-filtros-seta" aria-hidden="true"><Icone nome="seta" tamanho={16} /></span>
            </button>
          </div>
        </>}
    </div>
    {celular && <ModalFiltros aberto={filtrosAbertos} aoFechar={() => setFiltrosAbertos(false)} titulo="Filtros do fluxo"
      rodape={<><button type="button" className="botao-contorno" disabled={!filtrosAtivos} onClick={limparFiltros}><Icone nome="limpar" />Limpar</button><button type="button" className="botao-destaque" onClick={() => setFiltrosAbertos(false)}>Ver resultados</button></>}>
      <CampoFiltro rotulo="Funcionário" icone="equipe"><select value={filtro.workerId} onChange={(event) => setFiltro((atual) => ({ ...atual, workerId: event.target.value, quoteId: '' }))}><option value="">Todos os funcionários</option>{funcionarios.map((funcionario) => <option key={funcionario.id} value={funcionario.id}>{nomeResponsavel(funcionario)}</option>)}{temSemResponsavel && <option value={SEM_RESPONSAVEL}>Sem responsável</option>}</select></CampoFiltro>
      <CampoFiltro rotulo="Cliente" icone="pessoa"><select value={filtro.customerId} onChange={(event) => setFiltro((atual) => ({ ...atual, customerId: event.target.value, quoteId: '' }))}><option value="">Todos os clientes</option>{clientes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></CampoFiltro>
      <CampoFiltro rotulo="Orçamento" icone="documento"><select value={filtro.quoteId} onChange={(event) => setFiltro((atual) => ({ ...atual, quoteId: event.target.value }))}><option value="">Todos os orçamentos</option>{orcamentos.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} · {quote.customerName}</option>)}</select></CampoFiltro>
      <CampoFiltro rotulo="Data de entrega" icone="calendario"><select aria-label="Data de entrega" value={filtro.entrega ?? 'TODAS'} onChange={(event) => escolherEntrega(event.target.value as FiltroEntrega)}>{OPCOES_ENTREGA.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}</select></CampoFiltro>
      {filtro.entrega === 'PERSONALIZADO' && <button type="button" className="text-button" onClick={() => escolherEntrega('PERSONALIZADO')}>Alterar datas ({rotuloEntrega})</button>}
      <CampoFiltro rotulo="Material" icone="material"><select aria-label="Falta de material" value={filtro.material ?? ''} onChange={(event) => escolherMaterial(event.target.value as FiltroMaterial)}>{OPCOES_MATERIAL.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}</select></CampoFiltro>
    </ModalFiltros>}
    <ModalFiltros aberto={periodoAberto} aoFechar={() => setPeriodoAberto(false)} titulo="Entrega entre"
      rodape={<><button type="button" className="botao-contorno" onClick={() => setPeriodoAberto(false)}>Cancelar</button><button type="button" className="botao-destaque" disabled={(!rascunho.de && !rascunho.ate) || periodoInvalido} onClick={aplicarPeriodo}>Aplicar</button></>}>
      <CampoFiltro rotulo="De" icone="calendario"><input type="date" value={rascunho.de} max={rascunho.ate || undefined} onChange={(event) => setRascunho((atual) => ({ ...atual, de: event.target.value }))} /></CampoFiltro>
      <CampoFiltro rotulo="Até" icone="calendario"><input type="date" value={rascunho.ate} min={rascunho.de || undefined} onChange={(event) => setRascunho((atual) => ({ ...atual, ate: event.target.value }))} /></CampoFiltro>
      {periodoInvalido && <p role="alert" className="form-error">A data final deve ser igual ou posterior à inicial.</p>}
    </ModalFiltros>
    {aviso && <p role="status" className="fluxo-aviso">{aviso} <button type="button" className="text-button" aria-label="Fechar aviso" onClick={() => avisar('')}>✕</button></p>}
    {erro && <p role="alert" className="form-error">{erro} {!cartoes && <button type="button" className="text-button" onClick={() => { setErro(''); setTentativa((valor) => valor + 1); }}>Tentar novamente</button>}</p>}
    <PerguntaPecas pedido={pergunta} salvando={salvandoPecas} erro={erroPecas} aoCancelar={() => { if (!salvandoPecas) setPergunta(null); }} aoParte={(pecas) => void moverParte(pecas)}
      aoTodas={() => { if (!pergunta) return; const { cartao, status, idsDestino, origem } = pergunta; setPergunta(null); void mover(cartao.id, status, idsDestino, origem, true); }} />
    {!cartoes ? !erro && <p className="empty">Carregando projetos…</p>
      : aba === 'QUADRO' ? <QuadroProjetos cartoes={visiveis} onMover={mover} onFaltaMaterial={alternarFaltaMaterial} colunaInicial={coluna as ColunaId} aoTrocarColuna={setColuna} destaque={destaque} /> : <ResumoOrcamentos cartoes={visiveis} />}
  </main>;
}
