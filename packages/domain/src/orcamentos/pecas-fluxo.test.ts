import { describe, expect, it } from 'vitest';
import { contornoDosParametros, emptyTechnicalDocument, featureSchema, makePiece } from '../tecnico/index.js';
import { alocarEntrega, CHAVE_PROJETO_INTEIRO, conferirSelecaoPecas, distribuirPecas, numeroNotaEntrega, pecasDoProjeto, situacaoDasPecas, somarPecas, subtrairPecas, totalPecas } from './pecas-fluxo';

const componentes = [
  { id: 'bancada', label: '', componentType: 'COUNTER', lengthMm: 2000, widthMm: 600, quantity: 1, materialNameSnapshot: 'Branco Itaúnas' },
  { id: 'soleira', label: 'Soleira porta', componentType: 'THRESHOLD', lengthMm: 900, widthMm: 150, quantity: 3 },
];

describe('peças do projeto', () => {
  it('usa os componentes, com o material de cada um ou o do projeto', () => {
    expect(pecasDoProjeto({ quantity: 1, materialNameSnapshot: 'Verde Ubatuba', components: componentes })).toEqual([
      { chave: 'bancada', nome: 'Bancada', material: 'Branco Itaúnas', lengthMm: 2000, widthMm: 600, quantidade: 1 },
      { chave: 'soleira', nome: 'Soleira porta', material: 'Verde Ubatuba', lengthMm: 900, widthMm: 150, quantidade: 3 },
    ]);
  });
  it('com desenho técnico ligado, usa as pedras do desenho (emendas, rodabanca), a quantidade da linha e as linhas que ainda não estão no desenho', () => {
    const doc = emptyTechnicalDocument();
    const parameters = { ...makePiece('b').parameters!, shape: 'RECTANGLE' as const, width: 4000, length: 600 };
    doc.pieces.push({ ...makePiece('b'), name: 'Bancada', geometryMode: 'PARAMETRIC', parameters, contour: contornoDosParametros('b', parameters), material: { id: 'm', name: 'Preto São Gabriel', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } });
    doc.features.push(featureSchema.parse({ id: 'e', type: 'SEAM', pieceId: 'b', x: 0, y: 0, edgeId: 'b-v0', startMm: 2400 }), featureSchema.parse({ id: 'r', type: 'BACKSPLASH', pieceId: 'b', x: 0, y: 0, edgeId: 'b-v2', startMm: 0, extentMm: 4000, heightMm: 100 }));
    const drawingData = { desenhoTecnico: { designId: 'd', sincronia: { pecas: { bancada: { pecaId: 'b' } } } } };
    const pecas = pecasDoProjeto({ quantity: 1, drawingData, components: [{ ...componentes[0], quantity: 2 }, componentes[1]] }, doc);
    expect(pecas.map((peca) => [peca.chave, peca.nome, peca.lengthMm, peca.widthMm, peca.quantidade, peca.material])).toEqual([
      ['b:1', 'Bancada · parte 1', 2400, 600, 2, 'Preto São Gabriel'], ['b:2', 'Bancada · parte 2', 1600, 600, 2, 'Preto São Gabriel'],
      ['r', 'Rodabanca · Bancada', 4000, 100, 1, 'Preto São Gabriel'], ['soleira', 'Soleira porta', 900, 150, 3, null],
    ]);
  });
  it('com plano de produção (projetos antigos), usa as peças físicas da OS', () => {
    const drawingData = { productionPlan: { version: 1, sources: [], cutouts: [], pieces: [
      { id: 'p1', sourceComponentId: 'bancada', label: 'Bancada A', componentType: 'COUNTER', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 600, quantity: 1, edges: [] },
      { id: 'p2', sourceComponentId: 'bancada', label: 'Bancada B', componentType: 'COUNTER', orientation: 'HORIZONTAL', lengthMm: 1000, widthMm: 600, quantity: 1, edges: [] },
    ] } };
    expect(pecasDoProjeto({ quantity: 1, drawingData, components: componentes }).map((peca) => [peca.chave, peca.nome, peca.material, peca.quantidade]))
      .toEqual([['p1', 'Bancada A', 'Branco Itaúnas', 1], ['p2', 'Bancada B', 'Branco Itaúnas', 1]]);
  });
  it('sem componentes (área manual), o projeto inteiro é uma peça', () => {
    expect(pecasDoProjeto({ projectName: 'Lavabo', quantity: 2, materialNameSnapshot: 'Preto' })).toEqual([{ chave: CHAVE_PROJETO_INTEIRO, nome: 'Lavabo', material: 'Preto', lengthMm: null, widthMm: null, quantidade: 2 }]);
  });
});

