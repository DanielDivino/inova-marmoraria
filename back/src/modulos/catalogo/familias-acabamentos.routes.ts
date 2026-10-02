import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { APARENCIAS_DE_SUPERFICIE, DESENHOS_DE_BORDA, NIVEIS_DE_MANUTENCAO, UNIDADE_DO_ACABAMENTO, USOS_DA_PEDRA, VALORES_PERCEBIDOS } from '@inova/domain';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { exigirPerfil } from '../autenticacao/auth.plugin.js';

/**
 * Famílias das pedras e bordas/acabamentos de superfície (Materiais e serviços). Família nova só
 * entra com as informações que o mostruário mostra (resumo, estilo, vantagens, cuidados e onde usar);
 * as notas de desempenho são todas ou nenhuma (sem notas: "conforme a ficha do fabricante").
 */
const texto = (minimo: number, maximo: number, mensagem: string) => z.string().trim().min(minimo, mensagem).max(maximo);
const lista = (mensagem: string) => z.array(texto(3, 120, mensagem)).min(1, mensagem).max(6);
const nota = z.number().int().min(1).max(5);
export const familiaSchema = z.object({
  name: texto(2, 60, 'Informe o nome da família.'),
  plural: texto(2, 60, 'Informe o nome no plural (usado nos filtros).'),
  summary: texto(20, 600, 'Escreva o resumo da família (ao menos uma frase).'),
  style: texto(3, 120, 'Informe o estilo visual.'),
  advantages: lista('Informe ao menos uma vantagem.'),
  care: lista('Informe ao menos um cuidado.'),
  uses: z.array(z.enum(USOS_DA_PEDRA)).min(1, 'Marque ao menos um uso.').transform((usos) => [...new Set(usos)]),
  desempenho: z.object({ scratchResistance: nota, stainResistance: nota, heatResistance: nota, aesthetics: nota, maintenance: z.enum(NIVEIS_DE_MANUTENCAO), costLevel: nota }).nullable(),
});

type FamiliaBanco = Awaited<ReturnType<typeof prisma.materialFamily.findFirstOrThrow>> & { _count?: { materials: number } };
export const paraFamilia = ({ scratchResistance, stainResistance, heatResistance, aesthetics, maintenance, costLevel, _count, ...familia }: FamiliaBanco) => ({
  ...familia,
  desempenho: scratchResistance && stainResistance && heatResistance && aesthetics && maintenance && costLevel ? { scratchResistance, stainResistance, heatResistance, aesthetics, maintenance, costLevel } : null,
  materialCount: _count?.materials ?? 0,
});
const dadosDaFamilia = ({ desempenho, ...familia }: z.infer<typeof familiaSchema>) => ({
  ...familia,
  scratchResistance: desempenho?.scratchResistance ?? null, stainResistance: desempenho?.stainResistance ?? null, heatResistance: desempenho?.heatResistance ?? null,
  aesthetics: desempenho?.aesthetics ?? null, maintenance: desempenho?.maintenance ?? null, costLevel: desempenho?.costLevel ?? null,
});

/** Borda tem desenho de perfil e valor percebido; acabamento de superfície tem aparência. */
export const acabamentoSchema = z.object({
  kind: z.enum(['EDGE', 'SURFACE']),
  name: texto(2, 60, 'Informe o nome.'),
  appearance: z.string(),
  description: texto(10, 400, 'Descreva o acabamento (ao menos uma frase).'),
  uses: texto(3, 160, 'Informe onde usar.'),
  perceivedValue: z.enum(VALORES_PERCEBIDOS).nullable().optional(),
  isActive: z.boolean().default(true),
}).superRefine((acabamento, contexto) => {
  const aparencias: readonly string[] = acabamento.kind === 'EDGE' ? DESENHOS_DE_BORDA : APARENCIAS_DE_SUPERFICIE;
  if (!aparencias.includes(acabamento.appearance)) contexto.addIssue({ code: 'custom', path: ['appearance'], message: acabamento.kind === 'EDGE' ? 'Escolha o desenho do perfil.' : 'Escolha a aparência.' });
  if (acabamento.kind === 'EDGE' && !acabamento.perceivedValue) contexto.addIssue({ code: 'custom', path: ['perceivedValue'], message: 'Escolha o valor percebido.' });
}).transform((acabamento) => ({ ...acabamento, perceivedValue: acabamento.kind === 'EDGE' ? acabamento.perceivedValue! : null }));

const servicoResumido = { select: { id: true, name: true, billingUnit: true, currentPrice: true, isActive: true }, orderBy: { name: 'asc' as const } };
type AcabamentoBanco = Awaited<ReturnType<typeof prisma.finish.findFirstOrThrow>> & { services: { id: string; name: string; billingUnit: string; currentPrice: unknown; isActive: boolean }[] };
export const paraAcabamento = (acabamento: AcabamentoBanco) => ({ ...acabamento, services: acabamento.services.map((servico) => ({ ...servico, currentPrice: Number(servico.currentPrice) })) });

/** O serviço ligado a uma borda é cobrado por metro linear; a um acabamento de superfície, por m². */
export async function conferirAcabamentoDoServico(finishId: string | null | undefined, billingUnit: string) {
  if (!finishId) return;
  const acabamento = await prisma.finish.findUnique({ where: { id: finishId } });
  if (!acabamento) throw new AppError(422, 'Borda ou acabamento não encontrado.', 'FINISH_NOT_FOUND');
  if (UNIDADE_DO_ACABAMENTO[acabamento.kind] !== billingUnit) {
    throw new AppError(422, acabamento.kind === 'EDGE' ? 'Serviço de borda é cobrado por metro linear.' : 'Acabamento de superfície é cobrado por m².', 'FINISH_UNIT_MISMATCH');
  }
}

