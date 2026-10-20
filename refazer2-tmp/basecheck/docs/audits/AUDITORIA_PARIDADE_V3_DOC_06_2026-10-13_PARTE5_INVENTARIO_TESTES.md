# Paridade doc 06 (2a passada) - Recorte 5: inventario, testes, achados A1..A10, flags e ADR

Data: 13/10/2026. SOMENTE LEITURA. V3 = `origin/main` de ~/projetos/Zapp_Web_V3; V2 = `.integrador` de ~/hermes-workspaces/Zapp_Web_V2.
Contexto estrutural importante: a V2 NAO tem `src/features/inbox/hooks/`. Os hooks da inbox vivem em `src/hooks/{inbox,chat,realtime,reactions,team-chat,voice,communication}` e a V2 le mensagens de UMA fonte so (`messages` via `useMessages`/`ChatService`), sem o caminho `evolution_messages`/`rpc_list_messages_lite` (`USE_EXTERNAL_DB = false` fixo em `src/hooks/inbox/useRealtimeInbox.ts:20`). Por isso muitos arquivos V3 nao tem par por design.

## (a) Arquivos de `hooks/` na V3 que NAO estao no doc 06

`git ls-tree -r` da pasta: 174 arquivos. O doc lista ~99 hooks/modulos (+7 testes de `realtime/__tests__`). Fora do doc: 25 arquivos de codigo e ~49 arquivos de teste.

### Codigo fora do doc (o que faz | par na V2 | cartao)
| Arquivo V3 | O que faz | Par na V2 | Cartao |
|---|---|---|---|
| `inboxSourceConfig.ts` (85 ln) | E36: modo `evo`/`zapp`/`auto` (`VITE_INBOX_SOURCE_MODE`), `selectInboxSourcePaths`, `INBOX_SOURCE_PAGE_SIZE=50`, contador `source_fallback` | NENHUM (fonte unica) | DECISAO, sem ADR (ver e) |
| `useDebouncedSaveSettings.ts` | Debounce de save com ref para `saveFn`; flush no unmount real (BUG-A: cleanup disparava save a cada tick de slider) | Nenhum hook igual. Nao verifiquei `SettingsView`/`MessagesSettings` (usam `saveSettings`) | NENHUM (P2, ver lista) |
| `useMentionableProfiles.ts` | React Query 5 min, limit 50, erro propagado, retry 2, de `profiles` | `components/inbox/chat/MentionAutocomplete.tsx` (PO1 corrigiu "mencoes com cache e erro tratado"); `get_team_profiles` (PD-86) | PO1, PD-86 |
| `useResolvedTicketsHydration.ts` | Hidrata `ticketStore` (overlay "Resolvidos") com `conversation_closures.contact_id`, para a aba nao ficar vazia em outro dispositivo | MELHOR_NA_V2: `contacts.conversation_status` + RPC `set_conversation_status`/`close_conversation_atomic` (ADR-005); nao ha `ticketStore` em localStorage | - |
| `useVirtualRows.ts` | `useVirtualizer` comum (overscan 10, scrollMargin) para inbox e team-chat | `VirtualizedRealtimeList.tsx` + `MultiplixView` (lista virtualizada propria) | EQUIVALENTE (PD-74/75 cobrem paginacao) |
| `sip/index.ts`, `sip/useSipConnection.ts` | Conexao SIP.js: registro, reconexao com back-off (max 5), mountedRef | `hooks/communication/useSipClient.ts` + `lib/calls/` (tabLeaderStore, sipProvisioning); teste `useSipClient.test.ts` | PD-95 (testes), recorte 2 desta rodada |
| `reactions/{index,types,useBatchReactions,useConversationReactionsRealtime,usePreloadConversationReactions,useReactionMutations}.ts` | Um unico canal realtime de reacoes por conversa; batch (RPC `rpc_get_reactions_batch` + fallback `.in` em blocos de 100); provider que elimina N+1; mutacoes otimistas + trilha em `audit_logs` | V2 tem `hooks/reactions/{useBatchReactions,useReactionMutations,types,index}` (batch em blocos + 1 `.in` de profiles, teste `useBatchReactions.uma-consulta`) e `hooks/chat/useMessageReactions.ts`. NAO tem RPC `rpc_get_reactions_batch` nem um canal unico por conversa (reacoes chegam por `services/realtime.service.ts`) | PD-65/89/90 (RLS, upsert, soma); recorte 3 desta rodada |
| `team-chat/{index,teamChatTypes,useTeamChatMutations,useTeamConversations,useTeamMessageReactions,useTeamMessages,useTeamPerformance}.ts` | Hooks do chat de equipe | V2 `hooks/team-chat/*` (mais completo: presence, typing, files, stats, members, departments) | MELHOR_NA_V2 |
| `useTeamPerformance.contract.test.ts` | Contrato do hook de desempenho | `hooks/team-chat/__tests__/useTeamPerformance.test.ts` | EQUIVALENTE |
| `voice/{index,logVoiceCommand,playTtsAudio,processTranscript,retry,types}.ts` | Pipeline do copiloto de voz (retry, TTS, log) | V2 `hooks/voice/*` (tem tambem `voiceActionPlan.ts`, `useVoiceAgent`, testes de interrupcao) | `retry.ts` sem teste: PD-95 |

