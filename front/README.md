# Frontend — Inova Marmoraria

Aplicação web em Next.js responsável pelo fluxo operacional da marmoraria: novo projeto, orçamentos, clientes, histórico, administração, notificações e mostruário.

## Principais áreas

- **Novo Projeto:** criação de orçamento, componentes, medidas, materiais, acabamentos, recortes e revisão financeira.
- **Orçamentos:** acompanhamento operacional, aprovação, execução, prazo e desenhos técnicos 2D.
- **Clientes:** cadastro, busca, edição e histórico real de orçamentos vinculados.
- **Histórico:** projetos concluídos e orçamentos não aprovados.
- **Administração:** catálogo de materiais, serviços e preços.

## Desenvolvimento

Na raiz do monorepo:

```bash
npm run dev:web
```

A aplicação abre em <http://localhost:3001>. As chamadas para `/api` são encaminhadas para a API configurada por `API_URL` (padrão: `http://127.0.0.1:3333`).

## Estrutura relevante

```text
app/                        páginas, layout e estilos globais
componentes/                componentes reutilizáveis e visualizador de ambientes
componentes/orcamento/      editor compartilhado, complementos e desenho técnico 2D
componentes/desenhos/       editor técnico 2D (peças, recortes, cotas)
utilitarios/                cliente HTTP, rascunho local, formatação e auxiliares
public/                     logo, imagens do mostruário e ativos públicos
```

## Verificação

```bash
npm run build --workspace=@inova/web
```

Os testes de interface, fluxo real de login, orçamento, PDF, edição, vínculo, status e responsividade estão em `../tests/e2e/` e são executados a partir da raiz com `npm run test:e2e`.

## Convenções

- Preserve o layout responsivo e os componentes visuais existentes.
- Não trate preço do catálogo como estado local permanente: valores negociados pertencem ao orçamento salvo pela API.
- Dados do cliente e do orçamento são persistidos no backend; armazenamento do navegador só é usado para recuperação de edição ainda não salva.

O editor compartilhado fica em `componentes/orcamento/EditorOrcamento.tsx`. As páginas de criação e edição apenas o compõem; não importam uma página dentro da outra.
