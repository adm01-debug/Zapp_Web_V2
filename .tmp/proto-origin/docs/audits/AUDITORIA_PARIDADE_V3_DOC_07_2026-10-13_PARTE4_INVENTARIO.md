# Paridade V3 -> V2: doc 07 (inbox: services, data-access, voz, SIP, reações, team-chat), recorte INVENTÁRIO ESTRUTURAL (2ª passada, 13/10/2026)

Fontes: V3 `origin/main` (git show/grep, sem checkout); V2 `~/hermes-workspaces/Zapp_Web_V2/.integrador` (HEAD 96dd72dc5f, 12/10 20:09). Somente leitura. O banco real NÃO foi consultado (só migrations).
Classificações: EQUIVALENTE, MELHOR_NA_V2, LACUNA, DECISAO (outra arquitetura/decisão do dono), MORTO_V3 (código morto ou doc defasado na V3, não vira lacuna).

## 0. Achado de método: o doc 07 está defasado na parte de dados

Conferido no código real da V3 (não no doc):
- `data-access/messageRepository.ts` NÃO lê `evolution_messages` (doc §2.1/§3.1). Lê `messages` (`:39`) e `whisper_messages` (`:55`); a assinatura realtime é na tabela `zapp.realtime_message_fanout` (`:107-137`); `listByContactJid` usa `RPC.listMessagesLite` (Evolution DB) e não tem importador (`git grep listByContactJid`: só o próprio arquivo).
- `whatsappStatusRepository.ts` usa `whatsapp_connections` (`:69,78`); `instance_registry` não aparece mais.
- `services/touchLastSeen.ts` NÃO recebe `(supabase, userId)`: a assinatura real é `touchLastSeen(): void` (`:12`), com `auth.getUser()` interno e `lastWriteAt` (`:7-9`).
- `messageService.getAllMessagesForContact(contactId, signal)` (sem `contactJid`), com `AbortSignal` e loop de 1000/página (`:38-68`). Só é o caminho LEGADO: `inboxSourceConfig.ts:3-13` define 'evo' (cursor, `rpc_list_messages_lite`, Evolution DB) x 'zapp' (legado) x 'auto'. A V2 só tem a fonte única `messages` (ingest do webhook) = DECISAO.
- Arquivos novos desde agosto dentro das pastas do doc 07 (ver §6 abaixo): `services/markMessagesRead.ts(+test)`, `utils/contactJid.ts(+test)`, `team-chat/useTeamPerformance.ts(+contract test)`, `reactions/__tests__/useReactionMutations.telemetry.test.tsx`.
- V2 não tem a pasta `src/features/inbox/`: os equivalentes estão em `src/hooks/{voice,sip,reactions,team-chat,inbox,chat}`, `src/services/{chat,realtime}.service.ts`, `src/adapters/inboxAdapter.ts`, `src/components/inbox/**`. Por isso "barrel raiz/data-access/services" do doc não têm par literal (DECISAO de estrutura, sem impacto).

## 1. §3.1 Tabelas via `.from()` / `dbFrom()` (V3 real) x V2

