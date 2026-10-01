import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Executa um comando com o .env da raiz carregado, sem sobrescrever variáveis já definidas.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const [comando, ...args] = process.argv.slice(2);
if (!comando) { console.error('Use: node scripts/com-env.mjs <comando> [argumentos]'); process.exit(1); }
const resultado = spawnSync(comando, args, { env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
if (resultado.error) console.error(resultado.error.message);
process.exit(resultado.status ?? 1);
