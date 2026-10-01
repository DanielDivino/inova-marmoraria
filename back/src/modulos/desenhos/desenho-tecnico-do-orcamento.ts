import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { detalheDesenhoComponente } from '@inova/domain';
import { sincronizarDesenho, technicalDocumentSchema, validateTechnicalDocument, type ProjetoNoOrcamento, type SincroniaDesenho, type TechnicalDocument } from '@inova/domain/technical';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../compartilhado/http.js';
import type { DadosPdfTecnico } from './technical.pdf.js';
import { rotuloEntregaPdf } from '../orcamentos/pdf-layout.js';
import { sincroniaDesenhoSchema } from './design.schema.js';

type Projeto = { id: string; projectName: string | null; drawingData: unknown };
type Orcamento = { id: string; number: string; customerId: string; customerNameSnapshot: string; deliveryDeadline: Date | null; dueDate: Date | null };
export type DesenhoTecnicoDoProjeto = { itemId: string; designId: string; documento: TechnicalDocument; dados: DadosPdfTecnico };
export type SemDesenhoTecnico = { itemId: string; erro: 'NO_TECHNICAL_DESIGN' | 'EMPTY_TECHNICAL_DESIGN' };

/** Desenho técnico ligado ao projeto do orçamento (gravado no próprio projeto). */
export function desenhoDoProjeto(drawingData: unknown): string | undefined {
  const designId = (drawingData as { desenhoTecnico?: { designId?: unknown } } | null)?.desenhoTecnico?.designId;
  return typeof designId === 'string' ? designId : undefined;
}

/**
 * Desenho antigo do orçamento (feito antes de cada projeto ter o seu, pelo ⋯ → Desenho técnico)
 * que ainda não foi ligado a nenhum projeto deste orçamento.
 */
export async function desenhoDoOrcamentoSemProjeto(quoteId: string, projetos: { drawingData: unknown }[]) {
  const orcamento = await prisma.quote.findUnique({ where: { id: quoteId }, select: { job: { select: { projects: { orderBy: { updatedAt: 'desc' }, take: 1, select: { designs: { orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, projectId: true } } } } } } } });
  const desenho = orcamento?.job?.projects[0]?.designs[0];
  return desenho && !projetos.some((projeto) => desenhoDoProjeto(projeto.drawingData) === desenho.id) ? desenho : null;
}

/**
 * Desenho técnico de cada projeto do orçamento, como está agora: cada projeto tem o seu. O desenho
 * antigo do orçamento só vale sozinho quando o orçamento tem um projeto só (com mais de um, ele
 * precisa ser ligado a um deles). Só vale desenho do cliente deste orçamento e com peças. Sai no
 * padrão das folhas de OS do orçamento.
 */
export async function desenhosTecnicosDosProjetos(quote: Orcamento, projetos: Projeto[]): Promise<(DesenhoTecnicoDoProjeto | SemDesenhoTecnico)[]> {
  const todos = await prisma.quoteItem.findMany({ where: { quoteId: quote.id }, select: { drawingData: true } });
  const antigo = todos.length === 1 ? (await desenhoDoOrcamentoSemProjeto(quote.id, todos))?.id : undefined;
  const escolhidos = projetos.map((projeto) => ({ projeto, designId: desenhoDoProjeto(projeto.drawingData) ?? antigo }));
  const ids = [...new Set(escolhidos.flatMap(({ designId }) => designId ? [designId] : []))];
  const desenhos = new Map((ids.length ? await prisma.design.findMany({ where: { id: { in: ids } }, include: { activeDraft: true, project: { select: { name: true, job: { select: { customerId: true } } } } } }) : []).map((desenho) => [desenho.id, desenho]));
  return escolhidos.map(({ projeto, designId }) => {
    const desenho = designId ? desenhos.get(designId) : undefined;
    if (!desenho?.activeDraft || desenho.project.job.customerId !== quote.customerId) return { itemId: projeto.id, erro: 'NO_TECHNICAL_DESIGN' as const };
    const documento = technicalDocumentSchema.parse(desenho.activeDraft.document);
    if (!documento.pieces.length) return { itemId: projeto.id, erro: 'EMPTY_TECHNICAL_DESIGN' as const };
    return { itemId: projeto.id, designId: desenho.id, documento, dados: {
      customer: quote.customerNameSnapshot, project: projeto.projectName || desenho.project.name, design: desenho.name,
      revision: `Versão ${desenho.activeDraft.version}`, hash: createHash('sha256').update(JSON.stringify(documento)).digest('hex'), createdAt: desenho.activeDraft.updatedAt,
      ordemServico: { numero: quote.number, entrega: rotuloEntregaPdf(quote) },
    } };
  });
}

