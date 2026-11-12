# public.profiles

> Perfil de atendente ligado a auth.users: nome, avatar, departamento e role em cache (fonte de verdade de permissao = user_roles + role_permissions).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 6 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |
| usada por views | public.profiles_public |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `name` | `text` | não |  |  |  |
| 4 | `email` | `text` | sim |  |  |  |
| 5 | `avatar_url` | `text` | sim |  |  |  |
| 6 | `role` | `text` | sim | `'agent'::text` |  |  |
| 7 | `max_chats` | `integer` | sim | `5` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `job_title` | `text` | sim |  |  |  |
| 11 | `department` | `text` | sim |  |  |  |
| 12 | `phone` | `text` | sim |  |  |  |
| 13 | `access_level` | `text` | sim | `'basic'::text` |  | DEPRECATED 2026-08-30: coluna não está sendo lida por nenhuma policy de acesso crítica.    Fonte de verdade = user_roles + role_permissions. Remover após confirmar 0 consumidores no front. |
| 14 | `permissions` | `jsonb` | sim | `'{}'::jsonb` |  | DEPRECATED 2026-08-30: jsonb ad-hoc nunca populado (valor = {} em 100% dos registros).    Sistema de permissões oficial está em permissions + role_permissions. Candidata a DROP. |
| 15 | `is_active` | `boolean` | sim | `true` |  |  |
| 16 | `session_invalidated_at` | `timestamp with time zone` | sim |  |  |  |
| 17 | `birthday` | `date` | sim |  |  |  |
| 18 | `nickname` | `text` | sim |  |  |  |
| 19 | `signature` | `text` | sim |  |  |  |
| 20 | `can_download` | `boolean` | não | `false` |  |  |
| 21 | `department_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| profiles_department_id_fkey | FOREIGN KEY | `FOREIGN KEY (department_id) REFERENCES departments(id)` | NO ACTION | NO ACTION | sim |
| profiles_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| profiles_role_check | CHECK | `CHECK (role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text]))` |  |  | sim |
| profiles_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| profiles_user_id_key | UNIQUE | `UNIQUE (user_id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.agent_achievements | agent_achievements_profile_id_fkey | profile_id | CASCADE |
| public.agent_mini_game_xp_daily | agent_mini_game_xp_daily_profile_id_fkey | profile_id | CASCADE |
| public.agent_skills | agent_skills_profile_id_fkey | profile_id | CASCADE |
| public.agent_stats | agent_stats_profile_id_fkey | profile_id | CASCADE |
| public.agent_visibility_grants | agent_visibility_grants_agent_id_fkey | agent_id | CASCADE |
| public.agent_visibility_grants | agent_visibility_grants_can_see_agent_id_fkey | can_see_agent_id | CASCADE |
| public.agent_visibility_grants | agent_visibility_grants_granted_by_fkey | granted_by | SET NULL |
| public.ai_providers | ai_providers_created_by_fkey | created_by | NO ACTION |
| public.ai_usage_logs | ai_usage_logs_profile_id_fkey | profile_id | SET NULL |
| public.auto_close_config | auto_close_config_updated_by_fkey | updated_by | SET NULL |
| public.automations | automations_created_by_fkey | created_by | SET NULL |
| public.calls | calls_agent_id_fkey | agent_id | SET NULL |
| public.calls | calls_answered_by_fkey | answered_by | NO ACTION |
| public.campaigns | campaigns_created_by_fkey | created_by | NO ACTION |
| public.catalog_send_events | catalog_send_events_agent_id_fkey | agent_id | SET NULL |
| public.channel_connections | channel_connections_created_by_fkey | created_by | NO ACTION |
| public.chatbot_flows | chatbot_flows_created_by_fkey | created_by | NO ACTION |
| public.client_wallet_rules | client_wallet_rules_agent_id_fkey | agent_id | CASCADE |
| public.contact_notes | contact_notes_author_id_fkey | author_id | CASCADE |
| public.contacts | contacts_assigned_to_fkey | assigned_to | SET NULL |
| public.conversation_analyses | conversation_analyses_analyzed_by_fkey | analyzed_by | NO ACTION |
| public.conversation_closures | conversation_closures_closed_by_fkey | closed_by | SET NULL |
| public.conversation_events | conversation_events_from_agent_id_fkey | from_agent_id | NO ACTION |
| public.conversation_events | conversation_events_performed_by_fkey | performed_by | NO ACTION |
| public.conversation_events | conversation_events_to_agent_id_fkey | to_agent_id | NO ACTION |
| public.conversation_memory | conversation_memory_updated_by_fkey | updated_by | SET NULL |
| public.conversation_snoozes | conversation_snoozes_snoozed_by_fkey | snoozed_by | CASCADE |
| public.conversation_tasks | conversation_tasks_assigned_to_fkey | assigned_to | SET NULL |
| public.conversation_tasks | conversation_tasks_created_by_fkey | created_by | SET NULL |
| public.crisis_room_alerts | crisis_room_alerts_acknowledged_by_fkey | acknowledged_by | NO ACTION |
| public.crm_contact_links | crm_contact_links_linked_by_fkey | linked_by | SET NULL |
| public.csat_auto_config | csat_auto_config_updated_by_fkey | updated_by | NO ACTION |
| public.csat_surveys | csat_surveys_agent_id_fkey | agent_id | SET NULL |
| public.deal_activities | deal_activities_performed_by_fkey | performed_by | SET NULL |
| public.department_audit_logs | department_audit_logs_profile_id_fkey | profile_id | SET NULL |
| public.department_invitations | department_invitations_used_by_fkey | used_by | SET NULL |
| public.department_invites | department_invites_created_by_fkey | created_by | SET NULL |
| public.followup_sequences | followup_sequences_created_by_fkey | created_by | NO ACTION |
| public.goals_configurations | goals_configurations_profile_id_fkey | profile_id | CASCADE |
| public.instance_pauses | instance_pauses_investigated_by_fkey | investigated_by | SET NULL |
| public.instance_pauses | instance_pauses_paused_by_fkey | paused_by | SET NULL |
| public.instance_pauses | instance_pauses_resumed_by_fkey | resumed_by | SET NULL |
| public.knowledge_base_articles | knowledge_base_articles_created_by_fkey | created_by | SET NULL |
| public.message_reactions | message_reactions_user_id_fkey | user_id | CASCADE |
| public.messages | messages_agent_id_fkey | agent_id | SET NULL |
| public.nps_surveys | nps_surveys_agent_id_fkey | agent_id | NO ACTION |
| public.performance_snapshots | performance_snapshots_profile_id_fkey | profile_id | CASCADE |
| public.pinned_conversations | pinned_conversations_pinned_by_fkey | pinned_by | CASCADE |
| public.playbooks | playbooks_created_by_fkey | created_by | SET NULL |
| public.queue_members | queue_members_profile_id_fkey | profile_id | CASCADE |
| public.reminders | reminders_profile_id_fkey | profile_id | CASCADE |
| public.sales_deals | sales_deals_assigned_to_fkey | assigned_to | SET NULL |
| public.scheduled_messages | scheduled_messages_created_by_fkey | created_by | NO ACTION |
| public.scheduled_report_configs | scheduled_report_configs_created_by_fkey | created_by | SET NULL |
| public.sicoob_contact_mapping | sicoob_contact_mapping_zappweb_agent_id_fkey | zappweb_agent_id | NO ACTION |
| public.sla_alert_events | sla_alert_events_resolved_by_fkey | resolved_by | SET NULL |
| public.sla_rules | sla_rules_agent_id_fkey | agent_id | CASCADE |
| public.stickers | stickers_owner_id_fkey | owner_id | CASCADE |
| public.talkx_blacklist | talkx_blacklist_blocked_by_fkey | blocked_by | SET NULL |
| public.talkx_blacklist | talkx_blacklist_removed_by_fkey | removed_by | SET NULL |
| public.talkx_campaign_events | talkx_campaign_events_actor_id_fkey | actor_id | SET NULL |
| public.talkx_campaigns | talkx_campaigns_cancelled_by_fkey | cancelled_by | SET NULL |
| public.talkx_campaigns | talkx_campaigns_consent_confirmed_by_fkey | consent_confirmed_by | SET NULL |
| public.talkx_campaigns | talkx_campaigns_created_by_fkey | created_by | NO ACTION |
| public.talkx_campaigns | talkx_campaigns_launch_confirmed_by_fkey | launch_confirmed_by | NO ACTION |
| public.talkx_campaigns | talkx_campaigns_launched_by_fkey | launched_by | NO ACTION |
| public.talkx_campaigns | talkx_campaigns_owner_fkey | owner | SET NULL |
| public.talkx_campaigns | talkx_campaigns_paused_by_fkey | paused_by | SET NULL |
| public.talkx_campaigns | talkx_campaigns_responsible_id_fkey | responsible_id | SET NULL |
| public.talkx_links | talkx_links_created_by_fkey | created_by | SET NULL |
| public.talkx_optout_keywords | talkx_optout_keywords_created_by_fkey | created_by | SET NULL |
| public.talkx_segment_versions | talkx_segment_versions_created_by_fkey | created_by | SET NULL |
| public.talkx_segments | talkx_segments_created_by_fkey | created_by | SET NULL |
| public.talkx_segments | talkx_segments_published_by_fkey | published_by | SET NULL |
| public.talkx_template_versions | talkx_template_versions_saved_by_fkey | saved_by | SET NULL |
| public.talkx_templates | talkx_templates_created_by_fkey | created_by | SET NULL |
| public.team_conversation_members | team_conversation_members_profile_id_fkey | profile_id | CASCADE |
| public.team_conversations | team_conversations_created_by_fkey | created_by | NO ACTION |
| public.team_conversations | team_conversations_direct_member_a_fkey | direct_member_a | SET NULL |
| public.team_conversations | team_conversations_direct_member_b_fkey | direct_member_b | SET NULL |
| public.team_message_reactions | team_message_reactions_profile_id_fkey | profile_id | CASCADE |
| public.team_message_receipts | team_message_receipts_profile_id_fkey | profile_id | CASCADE |
| public.team_messages | team_messages_sender_id_fkey | sender_id | NO ACTION |
| public.training_sessions | training_sessions_profile_id_fkey | profile_id | CASCADE |
| public.voip_profile_credentials | voip_profile_credentials_profile_id_fkey | profile_id | CASCADE |
| public.warroom_alerts | warroom_alerts_dismissed_by_fkey | dismissed_by | NO ACTION |
| public.whatsapp_connections | whatsapp_connections_created_by_fkey | created_by | SET NULL |
| public.whatsapp_flows | whatsapp_flows_created_by_fkey | created_by | SET NULL |
| public.whisper_messages | whisper_messages_sender_id_fkey | sender_id | NO ACTION |
| public.whisper_messages | whisper_messages_target_agent_id_fkey | target_agent_id | NO ACTION |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_profiles_dept_id | btree | department_id | não | sim | `(department_id IS NOT NULL)` | `CREATE INDEX idx_profiles_dept_id ON public.profiles USING btree (department_id) WHERE (department_id IS NOT NULL)` |
| idx_profiles_is_active | btree | is_active | não | sim |  | `CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active)` |
| profiles_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)` |
| profiles_user_id_key | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles USING btree (user_id)` |


