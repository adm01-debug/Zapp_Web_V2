# Inventário dos canais Realtime — Zapp Web V2

Estado do código da base `dia/2026-10-13`. Cada linha desta página aponta o `arquivo:linha`
do assinante atual; o que não está aqui não assina Realtime.

Como provar (comando único, offline):

```sh
node scripts/docs/verificar-docs-realtime.mjs
```

O verificador relê esta página, confere que cada `arquivo:linha` citado existe e tem a linha, que
cada tabela listada está na publication `supabase_realtime` (replay das migrations em
`supabase/migrations/`), que a migration citada realmente adiciona a tabela e que o nome do canal
aparece no arquivo apontado.

**Recorte** (coluna das tabelas abaixo) é como o canal limita o que chega: `global` = sem filtro no
canal (o corte por linha é a RLS da tabela); `usuário`/`contato`/`conversa`/`mensagem`/`campanha`/
`disparo`/`chamada` = filtro no próprio canal, com tópico por chave.

## 1. Núcleo

- `src/hooks/realtime/useSupabaseRealtime.ts` é o único ponto que abre canal de
  `postgres_changes` de forma compartilhada. O tópico físico é `zapp:<canal>:<schema>:<tabela>:<filtro>`
  (`useSupabaseRealtime.ts:109` e `:130`), então dois componentes que pedem a mesma tabela com o
  mesmo filtro usam **um** canal e um só `removeChannel` (`:113`).
- O canal só é fechado 250 ms depois do último consumidor sair (`CHANNEL_RELEASE_GRACE_MS`,
  `useSupabaseRealtime.ts:41`), para o churn de `StrictMode`/remontagem não derrubar o canal de outro.
- Reconexão: só depois de um `SUBSCRIBED` que segue `CHANNEL_ERROR`, `TIMED_OUT` ou `CLOSED`
  (`useSupabaseRealtime.ts:146-154`); o primeiro `SUBSCRIBED` não revalida nada.
- Limite de rajada: 5 s por callback (`RECONNECT_THROTTLE_MS`, `useSupabaseRealtime.ts:49`).
  `online` e `visibilitychange` revalidam pelo mesmo limite (`:264-270`).
- Canais de **presence/broadcast** não passam por esse núcleo e usam nome fixo de propósito,
  porque clientes diferentes precisam do mesmo tópico (`src/lib/realtimeTopic.ts:10-12`).
  Para `postgres_changes` avulso existe `uniqueRealtimeTopic()` (`src/lib/realtimeTopic.ts:14`), que
  sufixa o nome com um UUID por instância.

## 2. Assinaturas `postgres_changes` (canal → tabela)

