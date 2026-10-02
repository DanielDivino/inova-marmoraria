import type { FastifyInstance } from 'fastify';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';

/**
 * Miniaturas das fotos enviadas (pedras do catálogo): a mesma imagem de `/uploads/...` reduzida à
 * largura pedida, em WebP. O mostruário e as listas usam a miniatura em vez da foto original (PNGs
 * de 2 a 3 MB). Cada tamanho é gerado uma vez e guardado em `uploads/.miniaturas`; se a foto
 * original mudar, a miniatura é refeita. Pública como `/uploads/` (é carregada por `<img>`).
 */
export const LARGURAS_MINIATURA = [96, 320, 480, 960, 1600] as const;
const EXTENSOES = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const raizUploads = () => resolve(process.cwd(), 'uploads');
/** Gerações em andamento: pedidos ao mesmo tempo da mesma miniatura esperam a mesma geração. */
const gerando = new Map<string, Promise<Buffer>>();

async function gerar(origem: string, destino: string, largura: number) {
  const imagem = await sharp(origem).rotate().resize({ width: largura, withoutEnlargement: true }).webp({ quality: largura <= 480 ? 72 : 80 }).toBuffer();
  await mkdir(dirname(destino), { recursive: true });
  const temporario = `${destino}.${process.pid}.tmp`;
  await writeFile(temporario, imagem);
  await rename(temporario, destino);
  return imagem;
}

async function miniatura(caminho: string, largura: number) {
  const raiz = raizUploads();
  const origem = resolve(raiz, caminho);
  // Só arquivos de imagem dentro de uploads (nada de "..", nem a própria pasta de miniaturas).
  const dentro = relative(raiz, origem);
  if (!dentro || dentro.startsWith('..') || dentro.split(sep).some((parte) => parte.startsWith('.')) || !EXTENSOES.has(extname(origem).toLowerCase())) return null;
  const original = await stat(origem).catch(() => null);
  if (!original?.isFile()) return null;
  const destino = join(raiz, '.miniaturas', String(largura), `${dentro}.webp`);
  const pronta = await stat(destino).catch(() => null);
  if (pronta && pronta.mtimeMs >= original.mtimeMs) return readFile(destino);
  const chave = `${largura}:${dentro}`;
  const emAndamento = gerando.get(chave) ?? gerar(origem, destino, largura).finally(() => gerando.delete(chave));
  gerando.set(chave, emAndamento);
  return emAndamento;
}

export async function registrarMiniaturas(app: FastifyInstance) {
  app.get<{ Params: { largura: string; '*': string } }>('/:largura/*', async (request, reply) => {
    const largura = Number(request.params.largura);
    if (!LARGURAS_MINIATURA.includes(largura as (typeof LARGURAS_MINIATURA)[number])) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tamanho de miniatura indisponível.' });
    const imagem = await miniatura(request.params['*'], largura);
    if (!imagem) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Imagem não encontrada.' });
    return reply.header('content-type', 'image/webp').header('cache-control', 'public, max-age=86400, stale-while-revalidate=604800').send(imagem);
  });
}
