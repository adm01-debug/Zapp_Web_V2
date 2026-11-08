# Utilidades compartilhadas pelos scripts de auditoria/CI

`seguranca-processo.mjs` evita repetir, em cada ponto de uso, dois trechos que
o Sonar cobra de forma independente:

- `resolverExecutavel` — entrega o caminho **absoluto** do binário antes de
  criar processo filho (`javascript:S4036`). Dispara quando o primeiro
  argumento da chamada é um literal de string que não começa com prefixo de
  caminho (`/`, `./`, `..`); nunca olha o `env`. Passar `env: { PATH: '<fixo>' }`
  não silencia o achado — e troca o binário resolvido.
- `resolverCaminhoPermitido` — recusa caminho vindo de `argv`/`env` que escape
  das raízes legítimas (`jssecurity:S8707`, path traversal). Fail-closed: lança.

Teste: `node --test scripts/lib/seguranca-processo.test.mjs`.