| Canal (tópico) | Tabela | Filtro no canal | Recorte | Onde (hook dono) |
|---|---|---|---|---|
| `global-messages-realtime` | `messages` | — | global | `src/hooks/chat/useRealtimeMessages.ts:215` |
| `global-contacts-realtime` | `contacts` | — | global | `src/hooks/chat/useRealtimeMessages.ts:224` |
| `messages:{contactId}` | `messages` | `contact_id=eq.{contactId}` | conversa | `src/hooks/chat/useMessages.ts:336` |
| `queues-changes` | `queues` | — | global | `src/hooks/business/useQueues.ts:240` |
| `queue-members-changes` | `queue_members` | — | global | `src/hooks/business/useQueues.ts:246` |
| `queue-goals-changes` (tópico único) | `queue_goals` | — | global | `src/hooks/business/useQueueGoals.ts:59` |
| `talk-me-contacts` | `contacts` | — | global | `src/features/talk-me/useTalkMeQueue.ts:355` |
| `talk-me-messages` | `messages` | — | global | `src/features/talk-me/useTalkMeQueue.ts:361` |
| `talk-me-queues` | `queues` | — | global | `src/features/talk-me/useTalkMeQueue.ts:367` |
| `talk-me-queue-members` | `queue_members` | — | global | `src/features/talk-me/useTalkMeQueue.ts:373` |
| `contact-enriched:{contactId}` | `contacts` | `id=eq.{contactId}` | contato | `src/hooks/crm/useContactEnrichedData.ts:71` |
| `agent-presence-changes` | `agent_presence` | — | global | `src/hooks/crm/useAgentPresence.ts:95` |
| `notifications-changes` | `notifications` | `user_id=eq.{user.id}` | usuário | `src/hooks/system/useNotifications.ts:111` |
| `incoming-calls` (tópico único) | `notifications` | `user_id=eq.{user.id}` | usuário | `src/hooks/communication/useIncomingCallListener.ts:77` |
| `sentiment-alerts` (tópico único) | `notifications` | `user_id=eq.{user.id}` | usuário | `src/hooks/inbox/useRealtimeSentimentAlerts.ts:106` |
| `sla-breaches` | `conversation_sla` | — | global | `src/hooks/sla/useSLANotifications.ts:67` |
| `warroom-alerts-realtime` | `warroom_alerts` | — | global | `src/hooks/business/useWarRoomAlerts.ts:128` |
| `work-items:{profileId}:{rand}` | `conversation_tasks` | `created_by=eq.{profileId}` | usuário | `src/hooks/tasks/useMyWorkItems.ts:262` |
| `transcription-{messageId}` | `messages` | `id=eq.{messageId}` | mensagem | `src/components/inbox/AudioMessagePlayer.tsx:45` |
| `transcription-notifications` | `messages` | — | global | `src/hooks/communication/useTranscriptionNotifications.ts:39` |
| `message-status-{contactId}` | `messages` | `contact_id=eq.{contactId}` | conversa | `src/hooks/chat/useMessageStatus.ts:67` |
| `reactions:{messageId}` | `message_reactions` | `message_id=eq.{messageId}` | mensagem | `src/hooks/chat/useMessageReactions.ts:35` |
| `chat-reactions:{messageId}` | `message_reactions` | — (tópico por mensagem) | mensagem | `src/services/realtime.service.ts:196` |
| `dashboard-realtime` (tópico único) | `messages`, `contacts` | — | global | `src/hooks/analytics/useRealtimeDashboard.ts:236` |
| `leaderboard-updates` (tópico único) | `agent_stats` | — | global | `src/hooks/gamification/useLeaderboard.ts:118` |
| `whisper-{contactId}` | `whisper_messages` | `contact_id=eq.{contactId}` | conversa | `src/components/inbox/WhisperMode.tsx:325` |
| `gmail-threads-realtime` | `email_messages`, `email_threads` | `gmail_account_id=eq.{conta}` | conta | `src/hooks/integrations/useGmail.ts:448` |
| `email-unread-count` (tópico único) | `email_threads` | — | global | `src/hooks/gmail/useUnreadEmailCount.ts:83` |
| `email-nao-lidos:{contato}` (tópico único) | `email_threads` | `contact_id=eq.{contato}` | contato | `src/hooks/gmail/useContactUnreadEmails.ts:118` |
| `team-messages-{conversationId}` | `team_messages` | `conversation_id=eq.{conversationId}` | conversa | `src/hooks/team-chat/useTeamMessages.ts:73` |
| `team-chat-updates` | `team_messages`, `team_conversation_members`, `team_message_receipts` | — | global | `src/hooks/team-chat/useTeamConversations.ts:110` |
| `team-chat-notifications` | `team_messages` | — | global | `src/hooks/chat/useTeamChatNotifications.ts:149` |
| `team-reactions-{conversationId}` | `team_message_reactions` ⚠️ | `conversation_id=eq.{conversationId}` | conversa | `src/hooks/team-chat/useTeamMessageReactions.ts:64` |
| `monitoring-status` | `whatsapp_connections` | — | global | `src/components/monitoring/hooks/useEvolutionMonitoring.ts:44` |
| `disconnect-banner` | `whatsapp_connections` | — | global | `src/components/alerts/EvolutionDisconnectBanner.tsx:39` |
| `whatsapp-connections-changes` | `whatsapp_connections` | — | global | `src/hooks/inbox/useConnectionsManager.ts:105` |
| `connections-health` | `whatsapp_connections` | — | global | `src/hooks/connections/useConnectionsHealth.ts:216` |
| `talkx-mon-{campaignId}` | `talkx_campaigns`, `talkx_recipients` | `id=eq.{campaignId}` / `campaign_id=eq.{campaignId}` | campanha | `src/components/talkx/TalkXLiveMonitor.tsx:89` |
| `talkx-logs-{campaignId}` | `talkx_recipients` | `campaign_id=eq.{campaignId}` | campanha | `src/components/talkx/TalkXCampaignRunning.tsx:523` |
| `talkx:campaigns` (tópico único) | `talkx_campaigns` | — | global | `src/hooks/integrations/useTalkX.ts:177` |
| `talkx:campaigns:list` (tópico único) | `talkx_campaigns` | — | global | `src/hooks/integrations/useTalkXCampaignList.ts:407` |
| `talkx-live-{campaignId}` (tópico único) | `talkx_campaigns`, `talkx_recipients`, `talkx_campaign_events` | `id=eq.{campaignId}` / `campaign_id=eq.{campaignId}` | campanha | `src/hooks/integrations/useTalkXLiveChannel.ts:137` |
| `multiplix-mon-{dispatchId}` | `multiplix_dispatches`, `multiplix_recipients` | `id=eq.{dispatchId}` / `dispatch_id=eq.{dispatchId}` | disparo | `src/components/multiplix/MultiplixMonitor.tsx:232` |
| `termino-remoto-{callId}` | `calls` | `id=eq.{callId}` | chamada | `src/hooks/calls/useTerminoRemoto.ts:39` |
| `calls-kpi-realtime` | `calls` | — | global | `src/hooks/calls/useCallsKpi.ts:112` |
| `copilot-insights:{sessionId}` | `copilot_insights` | `session_id=eq.{sessionId}` | sessão | `src/hooks/copilot/useCopilotInsights.ts` (a criar em CV-041) |

## 3. Presença e broadcast (sem tabela — nome fixo obrigatório)

