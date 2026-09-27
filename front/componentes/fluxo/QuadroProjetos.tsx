'use client';

import { useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { useRouter } from 'next/navigation';
import { closestCenter, closestCorners, DndContext, DragOverlay, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useDroppable, useSensor, useSensors, type Announcements, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PROJECT_WORKFLOW_LABELS, PROJECT_WORKFLOW_STATUSES, SITUACAO_PRAZO_FLUXO_LABELS, situacaoPrazoFluxo, type ProjectWorkflowStatus } from '@inova/domain';
import { colunasFluxo, corOrcamento, formatarDataFluxo, nomeResponsavel, rotuloPecas, type CartaoFluxo, type ResponsavelFluxo } from '../../utilitarios/fluxo';

type Ordem = Record<ProjectWorkflowStatus, string[]>;
const PREFIXO_COLUNA = 'coluna:';

export const enderecoProjeto = (cartao: CartaoFluxo) => `/orcamentos/${cartao.quote.id}#projeto-${cartao.id}`;

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
  const situacao = situacaoPrazoFluxo(cartao.quote.deadline, cartao.status === 'DONE');
  return <article {...props} className={`fluxo-cartao prazo-${situacao.toLowerCase()} ${props.className ?? ''}`} style={{ ...props.style, '--cor-orcamento': corOrcamento(cartao.quote.id) } as CSSProperties}>
    <div className="fluxo-cartao-topo"><span className="fluxo-etiqueta">{cartao.quote.number}</span><span className="fluxo-pecas">{rotuloPecas(cartao.pieces)}</span></div>
    <strong>{cartao.name}</strong>
    <small>{cartao.quote.customerName}</small>
    <Responsavel responsavel={cartao.quote.worker} />
    <small className="fluxo-prazo">{cartao.quote.deadline ? `Prazo final: ${formatarDataFluxo(cartao.quote.deadline)}` : 'Sem prazo final'}{['VENCIDO', 'PROXIMO'].includes(situacao) && <b> · {SITUACAO_PRAZO_FLUXO_LABELS[situacao]}</b>}</small>
  </article>;
}

function CartaoArrastavel({ cartao, abrir }: { cartao: CartaoFluxo; abrir: (cartao: CartaoFluxo) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cartao.id });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'fluxo-cartao-origem' : undefined}>
    <CartaoProjeto cartao={cartao} {...attributes} {...listeners}
      aria-label={`${cartao.name}, ${rotuloPecas(cartao.pieces)}, ${cartao.quote.customerName}, orçamento ${cartao.quote.number}, ${cartao.quote.worker ? `responsável ${nomeResponsavel(cartao.quote.worker)}` : 'sem responsável'}. Espaço para mover, Enter para abrir.`}
      onClick={() => abrir(cartao)}
      onKeyDown={(event) => { listeners?.onKeyDown?.(event); if (event.key === 'Enter' && !isDragging) abrir(cartao); }} />
  </li>;
}

function Coluna({ status, ids, porId, abrir }: { status: ProjectWorkflowStatus; ids: string[]; porId: Map<string, CartaoFluxo>; abrir: (cartao: CartaoFluxo) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: PREFIXO_COLUNA + status });
  return <section className={`fluxo-coluna${isOver ? ' fluxo-coluna-alvo' : ''}`} aria-labelledby={`fluxo-${status}`}>
    <header><h2 id={`fluxo-${status}`}>{PROJECT_WORKFLOW_LABELS[status]}</h2><span>{ids.length}</span></header>
    <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
      <ol ref={setNodeRef} className="fluxo-lista">
        {ids.map((id) => <CartaoArrastavel key={id} cartao={porId.get(id)!} abrir={abrir} />)}
        {!ids.length && <li className="fluxo-vazio">Arraste um projeto para cá</li>}
      </ol>
    </SortableContext>
  </section>;
}

/**
 * Kanban de projetos. Durante o arraste a ordem fica local (`ordem`); ao soltar,
 * `onMover` recebe a coluna de destino e a ordem visível final dela.
 */
export function QuadroProjetos({ cartoes, onMover }: { cartoes: CartaoFluxo[]; onMover: (id: string, status: ProjectWorkflowStatus, idsDestino: string[]) => void }) {
  const router = useRouter();
  const colunas = useMemo(() => colunasFluxo(cartoes), [cartoes]);
  const porId = useMemo(() => new Map(cartoes.map((cartao) => [cartao.id, cartao])), [cartoes]);
  const [ordemArraste, setOrdemArraste] = useState<Ordem | null>(null);
  const [ativo, setAtivo] = useState<string | null>(null);
  const acabouDeArrastar = useRef(false);
  const ordem: Ordem = ordemArraste ?? { TODO: colunas.TODO.map((cartao) => cartao.id), IN_PROGRESS: colunas.IN_PROGRESS.map((cartao) => cartao.id), DONE: colunas.DONE.map((cartao) => cartao.id) };
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
    <div className="fluxo-quadro">
      {PROJECT_WORKFLOW_STATUSES.map((status) => <Coluna key={status} status={status} ids={ordem[status]} porId={porId} abrir={abrir} />)}
    </div>
    <DragOverlay>{ativo && porId.get(ativo) ? <CartaoProjeto cartao={porId.get(ativo)!} className="fluxo-cartao-arrastando" /> : null}</DragOverlay>
  </DndContext>;
}
