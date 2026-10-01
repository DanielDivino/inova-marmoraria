import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { AppError, idSchema } from '../../compartilhado/http.js';
import { exigirPerfil } from '../autenticacao/auth.plugin.js';

const billingUnit = z.enum(['SQUARE_METER', 'LINEAR_METER', 'UNIT', 'FIXED']);
const materialSchema = z.object({ name: z.string().min(2), category: z.string().min(2), description: z.string().max(2000).optional().nullable(), billingUnit, unitPrice: z.number().nonnegative(), isActive: z.boolean().default(true) });
const productTypeSchema = z.object({ name: z.string().min(2), description: z.string().max(2000).optional().nullable(), imageUrl: z.string().url().optional().nullable(), isActive: z.boolean().default(true) });
const serviceSchema = z.object({ name: z.string().min(2), category: z.string().min(2).default('Geral'), billingUnit, currentPrice: z.number().nonnegative(), isActive: z.boolean().default(true) });
const materialInclude = { images: { orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }] }, prices: { orderBy: { validFrom: 'desc' as const }, take: 1 } };
const toMaterial = (material: any) => ({ ...material, currentPrice: material.prices[0] ? Number(material.prices[0].amount) : null, prices: undefined });
const toService = (service: any) => ({ ...service, currentPrice: Number(service.currentPrice) });
/** Ajustes da empresa; sem a linha no banco valem os padrões (M² fechado ligado). */
const ajustesEmpresa = async () => {
  const ajustes = await prisma.companySetting.findUnique({ where: { id: 'empresa' } });
  return { closedSquareMeter: ajustes?.closedSquareMeter ?? true };
};

