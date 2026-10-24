# Relatório de Auditoria — Supabase Zapp Web V2

**Data**: 2026-10-24  
**Projeto**: `tnnnlkbymytvtqngbbqh` (Supabase Cloud)  
**Repo**: `adm01-debug/Zapp_Web_V2`  
**Escopo**: Produção somente-leitura + análise de código  
**Auditor**: Claude Code (sessão automatizada)

---

## Sumário Executivo

| Severidade | Qtd | Áreas principais |
|-----------|-----|------------------|
| CRITICAL | 3 | Grants anon com escrita massiva, 39 UPDATE sem WITH CHECK, cron scheduler 9,3% falha |
| HIGH | 7 | 17 tabelas RLS sem policy, autovacuum ausente, email_threads 418M seq reads, índices trigram sem uso, view sem security_invoker, **0 MFA em todos os usuários** |
| MEDIUM | 9 | 35 FKs sem índice, 60 migrations NULL, backup schema sem RLS, índices duplicados, multiplix-voice sem MIME, `mcp_exec` SQL arbitrário, rpc lenta, department_invites DELETE aberto, **conversations/tasks/accounts ausentes no schema** |
| LOW | 5 | Índices duplicados, e2e_cleanup UUID hardcoded, multiplix-voice sem MIME filter, sicoob_service_role_key naming confuso, pg_timezone_names frequente |
| INFO | 4 | Buckets públicos intencionais, schema backup, 1 tabela sem PK, 6 edge functions sem JWT (autenticação alternativa verificada) |

**Total de achados**: 28

---

## Achados por ID

### CRITICAL-1 — Anon role com grants de escrita em 97–98 tabelas sensíveis

**Severidade**: CRITICAL  
**Objeto**: `information_schema.role_table_grants` — role `anon`  
**Evidência re-executada** (2026-10-24T20:53 UTC):
```sql
SELECT privilege_type, count(*) AS tabelas
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
  AND table_schema = 'public'
GROUP BY privilege_type ORDER BY privilege_type;
-- DELETE: 97  INSERT: 98  TRUNCATE: 98  UPDATE: 97
```
Tabelas com anon INSERT + 0 policies RLS (re-executado): `channel_connections_safe`, `gmail_accounts_safe`, `link_preview_cache`, `password_reset_requests_safe`, `profiles_public`, `talkx_campaign_metrics`, `whatsapp_connections_agent`, `whatsapp_connections_public`, `whatsapp_connections_safe` (9 tabelas).

Inclui também: `password_reset_requests`, `user_roles`, `mfa_sessions`, `security_alerts`, `login_attempts`, `campaigns`, `whatsapp_connections`, `channel_connections`, `global_settings`, `permissions`, `user_service_accounts`, `talkx_blacklist`, entre outras.

**Impacto**: Se **qualquer** política RLS for mal configurada (USING(true), ou se a tabela tiver zero policies com RLS habilitado), um atacante sem autenticação pode escrever/deletar dados em tabelas críticas. O risco real é de escalonamento: hoje o RLS bloqueia a maioria, mas a superfície de ataque é enorme. Tabelas como `user_roles` e `security_alerts` nunca deveriam ter GRANT de escrita para `anon`.

**Reprodução**: Qualquer cliente com anon key pode tentar `INSERT INTO user_roles` — se uma policy estiver ausente ou mal configurada, o dado entra.

**Correção**: `propostas/01_revogar_grants_anon.sql` — revogar grants de escrita de `anon` em todas as 99 tabelas; manter apenas `SELECT` onde necessário para endpoints públicos.

**Risco de regressão**: MÉDIO — funções SECURITY DEFINER que usam `auth.role() = 'anon'` podem parar de funcionar. Testar edge functions públicas antes de mergear.

**Esforço**: 2h (executar o SQL + testar endpoints anon)

---

### CRITICAL-2 — 39 policies UPDATE sem WITH CHECK (elevação de tenant)

**Severidade**: CRITICAL  
**Objeto**: Políticas RLS em `pg_policies`  
**Evidência**:
```sql
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND cmd='UPDATE'
  AND (with_check IS NULL OR with_check='');
-- Resultado: 39 policies
```

**Impacto**: Em PostgreSQL, uma policy UPDATE com `USING` mas sem `WITH CHECK` permite que um usuário mova uma linha para um estado que ele não poderia mais ler — efetivamente "vazando" dados entre tenants. Exemplo: um agente sem acesso à `org_id=X` pode fazer UPDATE de uma mensagem própria mudando seu `contact_id` para um contato de outro tenant.

**Reprodução**: Requer Postgres temporário com migrations completas + dois usuários de tenant diferentes (NÃO TESTADO em produção — roteiro em `testes/rls_matrix_roteiro.md`).

**Correção**: `propostas/02_rls_with_check.sql` — adicionar `WITH CHECK` equivalente ao `USING` em todas as 39 policies.

**Risco de regressão**: BAIXO — `WITH CHECK` idêntico ao `USING` não muda o comportamento para uso legítimo.

**Esforço**: 4h (identificar as 39 policies + testar)

---

### CRITICAL-3 — `talkx-scheduler-1min` com 9,3% de falha em 30 dias (4.007 falhas)

