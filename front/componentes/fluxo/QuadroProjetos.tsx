'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { closestCenter, closestCorners, DndContext, DragOverlay, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useDroppable, useSensor, useSensors, type Announcements, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FASE_ORCAMENTO_FLUXO_LABELS, PROJECT_WORKFLOW_LABELS, PROJECT_WORKFLOW_STATUSES, SITUACAO_PRAZO_FLUXO_LABELS, situacaoPrazoFluxo, type ProjectWorkflowStatus } from '@inova/domain';
import { Icone, useCelular } from '../filtros/Filtros';
import { enderecoOrcamento } from '../../utilitarios/rotas';
import { aguardandoInicio, colunasFluxo, corOrcamento, formatarDataFluxo, nomeResponsavel, rotuloPecasCartao, type CartaoFluxo, type ResponsavelFluxo } from '../../utilitarios/fluxo';

type Ordem = Record<ProjectWorkflowStatus, string[]>;
const PREFIXO_COLUNA = 'coluna:';

/** Abre o orçamento no projeto do cartão; o caminho e o voltar de lá trazem de volta a este cartão. */
export const enderecoProjeto = (cartao: CartaoFluxo) => enderecoOrcamento(cartao.quote.id, { de: 'fluxo', cartao: cartao.id }, { ancora: `projeto-${cartao.projectId}` });

function colunaEm(ordem: Ordem, id: UniqueIdentifier): ProjectWorkflowStatus | undefined {
  const valor = String(id);
  if (valor.startsWith(PREFIXO_COLUNA)) return valor.slice(PREFIXO_COLUNA.length) as ProjectWorkflowStatus;
  return PROJECT_WORKFLOW_STATUSES.find((status) => ordem[status].includes(valor));
}

/** Bolinha na cor de trabalho do funcionário responsável pelo orçamento, com o nome. */
export function Responsavel({ responsavel }: { responsavel: ResponsavelFluxo | null }) {
  if (!responsavel) return <small className="fluxo-responsavel sem-responsavel">Sem responsável</small>;
  return <small className="fluxo-responsavel"><i style={{ backgroundColor: responsavel.color }} aria-hidden="true" />{nomeResponsavel(responsavel)}</small>;
}

/** Etiqueta, peças, nome, cliente, responsável e prazo; a faixa lateral tem a cor do orçamento. */
export function CartaoProjeto({ cartao, ...props }: { cartao: CartaoFluxo } & HTMLAttributes<HTMLElement>) {
  const situacao = situacaoPrazoFluxo(cartao.quote.deadline, cartao.status === 'DELIVERED');
  return <article {...props} data-cartao={cartao.id} className={`fluxo-cartao prazo-${situacao.toLowerCase()} ${props.className ?? ''}`} style={{ ...props.style, '--cor-orcamento': corOrcamento(cartao.quote.id) } as CSSProperties}>
    <div className="fluxo-cartao-topo"><span className="fluxo-etiqueta">{cartao.quote.number}</span><span className={`fluxo-pecas${cartao.totalPieces > cartao.pieces ? ' fluxo-pecas-parte' : ''}`} title={cartao.totalPieces > cartao.pieces ? 'Projeto dividido: as demais peças estão em outra etapa.' : undefined}>{rotuloPecasCartao(cartao)}</span></div>
    {cartao.quote.phase !== 'IN_EXECUTION' && <span className={`fluxo-fase fase-${cartao.quote.phase.toLowerCase()}`}>{FASE_ORCAMENTO_FLUXO_LABELS[cartao.quote.phase]}</span>}
    <strong>{cartao.name}</strong>
    <small>{cartao.quote.customerName}</small>
    <Responsavel responsavel={cartao.quote.worker} />
    {cartao.materialMissing && <small className="fluxo-falta-material"><Icone nome="material" tamanho={13} />Falta de material</small>}
    <small className="fluxo-prazo">{cartao.quote.deadline ? `Prazo final: ${formatarDataFluxo(cartao.quote.deadline)}` : 'Sem prazo final'}{['VENCIDO', 'PROXIMO'].includes(situacao) && <b> · {SITUACAO_PRAZO_FLUXO_LABELS[situacao]}</b>}</small>
  </article>;
}

