import { dataAtualEmpresa, obterStatusTrabalho, PROJECT_WORKFLOW_LABELS, validadeOrcamento, WORK_STATUS_LABELS, type ProjectWorkflowStatus } from '@inova/domain';

/**
 * Linha do tempo do orçamento (botão "Histórico" da tela do orçamento): o registro de auditoria
 * traduzido em eventos simples, mais a equipe (quem assumiu e quando saiu) e os marcos principais.
 * Orçamentos antigos, sem registro, ainda mostram a emissão, a aprovação e a entrega.
 */
export type TomEvento = 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'neutro';
export type EventoHistorico = { id: string; data: string; titulo: string; detalhe?: string; usuario?: string | null; tom: TomEvento; icone: 'criado' | 'editado' | 'situacao' | 'prazo' | 'contato' | 'equipe' | 'fluxo' | 'entrega' | 'desenho' | 'material' };
/** `data`: dia do calendário (aaaa-mm-dd), já no fuso da empresa. */
export type MarcoHistorico = { rotulo: string; data: string | null };
type Registro = { id: string; action: string; entityType: string; entityId: string; previous: unknown; current: unknown; createdAt: Date; user?: { name: string } | null };
type Orcamento = {
  createdAt: Date; validUntil: Date | null; approvedAt: Date | null; completedAt: Date | null; dueDate: Date | null;
  items: { id: string; projectName: string | null }[];
  workerAssignments: { id: string; assignedAt: Date; releasedAt: Date | null; worker: { name: string | null } }[];
};

