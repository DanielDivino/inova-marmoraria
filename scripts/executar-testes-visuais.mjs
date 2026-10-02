import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const raiz = resolve(import.meta.dirname, '..');
const pasta = resolve(raiz, 'tests/visual');
const roteiros = readdirSync(pasta).filter(arquivo => arquivo.endsWith('.mjs')).sort();

const segundos = (inicio) => ((performance.now() - inicio) / 1000).toFixed(1);

function executar(arquivo) {
  return new Promise((resolveExecucao, rejectExecucao) => {
    console.log(`\n▶ tests/visual/${arquivo}`);
    const inicio = performance.now();
    const processo = spawn(process.execPath, [resolve(pasta, arquivo)], { stdio: 'inherit' });
    processo.once('exit', codigo => {
      console.log(`  ${segundos(inicio)} s`);
      return codigo === 0 ? resolveExecucao() : rejectExecucao(new Error(`${arquivo} falhou (${codigo}).`));
    });
  });
}

const inicio = performance.now();
for (const roteiro of roteiros) await executar(roteiro);
console.log(`\n✓ ${roteiros.length} roteiros visuais executados com sucesso em ${segundos(inicio)} s.`);
