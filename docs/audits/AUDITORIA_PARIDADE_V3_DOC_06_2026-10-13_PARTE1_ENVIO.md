# Achados: recorte 1 (ENVIO), doc 06 hooks do inbox, V3 x V2 (13/10/2026, 2ª passada)

Somente leitura. V3 = `origin/main` de `~/projetos/Zapp_Web_V3` (`src/features/inbox/hooks/` e vizinhos). V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador` (cópia sem cartões `done` não integrados: onde a lacuna parece pequena, "checar cartões irmãos"). Nada foi executado (sem testes, tsc ou build).

## 0. Leitura prévia obrigatória (o que já está carteado)

Antes de achar lacuna conferi, além do `BRIEF.md`:
- PD-61..95 (`paridade-docs/cards_06_07.py`), com destaque para PD-63 (fila offline), PD-77 (reenvio após falha), PD-78/79/80 (varredor, POST iniciado, timeout), PD-82 (bolha offline), PD-83 (nova conversa), PD-91 (markAsRead), PD-94 (host de mídia, rate limit, áudio) e PD-95 (testes).
- `paridade-hooks06/achados_envio.md` e `cards_1_envio.py` (PH-01..06, PH-25..28, PH-34: G0 a G9 já viraram cartão). Este arquivo NÃO repete G0..G9; cita-os quando tocam o mesmo ponto.
- Cartões do kanban M1..M6 (tentativas de envio), R1/R2 (re-fila da MESMA mensagem), EV1 (erro dito ao usuário), VC1..VC3 (vocabulário e estados), LS1/FF1/FF2/FQ1..3 (falha na lista, filtro, DLQ), C2 (banner), AG1..AG4 (agendadas), GL5 (avisos globais), LK1 (links no balão), PL1.
- Decisões já tomadas que cobrem partes da V3: DE5 (`PLANO_PARIDADE_V3_DOCS_10_A_40`): VirusTotal/antivírus de upload NÃO porta ("nada sai do sistema").

Resultado: o recorte está muito bem coberto. Achei **0 P0, 6 P1 e 6 P2 novos** (seção 2), mais 4 complementos a cartões existentes (seção 3).

## 1. Tabela (item | classificação | evidência V3 | evidência V2 | cartão)

Classificações: EQUIVALENTE, MELHOR_NA_V2, LACUNA, DECISAO, MORTO_V3 (código morto ou casca na V3).

| Item | Classificação | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|
| `messageSender.sendMessageToContact` (insert + Evolution + status) | MELHOR_NA_V2 (envio atômico no servidor: `enqueue_outbound_message` + claim com lease + `complete/fail` fenced) | `realtime/messageSender.ts:163-466` | `hooks/realtime/messageSender.ts` (fachada) → `services/outbound-message.service.ts:191-216` → `message-delivery/index.ts:569-726` | n/a |
| Caches de profile/contact, batcher de `audit_logs` (F4-15) | MORTO_V3/N-A (servidor resolve) | `messageSender.ts:33-167` | claim resolve contato/conexão no banco | n/a |
| Dedup em voo do mesmo envio (E34) | MELHOR_NA_V2 (`UNIQUE (contact_id, client_message_id)` + `crossTabSendDedupe`) | `messageSender.ts:176-216` | `outbound-message.service.ts:65-96`, `lib/crossTabSendDedupe.ts`; `enqueue...:ON CONFLICT` em `20260930200000` | PD-77 (falha), PH-01 (G0) |
| `buildEvolutionPayload` por tipo (texto, imagem, áudio, vídeo, doc, localização) | MELHOR_NA_V2 (validação por tipo no Edge, inclui enquete, contato, botões, lista, figurinha, `quoted`) | `messageSenderHelpers.ts:105-158` | `message-delivery/index.ts:330-525` (`providerPayload`) | n/a |
| Fallback de conexão (primeira conectada) | MELHOR_NA_V2 (escopo de fila L7, conexão do contato só se `connected`) | `messageSenderHelpers.ts:41-72` | `20260930200000_enforce_enqueue_connection_scope.sql:78-126` | PD-78 (motivo no claim vazio) |
| `classifyAuthError` → `failed_auth`, `failed_retries`, `retrying` | LACUNA (já carteada) | `messageSenderHelpers.ts:18-38`; `messageSender.ts:385-450,534-550` | `fail_outbound_message` só grava `failed`; sem `error_reason/error_code/retry_attempt` em `messages` (`types.ts:4566-4604`) | VC2, VC3, M1, M2 |
| `parseEvolutionError` (10 frases humanizadas, 403 ≠ "sessão expirada") | LACUNA (já carteada) | `realtime/parseEvolutionError.ts:16-74` | toast genérico "Erro ao enviar / Tente novamente." (`useChatPanelHandlers.ts:353,663,689`) | EV1, PH-02, PH-03 |
| `sendStatusBus` (pub/sub transitório + histórico 50/2000) | DECISAO (a V2 usa a linha `sending` + Realtime; o painel de debug é ferramenta de dev) | `realtime/sendStatusBus.ts` | `messages.status='sending'` desde o enqueue | n/a |
| `useMessageSendStatus`, `useConversationSendState` | LACUNA (já carteada) | `useMessageSendStatus.ts`, `useConversationSendState.ts` | `ConversationDeliverySummary`, `SendErrorBanner`, `messageSendTimeline.ts` | C2, LS1, SL3 |
| `externalMessageSender`, `externalAudioSender`, `externalSenderTypes` (modo Evolution DB) | DECISAO / MORTO_V3 (`USE_EXTERNAL_DB=false` na V2; `sendExternalPtv` e `sendExternalMedia` não têm chamador na V3) | `realtime/externalMessageSender.ts`, `externalAudioSender.ts` | `useRealtimeInbox.ts:20` | n/a |
| Vídeo-nota (PTV) | MORTO_V3 (só o próprio arquivo e um comentário do adapter chamam) | `externalMessageSender.ts:222-318` | `evolution-api` suporta `send-ptv`; nenhuma UI | n/a |
| `useMessageQueue`: concorrência 5, serial por contato, backoff 1 s a 30 s, jitter | MELHOR_NA_V2 no servidor (lease); backoff/retentativa = LACUNA carteada | `useMessageQueue.ts:85-126,296-536` | `sendThrottle.ts` (adia, nunca descarta) | PH-04 (G2), PH-05 (G3) |
| `useMessageQueue`: persistência em localStorage (mídia perdida vira `failed`, quota, `beforeunload`) | DECISAO (V2 usa IndexedDB ordenado só para texto; mídia exige rede) | `useMessageQueue.ts:176-281` | `lib/offlineQueue.ts` | PD-63, PH-05, PH-26 |
| `useMessageQueue`: dedup de recibos por Set com cap 1000 (`reconcileWithDelivery`) | MORTO_V3/N-A (V2 não reconcilia no cliente) | `useMessageQueue.ts:613-656`; `useRealtimeInbox.ts:370-410` | n/a | n/a |
| `failed_messages` (DLQ) inserida pelo cliente | DECISAO/LACUNA carteada (DLQ operável é do admin) | `useMessageQueue.ts:481-510` | `MessageSendHistorySheet.tsx:1-20` admite "DLQ não existe" | FQ1..FQ3 |
| `useSendThrottle` (500 ms, 5 por 3 s) | MELHOR_NA_V2 (`lib/sendThrottle.ts` adia; a V3 descarta e NEM TEM consumidor: só é exportado) | `useSendThrottle.ts` | `lib/sendThrottle.ts:1-120` + `outbound-message.service.ts:207` | PH-25 (rich fura o throttle) |
| `useRetryFailedMessage` (`rpc_dlq_retry_now`, 30 s, 42501/PGRST116) | LACUNA (já carteada) | `useRetryFailedMessage.ts:19-117` | nada; banner reenvia como mensagem nova | R1, R2, FQ1 |
| `useMessageSendHistory` + `messageSendHistory.schemas` (Zod, `retry_reasons` legados, `deriveFinalStatus`) | LACUNA (já carteada) | `useMessageSendHistory.ts`, `messageSendHistory.schemas.ts` | `messageSendTimeline.ts` (colunas de `messages`) | M1, M3, M4 |
| `useFailureMetricsBatch` / `classifyFailure` | LACUNA (já carteada) | `useFailureMetricsBatch.ts:34-128` | nada | FF1, FF2 |
| `useFailureReason` / `formatFailureReason` | LACUNA (já carteada) | `useFailureReason.ts:32-82` | nada | LS1, M4 |
| `useMessageStatus` | LACUNA irrelevante: a V2 é pior e o hook é código morto (sem importador; canal sem sufixo) | `useMessageStatus.ts` (inclui `error_reason`, bus, UUID guard, canal com sufixo) | `hooks/chat/useMessageStatus.ts:67` | PD-94 remove |
| `useSafeInteractiveMessage` (poll e cartão como TEXTO simulado, `status='sending'`) | MELHOR_NA_V2 (`enqueue_rich_outbound_message`, payload imutável, validação no Edge) | `useSafeInteractiveMessage.ts:30-111` | `outbound-message.service.ts:245-265`; `AdvancedMessageMenu.tsx:94-147` | C8a/C8b |
| `useNewConversation` | EQUIVALENTE com defeitos já carteados e 1 novo (conexão errada, N2) | `useNewConversation.ts:49-230` | `hooks/chat/useNewConversation.ts:76-122` | PD-83; **N2 (novo)** |
| `useChatMediaSending` (figurinha, emoji, áudio meme) | MELHOR_NA_V2 no envio (tudo pela fila); pré-teste de instância inútil | `useChatMediaSending.ts:146-410` | `components/inbox/useChatMediaSending.ts:24-142` | PH-27 (G8) |
| `useAuxiliaryMessageLog` (linha local `sending` + reconcilia por `audio_meme_id`) | MORTO_V3 (V2 não insere em `messages`; `audio_meme_id` só serve à reconciliação otimista da V3) | `useAuxiliaryMessageLog.ts:55-101`; `evolutionReconcile.ts:62-72` | `outbound-message.service.ts` | n/a |
| `useScheduledMediaUpload` (TTL 7 dias, erro com toast) | MELHOR_NA_V2 (caminho `<contact_id>/…`, locator durável, limpeza do órfão) com 1 buraco: falha do upload sem aviso (N8) | `useScheduledMediaUpload.ts:25-65` | `ChatPanel.tsx:379-405` | AG1 (mutação), PH-23; **N8 (novo)** |
| `useMessageSignature` | EQUIVALENTE com defeitos carteados (idempotência, `getUser` por abertura) | `useMessageSignature.ts:20-62` | `hooks/chat/useMessageSignature.ts:11-56`; texto original preservado no Desfazer (`useChatPanelHandlers.ts:313-332`) | PH-34 |
| `useAuditLogMutation` / `logAuditEvent` (insert direto em `audit_logs`) | MELHOR_NA_V2 (`lib/audit.ts:36` usa a RPC `log_audit_event`, autor do servidor) | `useAuditLogMutation.ts:7-28`; só 1 consumidor | `lib/audit.ts` | PD-93 (autoria) |
| `useConversationActions.markAsRead` (lote 250 ms, retry transitório x permanente, flush no unmount, guarda UUID) | LACUNA (já carteada) | `realtime/useConversationActions.ts:30-160`; `services/markMessagesRead.ts:12-62` | `useRealtimeMessages.ts:253-267`; `realtime.service.ts:209-221` (1 UPDATE por seleção; falha só `log.error`) | PD-91, PS1/PS2 |
| `useConversationActions.sendMessage` (routing `pending→assigned` em `team_conversations`) | MORTO_V3 (`contactId` nunca é id de `team_conversations`) | `useConversationActions.ts:165-195` | n/a | n/a |
| `useRetryResolutionAlerts` / `FailedMessageAlertsMount` | LACUNA (já carteada) | `useRetryResolutionAlerts.ts` | nada | GL5 |
| Evento `zapp:message-sent` → gamificação | MELHOR_NA_V2 (trigger de banco `handle_message_gamification`, não bloqueia o envio) | `messageSender.ts:267` | `20261006221628_gamification_marco_nao_bloqueia_envio.sql` | n/a |
| Upload de anexo por `secure-upload` (magic bytes + VirusTotal + 50 MB) | DECISAO no VirusTotal (DE5); a parte local (limite de tamanho e tipo no servidor) = LACUNA (N6) | `useFileUploadLogic.ts:96-139`; `supabase/functions/secure-upload/index.ts:20-60,160-175` | `useFileUploadLogic.ts:128-145` sobe direto no Storage; nenhum limite/tipo no bucket em migration (só `team-chat-files` tem) | DE5; **N6 (novo)** |
| Upload com `onRetry` na toast (falha do scanner) | DECISAO (depende de scanner) | `useFileUploadLogic.ts:235-262` | `useFileUploadLogic.ts:200-215` | DE5 |
| Barra de progresso do upload (`uploadProgress` 15 → 70 → 100) | LACUNA (V2 declara o estado e nunca o atualiza) | `useFileUploadLogic.ts:151-165,241` | `useFileUploadLogic.ts:103-104` (sem `setUploadProgress`), `FileUploader.tsx:193-195,221` | **N7 (novo)** |
| Áudio gravado com retentativa (até 4 tentativas, "Tentar agora") | LACUNA parcial | `components/useAudioRecorderUI.ts:186-226` | `ChatService.uploadAudio` (`chat.service.ts:111-128`) sobe com nome novo a cada tentativa | PD-94 (nome/limpeza); **N5 (novo)** |
| Envio sequencial de textos (fila não bloqueia o compositor) | LACUNA | `useRealtimeInbox.ts:356-540` (`addToQueue` volta na hora) | `useChatPanelHandlers.ts:252-355` + `useRealtimeInbox.ts:154-173` (compositor travado até RPC + Edge + 2 refetch) | **N1 (novo)** |
| Prévia de link da mensagem ENVIADA | LACUNA | V3 desenha prévia no cliente (`messageBubbleParts`, ver LK1) | `ChatService.sendMessage` tem `enrichLinkPreview`, mas NINGUÉM chama `ChatService.sendMessage` | LK1 (premissa errada); **N4 (novo)** |
| Banner "Enviar de novo" | LACUNA parcial | `SendErrorBanner` (V3) | `SendErrorBanner.tsx:73-79,170-182`: sem filtro de autor nem de idade | C2, R2; **N3 (novo)** |
| Resposta (citação) junto de mídia ou áudio | MELHORIA | n/a | `useFileUploadLogic` e `handleSendAudio` não recebem `replyToId` (o Edge já cita qualquer tipo, `message-delivery:337`) | **N9 (novo, P2)** |
| Telemetria de envio (`[INBOX_METRIC]`, `analytics.track`) | MELHORIA/coberta no servidor | `useMessageQueue.ts:400-431` | sem métrica de latência/falha no cliente; servidor: M1b/M6 | M1b, M6 |
| Testes do recorte (13 arquivos V3) | V2 PIOR em 3 pontos | `hooks/__tests__`, `realtime/__tests__` | `outbound-message.service.test.ts` (12 casos), `offlineQueue`, `sendThrottle`, `crossTabSendDedupe`; Edge: 8 testes só de payload | PH-06 (Edge), PD-95, PH-38; **N12 (novo)** |

### Achados A1..A10 do rodapé do doc 06 (só os do recorte)

| Achado | Na V2 |
|---|---|
| A2 dual-path `zapp.messages` x `evo.evolution_messages` | Não existe na V2 (`USE_EXTERNAL_DB=false`, um só caminho). Resolvido por decisão. |
| A3 orquestradores sem testes | No envio a V2 tem testes do serviço (12) e das camadas de fila; o Edge só tem 8 testes de payload (PH-06 cobre). |
| A8 soft cap 500 em `useRetryResolutionAlerts` | O hook não existe na V2; ao criar (GL5), usar a nota do `achados_envio.md` §4. |
| A9 `MARK_READ_FLUSH_MS=250` deixa mensagem sem leitura | A V2 não tem o defeito (grava na hora), mas tem o inverso: falha sem retry e estado local que não muda (PD-91). |

## 2. Lacunas REAIS sem cartão (priorizadas)

Verificação: cada item foi lido nos dois lados; a consulta `buscar_corpo.py` e a busca em `cards_*.py`, `PH-*.md`, `PD-*.md` e nos `achados_*.md` não encontraram cartão para o ponto exato. Nenhum P0 novo: não há perda de dado, vazamento ou falha de segurança explorável sem pré-condição.

### P1

**N1. O compositor fica travado até o servidor terminar TUDO (Enter ignorado em silêncio e animação de "enviado" falsa).** Perfil: hugo (+ iris no estado do botão).
- Evidência V2:
  - `useChatPanelHandlers.ts:252-253`: `if (!currentInput.trim() || isSendingRef.current) return;`. `isSending` só volta a falso no `finally` (`:353-355`), depois de `await onSendMessage(...)`.
  - `ChatPanel.tsx:219-222` → `useRealtimeInbox.ts:154-173`: o `await` cobre `enqueue_outbound_message` + a Edge `message-delivery` (POST ao provedor, até segundos) + `await refreshActiveConversation()` = `Promise.all([refetch(), refetchSelectedMessages()])` (`useRealtimeInbox.ts:150-152`), isto é, **refaz a lista inteira de conversas a cada mensagem enviada**, redundante com o Realtime que já entrega INSERT e UPDATE.
  - `useChatInputLogic.ts:182-189`: `handleSendWithAnimation` apaga o rascunho (`removeInboxDraft`), vibra e dispara a animação ANTES de `onSend()`. Com um envio em voo, um segundo Enter apaga o rascunho salvo, toca a animação de "enviado" e não envia nada (o texto fica no campo). O botão fica desabilitado (`ChatInputArea.tsx:259`).
- V3: o texto entra em `addToQueue` e o compositor libera na hora; a fila serializa por contato (`useMessageQueue.ts:309-315`).
- Efeito: quem manda duas ou três mensagens curtas seguidas (padrão no WhatsApp) perde a segunda Enter sem aviso e vê "enviado" onde nada saiu.
- Implementar:
  1. Liberar o compositor quando o ENQUEUE confirma (a linha `sending` já aparece pelo Realtime) e despachar em segundo plano por **fila serial por contato** em `outbound-message.service.ts` (promessa encadeada por `contactId`) para preservar a ordem das mensagens no WhatsApp. O erro continua chegando por `SendErrorBanner` e R2, e o texto não volta ao campo se a linha já existe (hoje volta: `useChatPanelHandlers.ts:351`, o que duplica ao reenviar; ver PH-03).
  2. Tirar `refreshActiveConversation` do caminho do envio (ou torná-lo `void` com intervalo mínimo); o Realtime e o refetch por reconexão (RT1) já mantêm a lista.
  3. `handleSendWithAnimation` só apaga rascunho e anima se `onSend` aceitar o envio (devolver booleano).
  4. Teste: duas mensagens em 300 ms viram duas linhas, na ordem, com um único toque do botão cada.
- Arquivos: `src/components/inbox/chat/useChatPanelHandlers.ts`, `useChatInputLogic.ts`, `src/hooks/inbox/useRealtimeInbox.ts`, `src/services/outbound-message.service.ts`, testes.
- Decisão a tomar pelo Claude: trocar "erro imediato no toast" por "falha vira banner" altera a semântica de PH-03/EV1. Coordenar: PH-03, PH-04, PH-28 e R2 mexem no mesmo trecho.

**N2. Nova conversa com contato existente envia pela conexão errada (`connections[0]`).** Perfil: hugo (+ iris no rótulo).
- Evidência V2: `useNewConversation.ts:41-48` seleciona a primeira conexão `connected` como padrão e `:112-115` passa `whatsappConnectionId: selectedConnection` SEMPRE, também para contato escolhido na busca. A busca (`:63-67`) não traz `whatsapp_connection_id`. No RPC, o parâmetro explícito vence a conexão atribuída ao contato (`20260930200000_enforce_enqueue_connection_scope.sql:62-69`) e o claim usa `messages.whatsapp_connection_id` (`20260909270000...:54-58`). O seletor só aparece com mais de uma conexão (`NewConversationModal.tsx:53`): o usuário que não mexe nele manda pelo número da primeira conexão, mesmo que o contato pertença à outra. O banco real tem 2 conexões (nota de 30/09 nas migrations), então o caso é real. A resposta do cliente cai noutra instância (contato duplicado ou conversa partida) e, para agente fora da fila da conexão, a RPC recusa com `whatsapp_connection_out_of_scope`, que o usuário vê só como "Erro ao enviar mensagem".
- V3: mesmo problema (`useNewConversation.ts:152-171`), portanto não é regressão de paridade; é melhoria.
- Implementar: incluir `whatsapp_connection_id` na busca; ao selecionar contato, pré-selecionar a conexão dele (se `connected`) e mostrar "via <nome da conexão>"; só enviar `whatsappConnectionId` explícito quando o usuário trocou o seletor ou o contato é novo; se não houver conexão `connected`, avisar antes de criar o contato (complementa PD-83, que já pede "não deixar contato órfão"). Mapear `whatsapp_connection_out_of_scope` e `no_connected_whatsapp_connection` para frase própria (junto de EV1).
- Arquivos: `src/hooks/chat/useNewConversation.ts`, `src/components/inbox/NewConversationModal.tsx`, `src/hooks/chat/__tests__/useNewConversation.test.tsx`.

**N3. O banner "Enviar de novo" age sobre qualquer falha carregada, de qualquer autor e de qualquer data.** Perfil: iris (+ workersql para a janela na RPC de R1).
- Evidência V2: `SendErrorBanner.tsx:73-79` considera todas as mensagens `sender='agent' && status='failed'` do array (sem filtrar por `agent_id` e sem idade) e `reenviar()` (`:111-125`) manda o texto da ÚLTIMA como mensagem NOVA. Depois que PD-78 varrer as ~153 linhas `sending` presas para `failed`, e quando R1/R2 trocarem o botão por "Tentar agora" (R1: "quem tem acesso à conversa" e sem limite de idade), qualquer atendente que abrir uma conversa antiga verá o banner e poderá disparar ao cliente um texto de outro atendente escrito há dias ou semanas.
- Implementar: o banner e o resumo `ConversationDeliverySummary` só contam falhas do usuário logado nas últimas 24 h (configurável); falhas antigas ou de outro autor aparecem apenas no histórico de envio, sem botão de um clique (com confirmação "Esta mensagem é de <nome>, de <data>. Reenviar?"). Em R1, recusar re-fila de mensagem com mais de N dias (erro claro) sem permissão de supervisor.
- Arquivos: `src/components/inbox/chat/SendErrorBanner.tsx`, `ConversationDeliverySummary.tsx`, `messageSendTimeline.ts`, migration de R1 (cartão ainda `todo`), testes.
- Cobertura parcial: C2 (done) e R1/R2 (todo) não fecham esse ponto.

**N4. Prévia de link das mensagens ENVIADAS nunca é gerada (código morto) e o LK1 parte de premissa errada.** Perfil: hugo.
- Evidência V2: `chat.service.ts:11-27,94-96` define `enrichLinkPreview` e só `ChatService.sendMessage` a chama; `ChatService.sendMessage` não tem NENHUM chamador (grep em `src/`: só o comentário de `useRealtimeInbox.ts:177` o menciona). O texto do inbox sai por `messageSender.ts` → `sendOutboundMessage` direto. `fetch-link-preview` só é invocada nesse arquivo. O webhook grava `link_preview` apenas de mensagem RECEBIDA (`evolution-webhook-messages.ts:282`). O cartão LK1 diz "link_preview só é gravado no envio (chat.service.ts ~l.94)": está errado hoje, e seu passo 3 só prevê prévia no cliente para mensagens RECEBIDAS.
- Implementar: (a) no `handleSendMessage` do inbox, depois do enqueue com sucesso e se `messageType==='text'` com URL, chamar `enrichLinkPreview(result.id, content)` em segundo plano (com `catch`), ou (b) mover o enriquecimento para o próprio Edge/RPC após o `complete`; (c) apagar `ChatService.sendMessage` e `markAsRead` (mortos) ou ligá-los. Ajustar LK1 para cobrir enviadas e recebidas.
- Cuidado: o `UPDATE messages SET link_preview` direto do cliente depende da política de colunas de PD-64 (se `link_preview` ficar fora da lista de colunas liberadas, passa a falhar); preferir RPC `set_message_link_preview` restrita ao autor.
- Arquivos: `src/services/chat.service.ts`, `src/hooks/inbox/useRealtimeInbox.ts`, `src/components/inbox/chat/MessageBubble.tsx`, testes de `chat.service`.

**N5. Áudio gravado: cada retentativa sobe um arquivo novo e cria uma mensagem nova (pode duplicar a nota de voz).** Perfil: hugo.
- Evidência V2: `useRealtimeInbox.ts:183-201` chama `ChatService.uploadAudio` (`chat.service.ts:111-128`, nome `${contactId}/${Date.now()}.webm`) e depois `sendMessage(..., 'audio', url)`. A cada tentativa o locator muda, então a `actionKey` (`outbound-message.service.ts:74-84`) muda e nasce outro `client_message_id`. Se o primeiro despacho teve resposta perdida ou 502 ambíguo (POST já saiu), o gravador continua aberto (R2-INB-022) e o "Enviar" de novo entrega um SEGUNDO áudio ao cliente. O caminho de arquivos já resolve isso (`useFileUploadLogic.ts:58-64,152-182`: `pendingUploadsRef` mantém objeto e id lógico); o áudio não. Sobra também objeto órfão quando o enqueue falha.
- V3: o gravador tem retentativa com backoff e "Tentar agora" (`useAudioRecorderUI.ts:186-226`), com os mesmos riscos, mas lá o dedupe era por fingerprint de 1 min no proxy.
- Implementar: guardar por gravação (hash do blob ou id da gravação) `{storagePath, clientMessageId}` até a entrega confirmar; reutilizar nas retentativas; remover o objeto só quando a reconciliação por `client_message_id` provar que não há linha (mesma regra de `outboundRowExists`). Estender o mesmo tratamento a `TextToAudioButton` e `VoiceChangerPicker`, se usarem `onSendAudio`.
- Arquivos: `src/hooks/inbox/useRealtimeInbox.ts`, `src/services/chat.service.ts`, testes `handlers-audio-contrato-retorno-350a.test.tsx` (ajustar), novo teste de idempotência.
- Cobertura parcial: PD-94 trata nome e tipo do arquivo ("sem reuso/limpeza") mas seus passos não incluem a chave estável de envio.

**N6. Buckets `whatsapp-media` e `audio-messages` sem limite de tamanho nem lista de tipos no servidor.** Perfil: workersql (+ hugo para alinhar a mensagem do cliente).
- Evidência V2: criação em `20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql:6,16` sem `file_size_limit` nem `allowed_mime_types`; nenhuma migration posterior os define para esses dois (só `team-chat-files`, em `20260902100002_mime_restrictions_team_chat_files.sql`, e `avatars`/`custom-emojis`). O upload é direto do navegador (`useFileUploadLogic.ts:128-145`, `chat.service.ts:111-128`), e a única validação (tipo e tamanho: `utils/whatsappFileTypes.ts`) é do cliente. Qualquer sessão autenticada com acesso ao contato grava qualquer tipo e tamanho; o Edge `message-delivery` depois assina e entrega a URL ao provedor (hosts: PD-94).
- V3: o `secure-upload` fazia verificação de magic bytes contra spoofing e teto de 50 MB (`secure-upload/index.ts:20-60,142-175`). O VirusTotal é decisão DE5 (não portar), mas o limite local de tamanho e tipo não sai do sistema e não foi carteado.
- Implementar: migration aditiva `UPDATE storage.buckets SET file_size_limit = 104857600 (100 MB, maior limite da tabela do WhatsApp) , allowed_mime_types = <lista de whatsappFileTypes + audio/webm, audio/ogg, audio/mp4, image/gif se for aceito>` para os dois buckets, com `-- Rollback:`; ler ANTES a configuração real (pode já ter sido ajustada pelo painel); mensagem de erro do cliente para "arquivo recusado pelo servidor". Opcional (P2): checar magic bytes no `message-delivery` antes do POST quando `media_url` for do Storage.
- Arquivos: `supabase/migrations/<ts>_media_bucket_limits.sql`, `supabase/tests/`, `src/components/inbox/useFileUploadLogic.ts` (mapear erro), `src/utils/whatsappFileTypes.ts` (fonte única da lista).
- Não verificado: a configuração real dos buckets no banco.

### P2

**N7. Barra de progresso do upload do `FileUploader` é código morto; falhas de arquivos em fila somem em 1 s.** Perfil: iris (+ hugo).
- Evidência V2: `useFileUploadLogic.ts:103-104` declara `uploadProgress` e `uploadStage` que NINGUÉM atualiza (`setUploadProgress`/`setUploadStage` não têm uso), mas `FileUploader.tsx:193-195` e `:221` desenham "Fazendo upload... 0%". No envio de um arquivo só, o diálogo fecha antes (`:218-220` `handleClose()`) e sobra o toast "Enviando arquivo..." com `duration: 30000`, que some em 30 s mesmo que o upload de 100 MB continue. Na fila múltipla, `handleSendAllFiles` fecha tudo 1 s depois do fim (`:255-256`); os arquivos com `status:'error'` se perdem e o usuário precisa escolhê-los de novo.
- V3: progresso por estágio 15, 70, 100 (`useFileUploadLogic.ts:160-165`) e `onRetry` na toast.
- Implementar: progresso real com `XMLHttpRequest`/`fetch` com `ReadableStream` ou, sem dependência nova, estados indeterminados com `aria-busy` + percentual por estágio; toast `loading` até terminar (sem prazo fixo); manter o diálogo aberto com os arquivos que falharam e botão "Tentar de novo" por arquivo. Remover os estados mortos se preferir não implementar.
- Arquivos: `src/components/inbox/useFileUploadLogic.ts`, `FileUploader.tsx`, testes `useFileUploadLogic.test.tsx`.

**N8. Falha de upload ao AGENDAR com anexo é silenciosa.** Perfil: iris.
- Evidência V2: `ChatPanel.tsx:379-405`: `uploadError` / falta de `publicUrl` lançam, o `catch` só faz `log.error` e `removeStoredObjectBestEffort` (`:399-403`); NÃO há toast nem erro no diálogo (o hook `useScheduledMessages.ts:133-136` só avisa falha da MUTAÇÃO). O diálogo fica aberto sem explicação. A V3 avisava (`useScheduledMediaUpload.ts:36-45`).
- Implementar: toast destrutivo com o nome do arquivo e motivo; relançar para o diálogo manter o botão habilitado. Pode entrar em PH-23 (que mexe no mesmo trecho).
- Arquivos: `src/components/inbox/ChatPanel.tsx` (só `handleScheduleMessage`), teste `ChatPanel.scheduled-media.test.tsx`.

**N9. Responder (citar) junto de mídia ou áudio descarta a citação.** Perfil: hugo.
- Evidência V2: o Edge cita qualquer tipo (`providerPayload`, `quoted` em `message-delivery/index.ts:337,343-358`), mas `useFileUploadLogic.sendFileViaApi` (`:183-190`) e `handleSendAudio` (`useRealtimeInbox.ts:183-190`) não recebem `replyToId`; só o texto passa (`useChatPanelHandlers.ts:342`). A barra de resposta continua ativa durante o anexo, e o cliente recebe a mídia sem a citação. Melhoria (a V3 também não citava mídia).
- Implementar: passar `replyToId` ao `FileUploader`/`handleSendAudio`; limpar a barra de resposta só após o envio confirmar; teste.

**N10. Fila offline: várias abas drenam a mesma fila ao mesmo tempo.** Perfil: hugo.
- Evidência V2: `offlineSendQueue` é um driver IndexedDB COMPARTILHADO entre abas, mas a trava de "uma drenagem por vez" é por aba (`offlineQueue.ts:215-217`) e `deliverQueuedOfflineMessage` (`outbound-message.service.ts:129-146`) NÃO passa por `crossTabSendDedupe`. Duas abas ao voltar o `online` entregam a mesma mensagem; a segunda recebe 409/idempotente do Edge, vai ao `onError` e INTERROMPE a sua drenagem (`:223-228`), deixando os itens seguintes para a outra aba ou para o próximo `online`. Funciona por causa da idempotência, mas é ruidoso e retarda.
- Implementar: `navigator.locks.request('zapp-offline-drain', …)` (com fallback atual) ao drenar; tratar `idempotent:true` como sucesso. Junto de PH-05.
- Arquivos: `src/lib/offlineQueue.ts`, `src/services/outbound-message.service.ts`, testes.

**N11. Código morto e órfão do caminho de envio.** Perfil: worker/hugo.
- `ChatService.sendMessage` e `ChatService.markAsRead` (sem chamador), `ChatQueueProgress` (`MessageSendHistorySheet.tsx:122-170`, exportado e nunca montado: o ChatPanel usa `ConversationDeliverySummary`), `hooks/chat/useMessageStatus.ts` (já em PD-94) e o export `export * from './useMessageStatus'` em `hooks/chat/index.ts:11`. Remover ou ligar; manter só um desenho da barra de entrega.
- Arquivos: `src/services/chat.service.ts`, `src/components/inbox/chat/MessageSendHistorySheet.tsx`, `src/hooks/chat/index.ts`.

**N12. Lacunas de teste do recorte além de PH-06/PD-95.** Perfil: workertestes.
- Sem teste direto: `useChatMediaSending` figurinha/emoji (só `audio-meme-falha.test.ts`), `RealtimeService.markMessagesAsRead`, `useMessageSignature` (PH-38 cita), caminho `handleSendAudio` com retentativa (N5), cenários N1 (duas mensagens seguidas) e N2 (conexão do contato existente), fila offline com duas abas (N10). `message-delivery` não tem teste de handler (PH-06 cobre).
- Observação: o Edge usa `createClient` de `esm.sh` dentro do handler, o que impede injeção; PH-06 já prevê extrair as dependências.

## 3. Complementos a cartões existentes (cobertura parcial)

- **LK1 (links no balão):** corrigir a premissa e incluir prévia de ENVIADAS (N4).
- **PD-94 (áudio, host de mídia, rate limit):** acrescentar a chave estável por gravação (N5) e a nota de que a mensagem de erro do bucket deve ser clara (N6).
- **R1/R2 (re-fila e "Tentar agora"):** limitar por idade e exigir confirmação para falha de outro autor (N3); o limite de 3 reenvios ainda deixa reenviar texto de semanas atrás.
- **PD-83 (nova conversa):** incluir a conexão do contato existente e a checagem de conexão ativa antes de criar o contato (N2).
- **PH-03/EV1 (erros de envio):** a lista de códigos do RPC que hoje viram "Erro ao enviar": `send_messages_permission_required`, `whatsapp_connection_out_of_scope`, `selected_whatsapp_connection_unavailable`, `no_connected_whatsapp_connection`, `message_contact_not_authorized`, `invalid_outbound_message`, `client_message_id_reused_with_different_payload` (`20260930200000_enforce_enqueue_connection_scope.sql`). Nenhum deles tem tradução no cliente (grep em `src/`: zero ocorrências).

## 4. Onde a V2 é melhor (não portar)

- Envio atômico no servidor (enqueue com `UNIQUE (contact_id, client_message_id)`, claim com lease e token, `complete/fail` fenced, reconciliação somente leitura IA-047, `mark_first_response` best-effort), sem a janela "linha gravada e envio não feito" da V3 e sem `sent_unverified`.
- Throttle que adia em vez de descartar (a V3 devolve `undefined`), dedupe entre abas, fila offline em IndexedDB com ordem de composição e idempotência.
- Mensagens ricas (enquete, contato, botões, lista) pela mesma fila e com validação no Edge; a V3 gravava texto simulado.
- Sem fallback silencioso para outro número; escopo de fila por conexão (L7) e permissão `send_messages` impostos no banco (L9).
- Auditoria por RPC (`log_audit_event`) em vez de INSERT direto em `audit_logs`; gamificação por trigger que não derruba o envio.
- Agendamento com anexo em caminho durável `<contact_id>/…` e limpeza do objeto órfão.
- Texto original preservado no "Desfazer" e na retentativa (assinatura aplicada só no payload): `useChatPanelHandlers.ts:313-332`.

## 5. Melhorias possíveis (dentro das regras do dono)

- Robustez: N1 (fila serial por contato), N5 (idempotência do áudio), N10 (`navigator.locks`).
- Desempenho: tirar o `refetch()` da lista inteira do caminho de cada envio (N1.2).
- Acessibilidade: anunciar com `aria-live="polite"` "Enviando…" e "Mensagem enviada" no compositor quando o envio deixar de bloquear (hoje só toast); botão Enviar com `aria-busy` durante o despacho.
- Observabilidade: registrar no cliente a latência do enqueue e do despacho e a taxa de falha por tipo (`errorReporter`/`log_audit_event`, sem conteúdo nem telefone) para alimentar M6; a V3 tinha `[INBOX_METRIC]`.
- UX: N2 (mostrar "via <conexão>" na nova conversa), N7 (progresso e retentativa de arquivo), N9 (citar mídia).

## 6. O que NÃO consegui verificar

- **Banco real:** configuração atual de `file_size_limit`/`allowed_mime_types` dos buckets `whatsapp-media` e `audio-messages` (N6); se as colunas `error_reason/retry_attempt` existem (os tipos gerados não as têm); quantas linhas `failed` antigas existem (N3); número real de conexões `connected` e vínculos em `whatsapp_connection_queues` (N2).
- **Runtime:** quanto tempo dura o ciclo RPC + Edge + 2 refetch em produção (N1); se o INSERT Realtime chega antes do fim do despacho; se `FunctionsHttpError.context` traz corpo útil nos 502 (o Edge mascara `>=500` em `errorResponse`); se o Enter é de fato ignorado no navegador (li o código, não executei).
- **Cartões `done` não integrados:** a cópia `.integrador` não os tem (ex.: AG2, AX1, M2 estão `done`); se algum já resolve N3, N7 ou N8, o cartão novo deve ser fechado como "já resolvido" com prova.
- **Código morto na V3:** confirmei por grep que `useSendThrottle` e `sendExternalPtv` não têm consumidor, mas não cobri `src/` inteiro por importações dinâmicas.
- O resto do pacote de upload (`secure-upload`, `file-security-scanner`, VirusTotal) NÃO foi avaliado como lacuna por causa de DE5.
