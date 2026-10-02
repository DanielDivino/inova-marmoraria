'use client';

import { useState } from 'react';
import { arredondarPontos, comprimentoTraco, contornoValido, organizarTraco, paraContorno, recorteDoTraco, type Point, type RecorteDoTraco, type TechnicalDocument } from '@inova/domain/technical';
import { criarId } from '../../utilitarios/id';
import { inserirPeca, mundoParaLocal, novoRecursoCorpo, pecaNoPonto } from './operacoes';
import { confirmar } from '../Confirmacao';
import type { Selecao } from './tipos';

/** Traço organizado esperando resposta: fechar a forma ou corrigir um contorno inválido. */
export type TracoEmAndamento = { brutos: Point[]; pontos: Point[]; fechado: boolean; valido: boolean; ladoReferencia: number | null; motivo?: string };
export type RecorteEmAndamento = { pecaId: string; recorte: RecorteDoTraco };

/**
 * Desenho livre: o traço vira peça (organizado, fechado e com medidas automáticas na escala da planta) ou recorte (cuba/cooktop) dentro de uma peça. Guarda o que foi
 * desenhado nesta sessão para o "Limpar".
 */
export function useDesenhoLivre({ documento, mudar, aoSelecionar, aoMensagem, passoMm }: {
  documento: TechnicalDocument | null; mudar: (proximo: TechnicalDocument) => void; aoSelecionar: (selecao: Selecao) => void; aoMensagem: (texto: string) => void; passoMm: number;
}) {
  const [traco, setTraco] = useState<TracoEmAndamento | null>(null);
  const [recorte, setRecorte] = useState<RecorteEmAndamento | null>(null);
  const [desenhados, setDesenhados] = useState<string[]>([]);

  const organizar = (brutos: Point[], fechar = false): TracoEmAndamento => {
    const resultado = organizarTraco(brutos, { fechar, toleranciaAnguloGraus: 16, fracaoSimplificacao: .04 });
    return { brutos, pontos: resultado.pontos, fechado: resultado.fechado, valido: resultado.valido, ladoReferencia: null, motivo: resultado.motivo };
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
    if (organizado.fechado && organizado.valido) { criarPeca(organizado); return; }
    setTraco(organizado);
    if (organizado.fechado && !organizado.valido) aoMensagem(organizado.motivo ?? 'O contorno ficou cruzado. Desfaça o traço e desenhe de novo.');
    else aoMensagem('');
  }

  /** "Fechar a forma": organiza de novo o mesmo traço, agora fechado. */
  function fechar() {
    if (!traco) return;
    const organizado = organizar(traco.brutos, true);
    if (organizado.valido) { criarPeca(organizado); return; }
    setTraco(organizado);
    aoMensagem(organizado.valido ? '' : organizado.motivo ?? 'Não deu para fechar a forma. Desenhe de novo.');
  }

  /** O canvas já fornece milímetros: a peça nasce na escala em que foi desenhada. */
  function criarPeca(organizado: TracoEmAndamento) {
    if (!documento) return;
    const origem = organizado.pontos[0];
    const locais = organizado.pontos.map(p => ({ x: p.x - origem.x, y: p.y - origem.y }));
    let pontos = arredondarPontos(locais, passoMm);
    // Uma pequena aresta não deve desaparecer só por causa do arredondamento.
    if (pontos.length < 3 || !contornoValido(paraContorno('previa', pontos))) pontos = locais;
    const id = criarId();
    const contorno = paraContorno(id, pontos);
    if (pontos.length < 3 || !contornoValido(contorno)) { setTraco({ ...organizado, valido: false, motivo: 'Não foi possível criar esse contorno. Desenhe novamente.' }); return; }
    mudar(inserirPeca(documento, { id, name: `Peça ${documento.pieces.length + 1}`, contour: contorno, thicknessMm: 20, x: Math.round(origem.x), y: Math.round(origem.y), z: 0, rotationDeg: 0, tiltDeg: 0,
      locked: false, layerId: 'pieces', geometryMode: 'FREE', dimensionLabels: {}, lockedEdges: [], wetDryZones: [] }));
    setDesenhados((lista) => [...lista, id]); setTraco(null); aoSelecionar({ tipo: 'peca', id });
    aoMensagem('');
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
  async function limpar() {
    if (!documento) return;
    descartar();
    const existentes = desenhados.filter((id) => documento.pieces.some((peca) => peca.id === id) || documento.features.some((recurso) => recurso.id === id));
    if (!existentes.length || !await confirmar({ titulo: `Apagar ${existentes.length === 1 ? 'o desenho feito à mão' : `as ${existentes.length} peças e recortes desenhados à mão`}?`, mensagem: 'Use Ctrl+Z para desfazer.', confirmar: 'Apagar', perigo: true })) return;
    mudar({ ...documento, pieces: documento.pieces.filter((peca) => !existentes.includes(peca.id)), features: documento.features.filter((recurso) => !existentes.includes(recurso.id) && !existentes.includes(recurso.pieceId)),
      assemblies: documento.assemblies.map((conjunto) => ({ ...conjunto, pieceIds: conjunto.pieceIds.filter((id) => !existentes.includes(id)) })) });
    setDesenhados([]); aoSelecionar(null);
  }

  return { traco, recorte, aoTraco, fechar, criarRecorte, descartar, limpar, temTraco: !!traco || !!recorte };
}
