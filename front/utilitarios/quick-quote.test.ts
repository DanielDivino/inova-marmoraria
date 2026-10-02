import { describe, expect, it } from 'vitest';
import { calcularComponente, calcularAcabamentoBorda, calcularTotalPix } from '@inova/domain';
import { aplicarMaterialProjeto, escolherPedraDaPeca, normalizarPedrasDasPecas, arredondarMedidaParaCima, campoMetrosInicial, duplicarComponenteRapido, editarCampoMetros, formatarCampoMetros, ehPeitorilDuplo, medidasEfetivasPeitorilDuplo, metrosParaCentimetrosRascunho, prepararItemRapido, criarComponenteRapido } from './quick-quote';
import { rascunhoParaEntradaItem } from './saved-quote';
import { moverComponente } from './component-groups';
import type { DraftItem } from '../componentes/orcamento/types';

const draft = (): DraftItem => ({ id: 'p', projectName: 'Cozinha', materialId: 'stone', productTypeId: 'type', calculationMode: 'DIMENSIONS', manualM2: '', manualJustification: '', components: [{ ...criarComponenteRapido('stone'), lengthCm: '70', widthCm: '30' }], cutouts: [], serviceIds: [], serviceQuantities: {}, serviceAppliedValues: {} });
describe('Orçamento rápido compartilha o modelo detalhado', () => {
  it.each(['2,40', '2.40'])('converte %s metros para a unidade do desenho sem alterar o cálculo', value => {
    const item = draft(); item.components[0].lengthCm = metrosParaCentimetrosRascunho(value); item.components[0].widthCm = metrosParaCentimetrosRascunho('0,60');
    const input = rascunhoParaEntradaItem(item);
    expect(input.components[0]).toMatchObject({ lengthMm: 2400, widthMm: 600 });
    expect(calcularComponente(input.components[0]).billableArea).toBe(1.44);
  });
  it('remove só linha de inserção vazia e preserva recorte, medidas parciais e material', () => {
    const item = draft(); item.components.unshift(criarComponenteRapido('stone'));
    item.cutouts = [{ id: 'cut', componentIndex: 1, cutoutType: 'SINK', label: '', quantity: 1 }];
    item.components.push({ ...criarComponenteRapido('stone'), lengthCm: '20' });
    const cleaned = prepararItemRapido(item);
    expect(cleaned.components).toHaveLength(2); expect(cleaned.cutouts[0].componentIndex).toBe(0);
    expect(prepararItemRapido(draft()).components).toHaveLength(1);
  });
  it('duplica a composição com novos IDs e vínculos de recortes preservados', () => {
    const item = draft(); item.components.push({ ...criarComponenteRapido('stone'), parentComponentId: item.components[0].id, componentType: 'BACKSPLASH', parentSide: 'BACK' });
    item.cutouts = [{ id: 'cut', componentIndex: 0, cutoutType: 'SCULPTED_SINK', quantity: 1, label: '', sizePending: true }];
    const result = duplicarComponenteRapido(item, 0);
    expect(result.components![2].id).not.toBe(item.components[0].id);
    expect(result.components![3].parentComponentId).toBe(result.components![2].id);
    expect(result.cutouts![1].componentIndex).toBe(2);
    expect(result.cutouts![1].id).not.toBe('cut');
    expect(aplicarMaterialProjeto(item, 'new').components!.every(row => row.materialId === 'new')).toBe(true);
  });
  it('usa a cobrança por lado e o Pix atuais', () => {
    const amounts = [700, 300].map(lengthMm => calcularAcabamentoBorda({ name: 'Acabamento 45°', lengthMm, quantity: 1, materialPrice: 700, servicePrice: 85 }));
    expect(amounts.reduce((n, row) => n + row.billedQuantity, 0)).toBe(1);
    expect(amounts.reduce((n, row) => n + row.subtotal, 0)).toBe(85);
    expect(calcularTotalPix(1350.5)).toBe(1282.98);
  });
  it.each([
    ['19', '20'], ['34', '35'], ['96', '100'], ['6', '10'], ['10', '10'], ['210', '210'], ['', ''],
  ])('arredonda %s cm para cima, múltiplo de 5 (usado só no cálculo do valor)', (entrada, esperado) => {
    expect(arredondarMedidaParaCima(entrada)).toBe(esperado);
  });
  it('peitoril duplo: comprimento normal compartilhado + largura combinada bate com a soma das duas pedras', () => {
    const peitoril = { ...criarComponenteRapido('stone'), componentType: 'SILL' as const, lengthCm: '210', sillTopWidthCm: '7', sillBottomWidthCm: '16' };
    expect(ehPeitorilDuplo(peitoril)).toBe(true);
    expect(ehPeitorilDuplo({ ...peitoril, sillBottomWidthCm: '' })).toBe(false);
    expect(ehPeitorilDuplo({ ...peitoril, componentType: 'TOP' })).toBe(false);
    const efetiva = medidasEfetivasPeitorilDuplo(peitoril, false);
    expect(efetiva).toEqual({ lengthMm: 2100, widthMm: 230 });
    expect((efetiva!.lengthMm * efetiva!.widthMm) / 1_000_000).toBeCloseTo(0.483, 3);
    expect(medidasEfetivasPeitorilDuplo({ ...criarComponenteRapido('stone'), componentType: 'SILL' }, false)).toBeNull();
    // M² fechado: arredonda comprimento e larguras antes de somar (7->10, 16->20 cm; 210 já é múltiplo de 5).
    const arredondada = medidasEfetivasPeitorilDuplo(peitoril, true);
    expect(arredondada).toEqual({ lengthMm: 2100, widthMm: 300 });
  });
});

