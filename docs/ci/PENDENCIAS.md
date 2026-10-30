# PENDÊNCIAS — Workflows Bloqueados por Regra 8

**Última atualização:** 2026-10-30T14:00Z  
**Branch de origem:** `claude/keen-galileo-dxai3p`  
**SHA main de referência:** `fec9d78ee8b7f05761f8e6178743907bb5d1b912` (main atual, 2026-10-30)

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

**Bloqueio Regra 8:** Altera `.github/workflows/deploy-functions.yml` — CI/workflow.

**Estado CI do PR #2371** (head `bfb45c59`, base `769b88f4`, confirmado 13:00Z):
- ✅ `🔎 TypeCheck` (success)
- ✅ `🔒 Security Audit` (success)
- ✅ `🧩 Node CI Scripts` (success)
- ✅ `Replay local das migrations` (success)
- ✅ `Contrato DB offline` (success)
- ✅ `🧬 Mutação do mapa` (success)
- ✅ `🧪 Unit Tests (1/3)` (success)
- ✅ `🧪 Unit Tests (2/3)` (success)
- ✅ `🧪 Unit Tests (3/3)` (success)
- ✅ `🎭 E2E Tests (Playwright)` (success)
- ✅ `🏗️ Build` (success)
- ✅ `✅ CI Gate (required check)` (success)

**12/12 checks verdes — CI totalmente verde.**

> **⛔ BLOQUEADO — REGRA 8:** Este PR altera `.github/workflows/deploy-functions.yml` (CI/workflow). Agente não pode mergear. Requer ação humana do Joaquim.

**O que o Joaquim precisa fazer:**  
1. Mergear (squash) — [PR #2371](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371)

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

**Bloqueio Regra 8:** Altera `.github/workflows/db-guard.yml` — CI/workflow.

**Impacto atual:** `db-guard.yml` em `main` está verde (push-to-main success). Este item é melhoria do check de PR não-required.

**Estado CI do PR #2377** (head `f58e15ec`, base `769b88f4`, confirmado 13:00Z):
- ✅ `Replay local das migrations` (success)
- ✅ `🧬 Mutação do mapa` (success)
- ✅ `🔎 TypeCheck` (success)
- ✅ `🧩 Node CI Scripts` (success)
- ✅ `🔒 Security Audit` (success)
- ✅ `🧪 Unit Tests (1/3)` (success)
- ✅ `🧪 Unit Tests (2/3)` (success)
- ✅ `🧪 Unit Tests (3/3)` (success)
- ✅ `🎭 E2E Tests (Playwright)` (success)
- ✅ `Contrato DB offline` (success)
- ✅ `🏗️ Build` (success)
- ✅ `✅ CI Gate (required check)` (success)

**12/12 checks verdes — CI totalmente verde.**

> **⛔ BLOQUEADO — REGRA 8:** Este PR altera `.github/workflows/db-guard.yml` (CI/workflow). Agente não pode mergear. Requer ação humana do Joaquim.

**O que o Joaquim precisa fazer:**  
1. Mergear (squash) — [PR #2377](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377)

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
