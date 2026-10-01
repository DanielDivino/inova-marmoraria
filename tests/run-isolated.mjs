import 'dotenv/config';
import { PrismaClient } from '@inova/database';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Never reset the application schema. All test data lives in this disposable namespace.
const mode = process.argv[2] ?? 'all';
if (!['integration', 'e2e', 'all'].includes(mode)) throw new Error('Use integration, e2e ou all.');
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para o PostgreSQL local.');
const schema = `inova_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: url.toString(), INOVA_TEST_SCHEMA: schema, NODE_ENV: 'test', JWT_SECRET: randomUUID(), SEED_PASSWORD: 'InovaTest@2026', INOVA_E2E_PASSWORD: 'InovaTest@2026' };
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const children = [];
// Executável declarado no "bin" de um pacote, procurado a partir da pasta indicada como o Node faria,
// sem caminho fixo para node_modules (funciona com ou sem hoisting).
function binario(base, pacote, nome) {
  for (let pasta = resolve(base); ; pasta = dirname(pasta)) {
    const manifesto = join(pasta, 'node_modules', pacote, 'package.json');
    if (existsSync(manifesto)) {
      const { bin } = JSON.parse(readFileSync(manifesto, 'utf8'));
      return join(dirname(manifesto), typeof bin === 'string' ? bin : bin[nome]);
    }
    if (dirname(pasta) === pasta) throw new Error(`Pacote ${pacote} não instalado. Rode npm install.`);
  }
}
const logs = [];
mkdirSync('.test-artifacts', { recursive: true });
function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit', ...options });
  children.push(child);
  return child;
}
function run(command, args, options) {
  return new Promise((resolve, reject) => { const child = launch(command, args, options); child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} falhou (${code}).`))); });
}
async function waitFor(url, child) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Servidor de teste encerrou: ${url}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor de teste indisponível: ${url}`);
}
async function assertPortFree(port) {
  const { createServer } = await import('node:net');
  await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await new Promise((resolve) => child.once('exit', resolve)); }
}
let created = false;
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const child of [...children].reverse()) await stop(child);
  for (const log of logs) log.end();
  if (created && /^inova_test_[a-f0-9]{32}$/.test(schema)) {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    console.log('Schema temporário removido. Os registros do sistema não foram alterados.');
  }
  await admin.$disconnect();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
try {
  // Pacotes internos (domínio, contratos e banco com o cliente Prisma) já foram compilados pelo script npm que chama este arquivo.
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  console.log(`Banco de testes isolado: ${schema}`);
  await run('npm', ['run', 'db:deploy', '--workspace=@inova/database']);
  await run('npm', ['run', 'db:seed', '--workspace=@inova/database']);
  if (mode !== 'e2e') await run(process.execPath, [binario('.', 'vitest', 'vitest'), 'run', '--config', 'tests/vitest.integration.ts']);
  if (mode !== 'integration') {
    const apiPort = 3335, webPort = 3005;
    await assertPortFree(apiPort); await assertPortFree(webPort);
    const apiLog = createWriteStream('.test-artifacts/api.log'); logs.push(apiLog);
    const api = launch(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: resolve('apps/api'), env: { ...env, PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
    api.stdout.pipe(apiLog); api.stderr.pipe(apiLog);
    await waitFor(`http://127.0.0.1:${apiPort}/health`, api);
    const webLog = createWriteStream('.test-artifacts/web.log'); logs.push(webLog);
    const web = launch(process.execPath, [binario('apps/web', 'next', 'next'), 'dev', '--port', String(webPort), '--hostname', '127.0.0.1'], { cwd: resolve('apps/web'), env: { ...env, NODE_ENV: 'development', API_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_API_URL: '/api', INOVA_TEST_DIST_DIR: '.next-e2e' }, stdio: ['ignore', 'pipe', 'pipe'] });
    web.stdout.pipe(webLog); web.stderr.pipe(webLog);
    await waitFor(`http://127.0.0.1:${webPort}/login`, web);
    await run(process.execPath, [binario('.', '@playwright/test', 'playwright'), 'test', '--config', 'tests/playwright.config.ts', ...process.argv.slice(3)], { env: { ...env, INOVA_E2E_URL: `http://127.0.0.1:${webPort}` } });
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Falha nos testes isolados.'); process.exitCode = 1; }
finally { await cleanup(); }
