'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nomeArquivoPdf } from '@inova/domain';
import { Icone, ModalFiltros } from '../filtros/Filtros';
import { SeletorPecas, somaQuantidades, type QuantidadesPecas } from '../fluxo/SeletorPecas';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import { api, buscarArquivoApi } from '../../utilitarios/api';
import { medidaPeca, rotuloPecas } from '../../utilitarios/fluxo';
import './nota-entrega.css';

/** Peça do projeto com quantas unidades já foram entregues, estão prontas (produzidas) e ainda em produção. */
export type PecaEntrega = { key: string; name: string; material: string | null; lengthMm: number | null; widthMm: number | null; quantity: number; delivered: number; ready: number; inProduction: number };
export type NotaGerada = { id: string; number: string; createdAt: string; createdBy: string; pieces: number };
export type EntregasProjeto = { id: string; name: string; pieces: PecaEntrega[]; notes: NotaGerada[] };
/** `generalNotes`: notas de entrega gerais (todos os projetos de uma vez). */
export type EntregasOrcamento = { canDeliver: boolean; reason: string | null; projects: EntregasProjeto[]; generalNotes?: NotaGerada[] };
type NotaRegistrada = { id: string; number: string; quoteDelivered: boolean };

const soma = (pecas: PecaEntrega[], campo: (peca: PecaEntrega) => number) => pecas.reduce((total, peca) => total + campo(peca), 0);
const dataCurta = (valor: string) => new Date(valor).toLocaleDateString('pt-BR');

/** "Entregue 2 de 5 peças · faltam 3" — só aparece depois da primeira entrega. */
function SituacaoEntrega({ projeto }: { projeto: EntregasProjeto }) {
  const total = soma(projeto.pieces, (peca) => peca.quantity), entregues = soma(projeto.pieces, (peca) => peca.delivered);
  if (!entregues) return null;
  const faltam = total - entregues;
  return <small className={`entrega-situacao${faltam ? '' : ' completa'}`}><Icone nome="aprovado" tamanho={14} />
    {faltam ? `Entregue ${entregues} de ${total} peças · ${faltam === 1 ? 'falta 1' : `faltam ${faltam}`}` : `Todas as ${rotuloPecas(total)} entregues`}</small>;
}

/**
 * Nota de entrega do projeto: escolhe quantas peças está entregando (as prontas
 * vêm marcadas), registra a entrega — as peças vão para "Entregue" no Fluxo — e
 * abre o PDF com as que ainda faltam. As notas geradas podem ser reimpressas.
 */
export function NotaEntregaProjeto({ quoteId, customerName, projeto, canDeliver, reason, abrirAoCarregar = false, aoRegistrar }: {
  quoteId: string; customerName: string; projeto: EntregasProjeto; canDeliver: boolean; reason: string | null;
  abrirAoCarregar?: boolean; aoRegistrar: (nota: NotaRegistrada) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<QuantidadesPecas>({});
  const [salvando, setSalvando] = useState(false);
  const [imprimindo, setImprimindo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  // A janela vai direto no <body>: dentro do cartão do projeto ela herdaria os estilos dele.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const pendentes = projeto.pieces.filter((peca) => peca.quantity > peca.delivered);
  const escolhidas = somaQuantidades(valores);
  const abrir = () => {
    // Já vem marcado o que está produzido e ainda não foi entregue.
    setValores(Object.fromEntries(pendentes.map((peca) => [peca.key, Math.min(peca.ready, peca.quantity - peca.delivered)])));
    setErro(''); setAberto(true);
  };
  // Vindo do Fluxo ("Gerar nota de entrega"), a janela já abre.
  useEffect(() => { if (abrirAoCarregar) abrir(); }, [abrirAoCarregar]); // eslint-disable-line react-hooks/exhaustive-deps

  async function imprimir(nota: { id: string; number: string }) {
    setImprimindo(nota.id); setErro('');
    try { abrirPdf(await buscarArquivoApi(`/quotes/${quoteId}/entregas/${nota.id}/pdf`), nomeArquivoPdf(customerName, `${nota.number} - ${projeto.name}`)); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : 'Não foi possível abrir a nota de entrega.'); }
    finally { setImprimindo(null); }
  }
  async function gerar() {
    if (salvando || !escolhidas) return;
    setSalvando(true); setErro('');
    try {
      const nota = await api<NotaRegistrada>(`/quotes/${quoteId}/items/${projeto.id}/entregas`, { method: 'POST', body: JSON.stringify({ pieces: valores }) });
      setAberto(false);
      aoRegistrar(nota);
      await imprimir(nota);
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'Não foi possível registrar a entrega.');
    } finally { setSalvando(false); }
  }

  const detalhe = (peca: PecaEntrega) => [medidaPeca(peca), peca.material,
    peca.ready ? `${peca.ready} ${peca.ready === 1 ? 'pronta' : 'prontas'}` : '',
    peca.inProduction ? `${peca.inProduction} em produção` : '',
    peca.delivered ? `${peca.delivered} já ${peca.delivered === 1 ? 'entregue' : 'entregues'}` : ''].filter(Boolean).join(' · ');
  const podeGerar = canDeliver && pendentes.length > 0;
  return <>
    <button type="button" className="secondary-button nota-entrega-botao" onClick={abrir}><Icone nome="documento" tamanho={16} />Nota de entrega</button>
    <SituacaoEntrega projeto={projeto} />
    {erro && !aberto && <p role="alert" className="form-error">{erro}</p>}
    {montado && createPortal(<ModalFiltros aberto={aberto} aoFechar={() => { if (!salvando) setAberto(false); }} className="modal-pecas modal-nota-entrega" rotuloFechar="Fechar" titulo={`Nota de entrega · ${projeto.name}`}
      rodape={<><button type="button" className="botao-contorno" disabled={salvando} onClick={() => setAberto(false)}>{podeGerar ? 'Cancelar' : 'Fechar'}</button>
        {podeGerar && <button type="button" className="botao-destaque" disabled={salvando || !escolhidas} onClick={() => void gerar()}>{salvando ? 'Gerando…' : `Gerar nota · ${rotuloPecas(escolhidas)}`}</button>}</>}>
      {!canDeliver ? <p>{reason}</p>
        : !pendentes.length ? <p>Todas as peças deste projeto já foram entregues.</p>
        : <>
          <p>Selecione as peças entregues nesta etapa. Elas serão movidas para <strong>Entregue</strong> no Fluxo de trabalho, e a nota listará as pendentes.</p>
          <SeletorPecas rotulo="Peças entregues nesta nota" valores={valores} aoMudar={setValores}
            pecas={pendentes.map((peca) => ({ key: peca.key, name: peca.name, detail: detalhe(peca), max: peca.quantity - peca.delivered }))} />
        </>}
      {projeto.notes.length > 0 && <section className="nota-entrega-historico" aria-label="Notas já geradas">
        <strong>Notas já geradas</strong>
        <ul>{projeto.notes.map((nota) => <li key={nota.id}>
          <span><b>{nota.number}</b><small>{dataCurta(nota.createdAt)} · {rotuloPecas(nota.pieces)} · {nota.createdBy}</small></span>
          <button type="button" className="text-button" disabled={imprimindo === nota.id} onClick={() => void imprimir(nota)}>{imprimindo === nota.id ? 'Abrindo…' : 'Imprimir de novo'}</button>
        </li>)}</ul>
      </section>}
      {erro && <p role="alert" className="form-error">{erro}</p>}
    </ModalFiltros>, document.body)}
  </>;
}
