'use client';

import { bounds, bracosU, contornoDosParametros, edgeLength, formatMeasure, problemaParametros, updatePiece, type Piece, type PieceParameters, type PieceShape, type TechnicalDocument } from '@inova/domain/technical';
import { useState } from 'react';
import { CampoMedida } from './CampoMedida';
import type { MaterialVisual } from './tipos';

const FORMAS: { valor: PieceShape; rotulo: string }[] = [
  { valor: 'RECTANGLE', rotulo: 'Reta' }, { valor: 'L', rotulo: 'Em L' }, { valor: 'U', rotulo: 'Em U' }, { valor: 'CIRCLE', rotulo: 'Circular' }, { valor: 'ROUNDED', rotulo: 'Cantos arredondados' },
];

/** Propriedades da peça: forma e medidas (inclusive U), lados, espessura, giro, pedra e ações. */
export function PainelPeca({ documento, peca, materiais, aoMudar, aoAbrirLado, aoDuplicar, aoExcluir }: {
  documento: TechnicalDocument; peca: Piece; materiais: MaterialVisual[];
  aoMudar: (documento: TechnicalDocument) => void; aoAbrirLado: (ladoId: string) => void; aoDuplicar: () => void; aoExcluir: () => void;
}) {
  const [aviso, setAviso] = useState('');
  const atualizar = (patch: Partial<Piece>) => aoMudar(updatePiece(documento, peca.id, patch));
  const parametros = peca.geometryMode === 'PARAMETRIC' ? peca.parameters : undefined;
  const mudarParametros = (patch: Partial<PieceParameters>) => {
    if (!parametros) return;
    const proximos = { ...parametros, ...patch };
    const problema = problemaParametros(proximos);
    setAviso(problema ?? '');
    if (!problema) atualizar({ parameters: proximos, contour: contornoDosParametros(peca.id, proximos) });
  };
  const trocarForma = (forma: PieceShape) => {
    const caixa = bounds(peca.contour);
    const largura = Math.round(caixa.maxX - caixa.minX), profundidade = Math.round(caixa.maxY - caixa.minY);
    const proximos: PieceParameters = { shape: forma, width: Math.max(largura, forma === 'U' ? 2000 : 300), length: forma === 'L' ? Math.max(profundidade, 1500) : forma === 'U' ? 600 : Math.max(profundidade, 300), radius: 100, arm: 600,
      ...(forma === 'U' ? { leftArm: 1500, rightArm: 1500, leftArmWidth: 600, rightArmWidth: 600 } : {}) };
    setAviso('');
    atualizar({ geometryMode: 'PARAMETRIC', parameters: proximos, contour: contornoDosParametros(peca.id, proximos) });
  };
  const bracos = parametros?.shape === 'U' ? bracosU(parametros.arm, parametros) : null;

  return <section className="tec-painel-secao" aria-label={`Peça ${peca.name}`}>
    {peca.locked && <p className="tec-aviso">Peça travada: destrave para mudar medidas ou posição.</p>}
    <label className="tec-campo">Nome<input value={peca.name} onChange={(evento) => atualizar({ name: evento.target.value || 'Peça' })} /></label>
    <label className="tec-campo">Forma
      <select value={parametros?.shape ?? 'FREE'} onChange={(evento) => trocarForma(evento.target.value as PieceShape)}>
        {!parametros && <option value="FREE">Contorno livre (lados e vértices)</option>}
        {FORMAS.map((forma) => <option key={forma.valor} value={forma.valor}>{forma.rotulo}</option>)}
      </select>
    </label>
    {parametros && <div className="tec-grade-campos">
      {parametros.shape === 'CIRCLE' ? <CampoMedida rotulo="Diâmetro" valorMm={parametros.width} onChange={(width) => mudarParametros({ width })} /> : <>
        <CampoMedida rotulo={parametros.shape === 'U' ? 'Comprimento total' : 'Comprimento'} valorMm={parametros.width} onChange={(width) => mudarParametros({ width })} />
        <CampoMedida rotulo={parametros.shape === 'U' ? 'Fundo (profundidade)' : parametros.shape === 'L' ? 'Comprimento do braço' : 'Largura'} valorMm={parametros.length} onChange={(length) => mudarParametros({ length })} />
      </>}
      {parametros.shape === 'L' && <CampoMedida rotulo="Largura do L" valorMm={parametros.arm} onChange={(arm) => mudarParametros({ arm })} />}
      {parametros.shape === 'ROUNDED' && <CampoMedida rotulo="Raio do canto" minimo={0} valorMm={parametros.radius} onChange={(radius) => mudarParametros({ radius })} />}
      {bracos && <>
        <CampoMedida rotulo="Braço esquerdo" valorMm={bracos.leftArm} onChange={(leftArm) => mudarParametros({ leftArm })} />
        <CampoMedida rotulo="Braço direito" valorMm={bracos.rightArm} onChange={(rightArm) => mudarParametros({ rightArm })} />
        <CampoMedida rotulo="Largura braço esq." valorMm={bracos.leftArmWidth} onChange={(leftArmWidth) => mudarParametros({ leftArmWidth })} />
        <CampoMedida rotulo="Largura braço dir." valorMm={bracos.rightArmWidth} onChange={(rightArmWidth) => mudarParametros({ rightArmWidth })} />
      </>}
    </div>}
    {aviso && <p role="alert" className="tec-aviso">{aviso}</p>}

    <h3>Lados <small>toque para medir, escrever ou travar</small></h3>
    <div className="tec-lados">
      {peca.contour.map((vertice, indice) => <button type="button" key={vertice.id} className="tec-lado-botao" onClick={() => aoAbrirLado(vertice.id)}>
        <span>Lado {indice + 1}</span><strong>{peca.dimensionLabels[vertice.id] || formatMeasure(edgeLength(peca, vertice.id))}</strong>{peca.lockedEdges.includes(vertice.id) && <i aria-label="travado">🔒</i>}
      </button>)}
    </div>

    <div className="tec-grade-campos">
      <CampoMedida rotulo="Espessura" valorMm={peca.thicknessMm} onChange={(thicknessMm) => atualizar({ thicknessMm })} />
      <label className="tec-campo">Giro (graus)<input type="number" inputMode="numeric" value={peca.rotationDeg} onChange={(evento) => atualizar({ rotationDeg: Number(evento.target.value) || 0 })} /></label>
    </div>
    <label className="tec-campo">Pedra (visual e estimativa)
      <select value={peca.material?.id ?? ''} onChange={(evento) => {
        const material = materiais.find((entrada) => entrada.id === evento.target.value);
        atualizar({ material: material ? { id: material.id, name: material.name, imageUrl: material.imageUrl ?? undefined, textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } : undefined });
      }}><option value="">Sem pedra</option>{materiais.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select>
    </label>
    <div className="tec-acoes">
      <button type="button" className="botao-contorno" onClick={() => atualizar({ rotationDeg: (peca.rotationDeg + 90) % 360 })}>↻ Girar 90°</button>
      {/* updatePiece ignora peças travadas; o cadeado muda o documento direto. */}
      <button type="button" className="botao-contorno" onClick={() => aoMudar({ ...documento, pieces: documento.pieces.map((entrada) => entrada.id === peca.id ? { ...entrada, locked: !entrada.locked } : entrada) })}>{peca.locked ? '🔓 Destravar peça' : '🔒 Travar peça'}</button>
      <button type="button" className="botao-contorno" onClick={aoDuplicar}>⧉ Duplicar</button>
      <button type="button" className="botao-contorno tec-perigo" onClick={aoExcluir}>Excluir peça</button>
    </div>
  </section>;
}