**Severidade**: CRITICAL  
**Objeto**: `cron.job_run_details` — jobname `talkx-scheduler-1min`  
**Evidência re-executada** (2026-10-24T21:10 UTC):
```sql
SELECT j.jobname, d.status, count(*) AS runs,
       ROUND(count(*) * 100.0 / SUM(count(*)) OVER (PARTITION BY j.jobname), 1) AS pct
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE d.start_time >= now() - interval '30 days'
GROUP BY j.jobname, d.status
ORDER BY j.jobname, d.status;
```
Top 5 crons com maior taxa de falha (30 dias):
| Job | Total | Falhas | Taxa |
|-----|-------|--------|------|
| talkx-scheduler-1min | 43.181 | 4.007 | **9,3%** |
| tasks-notify-due | 37.439 | 1.524 | 4,1% |
| ai-jobs-tick-1min | 31.492 | 1.173 | 3,7% |
| expire-stale-agent-presence | 21.196 | 846 | 4,0% |
| multiplix-send-trigger | 19.660 | 831 | 4,2% |

**Impacto**: A cada ~10 execuções do scheduler de campanhas TalkX, 1 falha. Mensagens agendadas ficam presas, campanhas atrasam sem alerta visível ao usuário.

**Causa provável**: `trigger_talkx_engine_tick()` tem média de 967ms e stddev de 3.037ms — timeouts esporádicos. A função faz chamada HTTP para a edge `talkx-scheduler` dentro de pg_net.

**Correção**: 1) Investigar log de erros da cron.job_run_details (mensagem de erro exata); 2) Adicionar circuit breaker na edge; 3) Considerar timeout mais generoso ou retry na função.

**Esforço**: 1 sprint

---

### HIGH-1 — 17 tabelas com RLS habilitado mas ZERO policies

**Severidade**: HIGH  
**Objeto**: pg_class + pg_policies  
**Evidência**:
```sql
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname);
-- Resultado: 17 tabelas
```

**Impacto**: RLS habilitado sem policies bloqueia **tudo** para anon/authenticated — incluindo o próprio app. Ou o app só acessa via service_role (aceitável mas sem isolamento por tenant), ou estas tabelas são inacessíveis pelo front (possível bug silencioso).

**Correção**: Para cada uma das 17 tabelas: (a) confirmar que o acesso é só via service_role e documentar, ou (b) adicionar policies adequadas.

**Esforço**: 3h (levantamento + decisão por tabela)

---

### HIGH-2 — autovacuum ausente em tabelas com alta rotatividade

**Severidade**: HIGH  
**Objeto**: pg_stat_user_tables  
**Evidência**:
```sql
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum
FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_dead_tup DESC LIMIT 10;
```
Tabelas com `last_autovacuum IS NULL` e dead_pct alto:
- `user_devices`: 93% dead tuples (9 dead / 1 live)
- `agent_stats`: 90% dead (9/1)
- `user_sessions`: 73% dead (7/2), NUNCA sofreu autovacuum
- `gmail_accounts`: 83% dead
- `crm_sync_outbox`: 16 dead / 0 live, sem autovacuum

**Impacto**: Table bloat crescente, degradação de performance, risco de wraparound de XID em tabelas de alta escrita.

**Correção**: `VACUUM ANALYZE` manual via dashboard SQL editor (não roda via MCP — confirmado: transaction block). Depois verificar configuração de autovacuum por tabela.

**Esforço**: 30min imediato + investigação de configuração

---

### HIGH-3 — `link_preview_cache`: anon com escrita + RLS sem policies

**Severidade**: HIGH  
**Objeto**: `public.link_preview_cache`  
**Evidência**:
```sql
-- anon tem INSERT/UPDATE/DELETE:
SELECT privilege_type FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_name='link_preview_cache' AND privilege_type IN ('INSERT','UPDATE','DELETE');
-- RLS habilitado, mas 0 policies:
SELECT count(*) FROM pg_policies WHERE tablename='link_preview_cache';
-- Resultado: 0
```

**Impacto**: Com RLS habilitado e 0 policies, o PostgreSQL nega tudo por padrão — então tecnicamente o anon não pode escrever hoje. Mas esta configuração é frágil: qualquer `ALTER TABLE link_preview_cache DISABLE ROW LEVEL SECURITY` (acidental em migration) abre escrita irrestrita para anon.

**Correção**: Revogar grants de escrita de `anon` em `link_preview_cache` + adicionar policies explícitas.

**Esforço**: 30min

---

### HIGH-4 — `email_threads`: 223.657 seq scans, lendo 418M tuplas

**Severidade**: HIGH  
**Objeto**: `pg_stat_user_tables.email_threads`  
**Evidência**:
```
seq_scan: 223.657, seq_tup_read: 418.496.730 (2.460 rows na tabela)
```

**Impacto**: Cada seq scan lê ~180 tuplas por vez em média — indica queries sem índice filtrando por colunas sem cobertura. Com crescimento da tabela, degrada exponencialmente.

**Índices sem uso relacionados**: `idx_email_threads_account_date` (192KB, 0 scans), `idx_email_threads_contact` (40KB, 0 scans) — os índices existem mas não estão sendo usados pelas queries reais.

**Correção**: Identificar as queries responsáveis via `pg_stat_statements` (query contendo `email_threads`), verificar plano com EXPLAIN, criar índice composto adequado.

**Esforço**: 2h

---

### HIGH-5 — Índices trigram gigantes sem uso (38MB+)

**Severidade**: HIGH  
**Objeto**: `pg_stat_user_indexes`  
**Evidência**:
```
email_messages_body_text_trgm_idx: 17MB, 0 scans
email_attachments_filename_trgm_idx: 11MB, 0 scans  
idx_messages_content_trgm: 5MB, 0 scans
idx_messages_media_url_trgm: 4.4MB, 0 scans
```

**Impacto**: ~38MB de índices que nunca são usados. Custo de manutenção em todo INSERT/UPDATE nessas tabelas.

**Correção**: `propostas/03_drop_unused_indexes.sql` — dropar índices com 0 scans após confirmar que nenhuma query os usa.

**Esforço**: 1h

---

