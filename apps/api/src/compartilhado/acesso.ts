import type { Prisma } from '@inova/database';
import type { FastifyRequest } from 'fastify';
import { temPermissao, type Permission } from '@inova/domain';
import { prisma } from '../config/prisma.js';
import { AppError, idSchema, type AuthUser } from './http.js';

export const escopoOrcamentos = (user: AuthUser) => (user.role === 'SELLER' ? { createdById: user.id } : {}) satisfies Prisma.QuoteWhereInput;
export const escopoClientes = (user: AuthUser) => (user.role === 'SELLER' ? { ownerId: user.id } : {}) satisfies Prisma.CustomerWhereInput;

export function exigirPermissao(permission: Permission) {
  return async (request: FastifyRequest) => {
    if (!temPermissao(request.user.role, permission)) throw new AppError(403, 'Você não possui permissão para esta ação.', 'FORBIDDEN');
  };
}

/** Applied to every nested quote route, including both PDF families. */
export async function exigirOrcamentoProprio(request: FastifyRequest) {
  if (request.user.role !== 'SELLER' || !('id' in (request.params as object))) return;
  const { id } = idSchema.parse(request.params);
  if (!await prisma.quote.findFirst({ where: { id, ...escopoOrcamentos(request.user) }, select: { id: true } })) {
    throw new AppError(404, 'Orçamento não encontrado.', 'NOT_FOUND');
  }
}

export async function exigirClienteProprio(request: FastifyRequest) {
  if (request.user.role !== 'SELLER' || !('id' in (request.params as object))) return;
  const { id } = idSchema.parse(request.params);
  if (!await prisma.customer.findFirst({ where: { id, ...escopoClientes(request.user) }, select: { id: true } })) {
    throw new AppError(404, 'Cliente não encontrado.', 'NOT_FOUND');
  }
}
