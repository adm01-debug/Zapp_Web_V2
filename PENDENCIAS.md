# PENDENCIAS DE CI

> Gerado em 2026-11-05 pela sessao `fix-ci-workflows-hxupgs`.
> Atualizado em 2026-11-12 pela sessao `fix-ci-workflows-261112-0400`.
> Atualizar quando os bloqueios forem resolvidos.

---

## 1. Deploy Edge Functions - manifesto desatualizado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Ultima run com falha | [#41883030015 (commit `afd8c7ca`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) |
| Erro exato | `Deployment manifest is stale: supabase/deployment-manifest.json` |
| Causa | PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707) adicionou `ai-usage-outbox-drain` mas ainda nao foi mergeada. O `generate-manifest.mjs` que atualiza `supabase/deployment-manifest.json` esta dentro do proprio PR. |
| Por que nao posso corrigir agora | PR #2707 contem migration DDL - requer aprovacao do dono (AGENTS.md regra 8). |

### O que o dono precisa fazer

1. Revisar e mergear o PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707).
2. Apos o merge, o `deploy-functions.yml` sera disparado automaticamente pelo push na `main` e devera passar.
3. Se o deploy ainda falhar apos o merge, dispatchar manualmente `deploy-functions.yml` via GitHub Actions.

---

## 2. DB Live Guard - drift de migrations em producao

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Ultima run com falha | [#42039646275 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) |
| Issue de alerta | [#1965](https://github.com/adm01-debug/Zapp_Web_V2/issues/1965) (aberta desde 2026-10-16) |
| Passo que falha | `Comparar migrations com schema_migrations` |
| Causa raiz | Drift entre arquivos `.sql` em `supabase/migrations/` e registros em `schema_migrations` no banco de producao. |

**Detalhes do drift (medido em 2026-11-05 no commit `341d3fda`, 1082 arquivos x 1079 registros):**

| Versao | Arquivo | Situacao |
|---|---|---|
| `20261026240300` | `20261026240300_drop_bkp_261023.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102012400` | `20261102012400_login_attempts_retencao_90d.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102032200` | `20261102032200_revoga_execute_public_cron_schedule.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102012200` | `20261102012200_department_invites_restringe_escrita.sql` | **Conteudo SQL divergente** (arquivo != ledger) |
| `20261103201500` | `20261103201500_remove_pagamentos_e_special_agent.sql` | **Conteudo SQL divergente** (arquivo != ledger) |

### Por que nao posso corrigir agora

Envolve DDL em banco de producao (AGENTS.md regra 8) - requer aprovacao explicita do dono. As 3 migrations pendentes precisam de apply; as 2 divergentes precisam de diagnostico antes de qualquer acao.

### O que o dono precisa fazer

1. Para as 3 **sem registro**: verificar se o DDL e seguro aplicar hoje e, se sim, executar via `db_query` do MCP `SUPABASE - ZAPP WEB V2 - MCP`.
2. Para as 2 **divergentes**: comparar `pg_get_functiondef` / `pg_indexes` / `pg_constraint` no banco com o SQL do arquivo para decidir se o banco ou o arquivo e a fonte correta. Referencia: `docs/MIGRATIONS.md`.
3. Apos resolver, dispatchar novamente `db-live-guard.yml` para confirmar verde.

---

## 3. E2E logado - job authenticated: routine-ownership-failed (sub-fase: scope)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run original | [#42039283192 (`341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Run mais recente analisada | [#43148791130 (`71123cc0`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43148791130) |
| Jobs com falha | `authenticated-1-of-3`, `authenticated-2-of-3`, `authenticated-3-of-3` |
| Jobs que passam | `deslogado-principal` OK, `deslogado-secundario` OK |
| Codigo JSON de saida | `{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed","native_e2e":false,"report_ready":true}` |
| Fase que falha | `restore-versioned-routine-owners` -> `cleanup` em ~403ms |

### Analise de timing - sub-fase identificada: `scope`

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
| `scope` | Nenhum (validacao de parametros) | < 1ms | **Sim** |
| `source` | `git rev-parse HEAD` | ~50-200ms | Sim |
| `container` | `docker inspect` x 2 | 500ms-2s | Nao |
| `volume` | `docker volume inspect` | 200ms-1s | Nao |
| `namespace` | `docker exec readlink` | 200ms-1s | Nao |
| `sql-process` | `docker exec psql` | 1-5s | Nao |

**Conclusao: a falha ocorre na fase `scope` (mais provavel) ou `source`. Fases com Docker estao descartadas pelo timing.**

### Condicao da fase `scope` (linhas 100-103 de `routine-ownership.mjs`)

```javascript
if (scope !== 'suite' || !isAuthenticatedGroup(group) || !CID.test(anchorId) || !CID.test(databaseId)
    || anchorId === databaseId || !IMAGE.test(anchorImage) || !IMAGE.test(databaseImage)
    || volumeName !== runId + '-postgres' || !NET.test(networkNamespace)
    || !(allowedWritableSources instanceof Set) || typeof dockerConfig !== 'string'
    || !dockerConfig.startsWith('/')) reject();
```

Hipoteses (da mais provavel para a menos):

| Check | Hipotese |
|---|---|
| `scope !== 'suite'` | A variavel `scope` em `run.mjs:635` para grupos authenticated pode ser `'authenticated-suite'` em vez de `'suite'` |
| `anchorId === databaseId` | Grupos authenticated podem receber os mesmos container IDs para anchor e database |
| `volumeName !== runId + '-postgres'` | Volume criado com nome diferente quando ha autenticacao |

### `report_ready: true` - testes completaram; falha e no teardown

O campo `report_ready: true` no JSON confirma que a suite Playwright **completou com sucesso** antes desta verificacao. A falha e no **teardown** (`restore-versioned-routine-owners`), nao nos testes.

### Por que `reason` nao aparece nos logs do CI

`scripts/e2e-isolated/run.mjs:639` lanca `Error('routine-ownership-failed')` **sem logar `routineOwnership.reason`** antes. O `reason` (ex: `scope-failed`) existe internamente em `routine-ownership.mjs:147` mas nunca chega aos logs de CI.

### O que o dono precisa fazer

1. **Expor o `reason`** - adicionar em `run.mjs:639`:
   ```javascript
   if (!routineOwnership.confirmed) {
     console.error('[ownership] reason:', routineOwnership.reason);
     throw new Error('routine-ownership-failed');
   }
   ```
2. **Verificar `scope`** - no `run.mjs`, confirmar o valor da variavel `scope` na chamada de `restoreRoutineOwnership` (~linha 635). Se for `'authenticated-suite'` em vez de `'suite'`, esse e o bug.
3. **Verificar `anchorId === databaseId`** - confirmar se grupos authenticated recebem os mesmos container IDs.
4. **Apos corrigir** - re-executar `e2e-logado.yml` via `workflow_dispatch` na `main` e confirmar que os 3 grupos authenticated passam.

---

## 4. Branch Hygiene Audit - SLA de alertas de code scanning

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Run com falha | [#42062235088 (commit `d985c7fc`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) |
| Passo que falha | Step 6 "SLA dos alertas de code scanning (W83)" |
| Causa raiz | Alertas de code scanning (CodeQL) em aberto ha mais tempo do que o limite de SLA configurado. Condicao **temporal e pre-existente** - nao introduzida por esta sessao. |
| Por que nao posso corrigir agora | Fechar/dispensar alertas de code scanning e decisao de seguranca do dono. |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/security/code-scanning e revisar os alertas em aberto.
2. Para cada alerta: corrigir o codigo (PR de fix) ou dispensar com justificativa se for falso positivo.
3. Apos fechar os alertas pendentes, dispatchar `branch-hygiene-audit.yml` para confirmar verde.

---

## 5. DB Guard - run zombie incancelavel via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Em `in_progress` desde | 2026-10-26T22:15Z (run_attempt=14) |
| Comportamento da API | HTTP 409 em todos os cancelamentos via API REST |
| Impacto | Ocupa 1 slot de runner permanentemente |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313
2. Clicar em **"Cancel workflow"** na interface do GitHub.

---

## 6. Types Sync - gate de usage-guard bloqueado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/types-sync.yml` |
| Run com falha | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) |
| Erro exato | `"A sincronizacao foi bloqueada por um ou mais gates."` |
| Causa raiz | Gate 2 (`usage-guard`) bloqueou a sincronizacao. Causa raiz: drift no banco (§2 acima). |
| Dependencia | Dependente da resolucao do §2 (DB Live Guard). |

### O que o dono precisa fazer

1. Resolver o §2 (aplicar as 5 migrations pendentes/divergentes no banco).
2. Apos o banco sincronizado, dispatchar `types-sync.yml` via `workflow_dispatch` na `main`.
3. Confirmar `conclusion=success`.

---

## 7. PR #2975 - required checks bloqueados por runner pool esgotado

| Campo | Valor |
|---|---|
| PR | [#2975](https://github.com/adm01-debug/Zapp_Web_V2/pull/2975) |
| Estado | OPEN, MERGEABLE, mergeStateStatus=BLOCKED |
| HEAD | `ed00ee85114be3b2c0c7ae8405c748f3124274de` |
| Required checks bloqueados | `🔎 TypeCheck`, `🏗️ Build`, `✅ CI Gate`, `🔒 Security Audit`, `🦕 Edge contracts`, `🛡️ Workflow lint`, `🎭 E2E Tests`, `🧩 Node CI Scripts`, `Replay local das migrations` |
| Status de todos os jobs | `queued` — nunca iniciados |
| Causa raiz | Quota de GitHub Actions minutes esgotada (plano free: 2.000 min/mês). Os jobs ficam `queued` indefinidamente sem runner disponivel. |
| Por que nao posso corrigir | Envolve billing/quota de CI (AGENTS.md regra 8 — infra). |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/settings/billing (ou Settings > Billing and plans) e verificar o consumo de GitHub Actions minutes.
2. Comprar minutes adicionais ou aguardar o proximo ciclo de faturamento (reinicia no inicio do mes).
3. Apos runners disponiveis, o PR #2975 tera CI executado automaticamente. Se CI passar, mergear com squash.
4. Apos merge, confirmar que o deploy Vercel subiu e que PENDENCIAS.md e RELATORIO_CI.md estao na `main`.
