import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { disposicaoArquivoPdf, nomeArquivoPdf } from '@inova/domain';
import { exigirOrcamentoProprio } from '../../compartilhado/acesso.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { prisma } from '../../config/prisma.js';
import { buscarNotaEntrega, listarEntregas, novaEntregaSchema, registrarEntrega } from './entrega.service.js';
import { renderizarNotaEntregaPdf } from './entrega.pdf.js';

/** Notas de entrega por projeto, dentro do orçamento (`/quotes/:id/...`). */
export async function registrarRotasEntregas(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirOrcamentoProprio] };

  app.get('/:id/entregas', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    return listarEntregas(prisma, id, request.user);
  });

  app.post('/:id/items/:itemId/entregas', authenticated, async (request, reply) => {
    const { id, itemId } = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const input = novaEntregaSchema.parse(request.body);
    try {
      return reply.code(201).send(await prisma.$transaction((tx) => registrarEntrega(tx, id, itemId, input, request.user), { timeout: 20000 }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'Outra nota de entrega foi gerada ao mesmo tempo. Tente de novo.', 'DELIVERY_CONFLICT');
      throw error;
    }
  });

  app.get('/:id/entregas/:deliveryId/pdf', authenticated, async (request, reply) => {
    const { id, deliveryId } = z.object({ id: z.string().cuid(), deliveryId: z.string().cuid() }).parse(request.params);
    const nota = await buscarNotaEntrega(prisma, id, deliveryId, request.user);
    // bufferPages: o rodapé "Página x de y" é escrito depois do conteúdo.
    const pdf = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    renderizarNotaEntregaPdf(pdf, nota);
    pdf.end();
    return reply.type('application/pdf').header('Content-Disposition', disposicaoArquivoPdf(nomeArquivoPdf(nota.quote.customerNameSnapshot, `${nota.number} - ${nota.document.projectName}`))).send(pdf);
  });
}