| Item | Classificação | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|
| `evolution_messages` (doc §3.1) | MORTO_V3 / DECISAO | doc defasado; código real usa `messages` (`messageRepository.ts:39`); caminho 'evo' só via RPC (`inboxSourceConfig.ts:3`) | sem tabela `evolution_messages` em `migrations` nem `types.ts` (grep CREATE TABLE = 0); mensagens entram por `evolution-webhook` -> `ingest_inbound_message` | DECISAO (Evolution DB externo fora da V2) |
| `messages` (SELECT paginado, UPDATE `is_read`) | EQUIVALENTE | `messageRepository.ts:37-46`, `markMessagesRead.ts:49-53` | `useMessages.ts:19-31` (página 100 + cursor), `realtime.service.ts:209-221`; índices `20260924225551_add_messages_perf_indexes.sql` (cobre `contact_id,is_read,sender`) | leitura em lote/retry: PD-91, PD-95 |
| `whisper_messages` | EQUIVALENTE (UX diferente) | `messageRepository.ts:55`, `messageService.ts:76` (sussurro entra na linha do tempo só no caminho legado) | `WhisperMode.tsx:297-362` (painel próprio), `useWhisperCount.ts:41`; índices `idx_whisper_messages_contact_id/sender/target`; fora da publicação realtime (`20260401002035`); políticas "own" | WH1, WH2 (paridade-v3) |
| `contacts` (status do WhatsApp) | EQUIVALENTE | `whatsappStatusRepository.ts:61` | `useWhatsAppStatus.ts` (hook), tabela existe | WS1 |
| `whatsapp_connections` | EQUIVALENTE | `whatsappStatusRepository.ts:69,78` | tabela existe (migration + types) | WS1 |
| `instance_registry` | MORTO_V3 | só no doc §3.1; sem `.from('instance_registry')` no código atual | tabela inexistente na V2 (0 migrations) | n/a |
| `profiles.last_seen` (UPDATE `user_id`) | DECISAO | `touchLastSeen.ts:29-32`; `useInboxHeartbeat.ts:41,126` escreve `online_status`+`last_seen` | `profiles` da V2 NÃO tem `last_seen`/`online_status` (types.ts: só `contact_identity_map.last_seen`; migration 20260829040000 confirma "profiles.last_seen_at não existe"); presença vai por `agent_presence` + `useAgentPresence.ts:30,117` | PD-91, PS1/PS2 (presença) |
| `message_reactions` (SELECT IN, UPSERT, DELETE) | MELHOR_NA_V2 | `useBatchReactions.ts:25-70`, `useReactionMutations.ts:82,168` | `ReactionsBatchProvider` (`hooks/reactions/useBatchReactions.ts:1-60`), transporte ANTES da gravação (`useReactionMutations.ts:45-60`), índices em `message_id/contact_id/user_id`, publicação re-adicionada (`20260413123216`) e `REPLICA IDENTITY FULL` (`20260826210200`) | RLS duplicada: PD-65; PD-90 |
| `voice_command_logs` (INSERT raw fetch) | EQUIVALENTE + LACUNA P1/P2 | `logVoiceCommand.ts:19-56` (timeout 15 s, `Content-Profile: zapp`) | `hooks/voice/logVoiceCommand.ts:15-47` (sem timeout); migration `20260407153654` com RLS "own" e índices; SEM expurgo/retention (grep em migrations/cron: só a criação) | NENHUM (PD-13 não cita a tabela) -> L2 |
| `team_messages` (infinite, INSERT, soft/hard delete) | MELHOR_NA_V2 (+1 lacuna) | `useTeamMessages.ts:24-62` (cursor `created_at\|id`, busca `ilike` no servidor), `useTeamChatMutations.ts:161` (DELETE real, o doc dizia soft-delete) | `get_team_messages_page`, `useTeamMessages.ts:45`, índice `(conversation_id, created_at DESC)`, publicação `20260826210200`; busca só no cliente (`useTeamChatPanel.ts:224-228`) | busca no servidor: NENHUM -> L1 |
| `team_conversations` | MELHOR_NA_V2 | `useTeamChatMutations.ts:99,266,289,360` (inserts diretos, sem atomicidade) | RPCs `create_team_group_conversation`, `find_or_create_direct_conversation`, `transfer_team_conversation_department` (types.ts:12358), `set_team_member_pref` (`useTeamChatMutations.ts:92-139`); TransferConversationDialog existe | TC-003 citado no código |
| `team_conversation_members` | MELHOR_NA_V2 | `useTeamChatMutations.ts:251-332` | RPCs acima; publicação em `20260927270011` | n/a |
| `team_message_reactions` | MELHOR_NA_V2 | `useTeamMessageReactions.ts:42-84` (upsert/delete + `safeClient`) | `useTeamMessageReactions.ts` + teste `toggle-rpc`; REVOKE em `team_message_reactions` | n/a |
| `evolution_contacts` | DECISAO | `useFallbackContact.ts:92`, `contactRef.ts:18` | sem tabela; V2 resolve só por `contacts.id` (UUID) + `contact_identity_map` | DECISAO |
| `audit_logs` (telemetria de reação) | DECISAO (não portar) | `useReactionMutations.ts:35` grava "Reaction Event: add/remove" a cada clique; teste `useReactionMutations.telemetry.test.tsx` | V2 não grava (`git grep audit_logs hooks/reactions` = 0); ruído de auditoria, e gravação client-side forjável | recomendação: não criar cartão |
| `realtime_message_fanout` (zapp) | DECISAO | `messageRepository.ts:107-137` | sem tabela; V2 assina `messages` direto (`useMessages.ts`, `useSupabaseRealtime`) | n/a |

## 2. §3.2 RPCs via `.rpc()` e §3.3 outras APIs

