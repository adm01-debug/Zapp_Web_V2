# Funções SECURITY DEFINER em `public` executáveis por `authenticated` (QA5-02)

Gerado em 04/10/2026 pela sessão da Fase 0. Só leitura. Nada foi alterado.

## Em uma frase
Das 266 funções de `public` que rodam com poder de dono (SECURITY DEFINER), **112** podem ser chamadas por qualquer usuário logado. O app só usa de verdade 61 delas.

## Fontes
- Permissões: produção, lidas pelo `zapp-db-ler` (catálogo `pg_proc`, coluna `proacl`). Dado bruto: `dados/secdef_public_prod.json`.
- Quem chama: código da branch `dia/2026-10-04` (`src/`, `supabase/functions/`) e objetos do banco local (regras de acesso, visões, valores padrão, restrições, tarefas agendadas, corpo das outras funções). O banco local tem estrutura idêntica à produção.
- Tabela completa: `dados/secdef_authenticated_classificacao.tsv`.

## Resultado
| Classe | Funções | O que significa |
|---|---|---|
| Precisa de authenticated | 61 | o app chama com a sessão do usuário, ou uma regra de acesso/visão/função comum usa |
| Sem uso encontrado no app | 37 | nenhum arquivo de `src/` nem edge function cita; aparece só em docs, testes ou scripts |
| Só edge function | 10 | citada apenas em edge function; falta conferir se a função usa a chave de serviço |
| Só interna | 3 | chamada apenas por outras funções com poder de dono |
| Gatilho | 1 | função de gatilho; ninguém precisa de EXECUTE |

Das 61 que precisam de authenticated, **15** não têm checagem visível de quem está chamando (busca por `auth.uid()`, `auth.jwt()`, `has_role`, `is_admin` etc. no corpo). Isso é indício, não prova: várias são as próprias funções de checagem de papel.

Na produção, 2 funções ainda aceitam chamada sem login (`PUBLIC`): `record_incoming_call_event` (7 parâmetros) e `record_talkx_campaign_lifecycle_event`. A correção da primeira já está na branch do dia (M-DB-02), ainda não aplicada na produção.

## Limites desta análise
- Busca por nome: função chamada por nome montado em tempo de execução não aparece.
- Chamadores de fora do repositório (n8n, outros sistemas com token de usuário) não são vistos.
- "Sem uso encontrado" quer dizer sem uso no app deste repositório. A ação proposta é tirar o EXECUTE de `authenticated`, nunca apagar a função.
- A coluna "checa chamador" é uma busca de texto no corpo.

## Causa raiz
A permissão padrão do papel `postgres` em `public` dá EXECUTE a `authenticated` e `service_role` em toda função nova. Função SECURITY DEFINER criada sem REVOKE explícito nasce aberta a qualquer usuário logado.

## Cartões propostos (rascunhos em `cartoes_qa5_02/`, ainda NÃO criados no quadro)
| Arquivo | Título | Funções |
|---|---|---|
| `01.md` | QA5-02 gatilho e funções internas: tirar EXECUTE de authenticated (4 funções) | 4 |
| `02.md` | QA5-02 funções usadas só por edge function: tirar EXECUTE de authenticated (10 funções) | 10 |
| `03.md` | QA5-02 chat de equipe sem chamador no app: tirar EXECUTE de authenticated (10 funções) | 10 |
| `04.md` | QA5-02 Talk X sem chamador no app: tirar EXECUTE de authenticated (10 funções) | 10 |
| `05.md` | QA5-02 demais funções sem chamador no app: tirar EXECUTE de authenticated (17 funções) | 17 |
| `06.md` | QA5-02 revisar checagem do chamador, parte 1 (7 funções) | 7 |
| `07.md` | QA5-02 revisar checagem do chamador, parte 2 (8 funções) | 8 |
| `08.md` | QA5-02 causa raiz: função nova em public não nasce mais executável por authenticated | 0 |

