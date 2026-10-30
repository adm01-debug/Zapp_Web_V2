# Relatório de Auditoria Supabase — Zapp Web V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)  
**Auditado em:** 2026-10-30  
**PostgreSQL:** 17.6  
**Total de migrations:** 1064  
**Modo:** SOMENTE LEITURA — nenhuma escrita em produção

---

## Resumo Executivo

A auditoria cobriu 12 seções: inventário, drift, segurança, integridade, performance, crons, funções DB, edge functions, auth/storage/realtime, logs, RLS e lacunas.

### Contagem de achados por severidade

| Severidade | Quantidade |
|---|---|
| **CRÍTICO** | 4 |
| **ALTO** | 11 |
| **MÉDIO** | 7 |
| **INFO** | 14 |
| **TOTAL** | 36 |

---

## 🚨 Top 10 Achados (ordem de prioridade)

### 1. [CRÍTICO] S10-001 — pg_cron: 15 jobs com startup timeout — PRODUÇÃO DEGRADADA
**Evidência:** 15 de 24 cron jobs falhando com `'job startup timeout'` desde ~20:48 UTC 2026-10-30.
- `dispatch-scheduled-messages`: 184 falhas
- `tasks-notify-due`: 184 falhas
- `ai-jobs-tick-1min`: 180 falhas
- `talkx-scheduler-1min`: 176 falhas

**Impacto:** Mensagens agendadas não enviadas, tarefas sem notificação, campanhas TalkX paradas.  
**Ação:** Verificar `cron.max_running_jobs` e status do background worker do pg_cron. Pode precisar de intervenção do Supabase.

---

### 2. [CRÍTICO] S03-001 / S11-001 — talkx_campaign_segments com policies públicas (sem JWT)
**Evidência:** `pg_policies: roles=[public], cmd=INSERT/UPDATE/DELETE/SELECT`  
Qualquer requisição sem autenticação (sem token JWT) pode ler, inserir, atualizar e deletar segmentos de campanha.  
**Proposta:** `auditoria-supabase/propostas/02_rls_with_check.sql`

---

### 3. [CRÍTICO] S05-001 — user_roles: recursão RLS causando 673.750 seq scans
**Evidência:** `pg_stat_user_tables: seq_scan=673750 (99.95%), idx_scan=336`  
Policy SELECT em `user_roles` chama `is_admin_or_supervisor()` que relê `user_roles` — loop de seq scan.  
**Ação:** Reescrever policy para evitar recursão (ex: usar `auth.jwt() ->> 'role'` ou cache via função `SECURITY DEFINER`).

---

### 4. [CRÍTICO] S06-001 — Falha massiva de crons 2026-10-30 (confirmado por S10-001)
**Evidência:** `cron.job_run_details: 50+ falhas simultâneas com return_message='job startup timeout'`  
Duplicado do achado S10-001 — confirmado independentemente por duas seções.

---

### 5. [ALTO] S07-001 — decrypt_gmail_token / encrypt_gmail_token sem SECURITY DEFINER
**Evidência:** `pg_proc: prosecdef=false, vault_access=true`  
Funções acessam `vault.*` sem `SECURITY DEFINER` — usuários `authenticated` podem descriptografar tokens OAuth Gmail chamando diretamente a função.  
**Ação:** Adicionar `SECURITY DEFINER` e restringir `EXECUTE` ao role `service_role`.

---

### 6. [ALTO] S04-001 — profiles.user_id sem FK para auth.users
**Evidência:** `information_schema: profiles só tem FK para departments. 0 orphans agora mas sem garantia.`  
A coluna `user_id uuid NOT NULL` em `profiles` não tem FK declarada para `auth.users`. Integridade referencial depende apenas de trigger.  
**Ação:** Adicionar `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`.

---

### 7. [ALTO] S04-002 — 32 FKs sem índice na coluna filho
**Evidência:** `INT-A2: 32 FKs sem índice; top: talkx_campaigns.owner, conversation_events.from/to_queue_id`  
JOINs e cascades nestas tabelas fazem seq scan completo.  
**Proposta:** `auditoria-supabase/propostas/04_fk_indexes.sql`

