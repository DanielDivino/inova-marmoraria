import { z } from 'zod';
import { technicalDocumentSchema } from '@inova/domain/technical';
export { technicalDocumentSchema, emptyTechnicalDocument } from '@inova/domain/technical';
export type { TechnicalDocument } from '@inova/domain/technical';
export const updateDraftSchema = z.object({ baseVersion: z.number().int().positive(), document: technicalDocumentSchema }).strict();
export const createDesignSchema = z.object({ name: z.string().trim().min(1).max(160).default('Desenho técnico') });
export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(160), deliveryDeadline: z.string().date().nullable().optional() });
export const createJobSchema = z.object({ customerId: z.string().cuid(), name: z.string().trim().min(1).max(160) });
export const decisionSchema = z.object({ decision: z.enum(['APPROVE', 'RETURN']), note: z.string().trim().max(2000).default(''), warningsAcknowledged: z.boolean().default(false) }).superRefine((v,c)=>{if(v.decision==='RETURN'&&!v.note)c.addIssue({code:'custom',message:'Informe o motivo da devolução.',path:['note']});});

/** Projeto do Orçamento Rápido (em mm) e o vínculo com o desenho, na sincronização orçamento → desenho. */
const idCurto = z.string().min(1).max(100);
const medida = z.number().finite().min(0).max(1e6);
const lado = z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT']);
export const projetoNoOrcamentoSchema = z.object({
  nome: z.string().max(200),
  pecas: z.array(z.object({
    id: idCurto, label: z.string().max(200), componentType: z.string().max(40), lengthMm: medida, widthMm: medida, materialId: idCurto.optional(), raioCantosMm: medida.optional(),
    paiId: idCurto.optional(), ladoPai: lado.optional(),
    bordas: z.array(z.object({ side: z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT', 'CUSTOM']), serviceId: z.string().max(100), lengthMm: medida.optional(), heightMm: medida.optional() }).strict()).max(50),
  }).strict()).max(500),
  recortes: z.array(z.object({
    id: idCurto, pecaId: idCurto.optional(), cutoutType: z.string().max(40), label: z.string().max(200),
    lengthMm: medida.optional(), widthMm: medida.optional(), diameterMm: medida.optional(), positionX: medida.optional(), positionY: medida.optional(),
  }).strict()).max(500),
}).strict();
export const sincroniaDesenhoSchema = z.object({
  pecas: z.record(idCurto, z.object({ pecaId: idCurto, recursoId: idCurto.optional(), forma: z.enum(['RETANGULO', 'COMPOSTA', 'LIVRE']), parte: z.number().int().min(0).max(100) }).strict()),
  bordas: z.record(idCurto, z.record(z.string().max(40), idCurto)),
  recortes: z.record(idCurto, idCurto),
  base: projetoNoOrcamentoSchema,
}).strict();
