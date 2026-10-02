import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { disposicaoArquivoPdf, nomeArquivoPdf } from '@inova/domain';
import { exigirOrcamentoProprio } from '../../compartilhado/acesso.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { prisma } from '../../config/prisma.js';
import { buscarNotaEntrega, entregaGeralSchema, listarEntregas, montarConferencia, notaGeral, novaEntregaSchema, registrarEntrega, registrarEntregaGeral } from './entrega.service.js';
import { renderizarNotaConferenciaPdf, renderizarNotaEntregaGeralPdf, renderizarNotaEntregaPdf } from './entrega.pdf.js';

/** Notas de entrega por projeto e a geral (todos os projetos), dentro do orçamento (`/quotes/:id/...`). */
export async function registrarRotasEntregas(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirOrcamentoProprio] };

  app.get('/:id/entregas', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    return listarEntregas(prisma, id, request.user);
  });

  const conflito = (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'Outra nota de entrega foi gerada ao mesmo tempo. Tente de novo.', 'DELIVERY_CONFLICT');
    throw error;
  };
  // Entrega geral: as peças entregues de todos os projetos numa nota só.
  app.post('/:id/entregas', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const input = entregaGeralSchema.parse(request.body);
    try { return reply.code(201).send(await prisma.$transaction((tx) => registrarEntregaGeral(tx, id, input, request.user), { timeout: 30000 })); }
    catch (error) { return conflito(error); }
  });

  app.post('/:id/items/:itemId/entregas', authenticated, async (request, reply) => {
    const { id, itemId } = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const input = novaEntregaSchema.parse(request.body);
    try { return reply.code(201).send(await prisma.$transaction((tx) => registrarEntrega(tx, id, itemId, input, request.user), { timeout: 20000 })); }
    catch (error) { return conflito(error); }
  });

  // Nota de conferência: a situação de agora (entregues e o que falta), geral ou de um projeto.
  const conferencia = async (quoteId: string, itemId: string | undefined, user: Parameters<typeof montarConferencia>[2]) => {
    const dados = await montarConferencia(prisma, quoteId, user, itemId);
    const pdf = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    renderizarNotaConferenciaPdf(pdf, dados, new Date());
    pdf.end();
    const titulo = itemId ? `Conferência - ${dados.projects[0].projectName}` : 'Conferência geral';
    return { pdf, arquivo: disposicaoArquivoPdf(nomeArquivoPdf(dados.quote.customerNameSnapshot, `${dados.quote.number} - ${titulo}`)) };
  };
  app.get('/:id/conferencia/pdf', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { pdf, arquivo } = await conferencia(id, undefined, request.user);
    return reply.type('application/pdf').header('Content-Disposition', arquivo).send(pdf);
  });
  app.get('/:id/items/:itemId/conferencia/pdf', authenticated, async (request, reply) => {
    const { id, itemId } = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const { pdf, arquivo } = await conferencia(id, itemId, request.user);
    return reply.type('application/pdf').header('Content-Disposition', arquivo).send(pdf);
  });

  app.get('/:id/entregas/:deliveryId/pdf', authenticated, async (request, reply) => {
    const { id, deliveryId } = z.object({ id: z.string().cuid(), deliveryId: z.string().cuid() }).parse(request.params);
    const nota = await buscarNotaEntrega(prisma, id, deliveryId, request.user);
    // bufferPages: o rodapé "Página x de y" é escrito depois do conteúdo.
    const pdf = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    const { document } = nota;
    if (notaGeral(document)) renderizarNotaEntregaGeralPdf(pdf, { ...nota, document });
    else renderizarNotaEntregaPdf(pdf, { ...nota, document });
    pdf.end();
    const titulo = notaGeral(document) ? 'Nota de entrega geral' : document.projectName;
    return reply.type('application/pdf').header('Content-Disposition', disposicaoArquivoPdf(nomeArquivoPdf(nota.quote.customerNameSnapshot, `${nota.number} - ${titulo}`))).send(pdf);
  });
}
