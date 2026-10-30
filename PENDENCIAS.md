# Pendências de CI — bloqueios que exigem ação humana

> Gerado em 2026-10-30 pela sessão de correção de CI (`claude/keen-galileo-dxai3p`).
> Cada item indica o workflow, o erro exato e o que o Joaquim precisa fazer.

---

## ~~1. `types-sync` — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T01:45:45Z**

A coluna `is_pinned` já existia no banco de produção. `src/integrations/supabase/types.ts` na SHA `ca89064` confirma:
- Linha 2088: `is_pinned: boolean` (Row)
- Linha 2100: `is_pinned?: boolean` (Insert)
- Linha 2112: `is_pinned?: boolean` (Update)

**Evidência:** run [`40987628915`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40987628915) (SHA `ca89064`) — `conclusion=success`.
`bunx tsc --noEmit` na SHA `ca89064` = **0 erros**. Não requer mais ação.

---

## 2. `e2e-logado` — timeout na edge function `auth-login` / runs cancelados

**Workflow:** `.github/workflows/e2e-logado.yml`
**Último run na main:** [`40965991521`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40965991521) (SHA `a1b27118`) — **cancelled**

**Erro exato:**
```
Error: page.goto: net::ERR_ABORTED
  → POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auth-login
  → 504 Gateway Timeout (após 3 tentativas)
```

**Causa raiz:** A edge function `auth-login` não respondeu em tempo hábil — timeout de infraestrutura (Supabase Functions / cold start sob carga). Não há código errado; é instabilidade pontual de infra.

**Ação imediata necessária:** nenhuma (falha pontual de infra). Reavaliar se reaparecer em mais de 2 runs consecutivos.

---

## ~~3. `settings-guard` — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T01:42:39Z**

**Fix aplicado:** PR #2355 mergeado em SHA `ca89064b`.
**Evidência:** run [`40986380985`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40986380985) (SHA `ca89064`) — `conclusion=success`.

Não requer mais ação.

---

## 4. `db-live-guard` — todos os 7 checks do contrato DB vivo falharam

**Workflow:** `.github/workflows/db-live-guard.yml`
**Último run na main:** [`40282111471`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40282111471) (SHA `2d97c44c`, 2026-10-26) — **failure**
**Job:** `db-live-guard` (job ID `121437489432`) — step "Consolidar veredito do contrato vivo"

**Erro exato** (variáveis de saída do step de consolidação, lidas do log do job `121437489432`):
```
CAUSA: c2908c3a1ea3a8199242ee74b66dee834b3cef41d4064424c0b83e72341df07e

FALHAS_LISTA:
  Auditar configuracao runtime sem dados de clientes
  Comparar migrations com schema_migrations
  Paridade tripla (migrations, edges, grants)
  Regenerar catalogo e comparar com o commitado
  Regenerar manifesto e comparar com o committado
  Verificar ACL e contrato de mcp_exec
  Verificar frescor do types.ts

LOGS_FALHAS:
  {"nome":"Comparar migrations com schema_migrations","log":"/tmp/step-migrations.log"}
  {"nome":"Verificar ACL e contrato de mcp_exec","log":"/tmp/step-acl-mcp-exec.log"}
  {"nome":"Regenerar catalogo e comparar com o commitado","log":"/tmp/step-catalog.log"}
  {"nome":"Regenerar manifesto e comparar com o commitado","log":"/tmp/step-manifest.log"}
  {"nome":"Verificar frescor do types.ts","log":"/tmp/step-types.log"}
  {"nome":"Paridade tripla (migrations, edges, grants)","log":"/tmp/step-paridade.log"}
  {"nome":"Auditar configuracao runtime sem dados de clientes","log":"/tmp/step-runtime.log"}
```

**Todos os 7 passos falharam** — drift abrangente entre o banco de produção e o que está commitado.

**Causa raiz:** DDL aplicado diretamente via MCP sem arquivo correspondente em `supabase/migrations/`, ou `schema-manifest.json` desatualizado. O `db-live-guard` compara migrations vs ledger, regenera catálogo e manifesto e verifica paridade tripla — qualquer divergência falha todos os passos dependentes em cascata.

