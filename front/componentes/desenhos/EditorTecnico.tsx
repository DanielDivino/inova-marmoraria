'use client';

import { CONSULTA_CELULAR } from '../../utilitarios/tela';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ajustarRecursosDeBorda, alterarMedidaLado, deletePiece, formatMeasure, marcarArea, NOME_AREA, nomeDaPeca, updatePiece, type EstimativaDesenho, type Piece, type PieceShape, type Point, type TechnicalDocument } from '@inova/domain/technical';
import { api } from '../../utilitarios/api';
import { useVoltarNoTopo } from '../ApplicationShell';
import { formatarMoeda } from '../../utilitarios/formatadores';
import { criarId } from '../../utilitarios/id';
import { JanelaArea, type MarcacaoArea } from './AreaSecaMolhada';
import { BarraFerramentas } from './BarraFerramentas';
import { CanvasPlanta } from './CanvasPlanta';
import { EditorLado } from './EditorLado';
import { JanelaTraco } from './JanelaTraco';
import { adicionarPeca, novaEmenda, novoRecursoBorda, novoRecursoCorpo } from './operacoes';
import { PainelEstimativa, ResumoEstimativa } from './PainelEstimativa';
import { PainelMedidas } from './PainelMedidas';
import { PainelRevisoes } from './PainelRevisoes';
import { ROTULO_RECURSO, type Ferramenta, type LadoEmEdicao, type Modo, type Selecao, type TipoCorpo, type TipoNoLado } from './tipos';
import { useDesenhoLivre } from './useDesenhoLivre';
import { useEstimativa } from './useEstimativa';
import { useDocumentoTecnico } from './useDocumentoTecnico';
import { confirmar } from '../Confirmacao';
import { ModalFiltros } from '../filtros/Filtros';
import '../../app/technical-editor.css';

type Folha = 'medidas' | 'valor' | 'revisoes' | null;
type Visao = '2D' | '3D' | 'AMBOS';
// three.js só no navegador e só quando a vista 3D é aberta.
const Vista3D = dynamic(() => import('./Vista3D'), { ssr: false, loading: () => <p className="tec-3d-vazio">Carregando a vista 3D…</p> });

/** Desenho aberto de dentro do Novo orçamento. */
export type DesenhoNoOrcamento = {
  /** Equipe técnica: envia para conferência e vê as revisões; o vendedor só desenha. */
  podeRevisar: boolean;
  aoVoltar: () => void;
  /** "Usar no orçamento": o rascunho já foi salvo nesta versão e a estimativa não tem pendências. */
  aoUsar: (dados: { designId: string; nome: string; versao: number; estimativa: EstimativaDesenho }) => void;
};

/**
 * Editor do desenho técnico. O documento (TechnicalDocument, em mm) é o mesmo
 * de antes: rascunho com versão, revisões, PDF técnico e DXF. Sozinho, não
 * muda o valor de nenhum orçamento; aberto do Novo orçamento (`noOrcamento`),
 * o valor dele vai para o resumo só quando o desenho é usado no orçamento.
 */