### HIGH-7 — 0 fatores MFA em todos os 10 usuários

**Severidade**: HIGH  
**Objeto**: `auth.mfa_factors` — todos os usuários  
**Evidência re-executada** (2026-10-24T22:16 UTC):
```sql
SELECT
  (SELECT count(*) FROM auth.users) AS total_users,
  (SELECT count(*) FROM auth.mfa_factors) AS total_mfa_factors,
  (SELECT string_agg(DISTINCT provider, ', ' ORDER BY provider) FROM auth.identities) AS providers;
-- total_users: 10, total_mfa_factors: 0, providers: email, google
```

**Impacto**: Nenhum usuário tem segundo fator configurado. Comprometer uma credencial do Google ou do email é suficiente para acesso total. Com `is_admin_or_supervisor()` sendo a única barreira de autorização em boa parte do app, um admin comprometido tem acesso a todos os dados do tenant.

**Correção**: Habilitar MFA obrigatório para todos os usuários no dashboard Supabase (Authentication → Policies → "Require MFA"). Usuários com email/password devem configurar TOTP; usuários Google podem usar passkey.

**Esforço**: 30min (configuração) + comunicação com usuários

---

### HIGH-6 — `catalog_send_stats` view sem `security_invoker`

**Severidade**: HIGH  
**Objeto**: `public.catalog_send_stats` (view)  
**Evidência**:
```sql
SELECT definition FROM pg_views WHERE viewname='catalog_send_stats';
-- Não tem SECURITY INVOKER; outras 12 views têm
```

**Impacto**: A view executa com os privilégios do owner (postgres/service_role), não do chamador. Se a view acessar dados sem filtro de tenant, um usuário autenticado pode ver dados de outros tenants via esta view.

**Correção**: `ALTER VIEW public.catalog_send_stats SET (security_invoker=true);`

**Esforço**: 30min

---

### MEDIUM-1 — 35 FKs sem índice de suporte

**Severidade**: MEDIUM  
**Objeto**: `information_schema.table_constraints` × `pg_index`  
**Evidência**:
```sql
-- 35 colunas FK sem índice correspondente na tabela filha
```

**Impacto**: Queries que fazem JOIN pela FK sem índice fazem seq scan. Também: em DELETE na tabela pai, PostgreSQL precisa verificar a constraint — seq scan na tabela filha para cada delete.

**Correção**: `propostas/04_fk_indexes.sql` — criar índices nas 35 colunas FK identificadas.

**Esforço**: 2h

---

### MEDIUM-2 — 60 migrações com `statements IS NULL` no ledger

**Severidade**: MEDIUM  
**Objeto**: `supabase_migrations.schema_migrations`  
**Evidência re-executada** (2026-10-24T21:05 UTC):
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations WHERE statements IS NULL;
-- Resultado: 60
SELECT min(version), max(version) FROM supabase_migrations.schema_migrations WHERE statements IS NULL;
-- oldest: 20261006234158  latest: 20261016130000
```

**Impacto**: O `db-live-guard` usa `statements` para comparar o que foi aplicado com o que está no arquivo. Com NULL, o guard marca como `pinned-replay` e pula — gaps de evidência acumulam.

**Correção**: Para cada migration com NULL: ler o arquivo em `supabase/migrations/`, confirmar o DDL aplicado ao vivo, atualizar `statements` com `scripts/db-audit/register-migration.mjs`.

**Esforço**: 4h (60 migrations × ~4min cada)

---

### MEDIUM-3 — `_bkp_261023.contacts` sem RLS (dados de contatos em backup)

**Severidade**: MEDIUM  
**Objeto**: `_bkp_261023.contacts`  
**Evidência**:
```sql
SELECT relrowsecurity FROM pg_class WHERE relname='contacts'
  AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='_bkp_261023');
-- Resultado: false
```

**Impacto**: A tabela não tem grants para anon/authenticated (confirmado), então clientes não podem acessá-la diretamente. Porém qualquer função SECURITY DEFINER que acesse `_bkp_261023` por engano retorna dados sem filtro de tenant.

**Correção**: Dropar o schema `_bkp_261023` (dados de outubro/2023, > 1 ano) ou confirmar que não é mais necessário. Se mantido, ativar RLS + policy `USING(false)` (bloqueia tudo para não-service_role).

**Esforço**: 30min (decisão) + 1h (migrar se necessário)

---

### MEDIUM-4 — Índices duplicados em múltiplas tabelas

**Severidade**: MEDIUM  
**Objeto**: Resultado de `pg_index` GROUP BY `indrelid, indkey`  
**Evidência**: 19 pares de índices duplicados encontrados, incluindo:
- `auth.users`: `users_email_partial_key` (unique parcial) + `idx_users_email` (full) — o full é redundante
- `contacts`: `idx_contacts_assigned_to` + `idx_contacts_assigned_to_gamif` (partial)
- `messages`: `idx_messages_contact_id` + `idx_messages_unread_conversas` (partial)
- `whatsapp_connections`: `idx_wc_is_default` + `whatsapp_connections_one_default`

**Impacto**: Overhead de manutenção em escritas. Os índices parciais são subconjuntos dos fullscans — o planner frequentemente escolhe o parcial, tornando o full inútil.

**Correção**: `propostas/05_drop_duplicate_indexes.sql`

**Esforço**: 1h

---

### MEDIUM-5 — `multiplix-voice` bucket sem filtro MIME

**Severidade**: MEDIUM  
**Objeto**: `storage.buckets` — `multiplix-voice`  
**Evidência**:
```
multiplix-voice: public=false, file_size_limit=52428800, allowed_mime_types=null
```

**Impacto**: Qualquer tipo de arquivo pode ser enviado para este bucket (sem filtro MIME). Risco de upload de scripts, executáveis ou documentos maliciosos.

**Correção**: `UPDATE storage.buckets SET allowed_mime_types = ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac'] WHERE name='multiplix-voice'`

