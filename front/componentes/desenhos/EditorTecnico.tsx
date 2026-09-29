'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ajustarRecursosDeBorda, alterarMedidaLado, deletePiece, formatMeasure, marcarArea, NOME_AREA, updatePiece, type EstimativaDesenho, type Piece, type PieceShape, type Point, type TechnicalDocument } from '@inova/domain/technical';
import { api } from '../../utilitarios/api';
import { formatarMoeda } from '../../utilitarios/formatadores';
import { criarId } from '../../utilitarios/id';
import { JanelaArea, type MarcacaoArea } from './AreaSecaMolhada';
import { BarraFerramentas } from './BarraFerramentas';
import { CanvasPlanta } from './CanvasPlanta';
import { EditorLado } from './EditorLado';
import { JanelaTraco } from './JanelaTraco';
import { adicionarPeca, novoRecursoBorda, novoRecursoCorpo } from './operacoes';
import { PainelEstimativa, ResumoEstimativa } from './PainelEstimativa';
import { PainelMedidas } from './PainelMedidas';
import { PainelRevisoes } from './PainelRevisoes';
import { ROTULO_RECURSO, type Ferramenta, type LadoEmEdicao, type Modo, type Selecao, type TipoBorda, type TipoCorpo } from './tipos';
import { useDesenhoLivre } from './useDesenhoLivre';
import { useEstimativa } from './useEstimativa';
import { useDocumentoTecnico } from './useDocumentoTecnico';
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
export default function EditorTecnico({ designId, noOrcamento }: { designId: string; noOrcamento?: DesenhoNoOrcamento }) {
  const tecnico = useDocumentoTecnico(designId);
  const { documento, dados } = tecnico;
  const [ferramenta, setFerramenta] = useState<Ferramenta>('SELECIONAR');
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [pendenteBorda, setPendenteBorda] = useState<TipoBorda | null>(null);
  const [lado, setLado] = useState<LadoEmEdicao>(null);
  const [cotaInicio, setCotaInicio] = useState<{ pieceId: string; vertexId: string } | null>(null);
  const [folha, setFolha] = useState<Folha>(null);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);
  const [modo, setModo] = useState<Modo>('MANUAL');
  const [passoMm, setPassoMm] = useState(10);
  const [visao, setVisao] = useState<Visao>('2D');
  const [estimativaAberta, setEstimativaAberta] = useState(true);
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
  const livre = useDesenhoLivre({ documento, mudar: tecnico.mudar, aoSelecionar: setSelecao, aoMensagem: tecnico.setMensagem, passoMm });
  // O modo escolhido fica lembrado neste aparelho (conveniência; sem ele, começa no manual).
  useEffect(() => { try { const salvo = window.localStorage.getItem('inova-desenho-modo'); if (salvo === 'LIVRE') { setModo('LIVRE'); setFerramenta('TRACO_PECA'); } } catch { /* sem armazenamento local */ } }, []);
  const trocarModo = (proximo: Modo) => {
    setModo(proximo); setFerramenta(proximo === 'LIVRE' ? 'TRACO_PECA' : 'SELECIONAR'); setPendenteBorda(null); livre.descartar(); setFolha(null);
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
    tecnico.setMensagem(proxima === 'TEXTO' ? 'Toque no desenho onde vai o texto.' : proxima === 'COTA' ? 'Toque no primeiro ponto da cota (um vértice de qualquer peça).'
      : proxima === 'AREA' ? 'Clique no balcão onde a área começa, puxe até onde ela termina e clique de novo (ou arraste e solte). Depois escolha seca ou molhada.' : '');
  };
  // Delete (ou Backspace) apaga a peça, o componente ou o texto selecionado; Ctrl+Z desfaz.
  const apagarSelecionado = () => {
    if (selecao?.tipo === 'peca') {
      const peca = documento.pieces.find((entrada) => entrada.id === selecao.id);
      if (!peca) return false;
      if (peca.locked) { tecnico.setMensagem(`${peca.name} está travada: destrave para excluir.`); return true; }
      mudar(deletePiece(documento, peca.id)); setSelecao(null); tecnico.setMensagem(`${peca.name} excluída. Ctrl+Z desfaz.`);
      return true;
    }
    if (selecao?.tipo === 'recurso') {
      const recurso = documento.features.find((entrada) => entrada.id === selecao.id);
      if (!recurso) return false;
      mudar({ ...documento, features: documento.features.filter((entrada) => entrada.id !== recurso.id) }); setSelecao(null); tecnico.setMensagem(`${recurso.name} excluído. Ctrl+Z desfaz.`);
      return true;
    }
    if (selecao?.tipo === 'texto') {
      mudar({ ...documento, annotations: documento.annotations.filter((entrada) => entrada.id !== selecao.id) }); setSelecao(null); tecnico.setMensagem('Texto excluído. Ctrl+Z desfaz.');
      return true;
    }
    return false;
  };
  atalhos.current = (evento) => {
    const alvo = evento.target as HTMLElement | null;
    if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (evento.key === 'Escape') {
      if (areaPendente) { setAreaPendente(null); tecnico.setMensagem(''); } else if (ferramenta === 'AREA') escolherFerramenta('SELECIONAR');
      return;
    }
    if ((evento.key === 'Delete' || evento.key === 'Backspace') && apagarSelecionado()) evento.preventDefault();
  };
  const escolherTipoArea = (tipo: 'DRY' | 'WET') => {
    const peca = areaPendente && documento.pieces.find((entrada) => entrada.id === areaPendente.pecaId);
    if (!areaPendente || !peca) return;
    setAreaPendente(null);
    if (peca.locked) { tecnico.setMensagem(`${peca.name} está travada: destrave para marcar áreas.`); return; }
    mudar(updatePiece(documento, peca.id, { wetDryZones: marcarArea(peca, areaPendente.inicio, areaPendente.fim, tipo) }));
    tecnico.setMensagem(`${NOME_AREA[tipo]} de ${formatMeasure(Math.abs(areaPendente.fim - areaPendente.inicio))} marcada em ${peca.name}. Marque outra ou volte a Selecionar.`);
  };
  const tocarVertice = (pieceId: string, vertexId: string) => {
    if (!cotaInicio) { setCotaInicio({ pieceId, vertexId }); tecnico.setMensagem('Agora toque no segundo ponto da cota.'); return; }
    if (cotaInicio.pieceId === pieceId && cotaInicio.vertexId === vertexId) return;
    mudar({ ...documento, dimensions: [...documento.dimensions, { id: criarId(), from: cotaInicio, to: { pieceId, vertexId }, offsetMm: 150, layerId: 'dimensions' }] });
    setCotaInicio(null); tecnico.setMensagem('Cota criada. Toque em outro ponto para criar mais uma, ou em Selecionar para sair.');
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
  const escolherBorda = (tipo: TipoBorda) => {
    if (!pecaAtiva) return;
    setPendenteBorda((atual) => atual === tipo ? null : tipo);
    setSelecao({ tipo: 'peca', id: pecaAtiva.id });
    tecnico.setMensagem(`Toque no lado de ${pecaAtiva.name} onde vai ${ROTULO_RECURSO[tipo].toLowerCase()}.`);
  };
  const tocarLado = (pecaId: string, ladoId: string) => {
    const peca = documento.pieces.find((entrada) => entrada.id === pecaId);
    if (!peca) return;
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
    if (tecnico.alterado && !(await tecnico.salvar()) && !window.confirm('O desenho não foi salvo. Voltar ao orçamento mesmo assim?')) return;
    noOrcamento.aoVoltar();
  };
  const usarNoOrcamento = async () => {
    if (!noOrcamento || !valor.estimativa) return;
    if (valor.estimativa.problemas.length) {
      setFolha('valor');
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

  const pecaDoLado = lado ? documento.pieces.find((peca) => peca.id === lado.pecaId) ?? null : null;
  const mudarPecaDoLado = (patch: (peca: Piece) => Partial<Piece>) => {
    if (!pecaDoLado) return;
    mudar({ ...documento, pieces: documento.pieces.map((peca) => peca.id === pecaDoLado.id ? { ...peca, ...patch(peca) } : peca) });
  };
  const salvamento = { idle: tecnico.conflito ? 'Não salvo' : 'Rascunho', saving: 'Salvando…', saved: 'Salvo', error: 'Falha ao salvar' }[tecnico.salvamento];

  return <main className="tec-editor" data-folha={folha ?? undefined}>
    <header className="tec-cabecalho">
      <div>{noOrcamento ? <button type="button" className="text-button tec-voltar" onClick={() => void voltar()}>← Voltar ao orçamento</button> : <Link href="/orcamentos">← Orçamentos</Link>}<p>{dados.design.project.job.customer.name}</p><h1>{dados.design.project.name}</h1></div>
      <div className="tec-salvar">
        <span className={`tec-estado ${tecnico.salvamento}`}>{salvamento}</span>
        <button type="button" className="botao-contorno" onClick={() => void tecnico.salvar()}>Salvar agora</button>
        {revisa && <button type="button" className={noOrcamento ? 'botao-contorno' : 'botao-destaque'} onClick={() => void enviarRevisao()}>Enviar para conferência</button>}
        {noOrcamento && <button type="button" className="botao-destaque tec-usar" disabled={!valor.estimativa || tecnico.salvamento === 'saving'} onClick={() => void usarNoOrcamento()}>
          Usar no orçamento{valor.estimativa ? ` · ${formatarMoeda(valor.estimativa.total)}` : ''}
        </button>}
      </div>
    </header>
    {tecnico.conflito && <p className="tec-alerta" role="alert">Este desenho foi alterado em outra sessão. Suas mudanças não foram salvas por cima. <button type="button" className="text-button" onClick={() => void tecnico.carregar()}>Recarregar o desenho salvo</button></p>}
    {tecnico.mensagem && !tecnico.conflito && <p className="tec-mensagem" role="status">{tecnico.mensagem}{pendenteBorda && <button type="button" className="text-button" onClick={() => { setPendenteBorda(null); tecnico.setMensagem(''); }}>Cancelar</button>}</p>}
    <div className="tec-barra-topo">
      <div className="tec-modos" role="group" aria-label="Modo de desenho">
        <button type="button" aria-pressed={modo === 'LIVRE'} onClick={() => trocarModo('LIVRE')}>✍ Desenho livre</button>
        <button type="button" aria-pressed={modo === 'MANUAL'} onClick={() => trocarModo('MANUAL')}>📐 Manual</button>
      </div>
      <div className="tec-vista-abas" role="group" aria-label="Vista">
        <button type="button" aria-pressed={visao === '2D'} onClick={() => { setVisao('2D'); setPedidoEnquadrar((n) => n + 1); }}>Planta 2D</button>
        <button type="button" aria-pressed={visao === '3D'} onClick={() => { setVisao('3D'); setPedidoEnquadrar((n) => n + 1); }}>3D</button>
        <button type="button" className="tec-so-desktop" aria-pressed={visao === 'AMBOS'} onClick={() => { setVisao('AMBOS'); setPedidoEnquadrar((n) => n + 1); }}>Lado a lado</button>
      </div>
      <span className="tec-regra">{noOrcamento ? 'O valor só vai para o orçamento quando você clicar em Usar no orçamento; até lá, fica como rascunho do cliente.' : 'As alterações deste desenho não alteram o valor do orçamento.'}</span>
      <div className="tec-folhas" role="group" aria-label="Painéis">
        <button type="button" aria-pressed={folha === 'medidas'} onClick={() => setFolha((atual) => atual === 'medidas' ? null : 'medidas')}>Medidas</button>
        {revisa && <button type="button" aria-pressed={folha === 'revisoes'} onClick={() => setFolha((atual) => atual === 'revisoes' ? null : 'revisoes')}>Revisões</button>}
      </div>
    </div>
    <div className="tec-area">
      <BarraFerramentas modo={modo} ferramenta={ferramenta} pendenteBorda={pendenteBorda} temPeca={!!pecaAtiva || documento.pieces.length > 0} podeDesfazer={tecnico.podeDesfazer} podeRefazer={tecnico.podeRefazer}
        temTraco={livre.temTraco} passoMm={passoMm} aoPasso={setPassoMm} aoDesfazerTraco={() => livre.temTraco ? livre.descartar() : tecnico.desfazer()} aoLimpar={livre.limpar}
        aoFerramenta={escolherFerramenta} aoAdicionarForma={adicionarForma} aoAdicionarCorpo={adicionarCorpo} aoEscolherBorda={escolherBorda} aoDesfazer={tecnico.desfazer} aoRefazer={tecnico.refazer} />
      <div className={`tec-vistas${visao === 'AMBOS' ? ' lado-a-lado' : ''}`}>
        {visao !== '3D' && <div className="tec-vista">
        <CanvasPlanta documento={documento} selecao={selecao} ferramenta={ferramenta} pendenteBorda={pendenteBorda} pedidoEnquadrar={pedidoEnquadrar}
          tracoPendente={livre.traco && { pontos: livre.traco.pontos, fechado: livre.traco.fechado, ladoReferencia: livre.traco.ladoReferencia }}
          aoSelecionar={setSelecao} aoTocarLado={tocarLado} aoCriarTexto={criarTexto} aoTocarVertice={tocarVertice} cotaInicio={cotaInicio} aoTraco={livre.aoTraco} aoCancelarTraco={() => tecnico.setMensagem('Traço cancelado: dois dedos na tela mexem na vista.')} aoAviso={tecnico.setMensagem}
          aoMarcarArea={(pecaId, inicio, fim) => { setAreaPendente({ pecaId, inicio, fim }); tecnico.setMensagem(''); }} areaPendente={areaPendente}
          substituir={tecnico.substituir} concluirGesto={tecnico.concluirGesto} />
        <JanelaArea peca={areaPendente ? documento.pieces.find((entrada) => entrada.id === areaPendente.pecaId) : undefined} marcacao={areaPendente}
          aoEscolher={escolherTipoArea} aoCancelar={() => { setAreaPendente(null); tecnico.setMensagem(''); }} />
        <JanelaTraco traco={livre.traco} recorte={livre.recorte} aoFechar={livre.fechar} aoTrocarLado={livre.trocarLado} aoDescartar={livre.descartar}
          aoCriarPeca={(mm) => { const erro = livre.criarPeca(mm); if (!erro) setFerramenta('SELECIONAR'); return erro; }} aoCriarRecorte={livre.criarRecorte} />
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
    <EditorLado peca={pecaDoLado} ladoId={lado?.ladoId ?? null} aoFechar={() => setLado(null)}
      aoMudarMedida={(mm) => {
        if (!pecaDoLado || !lado) return null;
        const resultado = alterarMedidaLado(pecaDoLado.contour, lado.ladoId, mm, pecaDoLado.lockedEdges);
        if ('erro' in resultado) return resultado.erro;
        const atualizado = updatePiece(documento, pecaDoLado.id, { contour: resultado.contorno, geometryMode: 'FREE', parameters: undefined });
        if (atualizado === documento) return 'Peça travada: destrave para mudar a medida.';
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
