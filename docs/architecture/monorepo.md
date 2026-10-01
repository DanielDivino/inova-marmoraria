# Estrutura do monorepo

npm workspaces + Turborepo. O Turborepo só organiza a ordem, o paralelismo e o cache das tarefas; tenants, permissões e cobrança são responsabilidade do código (Etapas C–G do roteiro Arenmora).

## Hoje (Etapa B concluída)

```text
apps/
  web/            @inova/web        Next.js: a aplicação da marmoraria
  api/            @inova/api        Fastify: módulos de negócio, autenticação, PDF, arquivos
packages/
  domain/         @inova/domain     cálculos e regras puras (compila para dist/)
  contracts/      @inova/contracts  schemas públicos usados pela interface e pela API (dist/)
  database/       @inova/database   schema Prisma, migrations, seed, cliente gerado (dist/)
  config/         @inova/config     tsconfig comuns dos pacotes Node
tests/
  integration/    API real contra schema PostgreSQL descartável
  e2e/            Playwright contra API e web reais
  visual/         roteiros Playwright com API mockada
  scripts/        verificações que cruzam apps (ex.: verify-quote-edit.ts)
scripts/          produção local, testes visuais, migração das pastas locais
docs/
  architecture/   este arquivo e decisões futuras
  runbooks/       procedimentos operacionais
turbo.json        grafo de tarefas
```

## Previsto (criar quando a etapa correspondente começar, não antes)

| Caminho | Etapa | Observação |
|---|---|---|
| `apps/admin` | F | Painel da plataforma. App separado reduz acoplamento, mas a autorização global é verificada no servidor. |
| `apps/worker` | H | Outbox, webhooks persistidos, e-mails, exportações. |
| `apps/site` | quando justificar | Site comercial e ajuda pública. |
| `packages/ui` | F | Só quando web e admin realmente compartilharem componentes. |
| `infra/` | H | Contêineres e implantação, sem secrets. |

Pastas vazias não são criadas: um workspace sem código ainda não tem fronteira a proteger.

## Regras de dependência

```text
apps/web  ──► domain, contracts
apps/api  ──► domain, contracts, database
contracts ──► domain
database  ──► (@prisma/client)
domain    ──► (zod)
```

- `domain` não importa React, Fastify, Prisma nem outro pacote interno.
- `contracts` não importa banco nem servidor. Só entra um schema que a interface também precisa.
- `database` é o único lugar com `@prisma/client`; apps importam de `@inova/database`.
- Um app nunca importa código de outro app. Verificações que cruzam apps ficam em `tests/`.
- Cada pacote declara as dependências que usa; nada pode depender de hoisting.

## Tarefas

| Comando na raiz | O que roda |
|---|---|
| `npm run dev` | `db:generate` → build de banco/domínio/contratos → watch de domínio e contratos + `tsx watch` da API + `next dev` |
| `npm run build` | build de todos os pacotes na ordem do grafo (`^build`) |
| `npm run check` | `tsc --noEmit` em cada pacote, depois de compilar as dependências |
| `npm test` | Vitest por pacote: `packages/domain/src`, `apps/web/utilitarios`, `apps/api/src` |
| `npm run db:*` | CLI do Prisma no pacote `database`, com o `.env` da raiz |
| `npm run test:integration` / `test:e2e` | compila as dependências internas e roda `tests/run-isolated.mjs` |

Para rodar só um pacote e o que ele precisa: `npx turbo run test --filter=@inova/api`.

## Cache

- Cacheadas: `build`, `check`, `test` (saídas em `dist/**` e `.next/**`, sem `.next/cache`).
- Nunca cacheadas: `dev`, `db:generate`, `db:seed`; migrations e produção não passam pelo cache.
- O build da web inclui `API_URL` e `NEXT_PUBLIC_*` na chave do cache, porque mudam o artefato.
- `envMode: loose`: variáveis do ambiente chegam às tarefas como antes da migração. Revisar para `strict` quando as variáveis de cada app estiverem inventariadas (Etapa H).
- Cache remoto não está ligado. Se for ligado, nenhum secret pode participar de artefatos.

## Por que `@inova` e não `@arenmora`

A troca de namespace é a Etapa E do roteiro, em commit próprio. Misturar reorganização de pastas com renomeação dificulta revisar e reverter.