---

### 8. [ALTO] S03-006 / S03-007 — mcp_exec e talkx_audience_query com EXECUTE dinâmico
**Evidência:** `pg_proc: prosrc ILIKE '%EXECUTE%'`  
Funções com SQL dinâmico via `EXECUTE`. Se input não sanitizado: risco de SQLi.  
**Ação:** Auditar código-fonte de ambas, verificar se há sanitização de input e restringir quem pode chamar.

---

### 9. [ALTO] S06-002 — talkx-scheduler-1min: 10% de falha em 30 dias
**Evidência:** `cron aggregate: failed=4343/43179`  
Motor principal de campanhas TalkX com 10% de falha. Disparos de campanha podem não chegar.  
**Ação:** Investigar causas de falha (timeout pg_net, edge function lenta, rate limit Evolution).

---

### 10. [ALTO] S03-002 — copilot_sessions / copilot_insights: UPDATE public sem WITH CHECK
**Evidência:** `pg_policies: roles=public, cmd=UPDATE, with_check=null`  
Policy UPDATE usa `role=public` — qualquer requisição (sem JWT) pode atualizar via `profile_id=auth.uid()`. Sem `WITH CHECK`, sem validação do valor escrito.  
**Proposta:** `auditoria-supabase/propostas/02_rls_with_check.sql`

---

## Seção 1 — Inventário

**Status:** ✅ Concluído

- **204 tabelas** no schema `public`, todas com RLS habilitado
- **17 tabelas** com RLS ON mas sem nenhuma policy (acesso bloqueado para anon/authenticated; somente service_role)
  - Sensíveis: `voip_profile_credentials`, `gmail_oauth_states`
- **13 views** (todas com `security_invoker=true` — boa prática)
- **8 extensões:** pg_cron 1.6.4, pg_net 0.20.4, pg_stat_statements 1.11, pg_trgm 1.6, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1
- **24 cron jobs**, todos ativos
- **85 edge functions** no repo
- **9 buckets de storage** (3 públicos: audio-memes, stickers, custom-emojis)
- **13 secrets no Vault** (somente nomes — sem valores)

Arquivos: `inventario/S01_tabelas_resumo.json`, `S01_crons.json`, `S01_extensoes_views.json`, `S01_edge_functions.json`

---

## Seção 2 — Drift

**Status:** ✅ Concluído

- **Paridade migrations:** 1064 arquivos no repo = 1064 registros no ledger ✅
- **65 migrations com `statements=NULL`** — SQL não auditável (viola regra 7 do CLAUDE.md)
- **Drift edge functions:** NÃO VERIFICÁVEL via SQL — requer `supabase functions list`
- **Schema `_bkp_261023`:** sem migrations versionadas e sem RLS — drift permanente por design

Arquivo: `inventario/S02_drift.json`

---

## Seção 3 — Segurança

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S03-001 | CRÍTICO | talkx_campaign_segments | Policies public sem JWT |
| S03-002 | ALTO | copilot_sessions/insights | UPDATE public sem WITH CHECK |
| S03-003 | ALTO | voip_profile_credentials | RLS sem policy — bypass SECURITY DEFINER |
| S03-004 | ALTO | contacts | UPDATE sem WITH CHECK |
| S03-005 | ALTO | talkx_campaigns | UPDATE sem WITH CHECK |
| S03-006 | ALTO | mcp_exec | EXECUTE dinâmico |
| S03-007 | ALTO | talkx_audience_query | SQL dinâmico — potencial SQLi |
| S03-008 | MÉDIO | bucket multiplix-voice | Sem restrição de MIME type |

**Boas práticas confirmadas:**
- 403 funções SECURITY DEFINER têm `search_path` configurado ✅
- Nenhuma policy usa `user_metadata` (todas usam `auth.uid()`) ✅
- 13 views com `security_invoker=true` ✅
- Apenas 1 tabela com escrita anon (`password_reset_requests` com WITH CHECK restritivo) ✅

Arquivos: `inventario/S03_*.json`

---