### Testes: 49 arquivos fora do doc (vide secao b)

### Arquivos do doc que NAO existem mais na V3 (sinal de doc defasado)
O doc cita `useInboxFilters`, etc. pelo nome sem caminho; os 277 "nomes" extraidos incluem tabelas e libs, entao nao ha arquivo do doc faltando. Itens relevantes que o doc trata como "NAO hooks" (A1) continuam existindo na V3 com prefixo `use`.

## (b) Testes da V3 em `hooks/__tests__` e subpastas x V2

Legenda: TEM = V2 testa o comportamento; SEM-CODIGO = a V2 nao tem o modulo (nao cobrar teste); LACUNA = V2 tem o comportamento mas nao o teste.

### Comportamentos protegidos na V3 que a V2 tem e NAO testa (LACUNAS reais de teste)
Cartao existente: PD-95 (workertestes) ja pede `retry.ts`, `realtimeUtils`, `markMessagesAsRead`, `useAgentPresence`, video SIP, retomada de audio, RLS, batcher, `useBatchReactions` (este ultimo ja tem teste na V2). O que PD-95 NAO nomeia e vale entrar (cartao irmao ou adendo):

| # | Teste V3 | Comportamento real | Onde a V2 deveria testar | PD-95 cobre? |
|---|---|---|---|---|
| 1 | `realtime/__tests__/realtimeUtils.dedupe.test.ts` (92 ln) + `realtimeUtils.utils.test.ts` (469 ln) | `normalizeMessage`, `sortMessagesByCreatedAt`, `dedupeContacts`, `chunkArray`, `getUniqueMessageContactIds`, `buildConversation(s)` | `src/hooks/realtime/__tests__/realtimeUtils.test.ts` (V2 so testa `classifyMessageType`; `grep` em testes: `sortMessagesByCreatedAt`, `dedupeContacts`, `chunkArray`, `getUniqueMessageContactIds` = ZERO) | sim (citado) |
| 2 | `voice/__tests__/retry.test.ts` | `isRetryableError`, `withRetry` (backoff), `friendlyErrorMessage` (V2: so `lib/__tests__/retry.random.test.ts`, que e outro modulo; `friendlyErrorMessage`/`isRetryableError` ZERO testes) | `src/hooks/voice/__tests__/retry.test.ts` | sim |
| 3 | `realtime/__tests__/useConversationActions.markReadFlush.test.ts` | `markAsRead` em lote com flush | V2 faz `markAsRead` imediato (`useRealtimeMessages.ts:253-267`); so `useRealtimeMessages.reconexao.test.tsx` toca `markMessagesAsRead`. Falta teste: (i) pula quando `unreadCount===0`, (ii) falha da RPC nao zera o contador local, (iii) erro engolido so em `log.error` | sim (citado) |
| 4 | `__tests__/useInboxBulkActions.test.ts` (regressoes `bulkMarkAsRead`/`bulkTransfer`: zero linhas afetadas -> `toast.error`; sucesso parcial -> `toast.warning`; filtra ids nao-UUID) | V2 testa o hook mas o codigo nao tem `.select()` nem checa linhas afetadas | `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` (cobrir 0 linhas/parcial junto ao codigo) | PD-84 (codigo) |
| 5 | `__tests__/archivedScenarios.simulacao.test.ts` (cenarios A..H: arquivar, desarquivar, mensagem nova em arquivada nao infla contadores, bulk archive + undo nunca toca `assigned_to`, ids nao-UUID ignorados) | V2 tem `useInboxFilters.arquivadas.test.tsx` (filtro) e `chipCounts.test.ts`, mas NAO tem os cenarios C (mensagem nova em arquivada), F/G (arquivar nao mexe em `assigned_to`) e H (UUID). Pior: o proprio codigo V2 arquiva zerando `assigned_to` (ver C3-NOVO abaixo) | `src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx` + `useInboxBulkActions.test.ts` | NAO (PH-01 corrige o codigo; teste de cenarios mensagem-nova/contadores nao nomeado) |
| 6 | `__tests__/inboxFilterPipeline.test.ts` ("aguardando" sem responsavel; gate de permissao de canal hidratado; `archivedTab` ignora demais filtros; ordenacao por `lastMessage`) | `useInboxFilters.fsm-padrao/janela-global/arquivadas/dia-local/snooze-consumo` cobrem parte. Falta: permissao de canal ainda desidratada nao derruba conversas (so se V2 tem gate equivalente: nao encontrei `channelPermissions` no hook) | `src/hooks/inbox/__tests__/useInboxFilters.*.test.tsx` | NAO |
| 7 | `__tests__/useRetryFailedMessage.test.tsx` (rate limit 30 s, 42501) | V2 nao tem hook de retry com RPC; ha `MessageBubble.tentativas.test` (UI). Depende dos cartoes FQ1/PD-77/78 | junto ao cartao que criar o retry | FQ1, PD-77 |
| 8 | `__tests__/useMessageQueue.test.tsx` + `.E2E.spec.tsx` (concorrencia 5, dedupe por `idempotencyKey`, 3 tentativas com backoff, DLQ, nada apos unmount) | V2 tem `outbound-message.service.test.ts`, `lib/__tests__/crossTabSendDedupe.test.ts`, `sendThrottle.test.ts`. Falta: limite de envios em voo e "nada de nova tentativa apos unmount" | `src/services/__tests__/outbound-message.service.test.ts` | PD-63/77/82 (codigo) |
| 9 | `__tests__/useDebouncedSaveSettings.saveloop.test.ts` | Slider nao dispara save a cada tick; save so no unmount real | Onde a tela de configuracoes usa debounce+save (nao localizado) | NAO |
| 10 | `__tests__/mediaRefreshCache.test.ts`, `useMediaUrl.test.ts` | URL de midia vencida e renovada, cache com TTL | V2: `normalizeMediaUrl` (sem teste dedicado achado); PO1 corrigiu "audio com URL vencida se recupera" | PO1 (codigo) |
| 11 | `__tests__/useChatAutoScroll.test.ts`, `useVirtualRows.test.tsx` | Rolagem automatica so quando o usuario esta no fim; scrollMargin | V2 tem `ChatPopup.rolagem-mensagem-nova.test.tsx` e `VirtualizedRealtimeList.test.tsx` | EQUIVALENTE |
| 12 | `__tests__/useInboxShortcuts.test.ts` | Atalhos so disparam fora de campo de texto | V2: `useChatKeyboardNavigation.test.ts`; atalhos sem tratador = PD-92 | PD-92 |
| 13 | `__tests__/useInboxDeepLinks.test.ts` | `?contact=`/`?message=`/`?msg=` + guarda consumir-uma-vez (E40.5) | V2 nao tem deep link por URL na inbox (ver C-novo) | NAO |
| 14 | `realtime/__tests__/messageSender.test.ts`, `external*Sender*.test.ts`, `parseEvolutionError.test.ts` | Envio externo, humanizacao de erro Evolution | V2: `messageSender.reply.test.ts` e `outbound-message.service.test.ts`; humanizacao de erro Evolution esta em `useEvolutionApiCore.ts` sem teste dedicado | PD-94/PD-62 (parcial) |

