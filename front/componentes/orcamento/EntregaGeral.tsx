'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nomeArquivoPdf } from '@inova/domain';
import { Icone, ModalFiltros } from '../filtros/Filtros';
import { SeletorPecas, somaQuantidades, type QuantidadesPecas } from '../fluxo/SeletorPecas';
import { abrirPdf } from '../../utilitarios/abrir-pdf';
import { api, buscarArquivoApi } from '../../utilitarios/api';
import { medidaPeca, rotuloPecas } from '../../utilitarios/fluxo';
import type { EntregasOrcamento, EntregasProjeto, PecaEntrega } from './NotaEntregaProjeto';
import { abrirNotaConferencia } from './IndicadorEntrega';
import './nota-entrega.css';

type NotaRegistrada = { id: string; number: string; quoteDelivered: boolean };
type Escolha = Record<string, QuantidadesPecas>;
const soma = (pecas: PecaEntrega[], campo: (peca: PecaEntrega) => number) => pecas.reduce((total, peca) => total + campo(peca), 0);
const pendentes = (projeto: EntregasProjeto) => projeto.pieces.filter((peca) => peca.quantity > peca.delivered);
const falta = (peca: PecaEntrega) => peca.quantity - peca.delivered;
const dataCurta = (valor: string) => new Date(valor).toLocaleDateString('pt-BR');
/** Marcação inicial e atalhos: as prontas, todas as que faltam ou nenhuma. */
const marcar = (projetos: EntregasProjeto[], quanto: (peca: PecaEntrega) => number): Escolha =>
  Object.fromEntries(projetos.map((projeto) => [projeto.id, Object.fromEntries(pendentes(projeto).map((peca) => [peca.key, Math.min(quanto(peca), falta(peca))]))]));

/**
 * Entrega geral ("Marcar como entregue"): todos os projetos, com as peças e medidas, para marcar
 * o que foi entregue (as prontas vêm marcadas; "Todas" marca tudo). Gera uma nota de entrega geral
 * com, de cada projeto, o entregue agora, o já entregue e o que falta; as peças marcadas vão para
 * "Entregue" no Fluxo. Entregue tudo, o orçamento vai para o Histórico.
 */