export async function registrarRotasCatalogo(app: FastifyInstance) {
  await app.register(multipart, { limits: { files: 5, fileSize: 5 * 1024 * 1024 } });
  const authenticated = { preHandler: [app.authenticate] };
  const superOnly = { preHandler: [app.authenticate, exigirPerfil('SUPER_ADMIN')] };
  app.get('/materials/visual', authenticated, async () => {
    const materials = await prisma.material.findMany({
      where: { isActive: true },
      select: { id: true, name: true, category: true, description: true, images: { where: { isPrimary: true }, select: { url: true }, take: 1 } },
      orderBy: { name: 'asc' },
    });
    return materials.map(material => ({ id: material.id, name: material.name, category: material.category, description: material.description, imageUrl: material.images[0]?.url ?? null }));
  });
  app.get('/', authenticated, async () => {
    const [productTypes, materials, services] = await Promise.all([prisma.productType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }), prisma.material.findMany({ where: { isActive: true }, include: materialInclude, orderBy: { name: 'asc' } }), prisma.service.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })]);
    return { productTypes, materials: materials.map(toMaterial), services: services.map(toService), settings: await ajustesEmpresa() };
  });
  app.get('/settings', authenticated, ajustesEmpresa);
  // M² fechado fica sempre marcado nos orçamentos; só o administrador desliga, aqui (Materiais e serviços → Serviços e acabamentos).
  app.patch('/settings', superOnly, async (request) => {
    const input = z.object({ closedSquareMeter: z.boolean() }).strict().parse(request.body);
    const previous = await ajustesEmpresa();
    const updated = await prisma.companySetting.upsert({ where: { id: 'empresa' }, update: input, create: { id: 'empresa', ...input } });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'COMPANY_SETTING', entityId: 'empresa', action: 'UPDATED', previous, current: input } });
    return { closedSquareMeter: updated.closedSquareMeter };
  });
  app.get('/materials', authenticated, async (request) => {
    const query = z.object({ active: z.enum(['true', 'false', 'all']).default('true'), search: z.string().optional() }).parse(request.query);
    const where = { ...(query.active === 'all' ? {} : { isActive: query.active === 'true' }), ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}) };
    return (await prisma.material.findMany({ where, include: materialInclude, orderBy: { name: 'asc' } })).map(toMaterial);
  });
  app.post('/materials', superOnly, async (request, reply) => {
    const input = materialSchema.parse(request.body); const { unitPrice, ...data } = input;
    if (await prisma.material.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) throw new AppError(409, 'Já existe um material com este nome.', 'MATERIAL_ALREADY_EXISTS');
    const material = await prisma.material.create({ data: { ...data, prices: { create: { amount: unitPrice } } }, include: materialInclude });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL', entityId: material.id, action: 'CREATED', current: toMaterial(material) } });
    return reply.status(201).send(toMaterial(material));
  });
  app.patch('/materials/:id', superOnly, async (request) => {
    const { id } = idSchema.parse(request.params); const input = materialSchema.omit({ unitPrice: true }).partial().parse(request.body);
    const before = await prisma.material.findUnique({ where: { id }, include: materialInclude }); if (!before) throw new AppError(404, 'Material não encontrado.', 'NOT_FOUND');
    const material = await prisma.material.update({ where: { id }, data: input, include: materialInclude });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL', entityId: id, action: 'UPDATED', previous: toMaterial(before), current: toMaterial(material) } });
    return toMaterial(material);
  });
  app.post('/materials/:id/prices', superOnly, async (request) => {
    const { id } = idSchema.parse(request.params); const { amount } = z.object({ amount: z.number().nonnegative() }).parse(request.body);
    if (!await prisma.material.findUnique({ where: { id } })) throw new AppError(404, 'Material não encontrado.', 'NOT_FOUND');
    const [previous, price] = await prisma.$transaction(async (tx) => { const old = await tx.materialPrice.findFirst({ where: { materialId: id, validTo: null }, orderBy: { validFrom: 'desc' } }); if (old) await tx.materialPrice.update({ where: { id: old.id }, data: { validTo: new Date() } }); return [old, await tx.materialPrice.create({ data: { materialId: id, amount } })] as const; });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL_PRICE', entityId: id, action: 'PRICE_CHANGED', previous: previous ? { amount: Number(previous.amount) } : undefined, current: { amount } } });
    return { id: price.id, amount: Number(price.amount), validFrom: price.validFrom };
  });
  app.get('/materials/:id/prices', superOnly, async (request) => (await prisma.materialPrice.findMany({ where: { materialId: idSchema.parse(request.params).id }, orderBy: { validFrom: 'desc' } })).map((price) => ({ ...price, amount: Number(price.amount) })));
  app.post('/materials/:id/images', superOnly, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { replace } = z.object({ replace: z.enum(['true', 'false']).optional() }).parse(request.query);
    if (!await prisma.material.findUnique({ where: { id } })) throw new AppError(404, 'Material não encontrado.', 'NOT_FOUND');
    const file = await request.file(); if (!file || !file.mimetype.startsWith('image/')) throw new AppError(422, 'Envie uma imagem válida.', 'INVALID_IMAGE');
    const name = `${randomUUID()}${extname(file.filename).toLowerCase() || '.jpg'}`; const directory = join(process.cwd(), 'uploads', 'materials'); await mkdir(directory, { recursive: true }); await writeFile(join(directory, name), await file.toBuffer());
    const image = await prisma.$transaction(async (tx) => {
      const isPrimary = replace === 'true' || (await tx.materialImage.count({ where: { materialId: id } })) === 0;
      if (isPrimary) await tx.materialImage.updateMany({ where: { materialId: id }, data: { isPrimary: false } });
      return tx.materialImage.create({ data: { materialId: id, url: `/uploads/materials/${name}`, alt: file.filename, isPrimary } });
    });
    await prisma.auditLog.create({ data: { userId: request.user.id, entityType: 'MATERIAL_IMAGE', entityId: image.id, action: replace === 'true' ? 'REPLACED' : 'CREATED', current: image } });
    return reply.status(201).send(image);
  });
  app.patch('/materials/:id/images/:imageId', superOnly, async (request) => { const params = z.object({ id: z.string().cuid(), imageId: z.string().cuid() }).parse(request.params); const { isPrimary } = z.object({ isPrimary: z.boolean() }).parse(request.body); if (isPrimary) await prisma.materialImage.updateMany({ where: { materialId: params.id }, data: { isPrimary: false } }); return prisma.materialImage.update({ where: { id: params.imageId }, data: { isPrimary } }); });
  app.get('/product-types', authenticated, async () => prisma.productType.findMany({ orderBy: { name: 'asc' } }));
  app.post('/product-types', superOnly, async (request, reply) => reply.status(201).send(await prisma.productType.create({ data: productTypeSchema.parse(request.body) })));
  app.patch('/product-types/:id', superOnly, async (request) => prisma.productType.update({ where: idSchema.parse(request.params), data: productTypeSchema.partial().parse(request.body) }));
  app.get('/services', authenticated, async () => {
    const rebaixo = await prisma.service.findFirst({ where: { name: { equals: 'Acabamento Rebaixo Italiano', mode: 'insensitive' } } });
    if (!rebaixo) await prisma.service.create({ data: { name: 'Acabamento Rebaixo Italiano', category: 'Outros serviços', billingUnit: 'SQUARE_METER', currentPrice: 600, isActive: true } });
    return (await prisma.service.findMany({ orderBy: { name: 'asc' } })).map(toService);
  });
  app.post('/services', superOnly, async (request, reply) => { const input = serviceSchema.parse(request.body); if (await prisma.service.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) throw new AppError(409, 'Já existe um serviço com este nome.', 'SERVICE_ALREADY_EXISTS'); return reply.status(201).send(toService(await prisma.service.create({ data: input }))); });
  app.patch('/services/:id', superOnly, async (request) => toService(await prisma.service.update({ where: idSchema.parse(request.params), data: serviceSchema.partial().parse(request.body) })));
}