### Testes V3 sem modulo na V2 (SEM-CODIGO, nao cobrar)
`classifyFailure`, `useFailureReason` (FF1 trata filtros de falha), `conversationDataLoaders.abortSignal`, `fetchStickers.regression` (V2: `useStickerPicker.*` quatro testes), `inboxE2E`, `inboxSourceMapper`, `inboxSourceSelection`, `useInboxSource`, `reconciliationTelemetry*` (3), `realtimeChannelLifecycle` (V2 tem `realtimeSharedTopic.test.tsx` e `realtimeStrictMode.test.tsx`: EQUIVALENTE/MELHOR), `selectedConversation`, `useArchiveConversationActions`, `useFallbackContact`, `useInboxHeartbeat.*` (PD-91), `useInboxStatusPref` (SL3), `useMessageReactions` (V2 tem), `useRealtimeInbox`/`useRealtimeMessages.orchestrator` (V2 tem `useRealtimeInbox.*` 4 testes e `useRealtimeMessages.test/reconexao`), `useSendThrottle` (V2 `sendThrottle.test.ts`), `useSipClient.video` x2 (PD-95), `useTicketStatus`, `useTransferConversation` (V2 usa RPC atomica `transfer_conversation`, testada em `useConversationActions.test.ts`: MELHOR_NA_V2), `audioPlaybackBus`/`playerStateStore`/`sendStatusBus` (V2: `useExclusiveAudio.test.tsx`, `mediaVolumeStore.test.ts`), `useRetryResolutionAlerts`, `useMessagesCursor.test`, `messageSendHistory.schemas`, `useReactionMutations.telemetry`.

