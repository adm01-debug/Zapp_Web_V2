# Realtime

## Publications

| publication | all tables | insert | update | delete | truncate |
|---|---|---|---|---|---|
| supabase_realtime | não | sim | sim | sim | sim |
| supabase_realtime_messages_publication | não | sim | sim | sim | sim |

## Tabelas publicadas (Postgres Changes)

| publication | tabela | replica identity |
|---|---|---|
| supabase_realtime | public.agent_achievements | default |
| supabase_realtime | public.agent_presence | default |
| supabase_realtime | public.agent_stats | full |
| supabase_realtime | public.audio_meme_favorites | default |
| supabase_realtime | public.audio_memes | default |
| supabase_realtime | public.calls | default |
| supabase_realtime | public.contacts | full |
| supabase_realtime | public.conversation_sla | full |
| supabase_realtime | public.conversation_tasks | full |
| supabase_realtime | public.copilot_insights | default |
| supabase_realtime | public.email_messages | full |
| supabase_realtime | public.email_threads | full |
| supabase_realtime | public.message_reactions | full |
| supabase_realtime | public.messages | full |
| supabase_realtime | public.multiplix_dispatches | default |
| supabase_realtime | public.multiplix_recipients | default |
| supabase_realtime | public.notifications | full |
| supabase_realtime | public.queue_goals | full |
| supabase_realtime | public.queue_members | full |
| supabase_realtime | public.queues | full |
| supabase_realtime | public.sales_deals | full |
| supabase_realtime | public.talkx_blacklist | default |
| supabase_realtime | public.talkx_campaign_events | default |
| supabase_realtime | public.talkx_campaign_segments | default |
| supabase_realtime | public.talkx_campaigns | full |
| supabase_realtime | public.talkx_recipients | full |
| supabase_realtime | public.talkx_segments | default |
| supabase_realtime | public.talkx_templates | default |
| supabase_realtime | public.team_conversation_members | default |
| supabase_realtime | public.team_conversations | default |
| supabase_realtime | public.team_message_reactions | default |
| supabase_realtime | public.team_message_receipts | default |
| supabase_realtime | public.team_messages | default |
| supabase_realtime | public.warroom_alerts | full |
| supabase_realtime | public.whatsapp_connections | full |
| supabase_realtime | public.whisper_messages | full |
| supabase_realtime_messages_publication | realtime.messages_2026_11_01 |  |
| supabase_realtime_messages_publication | realtime.messages_2026_11_02 |  |
| supabase_realtime_messages_publication | realtime.messages_2026_11_03 |  |
| supabase_realtime_messages_publication | realtime.messages_2026_11_04 |  |
| supabase_realtime_messages_publication | realtime.messages_2026_11_05 |  |
| supabase_realtime_messages_publication | realtime.messages_2026_11_06 |  |
| supabase_realtime_messages_publication | realtime.messages_2026_11_07 |  |

## Broadcast / Presence (policies em realtime.messages)

| policy | cmd | roles | USING | WITH CHECK |
|---|---|---|---|---|
| realtime_topic_insert_autorizado | INSERT | authenticated |  | `(can_access_realtime_topic(realtime.topic()) AND can_access_realtime_topic(topic))` |
| realtime_topic_select_autorizado | SELECT | authenticated | `(can_access_realtime_topic(realtime.topic()) AND can_access_realtime_topic(topic))` |  |
