// Contratos públicos (DTOs e validação) compartilhados entre interface e API.
// Regra: nada de Prisma, Fastify ou React aqui. Só entra o que os dois lados realmente usam.
export { cutoutTypeSchema, money, positiveMm, quoteCutoutSchema } from './orcamento/recorte.js';
