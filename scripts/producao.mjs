import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/*
 * Versão de produção na rede local, separada da pasta de desenvolvimento.
 *
 * Ficam duas cópias do projeto em ~/INOVA-producao (a e b) e o atalho "atual"
 * aponta para a que está no ar. "atualizar" copia o código da pasta de
 * desenvolvimento para a cópia parada, compila e, só se tudo der certo, troca o
 * atalho e reinicia o serviço; a anterior fica guardada para "voltar".
 * O banco de dados, o .env e as imagens enviadas (apps/api/uploads) são os mesmos
 * da pasta de desenvolvimento.
 *
 *   npm run producao:instalar   primeira vez: serviço do sistema + primeira versão
 *   npm run producao:atualizar  publica o que está na pasta de desenvolvimento
 *   npm run producao:voltar     volta para a versão anterior
 *   npm run producao:status     versão no ar, endereço e se está respondendo
 *   npm run producao:logs       registro do serviço (Ctrl+C para sair)
 */
const PASTA = process.env.INOVA_PRODUCAO_DIR ?? path.join(os.homedir(), 'INOVA-producao');
const SERVICO = 'inova-producao';
const PORTA_WEB = 3000, PORTA_API = 3334;
const API_URL = `http://127.0.0.1:${PORTA_API}`;
const ATUAL = path.join(PASTA, 'atual');
const ESTADO = path.join(PASTA, 'estado.json');
const TRAVA = path.join(PASTA, '.atualizando');
const UNIDADE = path.join(os.homedir(), '.config/systemd/user', `${SERVICO}.service`);
/** Pasta do projeto deste script: a de desenvolvimento, ou a cópia no ar quando o serviço chama "iniciar". */
const raiz = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
/** Continuam na cópia entre atualizações: dependências, cache da compilação e os atalhos para o .env e as imagens. */
const UPLOADS = 'apps/api/uploads';
const MANTER = ['.env', UPLOADS, 'apps/web/.next', '.turbo', 'node_modules', 'apps/web/node_modules', 'apps/api/node_modules',
  'packages/domain/node_modules', 'packages/contracts/node_modules', 'packages/database/node_modules', 'packages/config/node_modules'];
const DEPENDENCIAS = MANTER.filter((item) => item.endsWith('node_modules'));

const etapa = (texto) => console.log(`\n▸ ${texto}`);
/** Executável do "bin" de um pacote, procurado a partir da pasta do app como o Node faria (com ou sem hoisting). */
function binario(app, pacote, nome) {
  for (let pasta = path.join(raiz, app); ; pasta = path.dirname(pasta)) {
    const manifesto = path.join(pasta, 'node_modules', pacote, 'package.json');
    if (fs.existsSync(manifesto)) {
      const { bin } = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
      return path.join(path.dirname(manifesto), typeof bin === 'string' ? bin : bin[nome]);
    }
    if (path.dirname(pasta) === pasta) throw new Error(`Pacote ${pacote} não instalado nesta cópia.`);
  }
}
function executar(comando, args, opcoes = {}) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', ...opcoes, env: { ...process.env, ...opcoes.env } });
  if (resultado.status !== 0) throw new Error(`Falhou: ${comando} ${args.join(' ')}`);
}
const lerEstado = () => { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return { ativa: null, anterior: null, versoes: {} }; } };
const salvarEstado = (estado) => fs.writeFileSync(ESTADO, `${JSON.stringify(estado, null, 2)}\n`);
const hashArquivo = (arquivo) => createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
const servicoInstalado = () => fs.existsSync(UNIDADE);
const systemctl = (...args) => spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' });

function enderecoNaRede() {
  const enderecos = Object.values(os.networkInterfaces()).flat().filter((rede) => rede && rede.family === 'IPv4' && !rede.internal).map((rede) => rede.address);
  return enderecos.find((ip) => ip.startsWith('192.168.')) ?? enderecos.find((ip) => !ip.startsWith('172.')) ?? enderecos[0] ?? 'localhost';
}

function infoGit() {
  const git = (...args) => { try { return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim(); } catch { return ''; } };
  return { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('rev-parse', '--short', 'HEAD'), alteracoesSemCommit: git('status', '--porcelain') !== '' };
}

