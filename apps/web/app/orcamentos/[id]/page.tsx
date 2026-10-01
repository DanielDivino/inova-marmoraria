'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { temPermissao, projetoTemDesenho, nomeProjeto, rotuloLadoBorda, descontosIndividuais, podeEditarOrcamento, validadeOrcamento, obterStatusTrabalho, WORK_STATUS_LABELS, WORK_STATUS_STORAGE, WORK_STATUSES, type SavedQuoteItem, type WorkStatus } from '@inova/domain';
import { SavedItemDrawing } from '../../../componentes/orcamento/SavedDrawings';
import { StatusOrcamento } from '../../../componentes/QuoteStatus';
import { useSession } from '../../../componentes/ApplicationShell';
import { api, ApiError } from '../../../utilitarios/api';
import { ExportarPdfOrcamento, ExportarPdfProjeto } from '../../../componentes/orcamento/QuotePdfExport';
import { BlocoProjeto } from '../../../componentes/orcamento/BlocoProjeto';
import { JanelaAprovacao } from '../../../componentes/orcamento/JanelaAprovacao';
import { JanelaRetrabalho, type DestinoRetrabalho } from '../../../componentes/orcamento/JanelaRetrabalho';
import { NotaEntregaProjeto, type EntregasOrcamento } from '../../../componentes/orcamento/NotaEntregaProjeto';
import { Icone, type NomeIcone } from '../../../componentes/filtros/Filtros';
import { MenuAcoes, type AcaoMenu } from '../../../componentes/MenuAcoes';
import { EditarContato } from '../../../componentes/clientes/EditarContato';
import { HistoricoOrcamento } from '../../../componentes/orcamento/HistoricoOrcamento';
import { Caminho } from '../../../componentes/Caminho';
import { caminhoAteOrcamento, comParametros, enderecoDaLista, enderecoOrcamento, lerOrigem } from '../../../utilitarios/rotas';

