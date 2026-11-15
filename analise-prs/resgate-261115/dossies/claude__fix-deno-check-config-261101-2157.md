# Dossiê — claude__fix-deno-check-config-261101-2157 (PR #2521)

**Ref:** `origin/claude/fix-deno-check-config-261101-2157` · tip `e396840` · merge-base `1252bb5` · 1 commit, 1 arquivo (+1/−1).

## Propósito
Commit `e396840 fix: adicionar --config ao deno check para resolver @types/node em nodeModulesDir auto`.
Troca, no job de edges do `deploy-functions.yml`, `deno check supabase/functions/**/index.ts` por
`deno check --config supabase/functions/deno.json supabase/functions/**/index.ts`, para o typecheck ler `nodeModulesDir:"auto"` e achar `@types/node`.

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/deploy-functions.yml` | **Já na main**, texto idêntico, posição diferente (hunk `CONFLICT` só por deslocamento de linhas/comentários novos) | `origin/main:.github/workflows/deploy-functions.yml:494` → `run: deno check --config supabase/functions/deno.json supabase/functions/**/index.ts`; comentário GR-001 nas linhas 492-493. Introduzido por `84b8b149e` (2026-11-02) `fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)`. `line_check`: missing_in_main=0, removed_still_in_main=0. |

## Veredito
**INCORPORADA** (confiança alta). A main foi além (PR #2575: `cd functions` + `--config` + comentários GR-001), cobrindo a mesma causa. Triagem anterior (2026-11-08) marcou #2521 como OBSOLETA; a classificação correta é INCORPORADA — a linha da branch existe byte a byte na main.

## Lacunas a recuperar
Nenhuma.

**apagar_branch_seguro:** true.

## Verificação adversarial
**Concordo: INCORPORADA. apagar_branch_seguro = true.**

- `git diff 1252bb5 e396840 --stat` → 1 arquivo, +1/−1; o único hunk troca `run: deno check supabase/functions/**/index.ts` por `run: deno check --config supabase/functions/deno.json supabase/functions/**/index.ts` (hunk @@ -461,7).
- `git grep -n 'deno check' origin/main -- .github/workflows/` → `deploy-functions.yml:494: run: deno check --config supabase/functions/deno.json supabase/functions/**/index.ts` — byte a byte igual à linha adicionada pela branch. A linha removida pela branch (sem `--config`) não existe mais na main (`removed_still_in_main=0`, confirmado pelo grep: nenhuma ocorrência de `deno check supabase/functions/**/index.ts` sem `--config`).
- `git log -S'deno check --config supabase/functions/deno.json' --oneline origin/main -- .github/workflows/deploy-functions.yml` → `84b8b149e fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)`; sem commit posterior removendo (o `-S` retorna só a introdução).
- Main vai além da branch: passo anterior (`deploy-functions.yml:472-489`) faz `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9`, resolvendo a mesma causa (@types/node via `nodeModulesDir:"auto"` em `supabase/functions/deno.json`, que na main tem `imports.@types/node = npm:@types/node@25.9.9`).
- `git merge-base --is-ancestor e396840 origin/main` → rc=1 (commit não mergeado em si, esperado: PR #2521 foi fechada, trabalho reimplementado em #2575). Nenhum hunk fora do arquivo verificado; nenhuma lacuna.
