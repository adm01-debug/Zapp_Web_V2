# Dossiê — claude__fix-deploy-deno-check-node-modules-261030-1200 (PR #2380)

**Ref:** `origin/claude/fix-deploy-deno-check-node-modules-261030-1200` · tip `ea3af3e1e` (2026-10-30) · merge-base `fb57b4a5c` (ancestral da main; tip NÃO está na main).

## Propósito
Destravar o `deno check` do `deploy-functions.yml` (2 commits úteis + 2 merges de main):
- `770cddb1b` — `deno check --node-modules-dir=none supabase/functions/**/index.ts` (desliga node_modules no typecheck).
- `ea3af3e1e` — corrige hash sha256 de `https://esm.sh/tslib@2.8.1/denonext/tslib.mjs` em `scripts/ci/deno.lock` (`c38da5dd…` → `ebce3cd5…`).

## Arquivo × achado × evidência

| Arquivo | Lacuna | Achado | Evidência |
|---|---|---|---|
| `.github/workflows/deploy-functions.yml` | `--node-modules-dir=none` ausente | **OBSOLETA — abordagem oposta adotada de propósito.** A main resolve o mesmo problema instalando node_modules: `deno install --frozen=false` + `npm install @types/node@25.9.9` (linhas 473-489) e `deno check --config supabase/functions/deno.json` (linha 494); `supabase/functions/deno.json` traz `"nodeModulesDir":"auto"`. `--node-modules-dir=none` contradiria essa configuração. | `git show origin/main:.github/workflows/deploy-functions.yml` l.473-494; `git show origin/main:supabase/functions/deno.json`; commits `8ba0b4361` (#2567, 2026-11-02), `84b8b149e` (#2575, 2026-11-02), `c5650d887` (#2855, 2026-11-10) |
| `scripts/ci/deno.lock` | hash esm.sh de tslib ausente | **OBSOLETA — entrada-alvo não existe mais.** A main não tem nenhuma chave `esm.sh/tslib` no lock (`grep -c` = 0); tslib está como `npm:tslib@2.8.1` com integrity `sha512-oJFu94HQ…` (l.6 e l.186). | `239f6d8ca` fix(ci): lock tslib through npm registry (#2395, 2026-10-30); `7f3c25944` infra: migra imports esm.sh para npm specifiers (#2753, 2026-11-07) |

## Veredito
**OBSOLETA** (confiança alta). Nenhum hunk faz sentido no código atual: o workflow da main usa `nodeModulesDir:"auto"` + instalação explícita (o oposto de `none`), e o hash que a branch corrigia pertence a uma URL esm.sh que a main removeu do lock ao migrar para npm specifiers. Confirma a `triagem_2804` (OBSOLETA).

Sem migration/SQL (nada a consultar em produção). Sem custo externo nem contradição de regra de negócio.

## Lacunas a recuperar
Nenhuma.

**apagar_branch_seguro: true.**

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar e não achei nenhum hunk aproveitável. O diff `fb57b4a5c..ea3af3e1e` tem exatamente **2 linhas alteradas em 2 arquivos** (`git diff --stat`), então o universo de lacunas possíveis é fechado e foi auditado linha por linha.

**Hunk 1 — `.github/workflows/deploy-functions.yml`: `deno check` → `deno check --node-modules-dir=none`**
- A main faz o **oposto, de propósito e com comentários explicando**: step `Instalar dependencias node_modules (deno install + @types/node)` roda `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9`, e o typecheck é `deno check --config supabase/functions/deno.json supabase/functions/**/index.ts` (`git show origin/main:.github/workflows/deploy-functions.yml`, linhas 473-494 do arquivo; comentários W99/W100/GR-001/W101 no próprio step).
- `git show origin/main:supabase/functions/deno.json` → `{"lock":"../../scripts/ci/deno.lock","nodeModulesDir":"auto",...,"imports":{"@types/node":"npm:@types/node@25.9.9"}}`. Aplicar `--node-modules-dir=none` **desligaria** justamente o node_modules que a main instala para `@types/node` resolver o `/// <reference types="node" />` de `@types/ws` — reintroduziria a falha `Could not find "@types/node" in a node_modules folder` documentada em `origin/main:docs/_arquivo/analise/inventario-2026-10-31/workflows-main.md:13`.
- Os 3 commits da substituição são **ancestrais de origin/main** (`git merge-base --is-ancestor`): `8ba0b4361` (#2567, 2026-11-02), `84b8b149e` (#2575, 2026-11-02), `c5650d887` (#2855, 2026-11-10). `git grep -- '--node-modules-dir' origin/main` só retorna docs de inventário e `scripts/db-audit/multiplix-send-mutation.py:18` (script não relacionado) — a flag nunca entrou no workflow.

**Hunk 2 — `scripts/ci/deno.lock`: hash de `https://esm.sh/tslib@2.8.1/denonext/tslib.mjs` (`c38da5dd…` → `ebce3cd5…`)**
- Diferença byte-exata confirmada no offset 17060 do lock (só esse valor muda entre merge-base e tip).
- A chave **não existe mais na main**: `git show origin/main:scripts/ci/deno.lock | grep -c 'esm.sh/tslib'` = **0**; o novo hash também não aparece (`grep -c 'ebce3cd5'` = 0). tslib virou `"npm:tslib@2.8.1"` (ainda há 70 ocorrências de `esm.sh` no lock para outros pacotes, logo a ausência é específica de tslib, não efeito colateral).
- Remoção deliberada, provada no commit: `git show 239f6d8ca^:scripts/ci/deno.lock | grep -c 'esm.sh/tslib@2.8.1/denonext'` = 1 → `git show 239f6d8ca:… ` = 0. `239f6d8ca` = `fix(ci): lock tslib through npm registry (#2395)`, 2026-10-30 (mesmo dia da branch), ancestral da main; reforçado depois por `7f3c25944` (#2753, 2026-11-07, migração esm.sh → npm specifiers). Corrigir o hash de uma URL que o lock não referencia mais é no-op.

**Checagem extra (não estava no dossiê):** a PR #2380 foi **fechada sem merge** em 2026-10-31 com justificativa registrada no corpo — "GR-008: fechada como duplicata de deploy-functions fix. A PR #2407 já mergeou na main com a correção definitiva; o fix adicional está na PR #2508" (`github_get_pull_request` 2380: `state=closed`, `merged_at=null`, `mergeable_state=dirty`). O JSON do item traz `closure_comment: {}`, mas o motivo está no corpo da PR. A main também já marcava o descarte: `origin/main:docs/_arquivo/analise/BACKLOG_TAREFAS.md:26` — "#2380 … FECHAR após o merge da mantida: duplicata da #2409".

**Nada de custo externo, nada destrutivo, nenhuma migration** — não é caso de DECISAO_DONO. Nenhuma lacuna adicional. `apagar_branch_seguro: true` (tip `ea3af3e1e` não é ancestral da main, mas não carrega conteúdo aproveitável).
