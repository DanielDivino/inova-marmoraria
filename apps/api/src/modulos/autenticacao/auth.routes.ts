import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { acessoHttps, AppError, type AuthUser } from '../../compartilhado/http.js';

const loginSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(8) });
function usuarioPublico(user: { id: string; name: string; role: AuthUser['role']; maxDiscountPercent: unknown }) { return { id: user.id, name: user.name, role: user.role, maxDiscountPercent: Number(user.maxDiscountPercent) }; }

export async function registrarRotasAutenticacao(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) throw new AppError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
    const sessionUser = usuarioPublico(user);
    const refreshToken = await reply.jwtSign({ ...sessionUser, tokenUse: 'refresh' }, { expiresIn: '7d' });
    reply.setCookie('inova_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', secure: acessoHttps(request), path: '/', maxAge: 7 * 24 * 60 * 60 });
    return { user: sessionUser, accessToken: await reply.jwtSign({ ...sessionUser, tokenUse: 'access' }) };
  });
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies.inova_refresh;
    if (!refreshToken) throw new AppError(401, 'Sessão expirada.', 'UNAUTHORIZED');
    let payload: AuthUser;
    try { payload = app.jwt.verify<AuthUser>(refreshToken); if (payload.tokenUse === 'access') throw new Error('Token de acesso não renova sessão.'); }
    catch { throw new AppError(401, 'Sessão expirada.', 'UNAUTHORIZED'); }
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) throw new AppError(401, 'Sessão expirada.', 'UNAUTHORIZED');
    const sessionUser = usuarioPublico(user);
    return { accessToken: await reply.jwtSign({ ...sessionUser, tokenUse: 'access' }), user: sessionUser };
  });
  app.post('/logout', async (_request, reply) => reply.clearCookie('inova_refresh', { path: '/auth' }).clearCookie('inova_refresh', { path: '/' }).send({ ok: true }));
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user || !user.isActive) throw new AppError(401, 'Sessão expirada.', 'UNAUTHORIZED');
    return { user: usuarioPublico(user) };
  });
}