const descricaoCartao = (cartao: CartaoFluxo) => `${cartao.name}, ${rotuloPecasCartao(cartao)}, ${cartao.quote.customerName}, orçamento ${cartao.quote.number}, ${cartao.quote.worker ? `responsável ${nomeResponsavel(cartao.quote.worker)}` : 'sem responsável'}${cartao.materialMissing ? ', falta de material' : ''}`;

/** Liga/desliga a falta de material, no canto do cartão (fora dele: não arrasta nem abre o orçamento). Produzido/entregue não tem. */
function BotaoFaltaMaterial({ cartao, aoAlternar }: { cartao: CartaoFluxo; aoAlternar?: (cartao: CartaoFluxo) => void }) {
  if (!aoAlternar || cartao.status === 'DONE' || cartao.status === 'DELIVERED') return null;
  const ativo = !!cartao.materialMissing;
  return <button type="button" className={`fluxo-material-botao${ativo ? ' ativo' : ''}`} aria-pressed={ativo}
    aria-label={`${ativo ? 'Tirar' : 'Marcar'} falta de material em ${cartao.name}`} title={ativo ? 'Tirar falta de material' : 'Marcar falta de material'} onClick={() => aoAlternar(cartao)}>
    <Icone nome="material" tamanho={15} />
  </button>;
}

/** Projeto novo nasce no Novo orçamento (e entra no fluxo em "Aguardando início"). */
function AdicionarProjeto() {
  return <Link href="/" className="fluxo-adicionar" title="Abre o Novo orçamento"><Icone nome="mais" tamanho={18} />Adicionar projeto</Link>;
}

export type ColunaId = 'AGUARDANDO' | ProjectWorkflowStatus;
/** Rótulos curtos para a barra de etapas do celular. */
const ROTULO_CURTO: Partial<Record<ColunaId, string>> = { AGUARDANDO: 'Aguardando início', DONE: 'Produzido' };

/** No celular, mover sem arrastar: a lista de etapas do próprio aparelho, com um toque. */
function MoverPara({ cartao, aoEscolher }: { cartao: CartaoFluxo; aoEscolher: (status: ProjectWorkflowStatus) => void }) {
  return <div className="fluxo-mover">
    <select value="" aria-label={`Mover ${cartao.name} para outra etapa`} onChange={(event) => { if (event.target.value) aoEscolher(event.target.value as ProjectWorkflowStatus); }}>
      <option value="" disabled>Mover para…</option>
      {PROJECT_WORKFLOW_STATUSES.filter((status) => status !== cartao.status).map((status) => <option key={status} value={status}>{PROJECT_WORKFLOW_LABELS[status]}</option>)}
    </select>
  </div>;
}

/** Orçamentos ainda não iniciados: só consulta. Os projetos entram em "A fazer" quando o serviço é iniciado. */
function ColunaAguardando({ cartoes, abrir, ativa, faltaMaterial }: { cartoes: CartaoFluxo[]; abrir: (cartao: CartaoFluxo) => void; ativa: boolean; faltaMaterial?: (cartao: CartaoFluxo) => void }) {
  return <section className={`fluxo-coluna fluxo-coluna-aguardando${ativa ? ' ativa' : ''}`} aria-labelledby="fluxo-AGUARDANDO">
    <header><h2 id="fluxo-AGUARDANDO">Aguardando início</h2><span>{cartoes.length}</span></header>
    <p className="fluxo-coluna-nota">Os projetos entram em “A fazer” quando o serviço é iniciado. Se a produção for interrompida, retornam à etapa anterior na retomada.</p>
    <ol className="fluxo-lista">
      {cartoes.map((cartao) => <li key={cartao.id}><div className="fluxo-cartao-caixa"><CartaoProjeto cartao={cartao} role="link" tabIndex={0} className="fluxo-cartao-fixo"
        aria-label={`${descricaoCartao(cartao)}, ${FASE_ORCAMENTO_FLUXO_LABELS[cartao.quote.phase].toLowerCase()}. Enter para abrir.`}
        onClick={() => abrir(cartao)} onKeyDown={(event) => { if (event.key === 'Enter') abrir(cartao); }} /><BotaoFaltaMaterial cartao={cartao} aoAlternar={faltaMaterial} /></div></li>)}
      {!cartoes.length && <li className="fluxo-vazio">Nenhum orçamento aguardando</li>}
    </ol>
    <AdicionarProjeto />
  </section>;
}

