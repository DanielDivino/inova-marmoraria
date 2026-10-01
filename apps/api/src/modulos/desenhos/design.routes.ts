import { escopoClientes, escopoOrcamentos, exigirPermissao } from '../../compartilhado/acesso.js';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nomeProjeto, temPermissao } from '@inova/domain';
import { Prisma } from '@inova/database';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { createDesignSchema, createJobSchema, createProjectSchema, decisionSchema, emptyTechnicalDocument, projetoNoOrcamentoSchema, sincroniaDesenhoSchema, technicalDocumentSchema, updateDraftSchema } from './design.schema.js';
import { validateTechnicalDocument } from './geometry.js';
import { renderizarPdfTecnico } from './technical.pdf.js';
import { desenhoDoOrcamentoSemProjeto, desenhoDoProjeto, desenhosTecnicosDosProjetos, projetoSalvoParaDesenho, selecaoProjetoParaDesenho, sincronizarComOrcamento, vinculoDoProjeto } from './desenho-tecnico-do-orcamento.js';

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

/** Novo desenho no atendimento "Desenhos técnicos" do cliente: rascunho vazio ou, com `documento`, a cópia de outro. */
async function criarDesenhoDoCliente(tx: Prisma.TransactionClient, customerId: string, nome: string | undefined, userId: string, documento: Prisma.InputJsonValue = emptyTechnicalDocument() as Prisma.InputJsonValue) {
  const job = await tx.job.findFirst({ where: { customerId, name: ATENDIMENTO_DESENHOS }, orderBy: { createdAt: 'asc' } })
    ?? await tx.job.create({ data: { customerId, name: ATENDIMENTO_DESENHOS, createdById: userId } });
  const total = await tx.project.count({ where: { job: { customerId } } });
  const project = await tx.project.create({ data: { jobId: job.id, name: nome ?? `Desenho ${total + 1}` } });
  const design = await tx.design.create({ data: { projectId: project.id, name: 'Desenho técnico' } });
  const draft = await tx.designDraft.create({ data: { designId: design.id, document: documento, updatedById: userId } });
  await tx.design.update({ where: { id: design.id }, data: { activeDraftId: draft.id } });
  return { project, design, draft };
}
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
    const criado = await prisma.$transaction((tx) => criarDesenhoDoCliente(tx, id, name, request.user.id));
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

  // Excluir o desenho (o × na lista de desenhos do cliente). O que já foi para a produção (liberado,
  // ligado ao comercial ou exportado) não pode ser apagado. Os projetos de orçamento ligados a ele ficam
  // sem desenho técnico; as peças deles continuam.
  app.delete('/designs/:id', desenhoAcessivel, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const desenho = await prisma.design.findUnique({ where: { id }, select: { name: true, projectId: true, project: { select: { name: true, job: { select: { name: true, customerId: true } }, _count: { select: { designs: true } } } } } });
    if (!desenho) throw new AppError(404, 'Desenho técnico não encontrado.', 'DESIGN_NOT_FOUND');
    const naProducao = await prisma.designRevision.count({ where: { designId: id, OR: [{ releases: { some: {} } }, { commercialLinks: { some: {} } }, { exports: { some: {} } }] } });
    if (naProducao) throw new AppError(409, 'Este desenho já foi liberado para a produção e não pode ser excluído.', 'DESIGN_IN_PRODUCTION');
    const ligados = await prisma.quoteItem.findMany({ where: { drawingData: { path: ['desenhoTecnico', 'designId'], equals: id } }, select: { id: true, drawingData: true } });
    await prisma.$transaction(async (tx) => {
      for (const item of ligados) {
        const { desenhoTecnico: _vinculo, ...drawingData } = item.drawingData as Record<string, unknown>;
        await tx.quoteItem.update({ where: { id: item.id }, data: { drawingData: drawingData as Prisma.InputJsonValue } });
      }
      await tx.design.delete({ where: { id } });
      // O desenho do cliente tem um projeto só para ele: sem o desenho, o projeto também sai.
      if (desenho.project.job.name === ATENDIMENTO_DESENHOS && desenho.project._count.designs === 1) await tx.project.delete({ where: { id: desenho.projectId } });
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN', entityId: id, action: 'DELETED', previous: { name: desenho.project.name, customerId: desenho.project.job.customerId, quoteItems: ligados.map((item) => item.id) } } });
    return reply.status(204).send();
  });

  // Cópia independente do desenho como está agora (projeto duplicado no orçamento): mexer em um não muda o outro.
  app.post('/designs/:id/copy', desenhoAcessivel, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(120).optional() }).strict().parse(request.body ?? {});
    const origem = await prisma.design.findUnique({ where: { id }, select: { activeDraft: { select: { document: true } }, project: { select: { name: true, job: { select: { customerId: true } } } } } });
    if (!origem?.activeDraft) throw new AppError(404, 'Desenho técnico não encontrado.', 'DESIGN_NOT_FOUND');
    const copia = await prisma.$transaction((tx) => criarDesenhoDoCliente(tx, origem.project.job.customerId, name ?? `${origem.project.name} (cópia)`.slice(0, 120), request.user.id, origem.activeDraft!.document as Prisma.InputJsonValue));
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN', entityId: copia.design.id, action: 'COPIED', current: { fromDesignId: id, projectId: copia.project.id, name: copia.project.name } } });
    return reply.status(201).send({ designId: copia.design.id, projectId: copia.project.id, nome: copia.project.name, versao: copia.draft.version });
  });
  // Novo orçamento: antes de abrir o desenho de um projeto, leva a ele o que mudou no Orçamento Rápido.
  app.post('/designs/:id/sincronizar', desenhoAcessivel, async (request) => {
    const { id } = idSchema.parse(request.params);
    const { projeto, sincronia } = z.object({ projeto: projetoNoOrcamentoSchema, sincronia: sincroniaDesenhoSchema.optional() }).strict().parse(request.body);
    return sincronizarComOrcamento(id, projeto, sincronia, request.user.id);
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

  // "Imprimir desenho técnico" de um projeto do orçamento: o desenho usado nesse projeto (Novo orçamento)
  // ou, sem ele, o desenho técnico do orçamento — como está agora no editor. Quem vê o orçamento pode imprimir.
  app.get('/quotes/:id/items/:itemId/technical-pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, itemId } = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const quote = await prisma.quote.findFirst({ where: { AND: [{ id }, escopoOrcamentos(request.user)] }, select: { id: true, number: true, customerId: true, customerNameSnapshot: true, deliveryDeadline: true, dueDate: true, items: { where: { id: itemId }, select: { id: true, projectName: true, drawingData: true } } } });
    if (!quote?.items[0]) throw new AppError(404, 'Projeto não encontrado.', 'NOT_FOUND');
    const [desenho] = await desenhosTecnicosDosProjetos(quote, quote.items);
    if ('erro' in desenho) throw desenho.erro === 'EMPTY_TECHNICAL_DESIGN'
      ? new AppError(404, 'O desenho técnico deste projeto ainda não possui peças.', 'EMPTY_TECHNICAL_DESIGN')
      : new AppError(404, 'Este projeto ainda não possui desenho técnico. Para criá-lo, use “Adicionar desenho técnico” no projeto.', 'NO_TECHNICAL_DESIGN');
    const pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
    renderizarPdfTecnico(pdf, desenho.documento, desenho.dados);
    pdf.end();
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="desenho-tecnico-${quote.number}.pdf"`).send(pdf);
  });

  // Desenho técnico de um projeto do orçamento: abre o dele ou cria um novo, ligado só a ele.
  // O desenho antigo do orçamento (de antes de cada projeto ter o seu) vai para o projeto que o
  // pedir: sozinho quando o orçamento tem um projeto só; com mais de um, perguntando antes.
  app.post('/quotes/:id/items/:itemId/technical-design', authenticated, async (request, reply) => {
    const { id, itemId } = z.object({ id: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const { usarDoOrcamento } = z.object({ usarDoOrcamento: z.boolean().optional() }).strict().parse(request.body ?? {});
    const quote = await prisma.quote.findFirst({ where: { AND: [{ id }, escopoOrcamentos(request.user)] }, select: { id: true, number: true, customerId: true, items: { select: { id: true, ...selecaoProjetoParaDesenho } } } });
    const item = quote?.items.find((entrada) => entrada.id === itemId);
    if (!quote || !item) throw new AppError(404, 'Projeto não encontrado.', 'NOT_FOUND');
    // Abre levando ao desenho o que mudou no orçamento (um desenho novo recebe o projeto inteiro) e grava o vínculo no projeto.
    const abrir = async (design: { id: string; projectId: string }) => {
      const vinculo = vinculoDoProjeto(item.drawingData);
      const mesmo = vinculo?.designId === design.id ? vinculo : undefined;
      const troca = await sincronizarComOrcamento(design.id, projetoSalvoParaDesenho(item), mesmo?.sincronia, request.user.id);
      const desenhoTecnico = { designId: design.id, nome: troca.nome.slice(0, 160), versao: troca.versao, total: mesmo?.total ?? 0, aceitoEm: mesmo?.aceitoEm ?? new Date().toISOString(), ...(troca.sincronia ? { sincronia: troca.sincronia } : {}) };
      const drawingData = item.drawingData && typeof item.drawingData === 'object' && !Array.isArray(item.drawingData) ? item.drawingData : {};
      await prisma.quoteItem.update({ where: { id: item.id }, data: { drawingData: { ...drawingData, desenhoTecnico } as Prisma.InputJsonValue } });
      return { designId: design.id, editorUrl: `/projetos/${design.projectId}/desenhos/${design.id}`, avisos: troca.avisos };
    };
    const ligado = desenhoDoProjeto(item.drawingData);
    const doProjeto = ligado ? await prisma.design.findFirst({ where: { id: ligado, project: { job: { customerId: quote.customerId } } }, select: { id: true, projectId: true } }) : null;
    if (doProjeto) return abrir(doProjeto);
    const antigo = await desenhoDoOrcamentoSemProjeto(quote.id, quote.items);
    if (antigo && (quote.items.length === 1 || usarDoOrcamento === true)) return abrir(antigo);
    if (antigo && usarDoOrcamento === undefined) throw new AppError(409, 'Este orçamento já tem um desenho técnico que ainda não foi ligado a nenhum projeto.', 'UNASSIGNED_TECHNICAL_DESIGN');
    const criado = await prisma.$transaction((tx) => criarDesenhoDoCliente(tx, quote.customerId, `${nomeProjeto(item)} · ${quote.number}`.slice(0, 120), request.user.id));
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'DESIGN', entityId: criado.design.id, action: 'CREATED_FROM_QUOTE', current: { quoteId: quote.id, itemId: item.id, projectId: criado.project.id } } });
    return reply.status(201).send(await abrir(criado.design));
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