export async function registrarFamiliasEAcabamentos(app: FastifyInstance) {
  const autenticado = { preHandler: [app.authenticate] };
  const administrador = { preHandler: [app.authenticate, exigirPerfil('SUPER_ADMIN')] };
  const nomeEmUso = async (nome: string, tabela: 'materialFamily' | 'finish', id?: string) => {
    const where = { name: { equals: nome, mode: 'insensitive' as const }, ...(id ? { NOT: { id } } : {}) };
    return tabela === 'materialFamily' ? prisma.materialFamily.findFirst({ where }) : prisma.finish.findFirst({ where });
  };

  app.get('/families', autenticado, async () => (await prisma.materialFamily.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { materials: true } } } })).map(paraFamilia));
  app.post('/families', administrador, async (request, reply) => {
    const dados = familiaSchema.parse(request.body);
    if (await nomeEmUso(dados.name, 'materialFamily')) throw new AppError(409, 'Já existe uma família com este nome.', 'FAMILY_ALREADY_EXISTS');
    const ultima = await prisma.materialFamily.aggregate({ _max: { sortOrder: true } });
    const familia = await prisma.materialFamily.create({ data: { ...dadosDaFamilia(dados), sortOrder: (ultima._max.sortOrder ?? -1) + 1 } });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL_FAMILY', entityId: familia.id, action: 'CREATED', current: paraFamilia(familia) } });
    return reply.status(201).send(paraFamilia(familia));
  });
  app.patch('/families/:id', administrador, async (request) => {
    const { id } = idSchema.parse(request.params);
    const dados = familiaSchema.parse(request.body);
    const antes = await prisma.materialFamily.findUnique({ where: { id } });
    if (!antes) throw new AppError(404, 'Família não encontrada.', 'NOT_FOUND');
    if (await nomeEmUso(dados.name, 'materialFamily', id)) throw new AppError(409, 'Já existe uma família com este nome.', 'FAMILY_ALREADY_EXISTS');
    // A categoria dos materiais é o nome da família: renomear a família renomeia a categoria deles.
    const familia = await prisma.$transaction(async (tx) => {
      const salva = await tx.materialFamily.update({ where: { id }, data: dadosDaFamilia(dados), include: { _count: { select: { materials: true } } } });
      if (salva.name !== antes.name) await tx.material.updateMany({ where: { familyId: id }, data: { category: salva.name } });
      return salva;
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL_FAMILY', entityId: id, action: 'UPDATED', previous: paraFamilia(antes), current: paraFamilia(familia) } });
    return paraFamilia(familia);
  });
  app.delete('/families/:id', administrador, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const familia = await prisma.materialFamily.findUnique({ where: { id }, include: { _count: { select: { materials: true } } } });
    if (!familia) throw new AppError(404, 'Família não encontrada.', 'NOT_FOUND');
    if (familia._count.materials) throw new AppError(409, 'Mude a família dos materiais dela antes de excluir.', 'FAMILY_IN_USE');
    await prisma.materialFamily.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL_FAMILY', entityId: id, action: 'DELETED', previous: paraFamilia(familia) } });
    return reply.status(204).send();
  });

  app.get('/finishes', autenticado, async () => (await prisma.finish.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }], include: { services: servicoResumido } })).map(paraAcabamento));
  app.post('/finishes', administrador, async (request, reply) => {
    const dados = acabamentoSchema.parse(request.body);
    if (await nomeEmUso(dados.name, 'finish')) throw new AppError(409, 'Já existe uma borda ou acabamento com este nome.', 'FINISH_ALREADY_EXISTS');
    const ultima = await prisma.finish.aggregate({ where: { kind: dados.kind }, _max: { sortOrder: true } });
    const acabamento = await prisma.finish.create({ data: { ...dados, sortOrder: (ultima._max.sortOrder ?? -1) + 1 }, include: { services: servicoResumido } });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'FINISH', entityId: acabamento.id, action: 'CREATED', current: paraAcabamento(acabamento) } });
    return reply.status(201).send(paraAcabamento(acabamento));
  });
  app.patch('/finishes/:id', administrador, async (request) => {
    const { id } = idSchema.parse(request.params);
    const dados = acabamentoSchema.parse(request.body);
    const antes = await prisma.finish.findUnique({ where: { id }, include: { services: servicoResumido } });
    if (!antes) throw new AppError(404, 'Borda ou acabamento não encontrado.', 'NOT_FOUND');
    if (await nomeEmUso(dados.name, 'finish', id)) throw new AppError(409, 'Já existe uma borda ou acabamento com este nome.', 'FINISH_ALREADY_EXISTS');
    if (dados.kind !== antes.kind && antes.services.length) throw new AppError(409, 'Desligue os serviços deste acabamento antes de mudar o tipo.', 'FINISH_KIND_IN_USE');
    const acabamento = await prisma.finish.update({ where: { id }, data: dados, include: { services: servicoResumido } });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'FINISH', entityId: id, action: 'UPDATED', previous: paraAcabamento(antes), current: paraAcabamento(acabamento) } });
    return paraAcabamento(acabamento);
  });
}