export function EntregaGeral({ quoteId, quoteNumber, customerName, entregas, aberta, aoFechar, aoRegistrar, aoEntregarSemNota }: {
  quoteId: string; quoteNumber: string; customerName: string; entregas: EntregasOrcamento | null; aberta: boolean;
  aoFechar: () => void; aoRegistrar: (nota: NotaRegistrada) => void;
  /** Sem poder registrar entregas (serviço não iniciado ou parado): concluir sem nota, como antes. */
  aoEntregarSemNota?: () => void;
}) {
  const [escolha, setEscolha] = useState<Escolha>({});
  const [salvando, setSalvando] = useState(false);
  const [imprimindo, setImprimindo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const projetos = entregas?.projects ?? [];
  // Ao abrir, já vem marcado o que está produzido e ainda não foi entregue.
  useEffect(() => { if (aberta) { setEscolha(marcar(projetos, (peca) => peca.ready)); setErro(''); } }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  const todas = projetos.flatMap((projeto) => projeto.pieces);
  const total = soma(todas, (peca) => peca.quantity), entregues = soma(todas, (peca) => peca.delivered);
  const prontas = soma(todas, (peca) => Math.min(peca.ready, falta(peca))), emProducao = soma(todas, (peca) => peca.inProduction);
  const escolhidas = Object.values(escolha).reduce((soma_, valores) => soma_ + somaQuantidades(valores), 0);
  const faltam = total - entregues;
  const podeGerar = !!entregas?.canDeliver && faltam > 0;

  async function imprimir(nota: { id: string; number: string }) {
    setImprimindo(nota.id); setErro('');
    try { abrirPdf(await buscarArquivoApi(`/quotes/${quoteId}/entregas/${nota.id}/pdf`), nomeArquivoPdf(customerName, `${nota.number} - Nota de entrega geral`)); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : 'Não foi possível abrir a nota de entrega.'); }
    finally { setImprimindo(null); }
  }
  async function conferencia() {
    setImprimindo('conferencia'); setErro('');
    try { await abrirNotaConferencia({ quoteId, quoteNumber, customerName }); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : 'Não foi possível gerar a nota de conferência.'); }
    finally { setImprimindo(null); }
  }
  async function gerar() {
    if (salvando || !escolhidas) return;
    setSalvando(true); setErro('');
    try {
      const corpo = Object.fromEntries(Object.entries(escolha).filter(([, valores]) => somaQuantidades(valores) > 0));
      const nota = await api<NotaRegistrada>(`/quotes/${quoteId}/entregas`, { method: 'POST', body: JSON.stringify({ projects: corpo }) });
      aoFechar();
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
  const notas = entregas?.generalNotes ?? [];

  if (!montado) return null;
  return createPortal(<ModalFiltros aberto={aberta} aoFechar={() => { if (!salvando) aoFechar(); }} className="modal-pecas modal-entrega-geral" rotuloFechar="Fechar" largura="grande"
    titulo={`Entrega geral · ${quoteNumber}`} subtitulo="Todos os projetos: marque o que foi entregue; o resto fica como pendente na nota."
    rodape={<>{entregas && <button type="button" className="botao-contorno entrega-geral-conferencia" disabled={salvando || imprimindo === 'conferencia'} onClick={() => void conferencia()}
        title="O que já foi entregue e o que falta, como está agora"><Icone nome="documento" tamanho={16} />{imprimindo === 'conferencia' ? 'Gerando…' : 'Nota de conferência'}</button>}
      <button type="button" className="botao-contorno" disabled={salvando} onClick={aoFechar}>{podeGerar ? 'Cancelar' : 'Fechar'}</button>
      {podeGerar && <button type="button" className="botao-destaque" disabled={salvando || !escolhidas} onClick={() => void gerar()}>{salvando ? 'Gerando…' : `Gerar nota geral · ${rotuloPecas(escolhidas)}`}</button>}
      {!entregas?.canDeliver && aoEntregarSemNota && <button type="button" className="botao-destaque" onClick={() => { aoFechar(); aoEntregarSemNota(); }}>Marcar entregue sem nota</button>}</>}>
    {!entregas ? <p>Carregando os projetos…</p>
      : !entregas.canDeliver ? <p>{entregas.reason}</p>
      : <>
        <ul className="entrega-geral-resumo" aria-label="Situação das peças">
          <li><b>{total}</b>{total === 1 ? 'peça' : 'peças'}</li>
          <li className="entregue"><b>{entregues}</b>já {entregues === 1 ? 'entregue' : 'entregues'}</li>
          <li className="pronta"><b>{prontas}</b>{prontas === 1 ? 'pronta' : 'prontas'}</li>
          <li><b>{emProducao}</b>em produção</li>
        </ul>
        {faltam > 0 && <div className="entrega-geral-atalhos" role="group" aria-label="Marcar peças de todos os projetos">
          <span>Marcar em todos os projetos:</span>
          <button type="button" className="botao-contorno" onClick={() => setEscolha(marcar(projetos, (peca) => peca.ready))}>Só as prontas</button>
          <button type="button" className="botao-contorno" onClick={() => setEscolha(marcar(projetos, falta))}><Icone nome="marcado" tamanho={16} />Todas entregues</button>
          <button type="button" className="botao-contorno" onClick={() => setEscolha(marcar(projetos, () => 0))}>Nenhuma</button>
        </div>}
        {!faltam && <p>Todas as peças de todos os projetos já foram entregues.</p>}
        <div className="entrega-geral-projetos">
          {projetos.map((projeto, indice) => {
            const abertas = pendentes(projeto), jaEntregues = projeto.pieces.filter((peca) => peca.delivered > 0);
            const totalProjeto = soma(projeto.pieces, (peca) => peca.quantity), entreguesProjeto = soma(projeto.pieces, (peca) => peca.delivered);
            return <section key={projeto.id} aria-labelledby={`entrega-geral-${projeto.id}`} className={abertas.length ? undefined : 'completo'}>
              <header>
                <h3 id={`entrega-geral-${projeto.id}`}><span>{String(indice + 1).padStart(2, '0')}</span>{projeto.name}</h3>
                {/* Quantas estão marcadas, o seletor já mostra; aqui só o que já foi entregue. */}
                {(!abertas.length || entreguesProjeto > 0) && <small>{abertas.length ? `${entreguesProjeto} de ${totalProjeto} já ${entreguesProjeto === 1 ? 'entregue' : 'entregues'}` : 'Tudo entregue'}</small>}
              </header>
              {abertas.length > 0 && <SeletorPecas rotulo={`Peças entregues de ${projeto.name}`} valores={escolha[projeto.id] ?? {}} aoMudar={(valores) => setEscolha((atual) => ({ ...atual, [projeto.id]: valores }))}
                pecas={abertas.map((peca) => ({ key: peca.key, name: peca.name, detail: detalhe(peca), max: falta(peca) }))} />}
              {jaEntregues.length > 0 && <details className="entrega-geral-entregues">
                <summary>Já entregues · {rotuloPecas(entreguesProjeto)}</summary>
                <ul>{jaEntregues.map((peca) => <li key={peca.key}><Icone nome="aprovado" tamanho={14} /><span>{peca.name}</span><small>{[medidaPeca(peca), `${peca.delivered} ${peca.delivered === 1 ? 'entregue' : 'entregues'}`].filter(Boolean).join(' · ')}</small></li>)}</ul>
              </details>}
            </section>;
          })}
        </div>
      </>}
    {notas.length > 0 && <section className="nota-entrega-historico" aria-label="Notas gerais já geradas">
      <strong>Notas gerais já geradas</strong>
      <ul>{notas.map((nota) => <li key={nota.id}>
        <span><b>{nota.number}</b><small>{dataCurta(nota.createdAt)} · {rotuloPecas(nota.pieces)} · {nota.createdBy}</small></span>
        <button type="button" className="text-button" disabled={imprimindo === nota.id} onClick={() => void imprimir(nota)}>{imprimindo === nota.id ? 'Abrindo…' : 'Imprimir de novo'}</button>
      </li>)}</ul>
    </section>}
    {erro && <p role="alert" className="form-error">{erro}</p>}
  </ModalFiltros>, document.body);
}