| Item | Classificação | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|
| `rpc_get_reactions_batch` | MORTO_V3 provável | chamada em `useBatchReactions.ts:25` com fallback `.in()`; NÃO está em `supabase/migrations` da V3 (grep vazio) | V2 não chama e não precisa: `.in()` em blocos de 100 + 1 consulta de nomes | n/a |
| `rpc_dlq_retry_now` | LACUNA (já carteada) | só na tela admin `features/admin/hooks/monitoring/useFailedMessages.ts:237` (não é do inbox) | `MessageSendHistorySheet.tsx:96-97` diz que DLQ operável "não existe no V2"; sem migration `rpc_dlq_*` | C1, R2, FL4, FQ1 (paridade-v3) |
| `rpc_get_contact` | DECISAO | `useFallbackContact.ts:103-110`, `useIncomingCallBroadcast.ts:73` (proxy do Evolution DB externo) | sem RPC; V2 sem banco externo | DECISAO |
| `RPC.listMessagesLite` (`rpc_list_messages_lite`) | DECISAO / MORTO_V3 (`listByContactJid` sem importador) | `messageRepository.ts:66-72`; usado por `useMessagesCursor` no caminho 'evo' | sem RPC; V2 pagina `messages` por cursor (`fetchMessagesBefore`) | n/a |
| Edge `elevenlabs-tts-stream` | MELHOR_NA_V2 | `playTtsAudio.ts:145` | `supabase/functions/elevenlabs-tts-stream/index.ts`: `requireAuth` + `enforceRateLimit` 30/min persistente + ledger `logAiUsageDetached` + log sem roteiro; na V3 o limite é em memória | n/a |
| Edge `voice-agent` | EQUIVALENTE | `processTranscript.ts:13` | `supabase/functions/voice-agent`, `hooks/voice/processTranscript.ts` (idêntico exceto comentário) | n/a |
| Edge `evolution-api/find-status-messages`, `send-chat-presence` | EQUIVALENTE | `whatsappStatusRepository.ts` | `evolution-api/index.ts` + `_shared/evolution-control-authz.ts` (+teste); hook `useWhatsAppStatus.ts` ÓRFÃO (sem componente consumidor: `git grep WhatsAppStatus` só acha o hook, o barrel e o teste) | WS1 (tela de stories) |
| Edge `evolution-api/get-media-base64` | EQUIVALENTE (parcial) | `useMediaUrl.ts` (refresh de URL expirada, cache LRU, anti-storm) | `useEvolutionApi.getMediaBase64` (`:46`); função `recover-message-media`; sem hook de auto-refresh | MR1, MR2, MT-01 (hooks06) |
| Evolution reactions mirror (`sendReaction`) | MELHOR_NA_V2 | `useReactionMutations.ts:110-125` engole falha de transporte | R2-INB-032: transporte antes, rejeição propaga (`useReactionMutations.ts:45-60`) | n/a |
| SIP.js UserAgent | MELHOR_NA_V2 | `useSipConnection.ts` (183 linhas, backoff `min(1000*2^n,30000)`, MAX 5) | `hooks/sip/useSipConnection.ts` (259 linhas, `MAX_BACKOFF_MS`, estado `reconnecting`/`unavailable`, teste próprio) | n/a |
| SIP vídeo (`makeCall({video:true})`, `VideoCallDialog`) | DECISAO | `useSipClient.ts:16-63`, `calls/VideoCallDialog.tsx` | `ContactActionButtons.tsx:132,170` atrás de feature flag `video_call` (default false); SipCallAdapter `video:false` | hooks06 achados_midia_testes:71,101 (DECISAO) |
| `window.speechSynthesis` fallback | EQUIVALENTE | `playTtsAudio.ts` | `hooks/voice/playTtsAudio.ts` (mesmo fluxo; `NotAllowedError`->`onAutoplayBlocked`; 295 linhas) | n/a |

## 3. §4 Exports públicos e §4.6 funções utilitárias

