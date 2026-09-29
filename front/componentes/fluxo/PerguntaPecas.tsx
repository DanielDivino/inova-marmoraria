'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PROJECT_WORKFLOW_LABELS, type ProjectWorkflowStatus } from '@inova/domain';
import { ModalFiltros } from '../filtros/Filtros';
import { medidaPeca, rotuloPecas, type CartaoFluxo } from '../../utilitarios/fluxo';
import { SeletorPecas, somaQuantidades, type QuantidadesPecas } from './SeletorPecas';

export type PedidoPecas = { cartao: CartaoFluxo; status: ProjectWorkflowStatus };

/**
 * Ao levar um cartão com várias peças para Produzido ou Entregue: "Produziu
 * todas?". Sim move o cartão inteiro; Não abre a lista para marcar quais — elas
 * vão para a etapa e as que faltam continuam onde estavam, em outro cartão.
 */
export function PerguntaPecas({ pedido, salvando, erro, aoTodas, aoParte, aoCancelar }: {
  pedido: PedidoPecas | null; salvando: boolean; erro: string;
  aoTodas: () => void; aoParte: (pecas: QuantidadesPecas) => void; aoCancelar: () => void;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [valores, setValores] = useState<QuantidadesPecas>({});
  useEffect(() => { setEscolhendo(false); setValores({}); }, [pedido]);
  const cartao = pedido?.cartao, status = pedido?.status;
  const entrega = status === 'DELIVERED';
  const verbo = entrega ? 'entregues' : 'produzidas';
  const escolhidas = somaQuantidades(valores);
  const detalhe = (peca: CartaoFluxo['pieceList'][number]) => [medidaPeca(peca), peca.quantity > 1 ? rotuloPecas(peca.quantity) : ''].filter(Boolean).join(' · ');
  return <ModalFiltros aberto={!!pedido} aoFechar={aoCancelar} className="modal-pecas" rotuloFechar="Cancelar" titulo={entrega ? 'Entregou todas as peças?' : 'Produziu todas as peças?'}
    rodape={!cartao ? null : escolhendo
      ? <><button type="button" className="botao-contorno" disabled={salvando} onClick={() => setEscolhendo(false)}>Voltar</button>
        <button type="button" className="botao-destaque" disabled={salvando || !escolhidas} onClick={() => aoParte(valores)}>{salvando ? 'Salvando…' : `Mover ${rotuloPecas(escolhidas)}`}</button></>
      : <><button type="button" className="botao-contorno" disabled={salvando} onClick={() => setEscolhendo(true)}>Não, escolher quais</button>
        <button type="button" className="botao-destaque" disabled={salvando} onClick={aoTodas}>Sim, {cartao.pieces === 2 ? 'as duas' : `todas as ${cartao.pieces}`}</button></>}>
    {cartao && status && (escolhendo ? <>
      <p>Marque as peças {verbo}. Elas vão para <strong>{PROJECT_WORKFLOW_LABELS[status]}</strong>; as que faltarem continuam em <strong>{PROJECT_WORKFLOW_LABELS[cartao.status]}</strong> como outro cartão.</p>
      <SeletorPecas rotulo={`Peças ${verbo}`} valores={valores} aoMudar={setValores}
        pecas={cartao.pieceList.map((peca) => ({ key: peca.key, name: peca.name, detail: medidaPeca(peca), max: peca.quantity }))} />
    </> : <>
      <p><strong>{cartao.name}</strong> · {cartao.quote.number} · {cartao.quote.customerName} tem {rotuloPecas(cartao.pieces)} neste cartão.</p>
      <ul className="modal-pecas-lista">{cartao.pieceList.map((peca) => <li key={peca.key}><span>{peca.name}</span><small>{detalhe(peca)}</small></li>)}</ul>
      {entrega && <p>Precisa da nota para o cliente assinar? <Link href={`/orcamentos/${cartao.quote.id}?entrega=${cartao.projectId}#projeto-${cartao.projectId}`}>Gerar nota de entrega</Link> — ela já marca as peças como entregues.</p>}
    </>)}
    {erro && <p role="alert" className="form-error">{erro}</p>}
  </ModalFiltros>;
}
