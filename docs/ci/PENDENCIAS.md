# PENDÊNCIAS — Workflows Bloqueados por Regra 8

**Última atualização:** 2026-10-30T15:30Z  
**Branch de origem:** `claude/keen-galileo-dxai3p`  
**SHA main de referência:** `769b88f4347d210d32dbb9999b52254ff6187a01` (PR #2378 mergeado em 12:43Z)

---

Estes workflows falharam no baseline e não puderam ser corrigidos por agente porque a correção envolve alteração de workflow CI, migration em produção ou aprovação de environment — todos enquadrados na Regra 8.

---

## 1. `deploy-functions` — `deno install` ausente antes do `deno check`

| Campo | Valor |
|---|---|
| Workflow | `Deploy Edge Functions (all)` |
| Último run com falha | [41025945945](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41025945945) (mais recente) |
| SHA | `15c43f46` (anterior: `3f4e16d2ae91e5dae76a3775049798460782cbf5`) |
| Job | `Deploy Edge Functions` (job 123948621262) |
| Step | 17 — `Typecheck das edge functions (deno check)` |

**Erro exato (log do step 17, 2026-10-30T07:39:29Z):**
```
error: Error: Could not find "@types/node" in a node_modules folder.
Deno expects the node_modules/ directory to be up to date.
Did you forget to run `deno install`?
    at Object.resolveTypeReferenceDirectiveReferences (ext:deno_cli_tsc/97_ts_host.js:517:26)
    at ext:deno_cli_tsc/97_ts_host.js:749:49
    at spanned (ext:deno_cli_tsc/97_ts_host.js:16:12)
    at Object.host.<computed> [as resolveTypeReferenceDirectiveReferences] (ext:deno_cli_tsc/97_ts_host.js:749:14)
    at resolveTypeReferenceDirectiveNamesWorker (ext:deno_cli_tsc/00_typescript.js:128306:20)
    at processTypeReferenceDirectives (ext:deno_cli_tsc/00_typescript.js:129685:156)
    at findSourceFileWorker (ext:deno_cli_tsc/00_typescript.js:129618:9)
```

**Causa raiz:**  
`@types/ws@8.18.1` contém `/// <reference types="node" />` internamente. Com `nodeModulesDir:"auto"` (PR #2368), o Deno 2.9.5 CONSULTA `node_modules/` durante `deno check` mas NÃO cria automaticamente o diretório — exige `deno install` explícito antes. O workflow não tem esse step.

**Fix preparado:** [PR #2371](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371)  
Branch: `claude/fix-deploy-functions-deno-install-261030-0840`  
Arquivo: `.github/workflows/deploy-functions.yml`  
Mudança: step `deno install --config supabase/functions/deno.json` inserido entre "Setup Deno" e "Typecheck das edge functions" no job `deploy`.

**Estado CI do PR #2371** (head `bfb45c59`, base `769b88f4`, reexecução iniciada 12:45Z):
- ✅ `🔒 Security Audit` (success)
- ✅ `🔎 TypeCheck` (success)
- ✅ `🧩 Node CI Scripts` (success)
- ✅ `Replay local das migrations` (success)
- ✅ `🧬 Mutação do mapa` (success)
- 🔄 `🧪 Unit Tests (1/3)` (in_progress)
- 🔄 `🧪 Unit Tests (2/3)` (in_progress)
- 🔄 `🧪 Unit Tests (3/3)` (in_progress)
- 🔄 `🎭 E2E Tests (Playwright)` (in_progress)
- 🔄 `Contrato DB offline` (in_progress)

> **⛔ BLOQUEADO — REGRA 8:** Este PR altera `.github/workflows/deploy-functions.yml` (CI/workflow). Agente não pode mergear. Requer ação humana do Joaquim.

**O que o Joaquim precisa fazer:**  
1. Aguardar CI verde (checks acima em andamento)
2. Mergear (squash) — [PR #2371](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371)

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

> **⛔ BLOQUEADO — REGRA 8:** Requer execução de `db-migrate.yml` (DDL em produção) e aprovação humana no environment `producao-ddl`. Agente não pode executar apply ou aprovar o environment gate.

**O que o Joaquim precisa fazer:**
1. Ir em Actions → `DB Migrate` → `Run workflow`
2. Parâmetros: `ref=main`, `apply=false` (primeiro, para dry-run)
3. Anotar o `confirm_runtime_sha256` do dry-run
4. Executar novamente com `apply=true` e o SHA do dry-run
5. Aprovar o passo no environment `producao-ddl`

---

## 3. `db-guard` (Replay local — ECR rate limit no PostgREST)

> **⚠️ ESCOPO CORRIGIDO (2026-10-30):** O ECR rate limit afeta SOMENTE runs acionados por PR (`pull_request` event), que incluem o job `Replay local das migrations`. Os runs **push-to-main** de `db-guard.yml` estão todos com `conclusion=success`:
> - [41036703908](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41036703908) SHA `2da8e5a4` — **success** (10:18:15Z)
> - [41025945999](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41025945999) — success
> - [41021181381](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41021181381) — success
> - [41017318010](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41017318010) — success
>
> O `db-guard.yml` em `main` está verde. O ECR issue é um check **não-required** em runs de PR. PR #2377 corrige esses runs de PR.

| Campo | Valor |
|---|---|
| Workflow | `Contrato DB (por PR)` — job `Replay local das migrations` |
| Event afetado | `pull_request` (check não-required) — **push-to-main está success** |
| Último run de PR com falha | [41021208458](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41021208458) job `Replay local` |
| Último run push-to-main | [41036703908](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41036703908) — **conclusion=success** |
| PR com fix | [#2377](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377) |
| Arquivo | `.github/workflows/db-guard.yml` |

**Erro exato (em runs de PR):**
```
toomanyrequests: Data limit exceeded. Please see https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html
```

**Causa raiz:**  
O step `Replay local das migrations` falha com HTTP 429 (rate limit) ao fazer `docker pull public.ecr.aws/supabase/postgrest:v14.5`. O ECR público da AWS impõe rate limit severo para pulls anônimos nos runners do GitHub. Afeta apenas o evento `pull_request`; o evento `push` para `main` não inclui o job `Replay local` com PostgREST e por isso não é afetado.

**Fix preparado:** [PR #2377](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377)  
Branch: `claude/fix-db-guard-ecr-261030-1040`  
Commit: `d3aa987a45ea915eed9b844051ccdfe045f58d68`  
Mudança em `.github/workflows/db-guard.yml` linha 68:
```diff
- POSTGREST_TEST_IMAGE: public.ecr.aws/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b
+ POSTGREST_TEST_IMAGE: ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b
```
O SHA digest `bb289d00...` é mantido idêntico — imagem idêntica, registro diferente. Compatível com `sha_pinning_required=true`.

**Estado CI do PR #2377** (head `f58e15ec`, base `769b88f4`, reexecução iniciada 12:45Z):
- ✅ `🔒 Security Audit` (success)
- ✅ `🔎 TypeCheck` (success)
- ✅ `🧩 Node CI Scripts` (success)
- ✅ `Replay local das migrations` (success)
- ✅ `🧬 Mutação do mapa` (success)
- 🔄 `🧪 Unit Tests (1/3)` (in_progress)
- 🔄 `🧪 Unit Tests (2/3)` (in_progress)
- 🔄 `🧪 Unit Tests (3/3)` (in_progress)
- 🔄 `🎭 E2E Tests (Playwright)` (in_progress)
- 🔄 `Contrato DB offline` (in_progress)

**Impacto atual:** `db-guard.yml` em `main` está verde (push-to-main success). Este item é melhoria do check de PR não-required.

> **⛔ BLOQUEADO — REGRA 8:** Este PR altera `.github/workflows/db-guard.yml` (CI/workflow). Agente não pode mergear. Requer ação humana do Joaquim.

**O que o Joaquim precisa fazer:**  
1. Aguardar CI verde (checks acima em andamento)
2. Mergear (squash) — [PR #2377](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377)

---

## 4. `db-migrate` — environment gate by design

| Campo | Valor |
|---|---|
| Workflow | `DB Migrate` |
| Motivo | Environment `producao-ddl` exige aprovação humana por design |

**Não é bug.** O workflow `db-migrate.yml` pausa em `Waiting` no environment `producao-ddl` antes de `apply=true`. Isso é o comportamento esperado de segurança para migrações DDL em produção. Nenhum agente pode obter `conclusion=success` sem intervenção do Joaquim.

> **⛔ BLOQUEADO — REGRA 8:** Environment gate `producao-ddl` exige aprovação humana por design. Nenhuma ação de agente resolve isso.

**Cobertura:** Item 2 acima — quando o Joaquim executar o `db-migrate.yml` para as migrations `20261030100000`/`20261030110000`, o `db-live-guard` voltará a verde.

---

## 5. `branch-hygiene-audit` — cancelamento consistente (timeout)

| Campo | Valor |
|---|---|
| Workflow | `Branch Hygiene Audit` |
| Runs analisados | 40289875804 (`cancelled`), 39220130783 (`cancelled`), 41024463986 (`cancelled`) |

**Situação confirmada:** O workflow cancela consistentemente em 3 runs consecutivos. O run [41024463986](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41024463986) despachado via `workflow_dispatch` em 2026-10-30T08:08Z também retornou `conclusion=cancelled` (completado às 08:20Z) — 12 minutos, excedendo o `timeout-minutes: 10` do workflow.

**Causa:** O script de auditoria de branches excede o tempo limite de 10 minutos do job.

> **⛔ BLOQUEADO — REGRA 8:** Corrigir exigiria aumentar `timeout-minutes` ou otimizar o script de auditoria — ambos alteram `.github/workflows/branch-hygiene-audit.yml` (CI/workflow). Agente não pode mergear esta alteração.

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
