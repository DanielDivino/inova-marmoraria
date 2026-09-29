import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';

// Rascunho do Novo orçamento do usuário (clientes abertos e os seus projetos), o mesmo em
// qualquer aparelho. O servidor não interpreta os projetos: guarda o que o editor manda.
const dadosSchema = z.object({
  workspaces: z.array(z.object({ id: z.string().min(1).max(64) }).passthrough()).max(100),
  removedWorkspaceIds: z.array(z.string().min(1).max(64)).max(200).default([]),
}).strict();
const gravacaoSchema = z.object({ data: dadosSchema, baseVersion: z.number().int().positive().nullable() }).strict();
const consultaSchema = z.object({ known: z.coerce.number().int().positive().optional() });
const paraResposta = (rascunho: { data: Prisma.JsonValue; version: number; updatedAt: Date }) => ({ data: rascunho.data, version: rascunho.version, updatedAt: rascunho.updatedAt });

export async function registrarRotasRascunhoOrcamento(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  // Com ?known=N só devolve os dados se outro aparelho gravou depois da versão N.
  app.get('/', authenticated, async (request) => {
    const { known } = consultaSchema.parse(request.query);
    const atual = await prisma.quoteEditorDraft.findUnique({ where: { userId: request.user.id }, select: { version: true } });
    if (!atual) return { version: null };
    if (atual.version === known) return { version: atual.version };
    const rascunho = await prisma.quoteEditorDraft.findUnique({ where: { userId: request.user.id } });
    return rascunho ? { version: rascunho.version, draft: paraResposta(rascunho) } : { version: null };
  });
  // Grava só se ninguém gravou desde baseVersion; senão devolve o rascunho atual para o editor juntar e tentar de novo.
  app.put('/', { ...authenticated, bodyLimit: 5 * 1024 * 1024 }, async (request) => {
    const { data, baseVersion } = gravacaoSchema.parse(request.body);
    const userId = request.user.id;
    const dados = data as Prisma.InputJsonObject;
    const conflito = async () => {
      const atual = await prisma.quoteEditorDraft.findUnique({ where: { userId } });
      return { saved: false as const, draft: atual ? paraResposta(atual) : null };
    };
    if (baseVersion === null) {
      try {
        const criado = await prisma.quoteEditorDraft.create({ data: { userId, data: dados } });
        return { saved: true as const, version: criado.version, updatedAt: criado.updatedAt };
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') return conflito();
        throw cause;
      }
    }
    const { count } = await prisma.quoteEditorDraft.updateMany({ where: { userId, version: baseVersion }, data: { data: dados, version: { increment: 1 } } });
    if (!count) return conflito();
    const gravado = await prisma.quoteEditorDraft.findUniqueOrThrow({ where: { userId }, select: { version: true, updatedAt: true } });
    return { saved: true as const, version: gravado.version, updatedAt: gravado.updatedAt };
  });
}
