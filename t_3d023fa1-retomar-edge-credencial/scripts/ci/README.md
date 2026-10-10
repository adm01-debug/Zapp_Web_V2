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

## Fronteira de secrets em pull requests

`check-pr-workflow-secrets.mjs` falha quando um workflow acionado por
`pull_request` ou `pull_request_target` referencia secrets privilegiados, mesmo
que a etapa possua um `if` declarando execução somente em push. Essa condição
pode ser alterada pelo próprio PR e, portanto, não é uma fronteira de segurança.
Somente a URL e a chave publishable do Supabase são permitidas nesse contexto.

```sh
node scripts/ci/check-pr-workflow-secrets.mjs
```

## noImplicitAny ratchet

`implicit-any-ratchet.mjs` falha se o número de erros `noImplicitAny` no projeto
crescer acima do baseline registrado em `implicit-any-baseline.json`. Permite
reduzir a dívida tipagem legada de forma incremental: ao corrigir erros, abaixe
o baseline; ao introduzir código novo tipado corretamente, o contador não cresce.

```sh
bun install --frozen-lockfile
node scripts/ci/implicit-any-ratchet.mjs
```

Para atualizar o baseline após correções:

```sh
node scripts/ci/implicit-any-ratchet.mjs --update-baseline
git diff -- scripts/ci/implicit-any-baseline.json
```

## Budget de bundle

`bundle-budget.mjs` lê `dist/index.html` após o build, soma o gzip de todo
JS carregado no first paint (`script[type=module]` + `link[rel=modulepreload]`)
e do CSS (`link[rel=stylesheet]`) e compara com os limites em
`performance-budget.json`. Falha com exit 1 se `initial-js` ou `initial-css`
passarem do `maxKB` configurado. O budget é medido em gzip porque é o que o
navegador recebe da Vercel (br/gzip).

```sh
bun run build
node scripts/ci/bundle-budget.mjs
# ou com caminhos customizados:
node scripts/ci/bundle-budget.mjs --dist dist --budget performance-budget.json
```
