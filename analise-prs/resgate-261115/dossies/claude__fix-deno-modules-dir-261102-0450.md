# Dossiê — claude__fix-deno-modules-dir-261102-0450 (PR #2580)

**Branch:** `origin/claude/fix-deno-modules-dir-261102-0450` · tip `38656b5a0` · merge-base `50ca61a6e` (2026-11-02) · 1 commit, 1 arquivo, 1 linha.

## Propósito
Commit `38656b5a0 fix: deno.json nodeModulesDir none — deno check sem deno install`: troca `"nodeModulesDir":"auto"` → `"none"` em `supabase/functions/deno.json` para que `deno check` passe sem `deno install`.

## Arquivo × achado × evidência

| Arquivo | Lacuna | Achado | Evidência |
|---|---|---|---|
| `supabase/functions/deno.json` | 1 linha (`auto`→`none`) ausente na main | **OBSOLETA — reverte de propósito uma decisão da main** | Main tem `"nodeModulesDir":"auto"` (`git show origin/main:supabase/functions/deno.json`, linha 1). Histórico do arquivo na main: `3f18bbe7b` (#2399, 2026-10-30) fez exatamente esta mudança (`auto`→`none`); `e4e8c2653` (#2404, 2026-10-30) **reverteu** para `auto` porque `none` quebrou `deploy-functions.yml` no passo "Typecheck das edge functions" (`error: Could not find "@types/node" in a node_modules folder`). Corpo do commit `e4e8c2653`: "Com `nodeModulesDir: "none"` + W99: `deno install` não cria `node_modules/` → `deno check` falha". A main resolve a mesma necessidade por outro caminho: `.github/workflows/deploy-functions.yml:473-494` roda `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9` antes de `deno check --config supabase/functions/deno.json` (comentários W99/W100/W101/GR-001 dizem explicitamente que `--config` lê `nodeModulesDir:"auto"`). |

## Estado atual verificado
- `deploy-functions.yml` em `main`: 3 últimos runs `success` (2026-11-15 03:06Z, 05:15Z, 06:16Z — `gh run list -w deploy-functions.yml -b main`). A combinação `auto` + `deno install` funciona em produção.
- Guard `scripts/ci/deno-reproducibility.unit.mjs:51-54` aceita `none` ou `auto`, então a branch não quebraria o guard — mas reintroduziria exatamente a regressão que #2404 corrigiu (o `deno install` do workflow não cria `node_modules/` com `none`, e o `deno check` com `--config` falha ao resolver `@types/node` trazido por `@types/ws@8.18.1`).
- A triagem anterior (2026-11-08) já havia marcado #2580 como OBSOLETA; confirmado aqui com prova por commit.

## Veredito
**OBSOLETA** (confiança alta). Nada a recuperar. `apagar_branch_seguro = true`.

## Hunk da branch (referência; NÃO portar)
```diff
-{"lock":"../../scripts/ci/deno.lock","nodeModulesDir":"auto",...}
+{"lock":"../../scripts/ci/deno.lock","nodeModulesDir":"none",...}
```

## Verificação adversarial

**Concordo com OBSOLETA (confiança alta).** Tentei refutar e não achei nenhum hunk aproveitável.

Checagens que eu mesmo rodei:
1. `git diff 50ca61a6e origin/claude/fix-deno-modules-dir-261102-0450` → **1 arquivo, 1 linha**, só `"nodeModulesDir":"auto"` → `"none"` em `supabase/functions/deno.json`. Não existe segundo hunk possível de resgatar (`ahead=1`, nenhum outro arquivo).
2. `git show origin/main:supabase/functions/deno.json` → `{"lock":"../../scripts/ci/deno.lock","nodeModulesDir":"auto",...}`. A linha da branch realmente falta na main — e falta de propósito.
3. Histórico do arquivo na main (`git log --date=short origin/main -- supabase/functions/deno.json`): `3f18bbe7b` (#2399, 2026-10-30) fez exatamente `auto`→`none`; `e4e8c2653` (#2404, 2026-10-30) **reverteu** para `auto`. Corpo de `e4e8c2653` lido na íntegra: "Com `nodeModulesDir: "none"` + W99: `deno install` **não cria** `node_modules/` → `deno check` falha ❌". Ou seja: remoção deliberada, documentada, posterior à tentativa idêntica.
4. A premissa do revert **continua válida na main de hoje**: `.github/workflows/deploy-functions.yml` linhas 473-494 (`git show origin/main:`) tem `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9` (linhas 488-489) antes de `deno check --config supabase/functions/deno.json` (linha 494), com comentário GR-001 na linha 492 dizendo que o `--config` existe justamente para ler `nodeModulesDir:"auto"`. A necessidade alegada pela branch ("deno check sem deno install") está coberta por outro caminho — a main instala, e por isso quer `auto`.
5. Guard `scripts/ci/deno-reproducibility.unit.mjs:53-54` aceita `none` **ou** `auto`, então a branch passaria no guard sem alertar — reforça que mergeá-la seria silenciosamente reintroduzir a regressão de #2399.

**Nenhuma lacuna adicional.** `apagar_branch_seguro = true`. Observação de risco invertido: aplicar esta branch é ativamente nocivo (quebra o typecheck do `deploy-functions.yml`), não apenas redundante.
