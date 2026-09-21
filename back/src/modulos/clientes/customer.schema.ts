import { z } from 'zod';
export const digitsOnly = (value: string) => value.replace(/\D/g, '');
export const customerSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().max(25).regex(/^[+\d\s().-]+$/, 'Informe um telefone válido.').transform(digitsOnly).pipe(z.string().min(8).max(15)),
  email: z.string().email().optional().nullable(), document: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(), neighborhood: z.string().max(120).optional().nullable(), city: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(), complement: z.string().max(200).optional().nullable(), notes: z.string().max(2000).optional().nullable(),
});
