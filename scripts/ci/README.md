# Gates incrementais da CI

## Lint ratchet

O repositorio possui divida legada de ESLint. `lint-ratchet.mjs` permite remover
essa divida gradualmente, mas falha se surgir uma ocorrencia nova, se uma antiga
for substituida por outra ou se mudar de severidade. Renomeacao so e reconhecida
quando o arquivo inteiro conserva um hash unico e identico.

```sh
bun install --frozen-lockfile
node --test scripts/ci/*.unit.mjs
node scripts/ci/lint-ratchet.mjs
```

O baseline so deve ser atualizado com aprovacao explicita depois de revisar toda
a diferenca:

```sh
node scripts/ci/lint-ratchet.mjs --update-baseline
git diff -- scripts/ci/eslint-baseline.json
```

Mudanca de versao do ESLint ou de `eslint.config.js` invalida o baseline de forma
fail-closed e exige a mesma revisao.

## Actions imutaveis

`check-workflow-pins.mjs` rejeita tags, branches e SHAs abreviados em `uses:`.
Actions remotas devem usar o SHA completo de 40 caracteres; a versao humana fica
em comentario para o Dependabot.

```sh
node scripts/ci/check-workflow-pins.mjs
```
