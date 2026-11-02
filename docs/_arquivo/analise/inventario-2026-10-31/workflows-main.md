# Inventário GitHub Actions — main @ 668d77329 (2026-10-31 ~02:50 UTC)

| Workflow | Último run main (não-PR) | Conclusão | Causa raiz | PR que corrige |
|---|---|---|---|---|
| ci.yml | push 02:23 668d773 | em andamento (último concluído 01:37 = success) | — | — |
| db-guard.yml | push 02:23 | success | — | — |
| types-sync.yml | push 02:23 | success | (issue #2016 aberta, 18 coment., stale desde 29/10) | — |
| talkx-status-regen.yml | push 02:23 | success | — | — |
| auto-update-pr-branch.yml | schedule 02:39 | success | — | — |
| notifica-falha-main.yml | workflow_run 02:43 | skipped (último exec. 30/10 success) | — | — |
| settings-guard.yml | schedule 30/10 07:20 | success | 29/10 schedule falhou; só 1 run/dia agendado | — |
| codeql.yml | schedule 26/10 | success (semanal) | — | — |
| **deploy-functions.yml** | push 30/10 23:53 e4e8c26 | **failure** desde 16/10 | step "deno check": `Could not find "@types/node" in a node_modules folder` (o `deno install` do passo 453 não instala @types/node) | **4 PRs concorrentes**: #2407 (1 arq, +8/-2, blocked/CI rodando, auto-merge), #2409 (4 arq incl. deno.json, blocked/CI rodando, auto-merge), #2408 (dirty/conflito, 5 arq), #2380 (dirty, --node-modules-dir=none). #2411 = só docs |
| **db-live-guard.yml** | dispatch 31/10 02:37 | **failure** (último success 15/10) | 3 contratos quebrados: (1) migrations×ledger: statements em prosa (20261016112802, …115413), nome divergente (20261016130000), SQL divergente (20261016180000, …190000, …220000); (2) ACL de mcp_exec violada (`check-mcp-exec-acl.sql:380`); (3) auditoria runtime config. Issue #1965 aberta | nenhum PR específico (#2093/#1930 antigos tocam drift) |
| **e2e-logado.yml** | push 30/10 23:00 526ce52 | **failure** (0 success nos últimos 30) | job deslogado-secundário: `firefox-telefonia › telefonia.spec.ts:224 Y11 número incompleto`; job authenticated cancelado (timeout, dezenas de ×); SUPABASE_SERVICE_ROLE_KEY ausente (teardown pulado) | #2279 (draft, workers 1→2), #2040 (gatilho) |
| **db-migrate.yml** | dispatch 25/10 | **failure** (último success 05/10) | "Exigir alvo único": `remote_only_count=3` — ledger tem 3 versions sem arquivo local | #2142 (GA13-17, antigo) |
| **branch-hygiene-audit.yml** | dispatch 30/10 cancelled; último concluído 15/10 failure | failure/cancelled; último success 12/10 | cancelado no step "KPI do GitHub Actions" (timeout); falha de 15/10 não lida | #2197 (lote GA49-64) |
| e2e-talkx.yml | nunca roda na main (só PR) | — (825 runs em PR) | design | — |
| crm-sync-worker.yml | schedule 22/09 | skipped | desativado de propósito (vars.CRM_SYNC_WORKER_ENABLED) | — |
| targeted-ledger-evidence.yml | dispatch 24/09 | success | só manual | — |
| vercel-env-cleanup.yml | dispatch 19/10 | success | só manual | — |

## O que está faltando / anomalias
- 4 PRs abertos para o MESMO fix do deploy-functions (#2380, #2407, #2408, #2409) — escolher 1 (#2409 é o mais completo: deno.json + workflow), fechar os outros após merge.
- ~70 PRs abertos de "fix(ci)" antigos (GA/W/Z/E-series, 14–29/10), muitos dirty/draft — candidatos a fechar como obsoletos após verificar se a main já absorveu.
- 25 workflows "fantasma" registrados no Actions sem arquivo na main (Bearer, Hadolint, Django, Docker, Deno, super-linter, main.yml, patch-plano.yml, check-talkx-pr-body.yml, talkx-pr-body.yml…) — vieram de branches em 21/10 e 28/10; ruído, sem efeito na main.
- Secret ausente: SUPABASE_SERVICE_ROLE_KEY no e2e-logado (teardown pulado; não é a causa da falha).
- Issues de alerta abertas: #1965 db-live-guard (9 coment.), #2016 types-sync (18 coment.).
- Required checks em PRs: `copilot-pull-request-reviewer` falha sempre (não-required, firewall).