| Item | Classificação | Evidência V3 | Evidência V2 | Cartão / teste |
|---|---|---|---|---|
| Barrel raiz `features/inbox/index.ts` | DECISAO | 6 linhas | V2 organiza por `src/hooks/*` e `src/components/inbox` (sem barrel de feature) | n/a |
| `data-access/*` (messageRepository, whatsappStatusRepository) | DECISAO | camada repository | V2 usa `services/chat.service.ts`, `realtime.service.ts`, hooks diretos | n/a |
| `services/*` (messageService, touchLastSeen, whatsappStatusService) | DECISAO / EQUIVALENTE | ver §1 | `adapters/inboxAdapter.ts` (`mapMessageRowToMessage:23`, `isEdited` vem de `is_edited`, não da heurística `updated_at!=created_at` da V3) | adapters tem `__tests__` |
| `hooks/voice/index` (logVoiceCommand, playTtsAudio, processVoiceTranscript, retry, tipos) | EQUIVALENTE | `voice/index.ts` | `hooks/voice/index.ts` exporta os mesmos + `useVoiceAgent`; existe OUTRO `hooks/communication/useVoiceAgent.ts` (duplicado a confirmar) | n/a |
| Tipos `VoiceAgentAction/Phase`, `TtsPlayback`, `PlayTtsOptions`, `SipStatus`, `MessageReaction`, `TeamConversation/Member/Message`, `AggregatedReaction` | EQUIVALENTE | doc §4.5 | `voice/types.ts`, `playTtsAudio.ts:5-10`, `SipStatus` com valores diferentes (`idle/connecting/registered/reconnecting/unavailable`), `reactions/types.ts`, `team-chat/teamChatTypes.ts` | n/a |
| Tipo `ChatMessage` (`types/aiChatMessage.ts`, 12 linhas) | EQUIVALENTE | usado por ObjectionDetector/UniversityHelp | `useObjectionDetector.ts` com tipos próprios | n/a |
| `resolveContactRef` / `isUuidRef` / `isJidRef` / `contactRefToString` | DECISAO | `contactRef.ts` (UUID x JID, grupo, @lid, broadcast) | V2 não tem; só UUID (`useRealtimeInbox.ts:44-118` fallback por `contactId`); JID cru só em 3 pontos (`ChatPanel.tsx:305`, `useChatPanelHandlers.ts:283`, `useContactQuickActions.ts:73`) | JG1 (jid/lid) |
| `deriveContactJid` (`utils/contactJid.ts`, NOVO) | MORTO_V3 | só definido + teste; sem importador em produção | n/a | n/a |
| `simulateLatency/shouldSimulateFailure/get|set|clearSimulationConfig` | MORTO_V3 (debug) | único importador: `useChatPanelHandlers.ts:297` (import dinâmico, localStorage `debug_chat_*`) | não existe | NÃO portar |
| `isRetryableError` / `withRetry` / `friendlyErrorMessage` | EQUIVALENTE | `voice/retry.ts` | `hooks/voice/retry.ts` (cópia; usada por `hooks/communication/useVoiceAgent.ts:9`); SEM teste na V2 | teste: PD-95 (cita os 33 casos) |
| `mapMessage` | EQUIVALENTE | `messageService.ts:13-36` | `inboxAdapter.ts:23`, `mapRealtimeMessageToMessage:49` | n/a |
| `buildPhoneNeedles` | EQUIVALENTE | `whatsappStatusService.ts:19-39` | `useWhatsAppStatus.ts:74-96` (código idêntico) | sem teste dedicado nas duas; hook órfão -> WS1 |
| `splitTextIntoTtsChunks` | EQUIVALENTE | interna, 220 chars | `playTtsAudio.ts:59` (interna, `splitLongTtsSegment:19`) | só `playTtsAudio.interrupcao.test.ts`; chunking sem teste -> L4 |
| `touchLastSeen()` | DECISAO | `touchLastSeen.ts` (debounce 120 s módulo) | sem equivalente (sem coluna) | PD-91 |
| `persistMessagesRead` / `isTransientMarkReadError` (NOVO) | LACUNA (carteada) | `markMessagesRead.ts:16-62` (alta prioridade, lote, 4xx não repete) | `realtime.service.ts:209-221` 1 UPDATE, erro só no log (`useRealtimeMessages.ts:253-267`) | PD-91, PD-95 |

## 4. §5 Dependências externas (o que a V3 importa) x V2

| Dependência | Classificação | Nota |
|---|---|---|
| `@/integrations/supabase/client` | EQUIVALENTE | V2 idem (`SUPABASE_URL`, `SUPABASE_ANON_KEY` exportados) |
| `@/integrations/datasource/db` (dbFrom, dbChannel, dbList, dbRemoveChannel) | DECISAO | camada de datasource zapp x evo; V2 não tem (fonte única) |
| `@/integrations/datasource/rpcCatalog` (`RPC.listMessagesLite`) | DECISAO | idem |
| `@/integrations/supabase/rowNormalizers` (`normalizeMessage`: aliases `sender_id`, `external_message_id`) | DECISAO | V2 tem schema único, sem aliases legados |
| `@/integrations/supabase/safeClient` (team-chat) | DECISAO | V2 usa `supabase` + RPCs; sem `safeClient` nas hooks de equipe |
| `@/integrations/supabase/channelErrorLogging` (`logChannelError`) | LACUNA menor (coberto) | V2: ver PD-76 (ressincronizar canais) |
| `@/lib/sanitize` (`sanitizePostgrestFilter`) | EQUIVALENTE | V2 escapa `ilike` em `useTeamFiles.ts:30` (sem função homônima em `src/lib`) |
| `@/lib/abortError` (`isAbortLikeError`), `withSupabaseHighPrioritySignal` | EQUIVALENTE parcial | V2 não propaga `AbortSignal` na carga de mensagens (`useMessages.ts` usa geração `requestGenerationRef`) |
| `sip.js`, `@tanstack/react-query`, `sonner`, ElevenLabs via Edge | EQUIVALENTE | idem na V2 |
| `@/services/api/queryKeys` | EQUIVALENTE | V2: `hooks/team-chat/queryKeys.ts` + `queryKeys` global |
| `window.speechSynthesis`/`Audio`/`URL.createObjectURL` | EQUIVALENTE | `playTtsAudio.ts` V2 |

