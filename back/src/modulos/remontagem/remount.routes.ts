import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { disposicaoArquivoPdf, nomeArquivoPdf } from '@inova/domain';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { remountSchema, remountPdfSchema } from './remount.schema.js';
import { buscarOrigemRemontagem, calcularRemontagem, salvarRemontagem, serializarRemontagem } from './remount.service.js';
import { renderizarRemontagemPdf } from './remount.pdf.js';

export async function registrarRotasRemontagem(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  app.get('/:id/remontagem', authenticated, async request => {
    const { id } = idSchema.parse(request.params);
    const quote = await buscarOrigemRemontagem(prisma, id);
    const row = await prisma.remount.findUnique({ where: { quoteId: id } });
    return { quote, remount: row ? serializarRemontagem(row, quote.number) : null };
  });
  app.post('/:id/remontagem/calculate', authenticated, async request => {
    const { id } = idSchema.parse(request.params);
    const input = remountSchema.parse(request.body);
    return prisma.$transaction(tx => calcularRemontagem(tx, id, input, request.user), { timeout: 20000 });
  });
  app.put('/:id/remontagem', authenticated, async request => {
    const { id } = idSchema.parse(request.params);
    const input = remountSchema.parse(request.body);
    try { return await prisma.$transaction(tx => salvarRemontagem(tx, id, input, request.user), { timeout: 20000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'Uma remontagem já foi criada. Reabra antes de salvar.', 'REMOUNT_CONFLICT');
      throw error;
    }
  });
  for (const kind of ['pdf', 'delivery-pdf'] as const) app.get(`/:id/remontagem/${kind}`, authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const options = remountPdfSchema.parse(request.query);
    const quote = await buscarOrigemRemontagem(prisma, id);
    const row = await prisma.remount.findUnique({ where: { quoteId: id } });
    if (!row) throw new AppError(404, 'Salve a remontagem antes de gerar o documento.', 'NOT_FOUND');
    const document = serializarRemontagem(row, quote.number);
    const delivery = kind === 'delivery-pdf';
    const pdf = new PDFDocument({ margin: 36, size: 'A4' });
    renderizarRemontagemPdf(pdf, quote, document, { delivery, individualPrices: options.individualPrices });
    pdf.end();
    return reply.type('application/pdf').header('Content-Disposition', disposicaoArquivoPdf(nomeArquivoPdf(quote.customerNameSnapshot, delivery ? document.deliveryNumber : document.number))).send(pdf);
  });
}