/**
 * Desenhos técnicos para a exportação: um por desenho, na ordem dos projetos (um desenho usado em
 * mais de um projeto sai uma vez só, com o nome de todos eles).
 */
export async function desenhosTecnicosParaExportar(quote: Orcamento, projetos: Projeto[]): Promise<DesenhoTecnicoDoProjeto[]> {
  const encontrados = (await desenhosTecnicosDosProjetos(quote, projetos)).filter((entrada): entrada is DesenhoTecnicoDoProjeto => 'designId' in entrada);
  const porDesenho = new Map<string, DesenhoTecnicoDoProjeto[]>();
  for (const entrada of encontrados) porDesenho.set(entrada.designId, [...(porDesenho.get(entrada.designId) ?? []), entrada]);
  return [...porDesenho.values()].map((mesmos) => mesmos.length === 1 ? mesmos[0] : { ...mesmos[0], dados: { ...mesmos[0].dados, project: mesmos.map((entrada) => entrada.dados.project).join(', ') } });
}

type ProjetoSalvo = {
  projectName: string | null; materialId: string; drawingData: unknown;
  components: { id: string; label: string; componentType: string; lengthMm: number; widthMm: number; materialId: string | null; edges: { side: string; serviceId: string; lengthMm: number; heightMm: number | null }[] }[];
  cutouts: { id: string; componentId: string | null; cutoutType: string; label: string | null; lengthMm: number | null; widthMm: number | null; diameterMm: number | null; positionX: number | null; positionY: number | null }[];
};
/** Seleção do projeto salvo com o que a sincronização com o desenho usa (na ordem do orçamento). */
export const selecaoProjetoParaDesenho = {
  projectName: true, materialId: true, drawingData: true,
  components: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, label: true, componentType: true, lengthMm: true, widthMm: true, materialId: true, edges: { orderBy: { sortOrder: 'asc' as const }, select: { side: true, serviceId: true, lengthMm: true, heightMm: true } } } },
  cutouts: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, componentId: true, cutoutType: true, label: true, lengthMm: true, widthMm: true, diameterMm: true, positionX: true, positionY: true } },
} satisfies Prisma.QuoteItemSelect;

/** Projeto salvo no formato que o desenho técnico entende (o mesmo que o Orçamento Rápido manda). */
export function projetoSalvoParaDesenho(item: ProjetoSalvo): ProjetoNoOrcamento {
  const mm = (campo: string, valor: number | null) => valor === null ? {} : { [campo]: valor };
  return {
    nome: item.projectName?.trim() ?? '',
    pecas: item.components.map((componente, indice) => {
      const detalhe = detalheDesenhoComponente(item.drawingData, indice);
      const pai = detalhe.parentComponentIndex === undefined ? undefined : item.components[detalhe.parentComponentIndex];
      return {
        id: componente.id, label: componente.label, componentType: componente.componentType, lengthMm: componente.lengthMm, widthMm: componente.widthMm,
        materialId: componente.materialId ?? item.materialId, ...mm('raioCantosMm', detalhe.cornerRadiusMm ?? null),
        ...(pai ? { paiId: pai.id } : {}), ...(pai && componente.componentType === 'BACKSPLASH' && detalhe.parentSide ? { ladoPai: detalhe.parentSide } : {}),
        bordas: componente.edges.map((borda) => ({ side: borda.side as ProjetoNoOrcamento['pecas'][number]['bordas'][number]['side'], serviceId: borda.serviceId, lengthMm: borda.lengthMm, ...mm('heightMm', borda.heightMm) })),
      };
    }),
    recortes: item.cutouts.map((recorte) => ({
      id: recorte.id, ...(recorte.componentId ? { pecaId: recorte.componentId } : {}), cutoutType: recorte.cutoutType, label: recorte.label ?? '',
      ...mm('lengthMm', recorte.lengthMm), ...mm('widthMm', recorte.widthMm), ...mm('diameterMm', recorte.diameterMm), ...mm('positionX', recorte.positionX), ...mm('positionY', recorte.positionY),
    })),
  };
}

