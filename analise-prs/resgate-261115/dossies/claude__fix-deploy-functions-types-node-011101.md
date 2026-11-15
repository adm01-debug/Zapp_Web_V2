# Dossiê — claude/fix-deploy-functions-types-node-011101 (PR #2508)

- Ref: `origin/claude/fix-deploy-functions-types-node-011101` · tip `e5e03afa5` · merge-base `1252bb5a4` (2026-11-01) · 8 commits (3 são merges/re-trigger de CI)
- Pré-classificação mecânica: MISTO_CONFLITO · triagem 2026-11-08: OBSOLETA

## Propósito
Destravar o `deploy-functions.yml` (job de edges) em três frentes:
1. `deno install --frozen=false` dentro de `supabase/functions` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9` para o `deno check` resolver `/// <reference types="node" />` de `@types/ws` (W100/W101).
2. `deno check --config supabase/functions/deno.json ...` (GR-001).
3. Preflight do catálogo PromoGifts: capturar `CURL_EXIT`, `--connect-timeout 10 --max-time 30`, tornar falha de transporte/HTTP não-fatal quando `REESCREVER=false`, 401/403 sempre fatal.
Mais um bump acidental de `supabase/setup-cli` v3.0.1 → v3.1.0 e um arquivo vazio `.github/ci-refresh` para re-disparar CI.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `.github/workflows/deploy-functions.yml` — bloco `deno install` + `npm install @types/node` + comentários W99/W100/W101/GR-001 | BOTH_CHANGED / CONFLICT | **JÁ NA MAIN, byte-idêntico** | `origin/main:.github/workflows/deploy-functions.yml:473-489` (`cd supabase/functions && deno install --frozen=false` / `npm --prefix supabase/functions install --no-save @types/node@25.9.9`). Commits: `8ba0b4361` (#2567, 2026-11-02, `--frozen=false`), `c5650d887` (#2855, 2026-11-10, npm `@types/node`). `git diff origin/main <branch> -- deploy-functions.yml` não mostra nenhuma diferença nesse bloco. |
| idem — `deno check --config supabase/functions/deno.json` | idem | **JÁ NA MAIN** | `origin/main:...deploy-functions.yml:491-494`, mesmo texto e mesmo comentário GR-001. |
| idem — preflight PromoGifts com `CURL_EXIT`, timeouts e caminho não-fatal | idem | **JÁ NA MAIN, byte-idêntico** | `origin/main:...deploy-functions.yml:382-417`; commit `946565d4d` (#2590, 2026-11-02 "timeout e non-fatal no preflight PromoGifts"). As 8 linhas de `removed_still_in_main` do JSON (`if [ "$STATUS" != "200" ]`, `supabase secrets set ...`) continuam na main porque **foram movidas para o `else`/`elif` do novo bloco**, exatamente como a branch fazia — não é regressão. |
| idem — `supabase/setup-cli@d239d10… # v3.1.0` (a única linha `missing_in_main`) | idem | **OBSOLETA** | main está em `supabase/setup-cli@689adcfb… # v3.2.0` (`deploy-functions.yml:232`, e também `db-live-guard.yml:88`, `db-migrate.yml:117`, `types-sync.yml:135`) via Dependabot `d96e1e71e` (#2620) e `49af49e25` (#2893). Aplicar a branch faria downgrade. |
| idem — reflow do comentário "A decisao CONTINUA rodando..." | idem | **JÁ NA MAIN** | `deploy-functions.yml:278-279` já tem a quebra de linha da branch. |
| `.github/ci-refresh` | NEW_FILE_ABSENT_IN_MAIN | **RUÍDO** (arquivo vazio, 0 bytes, só para re-disparar CI — commit `11fb332ad "ci: fresh synchronize trigger"`) | `git show <branch>:.github/ci-refresh` → vazio. Nenhum workflow referencia o caminho. Valor: nenhum. |

Diferença residual `git diff origin/main <branch>`: apenas (a) o pin do setup-cli (branch mais antiga) e (b) a main tem o step extra "Publicar ZAPP_BUILD_ID nas edges" (`deploy-functions.yml:535-550`, adicionado depois do tip da branch) — evolução da main, não lacuna.

## Veredito
**INCORPORADA** (confiança alta). Todo o trabalho útil está na `main` com o mesmo texto; a única linha ausente é um pin de action já superado por versão mais nova. `.github/ci-refresh` é artefato vazio sem valor.

## Lacunas a recuperar
Nenhuma.

## Branch
Apagar é seguro: `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei um único hunk de valor não coberto.

Prova decisiva — `git diff origin/main e5e03afa5 -- .github/workflows/deploy-functions.yml` (main em `dac285f62`) devolve
exatamente **dois** hunks, nenhum deles lacuna:
1. `@@ -229,7 +229,7 @@` — `supabase/setup-cli@d239d105… # v3.1.0` (branch) vs `@689adcfb… # v3.2.0` (main,
   `deploy-functions.yml:232`). `git log -S'd239d105…' origin/main -- .github/workflows/deploy-functions.yml` mostra
   `d96e1e71e` (#2620, trouxe v3.1.0) e `49af49e25` (#2893, substituiu por v3.2.0): a main **passou** por v3.1.0 e
   avançou. Aplicar a branch seria downgrade. Mesmo pin v3.2.0 em `db-live-guard.yml:88`, `db-migrate.yml:117`,
   `types-sync.yml:135`.
2. `@@ -532,22 +532,6 @@` — a main tem o step extra "Publicar ZAPP_BUILD_ID nas edges"
   (`deploy-functions.yml:535-549`), ausente na branch. Evolução da main posterior ao tip, não lacuna da branch.

Tudo o mais é **byte-idêntico**, ou seja, está na main (o diff não produz hunk):
- `deploy-functions.yml:473-489` — comentários W99/W100/W101/GR-001, `cd supabase/functions && deno install --frozen=false`
  e `npm --prefix supabase/functions install --no-save @types/node@25.9.9` (conferido linha a linha em
  `git show origin/main:.github/workflows/deploy-functions.yml`).
- `deploy-functions.yml:491-494` — `deno check --config supabase/functions/deno.json supabase/functions/**/index.ts`
  com o comentário GR-001.
- Preflight PromoGifts (`CURL_EXIT`, `--connect-timeout 10 --max-time 30`, 401/403 fatal, caminho não-fatal com
  `REESCREVER=false`, `else` com `node -e` + `supabase secrets set`): zero diferença. As 8 linhas
  `removed_still_in_main` do JSON são as que a branch **moveu** para o `else`/`elif` — a main fez o mesmo movimento,
  por isso continuam lá. Não é regressão.
- Reflow do comentário "A decisao CONTINUA rodando…": idêntico.

Checagens extras que fiz:
- Commits da branch tocam **só** esses 2 arquivos (`git log --name-only 1252bb5a4..e5e03afa5`), 6 commits sem merge
  (2 deles vazios/re-trigger). Não há trabalho escondido fora do diff net.
- `.github/ci-refresh`: `git show e5e03afa5:.github/ci-refresh | od -c` → `\n` (1 byte). `git grep ci-refresh origin/main`
  → nenhuma referência. Ruído confirmado.
- PR #2508: `state=closed`, `merged_at=null`, fechada em 2026-11-11, `mergeable_state=dirty`. Nenhuma PR aberta
  nesses arquivos por esta branch.

Observação (não é lacuna da branch, não muda o veredito): os commits intermediários `93d280649`/`8a8fd4a64`
adicionaram `--ignore-scripts` ao `npm install`, e o **próprio** commit final da branch (`e5e03afa5`) removeu a flag.
Nem o tip da branch nem a main (`deploy-functions.yml:489`) a têm. É um endurecimento abandonado pelo autor —
se o dono quiser, vira um `ci:` de 1 linha independente desta branch; apagar a branch não perde nada que ela defenda.

Branch pode ser apagada: `apagar_branch_seguro = true`.
