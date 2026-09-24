# Acessos e dashboard

O monorepo mantém a matriz de permissões e os contratos em `packages/domain`, a aplicação Next em `front` e a API Fastify/Prisma em `back`.

## Perfis

| Perfil | Comercial | Clientes e orçamentos | Desenho técnico independente / equipe | Administração / dashboard |
| --- | --- | --- | --- | --- |
| Super administrador | Sim | Todos | Sim | Sim |
| Administrador (legado) | Sim | Todos | Sim | Não |
| Vendedor | Sim | Apenas sua carteira | Não | Não |

Vendedores podem consultar o mostruário, criar projetos, editar seus orçamentos, gerar os PDFs comerciais, de produção e de remontagem, e acompanhar status e prazos até a entrega. Os desenhos anexos aos itens continuam disponíveis. O editor técnico independente e a gestão da equipe permanecem fora desse perfil.

O responsável comercial de um orçamento é `Quote.createdById`. Alterações feitas pelo super administrador preservam esse vínculo. Clientes usam `Customer.ownerId`; a criação atribui o usuário autenticado, e somente o super administrador pode mudar o responsável em **Clientes → Detalhes → Responsável pelo cliente**. Essa mudança não transfere orçamentos anteriores nem reescreve sua autoria.

A migration `20260924000100_rbac_vendedores` acrescenta `SELLER`, a relação de responsáveis e seu índice. Clientes históricos são atribuídos apenas quando todos os seus orçamentos têm o mesmo criador. Casos ambíguos ou sem orçamentos ficam sem responsável, acessíveis aos administradores para atribuição manual. Contas `ADMIN` existentes são preservadas; podem ser convertidas para Vendedor na gestão de usuários.

## Proteção

- A API confere o perfil atual e a ativação da conta em cada requisição, inclusive com JWT já emitido.
- As restrições abrangem buscas, contadores, histórico de clientes, complementos, edição, duplicação, status, prazos, PDFs e remontagens.
- O vendedor não pode cadastrar orçamento para cliente fora de sua carteira ou vincular complemento ao orçamento de outro vendedor.
- Usuários desativados continuam nos relatórios históricos; não conseguem acessar a API.
- Rascunhos locais são separados pelo ID do usuário; vendedores não importam rascunhos antigos sem proprietário.

## Dashboard

Disponível em `/dashboard` somente ao super administrador, com dados de `GET /dashboard`. Os filtros `from`, `to` e `sellerId` usam **data de emissão** e responsável comercial. Sem datas, considera todo o histórico.

- Emitidos: todos os orçamentos do filtro, incluindo rascunhos.
- Vendidos: status `APPROVED`, incluindo os entregues. Valores somam `netTotal` e não representam recebimentos de caixa.
- Conversão: aprovados / emitidos.
- Etapas operacionais são contadas apenas para aprovados. Cancelados, recusados e expirados aparecem separadamente.
- Atrasados: aprovados ainda não concluídos, cujo prazo efetivo é anterior ao dia atual da empresa. Prioridade: montagem, entrega, prazo interno.
- A tabela de atenção exibe até 20 atrasados. O indicador e a divisão por responsável abrangem todos.
- Clicar no vendedor abre seus orçamentos, incluindo entregues e cancelados, com os filtros do painel.

Gestão em `/usuarios`: cadastro, perfil, ativação, senha e limite de desconto final. API existente `/users` ampliada com `SELLER`. Atribuição de carteira em `PATCH /customers/:id/owner`. Os demais endpoints comerciais foram reutilizados.

## Verificação

`npm run check`, `npm test`, `npm run test:integration`, `npm run test:e2e` e `npm run build`. As suites de integração e navegador usam schema temporário e não limpam os registros da aplicação. O repositório não tem script separado de ESLint; o build Next executa sua etapa de lint e validação de tipos.
