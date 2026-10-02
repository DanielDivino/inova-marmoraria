'use client';

import { areasDaPeca, bounds, girarPeca, nomeDaPeca, bracosU, contornoDosParametros, edgeLength, formatMeasure, NOME_AREA, problemaParametros, tirarArea, trocarTipoArea, updatePiece, type Piece, type PieceParameters, type PieceShape, type TechnicalDocument } from '@inova/domain/technical';
import { useState } from 'react';
import { SeletorPedra } from './SeletorPedra';
import { CampoMedida } from './CampoMedida';
import type { MaterialVisual } from './tipos';

const FORMAS: { valor: PieceShape; rotulo: string }[] = [
  { valor: 'RECTANGLE', rotulo: 'Reta' }, { valor: 'L', rotulo: 'Em L' }, { valor: 'U', rotulo: 'Em U' }, { valor: 'CIRCLE', rotulo: 'Circular' }, { valor: 'ROUNDED', rotulo: 'Cantos arredondados' },
];

/** Propriedades da peça: forma e medidas (inclusive U), lados, área seca/molhada, espessura, giro, pedra e ações. */
export function PainelPeca({ documento, peca, materiais, aoMudar, aoAbrirLado, aoDuplicar, aoExcluir, aoMarcarArea }: {
  documento: TechnicalDocument; peca: Piece; materiais: MaterialVisual[];
  aoMudar: (documento: TechnicalDocument) => void; aoAbrirLado: (ladoId: string) => void; aoDuplicar: () => void; aoExcluir: () => void;
  aoMarcarArea?: () => void;
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
  // Área seca e molhada: marcadas no desenho (clicar, puxar e clicar); aqui só troca o tipo ou tira.
  const areas = areasDaPeca(peca);
  const mudarAreas = (wetDryZones: Piece['wetDryZones']) => atualizar({ wetDryZones });

  return <section className="tec-painel-secao" aria-label={`Peça ${nomeDaPeca(peca, documento.pieces)}`}>
    {peca.locked && <p className="tec-aviso">Peça travada. Destrave-a para alterar medidas ou posição.</p>}
    <label className="tec-campo">Nome<input value={peca.name} placeholder={`Sem nome (aparece como ${nomeDaPeca({ ...peca, name: '' }, documento.pieces)})`} onChange={(evento) => atualizar({ name: evento.target.value })} /></label>
    <SeletorPedra materiais={materiais} id={peca.material?.id} nome={peca.material?.name} desativado={peca.locked} aoEscolher={material => {
      atualizar({ material: material ? { id: material.id, name: material.name, imageUrl: material.imageUrl ?? undefined, textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } : undefined });
    }} />
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

    <h3>Área seca e molhada <small>marcadas no desenho</small></h3>
    {!areas.length && <p className="tec-dica">Selecione 💧 Seca / molhada, clique no início da área no balcão, arraste até o fim e clique novamente. Em seguida, defina se a área é seca ou molhada.</p>}
    {areas.length > 0 && <ul className="tec-areas" aria-label="Áreas do balcão">
      {areas.map((area) => <li key={area.indice} className={`tec-area-linha ${area.tipo === 'WET' ? 'molhada' : 'seca'}`}>
        <div><strong>{NOME_AREA[area.tipo]} · {formatMeasure(area.comprimentoMm)}</strong><small>de {formatMeasure(area.inicioMm)} a {formatMeasure(area.fimMm)} {peca.wetDryZones[area.indice]?.angleDeg ? 'na direção escolhida' : 'da ponta esquerda'}</small></div>
        <button type="button" className="botao-contorno" onClick={() => mudarAreas(trocarTipoArea(peca, area.indice))}>Trocar para {area.tipo === 'WET' ? 'seca' : 'molhada'}</button>
        <button type="button" className="text-button" aria-label={`Tirar ${NOME_AREA[area.tipo].toLowerCase()} de ${formatMeasure(area.comprimentoMm)}`} onClick={() => mudarAreas(tirarArea(peca, area.indice))}>×</button>
      </li>)}
    </ul>}
    {aoMarcarArea && <button type="button" className="botao-contorno tec-dividir-areas" onClick={aoMarcarArea}>💧 Marcar área no desenho</button>}

    <div className="tec-grade-campos">
      <CampoMedida rotulo="Posição X" minimo={-100000} valorMm={peca.x} onChange={(x) => atualizar({ x })} />
      <CampoMedida rotulo="Posição Y" minimo={-100000} valorMm={peca.y} onChange={(y) => atualizar({ y })} />
      <CampoMedida rotulo="Espessura" valorMm={peca.thicknessMm} onChange={(thicknessMm) => atualizar({ thicknessMm })} />
      <label className="tec-campo">Giro (graus)<input type="number" inputMode="numeric" value={peca.rotationDeg} onChange={(evento) => aoMudar(girarPeca(documento, peca.id, Number(evento.target.value) || 0))} /></label>
    </div>

    <div className="tec-acoes">
      <button type="button" className="botao-contorno" onClick={() => aoMudar(girarPeca(documento, peca.id, peca.rotationDeg + 90))}>↻ Girar 90°</button>
      {/* updatePiece ignora peças travadas; o cadeado muda o documento direto. */}
      <button type="button" className="botao-contorno" onClick={() => aoMudar({ ...documento, pieces: documento.pieces.map((entrada) => entrada.id === peca.id ? { ...entrada, locked: !entrada.locked } : entrada) })}>{peca.locked ? '🔓 Destravar peça' : '🔒 Travar peça'}</button>
      <button type="button" className="botao-contorno" onClick={aoDuplicar}>⧉ Duplicar</button>
      <button type="button" className="botao-contorno tec-perigo" onClick={aoExcluir}>Excluir peça</button>
    </div>
  </section>;
}
