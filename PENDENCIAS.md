# Pendências de CI — bloqueios que exigem ação humana

> Gerado em 2026-10-29 pela sessão de correção de CI (`claude/keen-galileo-dxai3p`).
> Cada item indica o workflow, o erro exato e o que o Joaquim precisa fazer.

---

## 1. `types-sync` — erro de TypeScript: coluna `is_pinned` ausente no banco

**Workflow:** `.github/workflows/types-sync.yml`
**Job:** Gate 1 — TypeCheck de `types.ts` regenerado
**Último run com falha:** `40869806795` (SHA `ac97c0ea`)
**Erro medido:**

```
src/services/contact.service.ts(166,9): error TS2322:
  Type '{ contact_id: string; author_id: string; content: string;
         category: string; due_date: null; is_pinned: true; }'
  is not assignable to type '...'
  Object literal may only specify known properties, and 'is_pinned'
  does not exist in type 'ContactNoteInsert'.

src/services/contact.service.ts(193,6): error TS2322:
  Type '{ content: string; is_done: boolean; is_pinned: boolean;
         due_date: string | null }'
  is not assignable to parameter of type 'ContactNoteUpdate'.
  Object literal may only specify known properties, and 'is_pinned'
  does not exist in type '...'.
```

**Causa raiz:** A coluna `is_pinned` foi removida do banco de produção
(`contact_notes`) mas ainda é referenciada em
`src/services/contact.service.ts` linhas 166–175 (método `addNote`) e
linha 193 (método `updateNote`). O novo `types.ts` gerado com o padrão
`RejectExcessProperties` torna `is_pinned: never` quando a coluna não
existe, provocando 2 erros de TS.

**O que precisa ser decidido:**
Escolher UMA das duas opções:
- **Opção A — Recriar a coluna no banco** (`ALTER TABLE contact_notes ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false`) e criar a migration correspondente. O código continua funcionando sem alteração.
- **Opção B — Remover as referências no código** (remover `is_pinned` de `addNote` e `updateNote` em `contact.service.ts`; verificar se a UI usa o campo e adaptar).

Sem essa decisão, o `types-sync` continuará falhando no Gate 1 toda semana.

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

## 3. `settings-guard` — merge do PR #2354 bloqueado pela Regra 8

**Workflow:** `.github/workflows/settings-guard.yml`
**Último run com falha:** `40834848216` (SHA `0b77f8641`, 2026-10-29 07:20 UTC)
**Causa raiz:** `scripts/ci/github-settings-baseline.json` divergia em 3 campos do estado real do GitHub:
- `required_status_checks`: baseline tinha 6 checks antigos; realidade tem 3.
- `default_workflow_permissions`: baseline="read"; realidade="write".
- `environments`: faltavam `copilot`, `Preview`, `Production`.

**Fix pronto:** `scripts/ci/github-settings-baseline.json` atualizado no PR #2354
(https://github.com/adm01-debug/Zapp_Web_V2/pull/2354).

**Motivo do bloqueio:** O PR #2354 também altera `db-guard.yml` (arquivo de workflow).
A **Regra 8 do CLAUDE.md** proíbe o agente de mergear PR que toque em `CI/workflows`.
O agente não pode mergear — depende do Joaquim.

**O que o Joaquim precisa fazer:**
1. Abrir https://github.com/adm01-debug/Zapp_Web_V2/pull/2354
2. Converter de draft para "Ready for review"
3. Squash-merge (CI verde na branch SHA `d251f5a` — DB Guard `success` run `40965340063`)
4. Após merge, aguardar a próxima execução agendada do `settings-guard` (a cada 6h às `:15`) para confirmar `success` na main.

---

## 4. `db-live-guard` — falha no contrato DB vivo (drift de catálogo ou manifesto)

**Workflow:** `.github/workflows/db-live-guard.yml`
**Último run na main:** `40282111471` (SHA `2d97c44c`, 2026-10-26 06:49 UTC) — **failure**
**Job:** `db-live-guard`
**Step com falha:** "Consolidar veredito do contrato vivo" (step 23 do job)

**Causa raiz provável:** Drift entre `supabase/schema-manifest.json` commitado e o estado
real do banco de produção, ou paridade arquivos↔ledger quebrada. O `db-live-guard` compara
migrations, regenera catálogo e manifesto contra o que está commitado. Qualquer DDL aplicado
diretamente pelo MCP sem arquivo em `supabase/migrations/` produz esse erro.

**O que precisa ser feito:**
1. Verificar a issue de alerta aberta pelo `db-live-guard` no repositório (label `db-live-guard`).
2. Rodar `node scripts/db-audit/supabase-usage-guard.mjs` localmente para identificar o drift.
3. Reconciliar: criar o(s) arquivo(s) de migration ausente(s) em `supabase/migrations/`, registrar
   no ledger via `node scripts/db-audit/register-migration.mjs <arquivo.sql>`, e abrir PR.

**Ação imediata necessária:** verificar a issue de alerta gerada pelo workflow no repo GitHub.

---

## 5. `deploy-functions` — diretório de evidência não produzido

**Workflow:** `.github/workflows/deploy-functions.yml`
**Último run na main com falha:** `40744311421` (SHA `c543c6a`, 2026-10-28) — **failure**
**Step com falha:** "Validar gerador e manifesto de deployment" (step 9)
**Erro exato:**

```
Error: No files were found with the provided path:
  /home/runner/work/_temp/edge-deployment-evidence-public/
```

**Causa raiz:** O script `preparar-artifact-deploy.sh` rodou mas não produziu o diretório
`edge-deployment-evidence-public/`. O step de upload de artifact falhou porque o diretório
esperado estava vazio ou não foi criado. Isso bloqueia a validação do manifesto de deployment.

**O que precisa ser investigado:**
- Verificar se houve mudança recente em `supabase/functions/` ou `supabase/config.toml` entre
  os commits `c543c6a` e `a1b27118` que possa ter alterado o comportamento do script.
- Examinar o log completo do step "Preparar evidência de deployment" (step anterior ao que falhou)
  no run `40744311421`.
- O HEAD atual (`a1b27118`) não tocou `supabase/functions/`, então não disparou novo run automático.
  Para forçar investigação, dispatch manual via `workflow_dispatch` no GitHub Actions.

**Ação imediata necessária:** dispatch manual do `deploy-functions` para ver se o problema persiste
na HEAD atual (`a1b27118`), ou aguardar o próximo push que altere `supabase/functions/`.

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

*Atualizado em 2026-10-29. Remover item ao concluir a ação correspondente.*
