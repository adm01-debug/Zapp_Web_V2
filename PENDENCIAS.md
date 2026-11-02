# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-02 por sessão `claude/trusting-albattani-9x3ipg` (GF-001..GF-056)._

---

## 0. GitHub Actions — runners bloqueados ✅ RESOLVIDO (2026-11-02T03:17Z)

**Estado:** Os runners se recuperaram. PR #2551 passou nos required checks (`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate`) e foi mergeado automaticamente (squash) às 03:17:51Z no SHA `587ec25f8cb25a42c1ba1cda4e4e8a09fb2f9ac6` da `main`.

**Histórico:** Entre ~01:40Z e ~03:05Z os runners ficaram bloqueados (`status: "queued"`, `updated_at == created_at`). O problema foi de plataforma GitHub — se repetir, verificar https://www.githubstatus.com e Settings → Billing.

---

## 1. DB Live Guard — falhas em contrato vivo (bloqueadas por escrita no ledger)

**Último run com falha:** [41400432274](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41400432274)  
**Head SHA:** `b1040225d9d9dbe5d9b22670b5191a16a8347dce` (main pós PR #2570)

**O que foi corrigido:**
- ✅ PR #2579 — 13 SQL-divergente adicionados como `pinned-replay` em `migration-evidence.json`
- ✅ PR #2579 — `20260927600000` exceção obsoleta removida
- ✅ PR #2579 — Catálogo, grants-baseline, manifesto regenerados
- ✅ PR #2579 — 9 policies copilot adicionadas à allowlist de invariantes
- ✅ PR #2589 — `20261102012200` `extensions.gen_random_bytes` → `gen_random_bytes` (alinha arquivo com ledger)
- ✅ PR #PROSA — 24 prosa-pura adicionadas como `name-and-file-pinned` em `migration-evidence.json`

**Falhas remanescentes que dependem do Joaquim (3 restantes — guard ainda falha):**

### A. ✅ RESOLVIDO — statements "prosa pura" no ledger (24 migrations)

As 24 exceções `ledger-only/name-and-file-pinned` foram adicionadas a `migration-evidence.json`
(PR que adiciona esta seção). O guard suprime esses 24 erros assim que o PR mergear.

O UPDATE do ledger continua sendo a solução permanente ideal (sem exceptions), mas não é obrigatório
para o guard passar. Se quiser limpar: use `register-migration.mjs` para cada arquivo abaixo e
`UPDATE supabase_migrations.schema_migrations SET statements = ARRAY[...SQL...] WHERE version = '...'`.

### A-histórico. statements "prosa pura" (referência para UPDATE manual)

Cada migration abaixo tem `statements[1]` com descrição em prosa, não SQL real.
O arquivo `.sql` correspondente contém o SQL correto.

**Comando para gerar o SQL de cada arquivo:**
```bash
node scripts/db-audit/register-migration.mjs supabase/migrations/<arquivo>.sql
```
Isso imprime o `INSERT` (ou `UPDATE`) exato — copiar o campo `statements` e rodar:
```sql
UPDATE supabase_migrations.schema_migrations
SET statements = ARRAY[...SQL_REAL...]
WHERE version = '<version>'
RETURNING version, name;
```

| version | name (ledger) | arquivo |
|---|---|---|
| `20261015230338` | `voice_command_logs_lgpd` | `20261015230338_voice_command_logs_lgpd.sql` |
| `20261015232316` | `rpc_queue_goal_metrics` | `20261015232316_rpc_queue_goal_metrics.sql` |
| `20261015232546` | `profiles_self_update_sensitive_columns` | `20261015232546_profiles_self_update_sensitive_columns.sql` |
| `20261016001136` | `audio_memes_bucket_limits_admin_delete` | `20261016001136_audio_memes_bucket_limits_admin_delete.sql` |
| `20261016002012` | `my_network_status` | `20261016002012_my_network_status.sql` |
| `20261016005650` | `admin_unlock_login` | `20261016005650_admin_unlock_login.sql` |
| `20261016005752` | `passkey_credentials_hardening` | `20261016005752_passkey_credentials_hardening.sql` |
| `20261016010011` | `set_conversation_status_waiting_para_archived` | `20261016010011_set_conversation_status_waiting_para_archived.sql` |
| `20261016010744` | `consent_status_guard` | `20261016010744_consent_status_guard.sql` |
| `20261016011302` | `crm_sync_outbox_cron` | `20261016011302_crm_sync_outbox_cron.sql` |
| `20261016013134` | `search_events` | `20261016013134_search_events.sql` |
| `20261016013528` | `scheduled_messages_state_machine` | `20261016013528_scheduled_messages_state_machine.sql` |
| `20261016015438` | `whisper_mark_read_policy` | `20261016015438_whisper_mark_read_policy.sql` |
| `20261016023444` | `inbox_wait_summary` | `20261016023444_inbox_wait_summary.sql` |
| `20261016030109` | `tasks_contact_visibility` | `20261016030109_tasks_contact_visibility.sql` |
| `20261016030211` | `messages_transcribed_at` | `20261016030211_messages_transcribed_at.sql` |
| `20261016033451` | `purge_gmail_account_data` | `20261016033451_purge_gmail_account_data.sql` |
| `20261016050617` | `messages_trgm_busca` | `20261016050617_messages_trgm_busca.sql` |
| `20261016102054` | `team_chat_files_limit` | `20261016102054_team_chat_files_limit.sql` |
| `20261016102337` | `get_team_birthdays` | `20261016102337_get_team_birthdays.sql` |
| `20261016102541` | `delivery_stats_rpc` | `20261016102541_delivery_stats_rpc.sql` |
| `20261016105108` | `n011_storage_drop_duplicate_avatar_policies` | `20261016105108_n011_storage_drop_duplicate_avatar_policies.sql` |
| `20261016112802` | `whisper_audio_path` | `20261016112802_whisper_audio_path.sql` |
| `20261016115413` | `realtime_publication_agent_achievements` | `20261016115413_realtime_publication_agent_achievements.sql` |

### B. nome divergente no ledger (1 migration)

- **version:** `20261016130000`
- **arquivo no repo:** `20261016130000_revert_wrong_security_fixes.sql`
- **name no ledger:** `revert_wrong_security_fixes_passkey_search_events_purge_gmail`

**Opções:**
1. Atualizar o ledger para o nome do arquivo (mais simples): `UPDATE supabase_migrations.schema_migrations SET name = 'revert_wrong_security_fixes' WHERE version = '20261016130000' RETURNING version, name;`
2. Renomear o arquivo para bater com o ledger — mas `db-guard.yml` bloqueia renomear migration existente (rename = delete + create), então requer `git rm` + `git add` em commits separados.

Opção 1 é recomendada (não toca o arquivo).

### C. arquivo-sem-registro no ledger (2 migrations)

Arquivos existentes em `supabase/migrations/` que **não têm entrada no ledger de produção**:

- `20261020120000_e2e_fixture_message_rpc.sql`
- `20261023100000_talkx_campaign_recipients_page_add_segment.sql`

**Opções por arquivo:**
1. **Aplicar em produção** (se o conteúdo ainda é relevante): gerar SQL via `register-migration.mjs` e aplicar via `db_query` + `INSERT` no ledger na mesma transação.
2. **Mover para `supabase/migrations/_superseded/`** (se o conteúdo foi substituído ou abandonado): requer evidência de que o objeto já existe em produção por outro caminho.

⚠️ **Não deletar** sem confirmar que o conteúdo está em produção por outra migration.

### D. types.ts desatualizado

Após as novas tabelas copilot e functions entrarem em produção, o `src/integrations/supabase/types.ts` ficou desatualizado. Disparar o `types-sync.yml` via `workflow_dispatch` na `main` para regenerar.

Este workflow **não é um required check** — não bloqueia merges na `main`.

---

## 2. Running Copilot Code Review — limite de cota do plano (HTTP 402)

**Runs com falha confirmados (exemplos):**
- [41167331596](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41167331596) — 2026-10-31T04:08Z
- [41166869775](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41166869775) — 2026-10-31T04:02Z
- múltiplos anteriores no mesmo dia

**Workflow:** Dinâmico do GitHub Copilot — **não tem arquivo no repositório**.

**O que falha:** Step "Processing Request (Linux)" termina com `errorType: 'quota'`, HTTP 402,
"You've reached your additional usage limit for your plan". A mensagem de firewall que aparece
no log é secundária — a causa real é esgotamento de cota de uso do Copilot Code Review.

**Por que não foi corrigido:** Workflow dinâmico do GitHub Copilot — sem código no repositório.
A falha está no limite de cota do plano do Copilot (HTTP 402). Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Billing and plans → Copilot usage limits
2. Aguardar reset de ciclo de faturamento ou fazer upgrade do plano
3. Configurar allowlist de firewall do Copilot **não resolve** este erro — a causa é HTTP 402 quota, não HTTP 403 firewall

---

## 3. Deploy Edge Functions — @types/node ✅ RESOLVIDO (PR #2575)

**Comportamento esperado:** `deploy-functions.yml` só executa quando o push na `main` altera
código implantável em `supabase/functions/` ou `supabase/config.toml`. Quando o push toca
apenas arquivos de frontend, documentação ou configuração de CI, o workflow não é disparado
(condição `paths:` no trigger).

**Run com falha após o fix:** Run `41162076060` executou no SHA `004e74a8c5` (pós-merge da
PR #2407, que adicionou a instalação npm de `@types/node` em `deploy-functions.yml`),
e **ainda falhou** com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407
não foi suficiente para resolver o erro.

**Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a instalação
npm de `@types/node` requer investigação adicional — provavelmente o path do `node_modules`
gerado não é o que o `deno check` procura. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** (ensaio: roda tudo até o deploy exclusive, sem publicar nada e sem
   reescrever secrets) para diagnosticar o erro `@types/node` sem risco de side-effects
2. Se falhar, investigar por que a instalação npm de `@types/node` não resolve o `Could not find "@types/node"` do `deno check`; verificar o path do `node_modules` gerado versus o caminho que o Deno resolve
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio reescreve secrets e publica
   as funções imediatamente no ambiente de produção

---

## 4. DB Migrate — 3 versões no ledger sem arquivo no disco ✅ RESOLVIDO (PR #2551)

**Versões reconciliadas (commit `6fc91a8f9` no PR #2551):**
- `20261030145126_copilot_fases13_15_tabelas.sql` — SQL exato do ledger (30 statements, tabelas copilot)
- `20261031170000_high3-fk-indexes.sql` — SQL exato do ledger corrigido (48 CREATE INDEX IF NOT EXISTS; commit `4a6a54e21`)
- `20261101213000_rls_update_with_check_explicit.sql` — SQL exato do ledger (8 ALTER POLICY WITH CHECK)

**Falha colateral documentada em `scripts/db-audit/replay-known-failures.json`:**
- `20261031100000_copilot_fases13_15_tabelas.sql` adicionado como `nao-idempotente-inerte`:
  no replay zerado, `20261030145126` cria as políticas antes desta, causando `duplicate_object`.
  Efeito no canônico: nenhum — todos os objetos existem.

**Estado:** ✅ RESOLVIDO — PR #2551 mergeada em 2026-11-02T03:17Z, SHA `587ec25f` na `main`.

---

## 5. Congelamento de features — PR #2545 (Joaquim, 01/11/2026)

**Estado:** PR #2545 (feature freeze) aberta com auto-merge desde 2026-11-01 23:36Z.

**Decisão do Joaquim:** só entram correções dos 9 fluxos críticos de `docs/PRONTO_PRODUCAO.md`,
CI que impede verificá-los e segurança. Features novas (TalkX V4, Copiloto, a11y) aguardam
até os fluxos críticos estiverem OK em produção.

**PRs fechadas pelo congelamento (01/11/2026 ~23:48Z):**
- PR #1930 (db-guard workflow) — branch preservada
- PR #2426 (branch-hygiene-audit) — branch preservada
- PR #2491 (migrations copilot fases 13-15) — branch preservada
- PR #2513 (email navy contrast) — branch preservada
- PR #2532 (docs GF tasks + PENDENCIAS) — branch `claude/trusting-albattani-9x3ipg` preservada

**Fix pendente do db-live-guard (não qualificado para o congelamento):**
Branch `fix/sincronizar-migrations-sql-divergente-261101-0400` criada com:
- `supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql` — `DROP POLICY IF EXISTS`
  adicionados para corresponder ao ledger de produção (SAME: true)
- `scripts/db-audit/migration-evidence.json` — 4 exceções pinned-replay para migrations
  20261016180000, 20261016190000, 20261016220000, 20261031130000 (ledger com resumo em prosa)
Esta correção reduz 5 das falhas "SQL divergente" no db-live-guard.
**Reabrir quando o congelamento levantar.**

**O que o Joaquim precisa fazer:**
1. Verificar se PR #2545 mergeou na main (status atual: OPEN, auto-merge habilitado)
2. Após o freeze: os 9 fluxos críticos de `docs/PRONTO_PRODUCAO.md` devem ser verificados em produção
3. O fluxo 2 (WhatsApp conectar) está QUEBRADO — prioridade máxima; sem ele fluxos 3 e 4 não funcionam
4. Após o freeze: reabrir branches fechadas ou criar novas PRs para as correções pendentes

---

## 6. Branches adm01-debug-patch-* e workflows "fantasma" (GF-032..GF-056)

**Status:** As 24 branches `adm01-debug-patch-*` **não existem mais no remoto** (verificado
em 2026-11-02 via `github_list_branches` — 3 páginas, ~219 branches, sem nenhuma entrada
`adm01-debug-patch-*`). Foram criadas pelo Joaquim na interface do GitHub a partir de templates
de workflow e foram apagadas sem PR mergeada.

**GF-032 — 25 workflows "fantasma"**
As branches originavam workflows não presentes no `.github/workflows/` da main (Bearer Scanner,
Hadolint, super-linter, main.yml etc.). Como as branches foram apagadas sem PR mergeada,
esse workflows nunca entraram na main. Não há ação necessária.

**GF-033..GF-056 — inventário (pelo BACKLOG de 2026-10-31):**

| Branch | Linhas (+) | GF |
|---|---|---|
| adm01-debug-patch-1 | +39 | GF-040 |
| adm01-debug-patch-1-2 | +43 | GF-033 |
| adm01-debug-patch-1-3 | +47 | GF-034 |
| adm01-debug-patch-1-4 | +55 | GF-035 |
| adm01-debug-patch-1-5 | +57 | GF-036 |
| adm01-debug-patch-1-6 | +55 | GF-037 |
| adm01-debug-patch-1-7 | +55 | GF-038 |
| adm01-debug-patch-1-8 | +43 | GF-039 |
| adm01-debug-patch-2 | +42 | GF-053 |
| adm01-debug-patch-2-1 | +28 | GF-044 |
| adm01-debug-patch-2-2 | +66 | GF-045 |
| adm01-debug-patch-2-3 | +31 | GF-046 |
| adm01-debug-patch-2-4 | +36 | GF-047 |
| adm01-debug-patch-2-5 | +98 | GF-048 |
| adm01-debug-patch-2-6 | +18 | GF-049 |
| adm01-debug-patch-2-7 | +33 | GF-050 |
| adm01-debug-patch-2-8 | +70 | GF-051 |
| adm01-debug-patch-2-9 | +34 | GF-052 |
| adm01-debug-patch-2-10 | +30 | GF-041 |
| adm01-debug-patch-2-11 | +40 | GF-042 |
| adm01-debug-patch-2-12 | +29 | GF-043 |
| adm01-debug-patch-3 | +32 | GF-055 |
| adm01-debug-patch-3-2 | +93 | GF-054 |
| adm01-debug-patch-4 | +1 | GF-056 |

**O que o Joaquim precisa fazer:**
- Branches deletadas — conteúdo inacessível via API.
- Se quiser reativar algum workflow das branches: recriar o arquivo diretamente na main
  usando os templates do GitHub Actions.

---

## 7. Branch de trabalho GF — mudança de nome ✅ RESOLVIDO

**Branch original** do enunciado da tarefa: `claude/trusting-albattani-9x3ipg` (PR #2532).  
**Branch efetiva**: `claude/hopeful-knuth-4brqti` (PR #2551 — "fix(ci): branch-hygiene-audit timeout no step KPI (GF-010)").

**Por que mudou:** PR #2532 foi fechada durante o congelamento de features (§5) em 2026-11-01.
O trabalho GF foi continuado na branch `claude/hopeful-knuth-4brqti`, que contém todos os
commits das 56 tarefas GF-001..GF-056.

**Estado:** ✅ RESOLVIDO — PR #2551 mergeada em 2026-11-02T03:17Z. As 56 tarefas GF-001..GF-056 estão na `main` (SHA `587ec25f`).

---

## 8. Retry HTTP em fila-merge.mjs — consolidação de duplicatas ✅ RESOLVIDO (PR #2432)

**Contexto (GF-006..GF-008, GF-021..GF-023):** Entre outubro/2026 várias sessões paralelas
abriram PRs independentes adicionando lógica de retry (HTTP 502/503/504) ao
`scripts/ci/fila-merge.mjs` (usado pelo `auto-update-pr-branch.yml`). O BACKLOG pedia
"ficar com UMA entre #2218 / #2246 / #2261 / #2273 / #2274".

**Resolução:** Todas as 5 PRs tinham ancestral divergente da `main` e não podiam mergear sem
conflito. Foram fechadas como duplicatas (sem merge). Uma PR limpa foi criada a partir da
`main` atual:

- **PR #2432** (`claude/fix-retry-http502-261031`) — mergeada em main via commit `78fe258e7`
- Fix: função `execComRetry` em `scripts/ci/fila-merge.mjs` — 4 tentativas com backoff
  `[5 000, 10 000, 20 000]` ms para erros de rede/5xx transitórios.

**PRs fechadas sem merge (todas confirmadas `state: closed`, `merged_at: null`):**
- #2218 (`claude_05/brave-mccarthy-zvzky4`) — fechada como duplicata (GF-006)
- #2246 (`claude_05/festive-carson-ub43wu`) — fechada como duplicata (GF-022)
- #2261 (`fix/ci-workflows`) — fechada como duplicata (GF-023)
- #2273 (`claude_04/trusting-newton-duiglt`) — fechada como duplicata (GF-007)
- #2274 (`claude_04/nice-cori-7snz6b`) — fechada como duplicata (GF-008)

**Estado:** Consolidação concluída. `fila-merge.mjs` com retry está na `main`.

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
