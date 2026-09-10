import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerAuth } from './auth.plugin.js';
import { registerAuthRoutes } from './auth.routes.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/http.js';

vi.mock('../../config/prisma.js', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
let app: FastifyInstance;
const user = { id: 'auth-test', name: 'Equipe', role: 'ADMIN' as const, maxDiscountPercent: 5 };
beforeEach(async () => {
  vi.mocked(prisma.user.findUnique).mockReset();
  app = Fastify();
  app.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => reply.status(error instanceof AppError ? error.statusCode : 500).send({ message: error.message }));
  await registerAuth(app);
  app.register(registerAuthRoutes, { prefix: '/auth' });
  await app.ready();
});
afterEach(async () => { await app.close(); });

it('cookie do login funciona tanto na API direta quanto pelo prefixo /api do site', async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...user, email: 'equipe@example.test', passwordHash: await bcrypt.hash('password-test', 4), isActive: true } as never);
  const result = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'equipe@example.test', password: 'password-test' } });
  expect(result.statusCode).toBe(200);
  const cookie = String(result.headers['set-cookie']);
  expect(cookie).toContain('Path=/;');
  expect(cookie).toContain('HttpOnly');
  const refresh = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { cookie: cookie.split(';')[0] } });
  expect(refresh.statusCode).toBe(200);
  const claims = app.jwt.verify<{ exp: number; iat: number }>(refresh.json().accessToken);
  expect(claims.exp - claims.iat).toBe(15 * 60);
});

it('conta desativada não renova nem continua navegando com token anterior', async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...user, isActive: false } as never);
  const token = app.jwt.sign(user);
  expect((await app.inject({ method: 'POST', url: '/auth/refresh', headers: { cookie: 'inova_refresh=' + token } })).statusCode).toBe(401);
  expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer ' + token } })).statusCode).toBe(401);
});

it('logout remove cookies novos e antigos, e sem cookie a renovação é negada', async () => {
  const result = await app.inject({ method: 'POST', url: '/auth/logout' });
  expect(result.statusCode).toBe(200);
  const cookies = result.headers['set-cookie'] as string[];
  expect(cookies).toHaveLength(2);
  expect(cookies.some((cookie) => cookie.includes('Path=/;'))).toBe(true);
  expect(cookies.some((cookie) => cookie.includes('Path=/auth;'))).toBe(true);
  expect(cookies.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  expect((await app.inject({ method: 'POST', url: '/auth/refresh' })).statusCode).toBe(401);
});
