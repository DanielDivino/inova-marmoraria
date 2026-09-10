# Inova Marmoraria

Sistema interno para criar, revisar, aprovar e acompanhar orçamentos e projetos da Inova Marmoraria.

O projeto é um monorepo Node.js: a interface e a API permanecem separadas, mas usam as mesmas regras de domínio para cálculos, descontos, prazos e apresentação de status.

## Estrutura

| Diretório | Responsabilidade |
| --- | --- |
| [`front/`](front/README.md) | Aplicação web Next.js: orçamento, clientes, histórico, desenhos 2D e interface administrativa. |
| [`back/`](back/README.md) | API Fastify, Prisma, autenticação, PDF, banco e migrations. |
| `packages/domain/` | Regras de cálculo, snapshots de valores, prazos úteis e status compartilhados. |
| `tests/` | Testes de integração, E2E e executor isolado de banco temporário. |

## Requisitos

- Node.js 22 ou superior
- Docker e Docker Compose (PostgreSQL local)
- `pdftotext` opcional, somente para o teste legado de persistência/PDF

## Início rápido

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run db:generate
npx prisma migrate deploy --schema back/prisma/schema.prisma
npm run db:seed
```

Em terminais separados:

```bash
npm run dev:api
npm run dev:web
```

- Web: <http://localhost:3001>
- API: <http://localhost:3333>
- Acesso inicial de desenvolvimento: `admin@inovamarmoraria.local` / `Inova@123`

Troque a senha inicial e `JWT_SECRET` antes de qualquer ambiente que não seja local.

## Qualidade

```bash
npm test                 # testes unitários
npm run test:integration # API, banco e PDF em schema PostgreSQL temporário
npm run test:e2e         # fluxos completos no navegador em serviços isolados
npm run test:all         # todas as suítes
npm run build            # typecheck e build de produção
```

Os testes de integração e E2E criam um schema PostgreSQL temporário com prefixo seguro e o removem automaticamente; os dados de desenvolvimento não são alterados.

## Banco e migrations

As migrations estão em `back/prisma/migrations/` e são incrementais. Para aplicar novas migrations em desenvolvimento:

```bash
npm run db:migrate
```

Não edite migrations já aplicadas. Crie uma nova migration para evoluir o esquema sem apagar registros existentes.

## Documentação adicional

- [Aplicação web](front/README.md)
- [API e banco](back/README.md)
- Especificação inicial: `SDD_Orcamentos_Marmoraria_Inova_v1.1.docx`
