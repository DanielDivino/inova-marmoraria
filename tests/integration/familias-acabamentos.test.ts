import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../../back/src/app.js';
import { prisma } from '../../back/src/config/prisma.js';

if (!/^inova_test_[a-f0-9]{32}$/.test(process.env.INOVA_TEST_SCHEMA ?? '') || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== process.env.INOVA_TEST_SCHEMA) throw new Error('Banco de teste isolado obrigatório.');
// Famílias das pedras e bordas/acabamentos no catálogo (Materiais e serviços), como no mostruário.
const app = await criarAplicacao();
type Auth = Record<string, string>;
let admin: Auth, atendente: Auth;
const request = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, auth: Auth, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
const login = async (email: string) => ({ authorization: `Bearer ${(await request('POST', '/auth/login', {}, { email, password: process.env.SEED_PASSWORD })).json().accessToken}` });
const familiaCompleta = {
  name: 'Porcelanato', plural: 'Porcelanatos', summary: 'Placa cerâmica fina e leve, em grandes formatos que imitam pedras naturais.', style: 'Versátil, contemporâneo, acessível',
  advantages: ['Leve e fácil de transportar', 'Grande variedade de estampas'], care: ['Bordas podem lascar', 'Verificar a espessura para bancadas'], uses: ['banheiro', 'painel', 'lavanderia'],
  desempenho: { scratchResistance: 3, stainResistance: 4, heatResistance: 3, aesthetics: 3, maintenance: 'Baixa', costLevel: 2 },
};

