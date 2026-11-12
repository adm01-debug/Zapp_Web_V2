# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.  
> Atualizado em 2026-11-12 pela sessão `fix-ci-workflows-261112-0400`.
> Atualizar quando os bloqueios forem resolvidos.

---

## 1. Deploy Edge Functions — manifesto desatualizado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Última run com falha | [#41883030015 (commit `afd8c7ca`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) |
| Erro exato | `Deployment manifest is stale: supabase/deployment-manifest.json` |
| Causa | PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707) (`fix: cron do drain de ai_usage_outbox e comentario do CodeQL`) adicionou a edge function `ai-usage-outbox-drain` mas ainda não foi mergeada. O `generate-manifest.mjs` que atualiza `supabase/deployment-manifest.json` está dentro do próprio PR. |
| Por que não posso corrigir agora | PR #2707 toca `supabase/deployment-manifest.json` (conflito de arquivo — AGENTS.md regra 3) **e** contém migration DDL (`supabase/migrations/`) — requer aprovação do dono (AGENTS.md regra 8). |

### O que o dono precisa fazer

1. Revisar e mergear o PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707).
2. Após o merge, o `deploy-functions.yml` será disparado automaticamente pelo push na `main` e deverá passar (manifesto regenerado pelo próprio PR).
3. Se o deploy ainda falhar após o merge, dispatchar manualmente `deploy-functions.yml` via GitHub Actions.

---