## (c) Achados A1..A10 do rodape do doc 06 contra a V2

| Achado | V2 tem o mesmo defeito? | Evidencia V2 | Cartao |
|---|---|---|---|
| A1 "use*" que nao e hook | Parcial/menor. `useWhisperMessagesMutation` na V2 e hook de verdade (`useCallback/useState`). Arquivos `use*` sem nenhuma chamada de hook: `hooks/integrations/useCatalogContactPreset.ts` (exporta so `fetchCatalogContactPreset`), `useCatalogContactSearch.ts` (utilitarios), `hooks/chat/useForwardMedia.ts` (tipos+funcoes) e reexports em `useMyTasks.ts`, `usePerformance.ts`, `useTeamChat.ts` (esses tres sao barris, aceitavel) | P2: renomear 3 arquivos | NENHUM (P2, baixo valor) |
| A2 dual-path zapp x evo | NAO se aplica: V2 e fonte unica (`messages`), com o caminho externo desligado (`useRealtimeInbox.ts:20`, `useExternalEvolution.ts:7`) | DECISAO nao registrada em ADR | ver (e) |
| A3 orquestradores sem teste | Nao: V2 tem `useRealtimeInbox.{offline-cache,reply,selectedMessagesError,sendAudio}`, `useRealtimeMessages.test` + `.reconexao`, `useMessages.{paginacao,overlay,reconexao,media}`, `useSupabaseRealtime.{test,reconexao}` | MELHOR_NA_V2 | - |
| A4 `getRealtimeDiscardedCount` deprecado | Nao existe na V2 (`grep` ZERO) | - | - |
| A5 `_clear`/`_reset` de teste em producao | Pouco: so `__resetFilesViewSession` exportado em `hooks/chat/useFilesViewState.ts:177` (ressalva: `lib/` tem `__reset*` em mapbox/web-vitals/errorReporter, fora do escopo da inbox). Nao existem `playerStateStore`/`audioPlaybackBus`/`sendStatusBus` na V2 | P2 | NENHUM |
| A6 cast inseguro do `rpc().abortSignal` | Nao: V2 nao usa `rpc_list_messages_lite`; `useVisiblePolling` passa `AbortSignal` ao `task` (MELHOR_NA_V2) | - | - |
| A7 `useSipClient` sem testes / `calls` orfaos | V2 tem `useSipClient.test.ts`, `tabLeaderStore.test.ts`, `CallSessionProvider.test.tsx`. Registros orfaos em `calls` nao verificados (banco) | testar via banco | PD-95 (video SIP) |
| A8 Set de dedupe podado (soft cap 500) em `useRetryResolutionAlerts` | NAO se aplica: a V2 nao tem alerta de resolucao de retry nem `failed_messages`/`automation_executions` (ZERO ocorrencias em src/migrations). O equivalente de dedupe de envio e `lib/crossTabSendDedupe.ts` (BroadcastChannel, com teste) | FQ1 (failed_messages) | FQ1 |
| A9 `markAsRead` debounced perdido no unmount | NAO: V2 faz `markAsRead` imediato (`hooks/chat/useRealtimeMessages.ts:253-267`), sem timer. Defeito diferente: erro so em `log.error` (usuario nao ve), sem repetir; `bulkMarkAsRead` (`useInboxBulkActions.ts:50-68`) mostra "N marcada(s)" mesmo com 0 linhas (RLS) | PD-84 (so transferencia em lote) | PD-84 cobre transferir; marcar-como-lida em lote com 0 linhas NAO nomeado (adendo) |
| A10 `saved_filters` sem paginacao | SIM, pior: `hooks/chat/useSavedFilters.ts:46-56` faz `select('*')` de proprios + compartilhados de todos (`is_shared`) sem `limit` e sem teto por usuario no salvar; alem disso o hook NAO e usado por nenhuma tela da inbox (so reexportado em `hooks/chat/index.ts`), ou seja, a V2 nao tem presets de filtros da inbox | lacuna C2-NOVO | NENHUM (`buscar_corpo "preset"` = NENHUM) |

