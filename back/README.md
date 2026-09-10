# Backend — Inova Marmoraria

API Fastify com Prisma e PostgreSQL. Centraliza autenticação, permissões, catálogo, clientes, orçamentos, snapshots financeiros, PDF, prazos, notificações e auditoria.

## Desenvolvimento

Na raiz do monorepo:

```bash
npm run dev:api
```

A API inicia em <http://localhost:3333>. A verificação de disponibilidade está em `GET /health`.

## Configuração

Copie o `.env.example` da raiz para `.env` e configure:

```env
DATABASE_URL="postgresql://inova:inova_local@localhost:5434/inova?schema=public"
JWT_SECRET="use-um-segredo-longo-e-exclusivo"
```

Para o banco local:

```bash
docker compose up -d postgres
npm run db:generate
npx prisma migrate deploy --schema back/prisma/schema.prisma
npm run db:seed
```

## Estrutura

```text
prisma/                    schema, migrations incrementais e seed
src/modules/auth/          login, renovação de sessão e autorização
src/modules/customers/     cadastro, busca normalizada e histórico de clientes
src/modules/catalog/       materiais, serviços, acabamentos e preços
src/modules/quotes/        orçamento, snapshots, PDF, status e regras de edição
src/modules/notifications/ alertas de prazo
src/modules/audit/         trilha de auditoria
```

## Regras importantes

- Preços e descontos aplicados ao orçamento são snapshots históricos: mudanças posteriores no catálogo não alteram negociações antigas.
- Valores individuais ficam disponíveis internamente, mas o PDF destinado ao cliente mostra somente o total final.
- Migrations são incrementais. Não edite uma migration já aplicada nem recrie tabelas para evoluir o banco.
- Arquivos enviados em `uploads/` não são versionados.

## Testes

Os testes de rotas e schemas ficam próximos dos módulos. A suíte de integração em `../tests/integration/` inicializa uma API real com um schema PostgreSQL descartável:

```bash
npm run test:integration
```

Para validar apenas tipos da API:

```bash
npm run build --workspace=@inova/api
```