## 5. §6 Quem importa: código MORTO na V3 (não virar lacuna)

Conferido por `git grep` em `origin/main`:
- `messageRepository.listByContactJid`, `messageRepository.unsubscribe` (usado só por `useMessages`), `dbList`: sem consumidor útil (`listByContactJid` só no próprio arquivo).
- `utils/contactJid.ts#deriveContactJid`: só o teste usa.
- `utils/simulateChatLatency.ts`: DEBUG-ONLY (import dinâmico em `useChatPanelHandlers.ts:297`).
- `rpc_get_reactions_batch`: sem migration na V3, sempre cai no fallback `.in()`.
- `instance_registry`: citado no doc, sem uso no código.
- `useConversationReactionsRealtime`: USADO (`ChatMessagesArea.tsx`, `usePreloadConversationReactions.ts`); o doc estava certo em "não exportado do barrel".
- `usePreloadConversationReactions`/`ReactionsBatchProvider`: usados por `ChatMessagesArea.tsx`, `useMessageReactions.ts`.
- Importadores do doc §6 conferidos como VIVOS: `useMessages.ts`, `useWhatsAppStatus.ts`, `useRealtimeMessages.ts` (`touchLastSeen` `:934`), `realtime/useConversationActions.ts` (`:89`), `useSipClient.ts`, `useVoiceActionHandler.ts` (agora em `src/hooks/`, não em `features/inbox/hooks/`), `VoiceSearchOverlayConnected.tsx` (agora em `src/components/voice/`), `TeamPerformancePanel.tsx` (em `src/components/team-chat/`).
- Caminhos do doc §6 que MUDARAM: `components/team-chat/*` e `components/voice/*` vivem fora de `features/inbox/` na V3 atual.

## 6. §7 Implementação por arquivo (TODOS os arquivos citados) e arquivos fora do doc

### 6.1 Arquivos citados no §7

| Arquivo V3 | Classificação | Comportamento na V2 | Teste V2 equivalente |
|---|---|---|---|
| `index.ts`, `data-access/index.ts`, `services/index.ts`, `hooks/*/index.ts` | DECISAO | barrels por pasta (`hooks/voice/index.ts`, `reactions/index.ts`, `team-chat/index.ts`, `sip/index.ts`) | n/a |
| `types/aiChatMessage.ts` | EQUIVALENTE | tipos locais | n/a |
| `data-access/messageRepository.ts` | DECISAO | `chat.service.ts` + `useMessages.ts` | `hooks/chat/__tests__` |
| `data-access/whatsappStatusRepository.ts` | EQUIVALENTE | `useEvolutionApi`/`useWhatsAppStatus.ts` | `hooks/__tests__/useWhatsAppStatus.test.ts` |
| `services/messageService.ts` | EQUIVALENTE | `inboxAdapter.ts` | `adapters/__tests__` |
| `services/touchLastSeen.ts` (+ `__tests__/touchLastSeen.simulacao.test.ts`) | DECISAO | `agent_presence` | PD-91/PD-95 |
| `services/whatsappStatusService.ts` | EQUIVALENTE | idem hook | teste do hook |
| `utils/contactRef.ts` (+ `contactRef.test.ts` 303 l.) | DECISAO | só UUID | JG1 |
| `utils/simulateChatLatency.ts` (+ test) | MORTO_V3 | n/a | n/a |
| `hooks/voice/logVoiceCommand.ts` | EQUIVALENTE + LACUNA P2 (timeout) | cópia sem `AbortController` | NENHUM (L3) |
| `hooks/voice/playTtsAudio.ts` | EQUIVALENTE | `playTtsAudio.ts` | `playTtsAudio.interrupcao.test.ts` |
| `hooks/voice/processTranscript.ts` | EQUIVALENTE | idêntico | NENHUM (L4) |
| `hooks/voice/retry.ts` (+ `retry.test.ts` 229 l.) | EQUIVALENTE | cópia | NENHUM (PD-95) |
| `hooks/voice/types.ts` | EQUIVALENTE | `types.ts` | n/a |
| `hooks/sip/useSipConnection.ts` | MELHOR_NA_V2 | ver §2 | `sip/__tests__/useSipConnection.test.ts` |
| `hooks/reactions/{types,useBatchReactions,usePreloadConversationReactions,useReactionMutations}.ts` | MELHOR_NA_V2 | provider + `.in()` em blocos + semeadura sem sobrescrever | `useBatchReactions.uma-consulta.test.tsx`, `useReactionMutations.transport-rejection.test.tsx` |
| `hooks/reactions/useConversationReactionsRealtime.ts` | EQUIVALENTE | `ChatMessagesArea.tsx:331` via `RealtimeService.subscribeToReactions` (canal por conversa, ids em ref) | n/a |
| `hooks/team-chat/teamChatTypes.ts` | EQUIVALENTE | idem | n/a |
| `hooks/team-chat/useTeamChatMutations.ts` | MELHOR_NA_V2 | RPCs atômicas (TC-003) | `useTeamChatMutations.membership/mute.test` |
| `hooks/team-chat/useTeamConversations.ts` | EQUIVALENTE | 125 linhas | `useTeamConversations.test/inbox.test` |
| `hooks/team-chat/useTeamMessageReactions.ts` | MELHOR_NA_V2 | toggle por RPC | `.test` + `.toggle-rpc.test` |
| `hooks/team-chat/useTeamMessages.ts` | EQUIVALENTE + LACUNA (busca) | sem `searchQuery` no servidor | `useTeamMessages.test/read-state.test` |
| `hooks/__tests__/*` (19 citados) | ver tabela 6.3 | | |