## (d) Barris, variaveis VITE_ e flags

| Item V3 | Funcao | Equivalente V2 |
|---|---|---|
| `VITE_INBOX_SOURCE_MODE` (`evo`/`zapp`/`auto`, default `auto`; 11 ocorrencias) | Escolhe fonte de mensagens com fallback telemetrado | NENHUM. Constante fixa `USE_EXTERNAL_DB=false` no codigo. Decisao correta para a V2, mas sem ADR |
| `VITE_REALTIME_FALLBACK_REFETCH_MS` (`useRealtimeFallbackRefetch`, default 5 min, clamp 30 s..60 min) e `VITE_REALTIME_FALLBACK_INTERVAL_MS` | Refetch periodico se o canal realtime morrer | `hooks/realtime/useVisiblePolling.ts` (so com aba visivel e online, uma requisicao por vez, abortavel; intervalo = argumento, 30 s) + ressincronizacao na reconexao (`useSupabaseRealtime.reconexao`). MELHOR_NA_V2; nao configuravel por env (aceitavel) |
| `VITE_POLL_INTERVAL` (`evolutionFetchers.ts`, min 3000) | Intervalo de polling Evolution | Nao existe; V2 nao faz polling Evolution |
| `VITE_EXTERNAL_*`, `VITE_DEV_/STAGING_EXTERNAL_*` | Banco externo Evolution | `VITE_ZAPP_LOCAL_SUPABASE_*` (banco local) e `.env.example`; sem equivalente externo |
| Barril `index.ts` (45 exports `export *`) | API publica da pasta | V2: `hooks/inbox/index.ts` (11 exports, inclui `useBulkActions` e `useInboxBulkActions` ao mesmo tempo: dois hooks de lote com semanticas diferentes de "arquivar") , `hooks/chat/index.ts`, `hooks/realtime/index.ts`, `hooks/reactions/index.ts` |
| Flags em `localStorage` / chaves | `inbox_filters_v1` (aba, sub-aba, busca, tipo de contato, fila, falha) | V2 so persiste a aba de conversa (`CONVERSATION_TAB_STORAGE_KEY` em `useInboxUIState.ts:27`) e le `?type=` (`useInboxFilters.ts:45-53`) |

## (e) Docs/ADR da V3 sobre a inbox que a V2 deveria ter

| Doc V3 | Conteudo | V2 |
|---|---|---|
| `docs/adr/dual-path-inbox.md` (E36, 18/08) | Selecao de fonte por configuracao, fallback telemetrado, sem migracao de dados, rollback | V2 NAO tem. Recomendacao: ADR curto "Fonte unica de mensagens da inbox" registrando: leitura so de `messages`; `USE_EXTERNAL_DB=false`; `useExternalEvolution` mantido desligado; criterio para religar. `docs/adr/` da V2 vai ate ADR-008 e `docs/decisions/` ate ADR-006 (duas pastas, numeracao duplicada ADR-003/007: organizar) |
| `docs/REALTIME-CHANNELS-INVENTORY.md` (34 canais, status na publication, arquivo) | Inventario de canais realtime | V2 NAO tem (ls docs/architecture: so `edge-functions.md`, `mcp-e-grafo...`). Ha `lib/realtimeTopic.ts` e testes de topico compartilhado, mas nenhuma tabela canal x publication x arquivo |
| `docs/audits/REALTIME_CHANNELS_AUDIT.md`, `docs/audits/realtime-simulation.md` | Auditoria/simulacao de canais | V2 NAO tem equivalente (PD-68/69/70 tratam `realtime.messages` e canais privados) |
| `docs/architecture/JORNADA_MENSAGEM_WHATSAPP.md` | Fluxo ponta a ponta da mensagem | V2 NAO tem um documento equivalente (existe `ADR-004-evolution-api-webhook-bridge.md`) |
| `docs/audit-2026-08-16/fases/fase-04-inbox-nucleo-hooks-servicos.md` | Auditoria de fase do nucleo da inbox | Historico, nao cobrar |

