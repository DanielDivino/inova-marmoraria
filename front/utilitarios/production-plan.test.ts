import { describe, expect, it } from 'vitest';
import { dadosEntradaProjeto } from '@inova/domain';
import { pecaParaComponente, componenteParaPeca, reconciliarPlano, aplicarDivisaoIgual, aplicarDivisaoManual, aplicarSeguirDivisao, aceitarMudancaComercial } from './production-plan';
import { criarComponenteRapido } from './quick-quote';
import type { DraftItem } from '../componentes/orcamento/types';

const draft = (): DraftItem => ({ id: 'p', projectName: 'Cozinha', materialId: 'stone', productTypeId: 'type', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [{ ...criarComponenteRapido('stone'), id: 'comp-1', lengthCm: '360', widthCm: '60' }], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {}, drawingData: dadosEntradaProjeto(undefined, 'QUICK') });

describe('adaptador peça de produção <-> DraftComponent', () => {
  it('vai e volta sem perder medidas, lados nem material fora (produção não tem materialId nem preço)', () => {
    const item = draft();
    const plano = reconciliarPlano(item, undefined);
    const peca = plano.pieces[0];
    expect(peca.sourceComponentId).toBe('comp-1');
    expect(peca.lengthMm).toBe(3600); expect(peca.widthMm).toBe(600);
    const componente = pecaParaComponente(peca);
    expect(componente).not.toHaveProperty('materialId');
    expect(componente).not.toHaveProperty('appliedTotal');
    expect(componente.lengthCm).toBe('360'); expect(componente.widthCm).toBe('60');
    const voltaParaPeca = componenteParaPeca(componente, peca.sourceComponentId, []);
    expect(voltaParaPeca.lengthMm).toBe(3600); expect(voltaParaPeca.widthMm).toBe(600);
  });
});

