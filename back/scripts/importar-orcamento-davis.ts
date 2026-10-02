import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Importa o orçamento do cliente Davis (planilha Davis_lista_completa_final.xlsx) pela API do
 * sistema. Pode rodar de novo: não duplica, só completa o que faltou.
 *
 *   npm run importar:davis --workspace=@inova/api
 *
 * Quem cadastra: INOVA_IMPORT_EMAIL, ou o primeiro super administrador ativo.
 */
config({ path: process.env.DOTENV_CONFIG_PATH ?? resolve(process.cwd(), '../.env') });
// Sem o registro de cada requisição no terminal (a API roda aqui dentro, só para a importação).
process.env.NODE_ENV ??= 'test';

const { criarAplicacao } = await import('../src/app.js');
const { prisma } = await import('../src/config/prisma.js');
const { importarOrcamentoDavis } = await import('./importacoes/orcamento-davis.js');

const email = process.env.INOVA_IMPORT_EMAIL;
const usuario = await prisma.user.findFirst({ where: email ? { email, isActive: true } : { role: 'SUPER_ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
if (!usuario) {
  console.error(email ? `Usuário ativo ${email} não encontrado.` : 'Nenhum super administrador ativo encontrado.');
  process.exit(1);
}
const app = await criarAplicacao();
await app.ready();
try {
  await importarOrcamentoDavis(app, { id: usuario.id, name: usuario.name, role: usuario.role, maxDiscountPercent: Number(usuario.maxDiscountPercent) }, (mensagem) => console.log(`• ${mensagem}`));
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  await app.close();
  await prisma.$disconnect();
}