/** Apaga o código antigo da cópia, sem mexer no que fica entre atualizações. */
function limpar(pasta, relativo = '') {
  for (const nome of fs.readdirSync(pasta)) {
    const caminho = relativo ? `${relativo}/${nome}` : nome;
    if (MANTER.includes(caminho)) continue;
    const completo = path.join(pasta, nome);
    if (fs.lstatSync(completo).isDirectory() && MANTER.some((item) => item.startsWith(`${caminho}/`))) limpar(completo, caminho);
    else fs.rmSync(completo, { recursive: true, force: true });
  }
}

/** Copia o código da pasta de desenvolvimento: arquivos do git e novos ainda sem commit, respeitando o .gitignore. */
function copiarCodigo(destino) {
  fs.mkdirSync(destino, { recursive: true });
  limpar(destino);
  const arquivos = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: raiz }).toString().split('\0')
    .filter((arquivo) => arquivo && !arquivo.startsWith(`${UPLOADS}/`) && fs.existsSync(path.join(raiz, arquivo)));
  for (const arquivo of arquivos) {
    const alvo = path.join(destino, arquivo);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.cpSync(path.join(raiz, arquivo), alvo, { preserveTimestamps: true });
  }
  console.log(`  ${arquivos.length} arquivos copiados.`);
}

/** Mesmo .env e mesmas imagens enviadas da pasta de desenvolvimento. */
function ligarCompartilhados(destino) {
  for (const item of ['.env', UPLOADS]) {
    const alvo = path.join(destino, item);
    if (fs.existsSync(alvo) || fs.lstatSync(alvo, { throwIfNoEntry: false })) continue;
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.symlinkSync(path.join(raiz, item), alvo);
  }
}

/** Reaproveita as dependências da pasta de desenvolvimento quando o package-lock é o mesmo; senão, instala do zero. */
function garantirDependencias(destino) {
  const lock = hashArquivo(path.join(destino, 'package-lock.json'));
  const marca = path.join(destino, 'node_modules', '.inova-lock');
  if (fs.existsSync(marca) && fs.readFileSync(marca, 'utf8') === lock) return console.log('  Dependências já instaladas.');
  for (const pasta of DEPENDENCIAS) fs.rmSync(path.join(destino, pasta), { recursive: true, force: true });
  const mesmasDoDesenvolvimento = fs.existsSync(path.join(raiz, 'node_modules/.package-lock.json')) && hashArquivo(path.join(raiz, 'package-lock.json')) === lock;
  if (mesmasDoDesenvolvimento) {
    console.log('  Copiando dependências da pasta de desenvolvimento…');
    for (const pasta of DEPENDENCIAS) if (fs.existsSync(path.join(raiz, pasta))) executar('cp', ['-a', path.join(raiz, pasta), path.join(destino, pasta)]);
  } else executar('npm', ['ci', '--no-audit', '--no-fund'], { cwd: destino });
  fs.writeFileSync(marca, lock);
}

function compilar(destino) {
  // Turborepo compila na ordem do grafo: cliente Prisma → banco, domínio e contratos → API (tipos) e web.
  executar('npm', ['exec', '--', 'turbo', 'run', 'build', '--filter=@inova/api', '--filter=@inova/web'], { cwd: destino, env: { API_URL } });
}

/** Imagens enviadas ainda na pasta antiga (back/uploads, de antes do monorepo): mover antes de publicar. */
function conferirPastasAntigas() {
  const antiga = path.join(raiz, 'back/uploads');
  const temArquivos = fs.existsSync(antiga) && fs.readdirSync(antiga, { recursive: true }).some((nome) => !String(nome).endsWith('.gitkeep') && fs.statSync(path.join(antiga, String(nome))).isFile());
  if (temArquivos) throw new Error('Há imagens em back/uploads (estrutura antiga). Rode "npm run estrutura:migrar-pastas-locais" antes de atualizar a produção.');
}

/** Troca o atalho "atual" de uma vez (sem instante em que ele não existe). */
function apontarPara(copia) {
  const temporario = `${ATUAL}.novo`;
  fs.rmSync(temporario, { force: true });
  fs.symlinkSync(copia, temporario);
  fs.renameSync(temporario, ATUAL);
}

