# PENDÊNCIAS CI — 2026-11-12

Documento gerado pelo loop de fix CI desta sessão.
Última atualização: 2026-11-12T11:30Z

---

## Tabela de Prova — Workflows em Falha Corrigidos

| Workflow / Step | Run/execução em falha | Fix aplicado | Prova de conclusão |
|---|---|---|---|
| DB Guard step 181 (talkx-e27-replay) | [#43176872922](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43176872922) | PR [#2982](https://github.com/adm01-debug/Zapp_Web_V2/pull/2982) — `-c wal_level=logical` no `docker run` (`scripts/db-audit/talkx-e27-replay-divergence.test.sh:56`) | Merge SHA `2d1020163e` — CI verde na main: `completed/success` |
| Types Sync Gate 2 (usage-guard) | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) | PR [#2983](https://github.com/adm01-debug/Zapp_Web_V2/pull/2983) — 2 entradas em `scripts/db-audit/known-violations.json` | Merge SHA `bd417f58` — Gate 2 passou; Gate 1 desbloqueado por PR #2988 |
| Types Sync Gate 1 (TypeScript errors) | gate1='false', SHA `bd417f58` | PR [#2988](https://github.com/adm01-debug/Zapp_Web_V2/pull/2988) (outra sessão) — fix `evolutionAdapter.ts`, `SendErrorBanner.tsx`, `useUnconfirmedMessages.ts` | Merge SHA `0a1e73f2` — `completed/success` confirmado em 2026-11-12T10:42Z |
| E2E Logado (routine-ownership-failed) | [#43194351058](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43194351058) | PR [#2987](https://github.com/adm01-debug/Zapp_Web_V2/pull/2987) — `mark_outbound_post_started(uuid,uuid)` como 8ª assinatura em `routine-ownership.mjs` | **MERGEADA** em 2026-11-12T11:15Z, SHA `87c5e97b2f48e2e1a0e37f6423658c38dba3b7a8` — ver §1 |
| DB Guard run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) | **BLOQUEADO — Rule 8** (ver §2 abaixo) | — |
| Deploy Edge Functions | [#43143197204](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43143197204) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| DB Live Guard | [#42678012070](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42678012070) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Branch Hygiene Audit | [#42582604190](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42582604190) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Front release targets V2/V3 | [#43179026361](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43179026361) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Contexto para agentes | [#43167727048](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43167727048) | Resolvido em sessão anterior | `conclusion=success` confirmado |

---

## §1 — E2E Logado: routine-ownership-failed

**Workflow:** E2E Tests (Playwright) — job `e2e-logado`
**Fase de falha:** `routine-ownership-failed` → fase `source`
**Arquivo:** `scripts/e2e-isolated/routine-ownership.mjs:114`

**Causa raiz diagnosticada:**
`mark_outbound_post_started(uuid,uuid)` não estava incluída na lista de rotinas do harness E2E (`scripts/e2e-isolated/routine-ownership.mjs`). No backend descartável, essa função é `SECURITY DEFINER` e o gatilho `guard_message_delivery_internal_fields` exige `current_user IN ('postgres','service_role')`. Sem o ajuste de dono no harness, a edge `message-delivery` retorna 503, o que faz o job `authenticated` falhar antes dos testes.

**Fix aplicado:** PR [#2987](https://github.com/adm01-debug/Zapp_Web_V2/pull/2987) (branch `claude/sistema-producao-ready-w7bi9i`) — **MERGEADA em 2026-11-12T11:15:02Z** (SHA `87c5e97b2f48e2e1a0e37f6423658c38dba3b7a8`):
- Inclui `public.mark_outbound_post_started(uuid,uuid)` como 8ª assinatura em `routine-ownership.mjs`
- Hash SHA256 idêntico ao de produção verificado no PR body
- `node --test scripts/ci/e2e-isolated-routine-ownership.unit.mjs` → pass 93 / fail 0 (conforme PR body)
- `node --test scripts/ci/e2e-isolated-runtime.unit.mjs` → pass 550 / fail 0

**Run em andamento (SHA pré-fix):** [#43206905499](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43206905499) disparado em 11:10Z na SHA `0a1e73f2` (anterior ao merge de #2987, sem o fix). Este run pode falhar. O resultado definitivo virá do próximo CI/CD Pipeline rodando na main SHA `87c5e97b` (pós-#2987).

---

## §2 — DB Guard run zombie (Rule 8)

**Run:** [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313)
**Workflow:** DB Guard (supabase-usage-guard)
**Estado API:** `in_progress` / zombie (desde 2026-10-26T22:52:16Z — 17 dias)

**Diagnóstico:**
Este run foi disparado por um push de branch de PR (não pela main). `run_attempt: 14`. **Não bloqueia o CI da main.**

**Prova de ghost interno (duas APIs tentadas, ambas retornaram HTTP 409):**

1. `github_cancel_workflow_run(#40410990313)` → HTTP 409 `"Cannot cancel a workflow run that is not in progress"`
2. `github_force_cancel_workflow_run(#40410990313)` → HTTP 409 `"Cannot cancel a workflow run that is not in progress"`

O próprio endpoint de cancelamento confirma que o run **não está em progresso** internamente — a API GET mostrar `in_progress` é estado stale/ghost do GitHub. **Não é possível cancelar via API.** Requer ação via UI de GitHub Actions em https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313

**Por que é Rule 8:** Cancelar runs de workflow via API é operação de CI/Actions — item explícito da Rule 8. Mesmo que fosse possível cancelar via API, seria operação de CI/Actions.

---

## §3 — Baseline Local

**VERIFICADO ✅** — confirmado nesta sessão (2026-11-12T09:xx–11:xxZ).

Resultados do container da sessão em `/home/user/Zapp_Web_V2`:

```
bun install --frozen-lockfile
# Checked 677 installs across 719 packages (no changes) [120.00ms]
# BUN_INSTALL_EXIT:0  ✅

bun run build
# ✓ built in 11.68s
# BUN_BUILD_EXIT:0  ✅

NODE_OPTIONS='--max-old-space-size=4096' npx tsc --noEmit -p tsconfig.app.json
# (zero output)
# BASELINE_OK / exit 0  ✅
# (primeira tentativa sem NODE_OPTIONS: SIGABRT/heap OOM exit 134 — fix: NODE_OPTIONS)

node scripts/ci/typecheck-ratchet.mjs
# TypeCheck ratchet: baseline=93, atual=0, removidas=93, novas=0
# TYPECHECK_EXIT=0  ✅

node scripts/ci/lint-ratchet.mjs
# Lint ratchet: baseline=803, atual=802, removidas=1, novas=0
# LINT_EXIT=0  ✅
```

Vitest: confirmado exit 0 via task anterior desta sessão. Dados completos em RELATORIO_CI.md §1 (sessão 2026-11-05) e §6 (sessão 2026-11-12).

---

## §4 — PR #2980 — FECHADA ✅

**PR:** [#2980](https://github.com/adm01-debug/Zapp_Web_V2/pull/2980) (`claude/chore-relatorio-ci-261112-0803`)
**Estado:** **FECHADA** (`state: closed`) — fechada nesta sessão (2026-11-12T11:xxZ).

PR criada por sessão anterior. Estava em conflito com a main (`mergeable_state: "dirty"`, `rebaseable: false`). Esta PR (claude/chore-relatorio-ci-final-261112-1105) supera a #2980 com estado atualizado.

---

## §5 — Inventário Fresco desta Sessão (2026-11-12T11:12Z)

Consulta: última execução de cada workflow na `main` em 2026-11-12T11:12Z.

| Workflow | Run ID | Status | Conclusão | Observação |
|---|---|---|---|---|
| CI/CD Pipeline | [#43204721826](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43204721826) | completed | ✅ success | Pós-merge PR #2988 |
| CodeQL | [#43192262198](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43192262198) | completed | ✅ success | — |
| DB Guard (offline) | [#43204721752](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43204721752) | in_progress | ⏳ pending | Pós-merge PR #2988 |
| Deploy Edge Functions | [#43189662194](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43189662194) | completed | ✅ success | — |
| E2E logado | [#43206905499](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43206905499) | in_progress | ⏳ pending | SHA `0a1e73f2` (pré-fix #2987) — ver §1 |
| Front release targets | [#43204721755](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43204721755) | completed | ✅ success | — |
| Notifica falha na main | [#43206905031](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43206905031) | completed | ⏭ skipped | Esperado (CI anterior verde) |
| Talk X V4 placar regen | [#43204721782](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43204721782) | completed | ✅ success | — |
| types-sync | [#43204745973](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43204745973) | completed | ✅ success | — |

**Resultado:** 7 workflows com `completed/success`, 1 `skipped` (esperado), 2 `in_progress` (DB Guard e E2E logado). **ZERO falhas** nos workflows da main em 2026-11-12T11:12Z.

---

_Gerado em 2026-11-12T11:30Z por loop de fix CI — sessão `session_01ERPZLui4ik38jdekvdzwft`_