**O que precisa ser feito:**
1. Verificar a issue de alerta aberta pelo `db-live-guard` no repositório (label `db-live-guard`).
2. Identificar as versions órfãs no ledger:
   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;
   ```
   e comparar com `ls supabase/migrations/*.sql | xargs -I{} basename {} .sql | sort | tail -20`.
3. Para cada version sem arquivo local: criar o arquivo SQL com o DDL real do banco
   (`pg_get_functiondef`, `pg_indexes`, etc.) e registrar via
   `node scripts/db-audit/register-migration.mjs <arquivo.sql>`.
4. Abrir PR com os arquivos reconciliados.

**Relacionado:** `db-migrate` (§6) bloqueado por `remote_only_count=3` — mesma raiz.

---

## ~~5. `deploy-functions` — CORRIGIDO (aguardando run de confirmação)~~

**Status:** Fix aplicado — aguardando merge do PR e run de confirmação.

**Falha anterior (run `40988248151`, SHA `ca89064`, 2026-10-30T01:51:01Z):**
```
evidencia publicavel pronta em /home/runner/work/_temp/edge-deployment-evidence-public
...
##[warning]No files were found with the provided path:
  /home/runner/work/_temp/edge-deployment-evidence-public/. No artifacts will be uploaded.
```

**Causa raiz confirmada:** `scripts/edge-deploy/preparar-artifact-deploy.sh` criava o diretório `$DESTINO` mas não depositava nenhum arquivo quando acionado via `workflow_dispatch` sem push real em `supabase/functions/`. O passo `upload-artifact` encontrava o diretório vazio e falhava.

**Fix aplicado:** adicionado bloco no final do script — se `$DESTINO` estiver vazio após todas as cópias, grava `sem-deploy.json` como marcador. O bloco fica após o redator (que aborta com `exit 1` em caso de resíduo), preservando o contrato fail-closed do script.

---

## 6. `db-migrate` — bloqueio de segurança por drift no ledger (design intencional)

**Workflow:** `.github/workflows/db-migrate.yml`
**Último run na main:** [`40236186538`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40236186538) (SHA `2d97c44c`, dispatch 2026-10-25) — **failure**
**Step com falha:** "Exigir alvo unico ou bundle atomico conhecido"

**Erro exato:**
```
O ledger remoto possui versions sem arquivo local; db push foi
bloqueado antes do CLI. remote_only_count=3
```

**Causa raiz:** NÃO é bug — é um bloqueio de segurança intencional (CLAUDE.md seção 1, regra 6). O workflow detectou 3 versions no ledger de produção sem arquivo correspondente em `supabase/migrations/` e recusou prosseguir.

**O que precisa ser feito:**
1. Identificar as 3 versions órfãs:
   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;
   ```
   vs `ls supabase/migrations/*.sql | sort | tail -20`
2. Para cada version órfã: recriar o arquivo SQL com DDL real do banco e registrá-lo corretamente.
3. Após reconciliação, redisparar `db-migrate` com `apply=false` para dry-run.

---

## 7. `branch-hygiene-audit` — timeout recorrente (job ultrapassa 14h)

**Workflow:** `.github/workflows/branch-hygiene-audit.yml`
**Último run na main:** [`40289875804`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40289875804) (SHA `2d97c44c`, 2026-10-26) — **cancelled** (após ~14h)

**Causa raiz:** O job processa todas as branches do repositório e ultrapassa o timeout do GitHub Actions. Não há código errado — o repositório tem muitas branches.

**Ação imediata necessária:** nenhuma bloqueante (não afeta deploys nem o CI de PRs). Avaliar `timeout-minutes` explícito ou paginação limitada por data.

---

## 8. `db-guard` — fix ECR→ghcr.io bloqueado pela Regra 8 (PR #2354)

**Workflow:** `.github/workflows/db-guard.yml`
**Último run confirmado na main:** [`40965991318`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40965991318) (SHA `a1b27118`) — **success**

**Nota importante:** o run `40965991318` passou porque o ECR estava acessível naquele momento — **não** porque o fix já está na main. A linha 68 de `.github/workflows/db-guard.yml` na `main` ainda aponta para `public.ecr.aws/supabase/postgrest:v14.5`, sujeita a throttling anônimo.

**Erro que pode reaparecer:**
```
toomanyrequests: Data limit exceeded
```
O ECR público (`public.ecr.aws/supabase/postgrest:v14.5`) limita pulls anônimos por IP nos runners do GitHub.

**Fix pronto:** [PR #2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) — altera somente a linha 68: prefixo `public.ecr.aws/supabase/` → `ghcr.io/supabase/` (mesmo SHA digest `sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b`).

**Por que está bloqueado:** Regra 8 do fluxo Git proíbe o agente de mergear PRs que tocam arquivos em `.github/workflows/`.

**O que o Joaquim precisa fazer:**
1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/pull/2354
2. Verificar que os checks de CI estão verdes
3. Mergear o PR (squash-merge)

---

*Atualizado em 2026-10-30T02:15 UTC. §1 (types-sync) e §3 (settings-guard) RESOLVIDOS. §5 (deploy-functions): fix aplicado no script — aguardando run de confirmação após merge do PR.*
