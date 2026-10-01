import { useState } from 'react';
import { componentTypeLabels } from '@inova/domain';
import { validarDivisao, calcularUltimaPeca, areaDaOrigemMm2, quantidadeAteAcabar, validarDivisaoPorMedida, type PecaPorMedida, type ProductionPlan, type ProductionSource, type ProductionPiece } from '../../utilitarios/production-plan';
import { criarId } from '../../utilitarios/id';
import { confirmar } from '../Confirmacao';
import { CampoMetros } from './CampoMetros';

type ComponentSnapshot = { label: string; componentType: ProductionPiece['componentType']; orientation: ProductionPiece['orientation']; edges: ProductionPiece['edges'] };
type Props = {
  plan: ProductionPlan;
  componentSnapshots: Record<string, ComponentSnapshot>;
  onSplitEqual: (source: ProductionSource, snapshot: ComponentSnapshot, parts: number) => void;
  onSplitManual: (source: ProductionSource, snapshot: ComponentSnapshot, lengthsMm: number[]) => void;
  onSplitBySize: (source: ProductionSource, snapshot: ComponentSnapshot, pecas: PecaPorMedida[]) => void;
  onReconcile: (source: ProductionSource) => void;
  onDismissReview: (source: ProductionSource) => void;
  onResetSplit: (source: ProductionSource) => void;
};
const metros = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const paraMm = (metrosStr: string) => { const parsed = Number(metrosStr.replace(',', '.')); return Number.isFinite(parsed) ? Math.round(parsed * 1000) : 0; };
const cmParaMm = (cm: string) => { const parsed = Number(cm.replace(',', '.')); return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) : 0; };
const metrosQuadrados = (mm2: number) => (mm2 / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
type LinhaMedida = { id: string; comprimentoCm: string; larguraCm: string; quantidade: string };
const novaLinha = (linha: Partial<LinhaMedida> = {}): LinhaMedida => ({ id: criarId(), comprimentoCm: '', larguraCm: '', quantidade: '1', ...linha });
const pecaDaLinha = (linha: LinhaMedida): PecaPorMedida | null => {
  const peca = { lengthMm: cmParaMm(linha.comprimentoCm), widthMm: cmParaMm(linha.larguraCm), quantity: Number(linha.quantidade) };
  return peca.lengthMm > 0 && peca.widthMm > 0 && Number.isInteger(peca.quantity) && peca.quantity > 0 ? peca : null;
};

/**
 * Divisão por medida: comprimento × largura × peças, em quantas linhas precisar.
 * "Repetir até acabar" preenche quantas peças daquela medida cabem no que resta
 * da área; "Peça com a sobra" usa o resto com a largura da última medida.
 */
function DivisaoPorMedida({ source, onConfirm, onCancel }: { source: ProductionSource; onConfirm: (pecas: PecaPorMedida[]) => void; onCancel: () => void }) {
  const [linhas, setLinhas] = useState<LinhaMedida[]>(() => [novaLinha()]);
  const areaTotal = areaDaOrigemMm2(source);
  const pecas = linhas.map(pecaDaLinha);
  const validas = pecas.filter((peca): peca is PecaPorMedida => peca !== null);
  const areaDe = (peca: PecaPorMedida | null) => peca ? peca.lengthMm * peca.widthMm * peca.quantity : 0;
  const usada = validas.reduce((soma, peca) => soma + areaDe(peca), 0);
  const resultado = validas.length ? validarDivisaoPorMedida(areaTotal, validas) : null;
  const alterar = (id: string, patch: Partial<LinhaMedida>) => setLinhas(linhas.map((linha) => linha.id === id ? { ...linha, ...patch } : linha));
  const cabem = (index: number) => {
    const linha = pecas[index] ?? { lengthMm: cmParaMm(linhas[index].comprimentoCm), widthMm: cmParaMm(linhas[index].larguraCm), quantity: 0 };
    const outras = pecas.reduce((soma, peca, atual) => atual === index ? soma : soma + areaDe(peca), 0);
    return quantidadeAteAcabar(areaTotal - outras, linha.lengthMm, linha.widthMm);
  };
  const ultimaLargura = [...validas].reverse()[0]?.widthMm ?? 0;
  const sobraMm = resultado?.status === 'incompleto' && ultimaLargura ? Math.floor(resultado.restanteMm / ultimaLargura) : 0;
  return <div className="split-assistant-manual split-assistant-medida">
    <p className="split-assistant-question">Área disponível: <strong>{metrosQuadrados(areaTotal)} m²</strong>. Informe a medida de cada peça e quantas vezes ela se repete.</p>
    <div className="split-assistant-medida-linhas">{linhas.map((linha, index) => {
      const quantas = cabem(index);
      return <div className="split-assistant-manual-row" key={linha.id}>
        <label>Comprimento (m)<CampoMetros label={`Comprimento da medida ${index + 1} (m)`} value={linha.comprimentoCm} onChange={(valor) => alterar(linha.id, { comprimentoCm: valor })} /></label>
        <span className="split-assistant-vezes" aria-hidden="true">×</span>
        <label>Largura (m)<CampoMetros label={`Largura da medida ${index + 1} (m)`} value={linha.larguraCm} onChange={(valor) => alterar(linha.id, { larguraCm: valor })} /></label>
        <label className="split-assistant-quantidade">Peças<input type="number" min={1} step={1} inputMode="numeric" aria-label={`Quantidade da medida ${index + 1}`} value={linha.quantidade} onChange={(event) => alterar(linha.id, { quantidade: event.target.value })} /></label>
        <button type="button" className="text-button" disabled={!quantas} onClick={() => alterar(linha.id, { quantidade: String(quantas) })}>Repetir até acabar{quantas ? ` (${quantas})` : ''}</button>
        {linhas.length > 1 ? <button type="button" className="text-button" aria-label={`Remover medida ${index + 1}`} onClick={() => setLinhas(linhas.filter((atual) => atual.id !== linha.id))}>Remover</button> : <span />}
      </div>;
    })}</div>
    <div className="split-assistant-actions">
      <button type="button" className="text-button" onClick={() => setLinhas([...linhas, novaLinha()])}>+ Outra medida</button>
      {sobraMm > 0 && <button type="button" className="text-button" onClick={() => setLinhas([...linhas, novaLinha({ comprimentoCm: String(sobraMm / 10), larguraCm: String(ultimaLargura / 10) })])}>+ Peça com a sobra ({metros(sobraMm)} × {metros(ultimaLargura)} m)</button>}
    </div>
    {resultado && <p className={`split-assistant-status split-assistant-status-${resultado.status}`}>
      {resultado.status === 'completo' && `Utilizado: ${metrosQuadrados(usada)} de ${metrosQuadrados(areaTotal)} m² · sem sobra`}
      {resultado.status === 'incompleto' && `Utilizado: ${metrosQuadrados(usada)} de ${metrosQuadrados(areaTotal)} m² · Sobra: ${metrosQuadrados(resultado.restanteMm)} m²`}
      {resultado.status === 'excedeu' && `Passou ${metrosQuadrados(resultado.excedenteMm)} m² da área disponível (${metrosQuadrados(areaTotal)} m²)`}
    </p>}
    <div className="split-assistant-confirmar">
      <button type="button" className="text-button" onClick={onCancel}>Cancelar</button>
      <button type="button" className="primary-compact-button" disabled={!resultado || resultado.status === 'excedeu' || validas.length !== linhas.length} onClick={() => onConfirm(validas)}>Confirmar divisão</button>
    </div>
  </div>;
}

/**
 * Controles de divisão de um item: "Dividir em [1][2][3][4] Manual · Por medida".
 * Manual e Por medida abrem logo abaixo da linha do item.
 */
function AssistenteDivisao({ source, snapshot, nome, onSplitEqual, onSplitManual, onSplitBySize }: { source: ProductionSource; snapshot: ComponentSnapshot; nome: string; onSplitEqual: Props['onSplitEqual']; onSplitManual: Props['onSplitManual']; onSplitBySize: Props['onSplitBySize'] }) {
  const totalMm = source.splitAxis === 'LENGTH' ? source.snapshotLengthMm : source.snapshotWidthMm;
  const [modo, setModo] = useState<'opcoes' | 'manual' | 'medida'>('opcoes');
  const [partes, setPartes] = useState<string[]>(['', '']);
  const medidasMm = partes.map(paraMm);
  const preenchidas = medidasMm.filter((value) => value > 0);
  const resultado = preenchidas.length ? validarDivisao(totalMm, preenchidas) : null;
  const usarRestante = (index: number) => {
    const anteriores = medidasMm.slice(0, index).filter((value) => value > 0);
    try { setPartes(partes.map((value, current) => current === index ? metros(calcularUltimaPeca(totalMm, anteriores)) : value)); } catch { /* nada restante: ignora */ }
  };
  return <>
    {modo === 'opcoes'
      ? <div className="split-assistant-quick" role="group" aria-label={`Dividir ${nome} em quantas peças`}>
        <span className="split-assistant-question" aria-hidden="true">Dividir em</span>
        {[1, 2, 3, 4].map((n) => <button key={n} type="button" onClick={() => onSplitEqual(source, snapshot, n)}>{n}</button>)}
        <i className="split-assistant-separador" aria-hidden="true" />
        <button type="button" className="split-assistant-mais" onClick={() => { setModo('manual'); setPartes(['', '']); }}>Manual</button>
        <button type="button" className="split-assistant-mais" onClick={() => setModo('medida')}>Por medida</button>
      </div>
      : <span className="split-assistant-modo">{modo === 'manual' ? 'Divisão manual' : 'Divisão por medida'}</span>}
    {modo === 'medida' && <div className="split-assistant-painel"><DivisaoPorMedida source={source} onConfirm={(pecas) => onSplitBySize(source, snapshot, pecas)} onCancel={() => setModo('opcoes')} /></div>}
    {modo === 'manual' && <div className="split-assistant-painel split-assistant-manual">
      {partes.map((value, index) => <div className="split-assistant-manual-row" key={index}>
          <label>Peça {index + 1} (m)
            <input inputMode="decimal" value={value} onChange={(event) => setPartes(partes.map((current, i) => i === index ? event.target.value : current))} placeholder="0,00" />
          </label>
          {index === partes.length - 1 && <button type="button" className="text-button" onClick={() => usarRestante(index)}>Usar restante</button>}
        </div>)}
      <div className="split-assistant-actions">
        <button type="button" className="text-button" onClick={() => setPartes([...partes, ''])}>+ Adicionar peça</button>
        {partes.length > 2 && <button type="button" className="text-button" onClick={() => setPartes(partes.slice(0, -1))}>Remover última</button>}
      </div>
      {resultado && <p className={`split-assistant-status split-assistant-status-${resultado.status}`}>
        {resultado.status === 'completo' && `Utilizado: ${metros(resultado.usadoMm)} / ${metros(totalMm)} m · Restante: 0,00 m`}
        {resultado.status === 'incompleto' && `Utilizado: ${metros(resultado.usadoMm)} / ${metros(totalMm)} m · Restante: ${metros(resultado.restanteMm)} m`}
        {resultado.status === 'excedeu' && `Excedeu: ${metros(resultado.excedenteMm)} m`}
      </p>}
      <div className="split-assistant-confirmar">
        <button type="button" className="text-button" onClick={() => setModo('opcoes')}>Cancelar</button>
        <button type="button" className="primary-compact-button" disabled={resultado?.status !== 'completo'} onClick={() => resultado?.status === 'completo' && onSplitManual(source, snapshot, medidasMm)}>Confirmar divisão</button>
      </div>
    </div>}
  </>;
}

/**
 * Divisão das peças: um bloco compacto com uma linha por item do orçamento
 * (nome e medida à esquerda, "Dividir em" à direita). Item já dividido (mais de
 * uma peça, ou medida diferente da comercial) mostra as peças e "Reiniciar".
 */
export function AssistenteDivisaoProducao({ plan, componentSnapshots, onSplitEqual, onSplitManual, onSplitBySize, onReconcile, onDismissReview, onResetSplit }: Props) {
  return <section className="split-assistant" aria-label="Divisão das peças">
    <strong className="split-assistant-titulo">Divisão das peças</strong>
    {plan.sources.map((source) => {
      const snapshot = componentSnapshots[source.componentId];
      if (!snapshot) return null;
      const nome = snapshot.label || componentTypeLabels[snapshot.componentType];
      const pecas = plan.pieces.filter((piece) => piece.sourceComponentId === source.componentId && !piece.parentPieceId);
      const dividido = pecas.length > 1 || pecas.some((piece) => piece.lengthMm !== source.snapshotLengthMm || piece.widthMm !== source.snapshotWidthMm || piece.quantity !== source.snapshotQuantity);
      const totalPecas = pecas.reduce((soma, piece) => soma + piece.quantity, 0);
      return <div className="split-assistant-card" key={source.componentId}>
        <div className="split-assistant-item"><strong>{nome}</strong><span>{metros(source.snapshotLengthMm)} × {metros(source.snapshotWidthMm)} m{source.snapshotQuantity > 1 ? ` · ${source.snapshotQuantity} iguais` : ''}</span></div>
        {dividido ? <div className="split-assistant-result">
          <span className="split-assistant-contagem">{totalPecas} {totalPecas === 1 ? 'peça' : 'peças'}</span>
          <ul className="split-assistant-pieces">{pecas.map((piece, index) => <li key={piece.id}>{index + 1}. {metros(piece.lengthMm)} × {metros(piece.widthMm)} m{piece.quantity > 1 ? ` ×${piece.quantity}` : ''}</li>)}</ul>
          <button type="button" className="text-button" aria-label={`Reiniciar a divisão de ${nome}`} onClick={() => void confirmar({ titulo: 'Reiniciar a divisão desta peça?', mensagem: 'As peças atuais, com seus acabamentos e recortes de produção, serão substituídas por uma peça única para uma nova divisão.', confirmar: 'Reiniciar divisão' }).then((sim) => { if (sim) onResetSplit(source); })}>Reiniciar</button>
        </div>
          : <AssistenteDivisao source={source} snapshot={snapshot} nome={nome} onSplitEqual={onSplitEqual} onSplitManual={onSplitManual} onSplitBySize={onSplitBySize} />}
        {source.needsReview && <div className="split-assistant-review" role="alert">
          <p>O orçamento comercial mudou depois do detalhamento. Revise a divisão das peças.</p>
          <button type="button" className="secondary-button" onClick={() => onReconcile(source)}>Reconciliar</button>
          <button type="button" className="text-button" onClick={() => onDismissReview(source)}>Manter desenho e revisar manualmente</button>
        </div>}
      </div>;
    })}
  </section>;
}
