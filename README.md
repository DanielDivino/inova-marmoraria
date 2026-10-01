# Inova Marmoraria

Sistema interno para criar, revisar, aprovar e acompanhar orçamentos e projetos da Inova Marmoraria.

O projeto é um monorepo npm workspaces orquestrado pelo [Turborepo](https://turborepo.dev): os apps (`apps/web`, `apps/api`) ficam separados e compartilham pacotes internos (`packages/`) com regras de domínio, contratos públicos e o banco. Estrutura e regras de dependência: [`docs/architecture/monorepo.md`](docs/architecture/monorepo.md).

## Como iniciar o projeto

### Requisitos

- Node.js 22 ou superior
- Docker e Docker Compose (PostgreSQL local)
- `pdftotext` opcional, somente para o teste legado de persistência/PDF

### Primeira vez

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run db:generate
npm run db:deploy
npm run db:seed
```

### Rodar em desenvolvimento

Para iniciar API e interface juntas (o Turborepo compila os pacotes internos e mantém domínio e contratos em modo watch):

```bash
npm run dev
```

Ou em terminais separados:

```bash
npm run dev:api
npm run dev:web
```

- Web: <http://localhost:3001>
- API: <http://localhost:3333> (verificação de disponibilidade em `GET /health`)
- Acesso inicial de desenvolvimento: `admin@inovamarmoraria.local` / `Inova@123`

Troque a senha inicial e `JWT_SECRET` antes de qualquer ambiente que não seja local.

### Produção na rede local

A versão de produção roda separada do desenvolvimento, na porta 3000 (API interna na 3334), e é acessada pelos outros computadores do mesmo Wi‑Fi em `http://<IP deste computador>:3000`. Ela usa o mesmo banco, o mesmo `.env` e as mesmas imagens (`apps/api/uploads`) da pasta de desenvolvimento.

```bash
npm run producao:instalar   # primeira vez: cria o serviço do sistema e publica a primeira versão
npm run producao:atualizar  # publica o que está nesta pasta (compila numa cópia parada; se falhar, nada muda)
npm run producao:voltar     # volta para a versão publicada antes (o banco não é desfeito)
npm run producao:status     # endereço, versão no ar e se está respondendo
npm run producao:logs       # registro do serviço (Ctrl+C para sair)
```

As cópias ficam em `~/INOVA-producao` (`a` e `b`; `atual` aponta para a que está no ar) e o serviço `inova-producao` (systemd do usuário) liga com o computador e religa sozinho se cair. Para ligar mesmo sem ninguém entrar na sessão, rode uma vez `sudo loginctl enable-linger $USER`; com firewall ativo, libere a porta com `sudo ufw allow 3000/tcp`. Quando uma migration mudar o banco de forma incompatível com a versão no ar, atualize a produção logo em seguida.

## Estrutura

| Diretório | Responsabilidade |
| --- | --- |
| [`apps/web/`](apps/web/README.md) | Aplicação web Next.js: orçamento, clientes, histórico, desenhos 2D e interface administrativa. |
| [`apps/api/`](apps/api/README.md) | API Fastify: autenticação, permissões, regras de orçamento, PDF e arquivos. |
| [`packages/domain/`](packages/domain) | Cálculos e regras puras compartilhadas (sem React, Fastify ou Prisma). |
| [`packages/contracts/`](packages/contracts/README.md) | Schemas públicos usados pela interface e pela API. |
| [`packages/database/`](packages/database/README.md) | Schema Prisma, migrations, seed e cliente gerado. |
| [`packages/config/`](packages/config/README.md) | Configurações comuns de TypeScript. |
| `packages/domain/` | Regras de cálculo, snapshots de valores, prazos úteis e status compartilhados entre front e back. |
| `tests/` | Testes de integração, E2E, roteiros visuais e executor isolado de banco temporário. |
| `documentacao/` | Especificações, notas de revisão e ativos de marca (logo original). |
| `scripts/` | Scripts de orquestração do monorepo (dev combinado, wrapper do Prisma, teste visual em lote). |

## Qualidade

```bash
npm run check           # TypeScript e detecção de código sem uso
npm test                 # testes unitários, incluindo PDF (colocados junto do código-fonte)
npm run test:integration # API, banco e PDF em schema PostgreSQL temporário
npm run test:e2e         # fluxos completos no navegador em serviços isolados (Playwright)
npm run test:visual      # roteiros visuais com API mockada, sem tocar banco/API reais
npm run test:all         # unitários + integração + E2E
npm run build            # typecheck e build de produção
```

Camadas de teste:

- **Unitários** (`*.test.ts` ao lado do código, `packages/domain/src/`, `apps/web/utilitarios/`, `apps/api/src/`; `npm test` roda `turbo run test` em cada pacote): regras puras, rodam com Vitest, sem banco nem rede.
- **Integração** (`tests/integration/*.test.ts`): sobem a API real contra um schema PostgreSQL descartável.
- **E2E** (`tests/e2e/*.spec.ts`): fluxo completo no navegador (Playwright) contra API e web reais, em portas isoladas.
- **Visuais** (`tests/visual/*.mjs`): roteiros Playwright standalone que interceptam toda chamada `/api/**` — não iniciam backend nem gravam dados reais. Cada um também roda isolado com `node tests/visual/<arquivo>.mjs`.

Os testes de integração e E2E criam um schema PostgreSQL temporário com prefixo seguro e o removem automaticamente; os dados de desenvolvimento não são alterados.

## Banco e migrations

As migrations estão em `packages/database/prisma/migrations/` e são incrementais. Para aplicar novas migrations em desenvolvimento:

```bash
npm run db:migrate
```

Não edite migrations já aplicadas. Crie uma nova migration para evoluir o esquema sem apagar registros existentes.

## Imagens e outros ativos

- `apps/web/public/`: tudo que o Next.js precisa servir diretamente (logo da interface, ambientes do mostruário, placeholder de pedra).
- `apps/api/assets/`: ativos lidos do disco pela API (hoje, só o logo usado na geração de PDF).
- `apps/api/scripts/seed-assets/`: fotos de amostras de material e o zip de origem (`granitos-e-materiais-inova.zip`, ignorado pelo git) usados apenas para popular o catálogo via `npm run catalog:import-images --workspace=@inova/api`. Não são servidos pela aplicação.
- `apps/api/uploads/materials/`: destino em runtime das imagens do catálogo (gerado pelo importador, ignorado pelo git — nunca versionar).
- `documentacao/marca/`: fonte canônica do logo em alta resolução. As cópias em `apps/web/public/` e `apps/api/assets/` são mantidas manualmente em sincronia porque cada uma é lida por um processo diferente em tempo de execução.

## Documentação adicional

- [Aplicação web](apps/web/README.md)
- [API](apps/api/README.md)
- [Banco](packages/database/README.md)
- [Arquitetura do monorepo](docs/architecture/monorepo.md)
- [Migração para a estrutura de monorepo](docs/runbooks/migracao-estrutura-monorepo.md)
- Especificação: `SDD_Inova_Marmoraria_v2.docx`
- Notas de revisão: [`documentacao/`](documentacao/)

## Organização do código

- `apps/api/src/modulos/`: autenticação, catálogo, clientes, usuários, orçamentos, desenhos, auditoria e notificações.
- `apps/api/src/compartilhado/`: contratos HTTP e erros comuns.
- `apps/web/componentes/orcamento/`: editor compartilhado, etapas, desenho, materiais e exportação.
- `apps/web/componentes/desenhos/`: editor técnico 2D.
- `apps/web/utilitarios/`: sessão, conversão de rascunhos, formatação e auxiliares de interface.
- `packages/domain/src/calculos/`: regras de medidas e preços.
- `packages/domain/src/orcamentos/`: snapshots, prazos, fabricação e nomes de PDF.
- `packages/domain/src/tecnico/`: geometria, comandos e schema do desenho técnico.

Funções de negócio e componentes usam nomes em português. URLs, campos do banco, enums persistidos, chaves de rascunho e nomes exigidos pelo Next.js permanecem compatíveis. `app`, `public`, `prisma/migrations` e os identificadores dos workspaces são convenções técnicas preservadas.

Os comandos Prisma carregam `.env` da raiz; `npm run db:deploy` aplica migrations existentes sem gerar mudanças nem reinicializar o banco.
