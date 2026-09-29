import { escopoClientes, escopoOrcamentos, exigirPermissao } from '../../compartilhado/acesso.js';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { temPermissao } from '@inova/domain';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { createDesignSchema, createJobSchema, createProjectSchema, decisionSchema, emptyTechnicalDocument, technicalDocumentSchema, updateDraftSchema } from './design.schema.js';
import { validateTechnicalDocument } from './geometry.js';
import { renderizarPdfTecnico } from './technical.pdf.js';

const designWithDetails = {
  project: { include: { job: { include: { customer: { select: { id: true, name: true, phone: true } } } } } },
  activeDraft: true,
  revisions: { include: { createdBy: { select: { id: true, name: true } }, decisions: { include: { decidedBy: { select: { id: true, name: true } } }, orderBy: { decidedAt: 'desc' } }, releases: { select: { id: true, releasedAt: true } } }, orderBy: { number: 'desc' as const } },
} as const;

function hashDocument(document: unknown) {
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sort(entry)])) : value;
  return createHash('sha256').update(JSON.stringify(sort(document))).digest('hex');
}
function serializeDesign(design: Awaited<ReturnType<typeof prisma.design.findUniqueOrThrow>>) { return design; }
function technicalError(diagnostics: ReturnType<typeof validateTechnicalDocument>) {
  return diagnostics.some(diagnostic => diagnostic.severity === 'TECHNICAL' || diagnostic.severity === 'STRUCTURAL');
}
async function getDesign(id: string) {
  const design = await prisma.design.findUnique({ where: { id }, include: designWithDetails });
  if (!design) throw new AppError(404, 'Desenho técnico não encontrado.', 'DESIGN_NOT_FOUND');
  if (!design.activeDraft) throw new AppError(409, 'O desenho não possui rascunho ativo.', 'DRAFT_NOT_FOUND');
  return design;
}

/** Atendimento onde ficam os desenhos feitos de dentro do Novo orçamento (um por cliente). */
const ATENDIMENTO_DESENHOS = 'Desenhos técnicos';
const podeDesenhar = (request: FastifyRequest) => temPermissao(request.user.role, 'technical') || temPermissao(request.user.role, 'commercial');
/**
 * Desenho do cliente feito de dentro do Novo orçamento: a equipe técnica abre
 * qualquer um; o vendedor, só os dos próprios clientes. Conferência, liberação
 * e o desenho técnico independente continuam só com a equipe técnica.
 */
async function exigirClienteDoDesenho(request: FastifyRequest) {
  if (!podeDesenhar(request)) throw new AppError(403, 'Você não possui permissão para esta ação.', 'FORBIDDEN');
  const { id } = idSchema.parse(request.params);
  if (!await prisma.customer.findFirst({ where: { id, ...escopoClientes(request.user) }, select: { id: true } })) throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND');
}
async function exigirDesenhoAcessivel(request: FastifyRequest) {
  if (temPermissao(request.user.role, 'technical')) return;
  if (!podeDesenhar(request)) throw new AppError(403, 'Você não possui permissão para esta ação.', 'FORBIDDEN');
  const { id } = idSchema.parse(request.params);
  if (!await prisma.design.findFirst({ where: { id, project: { job: { customer: escopoClientes(request.user) } } }, select: { id: true } })) throw new AppError(404, 'Desenho técnico não encontrado.', 'DESIGN_NOT_FOUND');
}