beforeAll(async () => {
  await app.ready();
  [admin, atendente] = await Promise.all([login('admin@inovamarmoraria.local'), login('atendente@inovamarmoraria.local')]);
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('Famílias das pedras', () => {
  it('vêm prontas com as informações do mostruário; os materiais do seed já têm família', async () => {
    const familias = (await request('GET', '/catalog/families', atendente)).json();
    expect(familias.map((familia: any) => familia.name)).toEqual(['Granito', 'Mármore', 'Quartzito', 'Ultracompacto', 'Industrializado', 'Superfície especial']);
    expect(familias[0]).toMatchObject({ plural: 'Granitos', uses: expect.arrayContaining(['cozinha']), desempenho: { scratchResistance: 5, maintenance: 'Baixa' } });
    expect(familias.find((familia: any) => familia.name === 'Industrializado').desempenho).toBeNull();
    expect(familias[0].materialCount).toBeGreaterThan(0);
    const materiais = (await request('GET', '/catalog/materials?active=all', atendente)).json();
    expect(materiais.every((material: any) => material.familyId)).toBe(true);
    expect(materiais.find((material: any) => material.name === 'Taj Mahal')).toMatchObject({ category: 'Quartzito', familyId: familias[2].id });
  });

  it('família nova só com todas as informações; o material marca a família e a categoria vira o nome dela', async () => {
    const incompleta = await request('POST', '/catalog/families', admin, { ...familiaCompleta, summary: 'Curto', advantages: [], uses: [] });
    expect(incompleta.statusCode).toBe(422);
    expect(Object.keys(incompleta.json().issues.fieldErrors).sort()).toEqual(['advantages', 'summary', 'uses']);
    expect((await request('POST', '/catalog/families', atendente, familiaCompleta)).statusCode).toBe(403);
    const criada = await request('POST', '/catalog/families', admin, familiaCompleta);
    expect(criada.statusCode, criada.body).toBe(201);
    const familia = criada.json();
    expect(familia).toMatchObject({ name: 'Porcelanato', sortOrder: 6, materialCount: 0, desempenho: familiaCompleta.desempenho });
    expect((await request('POST', '/catalog/families', admin, { ...familiaCompleta, name: 'porcelanato' })).statusCode).toBe(409);

    const material = await request('POST', '/catalog/materials', admin, { name: 'Porcelanato Calacata', familyId: familia.id, billingUnit: 'SQUARE_METER', unitPrice: 300 });
    expect(material.statusCode, material.body).toBe(201);
    expect(material.json()).toMatchObject({ category: 'Porcelanato', familyId: familia.id });
    expect((await request('POST', '/catalog/materials', admin, { name: 'Sem família', billingUnit: 'SQUARE_METER', unitPrice: 300 })).statusCode).toBe(422);

    // Renomear a família renomeia a categoria; com material, não exclui; sem notas, desempenho "conforme a ficha".
    const renomeada = await request('PATCH', `/catalog/families/${familia.id}`, admin, { ...familiaCompleta, name: 'Porcelanato técnico', desempenho: null });
    expect(renomeada.json()).toMatchObject({ name: 'Porcelanato técnico', desempenho: null, materialCount: 1 });
    expect((await request('GET', '/catalog/materials?active=all', admin)).json().find((item: any) => item.id === material.json().id).category).toBe('Porcelanato técnico');
    expect((await request('DELETE', `/catalog/families/${familia.id}`, admin)).statusCode).toBe(409);
    const granito = (await request('GET', '/catalog/families', admin)).json()[0];
    await request('PATCH', `/catalog/materials/${material.json().id}`, admin, { familyId: granito.id });
    expect((await request('DELETE', `/catalog/families/${familia.id}`, admin)).statusCode).toBe(204);
  });
});

describe('Bordas e acabamentos de superfície', () => {
  it('as do mostruário, com os serviços que já as cobram', async () => {
    const acabamentos = (await request('GET', '/catalog/finishes', atendente)).json();
    const bordas = acabamentos.filter((item: any) => item.kind === 'EDGE');
    expect(bordas.map((borda: any) => borda.name)).toEqual(['Reta', 'Boleada', 'Meia-cana', 'Chanfrada', 'Bisotê', 'Meia-esquadria', 'Saia', 'Engrossada', 'Pingadeira', 'Polida']);
    expect(acabamentos.filter((item: any) => item.kind === 'SURFACE').map((item: any) => item.name)).toEqual(['Polido', 'Levigado', 'Escovado', 'Flameado', 'Jateado']);
    const meiaEsquadria = bordas.find((borda: any) => borda.name === 'Meia-esquadria');
    expect(meiaEsquadria).toMatchObject({ appearance: 'meia-esquadria', perceivedValue: 'Alto' });
    // Uma borda, mais de um preço: os serviços de 45° (granito/mármore e importado) cobram a meia-esquadria.
    expect(meiaEsquadria.services.map((servico: any) => servico.name)).toEqual(['Acabamento 45° — Granito/Mármore', 'Acabamento 45° — Importado']);
    expect(bordas.find((borda: any) => borda.name === 'Reta').services[0]).toMatchObject({ name: 'Acabamento Simples', billingUnit: 'LINEAR_METER' });
  });

  it('cria borda com desenho e valor percebido; serviço ligado precisa da unidade certa', async () => {
    expect((await request('POST', '/catalog/finishes', admin, { kind: 'EDGE', name: 'Boleada dupla', appearance: 'polido', description: 'Arredondada em cima e embaixo.', uses: 'Mesas' })).json().issues.fieldErrors)
      .toMatchObject({ appearance: ['Escolha o desenho do perfil.'], perceivedValue: ['Escolha o valor percebido.'] });
    const borda = await request('POST', '/catalog/finishes', admin, { kind: 'EDGE', name: 'Boleada dupla', appearance: 'meia-cana', description: 'Arredondada em cima e embaixo.', uses: 'Mesas e balcões', perceivedValue: 'Alto' });
    expect(borda.statusCode, borda.body).toBe(201);
    expect(borda.json()).toMatchObject({ kind: 'EDGE', sortOrder: 10, services: [] });
    const porM2 = await request('POST', '/catalog/services', admin, { name: 'Boleada dupla por m²', billingUnit: 'SQUARE_METER', currentPrice: 90, finishId: borda.json().id });
    expect(porM2.json()).toMatchObject({ error: 'FINISH_UNIT_MISMATCH', message: 'Serviço de borda é cobrado por metro linear.' });
    const servico = await request('POST', '/catalog/services', admin, { name: 'Acabamento boleado duplo', category: 'Acabamentos', billingUnit: 'LINEAR_METER', currentPrice: 90, finishId: borda.json().id });
    expect(servico.statusCode, servico.body).toBe(201);
    expect((await request('PATCH', `/catalog/services/${servico.json().id}`, admin, { billingUnit: 'SQUARE_METER' })).statusCode).toBe(422);
    const lida = (await request('GET', '/catalog/finishes', admin)).json().find((item: any) => item.id === borda.json().id);
    expect(lida.services).toEqual([expect.objectContaining({ name: 'Acabamento boleado duplo', currentPrice: 90 })]);
    expect((await request('PATCH', `/catalog/finishes/${borda.json().id}`, admin, { ...borda.json(), kind: 'SURFACE', appearance: 'polido' })).statusCode).toBe(409);
  });
});