describe('Campo de medida em metros do Orçamento Rápido', () => {
  const digitar = (teclas: string, inicio = campoMetrosInicial('')) => [...teclas].reduce((campo, tecla) => editarCampoMetros(campo, campo.texto + tecla, { tipo: 'insertText', dado: tecla }), inicio);

  it('só números: a vírgula entra sozinha e os dois últimos dígitos são os centímetros', () => {
    expect(digitar('1').texto).toBe('0,01');
    expect(digitar('12').texto).toBe('0,12');
    expect(digitar('120').texto).toBe('1,20');
    expect(digitar('45').texto).toBe('0,45');
    expect(digitar('0240').texto).toBe('2,40');
    expect(metrosParaCentimetrosRascunho(digitar('120').texto)).toBe('120');
  });

  it('vírgula digitada vale como está e não duplica', () => {
    expect(digitar('1,2')).toEqual({ texto: '1,2', livre: true });
    expect(digitar('12,5').texto).toBe('12,5');
    expect(digitar(',5').texto).toBe('0,5');
    expect(digitar('1,,2').texto).toBe('1,2');
    expect(digitar('1,2,').texto).toBe('1,2');
    expect(digitar('1.2').texto).toBe('1,2');
    expect(digitar('1,2055').texto).toBe('1,205');
    expect(metrosParaCentimetrosRascunho(digitar('1,2').texto)).toBe('120');
    expect(metrosParaCentimetrosRascunho(digitar('1,').texto)).toBe('100');
  });

  it('apagar refaz a máscara; apagar a vírgula digitada volta a contar centímetros', () => {
    expect(editarCampoMetros(digitar('120'), '1,2', { tipo: 'deleteContentBackward', dado: null }).texto).toBe('0,12');
    expect(editarCampoMetros(digitar('1,'), '1', { tipo: 'deleteContentBackward', dado: null })).toEqual({ texto: '0,01', livre: false });
    expect(editarCampoMetros(digitar('1'), '', { tipo: 'deleteContentBackward', dado: null })).toEqual({ texto: '', livre: false });
  });

  it('colar ou preencher de uma vez aceita com e sem vírgula', () => {
    const atual = campoMetrosInicial('70');
    expect(editarCampoMetros(atual, '2,40', { tipo: 'insertFromPaste', dado: null }).texto).toBe('2,40');
    expect(editarCampoMetros(atual, '0.30', { tipo: 'insertText', dado: '0.30' }).texto).toBe('0,30');
    expect(editarCampoMetros(atual, '240', { tipo: 'insertFromPaste', dado: null }).texto).toBe('2,40');
    // Sem informação do evento, deduz pela diferença de texto.
    expect(editarCampoMetros(campoMetrosInicial(''), '1,15').texto).toBe('1,15');
    expect(editarCampoMetros(digitar('12'), '0,120').texto).toBe('1,20');
  });

  it('mostra a medida salva com duas casas, ou três quando há milímetros', () => {
    expect(formatarCampoMetros('120')).toBe('1,20');
    expect(formatarCampoMetros('70')).toBe('0,70');
    expect(formatarCampoMetros('120.5')).toBe('1,205');
    expect(formatarCampoMetros('')).toBe('');
    expect(campoMetrosInicial('120.5')).toEqual({ texto: '1,205', livre: true });
    expect(campoMetrosInicial('120')).toEqual({ texto: '1,20', livre: false });
  });
});

