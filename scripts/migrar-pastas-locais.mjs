import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Uso único depois de atualizar para a estrutura de monorepo (apps/ e packages/).
 *
 * O git move só arquivos versionados. As imagens enviadas pelos usuários ficam fora do git
 * (back/uploads) e continuariam na pasta antiga enquanto a API passa a ler apps/api/uploads.
 * Este script move essas imagens sem sobrescrever nada e lista o que sobrou das pastas antigas.
 *
 *   npm run estrutura:migrar-pastas-locais            move as imagens
 *   npm run estrutura:migrar-pastas-locais -- --simular  só mostra o que faria
 */
const raiz = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const simular = process.argv.includes('--simular');
const origem = path.join(raiz, 'back/uploads');
const destino = path.join(raiz, 'apps/api/uploads');

function arquivos(pasta, relativo = '') {
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = relativo ? `${relativo}/${item.name}` : item.name;
    if (item.isDirectory()) return arquivos(path.join(pasta, item.name), caminho);
    return item.name === '.gitkeep' ? [] : [caminho];
  });
}

const pendentes = arquivos(origem);
let movidos = 0;
const conflitos = [];
for (const relativo of pendentes) {
  const de = path.join(origem, relativo);
  const para = path.join(destino, relativo);
  if (fs.existsSync(para)) { conflitos.push(relativo); continue; }
  if (!simular) {
    fs.mkdirSync(path.dirname(para), { recursive: true });
    fs.renameSync(de, para);
  }
  movidos++;
}

console.log(`${simular ? 'Seriam movidas' : 'Movidas'} ${movidos} imagens de back/uploads para apps/api/uploads.`);
if (conflitos.length) {
  console.log(`\n${conflitos.length} arquivos já existem no destino e não foram tocados (confira e decida manualmente):`);
  for (const relativo of conflitos) console.log(`  ${relativo}`);
  process.exitCode = 1;
}

// Restos gerados da estrutura antiga: não fazem parte do código e podem ser apagados quando quiser.
const restos = ['back/node_modules', 'front/node_modules', 'front/.next', 'front/.next-dev', 'front/.next-e2e', 'back/uploads']
  .filter((item) => fs.existsSync(path.join(raiz, item)) && (item !== 'back/uploads' || arquivos(path.join(raiz, item)).length === 0));
if (restos.length) {
  console.log('\nPastas antigas que sobraram (geradas ou vazias; podem ser apagadas):');
  for (const item of restos) console.log(`  ${item}`);
}
