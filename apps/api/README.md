# Backend — Inova Marmoraria

API Fastify com Prisma e PostgreSQL. O schema, as migrations e o cliente Prisma ficam em [`packages/database`](../../packages/database/README.md); tipos e enums do banco são importados de `@inova/database`. Centraliza autenticação, permissões, catálogo, clientes, orçamentos, snapshots financeiros, PDF, prazos, notificações e auditoria.

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
npm run db:deploy
npm run db:seed
```

## Estrutura

```text
assets/                    logo usado nos PDFs
scripts/                   importador de imagens do catálogo
src/modulos/autenticacao/          login, renovação de sessão e autorização
src/modulos/clientes/     cadastro, busca normalizada e histórico de clientes
src/modulos/catalogo/       materiais, serviços, acabamentos e preços
src/modulos/orcamentos/        orçamento, snapshots, PDF, status e regras de edição
src/modulos/notificacoes/ alertas de prazo
src/modulos/auditoria/         trilha de auditoria
```

## Regras importantes

- Preços e descontos aplicados ao orçamento são snapshots históricos: mudanças posteriores no catálogo não alteram negociações antigas.
- Valores individuais ficam disponíveis internamente, e o PDF permite exibi-los ou mostrar apenas os totais de cada projeto e do orçamento.
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

## Importar amostras de materiais

Com uma pasta extraída que contenha `materiais.json` e as imagens correspondentes:

```bash
npm run catalog:import-images --workspace=@inova/api -- /caminho/materiais-inova
```

O importador associa imagens por nome, preserva IDs e preços dos materiais existentes e cria itens pendentes de revisão quando não houver cadastro correspondente. Imagens sem identificação e novos materiais sem preço ficam inativos até revisão na Administração.

Um conjunto adicional de amostras fixas fica em `scripts/seed-assets/` e é associado automaticamente na mesma execução, sem precisar de pasta externa.

As rotas mantêm seus caminhos HTTP. `src/modulos/orcamentos/serializacao.ts` normaliza valores decimais do Prisma para o contrato da interface. Conversões de itens salvos e regras financeiras são compartilhadas em `packages/domain/src/`.
