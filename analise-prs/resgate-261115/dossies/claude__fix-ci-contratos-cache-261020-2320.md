# Dossiê — claude__fix-ci-contratos-cache-261020-2320 (PR #2123)

**Veredito: OBSOLETA** (tudo útil já está na `main`; o único resto foi substituído de propósito). `apagar_branch_seguro = true`.

## Propósito
Branch `origin/claude/fix-ci-contratos-cache-261020-2320` (tip `d90d3f78f`, base `d7af7a671`, 2 commits):
- `f48e9db1f fix(ci): desbloqueia o arquivo de contratos de workflow e o cache do Bun`
- `d90d3f78f fix(ci): alinha o pin do Playwright ao bun.lock e corrige falso positivo de secret`

Conteúdo: cache do Bun (`~/.bun/install/cache`) em 3 jobs do `ci.yml`; pin `playwright@1.63.0 → 1.64.1` em `ci.yml`/`e2e-logado.yml`/`e2e-talkx.yml`; `defaults.run.shell` + `persist-credentials: false` no `vercel-env-cleanup.yml`; regex de secrets em `security-workflow.unit.mjs` para ignorar caminho de arquivo; ajustes em `talkx-status-regen.yml` e `workflow-contracts.unit.mjs`.

PR #2123: CLOSED 2026-10-31, não mergeada; hibernada em favor da #2138; fechada com alegação "delta zero" (hipótese verificada abaixo).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência (origin/main) |
|---|---|---|
| `.github/workflows/ci.yml` — cache Bun | INCORPORADA | 7 steps `path: ~/.bun/install/cache` para 7 `bun install --frozen-lockfile` (linhas 58, 98, 140, 242, 312, 455, 596) |
| `.github/workflows/ci.yml` — pin `install --with-deps` | INCORPORADA | linha 484: `bunx playwright@1.64.1 install --with-deps chromium firefox webkit` |
| `.github/workflows/ci.yml` — pin em `install-deps` (cache quente) | OBSOLETA | linha 490: `bunx playwright install-deps chromium firefox webkit` — pin removido de propósito em `c543c6ade` (#2054, 2026-10-28); o step só instala pacotes apt, independente de versão, e `bunx` resolve o binário local de `node_modules` (bun.lock:1153 = `playwright@1.64.1`) |
| `.github/workflows/e2e-logado.yml` | OBSOLETA | os steps `Install Playwright`/`Dependências de sistema` não existem mais; `afd8c7ca3` (#2717, 2026-11-04) moveu a suíte para `scripts/e2e-isolated/run.sh` (linhas 126–150 da main) |
| `.github/workflows/e2e-talkx.yml` | INCORPORADA + OBSOLETA | linha 94: `bunx playwright@1.64.1 install --with-deps chromium`; linha 98 `install-deps` sem pin, mesmo commit `c543c6ade` |
| `.github/workflows/vercel-env-cleanup.yml` | INCORPORADA | linhas 21–23 `defaults.run.shell: bash --noprofile --norc -euo pipefail {0}`; linhas 46–48 `persist-credentials: false` (main já em Node 24) |
| `scripts/ci/security-workflow.unit.mjs` | INCORPORADA (outra forma) | linha 36: `/\$\{\{\s*secrets\.(\w+)/gu` — mesma intenção (não casar "check-pr-workflow-secrets.mjs" em comentário), via `c543c6ade` (#2054) |
| `.github/workflows/talkx-status-regen.yml` | INCORPORADA | hunk `PRESENT_REVERSE_APPLIES` (prova mecânica) |
| `scripts/ci/workflow-contracts.unit.mjs` | INCORPORADA | hunk `PRESENT_REVERSE_APPLIES` (prova mecânica) |

## Lacunas a recuperar
Nenhuma. O único trecho ausente (`bunx playwright@1.64.1 install-deps ...`) foi despinado deliberadamente na main (#2054) e não muda comportamento (apt-only). Valor: nenhum.

## Conclusão
Alegação de fechamento ("delta zero") confirmada por leitura do código. Branch pode ser apagada.

## Verificação adversarial

**Concordo: OBSOLETA (na prática INCORPORADA). `apagar_branch_seguro = true`.** Refutação tentada hunk por hunk no `git diff d7af7a671 origin/claude/fix-ci-contratos-cache-261020-2320` (diff inteiro, 7 arquivos, ~230 linhas) contra `origin/main` (`dac285f62`). Nenhum hunk de valor ≥ médio ficou fora.

| Hunk da branch | Estado na main | Prova |
|---|---|---|
| Cache do Bun em 3 jobs do `ci.yml` (`path: ~/.bun/install/cache`, `key: bun-${{ hashFiles('bun.lock') }}`, `restore-keys: bun-`) | INCORPORADA, superset | 7 blocos idênticos byte a byte em `origin/main:.github/workflows/ci.yml` linhas 58-63, 101, 143, 245, 315, 458, 596-602 — inclusive o bloco com `if: steps.paths.outputs.map_changed == 'true'` (596-601), para os 7 `bun install --frozen-lockfile` (66, 106, 148, 250, 320, 463, 606) |
| Pin `playwright@1.63.0 → 1.64.1` (`ci.yml`, `e2e-talkx.yml`) | INCORPORADA pelo mesmo conteúdo | `4b9585052` (#2156, 2026-10-21) aplicou exatamente as 4 linhas da branch (`ci.yml` install + install-deps, `e2e-talkx.yml` install + install-deps). Hoje: `origin/main:ci.yml:484` e `e2e-talkx.yml:94` com `playwright@1.64.1` |
| Pin no step `install-deps` (único trecho ausente) | REMOVIDO DE PROPÓSITO depois | `c543c6ade` (#2054, 2026-10-28) = Z024 "Remove pin `@1.63.0` de `bunx playwright` — usa versão do `bun.lock` (`1.64.1`)", tocando `ci.yml`, `e2e-talkx.yml` **e** `scripts/ci/check-workflow-pins.mjs` (guard alinhado: `PLAYWRIGHT_PIN` em check-workflow-pins.mjs:21,155). Sem efeito de comportamento: o step roda depois de `bun install --frozen-lockfile` (ci.yml:463) e `bun.lock:339/1153` fixa `@playwright/test@1.64.1` → `playwright@1.64.1` com bin `cli.js`, então `bunx playwright` resolve o binário local; o step só instala pacotes apt |
| `e2e-logado.yml` pins | OBSOLETA de verdade | os steps `Install Playwright`/`Dependências de sistema` não existem mais na main; a suíte passou para `scripts/e2e-isolated/run.sh` (`origin/main:e2e-logado.yml:150`), que não invoca `bunx playwright install` nenhum (`git grep playwright origin/main -- scripts/e2e-isolated/run.sh` → vazio) |
| `vercel-env-cleanup.yml`: `defaults.run.shell` + `persist-credentials: false` | INCORPORADA | `origin/main:.github/workflows/vercel-env-cleanup.yml:20-22` e `:43-44` |
| `security-workflow.unit.mjs`: falso positivo de secret | INCORPORADA em forma mais estrita | `origin/main:scripts/ci/security-workflow.unit.mjs:36` usa `/\$\{\{\s*secrets\.(\w+)/gu` — exige o contexto `${{ secrets.` e portanto também não casa caminho de arquivo em comentário; cobre a necessidade da branch (`/secrets\.([A-Z][A-Z0-9_]*)/gu`) e ainda pega secret minúsculo dentro de `${{ }}`. Bônus: a string `check-pr-workflow-secrets.mjs` já não existe em `origin/main:ci.yml` (`git grep -c` → 0) |
| `talkx-status-regen.yml`: bloco `concurrency` duplicado | INCORPORADA | main tem um só bloco, linhas 38-40 |
| `workflow-contracts.unit.mjs`: `});` faltando em E69 | INCORPORADA | `origin/main:scripts/ci/workflow-contracts.unit.mjs:561-565` já fecha o `test('E69'...)` antes do bloco W99 |

**Correção factual ao dossiê:** a incorporação do pin `1.64.1` veio de `4b9585052` (#2156, 2026-10-21), não de `c543c6ade`; `c543c6ade` (#2054) é o commit *posterior* que despinou o `install-deps`. A conclusão não muda, mas a ordem importa para quem auditar depois.

Nenhuma lacuna adicional. Branch pode ser apagada.
