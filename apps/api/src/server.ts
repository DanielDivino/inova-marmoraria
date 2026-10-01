import { config } from 'dotenv';
import { resolve } from 'node:path';
import { criarAplicacao } from './app.js';

config({ path: process.env.DOTENV_CONFIG_PATH ?? resolve(process.cwd(), '../../.env') });

const port = Number(process.env.PORT ?? 3333);

criarAplicacao().then((app) => app.listen({ port, host: '0.0.0.0' })).catch((error) => {
  console.error(error);
  process.exit(1);
});