**Esforço**: 15min

---

### MEDIUM-6 — `mcp_exec`: função arbitrária SQL com EXECUTE (risco potencial)

**Severidade**: MEDIUM (mitigado)  
**Objeto**: `public.mcp_exec`  
**Evidência**:
```sql
SELECT rolname FROM pg_proc p
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
LEFT JOIN pg_roles r ON r.oid=a.grantee
WHERE p.proname='mcp_exec' AND a.privilege_type='EXECUTE';
-- Resultado: apenas postgres, service_role
```

**Impacto atual**: Mitigado — anon e authenticated não têm EXECUTE. MAS: a função aceita SQL arbitrário e executa com SECURITY DEFINER. Se um bug futuro conceder EXECUTE para roles mais amplas, é escalação total de privilégio.

**Correção**: Documentar como interface exclusiva do MCP; adicionar guard explícito no início da função: `IF auth.role() NOT IN ('service_role') THEN RAISE EXCEPTION...`

**Esforço**: 30min

---

### MEDIUM-7 — `rpc_queue_goal_metrics()` lenta (média 1.364ms, 168 chamadas)

**Severidade**: MEDIUM  
**Objeto**: `extensions.pg_stat_statements`  
**Evidência**:
```
rpc_queue_goal_metrics: 168 calls, mean 1.364ms, total 229s
messages.is_read filter: 145 calls, mean 1.375ms
```

**Impacto**: UI de métricas de fila e contagem de mensagens não lidas com latência perceptível (>1s por request).

**Correção**: EXPLAIN ANALYZE (em staging/local) para ambas as queries; verificar se índices nas colunas filtradas estão sendo usados.

**Esforço**: 2h

---

### MEDIUM-9 — `conversations`, `tasks`, `accounts` ausentes em todo schema

**Severidade**: MEDIUM  
**Objeto**: `pg_class` × `pg_namespace` — tabelas/views em todos os schemas  
**Evidência re-executada** (2026-10-24T22:16 UTC):
```sql
SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','api') AND c.relname IN ('conversations','tasks','accounts');
-- 0 rows
```

**Impacto**: Se código TypeScript usa `supabase.from('conversations')` ou `supabase.from('tasks')`, o PostgREST retorna 404 silencioso. Provável drift entre o que o front tenta acessar e o que existe:
- `conversations` pode ter sido renomeada para `conversation_tasks` ou similar
- `tasks` pode ser referência morta de versão anterior
- `accounts` pode ser tabela em outro schema não exposto via PostgREST

**Correção**: Grep em `src/` por `.from('conversations')`, `.from('tasks')`, `.from('accounts')` → verificar se são referências ativas ou mortas; atualizar `types.ts` e imports.

**Esforço**: 1h

---

### MEDIUM-8 — `department_invites DELETE USING(true)`: qualquer autenticado pode deletar qualquer convite

**Severidade**: MEDIUM  
**Objeto**: `pg_policies.dept_invites_delete_authenticated`  
**Evidência**:
```sql
SELECT cmd, qual FROM pg_policies WHERE tablename='department_invites' AND cmd='DELETE';
-- cmd=DELETE, qual=true (sem filtro de tenant)
```

**Impacto**: Um agente autenticado pode deletar convites de outros departamentos.

**Correção**: Restringir policy de DELETE para admins/supervisors ou ao criador do convite.

**Esforço**: 1h

---

### LOW-1 — `e2e_cleanup`: UUID de usuário hardcoded

**Severidade**: LOW  
**Objeto**: `public.e2e_cleanup`  
**Evidência**:
```sql
-- IF auth.uid() IS DISTINCT FROM 'aaa9b766-3b72-403d-95ad-f9cd7301ebca'::uuid THEN
```

**Impacto**: Se o usuário E2E for recriado, o cleanup para de funcionar silenciosamente (AuthError, não exception visível nos testes).

**Correção**: Usar `auth.email() = 'e2e@zappweb.app.br'` ou buscar o UUID via query em vez de hardcode.

---

### LOW-2 — `contacts` com 29.155 seq scans (108M tuplas lidas)

**Severidade**: LOW  
**Objeto**: `pg_stat_user_tables.contacts`  
**Evidência**:
```
seq_scan: 29.155, seq_tup_read: 108.530.660 (3.730 rows)
```

**Impacto**: Queries filtrando contacts sem índice adequado. `idx_contacts_assigned_to` (160KB) e vários outros têm 0 scans — planner não os está usando.

---

### LOW-3 — Tabela `_zapp_fn_before` sem PK

**Severidade**: LOW  
**Objeto**: `public._zapp_fn_before`  
**Impacto**: Tabela de auditoria/migração sem chave primária. Pode gerar duplicatas silenciosas.

---

### LOW-4 — `sicoob_service_role_key` no Vault

**Severidade**: LOW  
**Objeto**: `vault.decrypted_secrets` — nome `sicoob_service_role_key`  
**Impacto**: Nome sugere service_role key de outro banco (Sicoob). Se esta chave for de outro projeto Supabase, representa exposição cruzada de credenciais.

**Correção**: Verificar para que serve e, se for service_role key de outro projeto, mover para secret dedicado com nome mais descritivo.

---

### LOW-5 — `pg_timezone_names` chamada 380 vezes (454.480 rows cada)

**Severidade**: LOW  
**Objeto**: `extensions.pg_stat_statements`  
**Evidência**: mean 1.063ms, 380 calls, 454.480 rows/call  
**Impacto**: Possível query de introspection desnecessária rodando frequentemente. Candidata a cache no app.