/** Vínculo do projeto com o desenho técnico, como está gravado no projeto do orçamento. */
export function vinculoDoProjeto(drawingData: unknown): { designId: string; nome?: string; versao?: number; total?: number; aceitoEm?: string; sincronia?: SincroniaDesenho } | undefined {
  const vinculo = (drawingData as { desenhoTecnico?: Record<string, unknown> } | null)?.desenhoTecnico;
  if (!vinculo || typeof vinculo.designId !== 'string') return undefined;
  const sincronia = sincroniaDesenhoSchema.safeParse(vinculo.sincronia);
  return { ...vinculo, designId: vinculo.designId, sincronia: sincronia.success ? sincronia.data : undefined } as ReturnType<typeof vinculoDoProjeto>;
}

/**
 * Leva ao desenho técnico o que mudou no projeto do orçamento desde a última troca (ver
 * `sincronizarDesenho`), grava a versão nova do desenho e dá ao desenho o nome do projeto. Se o
 * desenho foi mudado ao mesmo tempo em outra tela, não grava e avisa: entra na próxima vez.
 */
export async function sincronizarComOrcamento(designId: string, projeto: ProjetoNoOrcamento, anterior: SincroniaDesenho | undefined, userId: string) {
  const desenho = await prisma.design.findUnique({ where: { id: designId }, include: { activeDraft: true, project: { select: { id: true, name: true } } } });
  if (!desenho?.activeDraft) throw new AppError(404, 'Desenho técnico não encontrado.', 'DESIGN_NOT_FOUND');
  const [materiais, servicos] = await Promise.all([
    prisma.material.findMany({ select: { id: true, name: true, images: { orderBy: { isPrimary: 'desc' }, take: 1, select: { url: true } } } }),
    prisma.service.findMany({ select: { id: true, name: true } }),
  ]);
  const catalogo = { materiais: materiais.map((material) => ({ id: material.id, name: material.name, imageUrl: material.images[0]?.url ?? null })), servicos };
  const resultado = sincronizarDesenho(technicalDocumentSchema.parse(desenho.activeDraft.document), projeto, anterior, catalogo, randomUUID);
  let versao = desenho.activeDraft.version;
  const avisos = [...resultado.avisos];
  let sincronia: SincroniaDesenho | undefined = resultado.sincronia;
  if (resultado.alterado) {
    const problema = validateTechnicalDocument(resultado.documento).find((diagnostico) => diagnostico.severity === 'STRUCTURAL');
    const gravado = problema ? 0 : (await prisma.designDraft.updateMany({ where: { id: desenho.activeDraft.id, version: versao }, data: { document: resultado.documento as Prisma.InputJsonValue, version: { increment: 1 }, schemaVersion: resultado.documento.schemaVersion, updatedById: userId } })).count;
    if (gravado === 1) {
      versao += 1;
      await prisma.design.update({ where: { id: designId }, data: {} });
      await prisma.auditLog.create({ data: { userId, entityType: 'DESIGN_DRAFT', entityId: desenho.activeDraft.id, action: 'SYNCED_FROM_QUOTE', current: { designId, version: versao } } });
    } else {
      // Fica como estava: o que mudou no orçamento entra na próxima vez que o desenho for aberto.
      sincronia = anterior;
      avisos.push(problema ? `As mudanças do orçamento não couberam no desenho técnico (${problema.message}); ajuste no desenho.` : 'O desenho técnico estava sendo alterado em outra tela; as mudanças do orçamento entram na próxima vez que ele for aberto.');
    }
  }
  // O nome do projeto no orçamento é o nome do desenho.
  let nome = desenho.project.name;
  const novoNome = projeto.nome.trim().slice(0, 120);
  if (anterior && novoNome && novoNome !== anterior.base.nome.trim() && novoNome !== nome) {
    nome = (await prisma.project.update({ where: { id: desenho.project.id }, data: { name: novoNome }, select: { name: true } })).name;
  }
  return { sincronia, avisos, versao, nome, alterado: resultado.alterado };
}

