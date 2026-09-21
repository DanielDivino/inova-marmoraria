import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// O comando funciona pela raiz ou pelo workspace da API e preserva variáveis do ambiente.
const raiz = fileURLToPath(new URL('../', import.meta.url));
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const resultado = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
  ...process.argv.slice(2), '--schema', 'back/prisma/schema.prisma',
], { cwd: raiz, env: process.env, stdio: 'inherit' });
if (resultado.error) console.error(resultado.error.message);
process.exit(resultado.status ?? 1);
