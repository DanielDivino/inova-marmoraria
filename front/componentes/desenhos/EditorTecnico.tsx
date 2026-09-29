'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ajustarRecursosDeBorda, alterarMedidaLado, updatePiece, type Piece, type PieceShape, type Point, type TechnicalDocument } from '@inova/domain/technical';
import { api } from '../../utilitarios/api';
import { criarId } from '../../utilitarios/id';
import { BarraFerramentas } from './BarraFerramentas';
import { CanvasPlanta } from './CanvasPlanta';
import { EditorLado } from './EditorLado';
import { JanelaTraco } from './JanelaTraco';
import { adicionarPeca, novoRecursoBorda, novoRecursoCorpo } from './operacoes';
import { PainelMedidas } from './PainelMedidas';
import { PainelRevisoes } from './PainelRevisoes';
import { ROTULO_RECURSO, type Ferramenta, type LadoEmEdicao, type Modo, type Selecao, type TipoBorda, type TipoCorpo } from './tipos';
import { useDesenhoLivre } from './useDesenhoLivre';
import { useDocumentoTecnico } from './useDocumentoTecnico';
import '../../app/technical-editor.css';

type Folha = 'medidas' | 'valor' | 'revisoes' | null;
type Visao = '2D' | '3D' | 'AMBOS';
// three.js só no navegador e só quando a vista 3D é aberta.
const Vista3D = dynamic(() => import('./Vista3D'), { ssr: false, loading: () => <p className="tec-3d-vazio">Carregando a vista 3D…</p> });

/**
 * Editor do desenho técnico. O documento (TechnicalDocument, em mm) é o mesmo
 * de antes: rascunho com versão, revisões, PDF técnico e DXF. O valor do
 * orçamento nunca muda por causa do desenho.
 */
export default function EditorTecnico({ designId }: { designId: string }) {
  const tecnico = useDocumentoTecnico(designId);
  const { documento, dados } = tecnico;
  const [ferramenta, setFerramenta] = useState<Ferramenta>('SELECIONAR');
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [pendenteBorda, setPendenteBorda] = useState<TipoBorda | null>(null);
  const [lado, setLado] = useState<LadoEmEdicao>(null);
  const [folha, setFolha] = useState<Folha>(null);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);
  const [modo, setModo] = useState<Modo>('MANUAL');
  const [passoMm, setPassoMm] = useState(10);
  const [visao, setVisao] = useState<Visao>('2D');
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
  const escolherFerramenta = (proxima: Ferramenta) => { setFerramenta(proxima); setPendenteBorda(null); if (proxima !== 'SELECIONAR') setFolha(null); tecnico.setMensagem(proxima === 'TEXTO' ? 'Toque no desenho onde vai o texto.' : ''); };
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
      <div><Link href="/orcamentos">← Orçamentos</Link><p>{dados.design.project.job.customer.name}</p><h1>{dados.design.project.name}</h1></div>
      <div className="tec-salvar">
        <span className={`tec-estado ${tecnico.salvamento}`}>{salvamento}</span>
        <button type="button" className="botao-contorno" onClick={() => void tecnico.salvar()}>Salvar agora</button>
        <button type="button" className="botao-destaque" onClick={() => void enviarRevisao()}>Enviar para conferência</button>
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
      <span className="tec-regra">As alterações deste desenho não alteram o valor do orçamento.</span>
      <div className="tec-folhas" role="group" aria-label="Painéis">
        <button type="button" aria-pressed={folha === 'medidas'} onClick={() => setFolha((atual) => atual === 'medidas' ? null : 'medidas')}>Medidas</button>
        <button type="button" aria-pressed={folha === 'revisoes'} onClick={() => setFolha((atual) => atual === 'revisoes' ? null : 'revisoes')}>Revisões</button>
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
          aoSelecionar={setSelecao} aoTocarLado={tocarLado} aoCriarTexto={criarTexto} aoTraco={livre.aoTraco} aoCancelarTraco={() => tecnico.setMensagem('Traço cancelado: dois dedos na tela mexem na vista.')}
          substituir={tecnico.substituir} concluirGesto={tecnico.concluirGesto} />
        <JanelaTraco traco={livre.traco} recorte={livre.recorte} aoFechar={livre.fechar} aoTrocarLado={livre.trocarLado} aoDescartar={livre.descartar}
          aoCriarPeca={(mm) => { const erro = livre.criarPeca(mm); if (!erro) setFerramenta('SELECIONAR'); return erro; }} aoCriarRecorte={livre.criarRecorte} />
        </div>}
        {visao !== '2D' && <div className="tec-vista"><Vista3D documento={documento} /></div>}
      </div>
      <aside className="tec-lateral" aria-label="Propriedades">
        <button type="button" className="tec-fechar-folha" aria-label="Fechar painel" onClick={() => setFolha(null)}>×</button>
        <div className={folha === 'revisoes' ? 'tec-so-desktop' : undefined}>
          <PainelMedidas documento={documento} selecao={selecao} materiais={tecnico.materiais} diagnosticos={tecnico.diagnosticos}
            aoMudar={mudar} aoSelecionar={setSelecao} aoAbrirLado={(pecaId, ladoId) => setLado({ pecaId, ladoId })} />
        </div>
        {folha === 'revisoes' && <div className="tec-so-celular"><PainelRevisoes revisoes={tecnico.revisoes} aoAtualizar={tecnico.recarregarRevisoes} aoMensagem={tecnico.setMensagem} /></div>}
      </aside>
    </div>
    <div className="tec-so-desktop"><PainelRevisoes revisoes={tecnico.revisoes} aoAtualizar={tecnico.recarregarRevisoes} aoMensagem={tecnico.setMensagem} /></div>
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
