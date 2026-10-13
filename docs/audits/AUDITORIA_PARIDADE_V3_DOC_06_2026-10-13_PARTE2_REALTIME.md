# Achados: recorte 2 (REALTIME E LEITURA), doc 06, passada de 13/10/2026

Somente leitura. V3 = `origin/main` de `~/projetos/Zapp_Web_V3`, prefixo `src/features/inbox/hooks/` (abreviado `V3:`). V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador` (abreviado `V2:`; copia de 12/10, sem cartoes `done` ainda nao integrados). Li inteiros: `useRealtimeMessages` (1134 linhas), `useRealtimeInbox` (564), `useMessagesCursor`, `useMessages`, `useConversationMessagesData`, `useInboxSource` + ADR `docs/adr/dual-path-inbox.md`, `useInboxHeartbeat`, `useChatAutoScroll` e, em `realtime/`: `useRealtimeContacts`, `useRealtimeFallbackRefetch`, `useRealtimePresenceAndConnections`, `useRealtimeNotifications`, `useMessageUpdateBatcher`, `useFailedMessageAlerts`, `useAutomationFailureAlerts`, `useRetryResolutionAlerts`, `avatarBatchStore`, `useContactAvatar`, `playerStateStore`, `audioPlaybackBus`, `reconciliationTelemetry` (cabecalho), `realtimeUtils`, `realtimeContactsStatusStore`, mais a lista de testes (titulos) de `__tests__`.

**Ja existe uma passada anterior deste mesmo recorte:** `~/arquitetura-v2/paridade-hooks06/achados_realtime.md` (cartoes PH-41..PH-53 e PD-73..76/91). Esta passada confirma o que ela achou, corrige dois pontos e acrescenta o que ela nao viu. Cartoes conferidos pelo banco do quadro Hermes (copia de leitura), em `ids.json` de `paridade-hooks06`, `paridade-07`, `paridade-docs`, `paridade-resto` e `paridade-v3`.

Resumo: lacunas novas sem cartao: P0 = 0, P1 = 2, P2 = 7. Duas correcoes ao relatorio anterior (secao 4). Nenhum dos achados A1..A10 do doc e lacuna real na V2 (secao 3).

---

## 1. Tabela de comparacao

Legenda: EQUIVALENTE, MELHOR_NA_V2, LACUNA, DECISAO. "Cartao" = ja coberto. `PH-xx` sem prefixo de pasta = `paridade-hooks06` (os ids PH-02, PH-12 etc. existem tambem em `paridade-07` com outro titulo; abaixo cito o titulo quando ha ambiguidade).

| Item | Classe | Evidencia V3 | Evidencia V2 | Cartao |
|---|---|---|---|---|
| Lista do inbox paginada por cursor (30 contatos / 50 msgs, `loadMore`) | LACUNA | `useRealtimeMessages.ts:68-69,313-343,625-688` | `services/realtime.service.ts:21-22,131-147` teto fixo 500 contatos / 1000 msgs | PD-74, PD-75 |
| Hidratacao de contato desconhecido em lote (debounce 50 ms, retry no buffer, notifica so a mais recente) | LACUNA | `useRealtimeMessages.ts:88,388-481` | `hooks/chat/useRealtimeMessages.ts:72-96` 1 consulta por mensagem, sem retry | PD-73 |
| INSERT repetido nao renotifica (E31) | LACUNA | `useRealtimeMessages.ts:517-521` | `hooks/chat/useRealtimeMessages.ts:117-128` notifica mesmo se a linha ja existia | PD-73 |
| Dedupe de `fetchConversations` em voo | LACUNA | `useRealtimeMessages.ts:259,557-562` | `hooks/chat/useRealtimeMessages.ts:165-203` so descarta o resultado antigo | PD-73 |
| Revalidar sem skeleton | LACUNA | idem | `:169` `setLoading(true)` a cada revalidacao | PD-73 |
| Invalidacao do painel do contato coalescida a cada 2 s | LACUNA | `useRealtimeMessages.ts:182-221,746-784`, `useConversationMessagesData.ts` | `hooks/chat/useMessages.ts:68-72` so invalida midia | PH-43 |
| Marcar como lida em lote (250 ms, otimista, retry so transitorio, guarda UUID) | LACUNA | `useRealtimeMessages.ts:872-1005` | `hooks/chat/useRealtimeMessages.ts:253-268` | PD-91 |
| `fetchMessages` de uma conversa: paginacao, merge e eventos durante o fetch | MELHOR_NA_V2 | `useMessages.ts` (sem paginacao: `getAllMessagesForContact`) | `hooks/chat/useMessages.ts:28,36-39,77-137,153-197` (pagina de 100, cursor `(created_at,id)`, overlay com geracao #310) | n/a |
| Cancelar leitura da conversa anterior (AbortController) | EQUIVALENTE | `useMessages.ts` RCA 08-21, `useMessagesCursor.ts:97-146` | `useMessages.ts:51,117,174` geracao: descarta resposta velha, nao aborta a requisicao | n/a |
| Fonte dual evo x zapp com fallback automatico | DECISAO | `useInboxSource.ts:132-247`, ADR dual-path | `hooks/inbox/useRealtimeInbox.ts:20` `USE_EXTERNAL_DB=false`; `messages` nao e particionada na V2 (sem `PARTITION BY`; `public.messages` na publicacao `20251215163158`, `20260628110559`) | n/a |
| Espelho `realtime_message_fanout` e regra de nao assinar DELETE | DECISAO | `useRealtimeMessages.ts:546-551,787-795` | V2 assina `public.messages` direto (`useRealtimeMessages.ts:214-221`; `useMessages.ts` com DELETE) | n/a |
| Ressincronizar apos queda de canal | MELHOR_NA_V2 | V3 so loga `CHANNEL_ERROR` | `hooks/realtime/useSupabaseRealtime.ts:49,145-155,228-275` (`onReconnect`, `online`, `visibilitychange`, trava de 5 s por callback, canal compartilhado com carencia de 250 ms) | n/a (outros canais: PD-76) |
| Classificar `CHANNEL_ERROR` transitorio x real (`logChannelError`) | LACUNA (so ruido de log) | `useRealtimeMessages.ts:800-815` | `useSupabaseRealtime.ts:~150` loga `warn` em todo erro | nenhum (P2, secao 2 N7) |
| Revalidacao periodica da lista (5 min, pausa com aba oculta) | LACUNA | `useRealtimeFallbackRefetch.ts:28,60,130` | nada periodico | PH-46 |
| Presenca/conexoes por Realtime + polling de 120 s so em erro | EQUIVALENTE (V2 tem varios canais) | `useRealtimePresenceAndConnections.ts` | 4 canais em `whatsapp_connections`: `hooks/connections/useConnectionsHealth.ts:216`, `components/monitoring/hooks/useEvolutionMonitoring.ts:45`, `components/alerts/EvolutionDisconnectBanner.tsx:42`, `hooks/inbox/useConnectionsManager.ts:108` | GL1 (checar se consolidou) |
| Heartbeat de presenca (`profiles.online_status`, throttle, `pagehide`, offline apos 30 s oculto) | DECISAO / MELHOR_NA_V2 | `useInboxHeartbeat.ts:7-9,91,138` | `hooks/crm/useAgentPresence.ts` tabela `agent_presence`, batimento de 25 s, TTL 75 s, RLS por `auth.uid()`; a coluna `profiles.online_status` nao existe na V2 (nenhuma migration a cita) | PD-91 (`pagehide`) |
| "Agente ausente" usa sinal de atividade real | LACUNA (banco) | n/a | `20260829040000_fix_reassign_absent_agents_last_seen_at.sql` usa `user_sessions.last_activity_at`, so atualizado no login (`detect-new-device/index.ts:262`) | PH-02 e PF-09 de `paridade-07` |
| Estabilizar conversa selecionada contra "flapping" da lista | LACUNA | `useRealtimeInbox.ts:209-235` | `hooks/inbox/useRealtimeInbox.ts:89-119` | PD-91 / PH-42 |
| Contato aberto de fora da lista (SLA, ultima msg, nao lidas, ao vivo) | LACUNA | `useFallbackContact.ts:23-186` | `useRealtimeInbox.ts:94-119` `select('*')` sem embed | PH-42 |
| Contato novo / arquivado entra e sai da lista ao vivo | LACUNA | `applyHydratedContact` `:393-424` | `useRealtimeMessages.ts:138-163` so UPDATE de contato ja na lista | PD-73 |
| UPDATE de mensagem antiga de contato fora da lista nao vira "mensagem nova" | LACUNA | mesmo desenho na V3 (defeito herdado) | `useMessageUpdateBatcher.ts:~49-53` + `useRealtimeMessages.ts:72-96` | PH-47 |
| Lote de UPDATE de mensagem: janela 150 ms, atalho imediato para `played`, status observavel | EQUIVALENTE (V2 100 ms sem atalho) | `useMessageUpdateBatcher.ts:128-142` | `hooks/realtime/useMessageUpdateBatcher.ts:35-67` | n/a (trivial, secao 2 N6) |
| Notificacao de mensagem nova: horario silencioso ao vivo, par `soundEnabled`+`newMessageSound`, tipo e volume | MELHOR_NA_V2 | `useRealtimeNotifications.ts:20` congela `!isQuietHours()` no mount | `hooks/realtime/useRealtimeNotifications.ts:17,32-61` avalia ao vivo | n/a |
| Notificacao do navegador robusta (try/catch, `tag` por contato, clique abre conversa) | LACUNA | `utils/notificationSounds.ts` | `src/utils/notificationSounds.ts:80-86` | PH-50 |
| Aviso de mensagem nova com a conversa certa "aberta" | LACUNA | defeito herdado | `useRealtimeInbox.ts:131-135`, `RealtimeInboxView.tsx:177-178,252,360,432` | PH-44, PH-45 |
| Botao de som parte do estado certo | LACUNA | defeito herdado | `useInboxUIState.ts:47` | PH-52 |
| Avisos globais: falha definitiva da fila (`failed_messages`), retentativa resolvida, automacao com erro | LACUNA | `useFailedMessageAlerts.ts`, `useRetryResolutionAlerts.ts`, `useAutomationFailureAlerts.ts` (montados em `components/system/*Mount.tsx`) | nenhum equivalente em `src/` (grep `failed_messages`, `automation_executions`, `abandoned`: so telas de relatorio) | GL5 (`t_34eef96e`, todo) + FQ1 (banco), AT1 (banco) |
| Vocabulario de status de entrega (`played`, `failed_auth`, `failed_retries`) | LACUNA | `RealtimeMessage.status` `useRealtimeMessages.ts:100-112` | status limitado na V2 | VC1, VC2, VC3 |
| Avatar em lote (RPC `get_avatars_by_jids_batch`, cache 30 min, BroadcastChannel) | DECISAO | `avatarBatchStore.ts`, `useContactAvatar.ts` | V2 guarda `contacts.avatar_url` no servidor e renova por `batch-fetch-avatars` | n/a |
| Seed do cache de avatar com TTL | DECISAO | `useRealtimeInbox.ts:30,141-174` | idem acima | n/a |
| Auto-scroll respeita a posicao de leitura (limite 150 px, posicao inicial no bind) | MELHOR_NA_V2 | `useChatAutoScroll.ts:36-65` | `components/inbox/chat/ChatMessagesArea.tsx:94-100,285-298` (limite 100 px, `isNearBottomRef`, `scrollToBottomAfterSend` que ignora a posicao, selo "enviada") | C6 (botao Rolar para o final) |
| Atalho `M` para silenciar o audio tocando (`audioPlaybackBus`) | LACUNA (acabamento) | `audioPlaybackBus.ts`, `components/keyboard/GlobalKeyboardProvider.tsx:68-76`, `useAudioManagement.ts:522-530` | nada (grep `audioPlaybackBus`, `toggleMute`: vazio) | nenhum (P2, secao 2 N5) |
| Posicao/velocidade do audio sobrevivem ao remontar a bolha (`playerStateStore`) | DECISAO + parcial | `playerStateStore.ts` (migra id otimista para canonico) | V2 nao tem bolha otimista (envio atomico), mas a posicao tambem some ao sair da tela | PH-22 |
| Reconciliacao otimista e telemetria (`reconciliationTelemetry`) | DECISAO | `reconciliationTelemetry.ts` | sem bolha otimista na V2 | PD-63 |
| `useRealtimeContacts` / `realtimeContactsStatusStore` (`evo.evolution_contacts`) | DECISAO | `useRealtimeContacts.ts`; o evento `contact-updated` nao tem consumidor na V3; o status so alimenta o fallback | V2 usa `public.contacts`: `useRealtimeMessages.ts:138-163,223-229`, `useContactEnrichedData.ts:72` | n/a |
| Whisper em tempo real por contato (`unread_whispers` em lote) | DECISAO / parcial | `useRealtimeInbox.ts:258-354` | `hooks/chat/useWhisperCount.ts` | WH1, WH2, WM1 |
| Validar audio gravado antes de subir (`validatePttBlob`) | LACUNA | `useRealtimeInbox.ts:526-536` | `hooks/inbox/useRealtimeInbox.ts:183-201` | `t_65b3779c` |
| Fila de envio reconciliada com a entrega | DECISAO | `useRealtimeInbox.ts:386-429` | envio atomico (`enqueue_outbound_message`) | PD-63 |
| Promover `routing_status` pending para assigned ao responder | DECISAO (codigo morto) | `useRealtimeMessages.ts:837-855` consulta `team_conversations` pelo id do contato (nunca casa) | V2 nao tem `routing_status` | n/a |
| Ordenacao estavel `(created_at, id)` e `dedupeMessages` canonico | LACUNA parcial | `realtimeUtils.ts:20-67` | `hooks/realtime/realtimeUtils.ts:152-156` so por `created_at`; dedupe por `external_id` coberto pelo indice unico `messages_external_id_uq` (`20260902210334`) | PH-51 |
| `content` nulo vira `''` ao normalizar | LACUNA (defensivo) | `realtimeUtils.ts:6-13` | `realtimeUtils.ts:~118-130` nao trata `content` nulo (a coluna e `NOT NULL`, ver `types.ts`) | nenhum (P2 trivial) |
| `isArchived` derivado do contato | DECISAO | `realtimeUtils.ts:buildConversation` | V2 tem `useInboxFilters.arquivadas` e PD-71 (reabre ao escrever) | PD-71, PD-72 |
| Estado "enviando por conversa" (`useConversationSendState`) | DECISAO (sem consumidor) | `useRealtimeMessages.ts:1124` | n/a | n/a |
| Contador de nao lidas no menu lateral e titulo da aba | LACUNA | `useAppBootstrap.ts:115` | `pages/Index.tsx:123` `unreadNotifications={0}`; `useDocumentBadge` sem chamador | PE-30, PE-31, PE-32 (done) |

---

## 2. Lacunas reais sem cartao (priorizadas)

### P0
Nenhuma. Conferi os pontos sensiveis do recorte: `claim_outbound_message`, `complete_outbound_message` e `fail_outbound_message` so rodam como `service_role` e o gatilho `guard_message_delivery_internal_fields` bloqueia escrita cliente dos campos `delivery_*` (`20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:78-104,355,414,473`). Ver N8 sobre o vazamento (so higiene) desses campos para o navegador.

### P1

**N1. Aviso de mensagem nova (som, notificacao do navegador, aviso em tela) so existe com a tela de Conversas aberta**
- Evidencia V2: `pages/ViewRouter.tsx:94-195` renderiza UMA view por vez (`VIEW_MAP[currentView]`, sem manter o inbox montado). O unico tratador de mensagem nova e `useRealtimeNotifications` (`hooks/realtime/useRealtimeNotifications.ts:28-61`), chamado dentro de `useRealtimeMessages` (`hooks/chat/useRealtimeMessages.ts:57`), que so monta em `RealtimeInboxView` (`components/inbox/RealtimeInboxView.tsx:95`). Quem esta em Dashboard, Contatos, Tarefas, Telefonia, Talk X etc. nao ouve som nem recebe notificacao; o sino (`useNotifications`) nao traz mensagens de contato (nao ha gatilho de mensagem em `notifications`: busca por `'new_message'` em `supabase/migrations` so acha o tipo de gatilho de automacao). Cartoes PE-30/31/32 cobrem so o contador e o titulo da aba; PH-44/45 so os caminhos de dentro do inbox.
- Evidencia V3: mesmo desenho (nao e paridade; e melhoria que a V2 pode ganhar, e a mais valiosa deste recorte para a operacao).
- Implementar: hook `useGlobalIncomingMessageAlerts` montado uma vez no `AppShell` (ao lado de `useAgentPresenceJoin`, `components/layout/AppShell.tsx:57`), assinando INSERT de `public.messages` pelo `useSupabaseRealtime` (canal compartilhado, com `onReconnect` desnecessario) e filtrando `sender='contact'`, nao lida, fora do contato aberto. Nome e avatar do contato vem de um cache de contatos (uma consulta por id, reaproveitando `RealtimeService.fetchContactsByIds`). Reusa `notifyAboutIncomingMessage` extraindo-o para um modulo sem estado de lista. Regra para nao tocar duas vezes: o aviso global fica ativo SEMPRE e o do inbox (`useRealtimeMessages`) deixa de chamar `notifyAboutIncomingMessage`, ou o global se desliga quando `currentView==='inbox'`. O contato aberto vem de um estado compartilhado (hoje `selectedContactIdRef` em `useRealtimeNotifications`; ver PH-44). Clique na notificacao navega para `inbox` e abre a conversa (`open-contact-chat`, `window.__pendingOpenContactId`, ja suportado em `useRealtimeInbox.ts:61-76`).
- Perfil: hugo. Arquivos provaveis: novo `src/hooks/realtime/useGlobalIncomingMessageAlerts.ts`, `src/hooks/realtime/useRealtimeNotifications.ts`, `src/hooks/chat/useRealtimeMessages.ts`, `src/components/layout/AppShell.tsx`, testes com `vi.useFakeTimers` em `src/hooks/realtime/__tests__/`. Coordenar com PH-44/45/50/52 (mesmos arquivos) e PE-31 (mesma assinatura de `messages`).
- Pronto: com o usuario em Dashboard, mensagem nova do cliente toca o som e mostra o aviso uma unica vez; no inbox continua um aviso so; horario silencioso, `soundEnabled`, `newMessageSound` e a permissao do navegador seguem respeitados; clique abre a conversa.

**N2. Quem recebe o aviso de mensagem nova: hoje e toda mensagem de contato visivel pela RLS**
- Evidencia V2: `notifyAboutIncomingMessage` (`hooks/realtime/useRealtimeNotifications.ts:28-61`) nao olha `contact.assigned_to` nem fila. A policy `contacts_select_policy` (`20260901200001_e23_default_queue_rls_policies.sql:59-67`, reescrita depois em `20260929780000_contacts_single_permission_predicate.sql`) deixa todo membro ativo da fila ler todos os contatos da fila, e o canal `messages` global (`useRealtimeMessages.ts:214-221`, sem filtro) entrega tudo o que a RLS permite. Com 20 atendentes na mesma fila, cada um ouve e recebe toast de conversa que e de colega. A V3 tem o mesmo defeito (nao ha referencia).
- Implementar (decisao do dono a registrar antes): avisar quando `contact.assigned_to` e o proprio perfil OU o contato esta sem dono dentro das filas do usuario; supervisor/admin: opcao nas configuracoes de notificacao ("avisar tambem conversas de colegas", desligada por padrao). Funcao pura `shouldNotifyForContact(contact, profile, settings)` testavel; usada por inbox e por N1.
- Perfil: hugo (+ iris se a opcao entrar em `NotificationSettingsPanel`). Arquivos: `src/hooks/realtime/useRealtimeNotifications.ts`, `src/hooks/system/useNotificationSettings.ts`, `src/components/notifications/NotificationSettingsPanel.tsx`, testes.
- Pronto: teste com 3 casos (minha, de colega, sem dono) e supervisor com a opcao ligada/desligada.

### P2

**N3. Varias abas abertas repetem som, notificacao do navegador e a carga pesada**
- Evidencia V2: cada aba monta `useRealtimeMessages` (500 contatos + 1000 mensagens, `realtime.service.ts:21-22`) e toca/notifica sozinha; nao ha `BroadcastChannel` nem `navigator.locks` nos hooks de mensagem (grep: so `lib/mediaVolumeStore.ts` usa `BroadcastChannel`). A V3 so usa `BroadcastChannel` para avatares. Melhoria.
- Implementar: eleicao de aba lider com `navigator.locks.request('zapp-message-alerts', ...)` (fallback `BroadcastChannel`): so a aba lider toca som e abre notificacao do navegador (a visivel assume se a lider estiver oculta). Cartao PI-11 trata dispositivo unico no login, nao isto.
- Perfil: hugo. Arquivos: `src/hooks/realtime/useRealtimeNotifications.ts`, `src/utils/notificationSounds.ts`, teste. Pronto: duas instancias simuladas, so uma chama `playNotificationSound`.

**N4. Pedido de permissao de notificacao no mount do inbox, sem gesto do usuario**
- Evidencia V2: `useRealtimeNotifications.ts:22` e `useTranscriptionNotifications.ts:27` chamam `requestNotificationPermission()` ao montar; Safari exige gesto e o Chrome silencia o pedido automatico. O botao com gesto ja existe em `components/notifications/NotificationSettingsPanel.tsx:28`. A V3 faz igual (herdado).
- Implementar: remover os pedidos automaticos; mostrar um convite discreto (banner dispensavel no inbox) que chama `requestNotificationPermission()` no clique e lembra a recusa em `localStorage` com `try/catch`. Perfil: iris (banner) + hugo. Arquivos: os dois hooks acima, novo componente pequeno em `src/components/inbox/`. Pronto: nada pede permissao sem clique; recusa nao reaparece por 30 dias.

**N5. Atalho `M` para silenciar o audio que esta tocando**
- Evidencia V3: `audioPlaybackBus.ts` (um player ativo, `toggleMuteActive`), `GlobalKeyboardProvider.tsx:68-76` (toast "Audio silenciado" / volume), `useAudioManagement.ts:522-530` registra/solta o player. V2: grep por `audioPlaybackBus`, `toggleMute`: nada; `hooks/chat/useExclusiveAudio.ts` so garante um audio por vez. Nenhum cartao (buscas: `audioPlaybackBus|toggleMute|tecla M`: so um cartao de painel de volume, V2/volume-dial).
- Implementar: store minima (a V3 e ~80 linhas) + atalho `M` registrado no registro de atalhos que a V2 ja usa (`components/keyboard/GlobalKeyboardProvider.tsx`) + o player registrar/soltar. Perfil: iris (+ hugo para a store). Arquivos: `src/components/keyboard/GlobalKeyboardProvider.tsx`, `src/hooks/chat/useExclusiveAudio.ts`, `src/components/inbox/AudioMessagePlayer.tsx`, testes. Pronto: `M` sem player ativo nao faz nada; com player, alterna mudo e mostra o aviso; ignorado dentro de campos de texto.

**N6. Atualizacao de status `played` espera a janela do lote**
- Evidencia: V3 `useMessageUpdateBatcher.ts:104-123` envia na hora a transicao para `played` (o duplo check azul do audio ouvido aparece sem atraso). V2: `hooks/realtime/useMessageUpdateBatcher.ts:55-61` sempre 100 ms. Diferenca de uma decima de segundo; so vale junto de outro cartao no mesmo arquivo (PH-47). Perfil: hugo.

**N7. Erro de canal transitorio vira `warn` no log de producao**
- Evidencia: V3 `useRealtimeMessages.ts:800-815` e `integrations/supabase/channelErrorLogging.ts` separam queda transitoria (reconexao automatica) de erro real; V2 `useSupabaseRealtime.ts:~150` registra `warn` em todo `CHANNEL_ERROR`/`TIMED_OUT`, com ruido em fila de logs/telemetria. Implementar: nivel `debug` quando o canal ja esteve `SUBSCRIBED` ha menos de N minutos, `warn` caso contrario. Perfil: hugo. Arquivo: `src/hooks/realtime/useSupabaseRealtime.ts`. Teste: dois casos.

**N8. A lista inicial e o canal global trazem todas as colunas de `messages` e `contacts`**
- Evidencia V2: `services/realtime.service.ts:144` e `hooks/inbox/useRealtimeInbox.ts:100` usam `.select('*')`; `integrations/supabase/types.ts` mostra que `messages` carrega `delivery_claim_token`, `delivery_last_claim_token`, `delivery_claimed_by`, `delivery_claim_expires_at`, `delivery_attempt_count`, `link_preview`, `media_meta`... em 1000 linhas por carga e em todo evento Realtime. Sem risco (as RPCs que usam o token sao so `service_role`), mas e payload e superficie desnecessarios; o cartao SL-099 so reduziu a pagina de `useMessages`.
- Implementar: lista de colunas explicita (constante `INBOX_MESSAGE_COLUMNS` / `INBOX_CONTACT_COLUMNS`) para a carga inicial e `fetchMessagesBefore`; para o canal global nao ha como filtrar colunas: avaliar coluna `REVOKE SELECT` por papel so se o Realtime respeitar (nao respeita; ver "nao consegui verificar"). Perfil: hugo; depois workersql se decidirem esconder `delivery_*` por view. Arquivos: `src/services/realtime.service.ts`, `src/services/chat.service.ts`, `src/hooks/inbox/useRealtimeInbox.ts`.

**N9. UPDATE de mensagem substitui o objeto inteiro em vez de mesclar**
- Evidencia V2: `hooks/realtime/useMessageUpdateBatcher.ts:37` `updatedMessages[msgIdx] = updatedMessage` e `hooks/chat/useMessages.ts` (`handleMessageUpdate`: `prev.map(... updatedMessage)`). A V3 ao menos preserva `contactAvatar` (`useMessageUpdateBatcher.ts:64-70`). Se o payload de UPDATE vier sem alguma coluna grande (valor TOAST nao alterado, ou registro cortado pelo limite de payload do Realtime), o conteudo/transcricao some da tela ate recarregar. NAO verifiquei o comportamento real do Realtime com TOAST (ver secao 3); e defesa barata.
- Implementar: mesclar `{ ...existing, ...definedFieldsOf(updated) }` (campos `undefined` nao sobrescrevem) nos dois lugares; teste com payload parcial. Perfil: hugo. Arquivos: `src/hooks/realtime/useMessageUpdateBatcher.ts`, `src/hooks/chat/useMessages.ts`.

**N10. Sem indicador de que o tempo real caiu**
- Evidencia: V2 `UI-05a` (`useSupabaseConnectivity`) so sonda o backend por HTTP; `OfflineIndicator` so olha `navigator.onLine`. Quando o canal `messages` cai mas o navegador esta online, o atendente nao sabe que a lista pode estar velha ate a reconexao (a V3 tem `realtimeContactsStatusStore.ts` e hook `useRealtimeContactsStatus`, mas so alimenta o fallback; nao e paridade e sim melhoria).
- Implementar: store pequena de estado do canal (`connected`/`degradado`/`caido`) alimentada por `useSupabaseRealtime` (ja conhece `lastStatus`), indicador discreto no cabecalho da lista ("Reconectando...", `aria-live="polite"`) so quando passar de 10 s caido. Perfil: hugo (store) + iris (indicador). Arquivos: `src/hooks/realtime/useSupabaseRealtime.ts`, novo `src/hooks/realtime/realtimeStatusStore.ts`, `src/components/inbox/conversation-list/`. Pronto: simular `CHANNEL_ERROR` por 15 s mostra o indicador e `SUBSCRIBED` o remove.

**N11. Testes de funcoes puras sem cobertura na V2**
- Evidencia: V3 tem `realtimeUtils.utils.test.ts` e `realtimeUtils.dedupe.test.ts`; V2 so tem `hooks/realtime/__tests__/messageTypeClassification.test.ts` para `realtimeUtils.ts` (grep de `buildConversation|dedupeContacts|chunkArray|sortMessagesByCreatedAt` em testes acha so `useRealtimeMessages.reconexao`, `useInboxFilters.janela-global`, `MessageBubble.tentativas`). `useMessageUpdateBatcher` e a hidratacao nao tem teste isolado. Cobrir: `buildConversation` com e sem `summary` (R2-INB-005), `buildConversations` (ordenacao e fallback `contact.created_at`), `dedupeContacts`, `chunkArray`, batcher (junta N updates em um commit; update de mensagem fora da conversa chama hidratacao). Perfil: workertestes. Arquivos: `src/hooks/realtime/__tests__/realtimeUtils.test.ts`, `useMessageUpdateBatcher.test.tsx` (novos). PD-95 e PH-53 nao nomeiam estes arquivos.

---

## 3. Achados A1..A10 do doc (rodape secao 8) conferidos na V2

| Achado | Na V2 |
|---|---|
| A1 nome "hook" em utilitarios | PH-37 (renomear `use...` que nao sao hooks) ja cobre |
| A2 dual-path zapp x evo | nao existe na V2 (fonte unica `public.messages`); DECISAO |
| A3 orquestradores sem teste | V2 tem `useRealtimeMessages.test.tsx`, `.reconexao`, `useRealtimeInbox.*` (4); falta hidratacao em lote, E31 e batcher (PD-95, N11) |
| A4 `getRealtimeDiscardedCount` deprecated | nao existe na V2 |
| A5 `playerStateStore._clear` publico | nao existe na V2 |
| A6 `rpc()` sem tipo em `useMessagesCursor` | nao existe na V2 (usa `supabase.from` tipado) |
| A7 `useSip` sem validar estado | fora deste recorte |
| A8 teto de 500 em `useRetryResolutionAlerts` | nao existe na V2; ao criar GL5, copiar o historico por conversa sem despejo (V3 `useRetryResolutionAlerts.ts:96-103`) e ignorar o cap |
| A9 flush de 250 ms deixa mensagem visualmente sem leitura | na V2 nao ha lote; PD-91 tem de decidir o atraso do lote: manter o otimista imediato |
| A10 `saved_filters` sem paginacao | fora deste recorte (PH-14..16) |

---

## 4. Correcoes ao relatorio anterior (`paridade-hooks06/achados_realtime.md`)

1. **L11 esta errado em um ponto:** diz que `useRealtimeNotifications` (horario silencioso ao vivo, par `soundEnabled`+`newMessageSound`) "nao tem teste". Existe `src/hooks/__tests__/useRealtimeNotifications.behavior.test.ts` (98 linhas) cobrindo tipo/volume, `newMessageSound` desligado, mensagem propria, mensagem lida, conversa aberta e a abertura do horario silencioso com a aba aberta (`:80`). **PH-53** nao deve recriar esses casos; falta apenas a janela que atravessa meia-noite, `browserNotifications` e o aviso em tela.
2. O relatorio anterior classifica `useMessageUpdateBatcher` como "EXISTE igual"; ha diferenca real mas trivial (N6) e a V3 preserva `contactAvatar` no UPDATE, a V2 nao tem campo equivalente (sem efeito).
3. Confirmados por leitura propria: L1 (PH-41), L2 (PH-42), L3 (PH-43), L4 (PH-44/45), L5 (PH-46), L6 (PH-47), L7 (PH-48), L8 (PH-49), L9 (PH-50), L10 (PH-51), L12 (PH-52).

---

## 5. O que NAO consegui verificar

- **Banco real:** se `public.messages` esta realmente fora de particao no ambiente (so migrations); estado atual da policy `contacts_select_policy` (N2: a migration `20260929780000` a reescreveu, li so o texto de `20260901200001`); se o Supabase Realtime omite colunas TOAST nao alteradas ou corta registros grandes no payload de UPDATE (N9); se o Realtime entrega colunas que o papel nao pode ler por `GRANT` de coluna (N8, depende do servidor).
- **Runtime:** se o Safari/Chrome do celular da equipe rejeita o pedido automatico de permissao (N4); custo real de duas abas abertas (N3); carga de eventos do canal global `messages` sem filtro com RLS por assinante (cada evento e avaliado contra cada assinante; so medindo).
- **Fora da copia lida:** cartoes `done` ainda nao integrados no `.integrador` (PD-73/74/75/91, PE-30/31/32, GL1, GL5 e outros) podem ter fechado parte de N1/N10; antes de abrir cartao, conferir a branch do dia.
- **Quadro:** o banco de cartoes foi lido por copia que as vezes estava no meio de gravacao ("database disk image is malformed" numa consulta isolada); as buscas foram repetidas, mas um cartao criado nos ultimos minutos pode nao aparecer.
