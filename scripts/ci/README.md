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

## Typecheck ratchet

`tsc --noEmit` sozinho e um no-op neste repo: `tsconfig.json` so declara
`references` (sem `files`/`include`), e sem `--build` o tsc nao resolve as
referencias — sai sempre com exit 0, sem checar nenhum arquivo. O comando
correto e `tsc -b`/`--build`, que respeita `noEmit` de cada projeto referenciado
(`tsconfig.app.json`, `tsconfig.node.json`) e falha de verdade quando ha erro
de tipo. O repo tem divida de tipos legada (confirmada rodando `tsc -b` de
verdade); `typecheck-ratchet.mjs` segue o mesmo principio do lint ratchet:
compara contra um baseline e falha so se surgir uma ocorrencia nova.

```sh
bun install --frozen-lockfile
node --test scripts/ci/*.unit.mjs
node scripts/ci/typecheck-ratchet.mjs
```

Correspondencia por `arquivo + codigo TS + mensagem` (sem linha/coluna), para
nao acusar falso-positivo quando uma edicao em outro trecho do arquivo desloca
a linha de um erro ja conhecido.

```sh
node scripts/ci/typecheck-ratchet.mjs --update-baseline
git diff -- scripts/ci/typecheck-baseline.json
```

## Actions imutaveis

`check-workflow-pins.mjs` rejeita tags, branches e SHAs abreviados em `uses:`.
Actions remotas devem usar o SHA completo de 40 caracteres; a versao humana fica
em comentario para o Dependabot.

```sh
node scripts/ci/check-workflow-pins.mjs
```
