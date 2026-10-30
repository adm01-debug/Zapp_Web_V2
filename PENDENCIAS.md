# Pendências de CI — bloqueios que exigem ação humana

> Gerado em 2026-10-30 pela sessão de correção de CI (`claude/keen-galileo-dxai3p`).
> Cada item indica o workflow, o erro exato e o que o Joaquim precisa fazer.

---

## ~~1. `types-sync` — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T01:45:45Z**

**Fix verificado:** A coluna `is_pinned` já existia no banco de produção.
`src/integrations/supabase/types.ts` na SHA `ca89064` confirma:
- Linha 2088: `is_pinned: boolean` (Row)
- Linha 2100: `is_pinned?: boolean` (Insert)
- Linha 2112: `is_pinned?: boolean` (Update)

**Evidência:** run `40986366321` (SHA `ca89064`) — `conclusion=success`, `updated_at=2026-10-30T01:45:45Z`.
`bunx tsc --noEmit` na SHA `ca89064` = **0 erros**.

Não requer mais ação.

---

## 2. `e2e-logado` — timeout na edge function `auth-login` / runs cancelados

**Workflow:** `.github/workflows/e2e-logado.yml`
**Último run na main:** `40965991521` (SHA `a1b27118`) — **cancelled**
**Run anterior com falha medida:** `40942681205`

```
Error: page.goto: net::ERR_ABORTED
  → POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auth-login
  → 504 Gateway Timeout (após 3 tentativas)
```

**Causa raiz:** A edge function `auth-login` não respondeu em tempo hábil
durante o run de CI — timeout de infraestrutura (Supabase Functions / cold
start sob carga). Não há código errado; é instabilidade pontual de infra.

**O que pode ser feito:**
- Monitorar: se o erro se repetir em mais de 2 runs consecutivos, investigar
  se houve mudança recente em `supabase/functions/auth-login/`.
- Verificar no dashboard Supabase se há erros persistentes em `auth-login`:
  https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/functions

**Ação imediata necessária:** nenhuma (falha pontual de infra / cancellamento externo). Reavaliar
se reaparecer.

---

## ~~3. `settings-guard` — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T01:42:39Z**

**Fix aplicado:** PR #2355 mergeado em SHA `ca89064b`.
**Evidência:** run `40986380985` (SHA `ca89064`) — `conclusion=success`, `updated_at=2026-10-30T01:42:39Z`.

Não requer mais ação.

---

## 4. `db-live-guard` — todos os 7 checks do contrato DB vivo falharam

**Workflow:** `.github/workflows/db-live-guard.yml`
**Último run na main:** `40282111471` (SHA `2d97c44c`, 2026-10-26 06:49 UTC) — **failure**
**Job:** `db-live-guard` — step 23 "Consolidar veredito do contrato vivo"
**Código de causa:** `c2908c3a1ea3a8199242ee74b66dee834b3cef41d4064424c0b83e72341df07e`

**Erro exato** (variável `FALHAS_LISTA` do step de consolidação, log do job `121437489432`):
```
Comparar migrations com schema_migrations
Verificar ACL e contrato de mcp_exec
Regenevar catalogo e comparar com o commitado
Regenevar manifesto e comparar com o commitado
Verificar frescor do types.ts
Paridade tripla (migrations, edges, grants)
Auditar configuracao runtime sem dados de clientes
```
**Todos os 7 passos falharam** — drift abrangente entre o banco de produção e o que está commitado.

**Causa raiz:** DDL aplicado diretamente via MCP sem arquivo correspondente em
`supabase/migrations/`, ou schema-manifest.json desatualizado. O `db-live-guard` compara
migrations vs ledger, regenera catálogo e manifesto e verifica paridade tripla — qualquer
divergência falha todos os passos dependentes.

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

**Ação imediata necessária:** verificar a issue de alerta gerada pelo `db-live-guard` no repo GitHub
e reconciliar as versions órfãs (relacionado também ao §6 — `db-migrate` bloqueado
por `remote_only_count=3`).

---

## 5. `deploy-functions` — diretório de evidência criado mas vazio

**Workflow:** `.github/workflows/deploy-functions.yml`
**Último run confirmado na main:** `40988248151` (SHA `ca89064`, 2026-10-30T01:51:01Z) — **failure**
**Step com falha:** "Validar gerador e manifesto de deployment" (step 9)
**Erro exato:**

```
evidencia publicavel pronta em /home/runner/work/_temp/edge-deployment-evidence-public
...
##[warning]No files were found with the provided path:
  /home/runner/work/_temp/edge-deployment-evidence-public/. No artifacts will be uploaded.
```

**Causa raiz:** O script `preparar-artifact-deploy.sh` cria o diretório
`edge-deployment-evidence-public/` (imprime "evidencia publicavel pronta em...") mas
não deposita nenhum arquivo dentro dele — o `upload-artifact` encontra o diretório vazio
e reporta warning. O script depende de um arquivo de atestação produzido pelo deploy, mas
o deploy da `ca89064` não tocou `supabase/functions/`, então não houve deploy real para
gerar o JSON de atestação.

**Falha pré-existente:** Confirmada desde SHA `c543c6a` (run `40744311421`, 2026-10-28).
O dispatch em `ca89064` (run `40988248151`) confirmou que o problema persiste na HEAD atual.

