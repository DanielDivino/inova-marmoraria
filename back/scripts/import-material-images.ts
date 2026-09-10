import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { config } from 'dotenv';
import { BillingUnit, PrismaClient } from '@prisma/client';

config({ path: process.env.DOTENV_CONFIG_PATH ?? resolve(process.cwd(), '../.env') });

type SourceMaterial = { nome: string | null; arquivo: string; confirmar_nome: boolean };

const prisma = new PrismaClient();
const sourceDirectory = process.argv[2];

if (!sourceDirectory) {
  console.error('Uso: npm run catalog:import-images --workspace=@inova/api -- <pasta-extraida/materiais-inova>');
  process.exit(1);
}

const aliases: Record<string, string[]> = {
  'Branco Itaúnas': ['Branco Itaúna'],
  'Super Nanoglass': ['Super Nano'],
  'Ônix Translúcido': ['Translúcido'],
  'Preto Stellar': ['Stellar']
};

const inferredCategories: Record<string, string> = {
  'Ultracompacto Branco': 'Industrializados / Importados',
  'Nero Marquina': 'Mármores'
};

const normalizeFileName = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9._-]+/g, '-');

function pendingName(file: string) {
  const code = basename(file, extname(file)).match(/\d+$/)?.[0] ?? 'sem-codigo';
  return `Material sem identificação ${code}`;
}

async function findMaterial(name: string) {
  return prisma.material.findFirst({
    where: { name: { in: [name, ...(aliases[name] ?? [])], mode: 'insensitive' } }
  });
}

async function main() {
  const manifestPath = resolve(sourceDirectory, 'materiais.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as SourceMaterial[];
  const uploadDirectory = resolve(process.cwd(), 'uploads', 'materials');
  await mkdir(uploadDirectory, { recursive: true });

  const report = { associated: [] as string[], createdPending: [] as string[], skipped: [] as string[] };

  for (const entry of manifest) {
    const source = resolve(sourceDirectory, entry.arquivo);
    try { await stat(source); } catch { report.skipped.push(`${entry.arquivo} (arquivo ausente)`); continue; }

    const requestedName = entry.nome ?? pendingName(entry.arquivo);
    let material = await findMaterial(requestedName);
    const requiresReview = entry.confirmar_nome || !entry.nome;

    if (!material) {
      material = await prisma.material.create({
        data: {
          name: requestedName,
          category: requiresReview ? 'A confirmar' : inferredCategories[requestedName] ?? 'A confirmar',
          billingUnit: BillingUnit.SQUARE_METER,
          // Nenhuma imagem recebida contém tabela de preço. Itens novos ficam inativos
          // até revisão administrativa, evitando orçamento acidental sem valor definido.
          isActive: false,
          prices: { create: { amount: 0 } }
        }
      });
      report.createdPending.push(material.name);
    }

    const storedName = normalizeFileName(basename(entry.arquivo));
    const destination = join(uploadDirectory, storedName);
    try { await stat(destination); } catch { await copyFile(source, destination); }

    const url = `/uploads/materials/${storedName}`;
    await prisma.$transaction(async (tx) => {
      await tx.materialImage.updateMany({ where: { materialId: material!.id }, data: { isPrimary: false } });
      const existingImage = await tx.materialImage.findFirst({ where: { materialId: material!.id, url } });
      if (existingImage) await tx.materialImage.update({ where: { id: existingImage.id }, data: { alt: requestedName, isPrimary: true } });
      else await tx.materialImage.create({ data: { materialId: material!.id, url, alt: requestedName, isPrimary: true } });
    });
    report.associated.push(`${requestedName} → ${material.name}`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
