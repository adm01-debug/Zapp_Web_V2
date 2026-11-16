# S3 — Segurança: RLS, Grants, SECURITY DEFINER

**Coletado em:** 2026-11-01

## RLS

| Métrica | Valor |
|---|---|
| Tabelas sem RLS | **0** (todas 211 têm RLS) |
| Tabelas com RLS mas sem políticas | **18** |
| Total de políticas | 520 |

## 18 Tabelas com RLS Sem Políticas (inacessíveis via API)

```sql
SELECT tablename FROM pg_tables t
WHERE schemaname = 'public'
  AND rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tablename
  );
-- Resultado: 18 tabelas
```

Tabelas: `_rb_message_reactions_contato_20261007001008`, `_zapp_fn_before`, `_zapp_mig133_log`,
`agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`,
`catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`,
`search_events`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`,
`talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`,
`voip_profile_credentials`

## UPDATE sem WITH CHECK (39 tabelas)

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'UPDATE'
  AND qual IS NOT NULL AND with_check IS NULL;
-- Resultado: 39 policies
```

Tabelas afetadas: `agent_stats`, `ai_conversation_tags`, `ai_providers`, `audit_logs`,
`blocked_ips`, `calls`, `campaign_ab_variants`, `contact_custom_fields`, `contact_purchases`,
`contacts`, `conversation_memory`, `conversation_sla`, `crisis_room_alerts`, `email_messages`,
`email_threads`, `gmail_accounts`, `login_attempts`, `message_templates`, `notifications`,
`nps_surveys`, `number_reputation`, `passkey_credentials`, `payment_links`, `playbooks`,
`sales_deals`, `saved_filters`, `sla_rules`, `talkx_campaign_segments`, `talkx_campaigns`,
`talkx_recipients`, `talkx_templates`, `training_sessions`, `user_devices`,
`user_service_accounts`, `user_sessions`, `user_settings`, `warroom_alerts`,
`webhook_rate_limits`, `whatsapp_connections`

**Risco:** Sem `WITH CHECK`, a policy de UPDATE valida apenas a linha *antes* da atualização
(USING), mas não a linha *depois*. Um usuário malicioso pode mover dados para fora do seu escopo.

## Grants para anon

```sql
SELECT table_name, privilege_type FROM information_schema.table_privileges
WHERE grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  AND table_schema = 'public';
-- Resultado: 1 row
```

| Tabela | Privilege |
|---|---|
| `password_reset_requests` | INSERT |

**Apenas 1 escrita anon** — intencional por policy de reset de senha. ✓

## SECURITY DEFINER

```sql
SELECT 
  count(*) as total_definer,
  count(*) FILTER (WHERE array_to_string(proconfig,'') NOT LIKE '%search_path%') as sem_search_path
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname='public' AND prosecdef=true AND prokind='f';
-- Resultado: {"total_definer": 402, "sem_search_path": 0}
```

**Todas as 402 funções SECURITY DEFINER têm `search_path` configurado.** ✓