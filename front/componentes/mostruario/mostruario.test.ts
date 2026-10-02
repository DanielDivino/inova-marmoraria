import { describe, expect, it } from 'vitest';
import type { Familia } from '../catalogo/tipos';
import { precoAPartirDe } from '../catalogo/tipos';
import { destaquesDaAbertura, filtrarPedras, FILTRO_INICIAL, montarPedras, precoDaPedra, type Material } from './colecao';
import { cenasDosUsos, familiasIndicadas, fichaDaPedra, tomDe } from './conhecimento';
import { urlDaFoto } from './imagens';

// Famílias como vêm do catálogo (Materiais e serviços): industrializado e especial sem notas.
const notas = { scratchResistance: 5, stainResistance: 4, heatResistance: 5, aesthetics: 3, maintenance: 'Baixa' as const, costLevel: 2 };
const familia = (id: string, name: string, uses: Familia['uses'], comNotas = true): Familia => ({
  id, name, plural: `${name}s`, summary: '', style: '', advantages: [], care: [], uses, desempenho: comNotas ? notas : null, sortOrder: 0, materialCount: 0,
});
const familias = [
  familia('granito', 'Granito', ['cozinha', 'banheiro', 'gourmet', 'lavanderia', 'piso']), familia('marmore', 'Mármore', ['banheiro', 'painel']),
  familia('ultra', 'Ultracompacto', ['cozinha', 'banheiro', 'gourmet', 'painel']), familia('indus', 'Industrializado', ['banheiro', 'painel'], false),
  familia('especial', 'Superfície especial', ['painel'], false),
];
const material = (name: string, familyId: string, extra: Partial<Material> = {}): Material => ({
  id: name, name, category: familyId, familyId, currentPrice: 600, billingUnit: 'SQUARE_METER', isActive: true, images: [{ url: `/uploads/materials/${name}.png`, isPrimary: true }], ...extra,
});

describe('mostruário: ficha de cada pedra', () => {
  it('tom para os filtros claras/escuras', () => {
    expect(['Preto São Gabriel', 'Verde Ubatuba', 'Café Imperial', 'Nero Marquina'].map(tomDe)).toEqual(['escuro', 'escuro', 'escuro', 'escuro']);
    expect(['Branco Dallas', 'Taj Mahal', 'Grey Claro', 'Branco Stellar'].map(tomDe)).toEqual(['claro', 'claro', 'claro', 'claro']);
    expect(['Cinza Corumbazinho', 'Grey Escuro'].map(tomDe)).toEqual(['medio', 'escuro']);
  });

  it('onde usar vem da observação da pedra ou da família; "confirmar na ficha" só se a família não tem notas', () => {
    expect(fichaDaPedra({ name: 'Branco Dallas', familyId: 'granito' }, familias)).toMatchObject({ familiaId: 'granito', onde: ['cozinha', 'banheiro', 'lavanderia'], confirmar: false });
    expect(fichaDaPedra({ name: 'Pitaya', familyId: 'granito' }, familias)).toMatchObject({ onde: familias[0].uses, nota: undefined });
    expect(fichaDaPedra({ name: 'Translúcido', familyId: 'indus' }, familias)).toMatchObject({ onde: ['painel'] });
    // Calacata no catálogo como ultracompacto (com notas): a dúvida do nome não se aplica.
    expect(fichaDaPedra({ name: 'Calacata Carrara', familyId: 'ultra' }, familias)).toMatchObject({ familiaId: 'ultra', confirmar: false, nota: undefined });
    expect(fichaDaPedra({ name: 'Yoshi', familyId: 'especial' }, familias)).toMatchObject({ confirmar: true });
    expect(fichaDaPedra({ name: 'Sem família', familyId: null }, familias)).toMatchObject({ familiaId: null, onde: [] });
  });

  it('famílias indicadas por uso, por extenso; exemplos de aplicação pelo uso', () => {
    expect(familiasIndicadas('cozinha', familias)).toBe('Granito e Ultracompacto');
    expect(familiasIndicadas('painel', familias)).toBe('Mármore, Ultracompacto, Industrializado e Superfície especial');
    expect(cenasDosUsos(['cozinha', 'banheiro', 'gourmet', 'lavanderia'])).toEqual(['Cozinha', 'Banheiro', 'Área gourmet']);
    expect(cenasDosUsos(['banheiro', 'painel'])).toEqual(['Banheiro', 'Painel de TV', 'Nicho de banheiro']);
  });
});