export default function EditorTecnico({ designId, noOrcamento, voltar: voltarPara }: { designId: string; noOrcamento?: DesenhoNoOrcamento; voltar?: { href: string; rotulo: string } }) {
  const tecnico = useDocumentoTecnico(designId);
  const { documento, dados } = tecnico;
  // Aberto sozinho (não dentro do Novo orçamento): a seta do celular volta ao orçamento.
  useVoltarNoTopo(noOrcamento ? null : { href: voltarPara?.href ?? '/orcamentos', rotulo: voltarPara?.rotulo ?? 'Orçamentos' });
  const [compacto, setCompacto] = useState(false);
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_CELULAR);
    const atualizar = () => { setCompacto(consulta.matches); setOpcoesAbertas(false); };
    atualizar(); consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('SELECIONAR');
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [pendenteBorda, setPendenteBorda] = useState<TipoNoLado | null>(null);
  const [lado, setLado] = useState<LadoEmEdicao>(null);
  const [cotaInicio, setCotaInicio] = useState<{ pieceId: string; vertexId: string } | null>(null);
  const [folha, setFolha] = useState<Folha>(null);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);
  const [modo, setModo] = useState<Modo>('MANUAL');
  const [anguloArea, setAnguloArea] = useState(0);
  const [passoMm, setPassoMm] = useState(10);
  const [visao, setVisao] = useState<Visao>('2D');
  // Estimativa começa fechada (só o total na barra); um toque abre.
  const [estimativaAberta, setEstimativaAberta] = useState(false);
  /** Área marcada no balcão esperando a escolha: seca ou molhada. */
  const [areaPendente, setAreaPendente] = useState<MarcacaoArea | null>(null);
  // Teclado: Delete apaga o que está selecionado; Esc cancela a área. A função muda a cada render (ref).
  const atalhos = useRef<(evento: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => atalhos.current(evento);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);
  const valor = useEstimativa(designId, documento);
  const livre = useDesenhoLivre({ documento, mudar: tecnico.mudar, aoSelecionar: (proxima) => { setSelecao(proxima); if (proxima?.tipo === 'peca') setFerramenta('SELECIONAR'); }, aoMensagem: tecnico.setMensagem, passoMm });
  // O modo escolhido fica lembrado neste aparelho (conveniência; sem ele, começa no manual).
  useEffect(() => { try { const salvo = window.localStorage.getItem('inova-desenho-modo'); if (salvo === 'LIVRE') { setModo('LIVRE'); setFerramenta('TRACO_PECA'); } } catch { /* sem armazenamento local */ } }, []);
  const trocarModo = (proximo: Modo) => {
    setOpcoesAbertas(false); setModo(proximo); setFerramenta(proximo === 'LIVRE' ? 'TRACO_PECA' : 'SELECIONAR'); setPendenteBorda(null); livre.descartar(); setFolha(null);
    try { window.localStorage.setItem('inova-desenho-modo', proximo); } catch { /* sem armazenamento local */ }
  };

  // Peça onde entram cubas, furos e faixas: a selecionada, a do componente/vértice selecionado ou a única que existe.
  const pecaAtiva = useMemo<Piece | undefined>(() => {
    if (!documento) return undefined;
    const id = selecao?.tipo === 'peca' ? selecao.id : selecao?.tipo === 'vertice' ? selecao.pecaId
      : selecao?.tipo === 'recurso' ? documento.features.find((recurso) => recurso.id === selecao.id)?.pieceId : undefined;
    return documento.pieces.find((peca) => peca.id === id) ?? (documento.pieces.length === 1 ? documento.pieces[0] : undefined);
  }, [documento, selecao]);

  if (!dados || !documento) return <main className="tec-carregando">{tecnico.mensagem || 'Abrindo o desenho técnico…'}</main>;
  const mudar = (proximo: TechnicalDocument) => tecnico.mudar(proximo);

  // No celular a folha aberta cobriria o desenho: ferramenta de desenho fecha a folha.
  const escolherFerramenta = (proxima: Ferramenta) => {
    setFerramenta(proxima); setPendenteBorda(null); setCotaInicio(null); setAreaPendente(null); if (proxima !== 'SELECIONAR') setFolha(null);
    tecnico.setMensagem(proxima === 'LINHA' ? 'Clique ou toque nas duas pontas, ou arraste para criar uma linha. Shift encaixa em 45°. Depois, descreva o significado.' : proxima === 'TEXTO' ? 'Toque no desenho para posicionar o texto.' : proxima === 'COTA' ? 'Toque no primeiro ponto da cota (um vértice de qualquer peça).'
      : proxima === 'AREA' ? 'Clique no início da área no balcão, arraste até o fim e clique novamente (ou arraste e solte). Em seguida, defina se a área é seca ou molhada.' : '');
  };
  // Delete (ou Backspace) apaga a peça, o componente ou o texto selecionado; Ctrl+Z desfaz.
  const apagarSelecionado = () => {
    if (selecao?.tipo === 'peca') {
      const peca = documento.pieces.find((entrada) => entrada.id === selecao.id);
      if (!peca) return false;
      if (peca.locked) { tecnico.setMensagem(`${nomeDaPeca(peca, documento.pieces)} está travada. Destrave-a para excluir.`); return true; }
      mudar(deletePiece(documento, peca.id)); setSelecao(null); tecnico.setMensagem(`${nomeDaPeca(peca, documento.pieces)} excluída. Use Ctrl+Z para desfazer.`);
      return true;
    }
    if (selecao?.tipo === 'recurso') {
      const recurso = documento.features.find((entrada) => entrada.id === selecao.id);
      if (!recurso) return false;
      mudar({ ...documento, features: documento.features.filter((entrada) => entrada.id !== recurso.id) }); setSelecao(null); tecnico.setMensagem(`${recurso.name} excluído. Use Ctrl+Z para desfazer.`);
      return true;
    }
    if (selecao?.tipo === 'texto') {
      mudar({ ...documento, annotations: documento.annotations.filter((entrada) => entrada.id !== selecao.id) }); setSelecao(null); tecnico.setMensagem('Texto excluído. Use Ctrl+Z para desfazer.');
      return true;
    }
    return false;
  };
  atalhos.current = (evento) => {
    const alvo = evento.target as HTMLElement | null;
    if (alvo && !document.querySelector('.tec-editor')?.contains(alvo)) return;
    if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
    if (evento.key === 'Escape' && areaPendente) { setAreaPendente(null); tecnico.setMensagem(''); return; }
    if (document.querySelector('dialog[open], [role="dialog"]')) return;
    if (evento.key === 'Escape') {
      setAreaPendente(null); livre.descartar(); escolherFerramenta('SELECIONAR'); setLado(null);
      return;
    }
    if (!evento.ctrlKey && !evento.metaKey && !evento.altKey) {
      const ferramentas: Record<string, Ferramenta> = { v: 'SELECIONAR', l: 'LINHA', t: 'TEXTO', a: 'AREA', c: 'COTA' };
      if (ferramentas[evento.key.toLowerCase()]) { evento.preventDefault(); escolherFerramenta(ferramentas[evento.key.toLowerCase()]); }
      if (evento.key === 'Enter' && pecaAtiva) { evento.preventDefault(); setFolha('medidas'); }
      if (evento.key.startsWith('Arrow') && pecaAtiva && !pecaAtiva.locked) {
        evento.preventDefault(); const passo = evento.shiftKey ? 100 : 10;
        mudar(updatePiece(documento, pecaAtiva.id, { x: pecaAtiva.x + (evento.key === 'ArrowRight' ? passo : evento.key === 'ArrowLeft' ? -passo : 0), y: pecaAtiva.y + (evento.key === 'ArrowUp' ? passo : evento.key === 'ArrowDown' ? -passo : 0) }));
      }
    }
    if ((evento.key === 'Delete' || evento.key === 'Backspace') && apagarSelecionado()) evento.preventDefault();
  };
  const escolherTipoArea = (tipo: 'DRY' | 'WET') => {
    const peca = areaPendente && documento.pieces.find((entrada) => entrada.id === areaPendente.pecaId);
    if (!areaPendente || !peca) return;
    setAreaPendente(null);
    if (peca.locked) { tecnico.setMensagem(`${nomeDaPeca(peca, documento.pieces)} está travada. Destrave-a para marcar áreas.`); return; }
    mudar(updatePiece(documento, peca.id, { wetDryZones: marcarArea(peca, areaPendente.inicio, areaPendente.fim, tipo, areaPendente.angulo) }));
    tecnico.setMensagem(`${NOME_AREA[tipo]} de ${formatMeasure(Math.abs(areaPendente.fim - areaPendente.inicio))} marcada em ${nomeDaPeca(peca, documento.pieces)}. Marque outra área ou utilize Selecionar para concluir.`);
  };
  const tocarVertice = (pieceId: string, vertexId: string) => {
    if (!cotaInicio) { setCotaInicio({ pieceId, vertexId }); tecnico.setMensagem('Toque no segundo ponto da cota.'); return; }
    if (cotaInicio.pieceId === pieceId && cotaInicio.vertexId === vertexId) return;
    mudar({ ...documento, dimensions: [...documento.dimensions, { id: criarId(), from: cotaInicio, to: { pieceId, vertexId }, offsetMm: 150, layerId: 'dimensions' }] });
    setCotaInicio(null); tecnico.setMensagem('Cota criada. Toque em outro ponto para criar uma nova cota ou utilize Selecionar para concluir.');
  };
  const adicionarForma = (forma: PieceShape) => {
    const id = criarId();
    mudar(adicionarPeca(documento, forma, id));
    setSelecao({ tipo: 'peca', id }); setFerramenta('SELECIONAR'); setPedidoEnquadrar((n) => n + 1);
  };
  const adicionarCorpo = (tipo: TipoCorpo) => {
    if (!pecaAtiva) return;
    const recurso = novoRecursoCorpo(pecaAtiva, tipo, criarId());
    mudar({ ...documento, features: [...documento.features, recurso] });
    setSelecao({ tipo: 'recurso', id: recurso.id }); setFolha('medidas');
  };
  const escolherBorda = (tipo: TipoNoLado) => {
    if (!pecaAtiva) return;
    setPendenteBorda((atual) => atual === tipo ? null : tipo);
    setSelecao({ tipo: 'peca', id: pecaAtiva.id });
    tecnico.setMensagem(tipo === 'SEAM'
      ? `Toque no lado de ${nomeDaPeca(pecaAtiva, documento.pieces)} onde a emenda começa: ela atravessa a peça e divide em pedras (a distância muda no painel).`
      : `Toque no lado de ${nomeDaPeca(pecaAtiva, documento.pieces)} em que deseja incluir ${ROTULO_RECURSO[tipo].toLowerCase()}.`);
  };
  const tocarLado = (pecaId: string, ladoId: string) => {
    const peca = documento.pieces.find((entrada) => entrada.id === pecaId);
    if (!peca) return;
    if (pendenteBorda === 'SEAM') {
      const emenda = novaEmenda(peca, ladoId, criarId());
      if (!emenda) { tecnico.setMensagem('A emenda começa num lado reto. Toque em outro lado.'); return; }
      mudar({ ...documento, features: [...documento.features, emenda] });
      setSelecao({ tipo: 'recurso', id: emenda.id }); setPendenteBorda(null); setFolha('medidas'); tecnico.setMensagem('');
      return;
    }
    if (pendenteBorda) {
      const recurso = novoRecursoBorda(peca, ladoId, pendenteBorda, criarId());
      mudar({ ...documento, features: [...documento.features, recurso] });
      setSelecao({ tipo: 'recurso', id: recurso.id }); setPendenteBorda(null); tecnico.setMensagem('');
      return;
    }
    setSelecao({ tipo: 'peca', id: pecaId }); setLado({ pecaId, ladoId });
  };
  const criarTexto = (ponto: Point) => {
    const id = criarId();
    mudar({ ...documento, annotations: [...documento.annotations, { id, text: 'Texto', x: Math.round(ponto.x), y: Math.round(ponto.y), layerId: 'annotations' }] });
    setSelecao({ tipo: 'texto', id }); setFerramenta('SELECIONAR'); setFolha('medidas'); tecnico.setMensagem('');
  };
  const revisa = !noOrcamento || noOrcamento.podeRevisar;
  const voltar = async () => {
    if (!noOrcamento) return;
    if (tecnico.alterado && !(await tecnico.salvar()) && !await confirmar({ titulo: 'Desenho não salvo', mensagem: 'Deseja voltar ao orçamento? As alterações não salvas serão perdidas.', confirmar: 'Voltar sem salvar', cancelar: 'Continuar no desenho', perigo: true })) return;
    noOrcamento.aoVoltar();
  };
  const usarNoOrcamento = async () => {
    setOpcoesAbertas(false);
    if (!noOrcamento || !valor.estimativa) return;
    if (valor.estimativa.problemas.length) {
      setFolha('valor'); setEstimativaAberta(true);
      tecnico.setMensagem(`Para usar no orçamento, resolva: ${valor.estimativa.problemas.slice(0, 3).join(' · ')}${valor.estimativa.problemas.length > 3 ? ' …' : ''}`);
      return;
    }
    const versao = await tecnico.salvar();
    if (versao === false) return;
    noOrcamento.aoUsar({ designId, nome: dados.design.project.name, versao, estimativa: valor.estimativa });
  };
  const enviarRevisao = async () => {
    if (!(await tecnico.salvar(documento))) return;
    try { await api(`/designs/${designId}/revisions`, { method: 'POST' }); await tecnico.recarregarRevisoes(); tecnico.setMensagem('Revisão enviada para conferência.'); }
    catch (causa) { tecnico.setMensagem(causa instanceof Error ? causa.message : 'Não foi possível enviar a revisão.'); }
  };

  const pecaDaArea = areaPendente ? documento.pieces.find((entrada) => entrada.id === areaPendente.pecaId) : undefined;
  const pecaDoLado = lado ? documento.pieces.find((peca) => peca.id === lado.pecaId) ?? null : null;
  const mudarPecaDoLado = (patch: (peca: Piece) => Partial<Piece>) => {
    if (!pecaDoLado || pecaDoLado.locked) return;
    mudar({ ...documento, pieces: documento.pieces.map((peca) => peca.id === pecaDoLado.id ? { ...peca, ...patch(peca) } : peca) });
  };
  const salvamento = { idle: tecnico.conflito ? 'Não salvo' : 'Rascunho', saving: 'Salvando…', saved: 'Salvo', error: 'Falha ao salvar' }[tecnico.salvamento];

  const controles = <>
    <header className="tec-cabecalho">
      <div>{noOrcamento ? <button type="button" className="text-button tec-voltar" onClick={() => void voltar()}>← Voltar ao orçamento</button> : <Link href={voltarPara?.href ?? '/orcamentos'}>← {voltarPara?.rotulo ?? 'Orçamentos'}</Link>}<p>{dados.design.project.job.customer.name}</p><h1>{dados.design.project.name}</h1></div>
      <div className="tec-salvar">
        <span className={`tec-estado ${tecnico.salvamento}`}>{salvamento}</span>
        <button type="button" className="botao-contorno" onClick={() => void tecnico.salvar()}>Salvar agora</button>
        {revisa && <button type="button" className={noOrcamento ? 'botao-contorno' : 'botao-destaque'} onClick={() => void enviarRevisao()}>Enviar para conferência</button>}
        {noOrcamento && <button type="button" className="botao-destaque tec-usar" disabled={!valor.estimativa || tecnico.salvamento === 'saving'} onClick={() => void usarNoOrcamento()}>
          Usar no orçamento{valor.estimativa ? ` · ${formatarMoeda(valor.estimativa.total)}` : ''}
        </button>}
      </div>
    </header>
    <div className="tec-barra-topo">
      <div className="tec-modos" role="group" aria-label="Modo de desenho">
        <button type="button" aria-pressed={modo === 'LIVRE'} onClick={() => trocarModo('LIVRE')}>✍ Desenho livre</button>
        <button type="button" aria-pressed={modo === 'MANUAL'} onClick={() => trocarModo('MANUAL')}>📐 Manual</button>
      </div>
      <div className="tec-vista-abas" role="group" aria-label="Vista">
        <button type="button" aria-pressed={visao === '2D'} onClick={() => { setOpcoesAbertas(false); setVisao('2D'); setPedidoEnquadrar((n) => n + 1); }}>Planta 2D</button>
        <button type="button" aria-pressed={visao === '3D'} onClick={() => { setOpcoesAbertas(false); setVisao('3D'); setPedidoEnquadrar((n) => n + 1); }}>3D</button>
        <button type="button" className="tec-so-desktop" aria-pressed={visao === 'AMBOS'} onClick={() => { setVisao('AMBOS'); setPedidoEnquadrar((n) => n + 1); }}>Lado a lado</button>
      </div>
      <span className="tec-regra">{noOrcamento ? 'O valor será incluído no orçamento somente ao selecionar “Usar no orçamento”. Até lá, o desenho permanece como rascunho do cliente.' : 'Alterações neste desenho não modificam o valor do orçamento.'}</span>
      <div className="tec-folhas" role="group" aria-label="Painéis">
        <button type="button" aria-pressed={folha === 'medidas'} onClick={() => { setOpcoesAbertas(false); setFolha((atual) => atual === 'medidas' ? null : 'medidas'); }}>Medidas</button>
        {revisa && <button type="button" aria-pressed={folha === 'revisoes'} onClick={() => { setOpcoesAbertas(false); setFolha((atual) => atual === 'revisoes' ? null : 'revisoes'); }}>Revisões</button>}
      </div>
    </div>
  </>;
  return <main className="tec-editor" data-folha={folha ?? undefined}>
    <nav className="tec-navegacao-compacta" aria-label="Controles do desenho">
      {noOrcamento ? <button type="button" aria-label="Voltar ao orçamento" onClick={() => void voltar()}>←</button> : <Link aria-label={voltarPara?.rotulo ?? 'Voltar aos orçamentos'} href={voltarPara?.href ?? '/orcamentos'}>←</Link>}
      <button type="button" className="tec-modo-compacto" onClick={() => setOpcoesAbertas(true)} aria-haspopup="dialog">{modo === 'LIVRE' ? '✍ Livre' : 'Manual'}<span aria-hidden="true">⌄</span></button>
      <span className={`tec-status-compacto ${tecnico.salvamento}`} role="status" aria-label={salvamento} title={salvamento}>●</span>
      <button type="button" aria-label={visao === '2D' ? 'Mostrar vista 3D' : 'Mostrar planta 2D'} onClick={() => { setVisao(visao === '2D' ? '3D' : '2D'); setPedidoEnquadrar(n => n + 1); }}>{visao === '2D' ? '2D' : '3D'}</button>
      <button type="button" aria-label="Abrir medidas" aria-pressed={folha === 'medidas'} onClick={() => setFolha(atual => atual === 'medidas' ? null : 'medidas')}>↔</button>
      <button type="button" aria-label="Opções do desenho" aria-haspopup="dialog" onClick={() => setOpcoesAbertas(true)}>•••</button>
    </nav>
    {compacto ? <ModalFiltros aberto={opcoesAbertas} aoFechar={() => setOpcoesAbertas(false)} titulo="Opções do desenho" rotuloFechar="Fechar opções" className="tec-opcoes-compactas" rodape={<button type="button" className="botao-destaque" onClick={() => setOpcoesAbertas(false)}>Voltar ao desenho</button>}>{controles}</ModalFiltros> : <div className="tec-controles-desktop">{controles}</div>}


    {tecnico.conflito && <p className="tec-alerta" role="alert">Este desenho foi alterado em outra sessão. Suas alterações não foram gravadas, para evitar a sobreposição. <button type="button" className="text-button" onClick={() => void tecnico.carregar()}>Recarregar o desenho salvo</button></p>}
    {tecnico.mensagem && !tecnico.conflito && <p className="tec-mensagem" role="status">{tecnico.mensagem}{pendenteBorda && <button type="button" className="text-button" onClick={() => { setPendenteBorda(null); tecnico.setMensagem(''); }}>Cancelar</button>}</p>}

    <div className="tec-area">
      <BarraFerramentas modo={modo} ferramenta={ferramenta} pendenteBorda={pendenteBorda} temPeca={!!pecaAtiva || documento.pieces.length > 0} podeDesfazer={tecnico.podeDesfazer} podeRefazer={tecnico.podeRefazer}
        temTraco={livre.temTraco} passoMm={passoMm} aoPasso={setPassoMm} aoDesfazerTraco={() => livre.temTraco ? livre.descartar() : tecnico.desfazer()} aoLimpar={livre.limpar}
        aoFerramenta={escolherFerramenta} aoAdicionarForma={adicionarForma} aoAdicionarCorpo={adicionarCorpo} aoEscolherBorda={escolherBorda} aoDesfazer={tecnico.desfazer} aoRefazer={tecnico.refazer} />

      <div className={`tec-vistas${visao === 'AMBOS' ? ' lado-a-lado' : ''}`}>
        {visao !== '3D' && <div className="tec-vista">
      {ferramenta === 'AREA' && <label className="tec-direcao-area">Direção da área
        <select value={anguloArea} onChange={e => { setAnguloArea(Number(e.target.value)); setAreaPendente(null); }}>
          <option value={0}>Da esquerda → direita</option><option value={180}>Da direita → esquerda</option>
          <option value={90}>De cima ↓ baixo</option><option value={-90}>De baixo ↑ cima</option>
          <option value={45}>Diagonal ↘</option><option value={135}>Diagonal ↙</option><option value={-45}>Diagonal ↗</option><option value={-135}>Diagonal ↖</option>
        </select></label>}
        <CanvasPlanta anguloArea={anguloArea} aoCriarLinha={(inicio, fim) => {
          const id = criarId(); mudar({ ...documento, annotations: [...documento.annotations, { id, text: 'Linha', fontSizeMm: 50, x: inicio.x, y: inicio.y, lineEnd: fim, layerId: 'annotations' }] });
          setSelecao({ tipo: 'texto', id }); setFerramenta('SELECIONAR'); setFolha('medidas'); tecnico.setMensagem('Descreva o significado da linha no campo de texto.');
        }} documento={documento} selecao={selecao} ferramenta={ferramenta} pendenteBorda={pendenteBorda} pedidoEnquadrar={pedidoEnquadrar}
          tracoPendente={livre.traco && { pontos: livre.traco.pontos, fechado: livre.traco.fechado, ladoReferencia: livre.traco.ladoReferencia }}
          aoSelecionar={(proxima) => { setSelecao(proxima); if (proxima) setFolha('medidas'); }} aoTocarLado={tocarLado} aoCriarTexto={criarTexto} aoTocarVertice={tocarVertice} cotaInicio={cotaInicio} aoTraco={livre.aoTraco} aoCancelarTraco={() => tecnico.setMensagem('Traço cancelado: use dois dedos para mover ou ampliar a vista.')} aoAviso={tecnico.setMensagem}
          aoMarcarArea={(pecaId, inicio, fim) => { setAreaPendente({ pecaId, inicio, fim, angulo: anguloArea }); tecnico.setMensagem(''); }} areaPendente={areaPendente}
          substituir={tecnico.substituir} concluirGesto={tecnico.concluirGesto} />
        <JanelaArea peca={pecaDaArea} nome={pecaDaArea ? nomeDaPeca(pecaDaArea, documento.pieces) : ''} marcacao={areaPendente}
          aoEscolher={escolherTipoArea} aoCancelar={() => { setAreaPendente(null); tecnico.setMensagem(''); }} />
        <JanelaTraco traco={livre.traco} recorte={livre.recorte} aoFechar={livre.fechar} aoDescartar={livre.descartar}
          aoCriarRecorte={livre.criarRecorte} />
        </div>}
        {visao !== '2D' && <div className="tec-vista"><Vista3D documento={documento} /></div>}
      </div>
      <aside className="tec-lateral" aria-label="Propriedades">
        <button type="button" className="tec-fechar-folha" aria-label="Fechar painel" onClick={() => setFolha(null)}>×</button>
        <div className={`tec-lateral-medidas${folha && folha !== 'medidas' ? ' tec-so-desktop' : ''}`}>
          <PainelMedidas documento={documento} selecao={selecao} materiais={tecnico.materiais} diagnosticos={tecnico.diagnosticos}
            aoMudar={mudar} aoSelecionar={setSelecao} aoAbrirLado={(pecaId, ladoId) => setLado({ pecaId, ladoId })} aoMarcarArea={() => escolherFerramenta('AREA')} />
        </div>
        {revisa && folha === 'revisoes' && <div className="tec-so-celular"><PainelRevisoes revisoes={tecnico.revisoes} aoAtualizar={tecnico.recarregarRevisoes} aoMensagem={tecnico.setMensagem} /></div>}
        {/* Estimativa: fixa no rodapé do painel no desktop (recolhível); no celular abre pela barra de baixo. */}
        <div className="tec-lateral-estimativa">
          <div className="tec-so-desktop"><ResumoEstimativa estimativa={valor.estimativa} aberto={estimativaAberta} aoAlternar={() => setEstimativaAberta((aberta) => !aberta)} /></div>
          {(estimativaAberta || folha === 'valor') && <div className={`tec-estimativa-corpo${estimativaAberta && folha === 'valor' ? '' : estimativaAberta ? ' tec-so-desktop' : ' tec-so-celular'}`}>
            <PainelEstimativa documento={documento} catalogo={valor.catalogo} estimativa={valor.estimativa} opcoes={valor.opcoes} erro={valor.erro} aoMudarOpcoes={valor.mudarOpcoes} m2Fechado={valor.m2Fechado} noOrcamento={!!noOrcamento} />
          </div>}
        </div>
      </aside>
    </div>
    <div className="tec-so-celular tec-barra-estimativa"><ResumoEstimativa estimativa={valor.estimativa} aberto={folha === 'valor'} aoAlternar={() => setFolha((atual) => atual === 'valor' ? null : 'valor')} /></div>
    {revisa && <div className="tec-so-desktop"><PainelRevisoes revisoes={tecnico.revisoes} aoAtualizar={tecnico.recarregarRevisoes} aoMensagem={tecnico.setMensagem} /></div>}
    <EditorLado recursos={documento.features.filter(recurso => recurso.pieceId === lado?.pecaId && recurso.edgeId === lado?.ladoId)}
      aoMudarRecurso={(id, patch) => {
        if (!pecaDoLado || pecaDoLado.locked) return;
        mudar({ ...documento, features: documento.features.map(recurso => recurso.id === id ? { ...recurso, ...patch } : recurso) });
      }}
      aoExcluirRecurso={id => {
        if (!pecaDoLado || pecaDoLado.locked) return;
        mudar({ ...documento, features: documento.features.filter(recurso => recurso.id !== id) });
        if (selecao?.tipo === 'recurso' && selecao.id === id) setSelecao({ tipo: 'peca', id: pecaDoLado.id });
      }} aoAdicionar={(tipo, perfil) => {
      if (!pecaDoLado || !lado || pecaDoLado.locked) return;
      const recurso = tipo === 'SEAM' ? novaEmenda(pecaDoLado, lado.ladoId, criarId()) : novoRecursoBorda(pecaDoLado, lado.ladoId, tipo, criarId());
      if (!recurso) { tecnico.setMensagem('Escolha um lado reto para a emenda.'); return; }
      if (perfil) recurso.profile = perfil;
      mudar({ ...documento, features: [...documento.features, recurso] });
      setSelecao({ tipo: 'recurso', id: recurso.id });
    }} peca={pecaDoLado} ladoId={lado?.ladoId ?? null} aoFechar={() => setLado(null)}
      aoMudarMedida={(mm) => {
        if (!pecaDoLado || !lado) return null;
        const resultado = alterarMedidaLado(pecaDoLado.contour, lado.ladoId, mm, pecaDoLado.lockedEdges);
        if ('erro' in resultado) return resultado.erro;
        const atualizado = updatePiece(documento, pecaDoLado.id, { contour: resultado.contorno, geometryMode: 'FREE', parameters: undefined });
        if (atualizado === documento) return 'Peça travada. Destrave-a para alterar a medida.';
        mudar(ajustarRecursosDeBorda(atualizado, atualizado.pieces.find((peca) => peca.id === pecaDoLado.id)!));
        return null;
      }}
      aoMudarTexto={(texto) => mudarPecaDoLado((peca) => {
        const dimensionLabels = { ...peca.dimensionLabels };
        if (texto.trim()) dimensionLabels[lado!.ladoId] = texto.trim(); else delete dimensionLabels[lado!.ladoId];
        return { dimensionLabels };
      })}
      aoAlternarTrava={() => mudarPecaDoLado((peca) => ({ lockedEdges: peca.lockedEdges.includes(lado!.ladoId) ? peca.lockedEdges.filter((id) => id !== lado!.ladoId) : [...peca.lockedEdges, lado!.ladoId] }))} />
  </main>;
}