describe('Ordem das peças', () => {
  it('arrastar muda a ordem e o recorte acompanha a peça', () => {
    const base = draft();
    const item = { ...base, components: [...base.components, { ...criarComponenteRapido('stone'), lengthCm: '50', widthCm: '40' }], cutouts: [{ id: 'cuba', componentIndex: 1, cutoutType: 'SINK' as const, label: '', quantity: 1 }] };
    const movido = { ...item, ...moverComponente(item, 1, 0) };
    expect(movido.components.map((component) => component.lengthCm)).toEqual(['50', '70']);
    expect(movido.cutouts[0].componentIndex).toBe(0);
    expect(moverComponente(item, 0, 0).components).toEqual(item.components);
  });
});

describe('Pedra do projeto e pedra própria da peça', () => {
  const projeto = () => { const item = draft(); item.components.push({ ...criarComponenteRapido('stone'), lengthCm: '180', widthCm: '60' }, { ...criarComponenteRapido('stone'), lengthCm: '90', widthCm: '60', ...escolherPedraDaPeca(item, 'alaska') }); return item; };
  const pedras = (item: DraftItem) => item.components.map((component) => component.materialId);

  it('trocar a pedra do projeto muda só as peças que seguem o projeto', () => {
    const item = projeto();
    const trocado = { ...item, ...aplicarMaterialProjeto(item, 'branco') };
    expect(trocado.materialId).toBe('branco');
    expect(pedras(trocado)).toEqual(['branco', 'branco', 'alaska']);
  });

  it('a pedra própria continua mesmo se o projeto passar por ela e voltar', () => {
    let item = projeto();
    item = { ...item, ...aplicarMaterialProjeto(item, 'alaska') };
    expect(pedras(item)).toEqual(['alaska', 'alaska', 'alaska']);
    item = { ...item, ...aplicarMaterialProjeto(item, 'branco') };
    expect(pedras(item)).toEqual(['branco', 'branco', 'alaska']);
  });

  it('escolher na peça a pedra do projeto (ou "Usar pedra do projeto") volta a acompanhar o projeto', () => {
    const item = projeto();
    expect(escolherPedraDaPeca(item, 'stone')).toEqual({ materialId: 'stone', materialProprio: undefined });
    expect(escolherPedraDaPeca(item, undefined)).toEqual({ materialId: 'stone', materialProprio: undefined });
    expect(escolherPedraDaPeca(item, 'alaska')).toEqual({ materialId: 'alaska', materialProprio: true });
  });

  it('rascunho antigo: pedra diferente da do projeto vira pedra própria; peça sem pedra segue o projeto', () => {
    const [a, b, c] = normalizarPedrasDasPecas({ materialId: 'stone' }, [{ ...criarComponenteRapido('stone') }, { ...criarComponenteRapido('alaska') }, { ...criarComponenteRapido(''), materialId: undefined }]);
    expect([a.materialProprio, b.materialProprio, c.materialProprio]).toEqual([undefined, true, undefined]);
    expect(c.materialId).toBe('stone');
  });

  it('ao salvar, a pedra do projeto não é trocada pela da primeira peça', () => {
    const item = projeto();
    item.components = [item.components[2], item.components[0], item.components[1]];
    const entrada = rascunhoParaEntradaItem(item);
    expect(entrada.materialId).toBe('stone');
    expect(entrada.components.map((component) => component.materialId)).toEqual(['alaska', 'stone', 'stone']);
    expect(rascunhoParaEntradaItem({ ...item, components: [{ ...item.components[1], materialId: undefined }] }).components[0].materialId).toBe('stone');
  });
});
