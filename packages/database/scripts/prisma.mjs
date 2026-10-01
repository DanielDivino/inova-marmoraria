import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Roda a CLI do Prisma com o schema deste pacote e o .env da raiz do monorepo.
// Variáveis já presentes no ambiente (ex.: DATABASE_URL dos testes isolados) têm prioridade.
const pacote = fileURLToPath(new URL('../', import.meta.url));
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const resultado = spawnSync(process.execPath, [cli, ...process.argv.slice(2), '--schema', 'prisma/schema.prisma'], { cwd: pacote, env: process.env, stdio: 'inherit' });
if (resultado.error) console.error(resultado.error.message);
process.exit(resultado.status ?? 1);
