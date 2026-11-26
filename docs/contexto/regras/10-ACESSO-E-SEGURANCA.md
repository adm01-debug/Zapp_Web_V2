# 10 · ACESSO E SEGURANÇA — quem pode o quê

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `12371410d5` · branch `main` · 2026-11-26 20:15 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## Perfis / roles identificados

`admin`, `agent`, `anon`, `boolean`, `bwp`, `customer`, `customers_own`, `denied`, `granted`, `intermediary`, `leader`, `next`, `owner`, `postgres`, `role`, `service_role`, `special_agent`, `string`, `supervisor`, `unknown`, `value`

- Tabelas de perfil/permissão: `user_roles`, `queue_members`, `permissions`, `role_permissions`, `team_conversation_members`, `multiplix_audience_members`
- Colunas de perfil: `profiles.role` (text DEFAULT 'agent'), `user_roles.role` (app_role NOT NULL), `whatsapp_groups.is_admin` (boolean | null), `role_permissions.role` (Database["public"]["Enums"]["app_role"] not null), `department_invitations.role` (text NOT NULL DEFAULT 'agent')
- Claims do JWT usados em políticas/funções: `email`
- Funções usadas dentro de políticas RLS (a regra real está no corpo delas — veja `06`): `can_access_realtime_topic`, `can_edit_contact`, `can_insert_team_conversation_member`, `can_manage_contacts`, `current_profile_id`, `foldername`, `get_profile_id_for_user`, `get_visible_agent_ids`, `has_role`, `is_admin`, `is_admin_or_supervisor`, `is_contact_visible_to_user`, `is_last_team_conversation_owner`, `is_privileged_contact_caller`, `is_team_conversation_member`, `uid`

## Matriz tabela × operação → quem pode (derivada das políticas RLS)

