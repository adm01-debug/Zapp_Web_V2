# PENDÊNCIAS — Workflows Bloqueados por Regra 8

**Última atualização:** 2026-10-30  
**Branch de origem:** `claude/keen-galileo-dxai3p`  
**SHA main de referência:** `2da8e5a415c975443ec149d820932c96ee20a897` (merge PR #2376)

---

Estes workflows falharam no baseline e não puderam ser corrigidos por agente porque a correção envolve alteração de workflow CI, migration em produção ou aprovação de environment — todos enquadrados na Regra 8.

---

## 1. `deploy-functions` — `deno install` ausente antes do `deno check`

| Campo | Valor |
|---|---|
| Workflow | `Deploy Edge Functions (all)` |
| Último run com falha | [41021181372](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41021181372) |
| SHA | `3f4e16d2ae91e5dae76a3775049798460782cbf5` |
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
Mudança: step `deno install --config supabase/functions/deno.json` inserido entre "Setup Deno" e "Typecheck das edge functions".

**Bloqueio Regra 8:** Altera `.github/workflows/deploy-functions.yml` — CI/workflow.

**O que o Joaquim precisa fazer:**  
1. Abrir [PR #2371](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371)  
2. Aguardar CI verde (6 required checks)  
3. Mergear (squash)

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

## 3. `db-guard` (Replay local — ECR rate limit)

| Campo | Valor |
|---|---|
| Workflow | `Contrato DB (por PR)` — job `Replay local das migrations` |
| PR aberta | [#2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) |
| Arquivo | `.github/workflows/db-guard.yml` |

**Causa raiz:**  
O step `docker pull public.ecr.aws/docker/library/postgres:17-alpine` falha com rate limit (429) no ECR público. Fix: trocar para `ghcr.io/adm01-debug/postgres:17-alpine` (sem rate limit).

**Bloqueio Regra 8:** Altera `.github/workflows/db-guard.yml` — CI/workflow.

**O que o Joaquim precisa fazer:**
1. Abrir [PR #2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354)  
2. Aguardar CI verde  
3. Mergear (squash)

---

## 4. `db-migrate` — environment gate by design

| Campo | Valor |
|---|---|
| Workflow | `DB Migrate` |
| Motivo | Environment `producao-ddl` exige aprovação humana por design |

**Não é bug.** O workflow `db-migrate.yml` pausa em `Waiting` no environment `producao-ddl` antes de `apply=true`. Isso é o comportamento esperado de segurança para migrações DDL em produção. Nenhum agente pode obter `conclusion=success` sem intervenção do Joaquim.

**Cobertura:** Item 2 acima — quando o Joaquim executar o `db-migrate.yml` para as migrations `20261030100000`/`20261030110000`, o `db-live-guard` voltará a verde.

---

## 5. `branch-hygiene-audit` — timeout/cancel

| Campo | Valor |
|---|---|
| Workflow | `Branch Hygiene Audit` |
| Últimos runs | 40289875804 (`cancelled`), 39220130783 (`cancelled`) |
| Run dispatch 2026-10-30 | [41024463986](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41024463986) |

**Situação:** O workflow já tem `timeout-minutes: 10`. Os runs anteriores foram `cancelled` (não `failure`). Um run foi disparado via `workflow_dispatch` às 08:08Z (2026-10-30) para verificar se conclui com `success`. Correção requer alteração de `.github/workflows/branch-hygiene-audit.yml` — Regra 8.

---

## Baseline local — limitação do ambiente remoto

| Comando | Resultado | Evidência substituta |
|---|---|---|
| `bun install` | ✅ success | — |
| `bun run typecheck` | ❌ SIGABRT | OS encerra por exceder limite de memória do executor cloud (~2 GB); CI job `🔍 Lint & TypeCheck` ✅ no SHA `3f4e16d2` |
| `bun run build` | ❌ SIGABRT | Mesma causa; CI job `🏗️ Build` ✅ no SHA `3f4e16d2` |
| `bun run lint` | via CI | `🔍 Lint & TypeCheck` ✅ |
| `bun test` (unit) | via CI | `🧪 Unit Tests` ✅ run [41008768305](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41008768305) |

Os 6 required checks de PR (`ci.yml`) permaneceram verdes durante toda a sessão. Nenhuma regressão foi introduzida.
