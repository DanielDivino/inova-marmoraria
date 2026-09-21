import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { registrarAutenticacao } from './modulos/autenticacao/auth.plugin.js';
import { registrarRotasAutenticacao } from './modulos/autenticacao/auth.routes.js';
import { registrarRotasCatalogo } from './modulos/catalogo/catalog.routes.js';
import { registrarRotasClientes } from './modulos/clientes/customer.routes.js';
import { registrarRotasUsuarios } from './modulos/usuarios/user.routes.js';
import { registrarRotasOrcamentos } from './modulos/orcamentos/quote.routes.js';
import { registrarRotasAuditoria } from './modulos/auditoria/audit.routes.js';
import { registrarRotasNotificacoes } from './modulos/notificacoes/notification.routes.js';
import { registrarRotasDesenhos } from './modulos/desenhos/design.routes.js';
import { AppError } from './compartilhado/http.js';

export async function criarAplicacao() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(cors, { origin: process.env.WEB_ORIGIN ?? true, credentials: true });
  app.register(fastifyStatic, { root: join(process.cwd(), 'uploads'), prefix: '/uploads/', decorateReply: false });
  await registrarAutenticacao(app);

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(registrarRotasAutenticacao, { prefix: '/auth' });
  app.register(registrarRotasCatalogo, { prefix: '/catalog' });
  app.register(registrarRotasClientes, { prefix: '/customers' });
  app.register(registrarRotasOrcamentos, { prefix: '/quotes' });
  app.register(registrarRotasUsuarios, { prefix: '/users' });
  app.register(registrarRotasAuditoria, { prefix: '/audit' });
  app.register(registrarRotasNotificacoes, { prefix: '/notifications' });
  app.register(registrarRotasDesenhos);

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
