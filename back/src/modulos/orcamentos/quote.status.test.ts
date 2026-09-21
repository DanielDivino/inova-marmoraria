import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { registrarRotasOrcamentos } from './quote.routes.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../compartilhado/http.js';

vi.mock('../../config/prisma.js', () => ({ prisma: {
  quote: { findUnique: vi.fn(), update: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn(),
} }));
let app: FastifyInstance;
const quote = { id: 'cm00000000000000000000001', status: 'APPROVED', executionStatus: 'IN_PROGRESS', approvedAt: new Date(2026, 8, 1), startedAt: new Date(2026, 8, 1), dueDate: new Date(2026, 8, 20), completedAt: null, estimatedBusinessDays: 15, grossTotal: 1000, discountAmount: 100, netTotal: 900, items: [] };
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(prisma.quote.findUnique).mockResolvedValue(quote as never);
  vi.mocked(prisma.quote.update).mockImplementation(({ data }: any) => Promise.resolve({ ...quote, ...data }) as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma));
  app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = { id: 'internal-user', role: 'ADMIN' }; });
  app.setErrorHandler((error, _request, reply) => reply.status(error instanceof AppError ? error.statusCode : 500).send({ message: error instanceof Error ? error.message : 'Erro interno' }));
  await app.register(registrarRotasOrcamentos, { prefix: '/quotes' });
});
afterEach(async () => { await app.close(); });
const change = (payload: object) => app.inject({ method: 'PATCH', url: `/quotes/${quote.id}/status`, payload });

it('marca entrega com data gerada no servidor e conserva o total negociado', async () => {
  const result = await change({ status: 'APPROVED', executionStatus: 'COMPLETED' });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ status: 'APPROVED', executionStatus: 'COMPLETED', grossTotal: 1000, discountAmount: 100, netTotal: 900 });
  expect(result.json().completedAt).toBeTruthy();
  const update = vi.mocked(prisma.quote.update).mock.calls[0][0].data;
  expect(update).not.toHaveProperty('grossTotal');
  expect(update).not.toHaveProperty('netTotal');
  expect(update).not.toHaveProperty('discountAmount');
  expect(prisma.auditLog.create).toHaveBeenCalledOnce();
});
it('reabre uma entrega em retrabalho mantendo aprovação e registrando a data anterior no histórico de auditoria', async () => {
  const delivered = { ...quote, executionStatus: 'COMPLETED', completedAt: new Date(2026, 8, 9) };
  vi.mocked(prisma.quote.findUnique).mockResolvedValue(delivered as never);
  const result = await change({ status: 'APPROVED', executionStatus: 'REWORK' });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ status: 'APPROVED', executionStatus: 'REWORK', completedAt: null, netTotal: 900 });
  expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ previous: expect.objectContaining({ completedAt: delivered.completedAt }) }) }));
});
it('não permite execução em um orçamento ainda não aprovado', async () => {
  vi.mocked(prisma.quote.findUnique).mockResolvedValue({ ...quote, status: 'SENT', executionStatus: 'NOT_STARTED' } as never);
  expect((await change({ status: 'SENT', executionStatus: 'REWORK' })).statusCode).toBe(409);
  expect(prisma.quote.update).not.toHaveBeenCalled();
});
it('não volta uma entrega diretamente para execução sem indicar retrabalho', async () => {
  vi.mocked(prisma.quote.findUnique).mockResolvedValue({ ...quote, executionStatus: 'COMPLETED' } as never);
  expect((await change({ status: 'APPROVED', executionStatus: 'IN_PROGRESS' })).statusCode).toBe(409);
  expect(prisma.quote.update).not.toHaveBeenCalled();
});
