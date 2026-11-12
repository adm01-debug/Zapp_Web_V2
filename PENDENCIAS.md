# PENDENCIAS DE CI

> Gerado em 2026-11-05 pela sessao `fix-ci-workflows-hxupgs`.
> Atualizado em 2026-11-12 pela sessao `fix-ci-workflows-261112-0400`.
> Atualizar quando os bloqueios forem resolvidos.

---

## RESOLVIDOS (antes em falha, agora verdes)

| Workflow | Ultimo run verde | Conclusao |
|---|---|---|
| Deploy Edge Functions | [#43143197204](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43143197204) (2026-11-12) | `success` |
| DB Live Guard | [#42678012070](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42678012070) (2026-11-09) | `success` |
| Branch Hygiene Audit | [#42582604190](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42582604190) (2026-11-09) | `success` |
| Front release targets V2/V3 | [#43163880482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43163880482) (2026-11-12) | `success` |

---

## 1. E2E logado - routine-ownership-failed (sub-fase: source)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run original | [#42039283192 (`341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Run mais recente analisada | [#43158859764 (`13a00e06`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43158859764) |
| Jobs com falha | `authenticated-1-of-3`, `authenticated-2-of-3`, `authenticated-3-of-3` |
| Jobs que passam | `deslogado-principal` OK, `deslogado-secundario` OK |
| Codigo JSON de saida | `{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed","native_e2e":false,"report_ready":true}` |
| Fase que falha | `restore-versioned-routine-owners` -> `cleanup` em ~403ms |

### Analise de timing - sub-fase identificada

Logs do job `authenticated-1-of-3` (run #43148791130, job ID 130952813356):
```
03:46:05Z [e2e-isolated] start-platform
03:46:05Z [e2e-isolated] apply-active-migrations   <- durou ~1m55s
03:48:01.3397161Z [e2e-isolated] restore-versioned-routine-owners
03:48:01.7426918Z [e2e-isolated] cleanup            <- 403ms depois
03:48:09Z {"code":"routine-ownership-failed","report_ready":true}
```

A funcao `restoreRoutineOwnership` (`scripts/e2e-isolated/routine-ownership.mjs:95`) executa 6 fases em sequencia:

| Fase | I/O | Tempo tipico | Compativel com 403ms? |
|---|---|---|---|
| `scope` | Nenhum (validacao de parametros) | < 1ms | Sim |
| `source` | `git rev-parse HEAD` | ~50-200ms | **Sim** |
| `container` | `docker inspect` x 2 | 500ms-2s | Nao |
| `volume` | `docker volume inspect` | 200ms-1s | Nao |
| `namespace` | `docker exec readlink` | 200ms-1s | Nao |
| `sql-process` | `docker exec psql` | 1-5s | Nao |

**Analise**: fase `scope` descartada — todas as 12 condicoes foram verificadas e nenhuma pode ser TRUE para grupos authenticated normais (scope='suite' sempre, CIDs validos, etc). **Causa suspeita: fase `source`** — `invoke('git', ['rev-parse', 'HEAD'])` retorna SHA diferente de `sourceSha` capturado em `run.mjs:445`.

### `report_ready: true` - testes completaram; falha e no teardown

O campo `report_ready: true` no JSON confirma que a suite Playwright **completou com sucesso** antes desta verificacao. A falha e no **teardown** (`restore-versioned-routine-owners`), nao nos testes.

### Correcao aplicada nesta sessao (2026-11-12)

`scripts/e2e-isolated/run.mjs:639-641` foi corrigido para logar `routineOwnership.reason` antes de lancar o erro:

```javascript
if (!routineOwnership.confirmed) {
  console.error('[ownership] reason:', routineOwnership.reason);
  throw new Error('routine-ownership-failed');
}
```

**Evidencia:** commitado em `5b796e70d` e pushado na branch `claude/fix-ci-workflows-261112-0400`.

### O que o dono precisa fazer

1. **Apos merge do PR #2975** - re-executar `e2e-logado.yml` via `workflow_dispatch` na `main`. Os logs mostrao `[ownership] reason: source-failed` confirmando a sub-fase. Verificar no `run.mjs` (~linha 445) se `sourceSha` e capturado corretamente ou se ha SHA mismatch entre o que foi commitado e o que `git rev-parse HEAD` retorna dentro da funcao.
2. **Apos corrigir a causa raiz** - re-executar `e2e-logado.yml` via `workflow_dispatch` na `main` e confirmar que os 3 grupos authenticated passam.

> **Bloqueio atual**: PR #2975 aguarda CI (quota esgotada — ver §4). Apos merge, re-executar para colher o log com `[ownership] reason`.

---

## 2. Types Sync - migration 20261111160000 nao aplicada no banco

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/types-sync.yml` |
| Run com falha mais recente | [#43164662755](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43164662755) (2026-11-12) |
| Erro exato | Gate 2 (usage-guard): 2 novas violacoes — RPCs chamadas no codigo nao existem no banco |
| Violacao 1 | `src/hooks/delivery/useUnconfirmedMessages.ts:57` chama `.rpc('resolve_unconfirmed_message')` |
| Violacao 2 | `supabase/functions/message-delivery/index.ts:711` chama `.rpc('mark_outbound_post_started')` |
| Causa raiz | `supabase/migrations/20261111160000_outbound_post_started.sql` esta na `main` mas **nao foi aplicada no banco de producao**. O banco saltou direto para `20261111181000_instance_pause_investigation.sql`. Verificado via query: `SELECT routine_name FROM information_schema.routines WHERE routine_name IN ('resolve_unconfirmed_message', 'mark_outbound_post_started')` retornou 0 linhas. |
| Por que nao posso corrigir | DDL em banco de producao — Rule 8. |

### O que o dono precisa fazer

1. Aplicar `supabase/migrations/20261111160000_outbound_post_started.sql` no banco de producao via o fluxo de banco (`docs/agentes/banco.md`).
2. Confirmar no banco: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('resolve_unconfirmed_message', 'mark_outbound_post_started');` deve retornar 2 linhas.
3. Redispatchar `types-sync.yml` via `workflow_dispatch` na `main` e confirmar `conclusion=success`.

---

## 3. Contexto para agentes de IA (10 min) - nenhum job iniciou

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/contexto.yml` |
| Run com falha | [#43095079516 (commit `f036006a`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43095079516) |
| Sintoma | `conclusion=failure`, `failed_jobs: []` — nenhum job iniciou |
| Causa raiz | Runner pool esgotado (quota GitHub Actions minutes do plano free: 2.000 min/mes). Os jobs ficaram `queued` sem runner disponivel e o workflow expirou ou foi forcado a falhar pela propria logica de timeout. |
| Por que nao posso corrigir | Envolve billing/quota de CI (AGENTS.md regra 8 — infra). |

### O que o dono precisa fazer

1. Resolver o bloqueio de runners (ver §4).
2. Apos runners disponiveis, o workflow sera disparado automaticamente a cada 10 min pelo schedule.

---

## 4. PR #2975 - required checks bloqueados por runner pool esgotado

| Campo | Valor |
|---|---|
| PR | [#2975](https://github.com/adm01-debug/Zapp_Web_V2/pull/2975) |
| Estado | OPEN, MERGEABLE, mergeStateStatus=BEHIND |
| HEAD | `e972e44a233d41e4f0f0ef761c62b18e5cc615ee` |
| CI Gate | `success` (verificado — apenas E2E ainda pendente) |
| Required checks bloqueados | `🎭 E2E Tests (Playwright)` e demais checks em fila |
| Causa raiz | Quota de GitHub Actions minutes esgotada (plano free: 2.000 min/mes). Os jobs ficam `queued` indefinidamente sem runner disponivel. |
| Por que nao posso corrigir | Envolve billing/quota de CI (AGENTS.md regra 8 — infra). |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/settings/billing (ou Settings > Billing and plans) e verificar o consumo de GitHub Actions minutes.
2. Comprar minutes adicionais ou aguardar o proximo ciclo de faturamento (reinicia no inicio do mes).
3. Apos runners disponiveis, o PR #2975 tera CI executado automaticamente. Se CI passar, mergear com squash.
4. Apos merge, confirmar que o deploy Vercel subiu e que PENDENCIAS.md e RELATORIO_CI.md estao na `main`.

---

## 5. DB Guard - run zombie incancelavel via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Branch | `claude_04/trusting-newton-duiglt` (pull_request event — NAO e run na main) |
| Em `in_progress` desde | 2026-10-26T22:15Z (run_attempt=14) |
| Comportamento da API | HTTP 409 em todos os cancelamentos via API REST |
| Impacto | Ocupa 1 slot de runner permanentemente; aparece na aba `is:failure` do GitHub |

**Nota**: este run nao e da branch `main` — e um run de pull_request em branch externa. Nao afeta o estado da main.

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313
2. Clicar em **"Cancel workflow"** na interface do GitHub.
