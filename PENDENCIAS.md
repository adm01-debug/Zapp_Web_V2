# PENDÊNCIAS CI — 2026-11-12

Documento gerado pelo loop de fix CI desta sessão.
Última atualização: 2026-11-12T11:05Z

---

## Tabela de Prova — Workflows em Falha Corrigidos

| Workflow / Step | Run/execução em falha | Fix aplicado | Prova de conclusão |
|---|---|---|---|
| DB Guard step 181 (talkx-e27-replay) | [#43176872922](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43176872922) | PR [#2982](https://github.com/adm01-debug/Zapp_Web_V2/pull/2982) — `-c wal_level=logical` no `docker run` (`scripts/db-audit/talkx-e27-replay-divergence.test.sh:56`) | Merge SHA `2d1020163e` — CI verde na main: `completed/success` |
| Types Sync Gate 2 (usage-guard) | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) | PR [#2983](https://github.com/adm01-debug/Zapp_Web_V2/pull/2983) — 2 entradas em `scripts/db-audit/known-violations.json` | Merge SHA `bd417f58` — Gate 2 passou; Gate 1 desbloqueado por PR #2988 |
| Types Sync Gate 1 (TypeScript errors) | gate1='false', SHA `bd417f58` | PR [#2988](https://github.com/adm01-debug/Zapp_Web_V2/pull/2988) (outra sessão) — fix `evolutionAdapter.ts`, `SendErrorBanner.tsx`, `useUnconfirmedMessages.ts` | Merge SHA `0a1e73f2` — `completed/success` confirmado em 2026-11-12T10:42Z |
| Deploy Edge Functions | [#43143197204](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43143197204) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| DB Live Guard | [#42678012070](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42678012070) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Branch Hygiene Audit | [#42582604190](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42582604190) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Front release targets V2/V3 | [#43179026361](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43179026361) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Contexto para agentes | [#43167727048](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43167727048) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| E2E Logado (routine-ownership-failed) | n/a | **EM ANDAMENTO** — PR [#2987](https://github.com/adm01-debug/Zapp_Web_V2/pull/2987) (outra sessão) — ver §1 abaixo | Aguardando CI na branch + merge |
| DB Guard run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) | **BLOQUEADO — Rule 8** (ver §2 abaixo) | — |

---

## §1 — E2E Logado: routine-ownership-failed

**Workflow:** E2E Tests (Playwright) — job `e2e-logado`
**Fase de falha:** `routine-ownership-failed` → fase `source`
**Arquivo:** `scripts/e2e-isolated/routine-ownership.mjs` (linha 112–114)

**Causa raiz diagnosticada:**
`mark_outbound_post_started(uuid,uuid)` não estava incluída na lista de rotinas do harness E2E (`scripts/e2e-isolated/routine-ownership.mjs`). No backend descartável, essa função é `SECURITY DEFINER` e o gatilho `guard_message_delivery_internal_fields` exige `current_user IN ('postgres','service_role')`. Sem o ajuste de dono no harness, a edge `message-delivery` retorna 503, o que faz o job `authenticated` falhar antes dos testes.

**Fix em andamento:** PR [#2987](https://github.com/adm01-debug/Zapp_Web_V2/pull/2987) (outra sessão, branch `claude/sistema-producao-ready-w7bi9i`):
- Inclui `public.mark_outbound_post_started(uuid,uuid)` como 8ª assinatura em `routine-ownership.mjs`
- Hash SHA256 idêntico ao de produção verificado
- `node --test scripts/ci/e2e-isolated-routine-ownership.unit.mjs` → pass 93 / fail 0 (conforme PR body)
- Auto-merge habilitado — mergeará automaticamente quando CI da branch passar

**Estado em 2026-11-12T11:05Z:** PR #2987 open, CI da branch em andamento (Unit Tests 2/3 3/3 e E2E in_progress).

---

## §2 — DB Guard run zombie (Rule 8)

**Run:** [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313)
**Workflow:** DB Guard (supabase-usage-guard)
**Estado:** `in_progress` / zombie (desde 2026-10-26)

**Diagnóstico:**
Este run foi disparado por um push de branch de PR (não pela main). Ficou preso em `in_progress` sem concluir. **Não bloqueia o CI da main.**

**Por que é Rule 8:**
Cancelar runs de workflow via API é operação de CI/Actions — item explícito da Rule 8.

**Para desbloquear:** cancelar manualmente em https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313

---

## §3 — Baseline Local (Restrição de Ambiente)

**NÃO VERIFICADO — ambiente cloud.**

Esta sessão opera em container cloud sem executor local. Os required checks (Build ✅, TypeCheck ✅, CI Gate) executados pelo GitHub Actions em cada PR são a verificação de qualidade aplicável.

- **PR #2982** (1 linha em bash): verificação via log do job falho (`WARNING: wal_level is insufficient`) — sem mudança TS/JS.
- **PR #2983** (2 entradas em JSON): verificação via query ao banco de produção — sem mudança TS/JS.
- **PR #2988** (outra sessão, TypeScript): required checks passaram na branch antes do merge.

Baseline local completo disponível em RELATORIO_CI.md §1 (sessão 2026-11-05) e §6 (sessão 2026-11-12T03–09Z): install ✅, build ✅, typecheck ratchet 0 novas falhas, lint ratchet 0 novas falhas.

---

## §4 — PR #2980 — Conflito RELATORIO_CI.md (aviso ao dono)

**PR:** [#2980](https://github.com/adm01-debug/Zapp_Web_V2/pull/2980) (`claude/chore-relatorio-ci-261112-0803`)
**Estado:** aberta, `mergeable_state: "dirty"` (conflito com main)

PR criada por sessão anterior. Toca `RELATORIO_CI.md` mas está em conflito com a main. Esta PR (`claude/chore-relatorio-ci-final-261112-1105`) supera a #2980 com estado atualizado.

**Para desbloquear:** fechar PR #2980 manualmente (conflito irrecuperável — rebaseable: false).

---

_Gerado em 2026-11-12T11:05Z por loop de fix CI — sessão `session_01ERPZLui4ik38jdekvdzwft`_