function CartaoArrastavel({ cartao, abrir, moverPara, faltaMaterial }: { cartao: CartaoFluxo; abrir: (cartao: CartaoFluxo) => void; moverPara?: (cartao: CartaoFluxo, status: ProjectWorkflowStatus) => void; faltaMaterial?: (cartao: CartaoFluxo) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cartao.id });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, '--cor-orcamento': corOrcamento(cartao.quote.id) } as CSSProperties} className={isDragging ? 'fluxo-cartao-origem' : undefined}>
    <div className="fluxo-cartao-caixa"><CartaoProjeto cartao={cartao} {...attributes} {...listeners}
      aria-label={`${descricaoCartao(cartao)}. Espaço para mover, Enter para abrir.`}
      onClick={() => abrir(cartao)}
      onKeyDown={(event) => { listeners?.onKeyDown?.(event); if (event.key === 'Enter' && !isDragging) abrir(cartao); }} /><BotaoFaltaMaterial cartao={cartao} aoAlternar={faltaMaterial} /></div>
    {moverPara && <MoverPara cartao={cartao} aoEscolher={(status) => moverPara(cartao, status)} />}
  </li>;
}

function Coluna({ status, ids, porId, abrir, ativa, moverPara, faltaMaterial }: { status: ProjectWorkflowStatus; ids: string[]; porId: Map<string, CartaoFluxo>; abrir: (cartao: CartaoFluxo) => void; ativa: boolean; moverPara?: (cartao: CartaoFluxo, status: ProjectWorkflowStatus) => void; faltaMaterial?: (cartao: CartaoFluxo) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: PREFIXO_COLUNA + status });
  return <section className={`fluxo-coluna${isOver ? ' fluxo-coluna-alvo' : ''}${ativa ? ' ativa' : ''}`} aria-labelledby={`fluxo-${status}`}>
    <header><h2 id={`fluxo-${status}`}>{PROJECT_WORKFLOW_LABELS[status]}</h2><span>{ids.length}</span></header>
    <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
      <ol ref={setNodeRef} className="fluxo-lista">
        {ids.map((id) => <CartaoArrastavel key={id} cartao={porId.get(id)!} abrir={abrir} moverPara={moverPara} faltaMaterial={faltaMaterial} />)}
        {!ids.length && <li className="fluxo-vazio">{moverPara ? 'Nenhum projeto nesta etapa' : 'Arraste um projeto para cá'}</li>}
      </ol>
    </SortableContext>
    <AdicionarProjeto />
  </section>;
}

/**
 * Kanban de projetos. Durante o arraste a ordem fica local (`ordem`); ao soltar,
 * `onMover` recebe a coluna de destino e a ordem visível final dela.
 */