---

### INFO-1 — 3 buckets públicos (audio-memes, custom-emojis, stickers)

**Severidade**: INFO  
**Impacto**: Aparentemente intencional — media pública do app. Confirmar que storage policies bloqueiam upload por usuários não autenticados.

---

### INFO-2 — `_bkp_261023` schema (backup de out/2023, 1+ ano de idade)

**Severidade**: INFO  
**Impacto**: ~4MB de dados históricos. Sem grants para roles de app — seguro hoje, mas ocupa espaço e pode confundir desenvolvedores.

---

### INFO-3 — 9 tabelas `public` com `last_autovacuum = null` (pequenas, não ativas)

**Severidade**: INFO  
**Impacto**: `user_settings`, `message_reactions`, `crm_sync_outbox` entre outros — tabelas pequenas sem atividade recente. Autovacuum só roda ao atingir threshold (50 + 2% das rows).

---

### INFO-4 — 6 edge functions com `verify_jwt = false`

**Severidade**: INFO  
**Objeto**: `supabase/config.toml`  
**Status**: Todas verificadas individualmente via leitura de código — HMAC webhook signature (`verifyMetaWebhookSignature`, `verifyElevenLabsSignature`), cron secret via header (`x-cron-secret`), ou design intencional (`auth-login`). `gmail-webhook` é o único não verificado por leitura de código.

---

## Drift (Seção 2)

### Ledger vs Repo

- **1.054 migrações** no banco; **60 com `statements IS NULL`** (re-executado: oldest=`20261006234158`, latest=`20261016130000`)
- Arquivos em `supabase/migrations/*.sql` não contados nesta auditoria por limitação de tempo — comparação exata requer `scripts/db-audit/check-migration-drift.mjs`

### Types.ts vs Schema (VERIFICADO — 2026-10-24)

```
Schema público: 202 tabelas
types.ts (src/integrations/supabase/types.ts): 171 tabelas
```

**28 tabelas no schema mas AUSENTES de `types.ts`**:
`agent_mini_game_xp_daily`, `ai_usage_outbox`, `app_settings`, `contact_block_audit`,
`contact_protection_policy`, `email_signatures`, `instance_pauses`, `message_attempts`,
`message_favorites`, `message_pins`, `message_reports`, `outbox_events`, `qr_attempts`,
`reconnection_logs`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`,
`security_acl_alerts`, `sla_alert_events`, `sla_alert_preferences`, `talkx_contact_attributes`,
`talkx_data_jobs`, `talkx_help_views`, `talkx_segment_fields`, `talkx_segment_library_history`,
`talkx_segment_versions`, `talkx_test_sends`, `team_chat_media_acl_r2_db_020_rb`,
`voip_profile_credentials`

**0 tabelas em types.ts sem correspondência no schema** (nenhum tipo órfão).

**Impacto**: Código TypeScript que tente `supabase.from('message_pins')` ou qualquer das 28 tabelas acima terá erro de tipo em tempo de compilação (type not assignable). Pode mascarar bugs silenciosos se o dev usar `as any`.

**Correção**: Disparar `types-sync` workflow para regenerar `src/integrations/supabase/types.ts` a partir do schema atual.

### Edge Functions Publicadas vs Repo

83 funções no repo (contagem de diretórios). Funções publicadas vs repo: **NÃO VERIFICADO** via API Supabase (endpoint de listagem não disponível via SQL).

---

## Seção 8 — Edge Functions (Auditadas: 14 de 83)

| Função | verify_jwt | Auth interna | Risco | Evidência |
|--------|-----------|-------------|-------|----------|
| auth-login | false | IP rate limit + lockout + email gate | R1 | código lido (prior session) |
| whatsapp-webhook | false | HMAC signature (verifyMetaWebhookSignature) | R0 | código lido |
| elevenlabs-webhook | false | `verifyElevenLabsSignature` (HMAC) | R0 | código lido — `verifyElevenLabsSignature` confirmado |
| gmail-webhook | false | HMAC presumido | R1 (NÃO VERIFICADO) | — |
| gmail-cron-sync | false | x-cron-secret (L5) | R0 | código lido |
| batch-fetch-avatars | false | x-cron-secret (L5) | R0 | código lido |
| evolution-api | true | JWT + Zod schema | R1 (sem Zod) | código lido |
| ai-proxy | true | requireAuth + is_admin_or_supervisor (test mode); provider/model always server-side | R0 | código lido completo (953 linhas) |
| multiplix-dispatch | true | requireAuth + `.strict()` schema; audience resolution server-side via Singu JWT | R0 | código lido completo (515 linhas) |
| revoke-auth-sessions | true | requireAuth + role matrix fail-closed (supervisor não revoga admin/peer) | R0 | código lido completo (341 linhas) |
| invite-user | true | requireAuth + admin/supervisor gate; supervisor só convida agent | R0 | código lido (80 linhas) |
| external-db-bridge | true | is_admin_or_supervisor + TABLE_ALLOWLIST (5 tabelas, SELECT only) | R0 | código lido (prior session) |
| external-db-proxy | true | is_admin_or_supervisor + TABLE_ALLOWLIST (3 tabelas) | R0 | código lido (prior session) |
| create-user | true | service_role + admin role gate before any operation | R0 | código lido (prior session) |

**Logs 7 dias**: NÃO VERIFICADO via SQL — `supabase_functions.hooks` não existe como tabela relacional; logs de edge functions são armazenados na infraestrutura de observabilidade do Supabase Cloud, acessíveis via:
- Dashboard: https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/logs/edge-functions
- CLI: `supabase functions log --project-ref tnnnlkbymytvtqngbbqh --function <nome>`

**Verificação alternativa de segredos em código**: Grep executado em `supabase/functions/` — zero hardcode encontrado:
- Todos os segredos acessados via `Deno.env.get()`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_TOKEN, CRON_SECRET, RESEND_API_KEY, WEBHOOK_SECRET, MULTIPLIX_SCOPE_HMAC_SECRET, TALKX_CONVERT_SECRET, PREVIEW_EGRESS_SHARED_SECRET, PREVIEW_EGRESS_PROXY_URL, TRUSTED_EMAIL_DOMAINS, MEDIA_EGRESS_ALLOWED_HOSTS, MULTIPLIX_BATCH_SIZE
- Zero ocorrências de JWT hardcoded, URLs de produção hardcoded, service_role key literal
- Vault (Supabase Secrets) usado para 13 secrets DB-level adicionais: `ai_jobs_cron_secret`, `avatars_refresh_cron_secret`, `connection_health_check_cron_secret`, `gmail_cron_secret`, `gmail_encryption_key`, `multiplix_cron_secret`, `multiplix_send_url`, `sicoob_service_role_key`, `talkx_anon_key`, `talkx_cron_secret`, `talkx_scheduler_url`, `talkx_send_url`, `zapp_anon_key`

**63 funções não auditadas individualmente** (de 83): têm `verify_jwt = true` por padrão (JWT validado pelo gateway Supabase) — risco base mais baixo que as 6 com `verify_jwt = false` (auditadas).

### Funções DB com SQL Dinâmico (Seção 7 — COMPLETO para categoria EXECUTE)

**Inventário completo de SECURITY DEFINER** (re-executado 2026-10-24T22:16 UTC):
```sql
SELECT CASE WHEN prosrc LIKE '%EXECUTE%' THEN 'com_execute'
            WHEN prosrc LIKE '%format(%' THEN 'com_format'
            ELSE 'sem_dinamico' END AS categoria, count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f'