describe('cartões divididos', () => {
  const pecas = pecasDoProjeto({ quantity: 1, components: componentes });
  it('o principal fica com o que não está nas partes', () => {
    const mapa = distribuirPecas(pecas, [{ id: 'principal', pieces: null }, { id: 'parte', pieces: { soleira: 2 } }]);
    expect(mapa.get('principal')).toEqual({ bancada: 1, soleira: 1 });
    expect(mapa.get('parte')).toEqual({ soleira: 2 });
  });
  it('orçamento editado: parte limitada ao que existe e peça removida volta ao principal', () => {
    const mapa = distribuirPecas(pecas, [{ id: 'principal', pieces: null }, { id: 'a', pieces: { soleira: 2, sumiu: 4 } }, { id: 'b', pieces: { soleira: 5, bancada: 'x' } }]);
    expect(mapa.get('a')).toEqual({ soleira: 2 });
    expect(mapa.get('b')).toEqual({ soleira: 1 });
    expect(mapa.get('principal')).toEqual({ bancada: 1 });
  });
  it('soma, subtrai e conta sem deixar zeros', () => {
    expect(somarPecas({ a: 1 }, { a: 2, b: 1 })).toEqual({ a: 3, b: 1 });
    expect(subtrairPecas({ a: 3, b: 1 }, { b: 1 })).toEqual({ a: 3 });
    expect(totalPecas({ a: 3, b: 1 })).toBe(4);
  });
  it('confere a seleção: completa, parcial, vazia, acima do disponível ou quebrada', () => {
    expect(conferirSelecaoPecas({ a: 2, b: 1 }, { a: 2, b: 1 })).toEqual({ selecao: { a: 2, b: 1 }, completa: true });
    expect(conferirSelecaoPecas({ a: 2, b: 1 }, { a: 1, b: 0 })).toEqual({ selecao: { a: 1 }, completa: false });
    expect(conferirSelecaoPecas({ a: 2 }, { a: 0 })).toEqual({ erro: 'Escolha pelo menos uma peça.' });
    expect(conferirSelecaoPecas({ a: 2 }, { a: 3 })).toHaveProperty('erro');
    expect(conferirSelecaoPecas({ a: 2 }, { c: 1 })).toHaveProperty('erro');
    expect(conferirSelecaoPecas({ a: 2 }, { a: 1.5 })).toHaveProperty('erro');
  });
});

describe('entrega por peças', () => {
  const cartoes = [
    { id: 'andamento', status: 'IN_PROGRESS' as const, position: 0, mapa: { soleira: 1, bancada: 1 } },
    { id: 'pronto', status: 'DONE' as const, position: 5, mapa: { soleira: 2 } },
    { id: 'entregue', status: 'DELIVERED' as const, position: 0, mapa: { soleira: 1 } },
  ];
  it('tira primeiro das peças produzidas e nunca das já entregues', () => {
    expect(alocarEntrega(cartoes, { soleira: 3 })).toEqual(new Map([['pronto', { soleira: 2 }], ['andamento', { soleira: 1 }]]));
    expect(alocarEntrega(cartoes, { soleira: 4 })).toBeNull();
  });
  it('mostra entregues, prontas e em produção de cada peça', () => {
    const pecas = pecasDoProjeto({ quantity: 1, components: [...componentes, { ...componentes[1], quantity: 1, id: 'extra' }] });
    expect(situacaoDasPecas(pecas, cartoes).map((peca) => [peca.chave, peca.entregues, peca.prontas, peca.emProducao]))
      .toEqual([['bancada', 0, 0, 1], ['soleira', 1, 2, 1], ['extra', 0, 0, 0]]);
  });
  it('numera a nota pela entrega do orçamento', () => {
    expect(numeroNotaEntrega('SET-2026-21', 2)).toBe('ENT-2026-21.2');
  });
});