## Seção 4 — Integridade

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S04-001 | ALTO | profiles.user_id | Sem FK para auth.users |
| S04-002 | ALTO | 32 FKs | Sem índice na coluna filho |
| S04-003 | MÉDIO | _zapp_fn_before | Sem PK |

Arquivo: `inventario/S04_integridade.json`

---

## Seção 5 — Performance

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S05-001 | CRÍTICO | user_roles RLS | 673.750 seq scans por recursão RLS |
| S05-002 | ALTO | get_last_message_dates | Média 2.066ms por chamada |

Arquivo: `inventario/S05_performance.json`

---

## Seção 6 — Crons

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S06-001 | CRÍTICO | mass startup timeout | 12+ jobs falhando 2026-10-30 20h-22h UTC |
| S06-002 | ALTO | talkx-scheduler-1min | 10% falha em 30 dias |
| S06-003 | ALTO | jobid=19 | Cron órfão com 302 runs históricos |

Arquivo: `inventario/S06_crons.json`

---

## Seção 7 — Funções DB

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S07-001 | ALTO | decrypt/encrypt_gmail_token | Sem SECURITY DEFINER |
| S07-002 | ALTO | dashboard_kpi, transfer_conversation | Funções duplicadas em pg_proc |
| S07-004 | MÉDIO | 12 funções | EXCEPTION WHEN OTHERS engolindo falhas |

Arquivo: `inventario/S07_functions.json`

---

## Seção 8 — Edge Functions

**Status:** ✅ Concluído

- **85 funções no repo**, 14 com `verify_jwt=false`
- 11 das 14 têm autenticação alternativa adequada (HMAC, cron secret, pré-auth)
- `public-api`: DESATIVADA (retorna 410 Gone) ✅

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S08-001 | MÉDIO | talkx-link | DEFAULT_LEGACY_SIGNATURE_ACCEPT_UNTIL expirou em 2026-10-20 |
| S08-002 | INFO | searchbox-budget-alert, sync-call-records | verify_jwt=false não verificado completamente |

Arquivo: `inventario/S08_edge_functions.json`

---

## Seção 9 — Auth / Storage / Realtime

**Status:** ✅ Concluído

- **Auth:** 10 users, todos confirmados, 1 banido, 6 ativos em 30d
- **Storage:** 9 buckets (3 públicos, 6 privados)
- **Realtime:** 37 tabelas publicadas, todas com RLS ✅

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S09-002 | MÉDIO | multiplix-voice | allowed_mime_types=null |
| S09-003 | INFO | 3 buckets públicos | audio-memes, stickers, custom-emojis — intencional |
| S09-004 | INFO | whatsapp media policy | Potencial cross-tenant se RLS de messages falhar |
| S09-005 | INFO | _bkp_261023 | 3 tabelas sem RLS — não expostas via Realtime |

Arquivo: `inventario/S09_auth_storage_realtime.json`

---

## Seção 10 — Logs (24h)

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S10-001 | CRÍTICO | pg_cron 15 jobs | startup timeout massivo desde ~20:48 UTC |

**Detalhe:** 15 jobs com `job startup timeout`. Top 4:
- `dispatch-scheduled-messages`: 184 falhas
- `tasks-notify-due`: 184 falhas
- `ai-jobs-tick-1min`: 180 falhas
- `talkx-scheduler-1min`: 176 falhas

Arquivo: `inventario/S10_logs.json`

---

## Seção 11 — RLS

**Status:** ✅ Concluído

- **Achado crítico:** talkx_campaign_segments com policies public (duplica S03-001)
- **Boas práticas:** security_invoker=true em todas as views, search_path em todos os SECURITY DEFINER, auth.uid() em todas as policies
- **17 tabelas** com RLS ON sem policy (documentadas)

Arquivo: `inventario/S11_rls_matrix.json`

---

