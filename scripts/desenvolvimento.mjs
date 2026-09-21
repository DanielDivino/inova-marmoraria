import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const compilacao = spawnSync('npm', ['run', 'build', '--workspace=@inova/domain'], { cwd: raiz, stdio: 'inherit' });
if (compilacao.status !== 0) process.exit(compilacao.status ?? 1);
const servidores = ['@inova/api', '@inova/web'].map(workspace => spawn('npm', ['run', 'dev', `--workspace=${workspace}`], {
  cwd: raiz, stdio: 'inherit', detached: process.platform !== 'win32',
}));
let encerrando = false;
function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  process.exitCode = codigo;
  for (const servidor of servidores) {
    if (!servidor.pid) continue;
    try {
      if (process.platform === 'win32') servidor.kill('SIGTERM');
      else process.kill(-servidor.pid, 'SIGTERM');
    } catch (erro) { if (erro.code !== 'ESRCH') console.error(erro.message); }
  }
}
for (const servidor of servidores) {
  servidor.once('error', erro => { console.error(erro.message); encerrar(1); });
  servidor.once('exit', codigo => encerrar(codigo ?? 1));
}
process.once('SIGINT', () => encerrar());
process.once('SIGTERM', () => encerrar());
console.log('Inova: interface http://localhost:3001 · API http://localhost:3333');
