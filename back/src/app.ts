import cors from '@fastify/cors';
import { registrarRotasDashboard } from './modulos/dashboard/dashboard.routes.js';
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
import { registrarRotasFuncionarios } from './modulos/funcionarios/worker.routes.js';
import { registrarRotasFluxo } from './modulos/fluxo/workflow.routes.js';
import { AppError } from './compartilhado/http.js';
import { registrarRotasRemontagem } from './modulos/remontagem/remount.routes.js';

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
  app.register(registrarRotasRemontagem, { prefix: '/quotes' });
  app.register(registrarRotasUsuarios, { prefix: '/users' });
  app.register(registrarRotasDashboard, { prefix: '/dashboard' });
  app.register(registrarRotasAuditoria, { prefix: '/audit' });
  app.register(registrarRotasNotificacoes, { prefix: '/notifications' });
  app.register(registrarRotasDesenhos);
  app.register(registrarRotasFuncionarios, { prefix: '/workers' });
  app.register(registrarRotasFluxo, { prefix: '/workflow' });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      // A resposta só resume; o log guarda o caminho de cada campo recusado (sem os valores enviados).
      request.log.warn({ issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }, 'Dados inválidos');
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Dados inválidos.', issues: error.flatten() });
    }
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    app.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' });
  });

  return app;
}