const objeto = (valor: unknown) => (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
const texto = (valor: unknown) => typeof valor === 'string' ? valor : '';
/** Data de calendário (gravada à meia-noite UTC) como dd/mm/aaaa. */
const dataCurta = (valor: unknown) => {
  const bruto = valor instanceof Date ? valor.toISOString() : texto(valor);
  return bruto ? bruto.slice(0, 10).split('-').reverse().join('/') : null;
};
const iso = (valor: Date) => valor.toISOString();

function situacao(anterior: Record<string, unknown>, atual: Record<string, unknown>): { titulo: string; tom: TomEvento; detalhe?: string } {
  const status = texto(atual.status), execucao = texto(atual.executionStatus), antes = texto(anterior.executionStatus);
  const motivo = texto(atual.reason);
  if (status === 'APPROVED') {
    if (texto(anterior.status) !== 'APPROVED' && (!execucao || execucao === 'NOT_STARTED')) return { titulo: 'Orçamento aprovado', tom: 'verde' };
    if (execucao === 'IN_PROGRESS') return antes === 'PAUSED' ? { titulo: 'Produção retomada', tom: 'azul' } : { titulo: 'Serviço iniciado', tom: 'azul' };
    if (execucao === 'PAUSED') return { titulo: 'Produção interrompida', tom: 'amarelo' };
    if (execucao === 'REWORK') return { titulo: 'Encaminhado para retrabalho', tom: 'amarelo' };
    if (execucao === 'COMPLETED') return { titulo: 'Orçamento entregue', tom: 'verde' };
    const rotulo = WORK_STATUS_LABELS[obterStatusTrabalho({ status, executionStatus: execucao as never })];
    return { titulo: `Situação alterada para “${rotulo}”`, tom: 'azul' };
  }
  if (status === 'SENT' || status === 'DRAFT') return { titulo: texto(anterior.status) && texto(anterior.status) !== 'DRAFT' ? 'Retornou para aguardando aprovação' : 'Enviado para aprovação', tom: 'neutro' };
  if (status === 'REJECTED') return { titulo: 'Marcado como não aprovado', tom: 'vermelho' };
  if (status === 'CANCELLED') return motivo === 'Cliente desistiu' ? { titulo: 'Desistência do cliente', tom: 'vermelho' } : { titulo: 'Orçamento cancelado', tom: 'vermelho', ...(motivo ? { detalhe: motivo } : {}) };
  if (status === 'EXPIRED') return { titulo: 'Validade expirada', tom: 'vermelho' };
  return { titulo: 'Situação alterada', tom: 'neutro' };
}

/** Prazos e observações: só o que mudou, em uma linha. */
function mudancasDeAcompanhamento(anterior: Record<string, unknown>, atual: Record<string, unknown>) {
  const partes: string[] = [];
  const data = (campo: string, rotulo: string) => {
    const antes = dataCurta(anterior[campo]), depois = dataCurta(atual[campo]);
    if (antes !== depois) partes.push(depois ? `${rotulo}: ${depois}` : `${rotulo} removida`);
  };
  data('deliveryDeadline', 'Entrega acordada');
  data('installationDeadline', 'Previsão de montagem');
  if (Boolean(anterior.deadlineConfirmed) !== Boolean(atual.deadlineConfirmed)) partes.push(atual.deadlineConfirmed ? 'Prazo confirmado com o cliente' : 'Confirmação do prazo retirada');
  const notas = texto(atual.notes) !== texto(anterior.notes) && ('notes' in atual || 'notes' in anterior);
  return { partes, notas };
}

export function montarHistorico(orcamento: Orcamento, registros: Registro[]): { eventos: EventoHistorico[]; marcos: MarcoHistorico[] } {
  const nomes = new Map(orcamento.items.map((item, indice) => [item.id, item.projectName?.trim() || `Projeto ${indice + 1}`]));
  const eventos: EventoHistorico[] = [];
  const base = (registro: Registro) => ({ id: registro.id, data: iso(registro.createdAt), usuario: registro.user?.name ?? null });
  let ultimoMovimento: { projeto: string; evento: EventoHistorico } | null = null;
  for (const registro of [...registros].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const anterior = objeto(registro.previous), atual = objeto(registro.current);
    const projeto = nomes.get(registro.entityId) ?? 'Projeto';
    switch (`${registro.entityType}:${registro.action}`) {
      case 'QUOTE:CREATED': eventos.push({ ...base(registro), titulo: 'Orçamento criado', tom: 'neutro', icone: 'criado' }); break;
      case 'QUOTE:DUPLICATED': eventos.push({ ...base(registro), titulo: 'Orçamento criado a partir de uma cópia', tom: 'neutro', icone: 'criado' }); break;
      case 'QUOTE:UPDATED': eventos.push({ ...base(registro), titulo: 'Orçamento editado', tom: 'neutro', icone: 'editado' }); break;
      case 'QUOTE:CONTACT_UPDATED': eventos.push({ ...base(registro), titulo: 'Contato do cliente atualizado', tom: 'neutro', icone: 'contato' }); break;
      case 'QUOTE:STATUS_CHANGED': eventos.push({ ...base(registro), ...situacao(anterior, atual), icone: 'situacao' }); break;
      case 'QUOTE:DEADLINE_UPDATED': {
        const { partes, notas } = mudancasDeAcompanhamento(anterior, atual);
        if (partes.length) eventos.push({ ...base(registro), titulo: 'Prazos atualizados', detalhe: partes.join(' · '), tom: 'azul', icone: 'prazo' });
        if (notas) eventos.push({ ...base(registro), id: `${registro.id}-notas`, titulo: texto(atual.notes) ? 'Observações do orçamento atualizadas' : 'Observações do orçamento removidas', tom: 'neutro', icone: 'editado' });
        break;
      }
      case 'QUOTE_ITEM:WORKFLOW_STATUS_CHANGED': {
        const etapa = PROJECT_WORKFLOW_LABELS[texto(atual.status) as ProjectWorkflowStatus] ?? texto(atual.status);
        // Vários movimentos seguidos do mesmo projeto (pela mesma pessoa, em poucos minutos) viram um só: vale a etapa final.
        const seguido = ultimoMovimento;
        if (seguido && seguido.evento === eventos.at(-1) && seguido.projeto === registro.entityId && seguido.evento.usuario === (registro.user?.name ?? null) && registro.createdAt.getTime() - new Date(seguido.evento.data).getTime() < 10 * 60_000) {
          Object.assign(seguido.evento, { data: iso(registro.createdAt), titulo: `${projeto} movido para “${etapa}”` });
        } else {
          const evento: EventoHistorico = { ...base(registro), titulo: `${projeto} movido para “${etapa}”`, tom: 'azul', icone: 'fluxo' };
          eventos.push(evento);
          ultimoMovimento = { projeto: registro.entityId, evento };
        }
        break;
      }
      case 'QUOTE_ITEM:WORKFLOW_MATERIAL_CHANGED':
        eventos.push({ ...base(registro), titulo: atual.materialMissing ? `${projeto}: falta de material registrada` : `${projeto}: falta de material regularizada`, tom: atual.materialMissing ? 'amarelo' : 'verde', icone: 'material' });
        break;
      case 'QUOTE_ITEM:PROJECT_DELIVERY_CREATED': {
        const pecas = Array.isArray(atual.pieces) ? atual.pieces.reduce((soma: number, peca) => soma + (Number(objeto(peca).quantity) || 0), 0) : 0;
        eventos.push({ ...base(registro), titulo: `Entrega registrada: ${projeto}`, detalhe: [texto(atual.number) && `Nota ${texto(atual.number)}`, pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : ''].filter(Boolean).join(' · ') || undefined, tom: 'verde', icone: 'entrega' });
        break;
      }
      case 'DESIGN:CREATED_FROM_QUOTE': eventos.push({ ...base(registro), titulo: 'Desenho técnico iniciado', tom: 'neutro', icone: 'desenho' }); break;
    }
  }
  // Equipe: quem assumiu o serviço e quando deixou.
  for (const atribuicao of orcamento.workerAssignments) {
    const nome = atribuicao.worker.name?.trim() || 'Funcionário';
    eventos.push({ id: `equipe-${atribuicao.id}`, data: iso(atribuicao.assignedAt), titulo: `${nome} assumiu o serviço`, tom: 'azul', icone: 'equipe' });
    if (atribuicao.releasedAt) eventos.push({ id: `equipe-${atribuicao.id}-saida`, data: iso(atribuicao.releasedAt), titulo: `${nome} deixou o serviço`, tom: 'neutro', icone: 'equipe' });
  }
  // Orçamentos sem registro: os marcos principais ainda aparecem.
  const tem = (titulo: string) => eventos.some((evento) => evento.titulo === titulo);
  if (!eventos.some((evento) => evento.icone === 'criado')) eventos.push({ id: 'marco-emissao', data: iso(orcamento.createdAt), titulo: 'Orçamento criado', tom: 'neutro', icone: 'criado' });
  if (orcamento.approvedAt && !tem('Orçamento aprovado')) eventos.push({ id: 'marco-aprovacao', data: iso(orcamento.approvedAt), titulo: 'Orçamento aprovado', tom: 'verde', icone: 'situacao' });
  if (orcamento.completedAt && !tem('Orçamento entregue')) eventos.push({ id: 'marco-entrega', data: iso(orcamento.completedAt), titulo: 'Orçamento entregue', tom: 'verde', icone: 'situacao' });
  eventos.sort((a, b) => b.data.localeCompare(a.data));
  // Momentos (emissão, aprovação, entrega) viram o dia da empresa; datas gravadas como dia (validade, limite) ficam como estão.
  const diaDoMomento = (valor: Date | null) => valor ? dataAtualEmpresa(valor) : null;
  const diaGravado = (valor: Date | null) => valor ? iso(valor).slice(0, 10) : null;
  const marcos: MarcoHistorico[] = [
    { rotulo: 'Emissão', data: diaDoMomento(orcamento.createdAt) },
    { rotulo: 'Validade', data: diaGravado(orcamento.validUntil) ?? validadeOrcamento(orcamento.createdAt) },
    { rotulo: 'Aprovação', data: diaDoMomento(orcamento.approvedAt) },
    { rotulo: 'Data limite', data: diaGravado(orcamento.dueDate) },
    { rotulo: 'Entrega', data: diaDoMomento(orcamento.completedAt) },
  ];
  return { eventos, marcos };
}