describe('reconciliarPlano', () => {
  it('cria uma peça inicial (sem dividir) por componente comercial novo', () => {
    const plano = reconciliarPlano(draft(), undefined);
    expect(plano.pieces).toHaveLength(1);
    expect(plano.pieces[0]).toMatchObject({ lengthMm: 3600, widthMm: 600, quantity: 1 });
    expect(plano.sources[0]).toMatchObject({ componentId: 'comp-1', snapshotLengthMm: 3600, snapshotWidthMm: 600 });
  });
  it('quantidade comercial > 1 não vira um comprimento único: a peça inicial herda a quantidade', () => {
    const item = draft(); item.components[0] = { ...item.components[0], lengthCm: '70', widthCm: '30', quantity: 3 };
    const plano = reconciliarPlano(item, undefined);
    expect(plano.pieces).toHaveLength(1);
    expect(plano.pieces[0]).toMatchObject({ lengthMm: 700, widthMm: 300, quantity: 3 });
  });
  it('preserva peças já divididas ao reconciliar de novo (não apaga trabalho do usuário)', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    expect(plano.pieces).toHaveLength(3);
    const reconciliado = reconciliarPlano(item, plano);
    expect(reconciliado.pieces).toHaveLength(3);
    expect(reconciliado.pieces.map((piece) => piece.lengthMm)).toEqual(plano.pieces.map((piece) => piece.lengthMm));
  });
  it('marca needsReview quando o comercial muda depois do detalhamento, sem apagar as peças', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    item.components[0] = { ...item.components[0], lengthCm: '400' };
    const reconciliado = reconciliarPlano(item, plano);
    expect(reconciliado.sources[0].needsReview).toBe(true);
    expect(reconciliado.pieces).toHaveLength(3);
  });
  it('vincula a peça de uma rodabanca anexada (Orçamento Rápido) à peça-raiz da origem comercial pai', () => {
    const item = draft();
    item.components.push({ ...criarComponenteRapido('stone'), id: 'comp-2', label: 'Rodabanca', componentType: 'BACKSPLASH', lengthCm: '360', widthCm: '10', parentComponentId: 'comp-1', parentSide: 'FRONT' });
    const plano = reconciliarPlano(item, undefined);
    const raiz = plano.pieces.find((piece) => piece.sourceComponentId === 'comp-1')!;
    const filha = plano.pieces.find((piece) => piece.sourceComponentId === 'comp-2')!;
    expect(filha.parentPieceId).toBe(raiz.id);
    expect(filha.parentSide).toBe('FRONT');
  });
  it('não vincula a peça anexada quando a origem pai já foi dividida (ambíguo — nasce como raiz solta)', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 2);
    item.components.push({ ...criarComponenteRapido('stone'), id: 'comp-2', label: 'Rodabanca', componentType: 'BACKSPLASH', lengthCm: '360', widthCm: '10', parentComponentId: 'comp-1', parentSide: 'FRONT' });
    const reconciliado = reconciliarPlano(item, plano);
    const filha = reconciliado.pieces.find((piece) => piece.sourceComponentId === 'comp-2')!;
    expect(filha.parentPieceId).toBeUndefined();
  });
  it('cria um recorte de produção automaticamente para um recorte comercial sem equivalente ainda, apontando pra peça-raiz', () => {
    const item = draft();
    item.cutouts.push({ id: 'cut-1', componentIndex: 0, cutoutType: 'SINK', label: 'Cuba', quantity: 1, lengthCm: '56', widthCm: '34' });
    const plano = reconciliarPlano(item, undefined);
    expect(plano.cutouts).toHaveLength(1);
    expect(plano.cutouts[0]).toMatchObject({ pieceId: plano.pieces[0].id, sourceCutoutId: 'cut-1', cutoutType: 'SINK', lengthMm: 560, widthMm: 340 });
  });
  it('não duplica o recorte de produção já existente ao reconciliar de novo', () => {
    const item = draft();
    item.cutouts.push({ id: 'cut-1', componentIndex: 0, cutoutType: 'SINK', label: 'Cuba', quantity: 1, lengthCm: '56', widthCm: '34' });
    const plano = reconciliarPlano(item, undefined);
    const reconciliado = reconciliarPlano(item, plano);
    expect(reconciliado.cutouts).toHaveLength(1);
    expect(reconciliado.cutouts[0].id).toBe(plano.cutouts[0].id);
  });
  it('não cria recorte de produção quando a origem já foi dividida (ambíguo)', () => {
    const item = draft();
    item.cutouts.push({ id: 'cut-1', componentIndex: 0, cutoutType: 'SINK', label: 'Cuba', quantity: 1, lengthCm: '56', widthCm: '34' });
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 2);
    const reconciliado = reconciliarPlano(item, plano);
    expect(reconciliado.cutouts).toHaveLength(0);
  });
});

describe('reconciliarPlano carrega os acabamentos da peça comercial', () => {
  it('a peça inicial herda os edges do componente comercial, com o nome do serviço resolvido', () => {
    const item = draft();
    item.components[0] = { ...item.components[0], edges: [{ side: 'FRONT', serviceId: 'svc-45', quantity: 1 }] };
    const plano = reconciliarPlano(item, undefined, [{ id: 'svc-45', name: 'Acabamento 45°' }]);
    expect(plano.pieces[0].edges).toEqual([{ side: 'FRONT', serviceId: 'svc-45', serviceName: 'Acabamento 45°', lengthMm: undefined, heightMm: undefined, quantity: 1 }]);
  });
  it('sem a lista de serviços, ainda cria o edge (com um nome genérico) em vez de descartá-lo', () => {
    const item = draft();
    item.components[0] = { ...item.components[0], edges: [{ side: 'FRONT', serviceId: 'svc-45', quantity: 1 }] };
    const plano = reconciliarPlano(item, undefined);
    expect(plano.pieces[0].edges).toHaveLength(1);
    expect(plano.pieces[0].edges[0].serviceName).toBe('Acabamento');
  });
});