| Canal | Tipo | Onde (hook dono) |
|---|---|---|
| `conversation:{contactId}` | presence | `src/components/inbox/collaboration/ViewersIndicator.tsx:27` |
| `typing:{conversationId}` | presence | `src/hooks/chat/useTypingPresence.ts:120` |
| `team-presence-{conversationId}` | presence | `src/hooks/team-chat/useTeamPresence.ts:15` |
| `team-typing-{conversationId}` | broadcast (`typing`) | `src/hooks/team-chat/useTeamTyping.ts:25` |

## 4. Sondagem de saúde

`diagnostics-realtime-probe` abre um canal e espera o ack do servidor; sem ack no prazo devolve
`unknown` (não medido), nunca "saudável" (`src/hooks/system/useDiagnosticsData.ts:86`).

## 5. Publicação `supabase_realtime`

Toda tabela acima precisa estar na publication, senão o evento não dispara. A migration que
colocou (ou repôs) cada uma:

| Tabela | Migration (ADD) |
|---|---|
| `messages`, `queues`, `queue_members` | `20260628110559_51d49930-e6c0-4491-ad50-f3c8fff72537.sql` |
| `contacts`, `whatsapp_connections`, `talkx_campaigns` | `20260826210200_realtime_publication_d5.sql` |
| `queue_goals`, `agent_stats`, `email_messages`, `email_threads`, `warroom_alerts`, `whisper_messages` | `20260828190000_realtime_publish_subscribed_tables.sql` |
| `agent_presence` | `20260924195600_agent_presence_server_side.sql` |
| `calls` | `20260926800000_calls_telefonia_v2.sql` |
| `notifications` | `20251228173815_bb7c29fb-508e-4da9-ba9c-4113d60706b5.sql` |
| `conversation_sla` | `20251220133021_6c78fd2e-ba75-4377-835a-a492e60f1e57.sql` |
| `conversation_tasks` | `20260928210000_reconcile_conversation_tasks_realtime_publication.sql` |
| `message_reactions` | `20260413123216_c48f8862-af0c-48bd-8037-475fb9977550.sql` |
| `team_messages`, `team_conversation_members`, `team_message_receipts` | `20260929240000_team_chat_e34_drift_mirror_metadata_realtime.sql` |
| `talkx_recipients` | `20261003212707_talkx_receipts_replies.sql` |
| `talkx_campaign_events` | `20260927570000_talkx_e27_realtime_campaign_events.sql` |
| `multiplix_recipients` | `20260927210000_multiplix_rls_hardening_realtime_pii.sql` |
| `multiplix_dispatches` | `20260929620000_multiplix_realtime_column_scope.sql` |
| `copilot_insights` | `20261016193100_copilot_insights.sql` (a aplicar via db-migrate.yml) |

`multiplix_*`, `talkx_recipients` e parte das demais entram com **lista explícita de colunas**
(`ADD TABLE public.x (col, col, ...)`), decisão de PII: só as colunas publicadas viajam no evento.

### ⚠️ Fora da publicação

Fora da publication hoje: `team_message_reactions`.

`team_message_reactions` **não** está na publication `supabase_realtime` em nenhuma migration
(criada em `20260902120000_team_chat_v3_parity_reactions_status_departments.sql:59`, sem ADD).
Como o canal `team-reactions-{conversationId}` (`src/hooks/team-chat/useTeamMessageReactions.ts:64`)
só existe assim, ele não dispara: a reação aparece na tela quando a query revalida (`staleTime` de
30 s, `src/hooks/team-chat/useTeamMessageReactions.ts:58`), não no clique dos outros usuários.
Achado fora do escopo deste cartão: vira comentário no cartão, não correção aqui.

## 6. Reconexão que revalida dados

Só três assinaturas passam `onReconnect` ao núcleo: `global-messages-realtime` e
`global-contacts-realtime` (`src/hooks/chat/useRealtimeMessages.ts:220` e `:228`, ambas refazem
`fetchConversations`) e `messages:{contactId}` (`src/hooks/chat/useMessages.ts:343`,
`recoverAfterReconnect`). Nas demais, o núcleo ainda usa `online`/`visibilitychange` para acordar o
canal, mas sem refetch extra.

---

## copilot_insights — painel ao vivo do RADAR (CV-018)

| Campo | Valor |
|---|---|
| Tabela | `public.copilot_insights` |
| Canal | `copilot-insights:{sessionId}` |
| Filtro | `session_id=eq.<id_da_sessao>` |
| Eventos | `INSERT` |
| Hook front | `useCopilotInsights` (a criar em CV-041) |
| RLS | Vendedor só recebe insights de suas sessões |
| Latência alvo | < 1 s (local) |
| Criado em | CV-018 / migration `20261016193100_copilot_insights.sql` |

## Regras gerais (desde CV-018)

1. Todo canal exige filtro — nunca `*`.
2. Registrar aqui com channel name, tabela, filtro, hook e migration.
3. Marcar como `[DEPRECIADO]` em vez de remover, com data e motivo.
