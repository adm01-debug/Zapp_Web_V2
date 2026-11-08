# scripts/ci

Guards de CI executados por `node --test scripts/ci/*.unit.mjs` em cada PR.
Cada arquivo `.unit.mjs` é um guard autônomo que verifica invariantes estáticos do
repositório (formatos, configurações, fronteiras de código, segurança).

Adicionar um guard: criar `<nome>.unit.mjs` com `import test from 'node:test'`.