| Tabela | RLS | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `_rb_message_reactions_contato_20261007001008` | enabled | — | — | — | — |
| `_rb_message_reactions_one_per_agent_20261107121000` | enabled | anon, authenticated: false | anon, authenticated: false | anon, authenticated: false | anon, authenticated: false |
| `_zapp_fn_before` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `_zapp_mig133_log` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_achievements` | enabled | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | — | — |
| `agent_mini_game_xp_daily` | enabled | — | — | — | — |
| `agent_presence` | enabled | authenticated: true | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | — |
| `agent_skills` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `agent_stats` | enabled | authenticated: profile_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())) AND ( is_admin_or_ | authenticated: public.is_admin_or_supervisor(auth.uid()) | — |
| `agent_visibility_grants` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.has_role(auth.uid(), 'agent'::public.app_role) AND agent_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = a | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `ai_budget_reservations` | enabled | — | — | — | — |
| `ai_conversation_tags` | enabled | authenticated: contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN ( SELECT p.id FROM public.profiles p WHERE p.user_i | authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR  | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: EXISTS ( SELECT 1 FROM public.contacts c JOIN public.profiles p ON p.id = c.assigned_to WHERE c.id = ai_conversation_tags.con |
| `ai_jobs` | enabled | — | — | — | — |
| `ai_model_prices` | enabled | authenticated: true | — | — | — |
| `ai_providers` | enabled | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) |
| `ai_usage_logs` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: user_id = auth.uid() | service_role: true | — | — |
| `ai_usage_outbox` | enabled | service_role: true | service_role: true | service_role: true | service_role: true |
| `allowed_countries` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin(auth.uid()) | — | authenticated: is_admin(auth.uid()) |
| `app_settings` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid() AS uid) AND ur.role = 'admin'::public.app_r | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid() AS uid) AND ur.role = 'admin'::public.app_r | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid() AS uid) AND ur.role = 'admin'::public.app_r | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid() AS uid) AND ur.role = 'admin'::public.app_r |
| `assistant_profiles` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | — |
| `audio_meme_favorites` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `audio_memes` | enabled | authenticated: true | authenticated: uploaded_by = auth.uid() | authenticated: (uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: uploaded_by = auth.uid() OR public.is_admin_or_supervisor(auth.uid()) |
| `audit_logs` | enabled | authenticated: (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)) | authenticated: false<br>authenticated: false | authenticated: false | authenticated: false |
| `auth.users` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `auto_close_config` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `automations` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `away_message_log` | enabled | — | — | — | — |
| `away_messages` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `blocked_countries` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin(auth.uid()) | — | authenticated: is_admin(auth.uid()) |
| `blocked_ips` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::public.app_role | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `business_hours` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `calls` | enabled | authenticated: agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: agent_id = public.get_profile_id_for_user(auth.uid()) AND ( public.is_admin_or_supervisor(auth.uid()) OR contact_id IS NULL O | authenticated: agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | — |
| `campaign_ab_variants` | enabled | authenticated: auth.uid() IS NOT NULL | authenticated: EXISTS ( SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.created_by = get_profile_id_for_user(auth.uid()) OR | authenticated: EXISTS ( SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.created_by = get_profile_id_for_user(auth.uid()) OR | authenticated: EXISTS ( SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.created_by = get_profile_id_for_user(auth.uid()) OR |
| `campaign_contacts` | enabled | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `campaigns` | enabled | authenticated: true<br>authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) OR created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `catalog_favorites` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `catalog_rate_limit_hits` | enabled | — | — | — | — |
| `catalog_rate_limits` | enabled | — | — | — | — |
| `catalog_send_events` | enabled | authenticated: agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | — | — |
| `channel_connections` | enabled | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) |
| `channel_routing_rules` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `chatbot_executions` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `chatbot_flows` | enabled | authenticated: true<br>authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `city_whitelist` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `client_wallet_rules` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `connection_alert_preferences` | enabled | authenticated: user_id = (SELECT auth.uid()) | authenticated: user_id = (SELECT auth.uid()) | authenticated: user_id = (SELECT auth.uid()) | authenticated: user_id = (SELECT auth.uid()) |
| `connection_health_logs` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin(auth.uid()) | — | authenticated: is_admin(auth.uid()) |
| `contact_block_audit` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: false | authenticated: false | authenticated: false |
| `contact_custom_fields` | enabled | authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN ( SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() | authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR  | authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR  | authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR  |
| `contact_deletion_audit` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: false | authenticated: false | authenticated: false |
| `contact_identity_map` | enabled | authenticated: is_admin_or_supervisor(auth.uid()) | — | — | — |
| `contact_notes` | enabled | authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT profiles.id FROM profiles WHERE profiles.user_id =<br>authenticated: public.is_contact_visible_to_user(contact_id, auth.uid()) | authenticated: author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())<br>authenticated: author_id = public.get_profile_id_for_user(auth.uid()) AND public.is_contact_visible_to_user(contact_id, auth.uid()) | authenticated: author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())<br>authenticated: author_id = public.get_profile_id_for_user(auth.uid()) AND public.is_contact_visible_to_user(contact_id, auth.uid()) | authenticated: author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())<br>authenticated: author_id = public.get_profile_id_for_user(auth.uid()) AND public.is_contact_visible_to_user(contact_id, auth.uid()) |
| `contact_protection_policy` | enabled | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) |
| `contacts` | enabled | authenticated: public.can_edit_contact(assigned_to, queue_id, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v), (SELECT | authenticated: public.is_admin_or_supervisor(auth.uid()) OR ( assigned_to IS NOT NULL AND assigned_to IN ( SELECT id FROM public.profiles WH | authenticated: public.can_edit_contact(assigned_to, queue_id, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v), (SELECT | — |
| `conversation_analyses` | enabled | authenticated: contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN ( SELECT p.id FROM public.profiles p WHERE p.user_i | authenticated: analyzed_by = public.get_profile_id_for_user(auth.uid()) AND public.is_contact_visible_to_user(contact_id, auth.uid()) | — | — |
| `conversation_closures` | enabled | authenticated: is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: public.is_contact_visible_to_user(contact_id, auth.uid()) AND closed_by IS NOT DISTINCT FROM public.get_profile_id_for_user(a | — | — |
| `conversation_events` | enabled | authenticated: is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: public.is_contact_visible_to_user(contact_id, auth.uid()) AND ( public.is_admin_or_supervisor(auth.uid()) OR performed_by IS  | — | — |
| `conversation_memory` | enabled | authenticated: is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: public.is_contact_visible_to_user(contact_id, auth.uid()) | authenticated: public.is_contact_visible_to_user(contact_id, auth.uid()) | — |
| `conversation_sla` | enabled | authenticated: is_admin_or_supervisor(auth.uid()) OR contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_v | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | — |
| `conversation_snoozes` | enabled | authenticated: snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | authenticated: snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contact | — | authenticated: snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) |
| `conversation_tasks` | enabled | authenticated: created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid())<br>authenticated: contact_id IS NOT NULL AND public.is_contact_visible_to_user(contact_id, auth.uid()) | authenticated: created_by = public.current_profile_id() AND (contact_id IS NULL OR public.is_contact_visible_to_user(contact_id, auth.uid()) | authenticated: created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()) | authenticated: created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()) |
| `copilot_conversation_scores` | enabled | authenticated: scored_by = auth.uid() OR conversation_id IN (SELECT conversation_id FROM public.copilot_sessions WHERE profile_id = auth.uid | authenticated: scored_by = auth.uid() AND public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | — |
| `copilot_feedback` | enabled | authenticated: created_by = auth.uid() | authenticated: created_by = auth.uid() | — | — |
| `copilot_help_requests` | enabled | authenticated: seller_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()) | authenticated: seller_id = auth.uid() | — | — |
| `copilot_insight_feedback` | enabled | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true |
| `copilot_insights` | enabled | authenticated: session_id IN ( SELECT id FROM public.copilot_sessions WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = au<br>service_role: true<br>public: profile_id = auth.uid()<br>service_role: true | service_role: true<br>public: profile_id = auth.uid()<br>service_role: true | service_role: true<br>public: profile_id = auth.uid()<br>service_role: true | service_role: true<br>public: profile_id = auth.uid()<br>service_role: true |
| `copilot_learning_moments` | enabled | authenticated: tagged_by = auth.uid() OR conversation_id IN (SELECT conversation_id FROM public.copilot_sessions WHERE profile_id = auth.uid | authenticated: tagged_by = auth.uid() AND public.is_admin_or_supervisor(auth.uid()) | — | — |
| `copilot_objection_catalog` | enabled | authenticated: true | authenticated: submitted_by = auth.uid() | — | — |
| `copilot_outcomes` | enabled | authenticated: seller_id = auth.uid() | authenticated: seller_id = auth.uid() | — | — |
| `copilot_presence` | enabled | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())<br>service_role: true | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())<br>service_role: true | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())<br>service_role: true | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())<br>service_role: true |
| `copilot_retention_aggregates` | enabled | service_role: true<br>authenticated: profile_id = auth.uid()<br>service_role: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | service_role: true<br>service_role: true | service_role: true<br>service_role: true | service_role: true<br>service_role: true |
| `copilot_seller_settings` | enabled | authenticated: seller_id = auth.uid() | authenticated: seller_id = auth.uid() | authenticated: seller_id = auth.uid() | — |
| `copilot_sessions` | enabled | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true<br>public: profile_id = auth.uid()<br>service_role: true | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true<br>public: profile_id = auth.uid()<br>service_role: true | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true<br>public: profile_id = auth.uid()<br>service_role: true | authenticated: profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )<br>service_role: true<br>public: profile_id = auth.uid()<br>service_role: true |
| `copilot_usage` | enabled | authenticated: seller_id = auth.uid() | authenticated: seller_id = auth.uid() | — | — |
| `crisis_room_alerts` | enabled | authenticated: auth.uid() IS NOT NULL | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `crm_contact_links` | enabled | authenticated: public.is_contact_visible_to_user(zapp_contact_id, auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `crm_sync_outbox` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `csat_auto_config` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `csat_surveys` | enabled | authenticated: agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: agent_id IS NULL OR agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.ui | — | — |
| `custom_emojis` | enabled | authenticated: true | authenticated: uploaded_by = auth.uid() | authenticated: (uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: (uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()) |
| `deal_activities` | enabled | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) OR performed_by = public.get_profile_id_for_user(auth.uid()) OR deal_id IN ( SELECT | authenticated: performed_by = public.get_profile_id_for_user(auth.uid()) AND ( public.is_admin_or_supervisor(auth.uid()) OR deal_id IN ( SEL | — | — |
| `department_audit_logs` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.profiles p WHERE p.id = current_profile_id() AND p.department_id = department_audit_logs.depart | — | — | — |
| `department_invitations` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) |
| `department_invites` | enabled | authenticated: public.is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) AND ( created_by IS NULL OR created_by IN ( SELECT p.id FROM public.profiles p WHERE p.user_id = auth.ui | — | authenticated: is_admin(auth.uid()) |
| `departments` | enabled | authenticated: true<br>authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) |
| `edge_rate_limits` | enabled | — | — | — | — |
| `email_attachments` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.email_messages em JOIN public.gmail_accounts ga ON ga.id = em.gmail_account_id WHERE em.id = em | service_role: true | — | — |
| `email_labels` | enabled | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin<br>authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) |
| `email_messages` | enabled | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | — | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | — |
| `email_signatures` | enabled | authenticated: user_id = (select auth.uid()) | authenticated: user_id = (select auth.uid()) | authenticated: user_id = (select auth.uid()) | authenticated: user_id = (select auth.uid()) |
| `email_threads` | enabled | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | — | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) | authenticated: EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()) |
| `entity_versions` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: false | — | — |
| `favorite_contacts` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id) | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `feature_flags` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) |
| `followup_executions` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `followup_sequences` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `followup_steps` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `geo_blocking_settings` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `global_settings` | enabled | authenticated: is_admin(auth.uid())<br>authenticated: is_admin(auth.uid()) OR ( is_admin_or_supervisor(auth.uid()) AND key !~ '(_api_key\|_secret\|_token)$' ) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `gmail_accounts` | enabled | authenticated: user_id = auth.uid() | authenticated: false | authenticated: false | authenticated: false |
| `gmail_oauth_states` | enabled | — | — | — | — |
| `goals_configurations` | enabled | authenticated: profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())<br>authenticated: profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) |
| `instance_pauses` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `ip_whitelist` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `knowledge_base_articles` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: is_published = true OR public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `knowledge_base_files` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: article_id IN (SELECT a.id FROM knowledge_base_articles a WHERE a.is_published = true) OR is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `link_preview_cache` | enabled | — | — | — | — |
| `link_preview_cache_metrics` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | service_role: true | — | — |
| `login_attempts` | enabled | public: is_admin_or_supervisor(auth.uid()) | authenticated: false | authenticated: false | authenticated: is_admin_or_supervisor(auth.uid()) |
| `message_attempts` | enabled | authenticated: public.is_admin(auth.uid()) | — | — | — |
| `message_favorites` | enabled | authenticated: user_id = (select auth.uid()) | authenticated: user_id = (select auth.uid()) and exists ( select 1 from public.messages m where m.id = message_id and public.is_contact_visi | — | authenticated: user_id = (select auth.uid()) |
| `message_pins` | enabled | authenticated: public.is_contact_visible_to_user(contact_id, (select auth.uid())) | — | — | — |
| `message_reactions` | enabled | authenticated: message_id IN ( SELECT m.id FROM messages m WHERE m.contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN ( SELE<br>authenticated: public.is_admin_or_supervisor(auth.uid()) OR user_id = public.get_profile_id_for_user(auth.uid()) OR contact_id IN ( SELECT c | authenticated: user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c | authenticated: user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c | authenticated: user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c |
| `message_reports` | enabled | authenticated: reporter_id = (select auth.uid()) or public.is_admin_or_supervisor((select auth.uid())) | — | authenticated: public.is_admin_or_supervisor((select auth.uid())) | — |
| `message_templates` | enabled | authenticated: user_id = auth.uid() OR is_global = true | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `messages` | enabled | authenticated: is_admin_or_supervisor(auth.uid()) OR contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_v | authenticated: public.is_privileged_contact_caller() OR ( sender = 'agent' AND ( is_admin_or_supervisor(auth.uid()) OR ( (agent_id IS NULL O | authenticated: contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid())) ) | — |
| `meta_capi_events` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `mfa_sessions` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `multiplix_audience_members` | forced | authenticated: EXISTS ( SELECT 1 FROM public.multiplix_audiences ma WHERE ma.id = multiplix_audience_members.audience_id AND ( ma.owner_id = | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_audiences ma WHERE ma.id = multiplix_au | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_audiences ma WHERE ma.id = multiplix_au | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_audiences ma WHERE ma.id = multiplix_au |
| `multiplix_audiences` | forced | authenticated: owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1) OR EXISTS ( SELECT 1 FROM un | authenticated: public.is_admin_or_supervisor(auth.uid()) AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = au | authenticated: public.is_admin_or_supervisor(auth.uid()) AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = au | authenticated: public.is_admin_or_supervisor(auth.uid()) AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = au |
| `multiplix_blocks` | forced | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_b | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_b | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_b | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_b |
| `multiplix_delivery_items` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_delivery_items.dispatch_id AND ( md.created_by  | — | — | — |
| `multiplix_dispatches` | forced | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1) | — | — | authenticated: public.is_admin_or_supervisor(auth.uid()) AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id =  |
| `multiplix_events` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_events.dispatch_id AND ( md.created_by = (SELEC | — | — | — |
| `multiplix_recipients` | forced | authenticated: EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_recipients.dispatch_id AND ( md.created_by = (S | — | — | authenticated: public.is_admin_or_supervisor(auth.uid()) AND EXISTS ( SELECT 1 FROM public.multiplix_dispatches md WHERE md.id = multiplix_r |
| `multiplix_voice_assets` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.multiplix_voice_grants g WHERE g.voice_id = multiplix_voice_assets.voice_id AND g.revoked_at IS | — | — | — |
| `multiplix_voice_grants` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: revoked_at IS NULL AND ( (roles IS NOT NULL AND EXISTS ( SELECT 1 FROM unnest(multiplix_voice_grants.roles) r(r) WHERE public | — | — | — |
| `notifications` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = (SELECT auth.uid()) AND type = 'goal' AND is_read IS FALSE AND read_at IS NULL AND created_at BETWEEN now() - inter | authenticated: user_id = (SELECT auth.uid())<br>authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `nps_surveys` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) OR agent_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) | authenticated: agent_id IS NOT NULL AND agent_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() ) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `number_reputation` | enabled | authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | — |
| `ops.hermes_change_log` | enabled | service_role: true | service_role: true | service_role: true | service_role: true |
| `optout_call_log` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `outbox_events` | enabled | service_role: true | service_role: true | service_role: true | service_role: true |
| `passkey_credentials` | enabled | authenticated: user_id = auth.uid() | — | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `password_reset_requests` | enabled | authenticated: false | anon: user_id IS NOT NULL AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL AND token_expi<br>authenticated: user_id = auth.uid() | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) |
| `performance_snapshots` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) | authenticated: profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) | — | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `permissions` | enabled | authenticated: is_admin(auth.uid())<br>authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `pinned_conversations` | enabled | authenticated: pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) | authenticated: pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts | authenticated: pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) | authenticated: pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) |
| `playbooks` | enabled | authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `products` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `profiles` | enabled | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: user_id = auth.uid() | authenticated: auth.uid() = user_id AND (role IS NULL OR role = 'agent') AND (access_level IS NULL OR access_level = 'basic') AND (permissio | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: auth.uid() = user_id<br>authenticated: is_admin_or_supervisor(auth.uid()) OR ( role = (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid()) AND access_level  | — |
| `prova_anterior` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `prova_hz503_asserts` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `qr_attempts` | enabled | authenticated: exists ( select 1 from public.whatsapp_connections c where c.id = qr_attempts.connection_id ) | — | — | — |
| `query_telemetry` | enabled | — | authenticated: user_id = auth.uid() | — | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `queue_goals` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `queue_members` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) OR profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `queue_positions` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `queue_skill_requirements` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `queues` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `rate_limit_configs` | enabled | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `rate_limit_logs` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — |
| `reconnection_logs` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `reminders` | enabled | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | authenticated: profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) |
| `role_permissions` | enabled | authenticated: is_admin(auth.uid())<br>authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `sales_deals` | enabled | authenticated: is_admin_or_supervisor(auth.uid()) OR assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | authenticated: assigned_to IS NULL OR assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(a | authenticated: assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `sales_pipeline_stages` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `saved_filters` | enabled | authenticated: user_id = auth.uid()<br>authenticated: is_shared = true | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `scheduled_messages` | enabled | authenticated: created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) | authenticated: created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) | authenticated: created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()) |
| `scheduled_report_configs` | enabled | authenticated: public.is_admin(auth.uid()) OR created_by = public.get_profile_id_for_user(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) AND ( public.is_admin(auth.uid()) OR created_by IS NULL OR created_by = public.get_ | authenticated: public.is_admin(auth.uid()) OR created_by = public.get_profile_id_for_user(auth.uid()) | authenticated: public.is_admin(auth.uid()) OR created_by = public.get_profile_id_for_user(auth.uid()) |
| `scheduled_reports` | enabled | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `search_events` | enabled | — | — | — | — |
| `searchbox_budget_alert_cron` | enabled | — | — | — | — |
| `searchbox_budget_alert_emails` | enabled | — | — | — | — |
| `security_acl_alerts` | enabled | authenticated: public.is_admin(auth.uid()) | — | — | — |
| `security_alerts` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `sicoob_contact_mapping` | enabled | — | authenticated: is_admin_or_supervisor(auth.uid()) | — | — |
| `sla_alert_events` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) OR public.is_contact_visible_to_user(contact_id, auth.uid()) | — | — | — |
| `sla_alert_preferences` | disabled | authenticated: user_id = auth.uid() | sem RLS | sem RLS | sem RLS |
| `sla_configurations` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `sla_rules` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `stickers` | enabled | authenticated: true | authenticated: uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()) | authenticated: uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()) | authenticated: uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()) |
| `storage.buckets` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `storage.objects` | não encontrado | authenticated: (bucket_id = 'stickers'::text)<br>authenticated: (bucket_id = 'audio-memes'::text)<br>authenticated: (bucket_id = 'custom-emojis'::text)<br>authenticated: bucket_id = 'avatars'<br>authenticated: bucket_id = 'whatsapp-media' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN ( SELECT c.id::text<br>authenticated: bucket_id = 'audio-messages' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN ( SELECT c.id::text<br>authenticated: objects.bucket_id = 'team-chat-files' AND ( public.is_admin_or_supervisor(auth.uid()) OR (storage.foldername(objects.name))[1<br>authenticated: bucket_id = 'voice-changer-tmp' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid(<br>authenticated: bucket_id = 'audio-messages' and exists ( select 1 from public.whisper_messages as w where w.audio_path = storage.objects.nam<br>authenticated: objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text]) AND EXISTS ( SELECT 1 FROM public.messages m  | authenticated: ((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())<br>authenticated: ((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::tex<br>authenticated: ((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (<br>authenticated: ((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (<br>authenticated: bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text<br>authenticated: bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid()))<br>authenticated: bucket_id = 'audio-memes' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::te<br>authenticated: bucket_id = 'voice-changer-tmp' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid( | authenticated: ((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (<br>authenticated: ((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())<br>authenticated: ((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::tex<br>authenticated: bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid()))<br>authenticated: bucket_id = 'audio-memes' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::te<br>authenticated: bucket_id = 'voice-changer-tmp' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid( | authenticated: ((bucket_id = 'team-chat-files'::text) AND is_admin_or_supervisor(auth.uid()))<br>authenticated: ((bucket_id = 'audio-messages'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))<br>authenticated: ((bucket_id = 'custom-emojis'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))<br>authenticated: ((bucket_id = 'stickers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))<br>authenticated: ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))<br>authenticated: ((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (<br>authenticated: bucket_id = 'audio-memes' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::te<br>authenticated: bucket_id = 'voice-changer-tmp' and ( public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid(<br>authenticated: bucket_id = 'audio-memes' AND public.is_admin_or_supervisor((SELECT auth.uid()))<br>authenticated: bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text |
| `supabase_migrations.version_reservations` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `tags` | enabled | authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: created_by IS NULL OR created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(aut | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `talkx_ai_requests` | enabled | authenticated: COALESCE(public.is_admin_or_supervisor(auth.uid()), false) | — | — | — |
| `talkx_alerts` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `talkx_blacklist` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: false |
| `talkx_campaign_events` | enabled | authenticated: EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id AND (tc.created_by = (SELECT  | authenticated: event_type IN ('note', 'checklist', 'segments_reviewed') AND ( EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id =  | — | — |
| `talkx_campaign_segments` | enabled | public: public.is_admin_or_supervisor(auth.uid())<br>public: exists ( select 1 from public.talkx_campaigns c where c.id = campaign_id and c.created_by = (select p.id from public.profiles p wher | public: public.is_admin_or_supervisor(auth.uid()) and exists ( select 1 from public.talkx_campaigns c where c.id = campaign_id and c.created | public: exists ( select 1 from public.talkx_campaigns c where c.id = campaign_id and c.created_by = (select p.id from public.profiles p wher | public: exists ( select 1 from public.talkx_campaigns c where c.id = campaign_id and c.created_by = (select p.id from public.profiles p wher |
| `talkx_campaigns` | enabled | authenticated: created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) AND public.is_admin_or_supervisor(auth.uid() | authenticated: created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) AND public.is_admin_or_supervisor(auth.uid() | authenticated: created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) AND public.is_admin_or_supervisor(auth.uid() |
| `talkx_contact_attributes` | enabled | authenticated: public.can_manage_contacts(auth.uid()) OR public.is_contact_visible_to_user(contact_id, auth.uid()) | — | — | — |
| `talkx_conversions` | enabled | authenticated: campaign_id IN ( SELECT tc.id FROM public.talkx_campaigns tc WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE  | — | — | — |
| `talkx_data_jobs` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `talkx_ddd_regions` | enabled | authenticated, service_role: true | — | — | — |
| `talkx_delivery_log` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `talkx_help_views` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | — | — |
| `talkx_link_clicks` | enabled | authenticated: link_id IN ( SELECT tl.id FROM public.talkx_links tl JOIN public.talkx_campaigns tc ON tc.id = tl.campaign_id WHERE tc.create | — | — | — |
| `talkx_links` | enabled | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: campaign_id IN ( SELECT tc.id FROM public.talkx_campaigns tc WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE  | — | — | — |
| `talkx_optout_keywords` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) | authenticated: public.is_admin(auth.uid()) |
| `talkx_recipients` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND (tc.created_by = (SELECT id FROM public.profil | authenticated: EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND tc.created_by = (SELECT id FROM public.profile | authenticated: EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND tc.created_by = (SELECT id FROM public.profile | authenticated: EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND tc.created_by = (SELECT id FROM public.profile |
| `talkx_segment_fields` | enabled | authenticated: true<br>service_role: true | service_role: true | service_role: true | service_role: true |
| `talkx_segment_library_history` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | — | — | — |
| `talkx_segment_versions` | enabled | authenticated: exists ( select 1 from public.talkx_segments s where s.id = talkx_segment_versions.segment_id and ( s.created_by = (select p. | — | — | — |
| `talkx_segments` | enabled | authenticated: (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)) OR is_admin_or_supervisor(auth.uid()) | authenticated: created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1) | authenticated: (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)) OR is_admin_or_supervisor(auth.uid()) | authenticated: (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)) OR is_admin_or_supervisor(auth.uid()) |
| `talkx_settings` | enabled | authenticated: true | — | authenticated: public.is_admin_or_supervisor(auth.uid()) | — |
| `talkx_storage_purge_queue` | enabled | — | — | — | — |
| `talkx_suppression_reasons` | enabled | authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | — |
| `talkx_template_variants` | enabled | authenticated: auth.uid() IS NOT NULL | authenticated: EXISTS ( SELECT 1 FROM public.talkx_templates AS template WHERE template.id = talkx_template_variants.template_id AND ( templ | authenticated: EXISTS ( SELECT 1 FROM public.talkx_templates AS template WHERE template.id = talkx_template_variants.template_id AND ( templ | authenticated: EXISTS ( SELECT 1 FROM public.talkx_templates AS template WHERE template.id = talkx_template_variants.template_id AND ( templ |
| `talkx_template_versions` | enabled | authenticated: auth.uid() IS NOT NULL AND EXISTS ( SELECT 1 FROM public.talkx_templates template WHERE template.id = talkx_template_versions | — | — | — |
| `talkx_templates` | enabled | public: auth.uid() IS NOT NULL | public: created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) | public: created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()) | public: created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()) |
| `talkx_test_send_claims` | enabled | — | — | — | — |
| `talkx_test_sends` | enabled | authenticated: auth.uid() = created_by OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')<br>service_role: true | service_role: true | service_role: true | service_role: true |
| `team_chat_media_acl_r2_db_020_rb` | enabled | — | — | — | — |
| `team_conversation_members` | enabled | authenticated: public.is_team_conversation_member(auth.uid(), team_conversation_members.conversation_id) | authenticated: public.can_insert_team_conversation_member( team_conversation_members.conversation_id, team_conversation_members.profile_id,  | authenticated: profile_id = public.current_profile_id() | authenticated: ( profile_id = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()) ) AND NOT public.is_last_team_convers |
| `team_conversations` | enabled | authenticated: public.is_team_conversation_member(auth.uid(), id) OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth | authenticated: created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) | authenticated: created_by = public.current_profile_id() | authenticated: created_by = current_profile_id() OR is_admin_or_supervisor(auth.uid()) |
| `team_message_reactions` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.team_messages tm JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversa<br>authenticated: EXISTS (SELECT 1 FROM public.team_conversation_members tcm JOIN public.team_messages tm ON tm.id = team_message_reactions.mes | authenticated: EXISTS ( SELECT 1 FROM public.profiles p WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid() ) AND EXIS | — | authenticated: EXISTS ( SELECT 1 FROM public.profiles p WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid() )<br>authenticated: profile_id = public.current_profile_id() |
| `team_message_receipts` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) OR EXISTS ( SELECT 1 FROM public.team_conversation_members mem JOIN public.team_mes | authenticated: (profile_id = public.current_profile_id()) AND EXISTS ( SELECT 1 FROM public.team_conversation_members mem JOIN public.team_m | authenticated: profile_id = public.current_profile_id() | — |
| `team_messages` | enabled | authenticated: public.is_team_conversation_member(auth.uid(), conversation_id) | authenticated: public.is_team_conversation_member(auth.uid(), conversation_id) AND sender_id = (SELECT p.id FROM public.profiles p WHERE p.u | authenticated: sender_id = current_profile_id() | authenticated: sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) |
| `training_sessions` | enabled | authenticated: profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()) | authenticated: profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()) |
| `user_devices` | enabled | authenticated: user_id = auth.uid()<br>authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `user_roles` | enabled | authenticated: user_id = auth.uid() OR is_admin_or_supervisor(auth.uid())<br>authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) | authenticated: public.has_role(auth.uid(), 'admin'::public.app_role) |
| `user_service_accounts` | enabled | authenticated: auth.uid() = user_id<br>authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `user_sessions` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `user_settings` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | — |
| `vault.decrypted_secrets` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `voice_command_logs` | enabled | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id | — | authenticated: auth.uid() = user_id |
| `voip_profile_credentials` | enabled | — | — | — | — |
| `warroom_alerts` | enabled | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `webauthn_challenges` | enabled | authenticated: user_id = auth.uid()<br>anon: false | authenticated: user_id = auth.uid()<br>anon: false | authenticated: user_id = auth.uid()<br>anon: false | authenticated: user_id = auth.uid()<br>anon: false |
| `webhook_failures` | enabled | service_role: true | service_role: true | service_role: true | service_role: true |
| `webhook_rate_limits` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `whatsapp_connection_queues` | enabled | authenticated: true<br>authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) | authenticated: is_admin(auth.uid()) |
| `whatsapp_connections` | enabled | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin(auth.uid()) |
| `whatsapp_flows` | enabled | authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: true | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `whatsapp_groups` | enabled | public: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: true<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | public: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | public: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | public: true<br>authenticated: public.is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) |
| `whatsapp_templates` | enabled | authenticated: true<br>authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid())<br>authenticated: public.is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) | authenticated: is_admin_or_supervisor(auth.uid()) |
| `whisper_messages` | enabled | authenticated: sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR target_agent_id IN (SELECT id FROM profiles WHERE user_i | authenticated: public.is_admin_or_supervisor(auth.uid()) OR ( sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) AND p | — | authenticated: public.is_admin_or_supervisor(auth.uid()) |

> `—` com RLS ligado = ninguém além de service_role. `sem RLS` = qualquer chave anon lê/escreve tudo.

## Onde o RLS é IGNORADO (service_role) — 1207 arquivo(s)

- `analise-prs/resgate-261118-lote2/scripts/db-audit/validate-post-apply.mjs`
- `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193300_copilot_tick_trigger.sql`
- `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193400_copilot_presence.sql`
- `analise-prs/resgate-261118-lote2/supabase/migrations/20261016250000_e2e_fixture_message_rpc.sql`
- `analise-prs/resgate-261118-lote2/supabase/migrations/20261101133000_outbound_post_started.sql`
- `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193000_copilot_sessions.sql`
- `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193100_copilot_insights.sql`
- `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193200_copilot_feedback.sql`
- `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193500_copilot_retention.sql`
- `analise-prs/resgate-regra8-261118/supabase/migrations/20261108180200_copilot_retention.sql`
- `auditoria-supabase/propostas/FIX-S03-001.sql`
- `auditoria-supabase/propostas/FIX-S03-002.sql`
- `auditoria-supabase/propostas/FIX-S09-002.sql`
- `docs/_arquivo/auditoria-supabase-261022/propostas/01_revogar_grants_anon.sql`
- `docs/_arquivo/auditoria-supabase-261022/propostas/P003_log_search_event_rpc.sql`
- `docs/_arquivo/auditoria-supabase/propostas/01_revogar_grants_anon.sql`
- `docs/_arquivo/copilot-presence-261108/20261108180100_copilot_presence.sql`
- `docs/contexto/supabase/functions/public/admin_set_role__582c15feaee5796c.sql`
- `docs/contexto/supabase/functions/public/agent_workload__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/apply_client_wallet__0d066d155db16327.sql`
- `docs/contexto/supabase/functions/public/attribute_multiplix_item_reply__b4af9183a9429722.sql`
- `docs/contexto/supabase/functions/public/attribute_talkx_reply__866c23a24c581eeb.sql`
- `docs/contexto/supabase/functions/public/audit_operational_config__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/audit_role_changes__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/auto_pause_instance__6435bf144022d7d8.sql`
- `docs/contexto/supabase/functions/public/cancel_ai_job__ebebdaa06ebad8d3.sql`
- `docs/contexto/supabase/functions/public/catalog_rate_limit_hit__48bf74d76645f5d5.sql`
- `docs/contexto/supabase/functions/public/claim_ai_jobs__b956911a90c67ce6.sql`
- `docs/contexto/supabase/functions/public/claim_multiplix_item__829e5d9a73c61564.sql`
- `docs/contexto/supabase/functions/public/claim_multiplix_recipient__933fac74a30f578c.sql`
- `docs/contexto/supabase/functions/public/claim_outbound_message__f95353c7fcd08fb9.sql`
- `docs/contexto/supabase/functions/public/claim_talkx_campaign_worker__6f24dcd90b83c762.sql`
- `docs/contexto/supabase/functions/public/claim_talkx_recipient__f4ff355db4ff56db.sql`
- `docs/contexto/supabase/functions/public/cleanup_crm_sync_outbox__42af59d86530ab39.sql`
- `docs/contexto/supabase/functions/public/cleanup_expired_challenges__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/cleanup_link_preview_cache__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/clear_login_attempts__76367500c0f12840.sql`
- `docs/contexto/supabase/functions/public/close_conversation_atomic__a620498c1e744fc1.sql`
- `docs/contexto/supabase/functions/public/complete_multiplix_dispatch_if_drained__e47bebaa47e14060.sql`
- `docs/contexto/supabase/functions/public/complete_multiplix_dispatch_if_items_drained__e47bebaa47e14060.sql`
- `docs/contexto/supabase/functions/public/complete_multiplix_item__f6360936301964e6.sql`
- `docs/contexto/supabase/functions/public/complete_multiplix_recipient__b9fa26869bebe842.sql`
- `docs/contexto/supabase/functions/public/complete_outbound_message__c04023810b68c2c6.sql`
- `docs/contexto/supabase/functions/public/complete_talkx_campaign_if_drained__bb5b5d5e016ff1cd.sql`
- `docs/contexto/supabase/functions/public/complete_talkx_recipient__b9fa26869bebe842.sql`
- `docs/contexto/supabase/functions/public/consume_gmail_oauth_state__0a3eb87b280e4eff.sql`
- `docs/contexto/supabase/functions/public/contacts_stats_series__bd30c5008cd18937.sql`
- `docs/contexto/supabase/functions/public/conversation_event_assign_performed_by__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/dashboard_daily_series__aa8f423a2caaa305.sql`
- `docs/contexto/supabase/functions/public/dispatch_scheduled_messages__392a67ea4728569f.sql`
- `docs/contexto/supabase/functions/public/enforce_contacts_consent_status_guard__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/enforce_multiplix_dispatch_mutability__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/enforce_talkx_campaign_mutability__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/enqueue_ai_job__16bc85689a344443.sql`
- `docs/contexto/supabase/functions/public/fail_outbound_message__286c0ab80a955938.sql`
- `docs/contexto/supabase/functions/public/finish_ai_job__827e7bc6229fda87.sql`
- `docs/contexto/supabase/functions/public/force_conversation_closure_author__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/get_crm_sync_health__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/get_department_whatsapp_api_key__a222c35cc3f52728.sql`
- `docs/contexto/supabase/functions/public/get_department_whatsapp_credentials__a222c35cc3f52728.sql`
- `docs/contexto/supabase/functions/public/get_instance_token__0d070a26573a6b39.sql`
- `docs/contexto/supabase/functions/public/get_voip_profile_credentials__c717166481197d1d.sql`
- `docs/contexto/supabase/functions/public/grant_agent_achievement__9b8373d60eff031d.sql`
- `docs/contexto/supabase/functions/public/guard_conversation_closure_request_id__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/guard_conversation_event_closure_id__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/guard_message_delivery_internal_fields__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/guard_message_immutable_columns__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/guard_message_provenance_fields__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/guard_talkx_template_update__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/guard_talkx_template_version_immutable__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/heartbeat_ai_job__1eafbd26938e2f84.sql`
- `docs/contexto/supabase/functions/public/heartbeat_multiplix_item__d21f515edc570db7.sql`
- `docs/contexto/supabase/functions/public/is_instance_paused__8449eceb6750fb75.sql`
- `docs/contexto/supabase/functions/public/is_privileged_contact_caller__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/kick_talkx_campaign__bb5b5d5e016ff1cd.sql`
- `docs/contexto/supabase/functions/public/link_email_crm_contact_guarded__cebfa5f969a139a8.sql`
- `docs/contexto/supabase/functions/public/list_multiplix_claimable_items__6e88627a7042e872.sql`
- `docs/contexto/supabase/functions/public/mark_ai_job_effect_started__01306abd6a7071fb.sql`
- `docs/contexto/supabase/functions/public/mark_multiplix_item_dispatch_started__c22632654d9599da.sql`
- `docs/contexto/supabase/functions/public/mark_multiplix_recipient_dispatch_started__06663f60f3d4f539.sql`
- `docs/contexto/supabase/functions/public/mark_outbound_post_started__ab56896f5eae5131.sql`
- `docs/contexto/supabase/functions/public/mark_talkx_recipient_dispatch_started__06663f60f3d4f539.sql`
- `docs/contexto/supabase/functions/public/merge_contacts_atomic__9b4ac88d5e71e605.sql`
- `docs/contexto/supabase/functions/public/multiplix_confirm_dispatch__850868c9dfc74e01.sql`
- `docs/contexto/supabase/functions/public/multiplix_connection_daily_usage__fce2cc40d1afd926.sql`
- `docs/contexto/supabase/functions/public/multiplix_create_draft__72f0bd19ece73dc7.sql`
- `docs/contexto/supabase/functions/public/multiplix_materialize_legacy_queue__aae5f65fe919b8e6.sql`
- `docs/contexto/supabase/functions/public/notify_due_tasks__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/persist_multiplix_item_message_snapshot__0db5ce69516ec2ab.sql`
- `docs/contexto/supabase/functions/public/persist_multiplix_recipient_message_snapshot__51c2d8e538521200.sql`
- `docs/contexto/supabase/functions/public/persist_talkx_recipient_message_snapshot__ed449af90cfdbaee.sql`
- `docs/contexto/supabase/functions/public/prevent_call_contact_redirect__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/purge_talkx_expired_data__392a67ea4728569f.sql`
- `docs/contexto/supabase/functions/public/purge_voice_command_logs__5343138302ea80d1.sql`
- `docs/contexto/supabase/functions/public/reap_ai_jobs__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/reassign_absent_agents__7f027ae089526f54.sql`
- `docs/contexto/supabase/functions/public/reassign_overloaded_agents__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/record_away_message__d077d0b24f34a751.sql`
- `docs/contexto/supabase/functions/public/record_multiplix_item_delivered__03ffe31962894a2f.sql`
- `docs/contexto/supabase/functions/public/record_multiplix_item_sent__c40d460d8fa2e6dc.sql`
- `docs/contexto/supabase/functions/public/record_multiplix_recipient_delivered__f995a51f9bdbc935.sql`
- `docs/contexto/supabase/functions/public/record_multiplix_recipient_sent__f3a82a923c929abf.sql`
- `docs/contexto/supabase/functions/public/record_sla_alert__e0549354300379a9.sql`
- `docs/contexto/supabase/functions/public/record_talkx_conversion__2930096ff26d1e5d.sql`
- `docs/contexto/supabase/functions/public/record_talkx_recipient_receipt__03ffe31962894a2f.sql`
- `docs/contexto/supabase/functions/public/record_talkx_recipient_sent__f3a82a923c929abf.sql`
- `docs/contexto/supabase/functions/public/release_multiplix_item_claim__c22632654d9599da.sql`
- `docs/contexto/supabase/functions/public/release_multiplix_recipient_claim__06663f60f3d4f539.sql`
- `docs/contexto/supabase/functions/public/release_talkx_campaign_worker__a2e0bd3328251d4d.sql`
- `docs/contexto/supabase/functions/public/release_talkx_recipient_claim__06663f60f3d4f539.sql`
- `docs/contexto/supabase/functions/public/reopen_conversation__0d066d155db16327.sql`
- `docs/contexto/supabase/functions/public/reorder_multiplix_blocks__c4fef4fb901b3f3f.sql`
- `docs/contexto/supabase/functions/public/reschedule_multiplix_item__7fc0bc15e062d3ee.sql`
- `docs/contexto/supabase/functions/public/reschedule_multiplix_recipient__d43c19460669710f.sql`
- `docs/contexto/supabase/functions/public/reschedule_talkx_recipient__d43c19460669710f.sql`
- `docs/contexto/supabase/functions/public/resolve_contact_guard_actor__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/retry_talkx_recipient__f2f1330eacc0c683.sql`
- `docs/contexto/supabase/functions/public/run_crm_sync_outbox_cleanup__42af59d86530ab39.sql`
- `docs/contexto/supabase/functions/public/schedule_next_talkx_recurrence__bb5b5d5e016ff1cd.sql`
- `docs/contexto/supabase/functions/public/secd_caller_ok__e8385b6c6f25ec7f.sql`
- `docs/contexto/supabase/functions/public/set_instance_token__a1edd11a82f78dee.sql`
- `docs/contexto/supabase/functions/public/set_voip_profile_credentials__6781e0e9fdb1c569.sql`
- `docs/contexto/supabase/functions/public/should_send_away_message__d077d0b24f34a751.sql`
- `docs/contexto/supabase/functions/public/sweep_multiplix_stuck_items__392a67ea4728569f.sql`
- `docs/contexto/supabase/functions/public/sweep_multiplix_stuck_recipients__392a67ea4728569f.sql`
- `docs/contexto/supabase/functions/public/sweep_talkx_stuck_recipients__392a67ea4728569f.sql`
- `docs/contexto/supabase/functions/public/talkx_blacklist_audit_trigger__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/talkx_campaign_logs__6ea5eced6ba5de7c.sql`
- `docs/contexto/supabase/functions/public/talkx_campaign_pace__bb5b5d5e016ff1cd.sql`
- `docs/contexto/supabase/functions/public/talkx_campaign_recipients_page__f288321088ab325b.sql`
- `docs/contexto/supabase/functions/public/talkx_campaign_reply_stats__bb5b5d5e016ff1cd.sql`
- `docs/contexto/supabase/functions/public/talkx_campaign_segment_progress__bb5b5d5e016ff1cd.sql`
- `docs/contexto/supabase/functions/public/talkx_campaign_window_open__61cc26966468c095.sql`
- `docs/contexto/supabase/functions/public/talkx_connection_send_budget__fce2cc40d1afd926.sql`
- `docs/contexto/supabase/functions/public/talkx_engine_alerts__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/talkx_engine_cron_runs__392a67ea4728569f.sql`
- `docs/contexto/supabase/functions/public/talkx_next_recipients__fcafbf6cc8ff8a95.sql`
- `docs/contexto/supabase/functions/public/talkx_recipient_is_suppressed__9fe3ca9675bcc440.sql`
- `docs/contexto/supabase/functions/public/talkx_suppress_contact__2a581f3c02c34d7b.sql`
- `docs/contexto/supabase/functions/public/transfer_conversation__4408a28933c6fb80.sql`
- `docs/contexto/supabase/functions/public/transition_multiplix_dispatch__c5cac09fa57e46b9.sql`
- `docs/contexto/supabase/functions/public/transition_talkx_campaign__623d149cb598ec65.sql`
- `docs/contexto/supabase/functions/public/trigger_ai_jobs_tick__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/trigger_pending_multiplix_dispatches__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/trigger_talkx_engine_tick__12ae32cb1ec02d01.sql`
- `docs/contexto/supabase/functions/public/upsert_crm_contact_link_guarded__ba0dc72fad6fea55.sql`
- `docs/contexto/supabase/migrations/20260319210215_7e6c3714-7ce1-4cd3-930c-f25b87b10103.sql`
- `docs/contexto/supabase/migrations/20260319210228_f33bb285-7797-4bfe-93c6-94f4096b83a6.sql`
- `docs/contexto/supabase/migrations/20260320133103_90061855-3227-445f-a47a-a15c38ac5cf2.sql`
- `docs/contexto/supabase/migrations/20260401002519_b7df7d1f-2caf-48c2-a23b-62df9f4fc772.sql`
- … +1057 (lista completa em `context.json`)

## Funções SQL `SECURITY DEFINER` (rodam com privilégio do dono, ignoram RLS)

- `accept_department_invite`
- `add_agent_xp`
- `add_contact_tag`
- `add_wa_tag_if_not_exists`
- `admin_inbox_silence`
- `admin_list_cron_jobs`
- `admin_set_role`
- `admin_toggle_cron_job`
- `admin_unlock_login`
- `agent_workload`
- `ai_budget_reconcile`
- `ai_budget_release`
- `ai_budget_reserve`
- `ai_budget_settle`
- `ai_rate_limit_hit`
- `ai_rate_limit_purge`
- `ai_sentiment_summary`
- `app_bootstrap`
- `apply_client_wallet`
- `apply_pg_cron_escalonamento`
- `apply_zapp_cron_secrets_l5`
- `archive_talkx_template`
- `assume_conversation`
- `audit_contact_address_change`
- `audit_contact_block_change`
- `audit_contact_deletion_change`
- `audit_operational_config`
- `audit_role_changes`
- `audit_role_permissions_changes`
- `auto_assign_contact`
- `auto_assign_to_queue_agent`
- `backfill_reminders_to_conversation_tasks`
- `bump_conversation_updated_at`
- `can_access_realtime_topic`
- `can_delete_contacts`
- `can_edit_contact`
- `can_insert_team_conversation_member`
- `can_manage_contacts`
- `cancel_ai_job`
- `catalog_rate_limit_hit`
- `claim_ai_jobs`
- `claim_crm_sync_outbox`
- `claim_crm_sync_outbox_by_id`
- `claim_multiplix_item`
- `claim_multiplix_recipient`
- `claim_outbound_message`
- `claim_talkx_campaign_worker`
- `claim_talkx_recipient`
- `cleanup_crm_sync_outbox`
- `cleanup_expired_challenges`
- `cleanup_link_preview_cache`
- `clear_login_attempts`
- `clear_qr_on_connect`
- `close_conversation_atomic`
- `close_stale_calls`
- `complete_multiplix_dispatch_if_drained`
- `complete_multiplix_dispatch_if_items_drained`
- `complete_multiplix_item`
- `complete_multiplix_recipient`
- `complete_outbound_message`
- `complete_talkx_campaign_if_drained`
- `complete_talkx_recipient`
- `confirm_talkx_campaign_launch`
- `consume_gmail_oauth_state`
- `consume_login_gate`
- `consume_rate_limit`
- `contacts_stats_series`
- `conversation_event_assign_performed_by`
- `conversation_events_default_performed_by`
- `copilot_has_presence`
- `count_multiplix_dead_letters`
- `count_searchbox_sessions_this_month`
- `create_department_invite`
- `create_team_group_conversation`
- `credit_agent_mini_game_xp`
- `crisis_room_snapshot`
- `crm_sync_outbox_cron_enabled`
- `current_profile_id`
- `dashboard_daily_series`
- `dashboard_sentiment_alerts`
- `decide_talkx_ab_winner`
- `delete_contact`
- `delete_contacts`
- `delete_department`
- `delete_talkx_campaign`
- `delete_talkx_template`
- `delivery_stats`
- `department_audit_logs_fill_profile_name`
- `departments_overview`
- `dispatch_scheduled_messages`
- `duplicate_talkx_campaign`
- `duplicate_talkx_template`
- `edit_message`
- `effective_role`
- `enforce_contacts_consent_status_guard`
- `enforce_conversation_status_transition`
- `enqueue_ai_job`
- `enqueue_copilot_tick_on_contact_message`
- `enqueue_crm_sync_from_closure`
- `enqueue_group_outbound_message`
- `enqueue_outbound_message`
- `enqueue_rich_outbound_message`
- `ensure_single_default_ai_provider`
- `ensure_single_default_filter`
- `evaluate_feature_flags`
- `expire_orphan_user_sessions`
- `expire_stale_agent_presence`
- `expire_user_sessions`
- `fail_crm_sync_outbox`
- `fail_outbound_message`
- `find_or_create_direct_conversation`
- `finish_ai_job`
- `fn_list_audio_meme_categories`
- `fn_list_audio_memes_for_user`
- `fn_send_audio_meme`
- `fn_toggle_user_meme_favorite`
- `force_conversation_closure_author`
- `get_ai_jobs_cron_secret`
- `get_ai_usage_outbox_drain_cron_secret`
- `get_avatars_refresh_cron_secret`
- `get_channel_credentials`
- `get_channel_credentials_safe`
- `get_connection_health_check_cron_secret`
- `get_connection_instance`
- `get_connection_qr_code`
- `get_conversation_tab_counts`
- `get_crm_sync_health`
- `get_department_whatsapp_api_key`
- `get_department_whatsapp_config`
- `get_department_whatsapp_credentials`
- `get_department_whatsapp_mode`
- `get_gmail_tokens`
- `get_identity_matrix`
- `get_inbox_contact_summaries`
- `get_instance_token`
- `get_last_message_dates`
- `get_multiplix_cron_secret`
- `get_my_protection_policy`
- `get_own_gmail_accounts`
- `get_own_lockout_status`
- `get_profile_id_for_user`
- `get_profile_role_for_check`
- `get_scheduled_report_cron_secret`
- `get_send_metrics`
- `get_talkx_cron_secret`
- `get_talkx_send_url`
- `get_team_conversation_previews`
- `get_team_inbox`
- `get_team_messages_page`
- `get_team_profiles`
- `get_team_unread_counts`
- `get_visible_agent_ids`
- `grant_agent_achievement`
- `grant_agent_achievement_internal`
- `handle_inbound_message_reopen`
- `handle_message_gamification`
- `handle_new_user`
- `handle_new_user_role`
- `has_role`
- `heartbeat_ai_job`
- `heartbeat_multiplix_item`
- `inbox_unread_total`
- `inbox_wait_summary`
- `increment_agent_messages`
- `increment_agent_resolutions`
- `increment_custom_emoji_use`
- `init_agent_stats`
- `instance_auth_event_series`
- `is_account_locked`
- `is_admin_or_supervisor`
- `is_contact_visible_to_user`
- `is_country_allowed`
- `is_country_blocked`
- `is_ip_blocked`
- `is_ip_whitelisted`
- `is_last_team_conversation_owner`
- `is_privileged_contact_caller`
- `is_team_conversation_creator`
- `is_team_conversation_member`
- `is_within_business_hours`
- `kick_talkx_campaign`
- `leave_team_group`
- `link_email_crm_contact_guarded`
- `list_message_attempts`
- `list_message_attempts_admin`
- `list_multiplix_claimable_items`
- `list_multiplix_dead_letters`
- `log_assignment_change`
- `log_audit_event`
- `log_login_block`
- `log_message_attempt`
- `log_search_event`
- `log_talkx_campaign_checklist`
- `log_unauthorized_inbox_scope`
- `mark_ai_job_effect_started`
- `mark_first_response`
- `mark_multiplix_item_dispatch_started`
- `mark_multiplix_recipient_dispatch_started`
- `mark_outbound_post_started`
- `mark_talkx_recipient_dispatch_started`
- `mark_team_conversation_read`
- `mcp_exec`
- `mcp_exec_many`
- `merge_brinde_state`
- `merge_contacts_atomic`
- `message_pins_force_contact_id`
- `message_sender_atual`
- `messages_sla_first_response_trigger`
- `multiplix_bump_version_on_block_change`
- `multiplix_bump_version_on_dispatch_edit`
- `multiplix_confirm_dispatch`
- `multiplix_connection_daily_usage`
- `multiplix_create_draft`
- `multiplix_dispatch_window_is_open`
- `multiplix_materialize_legacy_queue`
- `my_active_sessions`
- `my_network_status`
- `notify_due_reminders`
- `notify_due_tasks`
- `notify_searchbox_budget`
- `ops_metrics`
- `pause_dispatches_for_connection`
- `persist_multiplix_item_message_snapshot`
- `persist_multiplix_recipient_message_snapshot`
- `persist_sentiment_alert`
- `persist_talkx_recipient_message_snapshot`
- `pin_message`
- `prevent_contact_assignee_hijack`
- `prevent_contact_queue_hijack`
- `prevent_conversation_task_field_forgery`
- `prevent_profile_privilege_escalation`
- `purge_gmail_account_data`
- `purge_qr_attempts`
- `purge_talkx_expired_data`
- `purge_voice_changer_tmp`
- `purge_voice_command_logs`
- `queue_overflow_rewrite`
- `queue_pick_agent`
- `queues_prevent_overflow_cycle`
- `rate_limit_reset_requests`
- `reap_ai_jobs`
- `reassign_absent_agents`
- `reassign_overloaded_agents`
- `recalcular_retencao_copiloto`
- `record_away_message`
- `record_failed_login`
- `record_multiplix_item_delivered`
- `record_multiplix_item_sent`
- `record_multiplix_recipient_delivered`
- `record_multiplix_recipient_sent`
- `record_sla_alert`
- `record_talkx_campaign_lifecycle_event`
- `record_talkx_conversion`
- `record_talkx_link_click`
- `record_talkx_recipient_delivered`
- `record_talkx_recipient_receipt`
- `record_talkx_recipient_sent`
- `redact_crm_sync_on_contact_delete`
- `register_first_response_internal`
- `register_multiplix_connection_failure`
- `reject_repeated_conversation_closure_without_reopen`
- `release_multiplix_item_claim`
- `release_multiplix_recipient_claim`
- `release_talkx_campaign_worker`
- `release_talkx_recipient_claim`
- `remind_me_about_message`
- `remove_contact_tag`
- `remove_team_member`
- `remove_wa_label_from_all_contacts`
- `remove_wa_tag_by_prefix`
- `rename_wa_label_on_all_contacts`
- `reopen_conversation`
- `reopen_conversation_core`
- `reorder_multiplix_blocks`
- `replace_talkx_draft_recipients`
- `report_message`
- `request_department_access`
- `require_contact_edit_permission`
- `require_contact_global_admin`
- `reschedule_multiplix_item`
- `reschedule_multiplix_recipient`
- `reschedule_talkx_recipient`
- `reserve_migration_version`
- `resolve_applicable_first_response_minutes`
- `resolve_contact_guard_actor`
- `resolve_network_policy`
- `resolve_sla_alert`
- `resolve_talkx_outcome_unknown`
- `resolve_unconfirmed_message`
- `retry_talkx_recipient`
- `retry_talkx_recipients`
- `return_conversation_to_queue`
- `revoke_auth_sessions`
- `rpc_queue_goal_metrics`
- `run_copilot_retention`
- `run_crm_sync_outbox_cleanup`
- `sanitize_reset_request`
- `save_talkx_campaign_draft`
- `save_talkx_template`
- `save_talkx_template_variants`
- `schedule_next_talkx_recurrence`
- `search_contacts`
- `search_team_messages`
- `searchbox_budget_alert_tick`
- `secd_caller_ok`
- `set_call_agent_notes`
- `set_contact_blocked`
- `set_conversation_status`
- `set_conversations_status`
- `set_default_whatsapp_connection`
- `set_department_whatsapp_config`
- `set_instance_token`
- `set_scheduled_report_config_owner`
- `set_talkx_campaign_ab`
- `set_team_member_pref`
- `set_team_member_role`
- `should_send_away_message`
- `skill_based_assign`
- `snapshot_talkx_campaign_audience`
- `store_gmail_tokens`
- `sweep_multiplix_stuck_items`
- `sweep_multiplix_stuck_recipients`
- `sweep_stuck_outbound_messages`
- `sweep_talkx_stuck_recipients`
- `sync_profile_role_from_user_roles`
- `sync_thread_last_sender`
- `talk_me_claim`
- `talk_me_eligible_waiting_contacts`
- `talk_me_list_pending_messages`
- `talk_me_list_queues`
- `talk_me_list_waiting`
- `talkx_assign_variant`
- `talkx_audience_query`
- `talkx_benchmarks`
- `talkx_blacklist_audit_trigger`
- `talkx_blacklist_no_delete`
- `talkx_blacklist_reason_active_guard`
- `talkx_block_recipient`
- `talkx_campaign_heatmap`
- `talkx_campaign_launch_checks`
- `talkx_campaign_logs`
- `talkx_campaign_pace`
- `talkx_campaign_queue_by_segment`
- `talkx_campaign_ranking`
- `talkx_campaign_recipients_page`
- `talkx_campaign_reply_stats`
- `talkx_campaign_resume_precheck`
- `talkx_campaign_segment_progress`
- `talkx_campaign_timeline_page`
- `talkx_campaign_variant_stats`
- `talkx_campaign_window_open`
- `talkx_compile_segment_rules`
- `talkx_connection_send_budget`
- `talkx_connection_send_budget_internal`
- `talkx_delete_link`
- `talkx_engine_alerts`
- `talkx_engine_cron_runs`
- `talkx_engine_window_open`
- `talkx_help_top_topics`
- `talkx_increment_delivered`
- `talkx_insights`
- `talkx_match_optout`
- `talkx_monitor_panel`
- `talkx_multiplix_connection_sent_count`
- `talkx_next_recipients`
- `talkx_recipient_is_suppressed`
- `talkx_refresh_local_attributes`
- `talkx_resolve_audience`
- `talkx_resolve_speed_pace`
- `talkx_segment_block_in_use`
- `talkx_segment_bulk_action`
- `talkx_segment_health`
- `talkx_segment_versions_trim`
- `talkx_set_campaign_investment`
- `talkx_suppress_contact`
- `talkx_sync_campaign_segments`
- `talkx_template_library_kpis`
- `talkx_template_library_stats`
- `talkx_template_metrics`
- `talkx_template_stats`
- `talkx_top_segments`
- `talkx_upsert_link`
- `talkx_validate_template_variant_weights`
- `team_message_receipts_update_guard`
- `team_messages_edit_guard`
- `team_messages_validate_reply_to`
- `team_reactions_dedup_guard`
- `team_reactions_force_conversation_id`
- `team_receipts_fill_conversation_id`
- `team_receipts_no_own_sender`
- `toggle_message_favorite`
- `toggle_team_reaction`
- `touch_copilot_sessions_updated_at`
- `transfer_conversation`
- `transfer_team_conversation_department`
- `transfer_team_conversation_ownership`
- `transition_multiplix_dispatch`
- `transition_talkx_campaign`
- `trg_revoke_sessions_on_profile_deactivate`
- `trg_talkx_increment_replied_count`
- `trg_talkx_increment_template_use_count`
- `trg_user_sessions_auth_session_guard`
- `trigger_ai_jobs_tick`
- `trigger_crm_sync_outbox`
- `trigger_due_scheduled_report_configs`
- `trigger_pending_multiplix_dispatches`
- `trigger_talkx_engine_tick`
- `unpin_message`
- `update_agent_level`
- `update_agent_streak`
- `update_own_profile`
- `update_talkx_campaign_limits`
- `update_talkx_template_with_snapshot`
- `upsert_copilot_presence`
- `upsert_crm_contact_link_guarded`
- `user_has_permission`
- `warroom_agent_today`
- `warroom_queue_stats`
- `whisper_messages_valida_audio_path`
- `z296_aplicar_rollback`
- `z296_hits`
- `zz_prova_ok`
- `zz_prova_secd`

## Edge functions públicas (sem JWT — qualquer um chama)

- `evolution-webhook`
- `whatsapp-webhook`
- `gmail-webhook`
- `gmail-cron-sync`
- `connection-health-check`
- `batch-fetch-avatars`
- `elevenlabs-webhook`
- `public-api`
- `auth-login`
- `message-delivery`
- `crm-integration`
- `csp-report`
- `talkx-link`
- `searchbox-budget-alert`
- `send-scheduled-report`
- `sync-call-records`
- `ai-usage-outbox-drain`

## Rotas protegidas no front

| Rota | Guard | Roles | Arquivo |
|---|---|---|---|
| / | ProtectedRoute |  | `scripts/ci/inventario-rotas.unit.mjs` |
| / | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /admin | ProtectedRoute |  | `scripts/ci/inventario-rotas.unit.mjs` |
| /admin/auditoria-contatos | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /admin/cache-previas | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /admin/protecao-contatos | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /admin/rate-limit | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /admin/roles | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /app | ProtectedRoute |  | `scripts/ai-context/gerar.unit.mjs` |
| /area | ProtectedRoute |  | `scripts/ai-context/gerar.unit.mjs` |
| /chat-popup/:contactId | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /painel | ProtectedRoute |  | `scripts/ai-context/gerar.unit.mjs` |
| /queue/:id | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /queues/comparison | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /sla | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |
| /sla/history | ProtectedRoute |  | `src/routes/AppRoutes.tsx` |

Guards usados: Protected, ProtectedRoute

Middleware matcher (Next.js): nenhum

## Grants / Revokes (agrupados por role e privilégio)

| Ação | Para/De | Privilégios | Objetos |
|---|---|---|---|
| grant | PUBLIC | execute | `zz_prova_secd`, `zz_prova_secd`, `pg_temp.ok` |
| grant | anon | execute | `record_failed_login`, `record_failed_login`, `record_failed_login`, `record_failed_login`, `record_failed_login`, `is_account_locked`, `zz_prova_secd` |
| grant | anon | insert | `password_reset_requests` |
| grant | anon | select | `global_settings`, `messages`, `passkey_credentials`, `profiles` |
| grant | anon | select, insert, update, delete | `password_reset_requests` |
| grant | anon | select, update | `profiles` |
| grant | anon, authenticated | execute | `multiplix_audiences_validate_shared_roles`, `multiplix_audiences_validate_shared_roles` |
| grant | anon, authenticated, service_role | all | `talkx_settings` |
| grant | anon, authenticated, service_role | execute | `multiplix_audiences_validate_shared_roles`, `multiplix_audiences_validate_shared_roles`, `auth.uid`, `auth.uid` |
| grant | authenticated | delete | `multiplix_recipients` |
| grant | authenticated | execute | `e2e_fixture_message`, `log_search_event`, `resolve_unconfirmed_message`, `get_team_profiles`, `fn_list_audio_memes_for_user`, `fn_toggle_user_meme_favorite`, `fn_list_audio_meme_categories`, `fn_send_audio_meme`, `mark_first_response`, `mark_first_response`, `mark_first_response`, `dashboard_kpi`, `dashboard_hourly_volume`, `dashboard_contact_counts`, `dashboard_hourly_volume` … +203 |
| grant | authenticated | insert | `search_events` |
| grant | authenticated | insert, select | `t3_errs` |
| grant | authenticated | insert, update, delete | `feature_flags` |
| grant | authenticated | select | `profiles_public`, `password_reset_requests_safe`, `password_reset_requests_safe`, `profiles_public`, `whatsapp_connections_public`, `whatsapp_connections_public`, `login_attempts_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `whatsapp_connections_agent`, `channel_connections_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `gmail_accounts_safe`, `gmail_accounts_safe` … +68 |
| grant | authenticated | select, insert | `catalog_send_events`, `talkx_help_views`, `audit_logs` |
| grant | authenticated | select, insert, delete | `message_favorites` |
| grant | authenticated | select, insert, update | `sla_alert_preferences`, `connection_alert_preferences`, `notifications`, `messages` |
| grant | authenticated | select, insert, update, delete | `audio_meme_favorites`, `audio_meme_favorites`, `crm_contact_links`, `talkx_template_variants`, `multiplix_dispatches`, `multiplix_recipients`, `multiplix_blocks`, `catalog_favorites`, `multiplix_audiences`, `multiplix_audience_members`, `talkx_optout_keywords`, `talkx_campaign_segments`, `email_signatures`, `city_whitelist`, `rate_limit_configs` … +1 |
| grant | authenticated | update | `whisper_messages`, `whisper_messages` |
| grant | authenticated, anon, service_role | execute | `pg_temp.assert_permitido`, `pg_temp.assert_negado`, `is_contact_visible_to_user`, `get_visible_agent_ids`, `get_profile_id_for_user`, `is_admin_or_supervisor` |
| grant | authenticated, anon, service_role | insert | `prova_hz503_asserts` |
| grant | authenticated, anon, service_role | select, insert, update, delete | `password_reset_requests`, `conversation_analyses` |
| grant | authenticated, service_role | execute | `get_department_whatsapp_credentials`, `dashboard_leaderboard`, `search_contacts`, `ai_usage_cost_summary`, `merge_contacts_atomic`, `get_department_whatsapp_credentials`, `get_crm_sync_health`, `get_crm_sync_health`, `merge_contacts_atomic`, `get_profile_id_for_user`, `get_visible_agent_ids`, `is_contact_visible_to_user`, `close_conversation_atomic`, `is_valid_talkx_schedule_timezone`, `is_valid_talkx_schedule_timezone` … +129 |
| grant | authenticated, service_role | select | `talkx_campaign_optouts`, `talkx_engine_health`, `talkx_engine_health`, `talkx_ddd_regions`, `security_acl_alerts`, `talkx_campaign_optouts`, `profiles`, `user_roles`, `t88_ids`, `profiles`, `profiles` |
| grant | authenticated, service_role | select, insert, update | `messages` |
| grant | authenticated, service_role | select, insert, update, delete | `contact_notes`, `contact_protection_policy` |
| grant | postgres | execute | `set_conversation_status`, `set_conversation_status`, `set_conversation_status`, `set_conversation_status`, `set_conversation_status`, `set_conversation_status` |
| grant | service_role | all | `audio_meme_favorites`, `link_preview_cache`, `link_preview_cache_metrics`, `audio_meme_favorites`, `link_preview_cache`, `link_preview_cache_metrics`, `talkx_links`, `talkx_link_clicks`, `talkx_conversions`, `talkx_settings`, `multiplix_delivery_items`, `ai_budget_reservations`, `ai_jobs`, `talkx_test_send_claims`, `talkx_optout_keywords` … +19 |
| grant | service_role | execute | `mark_outbound_post_started`, `claim_outbound_message`, `run_copilot_retention`, `cleanup_link_preview_cache`, `get_identity_matrix`, `set_conversation_status`, `purge_talkx_expired_data`, `retry_talkx_recipient`, `get_team_profiles`, `cleanup_link_preview_cache`, `encrypt_gmail_token`, `decrypt_gmail_token`, `get_gmail_tokens`, `store_gmail_tokens`, `get_identity_matrix` … +239 |
| grant | service_role | select | `gmail_accounts_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `profiles_public`, `gmail_accounts_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `profiles_public`, `searchbox_budget_alert_cron`, `sla_alert_events` |
| grant | service_role | select, insert | `contact_deletion_audit`, `audit_logs`, `contact_block_audit` |
| grant | service_role | select, insert, update | `multiplix_events`, `searchbox_budget_alert_emails`, `talkx_segment_library_history`, `talkx_contact_attributes`, `public` |
| grant | service_role | select, insert, update, delete | `webhook_failures`, `talkx_template_variants`, `talkx_template_versions`, `talkx_campaign_segments`, `talkx_segment_versions`, `sla_alert_preferences`, `instance_pauses`, `qr_attempts`, `webhook_failures`, `password_reset_requests` |
| grant | service_role | usage, select | `public` |
| grant | service_role, authenticated | execute | `talkx_overview_stats`, `talkx_campaign_report`, `talkx_segment_tags`, `talkx_benchmarks`, `talkx_benchmarks`, `talkx_campaign_pace`, `catalog_rate_limit_hit`, `catalog_rate_limit_hit`, `catalog_rate_limit_hit`, `talkx_benchmarks`, `talkx_insights` |
| grant | service_role, authenticated, postgres | execute | `search_contacts` |
| grant | service_role, postgres | execute | `mcp_exec`, `mcp_exec_many` |
| revoke | PUBLIC | all | `run_copilot_retention`, `get_identity_matrix`, `dashboard_leaderboard`, `get_identity_matrix`, `enqueue_crm_sync_from_closure`, `enforce_talkx_campaign_mutability`, `enforce_talkx_recipient_snapshot_mutability`, `enforce_talkx_campaign_mutability`, `enforce_talkx_recipient_snapshot_mutability`, `enforce_talkx_campaign_mutability`, `is_valid_talkx_schedule_timezone`, `talkx_overview_stats`, `talkx_campaign_report`, `talkx_segment_tags`, `talkx_benchmarks` … +52 |
| revoke | PUBLIC | execute | `dashboard_kpi`, `dashboard_contact_counts`, `dashboard_hourly_volume`, `set_conversation_status`, `record_failed_login`, `messages_sla_first_response_trigger`, `calculate_level`, `normalize_contact_phone`, `dashboard_kpi`, `dashboard_contact_counts`, `dashboard_hourly_volume`, `grant_agent_achievement`, `grant_agent_achievement`, `add_agent_xp`, `update_agent_streak` … +31 |
| revoke | PUBLIC, anon | all | `resolve_unconfirmed_message`, `mark_first_response`, `mark_first_response`, `mark_first_response`, `count_searchbox_sessions_this_month`, `merge_contacts_atomic`, `mark_first_response`, `mark_first_response`, `mark_first_response`, `get_crm_sync_health`, `get_crm_sync_health`, `merge_contacts_atomic`, `get_profile_id_for_user`, `get_visible_agent_ids`, `is_contact_visible_to_user` … +133 |
| revoke | PUBLIC, anon | execute | `get_department_whatsapp_credentials`, `get_identity_matrix`, `get_own_lockout_status`, `effective_role`, `is_admin`, `is_ip_blocked`, `is_ip_whitelisted`, `is_country_allowed`, `is_country_blocked`, `audit_role_permissions_changes`, `sync_profile_role_from_user_roles`, `sync_thread_last_sender`, `update_device_last_seen`, `update_global_settings_updated_at`, `update_updated_at_column` … +87 |
| revoke | PUBLIC, anon, authenticated | all | `enqueue_copilot_tick_on_contact_message`, `mark_outbound_post_started`, `claim_outbound_message`, `register_first_response_internal`, `register_first_response_internal`, `notify_due_reminders`, `guard_message_provenance_fields`, `backfill_reminders_to_conversation_tasks`, `purge_talkx_expired_data`, `guard_contact_note_identity`, `retry_talkx_recipient`, `grant_agent_achievement_internal`, `encrypt_gmail_token`, `decrypt_gmail_token`, `get_gmail_tokens` … +240 |
| revoke | PUBLIC, anon, authenticated | all privileges | `webhook_failures` |
| revoke | PUBLIC, anon, authenticated | execute | `multiplix_audiences_validate_shared_roles`, `consume_rate_limit`, `phone_variants`, `ingest_inbound_message`, `reschedule_talkx_recipient`, `transition_talkx_campaign`, `expire_stale_agent_presence`, `handle_message_gamification`, `handle_conversation_closure_gamification`, `get_department_whatsapp_credentials`, `get_department_whatsapp_api_key`, `record_incoming_call_event`, `sanitize_reset_request`, `team_receipts_fill_conversation_id`, `team_reactions_force_conversation_id` … +25 |
| revoke | PUBLIC, anon, authenticated | truncate, references, trigger | `public` |
| revoke | PUBLIC, anon, authenticated ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM PUBLIC, anon, authenticated | truncate, references, trigger | `public` |
| revoke | PUBLIC, anon, authenticated, service_role | all | `talkx_campaign_resume_precheck`, `talkx_template_variants`, `talkx_template_versions`, `enforce_talkx_campaign_mutability`, `enforce_talkx_recipient_snapshot_mutability`, `supabase_migrations.version_reservations`, `supabase_migrations.reserve_migration_version`, `contact_deletion_audit`, `apply_zapp_cron_secrets_l5`, `apply_zapp_cron_secrets_l5`, `resolve_contact_guard_actor`, `prevent_contact_queue_hijack`, `prevent_contact_assignee_hijack`, `increment_talkx_template_use`, `multiplix_events` … +11 |
| revoke | PUBLIC, anon, authenticated, service_role | execute | `audit_contact_deletion_change`, `audit_contact_address_change`, `audit_role_changes`, `audit_role_permissions_changes`, `department_audit_logs_fill_profile_name`, `record_talkx_campaign_lifecycle_event`, `set_talkx_recipient_status_changed_at`, `conversation_task_rearm_on_remind_change`, `audit_contact_block_change`, `sanitize_reset_request`, `rate_limit_reset_requests` |
| revoke | PUBLIC, anon, service_role | all | `enqueue_outbound_message`, `enqueue_rich_outbound_message`, `replace_talkx_draft_recipients`, `save_talkx_campaign_draft`, `enqueue_outbound_message`, `enqueue_outbound_message`, `enqueue_rich_outbound_message`, `enqueue_outbound_message`, `log_unauthorized_inbox_scope`, `enqueue_group_outbound_message`, `admin_list_cron_jobs`, `admin_toggle_cron_job`, `set_contact_blocked`, `crisis_room_snapshot`, `talkx_block_recipient` … +3 |
| revoke | PUBLIC, authenticated | execute | `run_copilot_retention` |
| revoke | anon | all | `feature_flags`, `search_my_calls`, `my_calls_kpi`, `upsert_my_call`, `set_call_agent_notes`, `team_conversations`, `team_conversation_members`, `team_messages`, `team_message_reactions`, `team_message_receipts`, `departments`, `department_invitations`, `department_invites`, `department_audit_logs`, `multiplix_dispatches` … +32 |
| revoke | anon | all privileges | `contact_notes` |
| revoke | anon | delete | `passkey_credentials` |
| revoke | anon | execute | `record_failed_login`, `is_account_locked`, `is_account_locked`, `record_failed_login`, `dashboard_kpi`, `dashboard_contact_counts`, `dashboard_hourly_volume`, `dashboard_leaderboard`, `sync_contact_status_on_closure`, `is_account_locked`, `is_account_locked`, `record_failed_login`, `talkx_benchmarks`, `talkx_benchmarks`, `set_conversation_status` … +53 |
| revoke | anon | insert | `passkey_credentials`, `passkey_credentials` |
| revoke | anon | insert, update, delete | `public` |
| revoke | anon | insert, update, delete, truncate, references, trigger | `ai_providers`, `ai_providers` |
| revoke | anon | references | `passkey_credentials` |
| revoke | anon | select | `contacts`, `passkey_credentials`, `public` |
| revoke | anon | select, insert, update, delete | `login_attempts` |
| revoke | anon | trigger | `passkey_credentials` |
| revoke | anon | truncate | `passkey_credentials` |
| revoke | anon | update | `passkey_credentials` |
| revoke | anon ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM anon | select | `public` |
| revoke | anon, authenticated | all | `edge_rate_limits`, `crm_sync_outbox`, `crm_contact_links`, `talkx_links`, `talkx_link_clicks`, `talkx_conversions`, `security_acl_alerts`, `score_security_acl`, `purge_voice_command_logs`, `webhook_failures` |
| revoke | anon, authenticated | all privileges | `catalog_favorites`, `catalog_send_events`, `message_attempts` |
| revoke | anon, authenticated | execute | `messages_sla_first_response_trigger`, `messages_sla_first_response_trigger`, `calculate_level`, `normalize_contact_phone`, `record_talkx_link_click`, `record_talkx_link_click`, `record_talkx_link_click`, `record_talkx_link_click`, `notify_due_reminders`, `expire_orphan_user_sessions` |
| revoke | anon, authenticated | maintain | `public` |
| revoke | anon, authenticated | truncate, delete, update, trigger, references | `talkx_campaign_events` |
| revoke | anon, authenticated | truncate, trigger, references | `team_conversations`, `team_conversation_members`, `team_messages`, `team_message_reactions`, `team_message_receipts`, `departments`, `department_invitations`, `department_invites`, `department_audit_logs` |
| revoke | anon, public | execute | `notify_due_tasks` |
| revoke | authenticated | all | `persist_conversation_analysis`, `replace_ai_conversation_tags`, `persist_conversation_analysis`, `agent_mini_game_xp_daily`, `ai_usage_outbox`, `outbox_events`, `log_login_block`, `connection_alert_preferences`, `whisper_messages_somente_is_read`, `link_preview_cache` |
| revoke | authenticated | all privileges | `audit_logs` |
| revoke | authenticated | delete | `team_message_receipts`, `departments` |
| revoke | authenticated | execute | `encrypt_gmail_token`, `decrypt_gmail_token`, `cleanup_expired_challenges`, `cleanup_link_preview_cache`, `encrypt_gmail_token`, `decrypt_gmail_token`, `decrypt_gmail_token`, `encrypt_gmail_token`, `get_channel_credentials`, `cleanup_expired_challenges`, `cleanup_link_preview_cache`, `is_account_locked`, `record_failed_login`, `set_conversation_status`, `get_own_lockout_status` … +2 |
| revoke | authenticated | insert | `search_events`, `search_events` |
| revoke | authenticated | insert, update | `multiplix_recipients`, `departments`, `multiplix_dispatches` |
| revoke | authenticated | insert, update, delete | `department_audit_logs`, `talkx_campaign_optouts` |
| revoke | authenticated | insert, update, delete, truncate, references, trigger | `multiplix_voice_assets`, `multiplix_voice_grants`, `reconnection_logs` |
| revoke | authenticated | truncate, references, trigger | `multiplix_dispatches`, `multiplix_recipients`, `multiplix_blocks`, `multiplix_audiences`, `multiplix_audience_members`, `talkx_campaign_optouts` |
| revoke | authenticated | truncate, trigger, references | `whatsapp_connections` |
| revoke | authenticated | update | `team_conversation_members`, `team_messages`, `storage.objects`, `team_conversations`, `whisper_messages`, `passkey_credentials`, `whisper_messages`, `notifications` |
| revoke | authenticated, anon | select | `departments`, `departments` |
| revoke | authenticated, anon | truncate, references | `contacts` |
| revoke | authenticated, anon, PUBLIC | execute | `mcp_exec`, `mcp_exec_many` |
| revoke | authenticated, service_role | truncate, references, trigger, maintain | `contact_notes` |
| revoke | authenticated, service_role | update, delete, truncate | `audit_logs`, `department_audit_logs` |
| revoke | public | all | `e2e_fixture_message`, `cleanup_link_preview_cache`, `cleanup_link_preview_cache`, `search_my_calls`, `my_calls_kpi`, `upsert_my_call`, `set_call_agent_notes`, `persist_conversation_analysis`, `replace_ai_conversation_tags`, `enqueue_crm_sync_from_closure`, `persist_conversation_analysis`, `ai_usage_outbox`, `outbox_events`, `e2e_cleanup_conversation_closures`, `talkx_benchmarks` … +7 |
| revoke | public, anon | all | `ai_usage_cost_summary`, `catalog_rate_limit_hit`, `ai_usage_summary`, `ai_usage_cost_summary`, `catalog_rate_limit_hit`, `transfer_conversation`, `ai_usage_cost_summary`, `catalog_rate_limit_hit`, `talkx_resolve_audience`, `can_access_realtime_topic`, `reopen_conversation`, `set_voip_profile_credentials`, `agent_workload`, `transfer_conversation`, `search_insights` … +6 |
| revoke | public, anon, authenticated | all | `log_search_event`, `talkx_suppress_contact`, `talkx_suppress_contact`, `ai_rate_limit_hit`, `ai_rate_limit_purge`, `ai_budget_reservations`, `ai_budget_reserve`, `ai_budget_settle`, `ai_budget_release`, `ai_budget_reconcile`, `ai_jobs`, `get_ai_jobs_cron_secret`, `enqueue_ai_job`, `claim_ai_jobs`, `heartbeat_ai_job` … +36 |
| revoke | public, anon, authenticated | execute | `talkx_segment_versions_trim`, `talkx_segment_block_in_use`, `whisper_messages_valida_audio_path`, `whisper_messages_valida_audio_path` |
| revoke | public, anon, authenticated, service_role | all | `set_default_whatsapp_connection`, `voip_profile_credentials` |
| revoke | public, anon, service_role | all | `ai_sentiment_summary`, `app_bootstrap` |
| revoke | service_role | all | `increment_custom_emoji_use`, `sentiment_trend` |
| revoke | service_role | all privileges | `webhook_failures`, `audit_logs` |
| revoke | service_role | execute | `enqueue_outbound_message`, `guard_message_delivery_internal_fields`, `guard_conversation_closure_request_id`, `guard_conversation_event_closure_id`, `mark_pause_investigated` |
| revoke | service_role | truncate | `contacts` |

## Riscos de acesso detectados

| Tabela | Problema | Arquivos |
|---|---|---|
| `ai_jobs` | RLS ligado sem nenhuma política → só service_role acessa |  |
| `gmail_oauth_states` | RLS ligado sem nenhuma política → só service_role acessa |  |
| `link_preview_cache` | RLS ligado sem nenhuma política → só service_role acessa |  |
| `messages` | front faz DELETE mas nenhuma política RLS permite DELETE → vai falhar/retornar vazio para usuários | `src/components/monitoring/hooks/useMonitoringActions.ts` |
| `query_telemetry` | front faz SELECT mas nenhuma política RLS permite SELECT → vai falhar/retornar vazio para usuários | `src/pages/AdminTelemetriaPage.tsx` |
| `sla_alert_preferences` | acessada do front (1 arquivo(s)) sem RLS (disabled) | `src/hooks/sla/useSlaAlertPreferences.ts` |
| `talkx_test_send_claims` | RLS ligado sem nenhuma política → só service_role acessa |  |
| `whisper_messages` | front faz UPDATE mas nenhuma política RLS permite UPDATE → vai falhar/retornar vazio para usuários | `src/components/inbox/WhisperMode.tsx` |

## Multi-tenancy

- Chave de tenant: **`company_id`** presente em 1 tabela(s): `multiplix_recipients`
- Cobertura: 0% das tabelas. Abaixo de 60% — isolamento provavelmente por usuário (auth.uid()) ou misto; não flagado por tabela.

## Soft delete (registros 'apagados' continuam na tabela — filtre!)

| Tabela | Coluna |
|---|---|
| `messages` | `is_deleted` |
| `profiles` | `is_active` |
| `contacts` | `deleted_at` |
| `client_wallet_rules` | `is_active` |
| `sla_configurations` | `is_active` |
| `queues` | `is_active` |
| `queue_members` | `is_active` |
| `products` | `is_active` |
| `goals_configurations` | `is_active` |
| `rate_limit_configs` | `is_active` |
| `user_sessions` | `is_active` |
| `scheduled_reports` | `is_active` |
| `chatbot_flows` | `is_active` |
| `sales_pipeline_stages` | `is_active` |
| `followup_sequences` | `is_active` |
| `followup_steps` | `is_active` |
| `automations` | `is_active` |
| `scheduled_report_configs` | `is_active` |
| `channel_connections` | `is_active` |
| `channel_routing_rules` | `is_active` |
| `gmail_accounts` | `is_active` |
| `user_service_accounts` | `is_active` |
| `sla_rules` | `is_active` |
| `ai_providers` | `is_active` |
| `talkx_blacklist` | `removed_at` |
| `playbooks` | `is_active` |
| `crisis_room_alerts` | `is_active` |
| `talkx_segments` | `archived_at` |
| `talkx_templates` | `archived_at` |
| `departments` | `is_active` |
| `talkx_optout_keywords` | `active` |
| `talkx_suppression_reasons` | `active` |
| `city_whitelist` | `is_active` |

## Auditoria (colunas de rastreio)

| Tabela | Colunas |
|---|---|
| `copilot_sessions` | `created_at`, `updated_at` |
| `copilot_insights` | `created_at` |
| `messages` | `created_at`, `updated_at` |
| `copilot_insight_feedback` | `created_at` |
| `copilot_retention_aggregates` | `created_at`, `updated_at` |
| `profiles` | `created_at`, `updated_at` |
| `whatsapp_connections` | `created_at`, `created_by`, `updated_at` |
| `contacts` | `created_at`, `updated_at` |
| `client_wallet_rules` | `created_at` |
| `user_roles` | `created_at` |
| `audit_logs` | `created_at` |
| `calls` | `created_at` |
| `whatsapp_groups` | `created_at`, `updated_at` |
| `message_templates` | `created_at`, `updated_at` |
| `agent_stats` | `created_at`, `updated_at` |
| `sla_configurations` | `created_at`, `updated_at` |
| `conversation_sla` | `created_at`, `updated_at` |
| `queues` | `created_at`, `updated_at` |
| `queue_members` | `created_at` |
| `queue_goals` | `created_at`, `updated_at` |
| `products` | `created_at`, `updated_at` |
| `user_settings` | `created_at`, `updated_at` |
| `contact_notes` | `created_at`, `updated_at` |
| `business_hours` | `created_at`, `updated_at` |
| `away_messages` | `created_at`, `updated_at` |
| `message_reactions` | `created_at` |
| `scheduled_messages` | `created_at`, `created_by`, `updated_at` |
| `conversation_analyses` | `created_at` |
| `goals_configurations` | `created_at`, `updated_at` |
| `notifications` | `created_at` |
| `rate_limit_configs` | `created_at`, `updated_at` |
| `rate_limit_logs` | `created_at` |
| `blocked_ips` | `created_at` |
| `ip_whitelist` | `created_at` |
| `mfa_sessions` | `created_at` |
| `security_alerts` | `created_at` |
| `permissions` | `created_at` |
| `role_permissions` | `created_at` |
| `user_devices` | `created_at` |
| `passkey_credentials` | `created_at` |
| `webauthn_challenges` | `created_at` |
| `blocked_countries` | `created_at` |
| `allowed_countries` | `created_at` |
| `geo_blocking_settings` | `created_at`, `updated_at`, `updated_by` |
| `password_reset_requests` | `created_at`, `updated_at` |
| `login_attempts` | `created_at`, `updated_at` |
| `whatsapp_templates` | `created_at`, `created_by`, `updated_at` |
| `scheduled_reports` | `created_at`, `created_by`, `updated_at` |
| `csat_surveys` | `created_at` |
| `auto_close_config` | `created_at`, `updated_at`, `updated_by` |
| `campaigns` | `created_at`, `created_by`, `updated_at` |
| `campaign_contacts` | `created_at` |
| `chatbot_flows` | `created_at`, `created_by`, `updated_at` |
| `chatbot_executions` | `created_at` |
| `saved_filters` | `created_at`, `updated_at` |
| `entity_versions` | `created_at` |
| `contact_custom_fields` | `created_at`, `updated_at` |
| `whatsapp_connection_queues` | `created_at` |
| `global_settings` | `created_at`, `updated_at`, `updated_by` |
| `sales_pipeline_stages` | `created_at`, `updated_at` |
| `sales_deals` | `created_at`, `updated_at` |
| `deal_activities` | `created_at` |
| `knowledge_base_articles` | `created_at`, `created_by`, `updated_at` |
| `knowledge_base_files` | `created_at` |
| `meta_capi_events` | `created_at` |
| `whatsapp_flows` | `created_at`, `created_by`, `updated_at` |
| `agent_skills` | `created_at` |
| `queue_skill_requirements` | `created_at` |
| `csat_auto_config` | `created_at`, `updated_at`, `updated_by` |
| `warroom_alerts` | `created_at` |
| `followup_sequences` | `created_at`, `created_by`, `updated_at` |
| `followup_steps` | `created_at` |
| `followup_executions` | `created_at` |
| `whisper_messages` | `created_at` |
| `queue_positions` | `created_at` |
| `ai_conversation_tags` | `created_at` |
| `stickers` | `created_at`, `updated_at` |
| `automations` | `created_at`, `created_by`, `updated_at` |
| `scheduled_report_configs` | `created_at`, `created_by`, `updated_at` |
| `channel_connections` | `created_at`, `created_by`, `updated_at` |
| `channel_routing_rules` | `created_at` |
| `audio_memes` | `created_at` |
| `custom_emojis` | `created_at`, `updated_at` |
| `webhook_rate_limits` | `created_at` |
| `sicoob_contact_mapping` | `created_at` |
| `query_telemetry` | `created_at` |
| `agent_visibility_grants` | `created_at` |
| `nps_surveys` | `created_at` |
| `team_conversations` | `created_at`, `created_by`, `updated_at` |
| `team_messages` | `created_at`, `updated_at` |
| `gmail_accounts` | `created_at`, `updated_at` |
| `email_threads` | `created_at`, `updated_at` |
| `email_messages` | `created_at` |
| `email_labels` | `created_at` |
| `performance_snapshots` | `created_at` |
| `user_service_accounts` | `created_at`, `updated_at` |
| `ai_usage_logs` | `created_at` |
| `voice_command_logs` | `created_at` |
| `sla_rules` | `created_at`, `updated_at` |
| `ai_providers` | `created_at`, `created_by`, `updated_at` |
| `talkx_campaigns` | `created_at`, `created_by`, `updated_at` |
| `talkx_recipients` | `created_at`, `updated_at` |
| `talkx_blacklist` | `created_at` |
| `conversation_snoozes` | `created_at` |
| `pinned_conversations` | `created_at` |
| `favorite_contacts` | `created_at` |
| `conversation_tasks` | `created_at`, `created_by`, `updated_at` |
| `reminders` | `created_at` |
| `conversation_closures` | `created_at` |
| `conversation_memory` | `created_at`, `updated_at`, `updated_by` |
| `playbooks` | `created_at`, `created_by`, `updated_at` |
| `number_reputation` | `created_at`, `updated_at` |
| `training_sessions` | `created_at` |
| `crisis_room_alerts` | `created_at` |
| `campaign_ab_variants` | `created_at` |
| `conversation_events` | `created_at` |
| `audio_meme_favorites` | `created_at` |
| `link_preview_cache` | `created_at`, `updated_at` |
| `email_attachments` | `created_at` |
| `ops.hermes_change_log` | `created_at` |
| `edge_rate_limits` | `updated_at` |
| `feature_flags` | `updated_at`, `updated_by` |
| `talkx_segments` | `created_at`, `created_by`, `updated_at` |
| `talkx_templates` | `created_at`, `created_by`, `updated_at` |
| `talkx_campaign_events` | `created_at` |
| `crm_sync_outbox` | `created_at`, `updated_at` |
| `catalog_favorites` | `created_at` |
| `catalog_send_events` | `created_at` |
| `talkx_links` | `created_at`, `created_by` |
| `talkx_settings` | `updated_at` |
| `agent_presence` | `updated_at` |
| `multiplix_dispatches` | `created_at`, `created_by`, `updated_at` |
| `multiplix_recipients` | `created_at`, `updated_at` |
| `multiplix_blocks` | `created_at`, `updated_at` |
| `team_message_reactions` | `created_at` |
| `department_audit_logs` | `created_at` |
| `department_invitations` | `created_at`, `created_by` |
| `departments` | `created_at`, `updated_at` |
| `multiplix_delivery_items` | `created_at`, `updated_at` |
| `multiplix_events` | `created_at` |
| `multiplix_audiences` | `created_at`, `updated_at` |
| `ai_jobs` | `created_at`, `updated_at` |
| `talkx_optout_keywords` | `created_at`, `created_by` |
| `talkx_campaign_segments` | `created_at`, `updated_at` |
| `ai_model_prices` | `created_at` |
| `multiplix_voice_assets` | `created_at`, `created_by` |
| `talkx_delivery_log` | `created_at` |
| `gmail_oauth_states` | `created_at` |
| `app_settings` | `updated_at` |
| `copilot_feedback` | `created_at`, `created_by` |
| `copilot_outcomes` | `created_at` |
| `talkx_suppression_reasons` | `created_at`, `created_by` |
| `assistant_profiles` | `created_at`, `updated_at` |
| `talkx_ai_requests` | `created_at`, `created_by` |
| `talkx_template_versions` | `created_at` |
| `talkx_template_variants` | `created_at` |
| `talkx_conversions` | `created_at` |
| `department_invites` | `created_at`, `created_by` |
| `multiplix_audience_members` | `created_at` |
| `ai_budget_reservations` | `created_at`, `updated_at` |
| `talkx_test_send_claims` | `created_at` |
| `multiplix_voice_grants` | `created_at`, `created_by` |
| `searchbox_budget_alert_emails` | `created_at`, `updated_at` |
| `agent_mini_game_xp_daily` | `created_at`, `updated_at` |
| `ai_usage_outbox` | `created_at` |
| `talkx_data_jobs` | `created_at`, `updated_at` |
| `talkx_contact_attributes` | `updated_at` |
| `talkx_segment_versions` | `created_at`, `created_by` |
| `talkx_test_sends` | `created_at`, `created_by` |
| `message_attempts` | `created_at` |
| `message_favorites` | `created_at` |
| `message_reports` | `created_at` |
| `sla_alert_events` | `created_at` |
| `sla_alert_preferences` | `updated_at` |
| `email_signatures` | `created_at`, `updated_at` |
| `reconnection_logs` | `created_at` |
| `connection_alert_preferences` | `created_at`, `updated_at` |
| `qr_attempts` | `created_at` |
| `contact_protection_policy` | `created_at`, `updated_at` |
| `copilot_objection_catalog` | `created_at` |
| `copilot_usage` | `created_at` |
| `copilot_seller_settings` | `updated_at` |
| `copilot_help_requests` | `created_at` |
| `copilot_learning_moments` | `created_at` |
| `copilot_conversation_scores` | `updated_at` |
| `city_whitelist` | `created_at`, `created_by` |
| `_rb_message_reactions_one_per_agent_20261107121000` | `created_at` |
| `instance_pauses` | `created_at` |
| `outbox_events` | `created_at` |
| `search_events` | `created_at` |
| `voip_profile_credentials` | `created_at`, `updated_at` |

## Dados pessoais / sensíveis (LGPD — cuidado em logs, exports, prompts de IA)

| Tabela | Coluna |
|---|---|
| `profiles` | `email` |
| `profiles` | `phone` |
| `contacts` | `address` |
| `contacts` | `email` |
| `contacts` | `latitude` |
| `contacts` | `longitude` |
| `contacts` | `phone` |
| `audit_logs` | `ip_address` |
| `rate_limit_logs` | `ip_address` |
| `blocked_ips` | `ip_address` |
| `ip_whitelist` | `ip_address` |
| `security_alerts` | `ip_address` |
| `user_devices` | `ip_address` |
| `user_sessions` | `ip_address` |
| `password_reset_requests` | `email` |
| `password_reset_requests` | `ip_address` |
| `login_attempts` | `email` |
| `login_attempts` | `ip_address` |
| `talkx_blacklist` | `phone` |
| `department_invitations` | `email` |

## Colunas de dinheiro (tipo importa: numeric ✅ / float ❌)

| Tabela | Coluna | Tipo |
|---|---|---|
| `agent_stats` | `customer_satisfaction_score` | `DECIMAL(3,2)` |
| `products` | `price` | `number` |
| `conversation_analyses` | `customer_satisfaction` | `INTEGER` |
| `csat_surveys` | `feedback` | `text` |
| `campaigns` | `total_contacts` | `INTEGER` |
| `meta_capi_events` | `custom_data` | `JSONB` |
| `nps_surveys` | `feedback` | `TEXT` |
| `ai_usage_logs` | `total_tokens` | `INTEGER` |
| `talkx_campaigns` | `total_recipients` | `integer` |
| `training_sessions` | `feedback` | `TEXT` |
| `ops.hermes_change_log` | `custo_usd` | `numeric(10,4)` |
| `talkx_templates` | `custom_variables` | `text[]` |
| `multiplix_dispatches` | `total_recipients` | `integer` |
| `copilot_feedback` | `feedback_type` | `TEXT` |
| `talkx_ai_requests` | `cost_usd` | `numeric(18,` |
| `talkx_template_versions` | `custom_variables` | `text[]` |
| `talkx_contact_attributes` | `total_spent` | `number` |
| `talkx_segment_library_history` | `total_segments` | `integer` |