### 6.2 Arquivos da V3 em `src/features/inbox/` que NÃO estão no §7 (de 565 arquivos; doc cobre 54)

Dentro das pastas do próprio doc 07 (novos desde agosto):
- `services/markMessagesRead.ts` + `markMessagesRead.test.ts` -> LACUNA carteada (PD-91, PD-95).
- `utils/contactJid.ts` + `utils/__tests__/contactJid.test.ts` -> MORTO_V3.
- `hooks/team-chat/useTeamPerformance.ts` + `useTeamPerformance.contract.test.ts` -> EQUIVALENTE (`hooks/team-chat/useTeamPerformance.ts` + `useTeamPerformance.test.ts` na V2).
- `hooks/reactions/__tests__/useReactionMutations.telemetry.test.tsx` -> DECISAO (não portar telemetria em `audit_logs`).
- `hooks/messageSendHistory.schemas.ts`, `hooks/useMessagesCursor.test.tsx`.

Testes de `hooks/__tests__/` fora do doc (39 na V3 contra 19 no doc = 20 novos): `conversationDataLoaders.abortSignal`, `fetchStickers.regression`, `inboxSourceMapper`, `inboxSourceSelection`, `reconciliationTelemetry.sourceFallback`, `selectedConversation`, `useChatAutoScroll`, `useDebouncedSaveSettings.saveloop`, `useInboxDeepLinks`, `useInboxHeartbeat.keepAlive`, `useInboxShortcuts`, `useInboxSource`, `useMessageQueue`, `useRealtimeInbox`, `useRealtimeMessages.orchestrator`, `useSipClient.video` (.ts e .tsx), `useTicketStatus`, `useTransferConversation`, `useVirtualRows`.
Em `hooks/realtime/` (13 testes + 28 módulos, doc 06): `audioPlaybackBus`, `avatarBatchStore`, `externalAudioSender`, `externalMessageSender`, `externalSenderTypes`, `messageSender(+Helpers)`, `parseEvolutionError`, `playerStateStore`, `realtimeContactsStatusStore`, `realtimeUtils`, `reconciliationTelemetry`, `sendStatusBus`, `useAutomationFailureAlerts`, `useContactAvatar`, `useConversationActions`, `useConversationSendState`, `useConversationsFilter`, `useFailedMessageAlerts`, `useMessageSendStatus`, `useMessageUpdateBatcher`, `useRealtimeContacts`, `useRealtimeFallbackRefetch`, `useRealtimeNotifications`, `useRealtimePresenceAndConnections`, `useRetryResolutionAlerts`. Estes pertencem ao doc 06 (já auditado por `paridade-hooks06/achados_*.md`, PD-61..95); `components/**` (373 arquivos) pertence aos docs 10-12 (PE-xx).

### 6.3 Testes do §7 (`hooks/__tests__`) e situação do comportamento na V2

