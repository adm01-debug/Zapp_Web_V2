# PENDÊNCIAS — Workflows Bloqueados por Regra 8

**Última atualização:** 2026-10-30T16:00Z  
**Branch de origem:** `claude/keen-galileo-dxai3p`  
**SHA main de referência:** `3bdbdef2d5a44912021406efb009c1c8075664bf` (main atual, 2026-10-30)

---

Estes workflows falharam no baseline e não puderam ser corrigidos por agente porque a correção envolve alteração de workflow CI, migration em produção ou aprovação de environment — todos enquadrados na Regra 8.

---

## 1. `deploy-functions` — ✅ RESOLVIDO

**✅ RESOLVIDO em 2026-10-30** — PR [#2371](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371) mergeado por Joaquim.  
**Main SHA após merge:** `9f6199a1275a9789041b813c41cd92cc1b35e1f5`

**Causa raiz resolvida:** step `deno install --config supabase/functions/deno.json` inserido entre "Setup Deno" e "Typecheck das edge functions" em `.github/workflows/deploy-functions.yml`. O Deno 2.9.5 com `nodeModulesDir:"auto"` consulta `node_modules/` durante `deno check` mas não cria o diretório automaticamente — o `deno install` explícito é necessário.

---

## 2. `db-live-guard` — 2 migrations no repo sem apply em produção

| Campo | Valor |
|---|---|
| Workflow | `DB Live Guard` |
| Último run com falha | [41021208458](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41021208458) |
| SHA | `3f4e16d2ae91e5dae76a3775049798460782cbf5` |
| Job | `Contrato DB vivo` (job 123948710854) |
| Step | 23 — `Consolidar veredito do contrato vivo` |

**7 checks falhos (variável `FALHAS_LISTA` do log):**
```
Auditar configuracao runtime sem dados de clientes
Comparar migrations com schema_migrations
Paridade tripla (migrations, edges, grants)
Regerar catalogo e comparar com o commitado
Regerar manifesto e comparar com o commitado
Verificar ACL e contrato de mcp_exec
Verificar frescor do types.ts
```

**Causa raiz:**  
Migrations `20261030100000_copilot_sessions.sql` e `20261030110000_copilot_insights.sql` foram adicionadas ao repo pelo PR #2361 mas **nunca aplicadas em produção** via `db-migrate.yml`. O `db-live-guard` detecta a divergência repo↔ledger em produção e falha em todos os checks derivados.

Confirmado via `db_query` no projeto `tnnnlkbymytvtqngbbqh`:  
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version >= '20261030100000';
-- result: 0 rows
```

**Bloqueio Regra 8:** Requer execução de `db-migrate.yml` com `apply=true` e aprovação humana no environment `producao-ddl`.

**O que o Joaquim precisa fazer:**
1. Ir em Actions → `DB Migrate` → `Run workflow`
2. Parâmetros: `ref=main`, `apply=false` (primeiro, para dry-run)
3. Anotar o `confirm_runtime_sha256` do dry-run
4. Executar novamente com `apply=true` e o SHA do dry-run
5. Aprovar o passo no environment `producao-ddl`

---

## 3. `db-guard` (Replay local — ECR rate limit no PostgREST) — ✅ RESOLVIDO

**✅ RESOLVIDO em 2026-10-30** — PR [#2377](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377) mergeado por Joaquim.  
**Main SHA após merge:** `3bdbdef2d5a44912021406efb009c1c8075664bf`

**Causa raiz resolvida:** `POSTGREST_TEST_IMAGE` alterado de `public.ecr.aws/supabase/postgrest:v14.5` para `ghcr.io/supabase/postgrest:v14.5` (mesmo digest SHA `bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b`) em `.github/workflows/db-guard.yml` linha 68. Elimina o rate limit 429 do ECR público da AWS em runs de PR. Compatível com `sha_pinning_required=true`.

---

## 4. `db-migrate` — environment gate by design

| Campo | Valor |
|---|---|
| Workflow | `DB Migrate` |
| Motivo | Environment `producao-ddl` exige aprovação humana por design |

**Não é bug.** O workflow `db-migrate.yml` pausa em `Waiting` no environment `producao-ddl` antes de `apply=true`. Isso é o comportamento esperado de segurança para migrações DDL em produção. Nenhum agente pode obter `conclusion=success` sem intervenção do Joaquim.

**Cobertura:** Item 2 acima — quando o Joaquim executar o `db-migrate.yml` para as migrations `20261030100000`/`20261030110000`, o `db-live-guard` voltará a verde.

---

## 5. `branch-hygiene-audit` — cancelamento consistente (timeout)

| Campo | Valor |
|---|---|
| Workflow | `Branch Hygiene Audit` |
| Runs analisados | 40289875804 (`cancelled`), 39220130783 (`cancelled`), 41024463986 (`cancelled`) |

**Situação confirmada:** O workflow cancela consistentemente em 3 runs consecutivos. O run [41024463986](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41024463986) despachado via `workflow_dispatch` em 2026-10-30T08:08Z também retornou `conclusion=cancelled` (completado às 08:20Z) — 12 minutos, excedendo o `timeout-minutes: 10` do workflow.

**Causa:** O script de auditoria de branches excede o tempo limite de 10 minutos do job.

**Bloqueio Regra 8:** Corrigir exigiria aumentar `timeout-minutes` ou otimizar o script de auditoria — ambos alteram `.github/workflows/branch-hygiene-audit.yml` (CI/workflow).

---

## 6. `e2e-logado` — job "authenticated" cancelado por timeout

| Campo | Valor |
|---|---|
| Workflow | `E2E Tests (Logado)` |
| Arquivo | `.github/workflows/e2e-logado.yml` |
| Último run com falha | run na `main` SHA `769b88f4` (2026-10-30T12:44Z) |
| Job afetado | `e2e-logado / authenticated` |
| Conclusão | `cancelled` (step 11 rodou 12:44:50–12:59:07, ~14min17s) |

**Causa raiz (confirmada no próprio arquivo, comentário A05 em `.github/workflows/e2e-logado.yml`):**  
O job "authenticated" tem `timeout-minutes: 15`. O grupo tem 205 testes × ~9,8s/teste ÷ 4 workers ≈ **~14–15min** — consistentemente no limite. O `timeout-minutes: 15` é atingido antes de todos os testes concluírem.

```yaml
# A05: Com o pool padrão do CI (workers: 1 no playwright.config.ts) a suite roda ~9,8 s por teste,
# ou seja ~33 min -- muito acima dos 15 min do job, e é por isso que as runs logadas são canceladas
# desde 02/10. 4 é o número de vCPU do runner ubuntu-latest
```

**3 runs consecutivos cancelados na main:**
- SHA `769b88f4` (2026-10-30T12:44Z) — authenticated: cancelled
- SHA anterior — authenticated: cancelled  
- SHA anterior — authenticated: cancelled

**Fix necessário:** aumentar `timeout-minutes` de 15 para 20 (ou otimizar testes para caber em 15min).

> **⛔ BLOQUEADO — REGRA 8:** Fix requer alterar `timeout-minutes` em `.github/workflows/e2e-logado.yml` (CI/workflow). Agente não pode mergear esta alteração.

**O que o Joaquim precisa fazer:**  
1. Editar `.github/workflows/e2e-logado.yml`: alterar `timeout-minutes: 15` para `timeout-minutes: 20` no job do grupo `authenticated` (ou no nível do job da matrix)
2. Mergear via PR

---

## 7. `supabase-sync` — desarmado intencionalmente (secret inexistente)

| Campo | Valor |
|---|---|
| Workflow | `Supabase Sync (legacy import)` |
| Arquivo | `.github/workflows/supabase-sync.yml` |
| Último run na main | [33082545380](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/33082545380) — `conclusion=failure` (2026-08-27) |
| Environment | `legacy-import-destrutivo` |

**Situação (documentada no CLAUDE.md):**  
`supabase-sync.yml` está **deliberadamente desarmado**. O workflow exige, cumulativamente:
1. Aprovação no environment `legacy-import-destrutivo`
2. Secret `LEGACY_IMPORT_UNLOCK` igual ao project-ref — secret que **não existe** no repo

Logo todo dispatch falha fechado. O último run com `conclusion=failure` na main é de 2026-08-27 — mais de 2 meses sem disparar. Isso é comportamento intencional de segurança (import legado destrutivo bloqueado até reativação manual).

**Para reativar (só o Joaquim):**  
Gerar o export do banco oficial, criar o secret `LEGACY_IMPORT_UNLOCK`, remover o secret após o import.

> **⛔ BLOQUEADO — REGRA 8:** Requer criação de secret (`LEGACY_IMPORT_UNLOCK`) + execução de import destrutivo. Desarmado intencionalmente por design de segurança. Nenhuma ação de agente é cabível.

---

## Baseline local — limitação do ambiente remoto

| Comando | Resultado | Evidência substituta |
|---|---|---|
| `bun install` | ✅ success | — |
| `bun run typecheck` | ❌ SIGABRT | OS encerra por exceder limite de memória do executor cloud (~2 GB); CI job `🔍 Lint & TypeCheck` ✅ no SHA `3f4e16d2` |
| `bun run build` | ✅ success (16.56s) | Confirmado nesta sessão; CI job `🏗️ Build` ✅ no SHA `3f4e16d2` |
| `bun run lint` | ❌ exit 1 (814 erros — baseline pré-existente, `novas=0`) | `🔍 Lint & TypeCheck` ✅ via CI |
| `bun test` (unit) | via CI | `🧪 Unit Tests` ✅ run [41008768305](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41008768305) |

Os 6 required checks de PR (`ci.yml`) permaneceram verdes durante toda a sessão. Nenhuma regressão foi introduzida.