import { avisar, confirmar, escolher } from '../../../componentes/Confirmacao';
import { formatarMoeda } from '../../../utilitarios/formatadores';
type Edge = { side: string; serviceNameSnapshot: string; billingUnitSnapshot?: string; billedQuantity: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number };
type Component = { id: string; label: string; orientation: 'HORIZONTAL' | 'VERTICAL'; lengthMm: number; widthMm: number; quantity: number; billableArea: number; subtotal: number; calculatedTotal: number; appliedTotal: number; hasManualPriceOverride: boolean; edges: Edge[] };
type Cutout = { id: string; cutoutType: string; label?: string; lengthMm?: number; widthMm?: number; diameterMm?: number; quantity: number };
type Worker = { id: string; name: string; workColor: string };
type WorkerAssignment = { id: string; assignedAt: string; releasedAt?: string | null; colorSnapshot: string; worker: Worker };
type Quote = {
  parentQuote?: { id: string; number: string } | null; complements?: { id: string; number: string; netTotal: number }[];
  number: string; customerId: string; createdAt?: string; status: string; executionStatus?: string; approvedAt?: string; completedAt?: string; validUntil?: string; dueDate?: string; deliveryDeadline?: string; installationDeadline?: string; deadlineConfirmed?: boolean; deadlineNote?: string | null; customerNameSnapshot: string; customerPhoneSnapshot?: string; workAddressSnapshot?: string;
  discountAmount: number; grossTotal: number; netTotal: number; notes?: string;
  /** Desconto negociado para o orçamento completo, enquanto há projetos não aprovados. */
  fullDiscountAmount?: number | null;
  workerAssignments?: WorkerAssignment[];
  items: (SavedQuoteItem & { id: string; declinedAt?: string | null; materialNameSnapshot: string; unitPriceSnapshot: number; billedQuantity: number; materialSubtotal: number; total: number; calculationMode: 'DIMENSIONS' | 'MANUAL_M2'; productType: { name: string }; services: { serviceNameSnapshot: string; billedQuantity: number; unitPriceSnapshot: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number; billingUnitSnapshot: string }[]; components: Component[]; cutouts: Cutout[] })[];
};
const cm = (millimeters: number) => (millimeters / 10).toLocaleString('pt-BR');
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // De onde o orçamento foi aberto (Fluxo, cliente, Dashboard, Histórico): o caminho e o voltar levam de volta para lá.
  const origem = lerOrigem(useSearchParams());
  const user = useSession();
  const canTeam = !!user && temPermissao(user.role, 'team');
  const canTechnical = !!user && temPermissao(user.role, 'technical');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
 const [updating, setUpdating] = useState(false);
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingSaved, setTrackingSaved] = useState(false);
  // Aba "Equipe, prazo e observação": o formulário recomeça (com o que está salvo) ao salvar ou descartar.
  const [formVersao, setFormVersao] = useState(0);
  const [editandoContato, setEditandoContato] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [savingWorker, setSavingWorker] = useState(false);
  // Projeto cujo desenho técnico está abrindo.
  const [openingDesign, setOpeningDesign] = useState<string | null>(null);
  // Entregas por projeto (notas de entrega) só existem depois da aprovação.
  const [entregas, setEntregas] = useState<EntregasOrcamento | null>(null);
  // Projetos com desenho técnico (Exportar e "Adicionar desenho técnico"); null enquanto carrega.
  const [comTecnico, setComTecnico] = useState<Set<string> | null>(null);
  const [notaPedida, setNotaPedida] = useState<string | null>(null);
  // "Confirmar aprovação": a situação escolhida, enquanto a janela pergunta quais projetos o cliente aprovou.
  const [aprovacaoPedida, setAprovacaoPedida] = useState<{ status: string; executionStatus?: string } | null>(null);
  // Projetos em blocos compactos: quais estão abertos e quais aparecem (todos, aprovados ou não aprovados).
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [filtroProjetos, setFiltroProjetos] = useState<'todos' | 'aprovados' | 'nao-aprovados'>('todos');
  const [alterandoAprovacao, setAlterandoAprovacao] = useState<string | null>(null);
  // "Exportar PDF" no ⋯ do projeto: o bloco abre com as opções de exportação à mostra.
  const [exportarProjeto, setExportarProjeto] = useState<string | null>(null);
  const exportacaoAberta = useCallback(() => setExportarProjeto(null), []);
  // Retrabalho de um projeto: a janela pergunta para onde as peças voltam.
  const [retrabalho, setRetrabalho] = useState<Quote['items'][number] | null>(null);
  const [enviandoRetrabalho, setEnviandoRetrabalho] = useState(false);
  const [erroRetrabalho, setErroRetrabalho] = useState('');
  const carregarEntregas = useCallback(() => api<EntregasOrcamento>(`/quotes/${id}/entregas`).then(setEntregas).catch(() => setEntregas(null)), [id]);
  useEffect(() => { if (quote?.status === 'APPROVED') void carregarEntregas(); else setEntregas(null); }, [quote?.status, quote?.executionStatus, carregarEntregas]);
  // "Gerar nota de entrega" no Fluxo abre esta página com ?entrega=<projeto>.
  useEffect(() => { setNotaPedida(new URLSearchParams(window.location.search).get('entrega')); }, []);
  const quantidadeDeProjetos = quote?.items.length ?? 0;
  useEffect(() => {
    if (!quote) return;
    const pedido = notaPedida ?? window.location.hash.replace(/^#projeto-/, '');
    setAbertos(new Set(quote.items.length === 1 ? [quote.items[0].id] : quote.items.some((item) => item.id === pedido) ? [pedido] : []));
    // Só ao abrir o orçamento (ou ao mudar a quantidade de projetos), não a cada atualização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!quote, quantidadeDeProjetos, notaPedida]);
  useEffect(() => { api<{ projetos: string[] }>(`/quotes/${id}/desenhos-tecnicos`).then((resposta) => setComTecnico(new Set(resposta.projetos))).catch(() => setComTecnico(new Set())); }, [id]);
  useEffect(() => { api<Quote>(`/quotes/${id}`).then(setQuote).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o orçamento.')); if (canTeam) api<Worker[]>('/workers?active=true').then(setWorkers).catch(() => setWorkers([])); }, [id, canTeam]);
  if (error && !quote) return <main className="list-page"><Caminho itens={[{ rotulo: 'Orçamentos', href: enderecoDaLista('orcamentos') }]} /><p className="form-error">{error}</p><p><Link className="secondary-button" href={enderecoDaLista('orcamentos')}>← Voltar aos orçamentos</Link></p></main>;
  if (!quote) return <main className="list-page"><p className="empty">Carregando orçamento…</p></main>;
  // Projetos que o cliente não aprovou ficam fora do valor.
  const recusados = quote.items.filter((item) => item.declinedAt);
  const individualDiscount = descontosIndividuais(quote.items.filter((item) => !item.declinedAt));
  const entregasPorProjeto = new Map(entregas?.projects.map((projeto) => [projeto.id, projeto]) ?? []);
  const totalDiscountGiven = individualDiscount + quote.discountAmount;
 /** Depois da aprovação: aprova de novo, ou tira a aprovação de, um projeto (o valor do orçamento acompanha). */
 async function alterarAprovacao(item: Quote['items'][number], aprovado: boolean) {
    const nome = nomeProjeto(item);
    const pergunta = aprovado
      ? { titulo: `Aprovar “${nome}”?`, mensagem: 'O projeto volta ao valor do orçamento e ao fluxo de trabalho.', confirmar: 'Aprovar projeto' }
      : { titulo: `Marcar “${nome}” como não aprovado?`, mensagem: 'O projeto sai do valor do orçamento e do fluxo de trabalho, e continua aqui para consulta.', confirmar: 'Marcar como não aprovado', perigo: true };
    if (alterandoAprovacao || !await confirmar(pergunta)) return;
    setAlterandoAprovacao(item.id); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/items/${item.id}/aprovacao`, { method: 'PATCH', body: JSON.stringify({ aprovado }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a aprovação do projeto.'); }
    finally { setAlterandoAprovacao(null); }
  }
 async function enviarRetrabalho(destino: DestinoRetrabalho, motivo: string) {
    if (!retrabalho || enviandoRetrabalho) return;
    setEnviandoRetrabalho(true); setErroRetrabalho('');
    try {
      setQuote(await api<Quote>(`/quotes/${id}/items/${retrabalho.id}/retrabalho`, { method: 'POST', body: JSON.stringify({ destino, ...(motivo ? { motivo } : {}) }) }));
      setRetrabalho(null);
      void carregarEntregas();
    } catch (cause) { setErroRetrabalho(cause instanceof Error ? cause.message : 'Não foi possível colocar o projeto em retrabalho.'); }
    finally { setEnviandoRetrabalho(false); }
  }
 async function changeStatus(payload: { status: string; executionStatus?: string; reason?: string; projetosNaoAprovados?: string[] }) {
    if (updating) return;
    setUpdating(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o projeto.'); }
    finally { setUpdating(false); }
 }
  /** Aba "Equipe, prazo e observação": salva de uma vez o responsável, os prazos e as observações do orçamento. */
  async function salvarAba(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savingTracking || !quote) return;
    const form = new FormData(event.currentTarget); setSavingTracking(true); setError('');
    try {
      const responsavel = String(form.get('workerId') ?? '');
      if (form.has('workerId') && responsavel !== (quote.workerAssignments?.find((assignment) => !assignment.releasedAt)?.worker.id ?? '')) {
        await api<Quote>(`/quotes/${id}/worker`, { method: 'PUT', body: JSON.stringify({ workerId: responsavel || null }) });
      }
      const payload = {
        deliveryDeadline: String(form.get('deliveryDeadline') || '') || null, installationDeadline: String(form.get('installationDeadline') || '') || null,
        // Desmarcado, o navegador nem manda o campo: vale como "não confirmado".
        deadlineConfirmed: form.get('deadlineConfirmed') === 'on', notes: String(form.get('notes') || '').trim() || null,
      };
      setQuote(await api<Quote>(`/quotes/${id}/tracking`, { method: 'PATCH', body: JSON.stringify(payload) }));
      setAlterado(false); setFormVersao((versao) => versao + 1);
      setTrackingSaved(true); window.setTimeout(() => setTrackingSaved(false), 2500);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setSavingTracking(false); }
  }
  const descartar = () => { setAlterado(false); setFormVersao((versao) => versao + 1); };
  async function changeWorkerColor(worker: Worker, workColor: string) {
    setSavingWorker(true); setError('');
    try {
      const updated = await api<Worker>(`/workers/${worker.id}`, { method: 'PATCH', body: JSON.stringify({ workColor }) });
      setWorkers((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setQuote((current) => current ? { ...current, workerAssignments: current.workerAssignments?.map((assignment) => assignment.worker.id === updated.id ? { ...assignment, worker: updated } : assignment) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a cor do funcionário.'); }
    finally { setSavingWorker(false); }
  }
  // Desenho técnico de um projeto: abre o dele ou cria um novo, só dele.
  async function abrirDesenhoTecnico(item: Quote['items'][number]) {
    if (openingDesign) return;
    setOpeningDesign(item.id); setError('');
    try {
      const pedir = (usarDoOrcamento?: boolean) => api<{ editorUrl: string; avisos: string[] }>(`/quotes/${id}/items/${item.id}/technical-design`, { method: 'POST', body: JSON.stringify(usarDoOrcamento === undefined ? {} : { usarDoOrcamento }) });
      let result: { editorUrl: string; avisos: string[] };
      try { result = await pedir(); }
      catch (cause) {
        // Orçamento com o desenho técnico de antes (um só para o orçamento): a pessoa decide se ele é deste projeto.
        if (!(cause instanceof ApiError && cause.status === 409)) throw cause;
        const escolha = await escolher({ titulo: 'Usar o desenho técnico já feito neste orçamento?', icone: 'esquadro', confirmar: 'Usar este desenho', alternativa: 'Criar um novo',
          mensagem: `Este orçamento tem um desenho técnico feito antes de cada projeto ter o seu. Ele pode passar a ser o de “${nomeProjeto(item)}”, ou este projeto pode começar um desenho novo.` });
        if (!escolha) return;
        result = await pedir(escolha === 'confirmar');
      }
      // O desenho recebeu o que mudou no orçamento; o que não dá para levar (peças em L/U, curvas) fica avisado.
      if (result.avisos?.length) await avisar({ titulo: 'Desenho técnico atualizado pelo orçamento', icone: 'esquadro', mensagem: <ul className="janela-lista">{result.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}</ul> });
      // O desenho técnico volta para este orçamento (e, dele, para onde ele foi aberto).
      router.push(comParametros(result.editorUrl, { orcamento: id, numero: quote!.number, de: origem.de, cartao: origem.cartao }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o desenho técnico.'); }
    finally { setOpeningDesign(null); }
  }
  const currentWorkStatus = obterStatusTrabalho(quote);
  const activeWorker = quote.workerAssignments?.find((assignment) => !assignment.releasedAt);
  const caminho = caminhoAteOrcamento(quote, origem);
  const validade = dateLabel(quote.validUntil ?? (quote.createdAt ? validadeOrcamento(new Date(quote.createdAt)) : undefined));
  // A próxima ação da situação fica em destaque; as outras, no menu "⋯".
  const execucao = quote.executionStatus ?? 'NOT_STARTED';
  const pendente = ['DRAFT', 'SENT'].includes(quote.status);
  const emExecucao = quote.status === 'APPROVED' && execucao !== 'COMPLETED';
  const perguntarAntes = (opcoes: Parameters<typeof confirmar>[0], payload: Parameters<typeof changeStatus>[0]) => async () => { if (await confirmar(opcoes)) void changeStatus(payload); };
  const entregar = () => void changeStatus({ status: 'APPROVED', executionStatus: 'COMPLETED' });
  const principal: { rotulo: string; icone: NomeIcone; acao: () => void } | null = pendente ? { rotulo: 'Confirmar aprovação', icone: 'marcado', acao: () => setAprovacaoPedida({ status: 'APPROVED' }) }
    : !emExecucao ? null
    : execucao === 'NOT_STARTED' ? { rotulo: 'Iniciar serviço', icone: 'andamento', acao: () => void changeStatus({ status: 'APPROVED', executionStatus: 'IN_PROGRESS' }) }
    : execucao === 'PAUSED' ? { rotulo: 'Retomar produção', icone: 'andamento', acao: () => void changeStatus({ status: 'APPROVED', executionStatus: 'IN_PROGRESS', reason: 'Produção retomada' }) }
    : { rotulo: 'Marcar como entregue', icone: 'entregue', acao: entregar };
  const cancelar: AcaoMenu = { rotulo: 'Cancelar orçamento', icone: 'lixeira', perigo: true, aoEscolher: perguntarAntes({ titulo: 'Cancelar orçamento?', mensagem: 'O orçamento será cancelado e permanecerá disponível para consulta no Histórico.', confirmar: 'Cancelar orçamento', cancelar: 'Voltar', perigo: true }, { status: 'CANCELLED', reason: 'Cancelado no acompanhamento comercial' }) };
  const acoesDoOrcamento: AcaoMenu[] = [
    ...(podeEditarOrcamento(quote) ? [{ rotulo: 'Editar orçamento', icone: 'lapis', href: enderecoOrcamento(id, origem, { tela: 'editar' }) } satisfies AcaoMenu] : []),
    // Cada projeto tem o seu desenho técnico.
    ...(canTechnical ? quote.items.map((item) => ({ rotulo: openingDesign === item.id ? 'Abrindo desenho…' : quote.items.length > 1 ? `Desenho técnico · ${nomeProjeto(item)}` : 'Desenho técnico', icone: 'esquadro', desabilitada: !!openingDesign, aoEscolher: () => void abrirDesenhoTecnico(item) } satisfies AcaoMenu)) : []),
    { rotulo: 'Vincular complemento', icone: 'vinculo', href: `/?parent=${id}` },
    { rotulo: 'Desmontagem / Remontagem', icone: 'montagem', href: enderecoOrcamento(id, origem, { tela: 'remontagem' }) },
  ];
  const acoesDaSituacao: AcaoMenu[] = pendente ? [
    { rotulo: 'Marcar como não aprovado', icone: 'recusado', aoEscolher: () => void changeStatus({ status: 'REJECTED', reason: 'Cliente não aprovou' }) },
    cancelar,
  ] : quote.status === 'EXPIRED' ? [cancelar] : emExecucao ? [
    ...(principal?.acao !== entregar ? [{ rotulo: 'Marcar como entregue', icone: 'entregue', aoEscolher: entregar } satisfies AcaoMenu] : []),
    ...(execucao !== 'REWORK' ? [{ rotulo: 'Marcar em retrabalho', icone: 'retrabalho', aoEscolher: perguntarAntes({ titulo: 'Marcar como em retrabalho?', mensagem: 'O orçamento permanecerá em Orçamentos com a situação "Em retrabalho".', confirmar: 'Marcar em retrabalho' }, { status: 'APPROVED', executionStatus: 'REWORK', reason: 'Projeto encaminhado para retrabalho' }) } satisfies AcaoMenu] : []),
    // Pausa: continua em Orçamentos como "Produção parada"; no Fluxo os projetos saem das colunas até retomar.
    ...(!['NOT_STARTED', 'PAUSED'].includes(execucao) ? [{ rotulo: 'Parar produção', icone: 'pendente', aoEscolher: perguntarAntes({ titulo: 'Interromper a produção?', mensagem: 'O orçamento permanecerá em Orçamentos com a situação "Produção parada", e seus projetos serão retirados do Fluxo de trabalho até a retomada.', confirmar: 'Parar produção' }, { status: 'APPROVED', executionStatus: 'PAUSED', reason: 'Produção parada' }) } satisfies AcaoMenu] : []),
    { rotulo: 'Cliente desistiu', icone: 'recusado', perigo: true, aoEscolher: perguntarAntes({ titulo: 'Registrar desistência do cliente?', mensagem: 'O orçamento será transferido para o Histórico. Nenhuma informação será excluída.', confirmar: 'Registrar desistência', cancelar: 'Voltar', perigo: true }, { status: 'CANCELLED', reason: 'Cliente desistiu' }) },
  ] : [];
  // O funcionário atual aparece na lista mesmo antes da equipe carregar.
  const responsaveis = activeWorker && !workers.some((worker) => worker.id === activeWorker.worker.id) ? [activeWorker.worker, ...workers] : workers;
  const marcarAlterado = (event: React.FormEvent<HTMLFormElement>) => { if (!(event.target as HTMLElement).closest('.worker-colors')) setAlterado(true); };
  return <main className="list-page">
    <header className="orcamento-topo">
      <div className="orcamento-topo-titulo">
        <Caminho itens={caminho} atual={quote.number} />
        <div className="orcamento-topo-nome"><h1>{quote.number}</h1><StatusOrcamento quote={quote} icones /><HistoricoOrcamento quoteId={id} numero={quote.number} cliente={quote.customerNameSnapshot} /></div>
      </div>
      <div className="orcamento-topo-acoes">
        <select className="orcamento-status" aria-label="Status do orçamento" title="Status do orçamento" value={currentWorkStatus} disabled={updating} onChange={(event) => { const value = event.target.value as WorkStatus; if (value === 'PENDING_APPROVAL') void changeStatus({ status: 'SENT' }); else if (value === 'REJECTED') void changeStatus({ status: 'REJECTED', reason: 'Status alterado no acompanhamento' }); else if (pendente && WORK_STATUS_STORAGE[value].status === 'APPROVED') setAprovacaoPedida({ status: 'APPROVED', executionStatus: WORK_STATUS_STORAGE[value].executionStatus }); else void changeStatus({ status: WORK_STATUS_STORAGE[value].status, executionStatus: WORK_STATUS_STORAGE[value].executionStatus }); }}>{WORK_STATUSES.map(status => <option value={status} key={status}>{WORK_STATUS_LABELS[status]}</option>)}</select>
        <ExportarPdfOrcamento quoteId={id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} disponivel={{ desenhos: quote.items.some(item => projetoTemDesenho(item.drawingData)), tecnico: !!comTecnico?.size }} />
        <MenuAcoes rotulo="Mais ações do orçamento" titulo="Orçamento" grupos={[acoesDoOrcamento, acoesDaSituacao]} />
        {principal && <button type="button" className="botao-principal" disabled={updating} onClick={principal.acao}><Icone nome={principal.icone} tamanho={16} />{principal.rotulo}</button>}
      </div>
      <p className="orcamento-topo-meta">
        <span><Icone nome="pessoa" tamanho={15} />Cliente <Link href={`/clientes/${quote.customerId}`}>{quote.customerNameSnapshot}</Link><button type="button" className="orcamento-editar-contato" aria-label="Editar contato do cliente" title="Editar contato" onClick={() => setEditandoContato(true)}><Icone nome="lapis" tamanho={15} /></button></span>
        <span><Icone nome="calendario" tamanho={15} />Criado em <b>{dateLabel(quote.createdAt)}</b></span>
        <span><Icone nome="prazo" tamanho={15} />Validade <b>{validade}</b></span>
      </p>
    </header>
    {error && <p role="alert" className="form-error">{error}</p>}
    {editandoContato && <EditarContato clienteId={quote.customerId} aoFechar={() => setEditandoContato(false)} aoSalvar={async (dados) => { setQuote(await api<Quote>(`/quotes/${id}/contact`, { method: 'PATCH', body: JSON.stringify(dados) })); }} />}
    {(quote.parentQuote || Boolean(quote.complements?.length)) && <section className="detail-card"><span>PROJETOS VINCULADOS</span>{quote.parentQuote && <Link href={enderecoOrcamento(quote.parentQuote.id, origem)}>Complemento de {quote.parentQuote.number}</Link>}{quote.complements?.map((complement) => <Link href={enderecoOrcamento(complement.id, origem)} key={complement.id}>{complement.number} · {formatarMoeda(Number(complement.netTotal))}</Link>)}<small>Os valores dos complementos são contabilizados separadamente do orçamento original.</small></section>}
    <section className="quote-workbench" aria-label="Acompanhamento do serviço">
      <h2 className="quote-workbench-titulo"><Icone nome="equipe" tamanho={16} />{canTeam ? 'Equipe, prazo e observação' : 'Prazo e observação'}</h2>
      {/* Equipe, prazos e observações do orçamento (as do PDF): salvos juntos. Fica montada ao trocar de aba, sem perder o que foi digitado. */}
      <form key={formVersao} className="quote-workbench-aba" onSubmit={salvarAba} onInput={marcarAlterado} onChange={marcarAlterado}>
        <div className={`quote-workbench-work${canTeam ? '' : ' sem-equipe'}`}>
          {canTeam && <section className="quote-workbench-bloco" aria-label="Equipe">
            <h3><Icone nome="equipe" tamanho={16} />Equipe</h3>
            <label>Responsável pela execução<select name="workerId" defaultValue={activeWorker?.worker.id ?? ''}><option value="">Selecione um funcionário</option>{responsaveis.map(worker => <option value={worker.id} key={worker.id}>{worker.name}</option>)}</select></label>
            <details className="worker-colors"><summary><Icone nome="paleta" tamanho={14} />Definir cores da equipe</summary><div>{workers.map((worker) => <label key={worker.id}><i style={{ backgroundColor: worker.workColor }} />{worker.name}<input aria-label={`Cor de ${worker.name}`} type="color" value={worker.workColor} disabled={savingWorker} onChange={(event) => void changeWorkerColor(worker, event.target.value)} /></label>)}</div></details>
          </section>}
          <section className="quote-workbench-bloco" aria-label="Prazos">
            <h3><Icone nome="calendario" tamanho={16} />Prazos</h3>
            <div className="quote-workbench-datas"><label>Entrega acordada<input type="date" name="deliveryDeadline" defaultValue={quote.deliveryDeadline?.slice(0, 10) ?? ''} /></label><label>Previsão de montagem<input type="date" name="installationDeadline" defaultValue={quote.installationDeadline?.slice(0, 10) ?? ''} /></label></div>
            <label className="tracking-check"><input type="checkbox" name="deadlineConfirmed" defaultChecked={quote.deadlineConfirmed} /> Prazo confirmado com o cliente</label>
          </section>
          <section className="quote-workbench-bloco" aria-label="Observações do orçamento">
            <h3><Icone nome="documento" tamanho={16} />Observações do orçamento</h3>
            <textarea name="notes" aria-label="Observações do orçamento" defaultValue={quote.notes ?? ''} maxLength={3000} rows={3} placeholder="Ex.: conferir medidas no local e alinhar os veios das peças." />
            <small><Icone nome="info" tamanho={13} />Exibidas no PDF enviado ao cliente.</small>
          </section>
        </div>
        <footer className="quote-workbench-rodape">
          <small><Icone nome="info" tamanho={14} />Equipe, prazos e observações são salvos em conjunto.</small>
          <div>{trackingSaved && <span role="status">Salvo ✓</span>}<button type="button" className="botao-contorno" disabled={!alterado || savingTracking} onClick={descartar}>Descartar</button><button className="botao-principal" disabled={!alterado || savingTracking}>{savingTracking ? 'Salvando…' : 'Salvar alterações'}</button></div>
        </footer>
      </form>
    </section>
    <section className="projetos-orcamento" aria-label="Projetos do orçamento">
      <header className="projetos-orcamento-topo">
        <h2>Projetos <small>{quote.items.length}</small></h2>
        {recusados.length > 0 && <div className="projetos-filtro" role="group" aria-label="Mostrar projetos">
          {([['todos', 'Todos', quote.items.length], ['aprovados', 'Aprovados', quote.items.length - recusados.length], ['nao-aprovados', 'Não aprovados', recusados.length]] as const).map(([valor, rotulo, total]) =>
            <button key={valor} type="button" aria-pressed={filtroProjetos === valor} onClick={() => setFiltroProjetos(valor)}>{rotulo}<b>{total}</b></button>)}
        </div>}
      </header>
      <div className="projetos-blocos">{quote.items.map((item, indice) => ({ item, indice })).filter(({ item }) => filtroProjetos === 'todos' || (filtroProjetos === 'aprovados') === !item.declinedAt).map(({ item, indice }) => <BlocoProjeto key={item.id} id={`projeto-${item.id}`} tom={indice}
        nome={nomeProjeto(item)} valor={formatarMoeda(item.total)} aberto={abertos.has(item.id)}
        resumo={[[...new Set(item.components.length ? item.components.map(component => component.materialNameSnapshot ?? item.materialNameSnapshot) : [item.materialNameSnapshot])].join(' · '), `${item.billedQuantity.toLocaleString('pt-BR')} m²`, item.components.length ? `${item.components.length} ${item.components.length === 1 ? 'peça' : 'peças'}` : ''].filter(Boolean).join(' · ')}
        situacao={quote.status === 'APPROVED' ? item.declinedAt ? 'nao-aprovado' : 'aprovado' : undefined}
        aoAlternar={() => setAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(item.id)) proximo.delete(item.id); else proximo.add(item.id); return proximo; })}
        acaoRapida={quote.status === 'APPROVED' && (quote.executionStatus ?? 'NOT_STARTED') !== 'NOT_STARTED' && !item.declinedAt
          ? <button type="button" className="projeto-bloco-retrabalho" title="Retrabalho: as peças voltam para a produção ou para a entrega" onClick={() => { setErroRetrabalho(''); setRetrabalho(item); }}><Icone nome="refazer" tamanho={13} /><span>Retrabalho</span></button> : undefined}
        acoes={[[
          { rotulo: 'Exportar PDF', icone: 'download', aoEscolher: () => { setAbertos((atual) => new Set(atual).add(item.id)); setExportarProjeto(item.id); } },
          ...(!projetoTemDesenho(item.drawingData) && podeEditarOrcamento(quote) ? [{ rotulo: 'Adicionar desenhos', icone: 'lapis', href: enderecoOrcamento(id, origem, { tela: 'editar', parametros: { detail: item.id } }) } satisfies AcaoMenu] : []),
          ...(canTechnical ? [{ rotulo: comTecnico?.has(item.id) ? 'Desenho técnico' : 'Adicionar desenho técnico', icone: 'esquadro', desabilitada: !!openingDesign, aoEscolher: () => void abrirDesenhoTecnico(item) } satisfies AcaoMenu] : []),
        ], quote.status === 'APPROVED' && quote.executionStatus !== 'COMPLETED' && quote.items.length > 1 ? [item.declinedAt
          ? { rotulo: 'Aprovar projeto', icone: 'marcado', desabilitada: !!alterandoAprovacao, aoEscolher: () => void alterarAprovacao(item, true) }
          : { rotulo: 'Marcar como não aprovado', icone: 'recusado', perigo: true, desabilitada: !!alterandoAprovacao || recusados.length === quote.items.length - 1, aoEscolher: () => void alterarAprovacao(item, false) }] : []]}>
<div className="projeto-impressoes"><ExportarPdfProjeto quoteId={id} itemId={item.id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} projectName={nomeProjeto(item)} disponivel={{ desenhos: projetoTemDesenho(item.drawingData), tecnico: !!comTecnico?.has(item.id) }} abrirAgora={exportarProjeto === item.id} aoAbrir={exportacaoAberta} />{!projetoTemDesenho(item.drawingData) && podeEditarOrcamento(quote) && <Link className="secondary-button" href={enderecoOrcamento(id, origem, { tela: 'editar', parametros: { detail: item.id } })}>Adicionar desenhos</Link>}{canTechnical && comTecnico && !comTecnico.has(item.id) && <button type="button" className="secondary-button" disabled={!!openingDesign} onClick={() => void abrirDesenhoTecnico(item)}>{openingDesign === item.id ? 'Abrindo desenho…' : 'Adicionar desenho técnico'}</button>}</div>{entregas && entregasPorProjeto.has(item.id) && <NotaEntregaProjeto quoteId={id} customerName={quote.customerNameSnapshot} projeto={entregasPorProjeto.get(item.id)!} canDeliver={entregas.canDeliver} reason={entregas.reason} abrirAoCarregar={notaPedida === item.id}
        aoRegistrar={(nota) => { void carregarEntregas(); if (nota.quoteDelivered) void api<Quote>(`/quotes/${id}`).then(setQuote); }} />}<SavedItemDrawing item={item} notes={quote.notes} /><strong>{[...new Set(item.components.length ? item.components.map(component => component.materialNameSnapshot ?? item.materialNameSnapshot) : [item.materialNameSnapshot])].join(' · ')}</strong>
      <small>{item.calculationMode === 'MANUAL_M2' ? 'Área manual registrada' : 'Área calculada pelos componentes'} · {item.billedQuantity.toLocaleString('pt-BR')} m² · Material: {formatarMoeda(item.materialSubtotal)}</small>
      {item.components.map((component) => <div className="quote-component" key={component.id}><strong>{component.label}</strong><small>{component.materialNameSnapshot ?? item.materialNameSnapshot}</small><small>{cm(component.lengthMm)} × {cm(component.widthMm)} cm · {component.orientation === 'HORIZONTAL' ? 'horizontal' : 'vertical'} · qtd. {component.quantity} · {(component.lengthMm * component.widthMm * component.quantity / 1_000_000).toLocaleString('pt-BR')} m²</small><small>Calculado: {formatarMoeda(Number(component.calculatedTotal))} · Aplicado: {formatarMoeda(Number(component.appliedTotal))} · Desconto: {formatarMoeda(Math.max(0, Number(component.calculatedTotal) - Number(component.appliedTotal)))}</small>{component.edges.map((edge, index) => <small key={`${edge.side}-${index}`}>↳ {rotuloLadoBorda(edge.side)}: {edge.serviceNameSnapshot} · Calculado {formatarMoeda(Number(edge.calculatedSubtotal))} · Aplicado {formatarMoeda(Number(edge.appliedSubtotal))}</small>)}</div>)}
      {item.cutouts.map((cutout) => <small key={cutout.id}>Recorte: {cutout.label ?? cutout.cutoutType}{cutout.lengthMm && cutout.widthMm ? ` · ${cm(cutout.lengthMm)} × ${cm(cutout.widthMm)} cm` : ''}</small>)}
      {item.services.map((service, index) => <small key={`${service.serviceNameSnapshot}-${index}`}>+ {service.serviceNameSnapshot}: calculado {formatarMoeda(Number(service.calculatedSubtotal))} · aplicado {formatarMoeda(Number(service.appliedSubtotal))} · desconto {formatarMoeda(Math.max(0, Number(service.calculatedSubtotal) - Number(service.appliedSubtotal)))}</small>)}
      <b>{formatarMoeda(item.total)}</b>
      {quote.status === 'APPROVED' && quote.executionStatus !== 'COMPLETED' && quote.items.length > 1 && <div className="projeto-bloco-aprovacao">
        {item.declinedAt
          ? <><small>O cliente não aprovou este projeto: ele está fora do valor e do fluxo de trabalho.</small><button type="button" className="botao-contorno" disabled={!!alterandoAprovacao} onClick={() => void alterarAprovacao(item, true)}>Aprovar projeto</button></>
          : <button type="button" className="text-button" disabled={!!alterandoAprovacao || recusados.length === quote.items.length - 1} onClick={() => void alterarAprovacao(item, false)}>Marcar como não aprovado</button>}
      </div>}
    </BlocoProjeto>)}</div>
    </section>
    {retrabalho && <JanelaRetrabalho projeto={nomeProjeto(retrabalho)} ocupada={enviandoRetrabalho} erro={erroRetrabalho} aoFechar={() => setRetrabalho(null)} aoConfirmar={(destino, motivo) => void enviarRetrabalho(destino, motivo)} />}
    {aprovacaoPedida && <JanelaAprovacao numero={quote.number} cliente={quote.customerNameSnapshot} ocupada={updating}
      projetos={quote.items.map((item) => ({ id: item.id, nome: nomeProjeto(item), total: item.total }))} descontoCompleto={quote.fullDiscountAmount ?? quote.discountAmount}
      aoFechar={() => setAprovacaoPedida(null)} aoConfirmar={(naoAprovados) => { const pedido = aprovacaoPedida; setAprovacaoPedida(null); void changeStatus({ ...pedido, ...(naoAprovados.length ? { projetosNaoAprovados: naoAprovados } : {}) }); }} />}
    <section className="detail-total"><span>Total bruto</span><strong>{formatarMoeda(quote.grossTotal)}</strong><span>Descontos individuais</span><strong>- {formatarMoeda(individualDiscount)}</strong><span>Desconto geral</span><strong>- {formatarMoeda(quote.discountAmount)}</strong><span>Desconto total dado</span><strong>- {formatarMoeda(totalDiscountGiven)}</strong><b>Total do orçamento: {formatarMoeda(quote.netTotal)}</b>{recusados.length > 0 && <small className="detail-total-fora">{recusados.length === 1 ? '1 projeto não aprovado fica' : `${recusados.length} projetos não aprovados ficam`} fora do valor: {formatarMoeda(recusados.reduce((soma, item) => soma + item.total, 0))}</small>}</section>
  </main>;
}