export async function registrarRotasDesenhos(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate, exigirPermissao('technical')] };
  const doCliente = { preHandler: [app.authenticate, exigirClienteDoDesenho] };
  const desenhoAcessivel = { preHandler: [app.authenticate, exigirDesenhoAcessivel] };

  // Rascunhos de desenho do cliente, com os orçamentos em que já foram usados.
  app.get('/customers/:id/designs', doCliente, async (request) => {
    const { id } = idSchema.parse(request.params);
    const [designs, itens] = await Promise.all([
      prisma.design.findMany({ where: { project: { job: { customerId: id } } }, include: { project: { select: { name: true } }, activeDraft: { select: { document: true, updatedAt: true } } }, orderBy: { updatedAt: 'desc' } }),
      prisma.quoteItem.findMany({ where: { quote: { customerId: id, ...escopoOrcamentos(request.user) } }, select: { drawingData: true, quote: { select: { id: true, number: true } } } }),
    ]);
    const usos = (designId: string) => [...new Map(itens.filter((item) => (item.drawingData as { desenhoTecnico?: { designId?: string } } | null)?.desenhoTecnico?.designId === designId)
      .map((item) => [item.quote.id, { quoteId: item.quote.id, number: item.quote.number }])).values()];
    return { designs: designs.map((design) => {
      const pieces = (design.activeDraft?.document as { pieces?: unknown[] } | null)?.pieces;
      return { id: design.id, nome: design.project.name, atualizadoEm: design.activeDraft?.updatedAt ?? design.updatedAt, pecas: Array.isArray(pieces) ? pieces.length : 0, usadoEm: usos(design.id) };
    }) };
  });

  // Novo desenho do cliente (rascunho), no atendimento "Desenhos técnicos" dele.
  app.post('/customers/:id/designs', doCliente, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(120).optional() }).strict().parse(request.body ?? {});
    const criado = await prisma.$transaction(async tx => {
      const job = await tx.job.findFirst({ where: { customerId: id, name: ATENDIMENTO_DESENHOS }, orderBy: { createdAt: 'asc' } })
        ?? await tx.job.create({ data: { customerId: id, name: ATENDIMENTO_DESENHOS, createdById: request.user.id } });
      const total = await tx.project.count({ where: { job: { customerId: id } } });
      const project = await tx.project.create({ data: { jobId: job.id, name: name ?? `Desenho ${total + 1}` } });
      const design = await tx.design.create({ data: { projectId: project.id, name: 'Desenho técnico' } });
      const draft = await tx.designDraft.create({ data: { designId: design.id, document: emptyTechnicalDocument() as Prisma.InputJsonValue, updatedById: request.user.id } });
      await tx.design.update({ where: { id: design.id }, data: { activeDraftId: draft.id } });
      return { project, design };
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN', entityId: criado.design.id, action: 'CREATED_FOR_CUSTOMER', current: { customerId: id, projectId: criado.project.id, name: criado.project.name } } });
    return reply.status(201).send({ designId: criado.design.id, projectId: criado.project.id, name: criado.project.name });
  });

  app.post('/jobs', authenticated, async (request, reply) => {
    const input = createJobSchema.parse(request.body);
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new AppError(404, 'Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
    const job = await prisma.job.create({ data: input });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'JOB', entityId: job.id, action: 'CREATED', current: { customerId: job.customerId, name: job.name } } });
    return reply.status(201).send(job);
  });

  app.post('/jobs/:id/projects', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const input = createProjectSchema.parse(request.body);
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw new AppError(404, 'Atendimento não encontrado.', 'JOB_NOT_FOUND');
    const project = await prisma.project.create({ data: { jobId: id, name: input.name, ...(input.deliveryDeadline ? { deliveryDeadline: new Date(`${input.deliveryDeadline}T00:00:00.000Z`) } : {}) } });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'PROJECT', entityId: project.id, action: 'CREATED', current: { jobId: project.jobId, name: project.name } } });
    return reply.status(201).send(project);
  });

  app.get('/projects/:id/designs', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const project = await prisma.project.findUnique({ where: { id }, include: { job: { include: { customer: { select: { id: true, name: true, phone: true } } } }, designs: { include: { activeDraft: { select: { id: true, version: true, updatedAt: true } }, revisions: { select: { id: true, number: true, status: true, createdAt: true }, orderBy: { number: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } } } });
    if (!project) throw new AppError(404, 'Projeto técnico não encontrado.', 'PROJECT_NOT_FOUND');
    return project;
  });

  app.post('/projects/:id/designs', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const input = createDesignSchema.parse(request.body);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new AppError(404, 'Projeto técnico não encontrado.', 'PROJECT_NOT_FOUND');
    const document = emptyTechnicalDocument();
    const design = await prisma.$transaction(async tx => {
      const created = await tx.design.create({ data: { projectId: id, name: input.name } });
      const draft = await tx.designDraft.create({ data: { designId: created.id, document: document as Prisma.InputJsonValue, updatedById: request.user.id } });
      return tx.design.update({ where: { id: created.id }, data: { activeDraftId: draft.id }, include: designWithDetails });
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN', entityId: design.id, action: 'CREATED', current: { projectId: id, name: design.name } } });
    return reply.status(201).send(serializeDesign(design));
  });

  app.get('/designs/:id', desenhoAcessivel, async (request) => serializeDesign(await getDesign(idSchema.parse(request.params).id)));
  app.get('/designs/:id/draft', desenhoAcessivel, async (request) => {
    const design = await getDesign(idSchema.parse(request.params).id);
    const draft = design.activeDraft!;
    const document = technicalDocumentSchema.parse(draft.document);
    return { design: { id: design.id, name: design.name, project: design.project }, draft: { id: draft.id, version: draft.version, schemaVersion: draft.schemaVersion, document, updatedAt: draft.updatedAt }, diagnostics: validateTechnicalDocument(document) };
  });

  app.put('/designs/:id/draft', desenhoAcessivel, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const input = updateDraftSchema.parse(request.body); const diagnostics = validateTechnicalDocument(input.document);
    if (diagnostics.some(diagnostic => diagnostic.severity === 'STRUCTURAL')) throw new AppError(422, diagnostics[0].message, 'INVALID_TECHNICAL_DOCUMENT');
    const design = await getDesign(id);
    const draft = design.activeDraft!;
    const result = await prisma.$transaction(async tx => {
      const changed = await tx.designDraft.updateMany({ where: { id: draft.id, version: input.baseVersion }, data: { document: input.document as Prisma.InputJsonValue, version: { increment: 1 }, schemaVersion: input.document.schemaVersion, updatedById: request.user.id } });
      if (changed.count !== 1) throw new AppError(409, 'Este desenho foi alterado em outra sessão. Atualize para recuperar sua cópia.', 'DESIGN_VERSION_CONFLICT');
      await tx.design.update({ where: { id }, data: {} });
      return tx.designDraft.findUniqueOrThrow({ where: { id: draft.id } });
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN_DRAFT', entityId: result.id, action: 'SAVED', current: { designId: id, version: result.version, diagnostics: diagnostics.length } } });
    return reply.send({ id: result.id, version: result.version, schemaVersion: result.schemaVersion, document: input.document, updatedAt: result.updatedAt, diagnostics });
  });

  app.post('/designs/:id/validate', desenhoAcessivel, async (request) => {
    const document = technicalDocumentSchema.parse(z.object({ document: technicalDocumentSchema }).parse(request.body).document);
    return { diagnostics: validateTechnicalDocument(document) };
  });

  app.post('/designs/:id/revisions', authenticated, async (request, reply) => {
    const design = await getDesign(idSchema.parse(request.params).id); const draft = design.activeDraft!; const document = technicalDocumentSchema.parse(draft.document); const diagnostics = validateTechnicalDocument(document);
    if (technicalError(diagnostics)) throw new AppError(422, 'Corrija os diagnósticos técnicos antes de enviar para conferência.', 'DESIGN_NOT_READY_FOR_REVIEW');
    const revision = await prisma.$transaction(async tx => {
      const latest = await tx.designRevision.findFirst({ where: { designId: design.id }, orderBy: { number: 'desc' }, select: { number: true } });
      return tx.designRevision.create({ data: { designId: design.id, number: (latest?.number ?? 0) + 1, schemaVersion: draft.schemaVersion, document: document as Prisma.InputJsonValue, contentHash: hashDocument(document), createdById: request.user.id } });
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN_REVISION', entityId: revision.id, action: 'SENT_FOR_REVIEW', current: { designId: design.id, number: revision.number, hash: revision.contentHash } } });
    return reply.status(201).send(revision);
  });

  app.post('/revisions/:id/decisions', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params); const input = decisionSchema.parse(request.body);
    const revision = await prisma.designRevision.findUnique({ where: { id } });
    if (!revision) throw new AppError(404, 'Revisão não encontrada.', 'REVISION_NOT_FOUND');
    if (revision.status !== 'IN_REVIEW') throw new AppError(409, 'Esta revisão já recebeu uma decisão.', 'REVISION_NOT_PENDING');
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED';
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.designRevision.update({ where: { id }, data: { status } });
      await tx.revisionDecision.create({ data: { revisionId: id, decision: input.decision, note: input.note ?? null, decidedById: request.user.id } });
      return updated;
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN_REVISION', entityId: id, action: input.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED', current: { note: input.note ?? null } } });
    return result;
  });

  app.post('/revisions/:id/release', authenticated, async (request) => {
    const { id } = idSchema.parse(request.params);
    const revision = await prisma.designRevision.findUnique({ where: { id }, include: { design: true } });
    if (!revision) throw new AppError(404, 'Revisão não encontrada.', 'REVISION_NOT_FOUND');
    if (revision.status !== 'APPROVED') throw new AppError(409, 'Apenas revisões aprovadas podem ser liberadas.', 'REVISION_NOT_APPROVED');
    const release = await prisma.$transaction(async tx => {
      const previous = await tx.productionRelease.findFirst({ where: { projectId: revision.design.projectId }, orderBy: { releasedAt: 'desc' } });
      if (previous && previous.designRevisionId !== id) await tx.designRevision.update({ where: { id: previous.designRevisionId }, data: { status: 'SUPERSEDED' } });
      await tx.designRevision.update({ where: { id }, data: { status: 'RELEASED' } });
      return tx.productionRelease.create({ data: { projectId: revision.design.projectId, designRevisionId: id, replacesReleaseId: previous?.id, releasedById: request.user.id } });
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'PRODUCTION_RELEASE', entityId: release.id, action: 'RELEASED', current: { revisionId: id, projectId: release.projectId, replacesReleaseId: release.replacesReleaseId } } });
    return release;
  });

  app.get('/revisions/:id/pdf', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const revision = await prisma.designRevision.findUnique({ where: { id }, include: { design: { include: { project: { include: { job: { include: { customer: true } } } } } } } });
    if (!revision) throw new AppError(404, 'Revisão não encontrada.', 'REVISION_NOT_FOUND');
    const pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
    renderizarPdfTecnico(pdf, technicalDocumentSchema.parse(revision.document), { customer: revision.design.project.job.customer.name, project: revision.design.project.name, design: revision.design.name, revision: revision.number, hash: revision.contentHash, status: revision.status, createdAt: revision.createdAt });
    pdf.end();
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="desenho-tecnico-r${revision.number}.pdf"`).send(pdf);
  });

  app.post('/quotes/:id/technical-project', authenticated, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const quote = await prisma.quote.findUnique({ where: { id }, include: { job: { include: { projects: { include: { designs: { orderBy: { updatedAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, take: 1 } } } } });
    if (!quote) throw new AppError(404, 'Orçamento não encontrado.', 'QUOTE_NOT_FOUND');
    const existingDesign = quote.job?.projects[0]?.designs[0];
    if (existingDesign) return { projectId: quote.job?.projects[0].id, designId: existingDesign.id, editorUrl: `/projetos/${quote.job?.projects[0].id}/desenhos/${existingDesign.id}` };
    const created = await prisma.$transaction(async tx => {
      const job = quote.job ?? await tx.job.create({ data: { customerId: quote.customerId, name: `Atendimento ${quote.number}` } });
      if (!quote.jobId) await tx.quote.update({ where: { id }, data: { jobId: job.id } });
      const project = await tx.project.create({ data: { jobId: job.id, name: `Projeto técnico ${quote.number}`, deliveryDeadline: quote.deliveryDeadline } });
      const design = await tx.design.create({ data: { projectId: project.id, name: 'Desenho técnico' } });
      const draft = await tx.designDraft.create({ data: { designId: design.id, document: emptyTechnicalDocument() as Prisma.InputJsonValue, updatedById: request.user.id } });
      await tx.design.update({ where: { id: design.id }, data: { activeDraftId: draft.id } });
      return { project, design };
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN', entityId: created.design.id, action: 'CREATED_FROM_QUOTE', current: { quoteId: id, projectId: created.project.id } } });
    return reply.status(201).send({ projectId: created.project.id, designId: created.design.id, editorUrl: `/projetos/${created.project.id}/desenhos/${created.design.id}` });
  });
}
