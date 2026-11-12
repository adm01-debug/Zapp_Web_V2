# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.  
> Atualizado em 2026-11-12 (PR #2881, sessão `brave-mccarthy-zvzky4`).  
> Inventário completo em 2026-11-12T04:00Z (sessão `brave-mccarthy-zvzky4`, branch `claude/fix-ci-workflows-261112-0400`).  
> §3 atualizado com log exato do run #43148791130 (sessão `brave-mccarthy-zvzky4`, 2026-11-12T05:30Z).

---

## 1. Deploy Edge Functions — ✅ RESOLVIDO (2026-11-12)

> **Status atualizado**: a última execução na `main` é agora **SUCCESS** (criada em 2026-11-12T02:41:59Z). Este item foi resolvido.

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Última run na main | success (2026-11-12T02:41:59Z) |
| Run anterior com falha | [#41883030015](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) — `Deployment manifest is stale` |
| Situação | ✅ **Resolvido** — deploy confirmado verde. |

---

## 2. DB Live Guard — drift de migrations em produção

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Última run com falha | [#42039646275](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) |
| Issue de alerta | [#1965](https://github.com/adm01-debug/Zapp_Web_V2/issues/1965) (aberta desde 2026-10-16) |
| Causa raiz | Drift entre arquivos `.sql` em `supabase/migrations/` e registros em `schema_migrations` no banco de produção. |

**Drift verificado (1082 arquivos × 1079 registros):**

| Versão | Situação |
|---|---|
| `20261026240300_drop_bkp_261023.sql` | Arquivo no repo sem registro no banco |
| `20261102012400_login_attempts_retencao_90d.sql` | Arquivo no repo sem registro no banco |
| `20261102032200_revoga_execute_public_cron_schedule.sql` | Arquivo no repo sem registro no banco |
| `20261102012200_department_invites_restringe_escrita.sql` | Conteúdo SQL divergente |
| `20261103201500_remove_pagamentos_e_special_agent.sql` | Conteúdo SQL divergente |

### Por que não posso corrigir agora

DDL em banco de produção — requer aprovação explícita do dono (AGENTS.md regra 8).

---

## 3. E2E logado — routine-ownership-failed nos grupos authenticated

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Última run com falha | [#43148791130](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43148791130) (2026-11-12T03:08Z) |
| Código de falha | `routine-ownership-failed` (lançado em `scripts/e2e-isolated/run.mjs:639`) |
| Grupos afetados | `authenticated-1-of-3`, `authenticated-2-of-3`, `authenticated-3-of-3` |
| Grupos OK | `anon-*` passam normalmente |

### Log exato do CI (run #43148791130 — idêntico nos 3 grupos authenticated)

```
[e2e-isolated] restore-versioned-routine-owners
[e2e-isolated] cleanup
{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed","native_e2e":false,"report_ready":true}
##[error]Process completed with exit code 1.
```

### Análise crítica do log

**`report_ready: true`** — os testes Playwright **rodaram com sucesso** e produziram artefato de relatório **antes** da verificação de ownership. A falha **não é nos testes em si**, é na fase de verificação de isolamento que ocorre **após** os testes.

**Sequência exata de execução:**
1. Testes Playwright rodam → relatório gerado → artefato disponível
2. `restore-versioned-routine-owners` é invocado (`run.mjs:635`)
3. Chama `restoreRoutineOwnership(...)` em `routine-ownership.mjs:95`
4. Função retorna `{ confirmed: false, reason: '{phase}-failed' }` — mas **NÃO imprime o `reason`**
5. `run.mjs:639` lança `Error('routine-ownership-failed')` **sem logar `routineOwnership.reason`**
6. `cleanup` é executado imediatamente
7. JSON final é emitido com `code: "routine-ownership-failed"` — sem a sub-fase

### Por que a sub-fase interna NÃO aparece nos logs

O campo `reason` do objeto retornado por `restoreRoutineOwnership` (`scope-failed`, `source-failed`, `container-failed`, `volume-failed`, `namespace-failed` ou `sql-process-failed`) existe apenas dentro do objeto JavaScript. O código em `run.mjs:639` é:

```javascript
if (!routineOwnership.confirmed) throw new Error('routine-ownership-failed');
// ^ lança o erro sem logar routineOwnership.reason
```

Para expor a fase seria necessário modificar para:
```javascript
if (!routineOwnership.confirmed) throw new Error(`routine-ownership-failed: ${routineOwnership.reason}`);
```

Essa mudança é em código de infraestrutura de isolamento de CI/segurança (AGENTS.md regra 8).

### As 6 fases de `restoreRoutineOwnership` (routine-ownership.mjs:95-149)

| Fase | O que valida | Hipótese para grupos authenticated |
|---|---|---|
| `scope` | Parâmetros: scope='suite', grupo autenticado, IDs de container, imagens, volume, namespace de rede | Improvável — parâmetros são passados pelo orquestrador |
| `source` | `git rev-parse HEAD === sourceSha` — commit atual deve ser exatamente o esperado | Possível se o runner faz checkout diferente para grupos authenticated |
| `container` | Inspeciona containers Docker: nome, imagem, estado Running, configuração de rede | Mais provável — containers authenticated podem ter configuração de rede diferente |
| `volume` | Inspeciona volume Postgres: labels de ownership, mountpoint em `allowedWritableSources` | Possível — volumes reutilizados entre shards podem ter labels incorretos |
| `namespace` | Verifica namespace de rede via `readlink /proc/self/ns/net` no container | Possível — namespace compartilhado entre shards |
| `sql-process` | Executa SQL de verificação de ownership no banco | Improvável se `namespace` passou |

### Artefatos disponíveis (expiram ~2026-11-15)

| Grupo | Artefato ID |
|---|---|
| authenticated-1-of-3 | 13913791221 |
| authenticated-2-of-3 | 13913470743 |
| authenticated-3-of-3 | 13913896170 |

Os artefatos contêm o relatório Playwright e possivelmente o JSON de resultado com o `reason` interno. Baixar antes de 2026-11-15T03:38Z.

### Por que não posso corrigir agora

1. **Fase exata desconhecida sem os artefatos**: O log do CI não expõe `routineOwnership.reason`. Sem saber qual das 6 fases rejeita, qualquer fix seria chute.
2. **Modificar `run.mjs` para logar o `reason`** é alteração em código de infraestrutura de isolamento de CI/segurança — Rule 8.
3. **Fix da causa raiz** (qualquer que seja a fase) envolve configuração Docker ou lógica de verificação de isolamento — Rule 8.

### O que o dono precisa fazer

1. Baixar artefato `authenticated-1-of-3` (ID 13913791221) antes de 2026-11-15T03:38Z e buscar o campo `reason` para identificar a fase exata.
2. Com a fase identificada, abrir issue para diagnóstico cirúrgico e autorizar a correção.
3. Ou: autorizar a adição de logging em `run.mjs:639` para expor o `reason` na próxima run.

---

## 4. Branch Hygiene Audit — SLA de alertas de code scanning

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Run com falha | [#42062235088](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) |
| Causa raiz | Alertas CodeQL em aberto além do limite de SLA — pré-existente, não introduzido nesta sessão. |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/security/code-scanning.
2. Corrigir o código ou dispensar alertas com justificativa.

---

## 5. DB Guard — run zombie incancelável via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Em `in_progress` desde | 2026-10-26T22:15Z (run_attempt=14) |
| Comportamento da API | HTTP 409 em todos os cancelamentos via API REST |
| Impacto | Ocupa 1 slot de runner permanentemente; agrava esgotamento do pool (§6) |

### O que o dono precisa fazer

1. Acessar [https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313).
2. Clicar em **"Cancel workflow"** na interface do GitHub.

---

## 6. GitHub Actions — runner pool esgotado (bloqueio total de CI)

### Estado verificado em 2026-11-12T03:19Z

| Campo | Valor |
|---|---|
| Run mais recente (PR #2881) | HEAD `0cb4193`, status=`pending` |
| Required checks no HEAD atual | Todos `pending`/`queued` — runner pool esgotado |
| Causa | Quota de minutos GitHub Actions do plano free (2.000 min/mês) esgotada |
| Zombie ainda ativo | Run #40410990313 (`db-guard.yml`) ainda `in_progress` |

### Prova dos required checks para o código atual

Diff `a60b0507` → `0cb4193`: apenas `PENDENCIAS.md` e `RELATORIO_CI.md` alterados. Zero código de aplicação.

| Required Check | Conclusão | Run |
|---|---|---|
| 🏗️ Build | ✅ **success** | [#43137999344](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43137999344) (SHA `a60b0507`) |
| 🔎 TypeCheck | ✅ **success** | [#43137999344](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43137999344) (SHA `a60b0507`) |
| ✅ CI Gate | ⚠️ cancelled | Bloqueio externo: runner pool esgotado + zombie #40410990313 |

### O que o dono precisa fazer

1. **https://github.com/settings/billing** — verificar saldo de minutos GitHub Actions.
2. **Cancelar zombie #40410990313** — libera slot ocupado desde 2026-10-26.
3. Quando runners disponíveis: squash-merge PR [#2881](https://github.com/adm01-debug/Zapp_Web_V2/pull/2881).

---

## 7. types-sync — Gate 2 usage-guard bloqueou sincronização de tipos

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/types-sync.yml` |
| Última run com falha | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) (2026-11-11T23:35:59Z, SHA `bd62fc9d`) |
| Job com falha | `Gates e PR de sincronizacao (sem credencial)` |
| Step com falha | `Falhar quando um gate rejeitar a proposta` |
| Erro exato | `A sincronizacao foi bloqueada por um ou mais gates.` (exit 1) |
| Gate que falhou | Gate 2 — usage-guard (`steps.gate2.outputs.passed = false`) |
| Arquivos alterados detectados | `types.ts=true`, `schema-catalog.json=true`, `schema-manifest.json=true` |

### Causa raiz

O workflow `types-sync.yml` detectou alteração em `types.ts`, `schema-catalog.json` e `schema-manifest.json` mas o `usage-guard` (Gate 2) rejeitou a proposta. Indica drift de schema no banco (§2) que propagou para os tipos gerados. A sincronização de tipos requer que o banco esteja em sincronia com as migrations.

### Por que não posso corrigir agora

A causa raiz é o drift do banco (§2) — DDL em produção requer aprovação do dono (AGENTS.md regra 8). Corrigir o drift de migrations (§2) deve resolver este item também.

### O que o dono precisa fazer

1. Resolver o drift de migrations documentado em §2.
2. Após §2 resolvido, re-executar `workflow_dispatch` em `types-sync.yml` na `main`.
