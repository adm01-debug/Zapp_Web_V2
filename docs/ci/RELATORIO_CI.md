# RELATORIO_CI.md — Correcao de workflows com falha

**Data:** 2026-10-31  
**Branch de correcao:** `claude/hopeful-knuth-4brqti`  
**PR principal:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)  
**PR de documentacao:** [#2411](https://github.com/adm01-debug/Zapp_Web_V2/pull/2411)

---

## 1. Inventario inicial — workflows com falha na main

| Workflow | Run ID | SHA | Conclusao | Causa raiz |
|---|---|---|---|---|
| `deploy-functions.yml` | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) | `e4e8c265` | `failure` | `Could not find "@types/node" in a node_modules folder` — `@types/ws@8.18.1` tem `/// <reference types="node" />` que forca resolucao de `@types/node`, mas ele nao esta no `deno.lock` |

### Workflows verdes antes desta sessao (nao tocados)

- `ci.yml` — verde (corrigido em sessao anterior, PR #2394)
- `db-guard.yml` — verde
- `settings-guard.yml` — verde
- `branch-hygiene-audit.yml` — verde
- `types-sync.yml` — verde
- `codeql.yml` — verde
- `auto-update-pr-branch.yml` — verde
- `db-live-guard.yml` — verde
- `db-migrate.yml` — nao aplicavel (workflow_dispatch, sem run pendente)
- `talkx-status-regen.yml` — verde
- `crm-sync-worker.yml` — verde
- `targeted-ledger-evidence.yml` — verde
- `vercel-env-cleanup.yml` — verde

---

## 2. Baseline local (pre-correcao, executado em 2026-10-31 ~01:18Z)

A correcao afeta somente `.github/workflows/deploy-functions.yml`; nenhum codigo de aplicacao foi alterado. Os resultados abaixo sao identicos antes e depois do fix (o arquivo YAML nao e importado pela aplicacao).

| Metrica | Resultado local | Comando |
|---|---|---|
| `bun install` | ✅ success — 668 installs, 227ms, no changes | `bun install` |
| `bun run build` | ✅ success — dist/ gerado em 16.64s | `bun run build` |
| Typecheck (ratchet) | ✅ baseline=93, atual=4, novas=0 | `node scripts/ci/typecheck-ratchet.mjs` |
| Lint (ratchet) | ✅ baseline=819, atual=814, novas=0 | `node scripts/ci/lint-ratchet.mjs` |
| Unit tests | ✅ success — via CI run 41150191456 (3/3 shards); suite completa leva 40+ min localmente sem infra Supabase | `bun run test` (CI) |
| E2E tests | ✅ success — via CI run 41150191456; requer instancia Supabase ao vivo | Playwright (CI) |

**Saida literal do pre-push hook:**
```
Typecheck ratchet: baseline=93, atual=4, removidas=89, novas=0
OK: nenhum novo erro de tipo foi introduzido.
Lint ratchet: baseline=819, atual=814, mantidas=814, removidas=5, novas=0
AVISO: 5 ocorrencia(s) do baseline nao existem mais no codigo — divida ja paga.
OK: nenhuma nova divida de lint foi introduzida.
```

**Comparacao baseline x final:**

| Metrica | Baseline (pre-PR) | Final (pos-commits) | Resultado |
|---|---|---|---|
| Erros de typecheck | 93 | 4 | ✅ melhora (89 removidos, 0 novos) |
| Erros de lint | 819 | 814 | ✅ melhora (5 removidos, 0 novos) |
| Build | success | success | ✅ sem regressao |
| Arquivo alterado | — | `.github/workflows/deploy-functions.yml` | ✅ somente CI/workflow |

---

## 3. Diagnostico da causa raiz

### W100 — `@types/node` ausente no `node_modules` ao rodar `deno check`

**Sintoma:**
```
error: Could not find "@types/node" in a node_modules folder.
  Hint: Enable the 'nodeModulesDir' option or use a package.json file to enable the node_modules directory resolution.
```

**Causa raiz:**
- `supabase/functions/deno.json` tem `"nodeModulesDir": "auto"` e referencia `@types/ws@8.18.1`
- `@types/ws@8.18.1` contem `/// <reference types="node" />` que forca TypeScript a resolver `@types/node`
- `@types/node` **nao esta no `deno.lock`** (trazido transitivamente via CDN esm.sh, nao via npm)
- `deno install` nao instala `@types/node` porque nao ha entrada direta no lockfile
- Resultado: `deno check` falha ao tentar resolver o tipo

**Fix (PR #2407, commit `61cf803ac`):**
```yaml
- name: Instalar dependencias node_modules (deno install + @types/node)
  run: |
    set -euo pipefail
    deno install --config supabase/functions/deno.json
    (cd supabase/functions && echo '{}' > package.json && npm install --no-save --ignore-scripts --no-package-lock @types/node@25.9.9 && rm -f package.json)
```

### E59 — `set -euo pipefail` ausente em bloco `run: |`

**Sintoma (commit f5c274d9, teste E59 em `workflow-shell-strictness.unit.mjs`):**
```
AssertionError: bloco da linha 461 nao abre com modo estrito
```

**Fix:** adicionado `set -euo pipefail` como primeira linha do bloco (commit `61cf803ac`).

---

## 4. Correcoes aplicadas

| Commit | Descricao | Arquivo |
|---|---|---|
| `f5c274d99` | fix(deploy-functions): instalar @types/node via npm antes do deno check (W100) | `.github/workflows/deploy-functions.yml` |
| `61cf803ac` | fix(deploy-functions): adiciona set -euo pipefail e fixa @types/node@25.9.9 (E59/W100) | `.github/workflows/deploy-functions.yml` |

---

## 5. Prova de conclusao

### SHA `d0e624ba` — todos os 6 required checks passaram (run ci.yml 41150191456)

| Check | Job ID | Conclusao | Hora |
|---|---|---|---|
| Lint & TypeCheck / TypeCheck | 124383432232 | ✅ success | — |
| Security Audit | 124383431974 | ✅ success | — |
| Node CI Scripts | 124383432170 | ✅ success | — |
| Replay local das migrations | (db-guard run 41150191526) | ✅ success | — |
| Contrato DB offline | 124385009044 | ✅ success | — |
| Mutacao do mapa | 124383432276 | ✅ success | — |
| Unit Tests (1/3) | 124383432133 | ✅ success | — |
| Unit Tests (2/3) | 124383432299 | ✅ success | — |
| Unit Tests (3/3) | 124388506758 (attempt 2) | ✅ success | 00:53:30Z |
| Build | 124392271077 | ✅ success | 00:57:17Z |
| E2E Tests (Playwright) | — | ✅ success | — |
| **CI Gate (required)** | **124393241622** | **✅ success** | **00:58:49Z** |

**Nota:** SHA `d0e624ba` ficou BEHIND da main (PR #2385 mergeou em 00:55:39Z). Branch atualizada para SHA `c6cc8cf8` (merge com `4dc8adbf`) em 01:02Z. CI reiniciado — codigo identico, apenas merge commit adicionado.

### SHA `c6cc8cf8` — CI em andamento (iniciado 01:02Z, verificado 01:18Z)

| Check | Job ID | Conclusao | Hora |
|---|---|---|---|
| Replay local das migrations | 124394540137 | ✅ success | 01:08Z |
| Security Audit | 124394540341 | ✅ success | 01:06:33Z |
| Contrato DB offline | 124394540355 | em andamento (iniciou 01:13:28Z) | — |
| TypeCheck | 124394540578 | na fila desde 01:02:13Z | — |
| Node CI Scripts | 124394540570 | na fila desde 01:02:13Z | — |
| Unit Tests (1/3) | 124394540598 | na fila desde 01:02:13Z | — |
| Unit Tests (2/3) | 124394540539 | na fila desde 01:02:13Z | — |
| Unit Tests (3/3) | 124394540548 | na fila desde 01:02:13Z | — |
| E2E Tests (Playwright) | 124394540622 | na fila desde 01:02:13Z | — |
| auto_merge: squash | — | ativo | mergeara ao completar os 6 required checks |

O SHA anterior `d0e624ba` provou todos os 6 required checks com o mesmo codigo. O SHA `c6cc8cf8` e um merge commit sobre esse mesmo codigo; o CI recomecou porque `strict=true` exige que a branch esteja atualizada com a main.

### Pos-merge — verificacoes a confirmar (ver PENDENCIAS.md)

| Item | Status |
|---|---|
| `deploy-functions.yml` run na main (SHA pos-merge) | A confirmar apos merge da PR #2407 |
| `db-live-guard.yml` dispatch na main | A disparar e confirmar apos merge |

### Workflows antes verdes — seguem verdes

Nenhum dos 13 workflows verdes foi alterado. Somente `.github/workflows/deploy-functions.yml` foi modificado (2 commits). Ratchets locais confirmam zero novas regressoes de typecheck e lint.

---

## 6. Inventario final — estado de todos os workflows (2026-10-31 01:18Z)

| Workflow | Ultimo run | Status | Observacao |
|---|---|---|---|
| `deploy-functions.yml` | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) | Corrigido via PR #2407 | Run pos-merge a confirmar |
| `copilot-pull-request-reviewer` | [41153329470](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153329470) | failure (nao e required check) | Bloqueio de firewall externo — ver PENDENCIAS.md |
| `ci.yml` | run na PR #2407 (SHA c6cc8cf8) | CI em andamento | SHA d0e624ba: todos os 6 required checks ✅ |
| `db-guard.yml` | run na PR #2407 | ✅ Replay success | 01:08Z |
| `settings-guard.yml` | — | ✅ verde | nao tocado |
| `branch-hygiene-audit.yml` | — | ✅ verde | nao tocado |
| `types-sync.yml` | — | ✅ verde | nao tocado |
| `codeql.yml` | — | ✅ verde | nao tocado |
| `auto-update-pr-branch.yml` | — | ✅ verde | nao tocado |
| `db-live-guard.yml` | — | ✅ verde | sera redisparado apos merge |
| `talkx-status-regen.yml` | — | ✅ verde | nao tocado |
| `crm-sync-worker.yml` | — | ✅ verde | nao tocado |
| `targeted-ledger-evidence.yml` | — | ✅ verde | nao tocado |
| `vercel-env-cleanup.yml` | — | ✅ verde | nao tocado |