| Teste V3 | Comportamento | Existe na V2? | Classificação | Cartão |
|---|---|---|---|---|
| archivedScenarios.simulacao, useArchiveConversationActions | arquivar/desarquivar soft | `useInboxFilters.arquivadas.test`, `useInboxBulkActions.test` | EQUIVALENTE | PD-71/72/84 |
| classifyFailure, useFailureReason | categorias de falha de envio | `components/inbox/chat/messageSendTimeline.ts`, `MessageSendHistorySheet` | parcial | FF2, LS1 |
| inboxE2E, inboxFilterPipeline, inboxLogic | filtros/contagem | `useInboxFilters*`, `chipCounts.test` | EQUIVALENTE | PB-xx |
| mediaRefreshCache, useMediaUrl | refresh de mídia expirada | só `recover-message-media` + `useResolvedStorageUrl` | LACUNA (carteada) | MR1, MR2, MT-01 |
| messageSendHistory.schemas | `deriveFinalStatus` | `messageSendTimeline.ts` | EQUIVALENTE | n/a |
| realtimeChannelLifecycle | canais com sufixo único | `realtimeTopic.ts`/`uniqueRealtimeTopic` | EQUIVALENTE; V2 `team-messages-${id}` fixo | PD-76 / PE-75 |
| useFallbackContact, selectedConversation, useInboxSource, inboxSource* | contato por JID/Evolution DB | só UUID | DECISAO | JG1 |
| useInboxBulkActions | lote | `useInboxBulkActions.ts` + teste | EQUIVALENTE | PD-84/85 |
| useInboxHeartbeat.* | presença | `useAgentPresence` | LACUNA carteada | PD-91 |
| useInboxStatusPref | rótulo de status | n/a | LACUNA carteada | SL3 |
| useMessageQueue(E2E), useSendThrottle | fila e throttle | `lib/offlineQueue.ts`, `lib/sendThrottle.ts` | EQUIVALENTE/carteada | PD-63, D0, PF1 |
| useMessageReactions, useRetryFailedMessage | reações / tentar agora | reações MELHOR; DLQ ausente | misto | C1, R2, FL4, FQ1 |
| useRealtimeInbox, useRealtimeMessages.orchestrator | orquestração | `hooks/chat/useRealtimeMessages.ts` | EQUIVALENTE | PD-73/76 |
| useInboxDeepLinks | `?contact=`/`?message=` + evento `open-contact-chat` | evento existe (`useSendProduct.ts:98`, `useContactsCRUD.ts:124`); sem leitura de `?contact=`/`?message=` | LACUNA (carteada) | DL1, E2E3 |
| useVirtualRows | lista virtual | `VirtualizedRealtimeList.tsx:166` | EQUIVALENTE | n/a |
| useChatAutoScroll | rolagem | `ChatMessagesArea.tsx:99` (`isNearBottom`) | EQUIVALENTE | C6, F4b |
| useInboxShortcuts | atalhos | `KeyboardShortcutsHelp.tsx` | carteada | PD-92 |
| useSipClient.video | vídeo SIP | flag `video_call` desligada | DECISAO | hooks06 |
| useTicketStatus, useTransferConversation | status de ticket / transferir | `TransferDialog.tsx` | EQUIVALENTE | n/a |
| useDebouncedSaveSettings.saveloop | laço de salvar | `useUserSettings` | NÃO VERIFICADO | n/a |
| fetchStickers.regression | stickers | `useStickerPicker.ts` | EQUIVALENTE | n/a |
| conversationDataLoaders.abortSignal | cancelar carga | geração em `useMessages.ts` (sem AbortSignal) | parcial (baixo risco) | n/a |

## 7. Resumo de contagem (linhas das tabelas §1-§4)

Linhas das tabelas §1 a §4 (54 itens, classificação principal da coluna): EQUIVALENTE 22, DECISAO 16, MELHOR_NA_V2 8, MORTO_V3 4, LACUNA 3 (rpc_dlq_retry_now e persistMessagesRead já carteadas; voice_command_logs/busca de equipe sem cartão), 1 linha "set" de cabeçalho. Os testes do §6.3 (25 linhas) e arquivos do §6.1 (23 linhas) não entram nesta soma.

## 8. LACUNAS REAIS sem cartão (priorizadas)

### P1

