# @inova/contracts

Contratos públicos da API (schemas Zod e tipos) usados tanto pela interface quanto pelo servidor.

Regras:

- Sem dependência de banco (Prisma), servidor (Fastify) ou interface (React).
- Só entra aqui um schema que a interface também precisa. Validação interna da API continua no módulo da API.
- Mover um schema para cá não pode mudar o comportamento: a API reexporta o mesmo objeto.

Hoje: `quoteCutoutSchema` e os blocos de que ele depende (`cutoutTypeSchema`, `positiveMm`, `money`), que antes eram importados pela interface diretamente de `back/src`.