## Lista completa
| Função | Classe | Checa chamador | app | edge | regras/visões | Onde |
|---|---|---|---|---|---|---|
| `add_wa_tag_if_not_exists(uuid,text,text)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/_shared/evolution-webhook-handlers.ts |
| `catalog_rate_limit_hit(uuid,text,integer,integer)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/promogifts-catalog/index.ts |
| `get_crm_sync_health()` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/crm-integration/index.ts |
| `mark_first_response(uuid)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/message-delivery/index.ts |
| `notify_searchbox_budget()` | edge function (conferir se usa a sessão do usuário) | não | 0 | 1 | 0 | supabase/functions/searchbox-budget-alert/index.ts |
| `record_talkx_conversion(uuid,text,numeric,text,text,uuid,uuid,timestamp with time zone,jsonb)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/talkx-link/index.ts |
| `remove_wa_label_from_all_contacts(text)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/_shared/evolution-webhook-handlers.ts |
| `remove_wa_tag_by_prefix(uuid,text)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/_shared/evolution-webhook-handlers.ts |
| `rename_wa_label_on_all_contacts(text,text)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/_shared/evolution-webhook-handlers.ts |
| `retry_talkx_recipient(uuid)` | edge function (conferir se usa a sessão do usuário) | sim | 0 | 1 | 0 | supabase/functions/talkx-send/index.ts |
| `record_talkx_campaign_lifecycle_event()` | gatilho (ninguém precisa de EXECUTE) | sim | 0 | 0 | 0 |  |
| `accept_department_invite(text)` | precisa de authenticated | não | 1 | 0 | 0 | src/hooks/team-chat/useDepartmentManagement.ts |
| `add_agent_xp(uuid,integer)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/gamification/mutations.ts |
| `can_delete_contacts(uuid[])` | precisa de authenticated | sim | 5 | 0 | 0 | src/components/contacts/ContactsView.tsx; src/components/contacts/contactPermissions.ts |
| `can_edit_contact(uuid,uuid)` | precisa de authenticated | não | 5 | 0 | 2 | src/components/contacts/BulkActionsBar.tsx; src/components/contacts/ContactsView.tsx; publ |
| `can_edit_contact(uuid,uuid,uuid[],uuid,boolean)` | precisa de authenticated | sim | 5 | 0 | 2 | src/components/contacts/BulkActionsBar.tsx; src/components/contacts/ContactsView.tsx; publ |
| `clear_login_attempts(text)` | precisa de authenticated | sim | 2 | 1 | 0 | src/lib/loginAttempts.ts; src/lib/serverLogin.ts; supabase/functions/auth-login/index.ts |
| `close_conversation_atomic(uuid,uuid,text,text,text,text)` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/inbox/CloseConversationDialog.tsx; src/components/inbox/chat/useChatPanelHa |
| `count_searchbox_sessions_this_month()` | precisa de authenticated | não | 2 | 0 | 0 | src/lib/mapboxCostGuard.ts; src/lib/mapboxSession.ts |
| `current_profile_id()` | precisa de authenticated | sim | 0 | 0 | 17 | public.conversation_tasks; public.department_audit_logs |
| `dashboard_sentiment_alerts(timestamp with time zone)` | precisa de authenticated | sim | 1 | 0 | 0 | src/components/dashboard/useSentimentData.ts |
| `delete_contact(uuid)` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/contacts/contactPermissions.ts; src/components/contacts/useContactsCRUD.ts |
| `delete_contacts(uuid[])` | precisa de authenticated | sim | 1 | 0 | 0 | src/components/contacts/BulkActionsBar.tsx |
| `delete_talkx_campaign(uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/integrations/useTalkX.ts |
| `duplicate_talkx_campaign(uuid)` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/talkx/TalkXView.tsx; src/hooks/integrations/useTalkX.ts |
| `enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)` | precisa de authenticated | sim | 2 | 0 | 0 | src/hooks/chat/useForwardMedia.ts; src/services/outbound-message.service.ts |
| `enqueue_rich_outbound_message(uuid,uuid,text,text,jsonb,uuid,uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/services/outbound-message.service.ts |
| `find_or_create_direct_conversation(uuid)` | precisa de authenticated | não | 1 | 0 | 0 | src/hooks/team-chat/useTeamChatMutations.ts |
| `fn_list_audio_memes_for_user(text,boolean,text)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/communication/useAudioMemes.ts |
| `fn_send_audio_meme(uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/communication/useAudioMemes.ts |
| `fn_toggle_user_meme_favorite(uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/communication/useAudioMemes.ts |
| `get_conversation_tab_counts(uuid)` | precisa de authenticated | sim | 4 | 0 | 0 | src/components/inbox/RealtimeInboxView.tsx; src/components/inbox/chat/ConversationTabs.tsx |
| `get_last_message_dates(uuid[])` | precisa de authenticated | sim | 2 | 0 | 0 | src/hooks/crm/useContactsSearch.ts; src/services/contact.service.ts |
| `get_own_gmail_accounts()` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/admin/GmailWebhookMonitor.tsx; src/hooks/integrations/useGmail.ts |
| `get_profile_id_for_user(uuid)` | precisa de authenticated | sim | 0 | 0 | 27 | public.campaign_ab_variants; public.contact_notes |
| `get_team_conversation_previews()` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/team-chat/useTeamConversations.ts |
| `get_team_profiles()` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/inbox/chat/MentionAutocomplete.tsx; src/hooks/crm/useTeamProfiles.ts |
| `get_team_unread_counts()` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/team-chat/useTeamConversations.ts |
| `get_visible_agent_ids(uuid)` | precisa de authenticated | sim | 1 | 0 | 7 | src/hooks/crm/useVisibleAgents.ts; public.contacts; public.conversation_sla |
| `grant_agent_achievement(uuid,text,text,text,integer)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/gamification/mutations.ts |
| `has_role(uuid,app_role)` | precisa de authenticated | não | 2 | 0 | 17 | src/components/dashboard/useSentimentData.ts; src/components/docs/featuresSectionsData.ts; |
| `increment_agent_messages(uuid,text)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/gamification/mutations.ts |
| `increment_agent_resolutions(uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/gamification/mutations.ts |
| `is_admin(uuid)` | precisa de authenticated | não | 4 | 2 | 22 | src/components/groups/GroupsView.tsx; src/hooks/groups/actions.ts; supabase/functions/mult |
| `is_admin_or_supervisor(uuid)` | precisa de authenticated | não | 7 | 11 | 271 | src/components/contacts/ContactToolbar.tsx; src/components/contacts/ContactsView.tsx; supa |
| `is_contact_visible_to_user(uuid,uuid)` | precisa de authenticated | sim | 0 | 0 | 18 | public.ai_conversation_tags; public.contact_notes |
| `is_team_conversation_member(uuid,uuid)` | precisa de authenticated | não | 0 | 0 | 5 | public.team_conversation_members; public.team_conversations |
| `is_within_business_hours(uuid)` | precisa de authenticated | não | 1 | 0 | 0 | src/hooks/business/useBusinessHoursCheck.ts |
| `log_audit_event(text,text,text,jsonb,text)` | precisa de authenticated | sim | 3 | 0 | 0 | src/components/compliance/LGPDComplianceView.tsx; src/lib/audit.ts |
| `merge_contacts_atomic(uuid,uuid[],jsonb)` | precisa de authenticated | sim | 4 | 0 | 0 | src/components/contacts/ContactToolbar.tsx; src/components/contacts/ContactsView.tsx |
| `notify_due_tasks()` | precisa de authenticated | não | 2 | 0 | 0 | src/components/notifications/ReminderNotification.tsx; src/hooks/tasks/useWorkItemNotifica |
| `reassign_absent_agents(integer)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/crm/useAgentReassignment.ts |
| `reassign_overloaded_agents()` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/crm/useAgentReassignment.ts |
| `record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text)` | precisa de authenticated | não | 1 | 1 | 0 | src/lib/calls/WhatsAppCallAdapter.ts; supabase/functions/_shared/evolution-webhook-handler |
| `replace_talkx_draft_recipients(uuid,uuid[])` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/integrations/useTalkX.ts |
| `save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/talkx/useCampaignEditor.ts; src/hooks/integrations/useTalkX.ts |
| `search_contacts(text,text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean)` | precisa de authenticated | sim | 2 | 1 | 0 | src/hooks/crm/contactsAggregates.ts; src/services/contact.service.ts; supabase/functions/v |
| `search_knowledge_base(text,integer)` | precisa de authenticated | não | 1 | 1 | 0 | src/hooks/integrations/useKnowledgeBaseSearch.ts; supabase/functions/chatbot-l1/index.ts |
| `set_call_agent_notes(uuid,text)` | precisa de authenticated | sim | 3 | 0 | 0 | src/components/calls/TelefoniaView.tsx; src/hooks/communication/useCallHistory.ts |
| `skill_based_assign(uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/system/useSkillBasedAssign.ts |
| `snapshot_talkx_campaign_audience(uuid,bigint)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/integrations/useTalkX.ts |
| `talk_me_claim(uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/features/talk-me/useTalkMeQueue.ts |
| `talk_me_list_queues()` | precisa de authenticated | sim | 1 | 0 | 0 | src/features/talk-me/useTalkMeQueue.ts |
| `talk_me_list_waiting(uuid,text,integer,timestamp with time zone,uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/features/talk-me/useTalkMeQueue.ts |
| `talkx_engine_cron_runs(integer)` | precisa de authenticated | não | 0 | 0 | 1 |  |
| `talkx_engine_window_open(uuid)` | precisa de authenticated | não | 0 | 0 | 1 |  |
| `talkx_resolve_audience(jsonb,uuid[],text,integer,uuid)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/integrations/useTalkXSegments.ts |
| `update_agent_streak(uuid,boolean)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/gamification/mutations.ts |
| `update_own_profile(text,text,text,text,text,text)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/auth/useSecureProfile.ts |
| `update_talkx_campaign_limits(uuid,bigint,jsonb)` | precisa de authenticated | sim | 1 | 0 | 0 | src/hooks/integrations/useTalkX.ts |
| `update_talkx_template_with_snapshot(uuid,timestamp with time zone,text,text,text,text,text,text,text[],text,text[])` | precisa de authenticated | sim | 2 | 0 | 0 | src/components/talkx/useCampaignEditor.ts; src/hooks/integrations/useTalkXTemplates.ts |
| `user_has_permission(uuid,text)` | precisa de authenticated | não | 4 | 6 | 0 | src/hooks/system/usePermissions.ts; src/hooks/system/useUserRole.ts; supabase/functions/cr |
| `admin_set_role(uuid,app_role)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `count_multiplix_dead_letters(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `create_department_invite(uuid,integer,integer)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `effective_role(uuid)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `fn_list_audio_meme_categories()` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `get_channel_credentials_safe(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `get_connection_instance(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `get_connection_qr_code(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `get_identity_matrix()` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `get_profile_role_for_check(uuid)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `get_team_inbox()` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `get_team_messages_page(uuid,uuid,integer)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `is_country_allowed(text)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `is_country_blocked(text)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `is_ip_blocked(text)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `is_ip_whitelisted(text)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `leave_team_group(uuid)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `list_multiplix_dead_letters(integer,uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `log_talkx_campaign_checklist(uuid,jsonb)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `mark_team_conversation_read(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `remove_team_member(uuid,uuid)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `resolve_talkx_outcome_unknown(uuid,text,text,boolean)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `retry_talkx_recipients(uuid,uuid[])` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `search_team_messages(uuid,text,integer)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `set_conversation_status(uuid,text,text)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `set_department_whatsapp_config(uuid,text,text,text)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `set_team_member_pref(uuid,boolean)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `set_team_member_role(uuid,uuid,text)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_benchmarks()` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_campaign_logs(uuid,timestamp with time zone,integer)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_campaign_pace(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_campaign_reply_stats(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_delete_link(uuid)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_set_campaign_investment(uuid,numeric)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `talkx_upsert_link(uuid,text,text,uuid,text,text,text,text,text)` | sem uso encontrado | sim | 0 | 0 | 0 |  |
| `toggle_team_reaction(uuid,text)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `transfer_team_conversation_department(uuid,uuid)` | sem uso encontrado | não | 0 | 0 | 0 |  |
| `is_privileged_contact_caller()` | só interno/service_role | sim | 0 | 0 | 0 |  |
| `require_contact_edit_permission(uuid)` | só interno/service_role | sim | 0 | 0 | 0 |  |
| `require_contact_global_admin()` | só interno/service_role | sim | 0 | 0 | 0 |  |
