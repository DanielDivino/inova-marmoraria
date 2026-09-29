import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodTypeAny } from 'zod';

export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code = 'APP_ERROR') { super(message); }
}

export const idSchema = z.object({ id: z.string().cuid() });
export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> { return schema.parse(value); }
export function schemaConsultaPaginada<T extends z.ZodRawShape>(shape: T) { return z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(20), ...shape }); }
export type AuthUser = { id: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SELLER'; maxDiscountPercent: number; name: string; tokenUse?: 'access' | 'refresh' };
declare module 'fastify' { interface FastifyRequest { user: AuthUser } }
export function enviarPaginado(reply: FastifyReply, page: number, limit: number, total: number, data: unknown) { return reply.send({ data, meta: { page, limit, total, pages: Math.ceil(total / limit) } }); }
export function userId(request: FastifyRequest) { return request.user.id; }
/**
 * O acesso chegou por HTTPS (direto ou por um proxy)? Cookies com "Secure" só
 * valem assim: pela rede local (http://IP:porta) o navegador os descartaria.
 */
export function acessoHttps(request: Pick<FastifyRequest, 'protocol' | 'headers'>) {
  const encaminhado = request.headers['x-forwarded-proto'];
  return request.protocol === 'https' || String(Array.isArray(encaminhado) ? encaminhado[0] : encaminhado ?? '').split(',')[0].trim() === 'https';
}