export function QuadroProjetos({ cartoes, onMover, onFaltaMaterial, colunaInicial, aoTrocarColuna, destaque }: { cartoes: CartaoFluxo[]; onMover: (id: string, status: ProjectWorkflowStatus, idsDestino: string[], origem?: 'menu') => void; onFaltaMaterial?: (cartao: CartaoFluxo) => void; colunaInicial?: ColunaId; aoTrocarColuna?: (coluna: ColunaId) => void; destaque?: string | null }) {
  const router = useRouter();
  const celular = useCelular();
  // No celular, abre na primeira etapa de trabalho; as outras ficam a um toque na barra de etapas.
  const [colunaAtiva, setColunaAtiva] = useState<ColunaId>(colunaInicial ?? 'TODO');
  useEffect(() => { aoTrocarColuna?.(colunaAtiva); }, [colunaAtiva]); // eslint-disable-line react-hooks/exhaustive-deps
  const colunas = useMemo(() => colunasFluxo(cartoes), [cartoes]);
  const aguardando = useMemo(() => aguardandoInicio(cartoes), [cartoes]);
  const porId = useMemo(() => new Map(cartoes.map((cartao) => [cartao.id, cartao])), [cartoes]);
  // De volta de um orçamento aberto por aqui: mostra a etapa do cartão (no celular), rola até ele e o destaca.
  const destacado = useRef(false);
  useEffect(() => {
    const cartao = destaque ? porId.get(destaque) : undefined;
    if (!cartao || destacado.current) return;
    destacado.current = true;
    setColunaAtiva(aguardando.some((entrada) => entrada.id === cartao.id) ? 'AGUARDANDO' : cartao.status);
    window.setTimeout(() => {
      const elemento = document.querySelector<HTMLElement>(`.fluxo-quadro [data-cartao="${window.CSS.escape(cartao.id)}"]`);
      if (!elemento) return;
      elemento.scrollIntoView({ block: 'center', inline: 'center' });
      elemento.classList.add('fluxo-cartao-destaque');
      window.setTimeout(() => elemento.classList.remove('fluxo-cartao-destaque'), 2600);
    }, 60);
  }, [destaque, porId, aguardando]);
  const [ordemArraste, setOrdemArraste] = useState<Ordem | null>(null);
  const [ativo, setAtivo] = useState<string | null>(null);
  const acabouDeArrastar = useRef(false);
  const ordem: Ordem = ordemArraste ?? Object.fromEntries(PROJECT_WORKFLOW_STATUSES.map((status) => [status, colunas[status].map((cartao) => cartao.id)])) as Ordem;
  // Os atalhos só aparecem quando as colunas não cabem lado a lado na largura da tela.
  const quadro = useRef<HTMLDivElement>(null);
  const [transborda, setTransborda] = useState(false);
  useEffect(() => {
    const elemento = quadro.current;
    if (!elemento) return;
    const medir = () => setTransborda(elemento.scrollWidth > elemento.clientWidth + 1);
    const observer = new ResizeObserver(medir);
    observer.observe(elemento);
    medir();
    return () => observer.disconnect();
  }, []);
  // Mouse arrasta após 6 px; no toque, segurar um instante — assim a página continua rolando.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );
  const nome = (id: UniqueIdentifier) => porId.get(String(id))?.name ?? 'Projeto';
  const coluna = (id?: UniqueIdentifier) => { const status = id === undefined ? undefined : colunaEm(ordem, id); return status ? PROJECT_WORKFLOW_LABELS[status] : ''; };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nome(active.id)} selecionado em ${coluna(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `${nome(active.id)} sobre ${coluna(over.id)}.` : `${nome(active.id)} fora das colunas.`,
    onDragEnd: ({ active, over }) => over ? `${nome(active.id)} solto em ${coluna(over.id)}.` : `${nome(active.id)} voltou ao lugar.`,
    onDragCancel: ({ active }) => `Movimento de ${nome(active.id)} cancelado.`,
  };

  /**
   * Vale a coluna sob o ponteiro (colunas esticadas têm cantos longe do cartão,
   * então `closestCorners` sozinho erra): dentro dela, o cartão mais próximo;
   * abaixo do último cartão, o fim da coluna. Sem ponteiro (teclado), os cantos.
   */
  const detectarDestino: CollisionDetection = (args) => {
    const sobPonteiro = pointerWithin(args);
    const colisoes = sobPonteiro.length ? sobPonteiro : closestCorners(args);
    const cartao = colisoes.find((colisao) => !String(colisao.id).startsWith(PREFIXO_COLUNA));
    if (cartao || !colisoes.length) return cartao ? [cartao] : [];
    const destino = colisoes[0];
    const ids = ordem[String(destino.id).slice(PREFIXO_COLUNA.length) as ProjectWorkflowStatus] ?? [];
    const ultimo = ids.length ? args.droppableRects.get(ids[ids.length - 1]) : undefined;
    if (!ids.length || (args.pointerCoordinates && ultimo && args.pointerCoordinates.y > ultimo.bottom)) return [destino];
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => ids.includes(String(container.id))) });
  };

  /** Pelo menu do celular o cartão vai para o fim da etapa escolhida. */
  function moverPara(cartao: CartaoFluxo, status: ProjectWorkflowStatus) {
    if (status === cartao.status) return;
    onMover(cartao.id, status, [...ordem[status].filter((id) => id !== cartao.id), cartao.id], 'menu');
  }
  function mostrarColuna(id: ColunaId) {
    setColunaAtiva(id);
    // Se a lista já tinha rolado para baixo, volta ao começo da etapa escolhida.
    const topo = (quadro.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 70;
    if (window.scrollY > topo) window.scrollTo({ top: topo });
  }

  function abrir(cartao: CartaoFluxo) {
    if (acabouDeArrastar.current) return;
    router.push(enderecoProjeto(cartao));
  }
  function iniciar({ active }: DragStartEvent) {
    setAtivo(String(active.id));
    setOrdemArraste(ordem);
  }
  // Ao passar para outra coluna, o cartão entra nela já na posição do cartão sob o ponteiro.
  function passar({ active, over }: DragOverEvent) {
    if (!over) return;
    setOrdemArraste((atual) => {
      const base = atual ?? ordem;
      const origem = colunaEm(base, active.id), destino = colunaEm(base, over.id);
      if (!origem || !destino || origem === destino) return base;
      const lista = base[destino].filter((id) => id !== active.id);
      const indice = lista.indexOf(String(over.id));
      lista.splice(indice < 0 ? lista.length : indice, 0, String(active.id));
      return { ...base, [origem]: base[origem].filter((id) => id !== active.id), [destino]: lista };
    });
  }
  function soltar({ active, over }: DragEndEvent) {
    const base = ordemArraste ?? ordem;
    setAtivo(null); setOrdemArraste(null);
    acabouDeArrastar.current = true;
    window.setTimeout(() => { acabouDeArrastar.current = false; }, 0);
    const status = colunaEm(base, active.id);
    if (!over || !status) return;
    let lista = base[status];
    if (colunaEm(base, over.id) === status && lista.includes(String(over.id))) lista = arrayMove(lista, lista.indexOf(String(active.id)), lista.indexOf(String(over.id)));
    // Solto no espaço vazio abaixo dos cartões da própria coluna: vai para o fim.
    else if (String(over.id) === PREFIXO_COLUNA + status && colunas[status].some((cartao) => cartao.id === active.id)) lista = [...lista.filter((id) => id !== active.id), String(active.id)];
    const original = porId.get(String(active.id));
    if (original?.status === status && lista.join() === colunas[status].map((cartao) => cartao.id).join()) return;
    onMover(String(active.id), status, lista);
  }

  return <DndContext sensors={sensors} collisionDetection={detectarDestino} onDragStart={iniciar} onDragOver={passar} onDragEnd={soltar} onDragCancel={() => { setAtivo(null); setOrdemArraste(null); }}
    accessibility={{ announcements, screenReaderInstructions: { draggable: 'Para mover, pressione Espaço, use as setas e pressione Espaço de novo para soltar. Esc cancela. Enter abre o projeto.' } }}>
    {/* Celular: barra fixa de etapas, uma etapa por vez. Tela larga que não comporta as colunas: atalhos que rolam até cada uma. */}
    {(celular || transborda) && <nav className={`fluxo-atalhos${celular ? ' fluxo-etapas' : ''}`} aria-label={celular ? 'Etapas do fluxo' : 'Ir para a coluna'}>
      {([{ id: 'AGUARDANDO', rotulo: 'Aguardando início', total: aguardando.length }, ...PROJECT_WORKFLOW_STATUSES.map((status) => ({ id: status, rotulo: PROJECT_WORKFLOW_LABELS[status], total: ordem[status].length }))] as { id: ColunaId; rotulo: string; total: number }[]).map((coluna) =>
        <button type="button" key={coluna.id} aria-pressed={celular ? colunaAtiva === coluna.id : undefined}
          onClick={() => celular ? mostrarColuna(coluna.id) : document.getElementById(`fluxo-${coluna.id}`)?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })}>
          {celular ? ROTULO_CURTO[coluna.id] ?? coluna.rotulo : coluna.rotulo} <b>{coluna.total}</b></button>)}
    </nav>}
    <div className="fluxo-quadro" ref={quadro}>
      <ColunaAguardando cartoes={aguardando} abrir={abrir} ativa={colunaAtiva === 'AGUARDANDO'} faltaMaterial={onFaltaMaterial} />
      {PROJECT_WORKFLOW_STATUSES.map((status) => <Coluna key={status} status={status} ids={ordem[status]} porId={porId} abrir={abrir} ativa={colunaAtiva === status} moverPara={celular ? moverPara : undefined} faltaMaterial={onFaltaMaterial} />)}
    </div>
    <DragOverlay>{ativo && porId.get(ativo) ? <CartaoProjeto cartao={porId.get(ativo)!} className="fluxo-cartao-arrastando" /> : null}</DragOverlay>
  </DndContext>;
}