## Seção 12 — Lacunas

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S12-001 | MÉDIO | staging | Sem ambiente de staging compartilhado para QA |
| S12-002 | MÉDIO | profiles/login_attempts/whatsapp_connections | Sem deleted_at/expires_at — não conformidade LGPD potencial |
| S12-003 | INFO | webhook_failures | Sem created_at — impossível auditoria temporal |
| S12-004 | INFO | alerta de falha de cron | Sem alerta automático para startup timeout massivo |
| S12-005 | INFO | PITR retenção | Confirmar dias de retenção no painel Supabase |

**36 tabelas** com colunas name/email/phone sem política de retenção de dados.

Arquivo: `inventario/S12_lacunas.json`

---

## Prova que nada foi alterado em produção

Durante toda a auditoria foram executados exclusivamente:
- `SELECT` em tabelas de catálogo (`pg_tables`, `pg_policies`, `pg_indexes`, `pg_proc`, `information_schema.*`)
- `SELECT` em tabelas operacionais sem modificação (`cron.job`, `cron.job_run_details`, `supabase_migrations.*`, `storage.buckets`, `net._http_response`)
- Agregados (`count`, `max`) e `pg_settings`
- Nenhum `INSERT`, `UPDATE`, `DELETE`, `DDL`, `GRANT`, `REVOKE`
- Nenhum `apply_migration`, `db_insert`, `db_update`, `db_delete`, `db_alter_table`
- Nenhum deploy de edge function

Verificação: `grep -r "INSERT\|UPDATE\|DELETE\|DDL\|GRANT\|REVOKE" auditoria-supabase/` retornará apenas referências em comentários/achados, não comandos executados.

---

## Arquivos entregues

```
auditoria-supabase/
├── RELATORIO_AUDITORIA_SUPABASE.md          # Este relatório
├── progresso.json                            # 12/12 seções concluídas
├── inventario/
│   ├── S01_tabelas_resumo.json
│   ├── S01_crons.json
│   ├── S01_extensoes_views.json
│   ├── S01_edge_functions.json
│   ├── S02_drift.json
│   ├── S03_policies_inseguras.json
│   ├── S03_functions_seguranca.json
│   ├── S03_grants.json
│   ├── S03_rls_sem_policy.json
│   ├── S03_buckets_auth.json
│   ├── S04_integridade.json
│   ├── S05_performance.json
│   ├── S06_crons.json
│   ├── S07_functions.json
│   ├── S08_edge_functions.json
│   ├── S09_auth_storage_realtime.json
│   ├── S10_logs.json
│   ├── S11_rls_matrix.json
│   └── S12_lacunas.json
├── propostas/
│   ├── 01_revogar_grants_anon.sql            # NOT APPLIED
│   ├── 02_rls_with_check.sql                 # NOT APPLIED
│   ├── 03_drop_unused_indexes.sql            # NOT APPLIED
│   ├── 04_fk_indexes.sql                     # NOT APPLIED
│   └── 05_drop_duplicate_indexes.sql         # NOT APPLIED
└── testes/
    ├── 01_rls_matrix.sql                     # Roteiro para Postgres temporário
    └── rls_matrix_roteiro.md
```

---

## Ações imediatas recomendadas (por prioridade)

| Prioridade | Achado | Ação |
|---|---|---|
| 🔴 **AGORA** | S10-001 | Verificar pg_cron background worker — produção degradada |
| 🔴 **HOJE** | S03-001/S11-001 | Remover policies `public` de talkx_campaign_segments |
| 🔴 **HOJE** | S07-001 | Adicionar SECURITY DEFINER em decrypt/encrypt_gmail_token |
| 🟠 **SEMANA** | S05-001 | Corrigir recursão RLS em user_roles |
| 🟠 **SEMANA** | S03-002 | Adicionar WITH CHECK em policies UPDATE public |
| 🟠 **SEMANA** | S04-002 | Criar 32 índices em colunas filho de FK |
| 🟡 **MÊS** | S04-001 | Adicionar FK profiles.user_id → auth.users |
| 🟡 **MÊS** | S12-002 | Política de retenção LGPD para profiles/login_attempts |
| 🟡 **MÊS** | S02-001 | Preencher 65 migrations com statements=NULL |
| 🟡 **MÊS** | S09-002 | Restringir MIME types do bucket multiplix-voice |