describe('divisão aplicada ao plano', () => {
  it('divisão igual em 3 peças soma exatamente ao comprimento comercial', () => {
    const item = draft();
    const plano = reconciliarPlano(item, undefined);
    const dividido = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    expect(dividido.pieces).toHaveLength(3);
    expect(dividido.pieces.reduce((sum, piece) => sum + piece.lengthMm, 0)).toBe(3600);
    expect(dividido.pieces.every((piece) => piece.widthMm === 600)).toBe(true);
  });
  it('divisão manual 1400/900/1300 mantém 45° herdado do inferior em todas', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    const pecaComAcabamento = { ...plano.pieces[0], edges: [{ side: 'FRONT' as const, serviceId: 'svc-45', serviceName: 'Acabamento 45°', quantity: 1 }] };
    plano = { ...plano, pieces: [pecaComAcabamento] };
    const dividido = aplicarDivisaoManual(plano, plano.sources[0], pecaComAcabamento, [1400, 900, 1300]);
    expect(dividido.pieces.map((piece) => piece.lengthMm)).toEqual([1400, 900, 1300]);
    expect(dividido.pieces.every((piece) => piece.edges.some((edge) => edge.side === 'FRONT'))).toBe(true);
  });
  it('substitui peças antigas da mesma origem ao redividir, sem duplicar', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 2);
    expect(plano.pieces).toHaveLength(2);
    expect(plano.pieces.reduce((sum, piece) => sum + piece.lengthMm, 0)).toBe(3600);
  });
});

describe('aceitarMudancaComercial', () => {
  it('reconciliar reinicia a origem com uma peça só, na medida nova, e limpa needsReview', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    item.components[0] = { ...item.components[0], lengthCm: '400' };
    plano = reconciliarPlano(item, plano);
    expect(plano.sources[0].needsReview).toBe(true);
    const reconciliado = aceitarMudancaComercial(plano, item, 'comp-1', true);
    expect(reconciliado.sources[0].needsReview).toBe(false);
    expect(reconciliado.sources[0].snapshotLengthMm).toBe(4000);
    expect(reconciliado.pieces.filter((piece) => piece.sourceComponentId === 'comp-1')).toHaveLength(1);
    expect(reconciliado.pieces[0].lengthMm).toBe(4000);
  });
  it('manter e revisar manualmente só limpa needsReview, sem tocar nas peças já divididas', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    item.components[0] = { ...item.components[0], lengthCm: '400' };
    plano = reconciliarPlano(item, plano);
    const mantido = aceitarMudancaComercial(plano, item, 'comp-1', false);
    expect(mantido.sources[0].needsReview).toBe(false);
    expect(mantido.pieces.filter((piece) => piece.sourceComponentId === 'comp-1')).toHaveLength(3);
    // Reconciliando de novo não deve reacusar mudança, já que o snapshot foi atualizado.
    const outraVez = reconciliarPlano(item, mantido);
    expect(outraVez.sources[0].needsReview).toBe(false);
  });
});

describe('rodabanca seguindo a divisão da bancada', () => {
  it('cria uma rodabanca por peça de bancada, vinculada via parentPieceId', () => {
    const item = draft();
    let plano = reconciliarPlano(item, undefined);
    plano = aplicarDivisaoIgual(plano, plano.sources[0], plano.pieces[0], 3);
    plano = aplicarSeguirDivisao(plano, 'comp-1', 'FRONT', 100, 'BACKSPLASH');
    const rodabancas = plano.pieces.filter((piece) => piece.componentType === 'BACKSPLASH');
    expect(rodabancas).toHaveLength(3);
    expect(rodabancas.every((piece) => piece.widthMm === 100)).toBe(true);
    expect(rodabancas.map((piece) => piece.parentPieceId).sort()).toEqual(plano.pieces.filter((piece) => piece.componentType !== 'BACKSPLASH').map((piece) => piece.id).sort());
  });
});