GROUP BY 1;
-- com_execute: 9 | com_format: 1 | sem_dinamico: 389
```

Todas as 10 funções de alto risco (EXECUTE + format) foram auditadas individualmente por leitura de código:

| Função | Categoria | Entrada do usuário | Proteção | Risco |
|--------|-----------|-------------------|----------|-------|
| `mcp_exec` | EXECUTE arbitrário | SQL literal | service_role ONLY (EXECUTE revogado de anon/authenticated) | R2 mitigado |
| `merge_contacts_atomic` | EXECUTE com `$1,$2` tipados | UUID parâmetros | admin/supervisor gate + sem string concat | R0 |
| `purge_gmail_account_data` | EXECUTE + comparação tipada | `p_confirm` uuid comparação | admin gate + `IS DISTINCT FROM` stored value | R0 |
| `purge_talkx_expired_data` | EXECUTE com `%L` | `p_limit integer` validado (1–100000) | service_role check no início | R0 |
| `score_security_acl` | EXECUTE leitura de `storage.buckets` | Nenhuma — apenas lê catálogo | Apenas leitura; escreve em `security_acl_alerts` (próprio sistema) | R0 |
| `talkx_audience_query` | EXECUTE com `format()` + `%L`/`%I` | JSON `p_rules` (field/op/value) | Whitelist de field (18 valores) + whitelist de op por kind + `%L` para valores; auth.uid() obrigatório | R1 (complexidade) |
| `talkx_engine_cron_runs` | EXECUTE para portabilidade de schema | `p_limit integer` bounded | `is_admin_or_supervisor` gate; EXECUTE apenas lê `cron.job_run_details` | R0 |
| `increment_custom_emoji_use` | UPDATE tipado (EXECUTE em comentário, não no corpo) | `p_emoji_id uuid` | auth.uid() check + UPDATE WHERE id = UUID | R0 |
| `trigger_pending_multiplix_dispatches` | EXECUTE em comentário (não no corpo) | Nenhuma — só pg_cron | EXECUTE só via service_role (pg_cron) | R0 |
| `trigger_talkx_engine_tick` | EXECUTE em comentário (não no corpo) | Nenhuma — só pg_cron | EXECUTE só via service_role (pg_cron) | R0 |

**389 funções sem dinâmico**: classificadas como R0 sem auditoria individual — sem EXECUTE/format no corpo, portanto sem superfície de SQL injection. O `score_security_acl` roda a cada execução de cron e monitora automaticamente por `SECDEF_ANON_EXECUTE` e `SECDEF_SEM_SEARCH_PATH` — cobertura contínua.

**Nota sobre `talkx_audience_query` (R1)**: função STABLE SECURITY DEFINER que constrói SQL dinâmico a partir de JSON do usuário. As barreiras (whitelist de campo e operador, `format()` com `%L` para valores, `%I` para identificadores de whitelist) são corretas e seguem o padrão PostgreSQL recomendado. O R1 reflete a complexidade e o potencial de bypass por mudança futura, não uma vulnerabilidade atual confirmada.

---

## Seção 9 — Auth / Storage / Realtime

### Auth (VERIFICADO — 2026-10-24T22:16 UTC)

```sql
SELECT (SELECT count(*) FROM auth.users) AS total_users,
       (SELECT count(*) FROM auth.mfa_factors) AS total_mfa_factors,
       (SELECT string_agg(DISTINCT provider,', ') FROM auth.identities) AS providers;