describe('mostruário: coleção', () => {
  const catalogo = [
    material('Preto São Gabriel', 'granito', { currentPrice: 700 }), material('Branco Dallas', 'granito', { currentPrice: 600 }),
    material('Grey Claro', 'ultra', { currentPrice: 2200 }), material('Sem Preço', 'granito', { currentPrice: null }),
    material('Inativa', 'granito', { isActive: false }), material('Alaska', 'granito', { isActive: false }),
  ];
  const pedras = montarPedras(catalogo, familias);

  it('só ativas, mais os exemplos visuais que faltam no catálogo ativo, com a família pelo nome', () => {
    expect(pedras.map((pedra) => pedra.name)).toEqual(['Alaska', 'Bege Arabesco', 'Branco Dallas', 'Grey Claro', 'Grey Escuro', 'Nero Marquina', 'Preto São Gabriel', 'Sem Preço']);
    expect(pedras.find((pedra) => pedra.name === 'Alaska')).toMatchObject({ exemplo: true, ficha: { familiaId: 'granito' }, familia: { name: 'Granito' } });
    expect(pedras.find((pedra) => pedra.name === 'Nero Marquina')?.familia?.name).toBe('Mármore');
    expect(precoDaPedra(pedras.find((pedra) => pedra.name === 'Alaska')!)).toBe('Preço sob consulta');
  });

  it('filtros de família (ultracompacto), ambiente, tom e busca sem acento; preço com os sem preço no fim', () => {
    const nomes = (filtro: Partial<typeof FILTRO_INICIAL>) => filtrarPedras(pedras, { ...FILTRO_INICIAL, ...filtro }).map((pedra) => pedra.name);
    expect(nomes({ familia: 'ultra' })).toEqual(['Grey Claro', 'Grey Escuro']);
    expect(nomes({ familia: 'granito', tom: 'escuro' })).toEqual(['Preto São Gabriel']);
    expect(nomes({ uso: 'piso' })).toEqual(['Preto São Gabriel', 'Sem Preço']);
    expect(nomes({ busca: 'sao gab' })).toEqual(['Preto São Gabriel']);
    expect(nomes({ familia: 'granito', ordem: 'menor' })).toEqual(['Branco Dallas', 'Preto São Gabriel', 'Alaska', 'Bege Arabesco', 'Sem Preço']);
    expect(nomes({ familia: 'granito', ordem: 'maior' }).slice(0, 2)).toEqual(['Preto São Gabriel', 'Branco Dallas']);
  });

  it('abertura: pedras com foto do catálogo, preferindo as de contraste', () => {
    expect(destaquesDaAbertura(pedras).map((pedra) => pedra.name)).toEqual(['Branco Dallas', 'Preto São Gabriel', 'Grey Claro', 'Sem Preço']);
  });

  it('fotos: miniaturas da API para as enviadas; versão de 480 px para os exemplos', () => {
    expect(urlDaFoto('/uploads/materials/a.png', 320)).toBe('/api/miniaturas/320/materials/a.png');
    expect(urlDaFoto('/mostruario-pedras/alaska.webp', 480)).toBe('/mostruario-pedras/alaska-480.webp');
    expect(urlDaFoto('/mostruario-pedras/alaska.webp', 960)).toBe('/mostruario-pedras/alaska.webp');
    expect(urlDaFoto(undefined, 96)).toBeUndefined();
  });

  it('preço de borda ou acabamento: o menor entre os serviços ativos com preço', () => {
    const servico = (currentPrice: number, isActive = true) => ({ id: String(currentPrice), name: '', billingUnit: 'LINEAR_METER' as const, currentPrice, isActive });
    expect(precoAPartirDe({ services: [servico(100), servico(70), servico(0), servico(40, false)] })).toBe(70);
    expect(precoAPartirDe({ services: [servico(0)] })).toBeUndefined();
  });
});
