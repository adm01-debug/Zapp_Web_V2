# Lints de segurança e performance

Verificações objetivas feitas no catálogo. Um agente deve ler isto antes de propor mudanças em RLS, functions ou índices.

| severidade | código | objeto | detalhe |
|---|---|---|---|
| MÉDIA | no_primary_key | public._zapp_fn_before | Sem chave primária: Realtime/replicação e updates por linha ficam frágeis. |
| MÉDIA | rls_no_policies | public._rb_message_reactions_contato_20261007001008 | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public._zapp_fn_before | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public._zapp_mig133_log | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.agent_mini_game_xp_daily | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.ai_budget_reservations | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.ai_jobs | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.away_message_log | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.catalog_rate_limit_hits | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.catalog_rate_limits | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.edge_rate_limits | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.gmail_oauth_states | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.link_preview_cache | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.search_events | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.searchbox_budget_alert_cron | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.searchbox_budget_alert_emails | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.talkx_storage_purge_queue | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.talkx_test_send_claims | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.team_chat_media_acl_r2_db_020_rb | RLS ligado sem policies: inacessível via API (só service_role). |
| MÉDIA | rls_no_policies | public.voip_profile_credentials | RLS ligado sem policies: inacessível via API (só service_role). |
| BAIXA | fk_without_index | public.city_whitelist.city_whitelist_created_by_fkey | FK sem índice nas colunas ['created_by']: joins e DELETE/UPDATE na tabela pai ficam lentos. |
| BAIXA | fk_without_index | public.conversation_tasks.conversation_tasks_message_id_fkey | FK sem índice nas colunas ['message_id']: joins e DELETE/UPDATE na tabela pai ficam lentos. |
| BAIXA | policy_auth_fn_not_wrapped | public.city_whitelist.Admins can manage city whitelist | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | public.whatsapp_connections.Admins can delete connections | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Admins can delete team chat files | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Auth upload audio memes owned | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Auth upload custom emojis owned | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Auth upload stickers owned | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Auth upload voice changer tmp owned | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Team chat files readable by owner admin or conversation member | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete own audio memes | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete own audio messages | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete own custom emojis | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete own stickers | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete own voice changer tmp | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete their own avatar | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can delete their own or assigned media | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can read assigned audio messages | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can read assigned whatsapp media | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can read own voice changer tmp | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can update own audio memes | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can update own audio messages | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can update own custom emojis | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can update own stickers | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can update own voice changer tmp | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can upload assigned audio messages | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Users can upload assigned whatsapp media | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.Whisper audio readable by whisper member | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.avatars owner insert | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.avatars owner update | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| BAIXA | policy_auth_fn_not_wrapped | storage.objects.whatsapp media readable via visible message | Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect. |
| INFO | realtime_replica_identity | public.agent_achievements | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.agent_presence | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.audio_meme_favorites | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.audio_memes | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.calls | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.copilot_insights | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.multiplix_dispatches | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.multiplix_recipients | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.talkx_blacklist | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.talkx_campaign_events | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.talkx_campaign_segments | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.talkx_segments | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.talkx_templates | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.team_conversation_members | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.team_conversations | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.team_message_reactions | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.team_message_receipts | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
| INFO | realtime_replica_identity | public.team_messages | Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo. |
