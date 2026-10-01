# Migração para a estrutura de monorepo (front/back → apps/packages)

Vale para a pasta de desenvolvimento e para a produção na rede local. O banco não muda: nenhuma migration foi criada, editada ou renomeada; só a pasta `prisma/` mudou de lugar (o Prisma identifica migrations pelo nome da pasta, não pelo caminho).

## O que muda de lugar

| Antes | Depois |
|---|---|
| `front/` | `apps/web/` |
| `back/` | `apps/api/` |
| `back/prisma/` | `packages/database/prisma/` |
| `scripts/prisma.mjs` | `packages/database/scripts/prisma.mjs` |
| `back/scripts/verify-quote-edit.ts` | `tests/scripts/verify-quote-edit.ts` |
| `scripts/desenvolvimento.mjs` | removido: `npm run dev` agora é `turbo run dev` |
| `back/uploads/` (fora do git) | `apps/api/uploads/` — **mover com o script abaixo** |

## Passo a passo na pasta de desenvolvimento

1. Faça backup do banco antes de qualquer atualização (mesmo sem migration nova).
2. Atualize o código (`git pull` ou checkout do branch).
3. Mova as imagens enviadas, que o git não leva:

   ```bash
   npm run estrutura:migrar-pastas-locais -- --simular   # confira
   npm run estrutura:migrar-pastas-locais                # move, sem sobrescrever
   ```

   Se houver conflito, o script não toca nos arquivos e lista os nomes.

4. Instale as dependências. O `package-lock.json` já reflete as pastas novas, mas ainda não tem o `turbo`; use `npm install` (não `npm ci`) uma vez e faça commit do lockfile atualizado:

   ```bash
   npm install
   git add package-lock.json && git commit -m "chore: registra turbo no lockfile"
   ```

5. Valide antes de usar:

   ```bash
   npm run check
   npm test          # devem ser os mesmos 498 testes em 57 arquivos da baseline
   npm run build
   npm run test:integration
   ```

6. Rode `npm run dev` e confira: login, um orçamento existente, o PDF (logo e dados), imagens do mostruário.
7. Apague quando quiser as pastas antigas que o script listou (`back/node_modules`, `front/.next`…). São geradas.

## Produção na rede local

`npm run producao:atualizar` se recusa a publicar enquanto houver imagens em `back/uploads`. Depois do passo 3, a atualização liga `apps/api/uploads` da pasta de desenvolvimento na cópia nova, como antes.

`npm run producao:voltar` continua funcionando: cada cópia (`a`/`b`) usa o próprio `scripts/producao.mjs`, então a versão anterior sobe com a estrutura antiga dela. Atenção: a cópia antiga procura imagens em `back/uploads` da pasta de desenvolvimento; se voltar depois de mover as imagens, crie temporariamente o atalho `ln -s apps/api/uploads back/uploads` na pasta de desenvolvimento.

## Sinais de problema e causa provável

| Sintoma | Causa provável |
|---|---|
| API não sobe: `DATABASE_URL` ausente | `.env` não está na raiz; a API procura `../../.env` a partir de `apps/api`. |
| Mostruário sem fotos | imagens ainda em `back/uploads` (passo 3). |
| `Cannot find module '@inova/database'` | dependências não reinstaladas ou build não rodou; use os scripts da raiz. |
| `npm ci` falha com lockfile fora de sincronia | falta o passo 4. |
