import { describe, expect, it } from 'vitest';
import { contornoDosParametros, edgeLength, makePiece, validateTechnicalDocument } from './geometry.js';
import { emptyTechnicalDocument, featureSchema, technicalDocumentSchema, type TechnicalDocument } from './schema.js';
import { ladoDaPeca, sincronizarDesenho, type ProjetoNoOrcamento, type SincroniaDesenho } from './sincronia.js';
import { desenhoParaOrcamento } from './orcamento.js';

const catalogo = {
  materiais: [{ id: 'm1', name: 'Branco Dallas' }, { id: 'm2', name: 'Preto São Gabriel', imageUrl: '/uploads/materials/preto.jpg' }],
  servicos: [{ id: 'saia', name: 'Saia' }, { id: 'a45', name: 'Acabamento 45°' }, { id: 'simples', name: 'Acabamento simples' }, { id: 'vista', name: 'Vista' }],
};
let sequencia = 0;
const novoId = () => `novo${++sequencia}`;
const retangulo = (id: string, width: number, length: number, extra: object = {}) => {
  const parameters = { ...makePiece(id).parameters!, shape: 'RECTANGLE' as const, width, length };
  return { ...makePiece(id), name: 'Bancada', geometryMode: 'PARAMETRIC' as const, parameters, contour: contornoDosParametros(id, parameters), material: { id: 'm1', name: 'Branco Dallas', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 }, ...extra };
};

/** Bancada 2m × 60cm com saia na frente e cuba, vinda do desenho ("Usar no orçamento"). */
function cenario() {
  const doc: TechnicalDocument = emptyTechnicalDocument();
  doc.pieces.push(retangulo('p1', 2000, 600, { x: 0, y: 0 }));
  doc.features.push(
    featureSchema.parse({ id: 'f1', type: 'SKIRT', pieceId: 'p1', name: 'Saia', x: 0, y: 0, edgeId: 'p1-v0', startMm: 0, extentMm: 2000, heightMm: 100 }),
    featureSchema.parse({ id: 'f2', type: 'SINK', pieceId: 'p1', name: 'Cuba', x: 1000, y: 300, widthMm: 500, lengthMm: 400 }),
  );
  const base: ProjetoNoOrcamento = {
    nome: 'Cozinha',
    pecas: [{ id: 'c1', label: 'Bancada', componentType: 'TOP', lengthMm: 2000, widthMm: 600, materialId: 'm1', bordas: [{ side: 'FRONT', serviceId: 'saia', heightMm: 100 }] }],
    recortes: [{ id: 'r1', pecaId: 'c1', cutoutType: 'SINK', label: 'Cuba', lengthMm: 500, widthMm: 400, positionX: 1000, positionY: 300 }],
  };
  const sincronia: SincroniaDesenho = { pecas: { c1: { pecaId: 'p1', forma: 'RETANGULO', parte: 0 } }, bordas: { c1: { 'FRONT:SKIRT': 'f1' } }, recortes: { r1: 'f2' }, base };
  return { doc, base, sincronia, projeto: structuredClone(base) };
}
const valido = (doc: TechnicalDocument) => {
  technicalDocumentSchema.parse(doc);
  expect(validateTechnicalDocument(doc).filter((diagnostico) => diagnostico.severity === 'STRUCTURAL')).toEqual([]);
};