## 2. DB Live Guard — drift de migrations em produção

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Última run com falha | [#42039646275 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) — verificado nesta sessão via dispatch |
| Issue de alerta | [#1965 — [db-live-guard] Contrato vivo do banco quebrado](https://github.com/adm01-debug/Zapp_Web_V2/issues/1965) (aberta desde 2026-10-16) |
| Passo que falha | `Comparar migrations com schema_migrations` |
| Causa raiz | Drift entre arquivos `.sql` em `supabase/migrations/` e registros em `schema_migrations` no banco de produção. |

**Detalhes do drift (medido em 2026-11-05 no commit `341d3fda`, 1082 arquivos × 1079 registros):**

| Versão | Arquivo | Situação |
|---|---|---|
| `20261026240300` | `20261026240300_drop_bkp_261023.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102012400` | `20261102012400_login_attempts_retencao_90d.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102032200` | `20261102032200_revoga_execute_public_cron_schedule.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102012200` | `20261102012200_department_invites_restringe_escrita.sql` | **Conteúdo SQL divergente** (arquivo ≠ ledger) |
| `20261103201500` | `20261103201500_remove_pagamentos_e_special_agent.sql` | **Conteúdo SQL divergente** (arquivo ≠ ledger) |

### Por que não posso corrigir agora

Envolve DDL em banco de produção (AGENTS.md regra 8) — requer aprovação explícita do dono. As 3 migrations pendentes precisam de apply; as 2 divergentes precisam de diagnóstico (banco ou arquivo está correto?) antes de qualquer ação.

### O que o dono precisa fazer

1. Para as 3 **sem registro**: verificar se o DDL é seguro aplicar hoje e, se sim, executar via `db_query` do MCP `SUPABASE - ZAPP WEB V2 - MCP` usando `node scripts/db-audit/register-migration.mjs <arquivo.sql>` para gerar o SQL exato, sempre com `RETURNING` não-vazio como guarda.
2. Para as 2 **divergentes**: comparar `pg_get_functiondef` / `pg_indexes` / `pg_constraint` no banco com o SQL do arquivo para decidir se o banco ou o arquivo é a fonte correta, e então ou aplicar a correção ou atualizar o arquivo. Referência: `docs/MIGRATIONS.md`.
3. Após resolver, dispatchar novamente `db-live-guard.yml` para confirmar verde.

---

## 3. E2E logado — job authenticated: routine-ownership-failed (sub-fase: scope)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run original | [#42039283192 (`341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Run mais recente analisada | [#43148791130 (`71123cc0`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43148791130) |
| Jobs com falha | `authenticated-1-of-3`, `authenticated-2-of-3`, `authenticated-3-of-3` |
| Jobs que passam | `deslogado-principal` ✅ · `deslogado-secundario` ✅ |
| Código JSON de saída | `{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed","native_e2e":false,"report_ready":true}` |
| Fase que falha | `restore-versioned-routine-owners` → `cleanup` em ~403ms |
| Artefatos diagnósticos | IDs 13913791221, 13913470743, 13913896170 (expiram 2026-11-15T03:48Z) |

### Análise de timing — sub-fase identificada: `scope`

Logs do job `authenticated-1-of-3` (run #43148791130, job ID 130952813356):
```
03:46:05Z [e2e-isolated] start-platform
03:46:05Z [e2e-isolated] apply-active-migrations   ← durou ~1m55s
03:48:01.3397161Z [e2e-isolated] restore-versioned-routine-owners
03:48:01.7426918Z [e2e-isolated] cleanup            ← 403ms depois
03:48:09Z {"code":"routine-ownership-failed","report_ready":true}
```

A função `restoreRoutineOwnership` (`scripts/e2e-isolated/routine-ownership.mjs:95`) executa 6 fases em sequência:

| Fase | I/O | Tempo típico | Compatível com 403ms? |
|---|---|---|---|
| `scope` | Nenhum (validação de parâmetros) | < 1ms | ✅ **Sim** |
| `source` | `git rev-parse HEAD` | ~50–200ms | ✅ Sim |
| `container` | `docker inspect` × 2 | 500ms–2s | ❌ Não |
| `volume` | `docker volume inspect` | 200ms–1s | ❌ Não |
| `namespace` | `docker exec readlink` | 200ms–1s | ❌ Não |
| `sql-process` | `docker exec psql` | 1–5s | ❌ Não |

**Conclusão: a falha ocorre na fase `scope` (mais provável) ou `source`. Fases com Docker estão descartadas pelo timing.**

### Condição da fase `scope` (linhas 100–103 de `routine-ownership.mjs`)

```javascript
if (scope !== 'suite' || !isAuthenticatedGroup(group) || !CID.test(anchorId) || !CID.test(databaseId)
    || anchorId === databaseId || !IMAGE.test(anchorImage) || !IMAGE.test(databaseImage)
    || volumeName !== runId + '-postgres' || !NET.test(networkNamespace)
    || !(allowedWritableSources instanceof Set) || typeof dockerConfig !== 'string'
    || !dockerConfig.startsWith('/')) reject();
```

Hipóteses (da mais provável para a menos):

| Check | Hipótese |
|---|---|
| `scope !== 'suite'` | A variável `scope` em `run.mjs:635` para grupos authenticated pode ser `'authenticated-suite'` em vez de `'suite'` |
| `anchorId === databaseId` | Grupos authenticated podem receber os mesmos container IDs para anchor e database |
| `volumeName !== runId + '-postgres'` | Volume criado com nome diferente quando há autenticação |

### `report_ready: true` — testes completaram; falha é no teardown

O campo `report_ready: true` no JSON confirma que a suíte Playwright **completou com sucesso** antes desta verificação. A falha é no **teardown** (`restore-versioned-routine-owners`), não nos testes. Confirmado pelo step 10 do CI: `"resumo público indisponível ou inválido; alerta sem detalhes privados"`.

### Por que `reason` não aparece nos logs do CI

`scripts/e2e-isolated/run.mjs:639` lança `Error('routine-ownership-failed')` **sem logar `routineOwnership.reason`** antes. O `reason` (ex: `scope-failed`) existe internamente em `routine-ownership.mjs:147` (`return { schema: 1, confirmed: false, reason: phase + '-failed' }`) mas nunca chega aos logs de CI.

### O que o dono precisa fazer

1. **Expor o `reason`** — adicionar em `run.mjs:639`:
   ```javascript
   if (!routineOwnership.confirmed) {
     console.error('[ownership] reason:', routineOwnership.reason);
     throw new Error('routine-ownership-failed');
   }
   ```
2. **Verificar `scope`** — no `run.mjs`, confirmar o valor da variável `scope` na chamada de `restoreRoutineOwnership` (~linha 635). Se for `'authenticated-suite'` em vez de `'suite'`, esse é o bug.
3. **Verificar `anchorId === databaseId`** — confirmar se grupos authenticated recebem os mesmos container IDs.
4. **Após corrigir** — re-executar `e2e-logado.yml` via `workflow_dispatch` na `main` e confirmar que os 3 grupos authenticated passam.

---

## 4. Branch Hygiene Audit — SLA de alertas de code scanning

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Run com falha | [#42062235088 (commit `d985c7fc`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) — 16:13:39Z–16:19:35Z |
| Passo que falha | Step 6 "SLA dos alertas de code scanning (W83)" — `conclusion=failure` |
| Causa raiz | Alertas de code scanning (CodeQL) em aberto há mais tempo do que o limite de SLA configurado (referência W83 do inventário de workflows). Condição **temporal e pré-existente** — o workflow era ✅ no baseline desta sessão (#41409678874) mas os alertas envelheceram desde então. **Não introduzida por esta sessão** (nenhuma alteração de código ou configuração de CodeQL foi feita). |
| Por que não posso corrigir agora | Fechar/dispensar alertas de code scanning é decisão de segurança do dono; corrigir o código apontado pelos alertas está fora do escopo desta sessão de CI. |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/security/code-scanning e revisar os alertas em aberto.
2. Para cada alerta: corrigir o código (PR de fix) ou dispensar com justificativa se for falso positivo.
3. Após fechar os alertas pendentes, dispatchar `branch-hygiene-audit.yml` para confirmar verde.
