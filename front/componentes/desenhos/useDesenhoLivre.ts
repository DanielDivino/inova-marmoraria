'use client';

import { useState } from 'react';
import { aplicarMedidaReferencia, comprimentoTraco, contornoValido, ladoMaisComprido, organizarTraco, paraContorno, recorteDoTraco, type Point, type RecorteDoTraco, type TechnicalDocument } from '@inova/domain/technical';
import { criarId } from '../../utilitarios/id';
import { inserirPeca, mundoParaLocal, novoRecursoCorpo, pecaNoPonto } from './operacoes';
import type { Selecao } from './tipos';

/** Traço organizado esperando resposta: fechar a forma ou dar a medida de um lado. */
export type TracoEmAndamento = { brutos: Point[]; pontos: Point[]; fechado: boolean; valido: boolean; ladoReferencia: number | null; motivo?: string };
export type RecorteEmAndamento = { pecaId: string; recorte: RecorteDoTraco };

/**
 * Desenho livre: o traço vira peça (organizado, fechado e com escala pela medida
 * de um lado) ou recorte (cuba/cooktop) dentro de uma peça. Guarda o que foi
 * desenhado nesta sessão para o "Limpar".
 */
export function useDesenhoLivre({ documento, mudar, aoSelecionar, aoMensagem, passoMm }: {
  documento: TechnicalDocument | null; mudar: (proximo: TechnicalDocument) => void; aoSelecionar: (selecao: Selecao) => void; aoMensagem: (texto: string) => void; passoMm: number;
}) {
  const [traco, setTraco] = useState<TracoEmAndamento | null>(null);
  const [recorte, setRecorte] = useState<RecorteEmAndamento | null>(null);
  const [desenhados, setDesenhados] = useState<string[]>([]);

  const organizar = (brutos: Point[], fechar = false): TracoEmAndamento => {
    const resultado = organizarTraco(brutos, { fechar });
    return { brutos, pontos: resultado.pontos, fechado: resultado.fechado, valido: resultado.valido, ladoReferencia: resultado.valido ? ladoMaisComprido(resultado.pontos) : null, motivo: resultado.motivo };
  };

  function aoTraco(brutos: Point[], tipo: 'TRACO_PECA' | 'TRACO_RECORTE') {
    if (!documento) return;
    setRecorte(null);
    if (tipo === 'TRACO_RECORTE') {
      const centro = brutos.reduce((soma, p) => ({ x: soma.x + p.x / brutos.length, y: soma.y + p.y / brutos.length }), { x: 0, y: 0 });
      const peca = pecaNoPonto(documento, centro);
      if (!peca) { aoMensagem('Desenhe o recorte dentro de uma peça.'); return; }
      const aberto = Math.hypot(brutos[0].x - brutos[brutos.length - 1].x, brutos[0].y - brutos[brutos.length - 1].y) > comprimentoTraco(brutos) * .25;
      const reconhecido = !aberto && recorteDoTraco(brutos.map((p) => mundoParaLocal(p, peca)), passoMm);
      if (!reconhecido) { aoMensagem('Feche o contorno do recorte (termine perto de onde começou).'); return; }
      setRecorte({ pecaId: peca.id, recorte: reconhecido });
      return;
    }
    const organizado = organizar(brutos);
    setTraco(organizado);
    if (organizado.fechado && !organizado.valido) aoMensagem(organizado.motivo ?? 'O contorno ficou cruzado. Desfaça o traço e desenhe de novo.');
    else aoMensagem('');
  }

  /** "Fechar a forma": organiza de novo o mesmo traço, agora fechado. */
  function fechar() {
    if (!traco) return;
    const organizado = organizar(traco.brutos, true);
    setTraco(organizado);
    aoMensagem(organizado.valido ? '' : organizado.motivo ?? 'Não deu para fechar a forma. Desenhe de novo.');
  }

  const trocarLado = () => setTraco((atual) => atual && atual.ladoReferencia !== null ? { ...atual, ladoReferencia: (atual.ladoReferencia + 1) % atual.pontos.length } : atual);

  /** Dá escala pela medida do lado destacado e cria a peça no lugar em que foi desenhada. */
  function criarPeca(medidaMm: number): string | null {
    if (!documento || !traco || traco.ladoReferencia === null) return 'Desenhe a peça de novo.';
    const pontos = aplicarMedidaReferencia(traco.pontos, traco.ladoReferencia, medidaMm, passoMm);
    const id = criarId();
    const contorno = paraContorno(id, pontos);
    if (pontos.length < 3 || !contornoValido(contorno)) return 'Com essa medida o contorno fica inválido. Confira a medida ou desenhe de novo.';
    const origem = traco.pontos[0];
    mudar(inserirPeca(documento, { id, name: `Peça ${documento.pieces.length + 1}`, contour: contorno, thicknessMm: 20, x: Math.round(origem.x), y: Math.round(origem.y), z: 0, rotationDeg: 0, tiltDeg: 0,
      locked: false, layerId: 'pieces', geometryMode: 'FREE', dimensionLabels: {}, lockedEdges: [] }));
    setDesenhados((lista) => [...lista, id]); setTraco(null); aoSelecionar({ tipo: 'peca', id });
    aoMensagem('Peça criada. Toque nos lados para ajustar as outras medidas.');
    return null;
  }

  function criarRecorte(tipo: 'SINK' | 'CUTOUT') {
    if (!documento || !recorte) return;
    const peca = documento.pieces.find((entrada) => entrada.id === recorte.pecaId);
    if (!peca) { setRecorte(null); return; }
    const { shape, x, y, widthMm, lengthMm, rotationDeg } = recorte.recorte;
    const recurso = novoRecursoCorpo(peca, tipo, criarId(), { shape, x, y, widthMm, lengthMm, rotationDeg, name: tipo === 'SINK' ? 'Cuba' : 'Cooktop' });
    mudar({ ...documento, features: [...documento.features, recurso] });
    setDesenhados((lista) => [...lista, recurso.id]); setRecorte(null); aoSelecionar({ tipo: 'recurso', id: recurso.id }); aoMensagem('');
  }

  const descartar = () => { setTraco(null); setRecorte(null); aoMensagem(''); };
  /** Tira tudo o que foi desenhado à mão nesta sessão (com confirmação). */
  function limpar() {
    if (!documento) return;
    descartar();
    const existentes = desenhados.filter((id) => documento.pieces.some((peca) => peca.id === id) || documento.features.some((recurso) => recurso.id === id));
    if (!existentes.length || !window.confirm(`Apagar as ${existentes.length} peças e recortes desenhados à mão agora?`)) return;
    mudar({ ...documento, pieces: documento.pieces.filter((peca) => !existentes.includes(peca.id)), features: documento.features.filter((recurso) => !existentes.includes(recurso.id) && !existentes.includes(recurso.pieceId)),
      assemblies: documento.assemblies.map((conjunto) => ({ ...conjunto, pieceIds: conjunto.pieceIds.filter((id) => !existentes.includes(id)) })) });
    setDesenhados([]); aoSelecionar(null);
  }

  return { traco, recorte, aoTraco, fechar, trocarLado, criarPeca, criarRecorte, descartar, limpar, temTraco: !!traco || !!recorte };
}