**O que precisa ser investigado:**
- Examinar `scripts/edge-deploy/preparar-artifact-deploy.sh`: por que o script imprime
  "evidencia publicavel pronta" mas deixa o diretório vazio? Verificar se o arquivo de
  atestação (`attestation.json`) é pré-requisito e quando/como é criado.
- Verificar se o step de deploy (anterior ao step 9) gerou o `attestation.json` esperado.
  O workflow só precisa de `attestation.json` quando há deploy real; quando `workflow_dispatch`
  é acionado sem push em `supabase/functions/`, o deploy pode não gerar atestação.

**Ação imediata necessária:** inspecionar `scripts/edge-deploy/preparar-artifact-deploy.sh`
para identificar por que o diretório fica vazio quando acionado via `workflow_dispatch`
sem deploy real.

---

## 6. `db-migrate` — bloqueio de segurança por drift no ledger (design intencional)

**Workflow:** `.github/workflows/db-migrate.yml`
**Último run na main:** `40236186538` (SHA `2d97c44c`, dispatch 2026-10-25) — **failure**
**Step com falha:** "Exigir alvo unico ou bundle atomico conhecido"
**Erro exato:**

```
O ledger remoto possui versions sem arquivo local; db push foi
bloqueado antes do CLI. remote_only_count=3
```

**Causa raiz:** NÃO é bug — é um bloqueio de segurança intencional. O workflow detectou que
3 versions no ledger de produção não têm arquivo correspondente em `supabase/migrations/` e
recusou aplicar a migration `20261015172527`. Isso é o comportamento correto documentado na
seção 1 do CLAUDE.md (regra 6).

**O que precisa ser feito (pelo Joaquim ou pelo agente após decisão):**
1. Identificar as 3 versions sem arquivo local:
   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations
   WHERE version NOT IN (SELECT regexp_replace(filename, '^(\d+).*', '\1')
                         FROM pg_ls_dir('supabase/migrations'))
   ORDER BY version;
   ```
   (ou comparar `ls supabase/migrations/*.sql` com `SELECT version FROM supabase_migrations.schema_migrations`)
2. Para cada version órfã: recriar o arquivo SQL com o DDL real (lido do banco via `pg_get_functiondef`,
   `pg_indexes`, etc.) e registrá-lo corretamente.
3. Após reconciliação, redisparar o `db-migrate` com `apply=false` para dry-run e confirmar hash.

**Ação imediata necessária:** identificar as 3 versions órfãs e reconciliar (tarefa de agente ou Joaquim).

---

## 7. `branch-hygiene-audit` — timeout recorrente (job ultrapassa 14h)

**Workflow:** `.github/workflows/branch-hygiene-audit.yml`
**Último run na main:** `40289875804` (SHA `2d97c44c`, 2026-10-26) — **cancelled** (após ~14h)
**Run anterior:** `39220130783` (2026-10-19) — também **cancelled**

**Causa raiz:** O job de auditoria de branches processa todas as branches do repositório e
ultrapassa o timeout de job do GitHub Actions (~6h padrão; o run acumulou ~14h antes do
cancelamento no attempt 2). Não há código errado — o repositório tem muitas branches.

**O que pode ser feito:**
- Adicionar `timeout-minutes` explícito ao job para evitar runs abertos por 14h.
- Considerar paginar ou limitar o número de branches processadas por run (ex.: processar apenas
  branches criadas ou atualizadas nas últimas N semanas).
- Ou aceitar o `cancelled` como estado esperado para esse workflow enquanto o repo tiver alto
  volume de branches.

**Ação imediata necessária:** nenhuma bloqueante (não afeta deploys nem o CI de PRs).
Avaliar se o timeout longo é aceitável ou se vale otimizar o script.

---

## 8. `db-guard` — fix ECR→ghcr.io bloqueado pela Regra 8 (PR #2354)

**Workflow:** `.github/workflows/db-guard.yml`
**Job afetado:** `Contrato DB offline`
**Última falha antes do fix:** run `40940891714` (SHA `a1b27118`, 2026-10-29)

**Erro exato:**
```
toomanyrequests: Data limit exceeded
```
O ECR público (`public.ecr.aws/supabase/postgrest:v14.5`) limita pulls anônimos
por IP em runners do GitHub. O job abortava antes de executar qualquer SQL.

**Fix pronto:** PR #2354 (https://github.com/adm01-debug/Zapp_Web_V2/pull/2354)
branch `claude/fix-db-guard-ecr-261029` — altera **somente a linha 68 de
`.github/workflows/db-guard.yml`**: prefixo `public.ecr.aws/supabase/` →
`ghcr.io/supabase/` (mesmo SHA digest
`sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b`).

**Por que está bloqueado:** A Regra 8 do fluxo Git proíbe o agente de mergear PRs
que tocam arquivos em `.github/workflows/`. O agente **não pode** mergear este PR
— deve deixá-lo aberto para o Joaquim.

**O que o Joaquim precisa fazer:**
1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/pull/2354
2. Verificar que os checks de CI estão verdes (o fix não toca código de aplicação)
3. Mergear o PR (squash-merge)

Após o merge, o `Contrato DB offline` voltará a executar corretamente em todos os PRs.

---

*Atualizado em 2026-10-30T01:53 UTC. §1 (types-sync) e §3 (settings-guard) RESOLVIDOS. §5 (deploy-functions): run `40988248151` na `ca89064` = failure confirmada — diretório criado mas vazio. Remover item ao concluir a ação correspondente.*
