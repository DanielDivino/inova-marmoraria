# @inova/config

Configurações comuns de TypeScript para os pacotes Node (API, domínio, contratos e banco).

- `tsconfig/node.json`: ESM com `NodeNext`, `strict` e `ES2022`.
- `tsconfig/library.json`: o mesmo, emitindo declarações para pacotes que publicam `dist/`.

`outDir`, `rootDir` e `include` ficam em cada pacote, porque caminhos relativos em um `extends` são resolvidos a partir do arquivo que os declara.

A aplicação Next.js (`apps/web`) mantém o próprio `tsconfig.json`: o Next reescreve esse arquivo e não compartilha opções com os pacotes Node.