## Policies (RLS)

### `Admin supervisor can view all profiles`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can update any profile`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Block sensitive field changes by non-admins`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | RESTRICTIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) OR ((role = ( SELECT p.role    FROM profiles p   WHERE (p.user_id = auth.uid()))) AND (access_level = ( SELECT p.access_level    FROM profiles p   WHERE (p.user_id = auth.uid()))) AND (permissions = ( SELECT p.permissions    FROM profiles p   WHERE (p.user_id = auth.uid()))) AND (is_active = ( SELECT p.is_active    FROM profiles p   WHERE (p.user_id = auth.uid())))))` |

### `Users can insert their own profile safely`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((auth.uid() = user_id) AND ((role IS NULL) OR (role = 'agent'::text)) AND ((access_level IS NULL) OR (access_level = 'basic'::text)) AND ((permissions IS NULL) OR (permissions = '{}'::jsonb)))` |

### `Users can update own profile`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(auth.uid() = user_id)` |
| WITH CHECK | `(auth.uid() = user_id)` |

### `Users can view own profile`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| on_profile_created_init_stats | AFTER | INSERT | ROW | enabled | public.init_agent_stats |
| on_profile_created_seed_goals | AFTER | INSERT | ROW | enabled | public.seed_default_goals_for_profile |
| prevent_can_download_escalation | BEFORE | UPDATE | ROW | enabled | public.prevent_can_download_escalation |
| prevent_privilege_escalation | BEFORE | UPDATE | ROW | enabled | public.prevent_profile_privilege_escalation |
| trg_revoke_sessions_on_profile_deactivate | AFTER | UPDATE | ROW | enabled | public.trg_revoke_sessions_on_profile_deactivate |
| update_profiles_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