## C-novos: lacunas e riscos que a 1a passada (PD-61..95, PH-00..15) NAO viu

### C1-NOVO (P1) Tres semanticas de "arquivar" na V2 e o cartao PH-01 parte de premissa errada
- V2 `hooks/chat/useConversationActions.ts:248-260` (`archiveContact`, usado por `ConversationListSidebar.tsx:68`, `RealtimeInboxView.tsx:371`, `ContactDetails.tsx:74`) faz `contacts.update({ assigned_to: null })`; comentario em `ContactDetails.tsx:67-69` e `useContactQuickActions.ts:31-33`: "semantica unica: zera assigned_to ... decisao do dono em 06/10, cartao #241".
- `useInboxBulkActions.ts:97-132` (`bulkArchive`) idem.
- `useBulkActions.ts:134-139` e `components/inbox/chat/useChatPanelHandlers.ts:534` e `CloseConversationDialog.tsx:141` (RPC `set_conversation_status`) gravam `conversation_status='archived'`, que e o que `useInboxFilters.ts:106-113` (`isArchived`) e `StatusChips.tsx:37-49` leem.
- Resultado: conversa "arquivada" pela lista/lote/detalhes nao aparece na aba Arquivadas (so perde o responsavel e vira "aguardando"); so o fluxo pelo cabecalho/dialogo arquiva de verdade.
- PH-01 (`paridade-07/PH-01.md`) diz que o unitario "ja arquiva certo" e manda mudar so o lote; isso e FALSO para `archiveContact` e contradiz a decisao do dono de 06/10 (#241). Antes de executar PH-01, o Claude precisa decidir com o dono qual e a semantica unica. Perfil: hugo; arquivos: `useConversationActions.ts`, `useInboxBulkActions.ts`, testes `useConversationActions.test.ts`, `useInboxBulkActions.test.ts`, `useInboxFilters.arquivadas.test.tsx`. Cartoes: PH-01, RS1 ("separar Resolver, Encerrar e Arquivar no menu do cabecalho"), PD-71/72.

### C2-NOVO (P2) Presets de filtros da inbox e persistencia dos filtros
- V3: `inboxFilterPresets.ts` (`MAX_INBOX_PRESETS=20`, nome <=40, busca <=200, validacao zod), `inboxPresetsSync.ts` (`saved_filters` `entity_type='inbox_filters'` + cache 2 min + localStorage), `inboxFilterPersistence.ts` (`inbox_filters_v1`: URL primaria, localStorage fallback).
- V2: nenhuma tela usa `useSavedFilters`; filtros (`chipTab`, `mainTab`, `subTab`, `search`, `selectedQueueId`) sao `useState` e somem ao recarregar (`useInboxFilters.ts:31-74`). Se for implementar, trazer junto o teto por usuario e `limit` (A10).
- `buscar_corpo "preset"` e `"inboxFilterPersistence"`: NENHUM. Perfil: hugo (hook) + iris (menu de presets); workersql para checar RLS/teto de `saved_filters`. Sem exportar nada: so salva o filtro do proprio usuario.

### C3-NOVO (P2) Deep link da inbox por URL
- V3 `useInboxDeepLinks.ts`: `?contact=`, `?message=`/`?msg=` com guarda "consumir uma vez" (E40.5) + evento `open-contact-chat` + global legado.
- V2: so evento `open-contact-chat`/`window.__pendingOpenContactId` (`useContactsCRUD.ts:116-124`, `useSendProduct.ts:83-99`); sem `?contact=` nem `?message=`. Notificacoes/e-mails/links internos nao conseguem abrir conversa nem destacar mensagem por URL. `buscar_corpo "deep"` so retorna cartoes sem relacao com a inbox. Perfil: hugo; arquivos: `src/hooks/inbox/useRealtimeInbox.ts`, novo `useInboxDeepLinks.ts`, teste.

### C4-NOVO (P1/P2) `bulkMarkAsRead` e `bulkTransfer` com falso sucesso
- `useInboxBulkActions.ts:50-68` (marcar como lida): `UPDATE ... in('contact_id')` sem `.select()`; com RLS devolvendo 0 linhas mostra "N conversa(s) marcada(s)". PD-84 cobre so `bulkTransfer`; o adendo e incluir `bulkMarkAsRead` e o teste "zero linhas".
- Tambem: `messages.is_read=true` em lote e feito direto (sem RPC) e sem filtro de UUID (V3 filtra ids nao-UUID: `useInboxBulkActions.test.ts`). Perfil: hugo.

### C5-NOVO (P2) Cache compartilhado de mensagens por contato (N+1 de painel)
- V3 `useConversationMessagesData.ts`: `ConversationHistory`, `useContactDetailStats` e `NextBestActionEngine` leem o mesmo cache `['conversation-messages', contactId]` (cap 1000 mais recentes, staleTime 30 s).
- V2: `useMessages` guarda em `useState` (nao React Query), enquanto `useMessageStatus.ts:26`, `useConversationHistoryTimeline.ts:342`, `useContactMediaCounts.ts:49`, `useNextBestAction` fazem consultas proprias a `messages` para a mesma conversa. Medir antes (nao rodei). Perfil: hugo. Melhoria, nao paridade.

### C6-NOVO (P2) `markAsRead` engole erro
- `useRealtimeMessages.ts:263-267`: falha da RPC so vai para `log.error`; o contador de nao lidas continua certo na UI no proximo fetch, mas o usuario nao sabe e nada repete. Sugerir `toast` discreto/retry unico + teste (PD-95 pede o teste, nao o tratamento).

### C7-NOVO (P2) Documentacao
- ADR "fonte unica de mensagens da inbox" e inventario de canais realtime (ver secao e). Perfil: worker. Arquivos: `docs/adr/ADR-009-...md` (ou `docs/decisions/`), `docs/architecture/realtime-channels.md`.

### C8-NOVO (P2) Teste de `useDebouncedSaveSettings`-equivalente
- Confirmar nas telas `MessagesSettings.tsx`/`SettingsView.tsx`/`ScheduleSettings.tsx` se ha save com debounce com o defeito BUG-A (cleanup de effect com dependencia da funcao de salvar dispara save a cada render). Nao verifiquei a implementacao nessas telas. Perfil: workertestes para o teste, hugo para a correcao se confirmado.

## Resumo de contagens
- Arquivos V3 em `hooks/`: 174 (25 de codigo e ~49 de teste fora do doc 06).
- Achados A1..A10: 1 ocorre parcial na V2 (A1, A5 menor), 1 ocorre e e pior (A10), 6 nao se aplicam/V2 melhor (A2,A3,A4,A6,A8,A9 com defeito diferente), 1 depende do banco (A7).
- Lacunas novas sem cartao: C1 (P1, e conflito com PH-01), C2, C3, C5, C6, C7, C8 (P2), C4 (adendo ao PD-84, P1/P2).
- Lacunas de teste sem cartao: 5, 6, 9, 13 (e partes de 3, 4, 8); as demais ja estao em PD-95.

## O que NAO consegui verificar
- Banco real: contagem/estado de `saved_filters` por usuario, existencia da RPC `rpc_get_reactions_batch`, `conversation_closures`, e se a V2 ja usa `calls` orfaos (A7).
- Runtime: se o botao "Arquivar" da lista realmente nao move a conversa para a aba Arquivadas (leitura de codigo apenas; confirmar no preview localhost:5500).
- Cartoes `done` ainda nao integrados na branch do dia: a copia `.integrador` pode estar atras. Checar cartoes irmaos de PH-01, PD-84, PD-95 antes de abrir qualquer um dos C-novos.
- Implementacao de debounce de save nas telas de configuracao (C8).
- Nenhum teste, tsc ou build foi executado.
