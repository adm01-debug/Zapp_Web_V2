# Geradores de ensaio de IA

`ensaio-provisionamento.mjs` gera um plano ou DML determinístico para dados sintéticos da IA-010.
Ele não abre conexão de banco. A saída SQL só pode ser aplicada pelo `zapp-db-local` da cópia de
trabalho; quando `DB_URL` é informado, a CLI exige protocolo PostgreSQL e host de loopback.

```sh
node scripts/ia/ensaio-provisionamento.mjs --plano
node scripts/ia/ensaio-provisionamento.mjs --sql
node scripts/ia/ensaio-provisionamento.mjs --remover
```

O provisionamento e a reversão aceitam apenas o plano canônico completo e imutável, incluindo IDs,
vocabulários e os marcadores reservados `ENSAIO-`, `ensaio.invalid` e `+5500`. Mensagens de erro não
repetem a `DB_URL`. Os dois DMLs usam o mesmo advisory lock transacional, travam as quatro tabelas e
as linhas reservadas, e repetem automaticamente o preflight após um deadlock; recusam colisões nesse
namespace; e a reversão exige IDs, marcadores e igualdade integral dos campos canônicos ao mesmo
tempo. Nenhum
registro divergente é reparado silenciosamente: a transação falha fechada para não confundir drift
com colisão de dados externos. Nenhum secret é necessário. O contrato executável é:

```sh
bunx vitest run --config vitest.contracts.config.ts \
  tests/contracts/sl059-ia010-provisionamento.contract.test.ts
```
