import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { AppError, type AuthUser } from '../../compartilhado/http.js';

declare module '@fastify/jwt' { interface FastifyJWT { payload: AuthUser; user: AuthUser } }
declare module 'fastify' { interface FastifyInstance { authenticate: (request: import('fastify').FastifyRequest) => Promise<void> } }

export async function registrarAutenticacao(app: FastifyInstance) {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET é obrigatório em produção.');
  await app.register(cookie);
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'inova-dev-only-change-me', sign: { expiresIn: '15m' } });
  app.decorate('authenticate', async (request: import('fastify').FastifyRequest) => {
    try { await request.jwtVerify(); if (request.user.tokenUse === 'refresh') throw new Error('Token de renovação não concede acesso à API.'); } catch { throw new AppError(401, 'Sessão inválida ou expirada.', 'UNAUTHORIZED'); }
  });
}

export function exigirPerfil(...roles: AuthUser['role'][]) {
  return async (request: import('fastify').FastifyRequest) => {
    if (!roles.includes(request.user.role)) throw new AppError(403, 'Você não possui permissão para esta ação.', 'FORBIDDEN');
  };
}
