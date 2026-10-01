# @inova/database

Dono do schema Prisma, das migrations e do cliente gerado.

```text
prisma/schema.prisma     modelos e enums
prisma/migrations/       histórico incremental (nunca editar migration aplicada)
prisma/seed.ts           dados iniciais de desenvolvimento
scripts/prisma.mjs       CLI do Prisma com o schema deste pacote e o .env da raiz
src/index.ts             reexporta PrismaClient, Prisma e enums para os apps
```

Comandos (pela raiz):

```bash
npm run db:generate   # gera o cliente
npm run db:migrate    # cria/aplica migration em desenvolvimento
npm run db:deploy     # aplica migrations pendentes
npm run db:seed       # popula dados iniciais
```

Os apps importam de `@inova/database`, não de `@prisma/client`. O nome da pasta das migrations é o que o Prisma registra em `_prisma_migrations`; mover a pasta `prisma/` de `back/` para cá não altera o histórico aplicado.

Próximo passo previsto (Etapa C do roteiro Arenmora): o cliente com contexto de tenant obrigatório e a configuração de RLS por transação também vivem aqui.