async function respondendo(tentativas = 1) {
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      const respostas = await Promise.all([`${API_URL}/health`, `http://127.0.0.1:${PORTA_WEB}/login`, `http://127.0.0.1:${PORTA_WEB}/api/health`].map((url) => fetch(url, { signal: AbortSignal.timeout(5000) })));
      if (respostas.every((resposta) => resposta.ok)) return true;
    } catch { /* ainda subindo */ }
    if (tentativa < tentativas - 1) await new Promise((resolver) => setTimeout(resolver, 1500));
  }
  return false;
}

async function reiniciarEConferir() {
  if (!servicoInstalado()) { console.log('  Serviço não instalado: rode "npm run producao:instalar".'); return true; }
  const resultado = systemctl('restart', SERVICO);
  if (resultado.status !== 0) { console.error(resultado.stderr); return false; }
  return respondendo(60);
}

function travar() {
  fs.mkdirSync(PASTA, { recursive: true });
  if (fs.existsSync(TRAVA)) {
    const pid = Number(fs.readFileSync(TRAVA, 'utf8'));
    try { process.kill(pid, 0); throw new Error(`Outra atualização está em andamento (processo ${pid}).`); } catch (erro) { if (erro.code !== 'ESRCH') throw erro; }
  }
  fs.writeFileSync(TRAVA, String(process.pid));
  process.once('exit', () => fs.rmSync(TRAVA, { force: true }));
}

async function atualizar() {
  if (raiz.startsWith(`${path.resolve(PASTA)}${path.sep}`)) throw new Error('Rode a atualização pela pasta de desenvolvimento, não pela cópia de produção.');
  travar();
  conferirPastasAntigas();
  const estado = lerEstado();
  const copia = estado.ativa === 'a' ? 'b' : 'a';
  const destino = path.join(PASTA, copia);
  const inicio = Date.now();
  etapa(`Copiando o código para a cópia "${copia}" (a versão no ar continua funcionando)`);
  copiarCodigo(destino);
  ligarCompartilhados(destino);
  garantirDependencias(destino);
  etapa('Compilando e conferindo tipos');
  compilar(destino);
  etapa('Aplicando as mudanças pendentes do banco de dados');
  executar('npm', ['run', 'db:deploy', '--workspace=@inova/database'], { cwd: destino });
  etapa('Colocando a nova versão no ar');
  const anterior = estado.ativa;
  apontarPara(copia);
  if (!await reiniciarEConferir()) {
    if (anterior) { apontarPara(anterior); await reiniciarEConferir(); }
    throw new Error(`A nova versão não respondeu${anterior ? '; a anterior voltou ao ar' : ''}. Veja "npm run producao:logs".`);
  }
  salvarEstado({ ativa: copia, anterior, versoes: { ...estado.versoes, [copia]: { ...infoGit(), publicadaEm: new Date().toISOString() } } });
  console.log(`\n✔ Produção atualizada em ${Math.round((Date.now() - inicio) / 1000)} s: http://${enderecoNaRede()}:${PORTA_WEB}`);
}

async function voltar() {
  travar();
  const estado = lerEstado();
  if (!estado.anterior || !estado.versoes[estado.anterior]) throw new Error('Não há versão anterior guardada.');
  etapa(`Voltando para a versão de ${new Date(estado.versoes[estado.anterior].publicadaEm).toLocaleString('pt-BR')}`);
  console.log('  Atenção: mudanças já aplicadas no banco de dados não são desfeitas.');
  apontarPara(estado.anterior);
  if (!await reiniciarEConferir()) { apontarPara(estado.ativa); await reiniciarEConferir(); throw new Error('A versão anterior não respondeu; a atual continua no ar.'); }
  salvarEstado({ ...estado, ativa: estado.anterior, anterior: estado.ativa });
  console.log('✔ Versão anterior no ar.');
}

