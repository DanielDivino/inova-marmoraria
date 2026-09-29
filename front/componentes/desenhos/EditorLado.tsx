'use client';

import { useEffect, useState } from 'react';
import { edgeLength, type Piece } from '@inova/domain/technical';
import { ModalFiltros } from '../filtros/Filtros';
import { CampoMedida } from './CampoMedida';

/**
 * Medida de um lado, aberta ao tocar no lado ou na cota: digitar a medida
 * (os lados vizinhos se ajustam), trocar o número por um texto livre
 * ("medir no local") ou travar o lado com o cadeado.
 */
export function EditorLado({ peca, ladoId, aoFechar, aoMudarMedida, aoMudarTexto, aoAlternarTrava }: {
  peca: Piece | null; ladoId: string | null; aoFechar: () => void;
  /** Devolve o motivo quando a medida não pode ser aplicada. */
  aoMudarMedida: (mm: number) => string | null;
  aoMudarTexto: (texto: string) => void; aoAlternarTrava: () => void;
}) {
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState('');
  const indice = peca && ladoId ? peca.contour.findIndex((vertice) => vertice.id === ladoId) : -1;
  useEffect(() => { setErro(''); setTexto(peca && ladoId ? peca.dimensionLabels[ladoId] ?? '' : ''); }, [peca?.id, ladoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const aberto = !!peca && indice >= 0;
  const travado = !!peca && !!ladoId && peca.lockedEdges.includes(ladoId);
  const curvo = aberto && Math.abs(peca!.contour[indice].bulge) > 1e-6;
  return <ModalFiltros aberto={aberto} aoFechar={aoFechar} titulo={aberto ? `Lado ${indice + 1} · ${peca!.name}` : 'Lado'} rotuloFechar="Fechar" className="tec-janela"
    rodape={<button type="button" className="botao-destaque" onClick={aoFechar}>Pronto</button>}>
    {aberto && <>
      {curvo ? <p className="tec-aviso">Lado curvo: mude a curvatura no vértice ou as medidas da forma.</p>
        : <CampoMedida rotulo="Medida do lado" valorMm={edgeLength(peca!, ladoId!)} autoFocus onChange={(mm) => setErro(aoMudarMedida(mm) ?? '')} />}
      {erro && <p role="alert" className="form-error">{erro}</p>}
      <label className="tec-campo">Texto no lugar da medida
        <input type="text" maxLength={120} placeholder="ex.: medir no local, encosto na parede" value={texto}
          onChange={(evento) => setTexto(evento.target.value)} onBlur={() => aoMudarTexto(texto)} onKeyDown={(evento) => { if (evento.key === 'Enter') (evento.target as HTMLInputElement).blur(); }} />
      </label>
      <button type="button" className={`botao-contorno tec-trava${travado ? ' ativo' : ''}`} aria-pressed={travado} onClick={aoAlternarTrava}>{travado ? '🔒 Lado travado' : '🔓 Travar este lado'}</button>
      <p className="tec-dica">Ao mudar a medida, o fim do lado anda na direção dele e os lados vizinhos se ajustam. Lados travados não mudam.</p>
    </>}
  </ModalFiltros>;
}
