import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { criarAplicacao } from '../../back/src/app.js';

// Miniaturas das fotos enviadas: a foto de `uploads/` reduzida e em WebP, gerada uma vez e guardada.
const app = await criarAplicacao();
const uploads = join(process.cwd(), 'uploads');
const pasta = join(uploads, 'materials');
const nome = `teste-miniatura-${process.pid}.png`;
const criados: string[] = [];

beforeAll(async () => {
  await app.ready();
  for (const caminho of [uploads, pasta]) if (!existsSync(caminho)) { await mkdir(caminho, { recursive: true }); criados.unshift(caminho); }
  await writeFile(join(pasta, nome), await sharp({ create: { width: 1254, height: 1254, channels: 3, background: '#8a7d6b' } }).png().toBuffer());
});
afterAll(async () => {
  await rm(join(pasta, nome), { force: true });
  for (const largura of ['320', '960']) await rm(join(uploads, '.miniaturas', largura, 'materials', `${nome}.webp`), { force: true });
  for (const caminho of criados) await rm(caminho, { recursive: true, force: true });
  await app.close();
});

describe('Miniaturas das fotos do catálogo', () => {
  it('reduz à largura pedida, em WebP, e reaproveita a gerada até a foto mudar', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/miniaturas/320/materials/${nome}` });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('image/webp');
    expect(resposta.headers['cache-control']).toContain('max-age');
    const { width, format } = await sharp(resposta.rawPayload).metadata();
    expect([width, format]).toEqual([320, 'webp']);
    const guardada = join(uploads, '.miniaturas', '320', 'materials', `${nome}.webp`);
    const antes = (await stat(guardada)).mtimeMs;
    await app.inject({ method: 'GET', url: `/miniaturas/320/materials/${nome}` });
    expect((await stat(guardada)).mtimeMs).toBe(antes);
    // Foto trocada (mais nova que a miniatura): gera de novo.
    const futuro = new Date(Date.now() + 60_000);
    await utimes(join(pasta, nome), futuro, futuro);
    await app.inject({ method: 'GET', url: `/miniaturas/320/materials/${nome}` });
    expect((await stat(guardada)).mtimeMs).toBeGreaterThan(antes);
    expect((await sharp((await app.inject({ method: 'GET', url: `/miniaturas/960/materials/${nome}` })).rawPayload).metadata()).width).toBe(960);
  });

  it('recusa tamanho fora da lista, arquivo inexistente e caminho fora de uploads', async () => {
    for (const url of [`/miniaturas/500/materials/${nome}`, '/miniaturas/320/materials/nao-existe.png', '/miniaturas/320/..%2F..%2Fpackage.json', '/miniaturas/320/.miniaturas/320/x.png.webp']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
  });
});
