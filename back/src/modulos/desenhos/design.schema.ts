import { z } from 'zod';
import { technicalDocumentSchema } from '@inova/domain/technical';
export { technicalDocumentSchema, emptyTechnicalDocument } from '@inova/domain/technical';
export type { TechnicalDocument } from '@inova/domain/technical';
export const updateDraftSchema = z.object({ baseVersion: z.number().int().positive(), document: technicalDocumentSchema }).strict();
export const createDesignSchema = z.object({ name: z.string().trim().min(1).max(160).default('Desenho técnico') });
export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(160), deliveryDeadline: z.string().date().nullable().optional() });
export const createJobSchema = z.object({ customerId: z.string().cuid(), name: z.string().trim().min(1).max(160) });
export const decisionSchema = z.object({ decision: z.enum(['APPROVE', 'RETURN']), note: z.string().trim().max(2000).default(''), warningsAcknowledged: z.boolean().default(false) }).superRefine((v,c)=>{if(v.decision==='RETURN'&&!v.note)c.addIssue({code:'custom',message:'Informe o motivo da devolução.',path:['note']});});