describe('orçamento → desenho técnico', () => {
  it('sem mudança no orçamento, o desenho fica como está', () => {
    const { doc, sincronia, projeto } = cenario();
    const resultado = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    expect(resultado.alterado).toBe(false);
    expect(resultado.documento).toEqual(doc);
  });

  it('medidas, nome e pedra da peça retangular; a saia que cobria o lado continua cobrindo', () => {
    const { doc, sincronia, projeto } = cenario();
    Object.assign(projeto.pecas[0], { lengthMm: 2400, widthMm: 650, label: 'Bancada da pia', materialId: 'm2' });
    const { documento, alterado, avisos } = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    expect(alterado).toBe(true);
    expect(avisos).toEqual([]);
    const peca = documento.pieces[0];
    expect(peca.parameters).toMatchObject({ width: 2400, length: 650 });
    expect(peca.name).toBe('Bancada da pia');
    expect(peca.material).toMatchObject({ id: 'm2', name: 'Preto São Gabriel', imageUrl: '/uploads/materials/preto.jpg' });
    expect(documento.features.find((recurso) => recurso.id === 'f1')!.extentMm).toBe(2400);
    valido(documento);
  });

  it('saia e acabamento: tira o que saiu, põe o que entrou no lado certo e muda a altura', () => {
    const { doc, sincronia, projeto } = cenario();
    projeto.pecas[0].bordas = [{ side: 'BACK', serviceId: 'a45' }, { side: 'LEFT', serviceId: 'vista', heightMm: 40 }];
    const { documento, sincronia: depois } = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    expect(documento.features.some((recurso) => recurso.id === 'f1')).toBe(false);
    const acabamento = documento.features.find((recurso) => recurso.type === 'EDGE_FINISH')!;
    expect(acabamento).toMatchObject({ edgeId: ladoDaPeca(documento.pieces[0], 'BACK'), profile: 'MITER45', extentMm: 2000 });
    // Vista não existe no desenho.
    expect(documento.features.filter((recurso) => recurso.type === 'SKIRT')).toHaveLength(0);
    expect(depois.bordas.c1).toEqual({ 'BACK:EDGE_FINISH': acabamento.id });
    valido(documento);

    const alta = cenario();
    alta.projeto.pecas[0].bordas[0].heightMm = 150;
    expect(sincronizarDesenho(alta.doc, alta.projeto, alta.sincronia, catalogo, novoId).documento.features.find((recurso) => recurso.id === 'f1')!.heightMm).toBe(150);
  });

  it('cuba: muda de tamanho e lugar, sai do desenho quando sai do orçamento; cooktop novo entra na peça', () => {
    const mudou = cenario();
    Object.assign(mudou.projeto.recortes[0], { lengthMm: 600, positionX: 500 });
    const cuba = sincronizarDesenho(mudou.doc, mudou.projeto, mudou.sincronia, catalogo, novoId).documento.features.find((recurso) => recurso.id === 'f2')!;
    expect(cuba).toMatchObject({ widthMm: 600, lengthMm: 400, x: 500, y: 300 });

    const { doc, sincronia, projeto } = cenario();
    projeto.recortes = [{ id: 'r2', pecaId: 'c1', cutoutType: 'COOKTOP', label: 'Cooktop', lengthMm: 560, widthMm: 490 }];
    const { documento, sincronia: depois } = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    expect(documento.features.some((recurso) => recurso.id === 'f2')).toBe(false);
    const cooktop = documento.features.find((recurso) => recurso.type === 'CUTOUT')!;
    expect(cooktop).toMatchObject({ name: 'Cooktop', widthMm: 560, lengthMm: 490, x: 1000, y: 300 });
    expect(depois.recortes).toEqual({ r2: cooktop.id });
    valido(documento);
  });

  it('peça nova entra à direita; rodabanca nova presa à bancada entra no lado dela; peça tirada sai', () => {
    const { doc, sincronia, projeto } = cenario();
    projeto.pecas.push(
      { id: 'c2', label: 'Soleira', componentType: 'THRESHOLD', lengthMm: 900, widthMm: 150, materialId: 'm2', bordas: [{ side: 'FRONT', serviceId: 'simples' }] },
      { id: 'c3', label: 'Rodabanca', componentType: 'BACKSPLASH', lengthMm: 2000, widthMm: 100, materialId: 'm1', paiId: 'c1', ladoPai: 'BACK', bordas: [] },
    );
    const { documento, sincronia: depois } = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    const soleira = documento.pieces.find((peca) => peca.name === 'Soleira')!;
    expect(soleira).toMatchObject({ parameters: { shape: 'RECTANGLE', width: 900, length: 150 }, material: { id: 'm2' }, x: 2600, y: 0 });
    expect(documento.features.find((recurso) => recurso.pieceId === soleira.id)).toMatchObject({ type: 'EDGE_FINISH', profile: 'SIMPLE', edgeId: ladoDaPeca(soleira, 'FRONT') });
    const rodabanca = documento.features.find((recurso) => recurso.type === 'BACKSPLASH')!;
    expect(rodabanca).toMatchObject({ pieceId: 'p1', edgeId: 'p1-v2', extentMm: 2000, heightMm: 100 });
    expect(depois.pecas).toMatchObject({ c2: { pecaId: soleira.id }, c3: { pecaId: 'p1', recursoId: rodabanca.id } });
    valido(documento);

    // Tirar a soleira e a rodabanca do orçamento tira as duas do desenho.
    const semElas = sincronizarDesenho(documento, { ...projeto, pecas: [projeto.pecas[0]] }, depois, catalogo, novoId);
    expect(semElas.documento.pieces.map((peca) => peca.id)).toEqual(['p1']);
    expect(semElas.documento.features.some((recurso) => recurso.type === 'BACKSPLASH')).toBe(false);
    // E tirar a bancada tira a peça, a saia e a cuba.
    const vazio = sincronizarDesenho(semElas.documento, { ...projeto, pecas: [], recortes: [] }, semElas.sincronia, catalogo, novoId);
    expect(vazio.documento.pieces).toEqual([]);
    expect(vazio.documento.features).toEqual([]);
  });

  it('cantos arredondados: a peça vira a Arredondada do desenho e volta a ter cantos retos; saia e cuba ficam no lugar', () => {
    const { doc, sincronia, projeto } = cenario();
    projeto.pecas[0].raioCantosMm = 100;
    const redonda = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    const peca = redonda.documento.pieces[0];
    expect(peca).toMatchObject({ geometryMode: 'PARAMETRIC', parameters: { shape: 'ROUNDED', width: 2000, length: 600, radius: 100 }, x: 0, y: 0 });
    expect(peca.contour).toHaveLength(8);
    expect(redonda.documento.features.find((recurso) => recurso.id === 'f1')).toMatchObject({ edgeId: ladoDaPeca(peca, 'FRONT'), extentMm: 1800 });
    expect(redonda.documento.features.find((recurso) => recurso.id === 'f2')).toMatchObject({ x: 1000, y: 300 });
    valido(redonda.documento);
    // No caminho de volta ("Usar no orçamento"), a peça arredondada vem com os cantos arredondados.
    expect(desenhoParaOrcamento(redonda.documento, catalogo.servicos.map((servico) => ({ ...servico, billingUnit: 'LINEAR_METER' as const }))).componentes[0]).toMatchObject({ raioCantosMm: 100, lengthMm: 2000, widthMm: 600 });

    const reta = sincronizarDesenho(redonda.documento, { ...projeto, pecas: [{ ...projeto.pecas[0], raioCantosMm: undefined }] }, redonda.sincronia, catalogo, novoId);
    expect(reta.documento.pieces[0]).toMatchObject({ parameters: { shape: 'RECTANGLE', radius: 0 } });
    expect(reta.documento.pieces[0].contour).toHaveLength(4);
    expect(reta.documento.features.find((recurso) => recurso.id === 'f1')).toMatchObject({ edgeId: 'p1-v0', extentMm: 2000 });
    valido(reta.documento);

    // Peça em desenho livre, fora da origem: arredonda sem sair do lugar.
    const livre: TechnicalDocument = emptyTechnicalDocument();
    livre.pieces.push({ ...makePiece('q1'), geometryMode: 'FREE', parameters: undefined, x: 500, y: 200, contour: [{ id: 'a', x: 100, y: 50, bulge: 0 }, { id: 'b', x: 1100, y: 50, bulge: 0 }, { id: 'c', x: 1100, y: 650, bulge: 0 }, { id: 'd', x: 100, y: 650, bulge: 0 }] });
    livre.features.push(featureSchema.parse({ id: 'cuba', type: 'SINK', pieceId: 'q1', x: 600, y: 350 }));
    const baseLivre: ProjetoNoOrcamento = { nome: 'X', recortes: [], pecas: [{ id: 'k', label: 'Peça', componentType: 'TOP', lengthMm: 1000, widthMm: 600, bordas: [] }] };
    const arredondada = sincronizarDesenho(livre, { ...baseLivre, pecas: [{ ...baseLivre.pecas[0], raioCantosMm: 50 }] }, { pecas: { k: { pecaId: 'q1', forma: 'RETANGULO', parte: 0 } }, bordas: {}, recortes: {}, base: baseLivre }, catalogo, novoId);
    expect(arredondada.documento.pieces[0]).toMatchObject({ x: 600, y: 250, parameters: { shape: 'ROUNDED', width: 1000, length: 600, radius: 50 } });
    expect(arredondada.documento.features[0]).toMatchObject({ x: 500, y: 300 });
    valido(arredondada.documento);
  });

  it('peça nova com cantos arredondados já entra arredondada', () => {
    const { projeto } = cenario();
    const nova = sincronizarDesenho(emptyTechnicalDocument(), { ...projeto, pecas: [{ ...projeto.pecas[0], raioCantosMm: 80 }] }, undefined, catalogo, novoId);
    expect(nova.documento.pieces[0].parameters).toMatchObject({ shape: 'ROUNDED', radius: 80 });
    valido(nova.documento);
  });

  it('peça em L: a medida muda só no desenho (avisa); a pedra muda quando todas as partes mudam', () => {
    const doc: TechnicalDocument = emptyTechnicalDocument();
    const l = { ...makePiece('p1', 'L'), material: { id: 'm1', name: 'Branco Dallas', textureScaleMm: 600, veinRotationDeg: 0, roughness: .25 } };
    doc.pieces.push(l);
    const base: ProjetoNoOrcamento = { nome: 'Cozinha', recortes: [], pecas: [
      { id: 'a', label: 'Peça 1 · parte 1', componentType: 'TOP', lengthMm: 2440, widthMm: 600, materialId: 'm1', bordas: [] },
      { id: 'b', label: 'Peça 1 · parte 2', componentType: 'TOP', lengthMm: 600, widthMm: 900, materialId: 'm1', bordas: [] },
    ] };
    const sincronia: SincroniaDesenho = { pecas: { a: { pecaId: 'p1', forma: 'COMPOSTA', parte: 0 }, b: { pecaId: 'p1', forma: 'COMPOSTA', parte: 1 } }, bordas: {}, recortes: {}, base };
    const projeto = structuredClone(base);
    projeto.pecas[0].lengthMm = 3000;
    const medida = sincronizarDesenho(doc, projeto, sincronia, catalogo, novoId);
    expect(medida.documento.pieces[0].contour).toEqual(l.contour);
    expect(medida.avisos).toEqual([expect.stringContaining('mudam de medida só no desenho técnico')]);

    const pedra = structuredClone(base);
    pedra.pecas[0].materialId = 'm2';
    expect(sincronizarDesenho(doc, pedra, sincronia, catalogo, novoId).documento.pieces[0].material?.id).toBe('m1');
    pedra.pecas[1].materialId = 'm2';
    expect(sincronizarDesenho(doc, pedra, sincronia, catalogo, novoId).documento.pieces[0].material?.id).toBe('m2');
  });

  it('desenho vazio recebe o projeto inteiro; desenho já feito, sem troca anterior, só passa a acompanhar', () => {
    const { projeto, doc } = cenario();
    const vazio = sincronizarDesenho(emptyTechnicalDocument(), projeto, undefined, catalogo, novoId);
    expect(vazio.documento.pieces).toHaveLength(1);
    expect(vazio.documento.pieces[0]).toMatchObject({ name: 'Bancada', parameters: { width: 2000, length: 600 }, material: { id: 'm1' } });
    expect(vazio.documento.features.map((recurso) => recurso.type).sort()).toEqual(['SINK', 'SKIRT']);
    // Peça sem descrição no orçamento leva o tipo como nome ("Soleira").
    const semNome = sincronizarDesenho(emptyTechnicalDocument(), { ...projeto, pecas: [{ ...projeto.pecas[0], label: '', componentType: 'THRESHOLD' }] }, undefined, catalogo, novoId);
    expect(semNome.documento.pieces[0].name).toBe('Soleira');
    const saia = vazio.documento.features.find((recurso) => recurso.type === 'SKIRT')!;
    expect(saia.extentMm).toBe(edgeLength(vazio.documento.pieces[0], saia.edgeId!));
    valido(vazio.documento);

    const feito = sincronizarDesenho(doc, projeto, undefined, catalogo, novoId);
    expect(feito.alterado).toBe(false);
    expect(feito.documento).toEqual(doc);
    expect(feito.sincronia).toEqual({ pecas: {}, bordas: {}, recortes: {}, base: projeto });
  });
});
