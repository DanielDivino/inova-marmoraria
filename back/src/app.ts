import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { registerAuth } from './modules/auth/auth.plugin.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerCatalogRoutes } from './modules/catalog/catalog.routes.js';
import { registerCustomerRoutes } from './modules/customers/customer.routes.js';
import { registerUserRoutes } from './modules/users/user.routes.js';
import { registerQuoteRoutes } from './modules/quotes/quote.routes.js';
import { registerAuditRoutes } from './modules/audit/audit.routes.js';
import { registerNotificationRoutes } from './modules/notifications/notification.routes.js';
import { AppError } from './shared/http.js';

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(cors, { origin: process.env.WEB_ORIGIN ?? true, credentials: true });
  app.register(fastifyStatic, { root: join(process.cwd(), 'uploads'), prefix: '/uploads/', decorateReply: false });
  await registerAuth(app);

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(registerAuthRoutes, { prefix: '/auth' });
  app.register(registerCatalogRoutes, { prefix: '/catalog' });
  app.register(registerCustomerRoutes, { prefix: '/customers' });
  app.register(registerQuoteRoutes, { prefix: '/quotes' });
  app.register(registerUserRoutes, { prefix: '/users' });
  app.register(registerAuditRoutes, { prefix: '/audit' });
  app.register(registerNotificationRoutes, { prefix: '/notifications' });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Dados inválidos.', issues: error.flatten() });
    }
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    app.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' });
  });

  return app;
}