**L1. Chat de equipe: busca de mensagens no servidor (histórico inteiro)**
- V3: `useTeamMessages.ts:13,40-42` recebe `searchQuery` e aplica `ilike('content', %sanitize(q)%)` com paginação por cursor `created_at|id`; o painel passa `debouncedSearch` (`useTeamChatPanel.ts:41`).
- V2: `useTeamChatPanel.ts:224-228` só filtra `messages` já carregadas (`.includes`), e esconde "carregar anteriores" durante a busca (`TeamChatPanel.tsx:129`), então mensagens antigas nunca são achadas. Busca corpo de cartões (buscar_corpo e `cards_*.py`): nenhum cobre (TF2 é "Arquivos da Equipe").
- Implementar: busca no servidor na conversa (RPC `get_team_messages_page` com parâmetro de texto OU `ilike` escapado como em `useTeamFiles.ts:30`), cursor composto, mínimo 2 caracteres, estados vazio/erro, sem exportar nada.
- Perfil: hugo (hook) + workersql se for estender a RPC; iris para o estado vazio/carregando.
- Arquivos: `src/hooks/team-chat/useTeamMessages.ts`, `src/components/team-chat/useTeamChatPanel.ts`, `TeamChatPanel.tsx`, migration da RPC (se for o caso), testes.

**L2. LGPD: `voice_command_logs` guarda transcrição e resposta sem prazo de expurgo**
- V2: tabela criada em `20260407153654` com `transcript`, `response`, `data jsonb`; só há RLS "own" e índices; `git grep voice_command_logs` em migrations/cron/docs: nenhum job de retenção; `DB-INVENTORY.md:217` a lista como "ativo". A fala do atendente pode conter nome/telefone de cliente. PD-13 (retenção executável) não a cita.
- Implementar: incluir `voice_command_logs` no job de retenção do PD-13 (padrão 90 d, registrar a escolha) ou criar cron próprio `DELETE ... WHERE created_at < now() - interval '90 days'` em lote, auditoria só com contagem, `-- Rollback:`.
- Perfil: workersql. Arquivos: nova migration; pode ser anexada ao PD-13 em vez de cartão novo.

### P2

**L3. `logVoiceCommand` sem timeout**
- V3 `logVoiceCommand.ts:19-21,34,53-56`: `AbortController` de 15 s. V2 `hooks/voice/logVoiceCommand.ts:26-44`: `fetch` sem sinal (pode ficar pendurado indefinidamente; sem impacto de UI por ser fire-and-forget). Perfil: hugo. Arquivo: `src/hooks/voice/logVoiceCommand.ts` + teste.

**L4. Testes dos utilitários de voz**
- V2 só tem `playTtsAudio.interrupcao.test.ts` e `voiceActionPlan.test.ts`. Sem teste para `processTranscript` (fallback "Desculpe..." e timeout 15 s), `logVoiceCommand`, e o chunking `splitTextIntoTtsChunks` (220 caracteres, sentenças > vírgulas > palavras). `retry.ts` já está em PD-95. Perfil: workertestes. Arquivos: `src/hooks/voice/__tests__/processTranscript.test.ts`, `logVoiceCommand.test.ts`, `playTtsAudio.chunks.test.ts` (exportar `splitTextIntoTtsChunks` ou testar via `playTtsAudio`).

**L5. Duplicidade `useVoiceAgent` na V2 (a confirmar)**
- Existem `src/hooks/voice/useVoiceAgent.ts` (52 l., exportado no barrel) e `src/hooks/communication/useVoiceAgent.ts` (importa `../voice/retry`). Dois ganchos com o mesmo nome divergem facilmente. Perfil: hugo (consolidar após confirmar qual é usado). Prioridade baixa; não afirmei que seja bug.

### Não são lacunas (para o Claude não recriar)
- Telemetria de reação em `audit_logs` (V3 `useReactionMutations.ts:35`): não portar.
- `touchLastSeen`, `online_status`: V2 usa `agent_presence`; correções de presença/lote já no PD-91.
- SIP vídeo, JID/@lid, Evolution DB externo, `rpc_get_contact`, `rpc_list_messages_lite`, `simulateChatLatency`: DECISAO ou código morto.
- Hook `useWhatsAppStatus` da V2 está órfão: é o WS1 que dá a tela.

## 9. O que NÃO consegui verificar
- Banco real: se existem `rpc_get_reactions_batch`, `rpc_dlq_retry_now`, `fn_*retention` para `voice_command_logs`, se `team_message_reactions` está na publicação realtime hoje (README do time diz que sim; só vi `team_messages`/`team_conversation_members`/`team_message_receipts` nas migrations), políticas finais de `whisper_messages` e `team_*`.
- Runtime: se `useTeamMessages.ts` da V2 tem busca escondida em RPC `get_team_messages_page` (li só o hook, não o corpo da RPC).
- `useDebouncedSaveSettings.saveloop` (subject exato) e `useTicketStatus` na V2: não achei equivalente por nome; não li as telas de configurações.
- Qual dos dois `useVoiceAgent` da V2 está em uso (L5).
- Se o Realtime entrega `message_reactions` de TODAS as conversas a cada cliente (filtro por RLS): comportamento igual ao da V3, não comparado em runtime.
