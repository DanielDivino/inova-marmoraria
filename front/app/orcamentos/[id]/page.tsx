'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { temPermissao, nomeProjeto, nomeExibicaoComponente, detalheDesenhoComponente, planoDeProducao, rotuloLadoBorda, descontosIndividuais, podeEditarOrcamento, validadeOrcamento, obterStatusTrabalho, WORK_STATUS_LABELS, WORK_STATUS_STORAGE, WORK_STATUSES, type SavedQuoteItem, type WorkStatus } from '@inova/domain';
import { SavedItemDrawing } from '../../../componentes/orcamento/SavedDrawings';
import { StatusOrcamento } from '../../../componentes/QuoteStatus';
import { useSession } from '../../../componentes/ApplicationShell';
import { api, ApiError } from '../../../utilitarios/api';
import { ExportarPdfOrcamento, ExportarPdfProjeto } from '../../../componentes/orcamento/QuotePdfExport';
import { BlocoProjeto } from '../../../componentes/orcamento/BlocoProjeto';
import { JanelaAprovacao } from '../../../componentes/orcamento/JanelaAprovacao';
import { JanelaFuncionarioProjeto } from '../../../componentes/orcamento/JanelaFuncionarioProjeto';
import { JanelaAcompanhamento } from '../../../componentes/orcamento/JanelaAcompanhamento';
import { JanelaRetrabalho, type DestinoRetrabalho } from '../../../componentes/orcamento/JanelaRetrabalho';
import { NotaEntregaProjeto, type EntregasOrcamento } from '../../../componentes/orcamento/NotaEntregaProjeto';
import { EntregaGeral } from '../../../componentes/orcamento/EntregaGeral';
import { IndicadorEntrega } from '../../../componentes/orcamento/IndicadorEntrega';
import { JanelaNomes } from '../../../componentes/orcamento/JanelaNomes';
import { JanelaNaoAprovado, type EscolhaNaoAprovado } from '../../../componentes/orcamento/JanelaNaoAprovado';
import { AbasFiltro, CampoFiltro, Icone, PainelFiltros, type NomeIcone } from '../../../componentes/filtros/Filtros';
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
type FiltroProjeto = 'todos' | 'aprovados' | 'nao-aprovados';
type Quote = {
  parentQuote?: { id: string; number: string } | null; complements?: { id: string; number: string; netTotal: number }[];
  number: string; customerId: string; createdAt?: string; status: string; executionStatus?: string; approvedAt?: string; completedAt?: string; validUntil?: string; dueDate?: string; deliveryDeadline?: string; installationDeadline?: string; deadlineConfirmed?: boolean; deadlineNote?: string | null; customerNameSnapshot: string; customerPhoneSnapshot?: string; workAddressSnapshot?: string;
  discountAmount: number; grossTotal: number; netTotal: number; notes?: string;
  /** Desconto negociado para o orçamento completo, enquanto há projetos não aprovados. */
  fullDiscountAmount?: number | null;
  workerAssignments?: WorkerAssignment[];
  items: (SavedQuoteItem & { id: string; declinedAt?: string | null; deliveryDeadline?: string | null; notes?: string | null; workerAssignments?: WorkerAssignment[]; materialNameSnapshot: string; unitPriceSnapshot: number; billedQuantity: number; materialSubtotal: number; total: number; calculationMode: 'DIMENSIONS' | 'MANUAL_M2'; productType: { name: string }; services: { serviceNameSnapshot: string; billedQuantity: number; unitPriceSnapshot: number; subtotal: number; calculatedSubtotal: number; appliedSubtotal: number; billingUnitSnapshot: string }[]; components: Component[]; cutouts: Cutout[] })[];
};
const cm = (millimeters: number) => (millimeters / 10).toLocaleString('pt-BR');
type PecaNaoAprovada = { nome: string; lengthMm: number; widthMm: number; quantidade: number };
/** O que o cliente não aprovou do projeto ("Não aprovado / alterar"), guardado no próprio projeto. */
const pecasNaoAprovadas = (item: { drawingData?: unknown }): PecaNaoAprovada[] => {
  const lista = (item.drawingData as { pecasNaoAprovadas?: unknown } | null)?.pecasNaoAprovadas;
  return Array.isArray(lista) ? lista.filter((peca): peca is PecaNaoAprovada => !!peca && typeof peca === 'object' && typeof (peca as PecaNaoAprovada).nome === 'string') : [];
};
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';

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
  const [editandoContato, setEditandoContato] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [salvandoFuncionario, setSalvandoFuncionario] = useState(false);
  const [projetoFuncionario, setProjetoFuncionario] = useState<Quote['items'][number] | null>(null);
  const [projetoAcompanhamento, setProjetoAcompanhamento] = useState<Quote['items'][number] | null>(null);
  const [acompanhamentoGeral, setAcompanhamentoGeral] = useState(false);
  const [salvandoAcompanhamento, setSalvandoAcompanhamento] = useState(false);
  const [buscaProjeto, setBuscaProjeto] = useState('');
  const [filtroProjetos, setFiltroProjetos] = useState<FiltroProjeto>('todos');
  const [filtroPrazo, setFiltroPrazo] = useState<'todos' | 'com-prazo' | 'sem-prazo'>('todos');
  const [filtroFuncionario, setFiltroFuncionario] = useState('');
  // Projeto cujo desenho técnico está abrindo.
  const [openingDesign, setOpeningDesign] = useState<string | null>(null);
  // Entregas por projeto (notas de entrega) só existem depois da aprovação.
  const [entregas, setEntregas] = useState<EntregasOrcamento | null>(null);
  /** "Marcar como entregue": a janela da entrega geral (todos os projetos e as peças). */
  const [entregaGeralAberta, setEntregaGeralAberta] = useState(false);
  /** "Editar nomes" do projeto: o projeto aberto na janela, o envio e o erro. */
  const [nomesProjeto, setNomesProjeto] = useState<Quote['items'][number] | null>(null);
  const [salvandoNomes, setSalvandoNomes] = useState(false);
  const [erroNomes, setErroNomes] = useState('');
  // Projetos com desenho técnico (Exportar e "Adicionar desenho técnico"); null enquanto carrega.
  const [comTecnico, setComTecnico] = useState<Set<string> | null>(null);
  const [notaPedida, setNotaPedida] = useState<string | null>(null);
  // "Confirmar aprovação": a situação escolhida, enquanto a janela pergunta quais projetos o cliente aprovou.
  const [aprovacaoPedida, setAprovacaoPedida] = useState<{ status: string; executionStatus?: string } | null>(null);
  // Projetos em blocos compactos: quais estão abertos e quais aparecem (todos, aprovados ou não aprovados).
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [alterandoAprovacao, setAlterandoAprovacao] = useState<string | null>(null);
  // "Não aprovado / alterar": as peças do projeto que o cliente não aprovou.
  const [naoAprovar, setNaoAprovar] = useState<Quote['items'][number] | null>(null);
  const [salvandoNaoAprovado, setSalvandoNaoAprovado] = useState(false);
  const [erroNaoAprovado, setErroNaoAprovado] = useState('');
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
  const funcionarioGeral = quote.workerAssignments?.find((assignment) => !assignment.releasedAt)?.worker;
  const funcionarioDoProjeto = (item: Quote['items'][number]) => {
    const atribuicoes = item.workerAssignments ?? [];
    return atribuicoes.find((assignment) => !assignment.releasedAt)?.worker ?? (atribuicoes.length ? undefined : funcionarioGeral);
  };
  const individualDiscount = descontosIndividuais(quote.items.filter((item) => !item.declinedAt));
  const entregasPorProjeto = new Map(entregas?.projects.map((projeto) => [projeto.id, projeto]) ?? []);
  const totalDiscountGiven = individualDiscount + quote.discountAmount;
 /** Projeto que o cliente não tinha aprovado e voltou atrás: volta ao valor e ao fluxo de trabalho. */
 async function aprovarProjeto(item: Quote['items'][number]) {
    if (alterandoAprovacao || !await confirmar({ titulo: `Aprovar “${nomeProjeto(item)}”?`, mensagem: 'O projeto volta ao valor do orçamento e ao fluxo de trabalho.', confirmar: 'Aprovar projeto' })) return;
    setAlterandoAprovacao(item.id); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/items/${item.id}/aprovacao`, { method: 'PATCH', body: JSON.stringify({ aprovado: true }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível aprovar o projeto.'); }
    finally { setAlterandoAprovacao(null); }
  }
 async function salvarNaoAprovado(item: Quote['items'][number], escolha: EscolhaNaoAprovado) {
    setSalvandoNaoAprovado(true); setErroNaoAprovado('');
    try {
      setQuote(await api<Quote>(`/quotes/${id}/items/${item.id}/nao-aprovar`, { method: 'POST', body: JSON.stringify(escolha) }));
      setNaoAprovar(null);
      void carregarEntregas();
    } catch (cause) { setErroNaoAprovado(cause instanceof Error ? cause.message : 'Não foi possível tirar as peças do projeto.'); }
    finally { setSalvandoNaoAprovado(false); }
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
 async function changeStatus(payload: { status: string; executionStatus?: string; reason?: string; projetosNaoAprovados?: string[]; deliveryDeadline?: string | null; projectDeadlines?: { projectId: string; deliveryDeadline: string | null }[] }) {
    if (updating) return;
    setUpdating(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o projeto.'); }
    finally { setUpdating(false); }
 }
  async function salvarFuncionarioProjeto(item: Quote['items'][number], workerId: string | null) {
    setSalvandoFuncionario(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/items/${item.id}/worker`, { method: 'PUT', body: JSON.stringify({ workerId }) })); setProjetoFuncionario(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o funcionário.'); }
    finally { setSalvandoFuncionario(false); }
  }
  async function salvarAcompanhamentoProjeto(item: Quote['items'][number], dados: { deliveryDeadline: string | null; notes: string | null }) {
    setSalvandoAcompanhamento(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/items/${item.id}/acompanhamento`, { method: 'PATCH', body: JSON.stringify(dados) })); setProjetoAcompanhamento(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o prazo e as observações.'); }
    finally { setSalvandoAcompanhamento(false); }
  }
  async function salvarAcompanhamentoOrcamento(dados: { deliveryDeadline: string | null; notes: string | null }) {
    setSalvandoAcompanhamento(true); setError('');
    try { setQuote(await api<Quote>(`/quotes/${id}/tracking`, { method: 'PATCH', body: JSON.stringify(dados) })); setAcompanhamentoGeral(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o prazo e as observações.'); }
    finally { setSalvandoAcompanhamento(false); }
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
  async function salvarNomes(item: Quote['items'][number], dados: { projectName: string | null; components: { id: string; label: string }[] }) {
    setSalvandoNomes(true); setErroNomes('');
    try {
      setQuote(await api<Quote>(`/quotes/${id}/items/${item.id}/nomes`, { method: 'PATCH', body: JSON.stringify(dados) }));
      setNomesProjeto(null);
      if (quote?.status === 'APPROVED') void carregarEntregas();
    } catch (cause) { setErroNomes(cause instanceof Error ? cause.message : 'Não foi possível salvar os nomes.'); }
    finally { setSalvandoNomes(false); }
  }
  const currentWorkStatus = obterStatusTrabalho(quote);
  const caminho = caminhoAteOrcamento(quote, origem);
  const validade = dateLabel(quote.validUntil ?? (quote.createdAt ? validadeOrcamento(new Date(quote.createdAt)) : undefined));
  // A próxima ação da situação fica em destaque; as outras, no menu "⋯".
  const execucao = quote.executionStatus ?? 'NOT_STARTED';
  const pendente = ['DRAFT', 'SENT'].includes(quote.status);
  const emExecucao = quote.status === 'APPROVED' && execucao !== 'COMPLETED';
  const perguntarAntes = (opcoes: Parameters<typeof confirmar>[0], payload: Parameters<typeof changeStatus>[0]) => async () => { if (await confirmar(opcoes)) void changeStatus(payload); };
  // Marcar como entregue: escolher as peças entregues de todos os projetos e gerar a nota geral.
  const entregar = () => { setEntregaGeralAberta(true); void carregarEntregas(); };
  const entregarSemNota = () => void changeStatus({ status: 'APPROVED', executionStatus: 'COMPLETED' });
  const principal: { rotulo: string; icone: NomeIcone; acao: () => void } | null = pendente ? { rotulo: 'Confirmar aprovação', icone: 'marcado', acao: () => setAprovacaoPedida({ status: 'APPROVED' }) }
    : !emExecucao ? null
    : execucao === 'NOT_STARTED' ? { rotulo: 'Iniciar serviço', icone: 'andamento', acao: () => void changeStatus({ status: 'APPROVED', executionStatus: 'IN_PROGRESS' }) }
    : execucao === 'PAUSED' ? { rotulo: 'Retomar produção', icone: 'andamento', acao: () => void changeStatus({ status: 'APPROVED', executionStatus: 'IN_PROGRESS', reason: 'Produção retomada' }) }
    : { rotulo: 'Marcar como entregue', icone: 'entregue', acao: entregar };
  const cancelar: AcaoMenu = { rotulo: 'Cancelar orçamento', icone: 'lixeira', perigo: true, aoEscolher: perguntarAntes({ titulo: 'Cancelar orçamento?', mensagem: 'O orçamento será cancelado e permanecerá disponível para consulta no Histórico.', confirmar: 'Cancelar orçamento', cancelar: 'Voltar', perigo: true }, { status: 'CANCELLED', reason: 'Cancelado no acompanhamento comercial' }) };
  const acoesDoOrcamento: AcaoMenu[] = [
    { rotulo: 'Prazo e observações', icone: 'prazo', aoEscolher: () => setAcompanhamentoGeral(true) },
    ...(podeEditarOrcamento(quote) ? [{ rotulo: 'Editar orçamento', icone: 'lapis', href: enderecoOrcamento(id, origem, { tela: 'editar' }) } satisfies AcaoMenu] : []),
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
  const itensVisiveis = quote.items.map((item, indice) => ({ item, indice })).filter(({ item }) => {
    const aprovado = !item.declinedAt;
    const funcionarioAtual = funcionarioDoProjeto(item)?.id;
    const nome = `${nomeProjeto(item)} ${item.environment ?? ''}`.toLocaleLowerCase('pt-BR');
    return (filtroProjetos === 'todos' || (filtroProjetos === 'aprovados') === aprovado)
      && nome.includes(buscaProjeto.trim().toLocaleLowerCase('pt-BR'))
      && (filtroPrazo === 'todos' || (filtroPrazo === 'com-prazo') === !!(item.deliveryDeadline ?? quote.deliveryDeadline))
      && (!filtroFuncionario || funcionarioAtual === filtroFuncionario);
  });
  const filtrosAtivos = Number(!!buscaProjeto || filtroProjetos !== 'todos' || filtroPrazo !== 'todos' || !!filtroFuncionario);
  return <main className="list-page">
    <header className="orcamento-topo">
      <div className="orcamento-topo-titulo">
        <Caminho itens={caminho} atual={quote.number} />
        <div className="orcamento-topo-nome"><h1>{quote.number}</h1><StatusOrcamento quote={quote} icones /><HistoricoOrcamento quoteId={id} numero={quote.number} cliente={quote.customerNameSnapshot} /></div>
      </div>
      <div className="orcamento-topo-acoes">
        <select className="orcamento-status" aria-label="Status do orçamento" title="Status do orçamento" value={currentWorkStatus} disabled={updating} onChange={(event) => { const value = event.target.value as WorkStatus; if (value === 'PENDING_APPROVAL') void changeStatus({ status: 'SENT' }); else if (value === 'REJECTED') void changeStatus({ status: 'REJECTED', reason: 'Status alterado no acompanhamento' }); else if (pendente && WORK_STATUS_STORAGE[value].status === 'APPROVED') setAprovacaoPedida({ status: 'APPROVED', executionStatus: WORK_STATUS_STORAGE[value].executionStatus }); else void changeStatus({ status: WORK_STATUS_STORAGE[value].status, executionStatus: WORK_STATUS_STORAGE[value].executionStatus }); }}>{WORK_STATUSES.map(status => <option value={status} key={status}>{WORK_STATUS_LABELS[status]}</option>)}</select>
        <ExportarPdfOrcamento quoteId={id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} comConferencia={quote.status === 'APPROVED'} />
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
    {acompanhamentoGeral && <JanelaAcompanhamento prazo={quote.deliveryDeadline} observacoes={quote.notes} ocupada={salvandoAcompanhamento} aoFechar={() => setAcompanhamentoGeral(false)} aoSalvar={(dados) => void salvarAcompanhamentoOrcamento(dados)} />}
    {projetoAcompanhamento && <JanelaAcompanhamento projeto={nomeProjeto(projetoAcompanhamento)} prazo={projetoAcompanhamento.deliveryDeadline} observacoes={projetoAcompanhamento.notes} ocupada={salvandoAcompanhamento} aoFechar={() => setProjetoAcompanhamento(null)} aoSalvar={(dados) => void salvarAcompanhamentoProjeto(projetoAcompanhamento, dados)} />}
    {projetoFuncionario && <JanelaFuncionarioProjeto projeto={nomeProjeto(projetoFuncionario)} funcionarios={workers} selecionado={funcionarioDoProjeto(projetoFuncionario)?.id ?? ''} ocupada={salvandoFuncionario} aoFechar={() => setProjetoFuncionario(null)} aoSalvar={(workerId) => void salvarFuncionarioProjeto(projetoFuncionario, workerId)} />}
    <section className="projetos-orcamento" aria-label="Projetos do orçamento">
      <header className="projetos-orcamento-topo">
        <h2>Projetos <small>{itensVisiveis.length} de {quote.items.length}</small></h2>
        <PainelFiltros rotulo="Filtrar projetos deste orçamento" ativos={filtrosAtivos} aoLimpar={() => { setBuscaProjeto(''); setFiltroProjetos('todos'); setFiltroPrazo('todos'); setFiltroFuncionario(''); }}>
          <CampoFiltro rotulo="Buscar projeto" icone="buscar"><input type="search" value={buscaProjeto} onChange={(event) => setBuscaProjeto(event.target.value)} placeholder="Nome do projeto ou ambiente" /></CampoFiltro>
          <CampoFiltro rotulo="Prazo" icone="prazo"><select value={filtroPrazo} onChange={(event) => setFiltroPrazo(event.target.value as typeof filtroPrazo)}><option value="todos">Todos os prazos</option><option value="com-prazo">Com prazo</option><option value="sem-prazo">Sem prazo</option></select></CampoFiltro>
          {canTeam && <CampoFiltro rotulo="Funcionário" icone="equipe"><select value={filtroFuncionario} onChange={(event) => setFiltroFuncionario(event.target.value)}><option value="">Todos os funcionários</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></CampoFiltro>}
        </PainelFiltros>
      </header>
      <AbasFiltro rotulo="Situação dos projetos" valor={filtroProjetos} aoEscolher={setFiltroProjetos} grupos={[{ opcoes: [
        { valor: 'todos', rotulo: 'Todos', icone: 'documento', total: quote.items.length },
        { valor: 'aprovados', rotulo: 'Aprovados', icone: 'aprovado', total: quote.items.length - recusados.length },
        { valor: 'nao-aprovados', rotulo: 'Não aprovados', icone: 'recusado', total: recusados.length },
      ] }]} />
      <div className="projetos-blocos">{itensVisiveis.length ? itensVisiveis.map(({ item, indice }) => <BlocoProjeto key={item.id} id={`projeto-${item.id}`} tom={indice}
        nome={nomeProjeto(item)} valor={formatarMoeda(item.total)} aberto={abertos.has(item.id)}
        resumo={[[...new Set(item.components.length ? item.components.map(component => component.materialNameSnapshot ?? item.materialNameSnapshot) : [item.materialNameSnapshot])].join(' · '), `${item.billedQuantity.toLocaleString('pt-BR')} m²`, item.components.length ? `${item.components.length} ${item.components.length === 1 ? 'peça' : 'peças'}` : ''].filter(Boolean).join(' · ')}
        situacao={quote.status === 'APPROVED' ? item.declinedAt ? 'nao-aprovado' : 'aprovado' : undefined}
        aoAlternar={() => setAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(item.id)) proximo.delete(item.id); else proximo.add(item.id); return proximo; })}
        entrega={(() => { const projetoEntregas = entregas?.projects.find((projeto) => projeto.id === item.id); return projetoEntregas && execucao !== 'NOT_STARTED'
          ? <IndicadorEntrega projeto={projetoEntregas} quoteId={id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} /> : undefined; })()}
        acaoRapida={quote.status === 'APPROVED' && (quote.executionStatus ?? 'NOT_STARTED') !== 'NOT_STARTED' && !item.declinedAt
          ? <button type="button" className="projeto-bloco-retrabalho" title="Retrabalho: as peças voltam para a produção ou para a entrega" onClick={() => { setErroRetrabalho(''); setRetrabalho(item); }}><Icone nome="refazer" tamanho={13} /><span>Retrabalho</span></button> : undefined}
        acoes={[[
          { rotulo: 'Exportar PDF', icone: 'download', aoEscolher: () => { setAbertos((atual) => new Set(atual).add(item.id)); setExportarProjeto(item.id); } },
          { rotulo: 'Editar nomes', icone: 'lapis', aoEscolher: () => { setErroNomes(''); setNomesProjeto(item); } },
          ...(canTeam ? [{ rotulo: item.workerAssignments?.some((assignment) => !assignment.releasedAt) ? 'Trocar funcionário' : 'Adicionar funcionário', icone: 'equipe', aoEscolher: () => setProjetoFuncionario(item) } satisfies AcaoMenu] : []),
          { rotulo: 'Prazo e observações', icone: 'prazo', aoEscolher: () => setProjetoAcompanhamento(item) },
          ...(canTechnical ? [{ rotulo: comTecnico?.has(item.id) ? 'Desenho técnico' : 'Adicionar desenho técnico', icone: 'esquadro', desabilitada: !!openingDesign, aoEscolher: () => void abrirDesenhoTecnico(item) } satisfies AcaoMenu] : []),
        ], quote.status === 'APPROVED' && quote.executionStatus !== 'COMPLETED' ? [item.declinedAt
          ? { rotulo: 'Aprovar projeto', icone: 'marcado', desabilitada: !!alterandoAprovacao, aoEscolher: () => void aprovarProjeto(item) }
          : { rotulo: 'Não aprovado / alterar', icone: 'recusado', perigo: true, aoEscolher: () => { setErroNaoAprovado(''); setNaoAprovar(item); } }] : []]}>
<div className="projeto-impressoes"><ExportarPdfProjeto quoteId={id} itemId={item.id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} projectName={nomeProjeto(item)} comConferencia={quote.status === 'APPROVED' && !item.declinedAt} abrirAgora={exportarProjeto === item.id} aoAbrir={exportacaoAberta} />{canTechnical && comTecnico && !comTecnico.has(item.id) && <button type="button" className="secondary-button" disabled={!!openingDesign} onClick={() => void abrirDesenhoTecnico(item)}>{openingDesign === item.id ? 'Abrindo desenho…' : 'Adicionar desenho técnico'}</button>}</div>{entregas && entregasPorProjeto.has(item.id) && <NotaEntregaProjeto quoteId={id} customerName={quote.customerNameSnapshot} projeto={entregasPorProjeto.get(item.id)!} canDeliver={entregas.canDeliver} reason={entregas.reason} abrirAoCarregar={notaPedida === item.id}
        aoRegistrar={(nota) => { void carregarEntregas(); if (nota.quoteDelivered) void api<Quote>(`/quotes/${id}`).then(setQuote); }} />}<div className="projeto-acompanhamento-resumo">
        {funcionarioDoProjeto(item) && <span><Icone nome="equipe" tamanho={14} />{funcionarioDoProjeto(item)?.name}</span>}
        <span><Icone nome="prazo" tamanho={14} />Prazo: {dateLabel(item.deliveryDeadline)}</span>
        {(item.notes || quote.notes) && <p>{item.notes || quote.notes}</p>}
      </div><SavedItemDrawing item={item} notes={item.notes || quote.notes} /><strong>{[...new Set(item.components.length ? item.components.map(component => component.materialNameSnapshot ?? item.materialNameSnapshot) : [item.materialNameSnapshot])].join(' · ')}</strong>
      <small>{item.calculationMode === 'MANUAL_M2' ? 'Área manual registrada' : 'Área calculada pelos componentes'} · {item.billedQuantity.toLocaleString('pt-BR')} m² · Material: {formatarMoeda(item.materialSubtotal)}</small>
      {item.components.map((component) => <div className="quote-component" key={component.id}><strong>{component.label}</strong><small>{component.materialNameSnapshot ?? item.materialNameSnapshot}</small><small>{cm(component.lengthMm)} × {cm(component.widthMm)} cm · {component.orientation === 'HORIZONTAL' ? 'horizontal' : 'vertical'} · qtd. {component.quantity} · {(component.lengthMm * component.widthMm * component.quantity / 1_000_000).toLocaleString('pt-BR')} m²</small><small>Calculado: {formatarMoeda(Number(component.calculatedTotal))} · Aplicado: {formatarMoeda(Number(component.appliedTotal))} · Desconto: {formatarMoeda(Math.max(0, Number(component.calculatedTotal) - Number(component.appliedTotal)))}</small>{component.edges.map((edge, index) => <small key={`${edge.side}-${index}`}>↳ {rotuloLadoBorda(edge.side)}: {edge.serviceNameSnapshot} · Calculado {formatarMoeda(Number(edge.calculatedSubtotal))} · Aplicado {formatarMoeda(Number(edge.appliedSubtotal))}</small>)}</div>)}
      {item.cutouts.map((cutout) => <small key={cutout.id}>Recorte: {cutout.label ?? cutout.cutoutType}{cutout.lengthMm && cutout.widthMm ? ` · ${cm(cutout.lengthMm)} × ${cm(cutout.widthMm)} cm` : ''}</small>)}
      {item.services.map((service, index) => <small key={`${service.serviceNameSnapshot}-${index}`}>+ {service.serviceNameSnapshot}: calculado {formatarMoeda(Number(service.calculatedSubtotal))} · aplicado {formatarMoeda(Number(service.appliedSubtotal))} · desconto {formatarMoeda(Math.max(0, Number(service.calculatedSubtotal) - Number(service.appliedSubtotal)))}</small>)}
      <b>{formatarMoeda(item.total)}</b>
      {pecasNaoAprovadas(item).length > 0 && <small className="projeto-pecas-nao-aprovadas"><b>Não aprovadas pelo cliente:</b> {pecasNaoAprovadas(item).map((peca) => `${peca.quantidade > 1 ? `${peca.quantidade}× ` : ''}${peca.nome} (${cm(peca.lengthMm)} × ${cm(peca.widthMm)} cm)`).join(' · ')}</small>}
      {quote.status === 'APPROVED' && quote.executionStatus !== 'COMPLETED' && <div className="projeto-bloco-aprovacao">
        {item.declinedAt
          ? <><small>O cliente não aprovou este projeto: ele está fora do valor e do fluxo de trabalho.</small><button type="button" className="botao-contorno" disabled={!!alterandoAprovacao} onClick={() => void aprovarProjeto(item)}>Aprovar projeto</button></>
          : <button type="button" className="text-button" onClick={() => { setErroNaoAprovado(''); setNaoAprovar(item); }}>Não aprovado / alterar</button>}
      </div>}
      </BlocoProjeto>) : <p className="empty">Nenhum projeto corresponde aos filtros. Ajuste ou limpe a busca.</p>}</div>
    </section>
    {retrabalho && <JanelaRetrabalho projeto={nomeProjeto(retrabalho)} ocupada={enviandoRetrabalho} erro={erroRetrabalho} aoFechar={() => setRetrabalho(null)} aoConfirmar={(destino, motivo) => void enviarRetrabalho(destino, motivo)} />}
    {naoAprovar && (() => {
      const entregues = new Map(entregasPorProjeto.get(naoAprovar.id)?.pieces.map((peca) => [peca.key, peca.delivered]) ?? []);
      const porPecas = naoAprovar.components.length > 0 && !comTecnico?.has(naoAprovar.id) && !planoDeProducao(naoAprovar.drawingData)?.pieces.length;
      return <JanelaNaoAprovado nomeProjeto={nomeProjeto(naoAprovar)} porPecas={porPecas} ocupada={salvandoNaoAprovado} erro={erroNaoAprovado}
        motivoSemPecas={naoAprovar.components.length ? 'Este projeto tem desenho técnico: para tirar só algumas peças, altere o desenho. Aqui dá para marcar o projeto inteiro como não aprovado.' : 'Projeto em área manual, sem peças separadas: dá para marcar o projeto inteiro como não aprovado.'}
        unicoAprovado={recusados.length === quote.items.length - 1}
        pecas={naoAprovar.components.map((componente, indice) => {
          const pai = detalheDesenhoComponente(naoAprovar.drawingData, indice).parentComponentIndex;
          return { key: componente.id, name: nomeExibicaoComponente(componente), lengthMm: componente.lengthMm, widthMm: componente.widthMm, material: componente.materialNameSnapshot ?? naoAprovar.materialNameSnapshot,
            quantity: componente.quantity, entregues: entregues.get(componente.id) ?? 0, valorUnitario: Number(componente.appliedTotal) / Math.max(1, componente.quantity),
            ...(pai !== undefined && naoAprovar.components[pai] ? { pai: naoAprovar.components[pai].id } : {}) };
        })}
        aoFechar={() => setNaoAprovar(null)} aoConfirmar={(escolha) => void salvarNaoAprovado(naoAprovar, escolha)} />;
    })()}
    {nomesProjeto && <JanelaNomes nomeProjeto={nomesProjeto.projectName ?? ''} pecas={nomesProjeto.components} ocupada={salvandoNomes} erro={erroNomes}
      aoFechar={() => setNomesProjeto(null)} aoSalvar={(dados) => void salvarNomes(nomesProjeto, dados)} />}
    <EntregaGeral quoteId={id} quoteNumber={quote.number} customerName={quote.customerNameSnapshot} entregas={entregas} aberta={entregaGeralAberta} aoFechar={() => setEntregaGeralAberta(false)}
      aoRegistrar={() => { void carregarEntregas(); void api<Quote>(`/quotes/${id}`).then(setQuote); }}
      aoEntregarSemNota={['NOT_STARTED', 'PAUSED'].includes(execucao) ? entregarSemNota : undefined} />
    {aprovacaoPedida && <JanelaAprovacao numero={quote.number} cliente={quote.customerNameSnapshot} ocupada={updating}
      projetos={quote.items.map((item) => ({ id: item.id, nome: nomeProjeto(item), total: item.total }))} descontoCompleto={quote.fullDiscountAmount ?? quote.discountAmount}
      aoFechar={() => setAprovacaoPedida(null)} aoConfirmar={(dados) => { const pedido = aprovacaoPedida; setAprovacaoPedida(null); void changeStatus({ ...pedido, ...(dados.naoAprovados.length ? { projetosNaoAprovados: dados.naoAprovados } : {}), ...(dados.deliveryDeadline !== undefined ? { deliveryDeadline: dados.deliveryDeadline } : {}), ...(dados.projectDeadlines ? { projectDeadlines: dados.projectDeadlines } : {}) }); }} />}
    <section className="detail-total"><span>Total bruto</span><strong>{formatarMoeda(quote.grossTotal)}</strong><span>Descontos individuais</span><strong>- {formatarMoeda(individualDiscount)}</strong><span>Desconto geral</span><strong>- {formatarMoeda(quote.discountAmount)}</strong><span>Desconto total dado</span><strong>- {formatarMoeda(totalDiscountGiven)}</strong><b>Total do orçamento: {formatarMoeda(quote.netTotal)}</b>{recusados.length > 0 && <small className="detail-total-fora">{recusados.length === 1 ? '1 projeto não aprovado fica' : `${recusados.length} projetos não aprovados ficam`} fora do valor: {formatarMoeda(recusados.reduce((soma, item) => soma + item.total, 0))}</small>}</section>
  </main>;
}
