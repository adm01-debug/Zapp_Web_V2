# Dossiê — claude__fix-deploy-deno-frozen-v2 (PR #2412, CLOSED 2026-11-01, não mergeada)

## Propósito
Destravar `deploy-functions.yml` (job de typecheck das edges falhava: `Cannot find module '@types/node'`, via `@types/ws@8.18.1` → `/// <reference types="node" />`).
Branch: 1 commit útil `865b44030` + merge de main + newline. Diff vs merge-base `1a9858b23`: 2 arquivos, +10/-11.

Mudanças propostas:
1. `.github/workflows/deploy-functions.yml` — trocar `deno install --config ... && npm install @types/node@25.9.9` por `deno install --config supabase/functions/deno.json --frozen=false` (removendo o `npm install`).
2. `supabase/functions/deno.json` — adicionar `"imports":{"@types/node":"npm:@types/node@^22"}`.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência na `origin/main` |
|---|---|---|---|
| `.github/workflows/deploy-functions.yml` | 9 linhas (passo `deno install --frozen=false` + comentários) | **INCORPORADA** com outro texto: main roda `cd supabase/functions && deno install --frozen=false` | `origin/main:.github/workflows/deploy-functions.yml:486-489`; introduzido por `8ba0b4361` 2026-11-02 `fix(ci): deno install --frozen=false — desbloqueia deploy das edge functions (#2567)` |
| idem | remoção do `npm install @types/node` (3 linhas "removed_still_in_main") | **OBSOLETA de propósito**: main re-adicionou `npm --prefix supabase/functions install --no-save @types/node@25.9.9` porque `deno install --frozen=false` sozinho não instala pacote que só existe no imports-map (W101) | `origin/main:.github/workflows/deploy-functions.yml:482-489`; commit `c5650d887` 2026-11-10 `fix: instalar @types/node via npm no deploy-functions.yml para resolver deno check (#2855)` — corpo cita `error TS2688: Cannot find type definition file for 'node'`. A branch afirmava o oposto ("npm install direto nao funciona"); a main decidiu em sentido contrário depois de 3 PRs (#2407, #2567, #2855). |
| `supabase/functions/deno.json` | 1 linha (`imports` com `@types/node@^22`) | **INCORPORADA** com versão pinada: main tem `"imports":{"@types/node":"npm:@types/node@25.9.9"}` | `git show origin/main:supabase/functions/deno.json` → `{"lock":"../../scripts/ci/deno.lock","nodeModulesDir":"auto","compilerOptions":{"skipLibCheck":true},"imports":{"@types/node":"npm:@types/node@25.9.9"}}`; história: `84ae17c5a` (2026-10-31, #2422) adicionou `imports`, `50ca61a6e` (#2569) só tirou newline. O `^22` da branch foi apontado pela Qodo na própria PR como não determinístico; o pin `25.9.9` da main é a escolha superior. |
| `scripts/ci/deno.lock` (não tocado pela branch) | — | Hoje já tem `@types/node@26.6.6` (blob `75d8ab33c`, linhas 54-59) e `@types/ws@8.18.2`; a premissa da branch ("lock tem zero entradas npm") não vale mais. | `git show origin/main:scripts/ci/deno.lock | sed -n 54,59p` |

## Veredito
**INCORPORADA** (confiança alta). Toda a intenção útil — `--frozen=false` no `deno install` e `@types/node` declarado em `imports` do `deno.json` — está na main com prova por arquivo. A única diferença (remover o `npm install`) foi deliberadamente revertida pela main em #2855 após falha real do `deno check`; portá-la agora reintroduziria o erro TS2688.

Nada a recuperar. `apagar_branch_seguro = true`.

## Observação (fora de escopo, para "Próximos passos" de quem consolidar)
`deno.json` pina `@types/node@25.9.9`, o workflow instala `@types/node@25.9.9` via npm, e `scripts/ci/deno.lock` traz `@types/node@26.6.6` — três fontes, duas versões. Não é lacuna desta branch (ela propunha `^22`, pior), mas é inconsistência na main.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar hunk por hunk e não achei nada de valor ≥ médio fora da `main`.

Checagens feitas (leitura apenas):

1. **Merge-base e ancestralidade confirmados.** `git merge-base origin/main ae1adcf5f` = `1a9858b236fd3d8e02e4d640a74426cc568ef757` (igual ao JSON). `git merge-base --is-ancestor ae1adcf5f origin/main` → **NÃO** (a branch nunca foi mergeada; a intenção chegou à main por outras PRs, não por esta).
2. **Superfície total da branch é de 2 arquivos, +10/-11.** `git diff --stat 1a9858b23 ae1adcf5f` → `.github/workflows/deploy-functions.yml` (19 linhas) e `supabase/functions/deno.json` (2 linhas). Não há terceiro arquivo escondido no merge `24547eb1c` nem no `ae1adcf5f` (só newline).
3. **Hunk 1 — `deno install --frozen=false`: está na main.** `git show origin/main:.github/workflows/deploy-functions.yml` linhas **473-490**; o comando é `cd supabase/functions && deno install --frozen=false` (linha **488**). A variante da branch (`deno install --config supabase/functions/deno.json --frozen=false`) é funcionalmente equivalente — e inferior, porque a main ganhou depois o `cd` + `deno check --config` por GR-001 em `84b8b149e` (#2575, 2026-11-02), linha **492**, que a branch não tem.
4. **Hunk 2 — `@types/node` em `imports`: está na main, com pin melhor.** `git show origin/main:supabase/functions/deno.json` → `{"lock":"../../scripts/ci/deno.lock","nodeModulesDir":"auto","compilerOptions":{"skipLibCheck":true},"imports":{"@types/node":"npm:@types/node@25.9.9"}}`. Histórico: `84ae17c5a` (#2422, 2026-10-31) adicionou `imports`. Branch propunha `^22` (faixa, não determinístico).
5. **Hunk 3 — remoção do `npm install @types/node`: refutada pela própria main, com prova.** Corpo de `c5650d887` (#2855, 2026-11-10) lido na íntegra: `deno check` falhou com `error TS2688: Cannot find type definition file for 'node'` porque "Deno 2.9.5 não o instala em `node_modules/` sem import direto no fonte"; a main então **re-adicionou** `npm --prefix supabase/functions install --no-save @types/node@25.9.9` (linha **489**) e documentou a razão como W101 nos comentários (linhas 483-487). A premissa do commit `865b44030` ("npm install direto nao funciona… W101, run 41162076060") é exatamente o oposto do que a main verificou 10 dias depois. Portar esse hunk reintroduziria o TS2688 — é regressão, não lacuna.
6. **Premissa do lockfile caducou.** `git show origin/main:scripts/ci/deno.lock` já traz 20+ pacotes npm, incluindo `@types/node@26.6.6` (linha 54) e `@types/ws@8.18.2` (linha 63) — a justificativa da branch ("deno.lock tem zero entradas npm") não vale mais. O `--frozen=false` continua necessário porque `specifiers` não lista `npm:@types/node@25.9.9` (só `supabase-js`, `qrcode`, `tslib`, `zod`), o que é coerente com a main tê-lo mantido.
7. **Nenhuma PR aberta presa à branch.** `github_graphql`: PR **#2412** `state=CLOSED`, `merged=false`, `closedAt=2026-11-01T16:01:14Z`, `headRefOid=ae1adcf5f`; a ref `claude/fix-deploy-deno-frozen-v2` tem só essa PR associada. Apagar não fecha PR viva.

Não rebaixo para PERDIDA_PARCIAL: o único conteúdo exclusivo da branch é uma remoção que a main testou e desfez, mais um pin de versão pior. `apagar_branch_seguro = true`.

Lacuna adicional (fora do escopo desta branch, mesma observação do dossiê, agora com números): três fontes declaram `@types/node` em versões diferentes — `supabase/functions/deno.json` pina `25.9.9`, `deploy-functions.yml:489` instala `25.9.9` via npm, e `scripts/ci/deno.lock:54` resolve `26.6.6`. A main está verde, então não é defeito ativo; é fragilidade de CI que vai reaparecer no próximo bump de `@types/ws`.
