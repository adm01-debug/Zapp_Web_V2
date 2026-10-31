# RELATORIO_CI.md — Correcao de workflows com falha

**Data:** 2026-10-31  
**Branch de correcao:** `claude/hopeful-knuth-4brqti`  
**PR:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)

---

## 1. Inventario inicial (baseline)

### Workflows com falha na main (ultimo run antes desta sessao)

| Workflow | Run ID | Conclusao | Causa raiz |
|---|---|---|---|
| `deploy-functions.yml` | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) | `failure` | `Could not find "@types/node" in a node_modules folder` — `@types/ws@8.18.1` tem `/// <reference types="node" />` que forca resolucao de `@types/node`, mas ele nao esta no `deno.lock` |

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

## 2. Baseline local (pre-correcao)

| Metrica | Valor |
|---|---|
| Erros de typecheck (baseline ratchet) | 93 |
| Erros de lint (baseline ratchet) | 819 |
| Build | success (CI run 41150191456, job 124392271077, 00:57:17Z) |
| Suíte de testes | success (Unit Tests 3/3 shards + E2E; CI run 41150191456, CI Gate 00:58:49Z) |
| Erros de typecheck apos correcao | 4 |
| Erros de lint apos correcao | 814 |
| Novos erros de typecheck introduzidos | 0 |
| Novos erros de lint introduzidos | 0 |

**Prova (pre-push hook):**
```
Typecheck ratchet: baseline=93, atual=4, removidas=89, novas=0
OK: nenhum novo erro de tipo foi introduzido.
Lint ratchet: baseline=819, atual=814, mantidas=814, removidas=5, novas=0
OK: nenhuma nova divida de lint foi introduzida.
```

**Nota:** a correcao afeta somente `.github/workflows/deploy-functions.yml` (nenhum codigo de aplicacao alterado). O baseline de install/build/tests e validado pelo CI obrigatorio da PR.

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
- `@types/node` **nao esta no `deno.lock`** (e trazido transitivamente via CDN esm.sh, nao via npm)
- `deno install` nao instala `@types/node` porque nao ha entrada direta no lockfile
- Resultado: `deno check` falha ao tentar resolver o tipo

**Fix aplicado (PR #2407, commit `61cf803ac`):**
```yaml
- name: Instalar dependencias node_modules (deno install + @types/node)
  run: |
    set -euo pipefail
    deno install --config supabase/functions/deno.json
    (cd supabase/functions && echo '{}' > package.json && npm install --no-save --ignore-scripts --no-package-lock @types/node@25.9.9 && rm -f package.json)
```

### E59 — `set -euo pipefail` ausente em bloco `run: |` do deploy-functions.yml

**Sintoma (primeiro commit f5c274d9, teste E59 em `workflow-shell-strictness.unit.mjs`):**
```
AssertionError: bloco da linha 461 nao abre com modo estrito
(primeira linha: deno install --config supabase/functions/deno.json)
```

**Fix:** adicionado `set -euo pipefail` como primeira linha do bloco (commit `61cf803ac`).

---

## 4. Correcoes aplicadas

| Commit | Descricao | Arquivo alterado |
|---|---|---|
| `f5c274d99` | fix(deploy-functions): instalar @types/node via npm antes do deno check (W100) | `.github/workflows/deploy-functions.yml` |
| `61cf803ac` | fix(deploy-functions): adiciona set -euo pipefail e fixa @types/node@25.9.9 (E59/W100) | `.github/workflows/deploy-functions.yml` |

---

## 5. Prova de conclusao

### Checks obrigatorios da PR #2407 — SHA `d0e624ba` (run ci.yml 41150191456, tentativa 2)

| Check | Run ID | Job ID | Conclusao |
|---|---|---|---|
| Lint & TypeCheck / TypeCheck | 41150191456 | 124383432232 | success |
| Security Audit | 41150191456 | 124383431974 | success |
| Node CI Scripts | 41150191456 | 124383432170 | success |
| Replay local das migrations | 41150191526 (db-guard) | — | success |
| Contrato DB offline | 41150191526 (db-guard) | 124385009044 | success |
| Mutacao do mapa | 41150191456 | 124383432276 | success |
| Unit Tests (1/3) | 41150191456 | 124383432133 | success |
| Unit Tests (2/3) | 41150191456 | 124383432299 | success |
| Unit Tests (3/3) | 41150191456 | 124388506758 (attempt 2) | success (00:53:30Z) |
| Build | 41150191456 | 124392271077 | success (00:57:17Z) |
| E2E Tests (Playwright) | 41150191456 | — | success |
| CI Gate (required check) | 41150191456 | 124393241622 | success (00:58:49Z) |

**Nota:** SHA d0e624ba ficou BEHIND da main (PR #2385 mergeou `4dc8adbf` em 00:55:39Z com strict=true).  
Branch atualizada manualmente em 01:02Z para novo SHA `c6cc8cf8`. CI reiniciado.

### SHA `c6cc8cf8` (merge commit com main `4dc8adbf`) — checks em andamento/concluidos

| Check | Job ID | Conclusao | Hora |
|---|---|---|---|
| Replay local das migrations | 124394540137 | success | 01:08:00Z |
| Security Audit | 124394540341 | success | 01:06:33Z |
| TypeCheck | 124394540578 | em andamento/queued | — |
| Node CI Scripts | 124394540570 | em andamento/queued | — |
| Unit Tests (1/3) | 124394540598 | em andamento/queued | — |
| Unit Tests (2/3) | 124394540539 | em andamento/queued | — |
| Unit Tests (3/3) | 124394540548 | em andamento/queued | — |
| E2E Tests (Playwright) | 124394540622 | em andamento/queued | — |
| Contrato DB offline | 124394540355 | em andamento/queued | — |
| auto_merge: squash | — | ativo | — |

**Todos os 6 required checks do SHA anterior `d0e624ba` passaram (CI Gate 00:58:49Z).**  
A correcao em `deploy-functions.yml` e identica nos dois SHAs; nenhuma mudanca de codigo foi feita.

### Workflows que estavam em falha — pos-merge (pendente merge da PR #2407)

| Workflow | Status |
|---|---|
| `deploy-functions.yml` | pendente: sera verificado apos merge da PR #2407 |
| `db-live-guard.yml` (dispatch) | pendente: sera disparado apos merge da PR #2407 |

### Workflows antes verdes — seguem verdes pos-correcao

Nao alterados: nenhuma regressao introduzida (lint/typecheck ratchets confirmados; somente `.github/workflows/deploy-functions.yml` foi modificado).

---

## 6. Pendencias

- `copilot-pull-request-reviewer` — falha por firewall externo (nao e required check). Ver PENDENCIAS.md.
- `db-live-guard.yml` — sera redisparado apos merge da PR #2407.
- PR #2407 com CI em andamento (SHA `c6cc8cf8`, iniciado 01:02Z); 2 de 13 checks ja concluidos. Auto-merge squash ativo.
