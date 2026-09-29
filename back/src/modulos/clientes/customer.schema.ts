import { z } from 'zod';
export const digitsOnly = (value: string) => value.replace(/\D/g, '');
const telefone = z.string().trim().max(25).regex(/^[+\d\s().-]+$/, 'Informe um telefone válido.').transform(digitsOnly).pipe(z.string().min(8).max(15));
/** Campo que veio vazio ("" ou null) conta como não informado. */
const semVazio = (valor: unknown) => valor === '' || valor === null ? undefined : valor;
export const customerSchema = z.object({
  name: z.string().trim().min(2),
  phone: telefone,
  email: z.string().email().optional().nullable(), document: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(), neighborhood: z.string().max(120).optional().nullable(), city: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(), complement: z.string().max(200).optional().nullable(), notes: z.string().max(2000).optional().nullable(),
});
/** Orçamento sem cadastro (cliente rápido): nenhum dado é obrigatório; sem nome, o sistema numera ("Sem cadastro 3"). */
export const quickCustomerSchema = customerSchema.extend({
  name: z.preprocess(semVazio, z.string().trim().max(160).optional()),
  phone: z.preprocess(semVazio, telefone.optional()),
});
/** Edição: telefone e nome vazios mantêm o que já está salvo (o cliente rápido pode continuar sem telefone). */
export const customerUpdateSchema = customerSchema.extend({
  name: z.preprocess(semVazio, z.string().trim().min(2).optional()),
  phone: z.preprocess(semVazio, telefone.optional()),
}).partial();