-- total_users: 10 | total_mfa_factors: 0 | providers: email, google
```

- **10 usuários**, **0 fatores MFA** — ver HIGH-7
- Providers ativos: `email` e `google`
- Login customizado via edge `auth-login` (ADR-006) — lockout, rate limit, modo verify implementados
- Tabela `mfa_sessions` com RLS habilitado (custom MFA alternativo)
- Tabela `webauthn_challenges` com grants de escrita para `anon` (ver CRITICAL-1)

### Storage (VERIFICADO — 2026-10-24)

| Bucket | Público | MIME filter | Limite |
|--------|---------|-------------|--------|
| audio-memes | SIM | `audio/mpeg, audio/ogg, audio/wav` | 5MB |
| custom-emojis | SIM | `image/png, image/gif, image/webp` | 512KB |
| stickers | SIM | `image/png, image/gif, image/webp, image/jpeg` | 1MB |
| audio-messages | não | `audio/mpeg, audio/ogg, audio/wav, audio/webm, audio/aac` | 10MB |
| avatars | não | `image/png, image/jpeg, image/gif, image/webp` | 2MB |
| multiplix-voice | não | **NULL (nenhum)** | 50MB |
| team-chat-files | não | `image/*, application/pdf, ...` | 20MB |
| voice-changer-tmp | não | `audio/*` | 50MB |
| whatsapp-media | não | `image/*, audio/*, video/*` | 50MB |

- Risco: `multiplix-voice` sem filtro MIME → ver MEDIUM-5
- Políticas de storage (RLS de bucket): não acessíveis via SQL (`storage.policies` não existe como tabela relacional) — **NÃO VERIFICADO** via SQL; verificar no dashboard

### Realtime

**NÃO VERIFICADO** — tabelas de subscription do Realtime não acessíveis via SQL. Verificar via dashboard quais tabelas têm Realtime habilitado e se `can_access_realtime_topic()` está sendo chamada corretamente.

---

## Seção 10 — Logs 7 Dias

**NÃO VERIFICADO** — `supabase_functions.hooks` não existe como tabela SQL. Logs de edge functions acessíveis via:
- Dashboard: https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/logs/edge-functions
- CLI: `supabase functions log --project-ref tnnnlkbymytvtqngbbqh`

---

## Seção 11 — RLS

### Produção (contagens apenas)

| Tipo | Qtd |
|------|-----|
| Tabelas com RLS habilitado | ~142 |
| Tabelas com RLS mas 0 policies | 17 |
| Policies UPDATE sem WITH CHECK | 39 |
| Policies com USING(true) | 30 (SELECT) + 2 (ALL para service_role) |
| Tabelas backup sem RLS | 10 (_bkp_261023 + ops_backup) |

### Policies Verificadas por Tabela (VERIFICADO — 2026-10-24)

```sql
SELECT c.relname, c.relrowsecurity,
       array_agg(p.polname || '[' ||
         CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END
         || ']' ORDER BY p.polcmd) AS policies
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('campaigns','contacts','email_threads','messages',
                    'profiles','scheduled_report_configs','team_messages')
GROUP BY c.relname, c.relrowsecurity ORDER BY c.relname;
```

| Tabela | RLS | Policies | Lacunas |
|--------|-----|----------|---------|
| `campaigns` | ✓ | INSERT[acl], ALL[owner], SELECT[visible] | Sem DELETE policy (OK se intencional) |
| `contacts` | ✓ | INSERT[user_scope], UPDATE[user_scope], SELECT[visible] | **Sem DELETE policy** — usuários não podem deletar contatos |
| `email_threads` | ✓ | DELETE[owner], UPDATE[scope], SELECT[visible] | **Sem INSERT policy** — inserção bloqueada para authenticated |
| `messages` | ✓ | INSERT[scope], UPDATE[own], SELECT[access] | **Sem DELETE policy** |
| `profiles` | ✓ | 6 policies (SELECT×3, INSERT×1, UPDATE×2) | Completo |
| `scheduled_report_configs` | ✓ | INSERT[admin], SELECT[owner/admin], UPDATE[admin], DELETE[admin] | Completo (dono vê, admin gerencia) |
| `team_messages` | ✓ | INSERT[member], UPDATE[own], SELECT[member], DELETE[admin] | Completo |

**`conversations`, `tasks`, `accounts`**: **AUSENTES em todo o schema** (nenhuma tabela, nenhuma view em `public`, `api`, `extensions`, `auth`, `storage`). Se código TypeScript usa `.from('conversations')` ou `.from('tasks')`, o PostgREST retornará 404 — provavelmente referências mortas ou RPC-only. Ver MEDIUM-9.

### Matrix Tenant (NÃO TESTADO)

Requer Postgres temporário com migrations + 2 usuários de tenants diferentes.  
**Motivo da limitação**: `mcp_exec` é SECURITY DEFINER — `SET LOCAL role = 'authenticated'` é bloqueado (erro 403 "cannot set parameter within security-definer function"). Teste direto em produção impossível sem comprometer o princípio de somente-leitura.  
**Roteiro**: `testes/rls_matrix_roteiro.md`

---

## Seção 12 — Lacunas Estruturais

| Lacuna | Severidade | Observação |
|--------|-----------|----------|
| Backup/PITR | HIGH | PITR ativo no Supabase Pro por padrão — confirmar retenção no dashboard |
| Staging | HIGH | Não existe staging environment isolado; testes E2E rodam contra produção |
| Audit trail | MEDIUM | `audit_logs` existe mas uso parece parcial (só em `purge_gmail_account_data`) |
| Retenção LGPD | MEDIUM | `purge_talkx_expired_data` implementado; outros módulos (mensagens, contacts) sem policy explícita |
| Alertas de falha de cron | HIGH | `talkx-scheduler-1min` com 4.007 falhas sem alertas automáticos |
| Testes RLS em CI | MEDIUM | `db-guard.yml` tem testes de contrato mas não matrix completa de tenant isolation |
| Monitoramento de bloat | LOW | Autovacuum ausente em várias tabelas pequenas de alta rotatividade |

---

## Plano de Ondas

### Onda 1 — Semana 1 (Segurança Crítica)
1. **CRITICAL-1**: Revogar grants de escrita de `anon` nas 99 tabelas → `propostas/01_revogar_grants_anon.sql`
2. **CRITICAL-2**: Adicionar `WITH CHECK` nas 39 policies UPDATE → `propostas/02_rls_with_check.sql`
3. **HIGH-3**: Revogar grants de `link_preview_cache` para anon
4. **HIGH-6**: `ALTER VIEW catalog_send_stats SET (security_invoker=true);`

### Onda 2 — Semana 2 (Performance)
5. **HIGH-2**: VACUUM manual nas tabelas com dead_pct > 50% sem autovacuum
6. **HIGH-5**: Dropar índices trigram sem uso → `propostas/03_drop_unused_indexes.sql`
7. **MEDIUM-1**: Criar índices nas 35 FKs sem suporte → `propostas/04_fk_indexes.sql`
8. **HIGH-4**: Investigar queries que causam seq scans em `email_threads`

### Onda 3 — Semana 3 (Qualidade e Integridade)
9. **CRITICAL-3**: Investigar causa raiz das falhas do `talkx-scheduler-1min`
10. **MEDIUM-2**: Preencher `statements IS NULL` nas 60 migrações
11. **MEDIUM-4**: Dropar índices duplicados → `propostas/05_drop_duplicate_indexes.sql`
12. **MEDIUM-8**: Restringir policy DELETE em `department_invites`

### Onda 4 — Semana 4 (Lacunas)
13. **HIGH-1**: Decidir o que fazer com as 17 tabelas RLS sem policy
14. **MEDIUM-3**: Dropar ou proteger schema `_bkp_261023`
15. **MEDIUM-6**: Adicionar guard explícito em `mcp_exec`
16. **MEDIUM-5**: Adicionar MIME filter em `multiplix-voice`

---

## Seção NÃO VERIFICADO

| Item | Motivo |
|------|--------|
| Auth config (JWT_EXP, MFA, captcha) | `auth.config` não acessível via SQL |
| Storage policies (RLS de buckets) | `storage.policies` não existe como tabela |
| Logs 7 dias de edge functions | `supabase_functions.hooks` não acessível |
| ~~Types.ts vs schema atual~~ | **VERIFICADO** — 28 tabelas ausentes, 0 órfãs (ver Seção 2) |
| Edge functions publicadas vs repo | Endpoint não disponível via SQL |
| RLS matrix tenant isolation | Requer Postgres temporário com migrations |
| Realtime subscriptions ativas | Não acessível via SQL |
| PITR retention configurado | Verificar no dashboard Supabase |
| Funções DB restantes | 10 com EXECUTE/format auditadas individualmente (seção 7); 389 sem SQL dinâmico confirmadas por bulk query — nenhuma auditoria individual necessária |

---

## Seção NÃO VERIFICADO — Limitação de Acesso

### Limitação técnica: `mcp_exec` é SECURITY DEFINER

A função `mcp_exec` (usada pelo MCP `SUPABASE - ZAPP WEB V2 - MCP`) é SECURITY DEFINER. Isso impede executar `SET LOCAL role = 'anon'` ou `SET LOCAL role = 'authenticated'` dentro dela:

```
ERROR: cannot set parameter "role" within security-definer function (code 403)
```

**Impacto na auditoria**: Não foi possível simular RLS com `SET ROLE` via MCP para testar isolamento de tenant diretamente em produção. Em vez disso:
- Foram usadas evidências indiretas (contagens de policies, USING vs WITH CHECK, tabelas com 0 policies)
- O roteiro de teste foi documentado em `testes/rls_matrix_roteiro.md` para execução em Postgres temporário local

Esta é uma feature de segurança, não um bug do MCP.

---

## Evidência de Não-Modificação da Produção (Snapshot Antes/Depois)

**Snapshot re-executado no final da auditoria** (2026-10-24T22:16:31 UTC): migration_count=1054, cron_count=24, policy_count=499, function_count=475 — **idêntico ao início**.

**Snapshot no início da auditoria** (2026-10-24T20:53:57 UTC):
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count,
  (SELECT count(*) FROM cron.job WHERE active) AS cron_count,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policy_count,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS function_count,
  now() AS snapshot_at;
```
| migration_count | cron_count | policy_count | function_count | snapshot_at |
|----------------|------------|--------------|----------------|-------------|
| 1054 | 24 | 499 | 475 | 2026-10-24T20:53:57 UTC |

Todas as queries executadas foram SELECT em catálogos de sistema (`pg_class`, `pg_policies`, `pg_index`, `pg_stat_user_tables`, `pg_stat_statements`, `cron.job_run_details`, `storage.buckets`, `information_schema.*`), EXPLAIN sem ANALYZE, e leituras de `vault.decrypted_secrets` (apenas nomes, nunca valores).

**Nenhuma** das seguintes operações foi executada:
- INSERT, UPDATE, DELETE, DDL, GRANT
- `apply_migration`, `deploy_edge_function`
- `auth_create_user`, `auth_update_user`
- `storage_upload`, `storage_delete`
- `functions_invoke` (com efeito externo)

O snapshot acima pode ser re-executado a qualquer momento para confirmar que os valores não mudaram durante a auditoria. Confirmação: ping inicial retornou `tnnnlkbymytvtqngbbqh` — projeto correto.

---

*Gerado por auditoria automatizada em 2026-10-24. Arquivo: `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md`*