async function status() {
  const estado = lerEstado();
  const versao = estado.ativa && estado.versoes[estado.ativa];
  console.log(`Endereço: http://${enderecoNaRede()}:${PORTA_WEB}`);
  console.log(versao ? `Versão no ar: publicada em ${new Date(versao.publicadaEm).toLocaleString('pt-BR')} · ${versao.branch} ${versao.commit}${versao.alteracoesSemCommit ? ' (com alterações sem commit)' : ''}` : 'Nenhuma versão publicada ainda.');
  console.log(`Serviço: ${servicoInstalado() ? systemctl('is-active', SERVICO).stdout.trim() : 'não instalado'} · liga com o computador: ${servicoInstalado() ? systemctl('is-enabled', SERVICO).stdout.trim() : 'não'}`);
  console.log(`Respondendo: ${await respondendo() ? 'sim' : 'não'}`);
  if (spawnSync('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger'], { encoding: 'utf8' }).stdout.trim() !== 'Linger=yes') {
    console.log(`\nPara ligar mesmo sem ninguém entrar na sessão, rode uma vez: sudo loginctl enable-linger ${os.userInfo().username}`);
  }
}

async function instalar() {
  fs.mkdirSync(path.dirname(UNIDADE), { recursive: true });
  fs.writeFileSync(UNIDADE, `[Unit]
Description=Inova Marmoraria - produção (site na porta ${PORTA_WEB})
After=network-online.target

[Service]
Type=simple
ExecStart=${process.execPath} ${path.join(ATUAL, 'scripts/producao.mjs')} iniciar
Restart=on-failure
RestartSec=5
Environment=PATH=${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
`);
  systemctl('daemon-reload');
  systemctl('enable', SERVICO);
  console.log(`Serviço "${SERVICO}" instalado e marcado para ligar com o computador.`);
  await atualizar();
  await status();
}

/** Espera o PostgreSQL (Docker) aceitar conexões: ao ligar o computador ele pode subir depois do serviço. */
async function esperarBanco() {
  config({ path: path.join(raiz, '.env'), quiet: true });
  const url = new URL(process.env.DATABASE_URL);
  for (let tentativa = 0; tentativa < 90; tentativa++) {
    const conectou = await new Promise((resolver) => {
      const socket = net.connect({ host: url.hostname, port: Number(url.port || 5432) }, () => { socket.end(); resolver(true); });
      socket.once('error', () => resolver(false));
    });
    if (conectou) return;
    await new Promise((resolver) => setTimeout(resolver, 2000));
  }
  throw new Error('O banco de dados não respondeu.');
}

/** Usado pelo serviço: liga a API e o site desta cópia e encerra os dois juntos. */
async function iniciar() {
  await esperarBanco();
  const ambiente = { ...process.env, NODE_ENV: 'production', API_URL };
  const servidores = [
    spawn(process.execPath, [binario('apps/api', 'tsx', 'tsx'), 'src/server.ts'], { cwd: path.join(raiz, 'apps/api'), env: { ...ambiente, PORT: String(PORTA_API) }, stdio: 'inherit', detached: true }),
    spawn(process.execPath, [binario('apps/web', 'next', 'next'), 'start', '-p', String(PORTA_WEB), '-H', '0.0.0.0'], { cwd: path.join(raiz, 'apps/web'), env: ambiente, stdio: 'inherit', detached: true }),
  ];
  let encerrando = false;
  const encerrar = (codigo = 0) => {
    if (encerrando) return;
    encerrando = true;
    process.exitCode = codigo;
    for (const servidor of servidores) {
      try { if (servidor.pid) process.kill(-servidor.pid, 'SIGTERM'); } catch (erro) { if (erro.code !== 'ESRCH') console.error(erro.message); }
    }
  };
  for (const servidor of servidores) {
    servidor.once('error', (erro) => { console.error(erro.message); encerrar(1); });
    servidor.once('exit', (codigo) => encerrar(codigo || 1));
  }
  process.once('SIGINT', () => encerrar());
  process.once('SIGTERM', () => encerrar());
  console.log(`Inova (produção): http://${enderecoNaRede()}:${PORTA_WEB} · API ${API_URL}`);
}

const comandos = { instalar, atualizar, voltar, status, iniciar, logs: () => spawnSync('journalctl', ['--user', '-u', SERVICO, '-n', '200', '-f'], { stdio: 'inherit' }) };
const comando = comandos[process.argv[2]];
if (!comando) {
  console.error(`Use: node scripts/producao.mjs ${Object.keys(comandos).join(' | ')}`);
  process.exit(1);
}
Promise.resolve(comando()).catch((erro) => { console.error(`\n✖ ${erro.message}`); process.exit(1); });
