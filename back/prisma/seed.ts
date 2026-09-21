import bcrypt from 'bcryptjs';
import { BillingUnit, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const seedPassword = process.env.SEED_PASSWORD ?? 'Inova@123';
const materials = [
  ['Marrom Absoluto', 'Granitos', 700], ['Bege Corumbá', 'Granitos', 700], ['Branco Dallas', 'Granitos', 700], ['Branco Siena', 'Granitos', 700], ['Branco Itaúna', 'Granitos', 700], ['Preto São Gabriel', 'Granitos', 700], ['Preto Via Láctea', 'Granitos', 800], ['Preto Indiano', 'Granitos', 750], ['Café Imperial', 'Granitos', 700], ['Ocre Itabira', 'Granitos', 600], ['Verde Ubatuba', 'Granitos', 600], ['Cinza Corumbazinho', 'Granitos', 600], ['Cinza Andorinha', 'Granitos', 600], ['Amarelo Ornamental', 'Granitos', 600], ['Amarelo Icaraí', 'Granitos', 600], ['Verde Esmeralda', 'Granitos', 600], ['Verde Pavão', 'Granitos', 600],
  ['Mármore Branco', 'Mármores', 700], ['Mármore Bege Bahia', 'Mármores', 700],
  ['Silestone', 'Industrializados / Importados', 1600], ['Branco Prime', 'Industrializados / Importados', 1800], ['Super Prime', 'Industrializados / Importados', 800], ['Cinza Grey', 'Industrializados / Importados', 1800], ['Calacata', 'Industrializados / Importados', 1800], ['Stellar', 'Industrializados / Importados', 1800], ['Preto', 'Industrializados / Importados', 2000], ['Super Nano', 'Industrializados / Importados', 2000], ['New MPA', 'Industrializados / Importados', 3000], ['Translúcido', 'Industrializados / Importados', 3000], ['Lâmina Ultracompacto Calacata', 'Industrializados / Importados', 3000],
  ['Branco Estelar', 'Outros', 1900], ['Preto Blackstone', 'Outros', 1000], ['Calacatta / Quartzo', 'Outros', 1800], ['Ultracompacto Gold', 'Outros', 2200], ['Taj Mahal', 'Outros', 3200], ['Yoshi', 'Outros', 2200], ['Preto Escovado', 'Outros', 750], ['Calacatta Gold', 'Outros', 2000]
] as const;
const legacyMaterials: Record<string, [string, number]> = { 'Preto São Gabriel': ['Granito Preto São Gabriel', 380], 'Mármore Branco': ['Mármore Branco Paraná', 520], 'Cinza Andorinha': ['Granito Cinza Andorinha', 290] };
const services = [
  ['Cuba esculpida', 'Recortes / Furações', BillingUnit.UNIT, 0],
  ['Recorte de cuba', 'Recortes / Furações', BillingUnit.UNIT, 180],
  ['Vista', 'Acabamentos', BillingUnit.LINEAR_METER, 0],
  ['Acabamento Simples', 'Acabamentos', BillingUnit.LINEAR_METER, 0], ['Saia', 'Acabamentos', BillingUnit.LINEAR_METER, 0], ['Acabamento 45° — Granito/Mármore', 'Acabamentos', BillingUnit.LINEAR_METER, 70], ['Acabamento 45° — Importado', 'Acabamentos', BillingUnit.LINEAR_METER, 100], ['Acabamento Meia Cana', 'Acabamentos', BillingUnit.LINEAR_METER, 30], ['Acabamento Boleado', 'Acabamentos', BillingUnit.LINEAR_METER, 80], ['Acabamento Duplo', 'Acabamentos', BillingUnit.LINEAR_METER, 50], ['Acabamento com Brilho', 'Acabamentos', BillingUnit.LINEAR_METER, 30], ['Acabamento Jateado', 'Acabamentos', BillingUnit.SQUARE_METER, 400], ['Acabamento Polimento', 'Acabamentos', BillingUnit.SQUARE_METER, 100],
  ['Corte para Fogão', 'Recortes / Furações', BillingUnit.UNIT, 70], ['Corte para Porcelanato', 'Recortes / Furações', BillingUnit.UNIT, 5], ['Furo de Cuba', 'Recortes / Furações', BillingUnit.UNIT, 70], ['Furo de Torneira', 'Recortes / Furações', BillingUnit.UNIT, 70], ['Friso', 'Recortes / Furações', BillingUnit.UNIT, 200], ['Acabamento Rebaixo Italiano', 'Outros serviços', BillingUnit.SQUARE_METER, 600],
  ['Cuba Tramontina 40 x 34', 'Cubas / Itens', BillingUnit.UNIT, 250], ['Cuba Média 47 x 30', 'Cubas / Itens', BillingUnit.UNIT, 300], ['Cuba Grande 56 x 34', 'Cubas / Itens', BillingUnit.UNIT, 350], ['Tanque', 'Cubas / Itens', BillingUnit.UNIT, 500], ['Cuba Oval Grande — Louça', 'Cubas / Itens', BillingUnit.UNIT, 150], ['Cuba Oval Pequena — Louça', 'Cubas / Itens', BillingUnit.UNIT, 120]
] as const;

async function ensureMaterial(name: string, category: string, amount: number) {
  const legacy = legacyMaterials[name];
  let material = await prisma.material.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (!material && legacy) material = await prisma.material.findFirst({ where: { name: { equals: legacy[0], mode: 'insensitive' } } });
  if (material) {
    material = await prisma.material.update({ where: { id: material.id }, data: { name, category, billingUnit: BillingUnit.SQUARE_METER, isActive: true } });
  } else material = await prisma.material.create({ data: { name, category, billingUnit: BillingUnit.SQUARE_METER, isActive: true } });
  const current = await prisma.materialPrice.findFirst({ where: { materialId: material.id, validTo: null }, orderBy: { validFrom: 'desc' } });
  if (!current) await prisma.materialPrice.create({ data: { materialId: material.id, amount } });
  else if (legacy && Number(current.amount) === legacy[1]) {
    await prisma.$transaction([prisma.materialPrice.update({ where: { id: current.id }, data: { validTo: new Date() } }), prisma.materialPrice.create({ data: { materialId: material.id, amount } })]);
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  await prisma.user.upsert({ where: { email: 'admin@inovamarmoraria.local' }, update: {}, create: { name: 'Administrador Inova', email: 'admin@inovamarmoraria.local', passwordHash, role: Role.SUPER_ADMIN, maxDiscountPercent: 100 } });
  await prisma.user.upsert({ where: { email: 'atendente@inovamarmoraria.local' }, update: {}, create: { name: 'Atendente Inova', email: 'atendente@inovamarmoraria.local', passwordHash, role: Role.ADMIN, maxDiscountPercent: 5 } });
  for (const name of ['Soleira', 'Peitoril', 'Bancada', 'Pia', 'Escada', 'Mesa', 'Ilha', 'Outro']) await prisma.productType.upsert({ where: { name }, update: {}, create: { name } });
  for (const [name, category, price] of materials) await ensureMaterial(name, category, price);
  for (const [name, category, billingUnit, currentPrice] of services) {
    const existing = await prisma.service.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (!existing) await prisma.service.create({ data: { name, category, billingUnit, currentPrice, isActive: true } });
    else await prisma.service.update({ where: { id: existing.id }, data: { category, billingUnit, isActive: true } });
  }
  const oval = await prisma.service.findFirst({ where: { name: { equals: 'Corte de cuba oval', mode: 'insensitive' } } });
  if (!oval) {
    const standardCut = await prisma.service.findFirstOrThrow({ where: { name: { equals: 'Recorte de cuba', mode: 'insensitive' } } });
    await prisma.service.create({ data: { name: 'Corte de cuba oval', category: 'Recortes / Furações', billingUnit: standardCut.billingUnit, currentPrice: standardCut.currentPrice, isActive: true } });
  }
  console.log(`Seed Inova concluído: ${materials.length} materiais e ${services.length + 1} serviços configurados.`);
}
main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
