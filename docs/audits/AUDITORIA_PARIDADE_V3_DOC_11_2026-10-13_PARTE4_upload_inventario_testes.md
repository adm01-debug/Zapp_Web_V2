# Achados 4 — Upload, inventário M–Z completo, testes e acessibilidade/mobile/i18n/tema (2ª passada do doc 11) — 13/10/2026

Somente leitura. V3 lida por `git show origin/main:` (e extraída para a pasta temporária só para varrer importadores); V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador`. Prefixos: V3 `src/features/inbox/components/` (abreviado `V3:`), V2 `src/components/inbox/` (abreviado `V2:`).
Siglas: EQ = equivalente; MV2 = MELHOR_NA_V2; LAC = lacuna; DEC = decisão; MORTO = código sem consumidor na V3 (conferi importadores, descontando barris `index.ts`).
Os relatórios irmãos `achados_1`, `achados_2` e `achados_3` desta pasta já classificaram os 57 arquivos do doc 11; aqui eu os cito e só acrescento o que eles não cobrem (arquivos que o doc não lista, subpastas, upload, testes, transversais).

Resumo executivo
- Upload: a V2 é melhor que a V3 em quase tudo (caminho por contato, nome saneado, idempotência com reconciliação de órfão, múltiplos arquivos no input). O que falta já tem cartão: limites e tipos no servidor (PK-26), progresso e falha visível (PK-27), fechar só após sucesso (AX1), testes de utilitários (PE-25). Antivírus/VirusTotal é decisão DE5 (não portar). Achei 3 complementos pequenos (U4, U5, U8) e um e2e inexistente (U7).
- Inventário: 186 arquivos M–Z (140 de código, 1 mock, 45 de teste). 62 dos 141 de código/mock não têm arquivo de mesmo nome na V2; quase todos têm equivalente funcional (inline, outra pasta, aba Arquivos, Tarefas) ou cartão. Cerca de 10 são código morto na V3 (sem consumidor além do barril). Nenhum P0 novo; os ausentes mais relevantes já estão decididos: painel de status de entrega por mensagem (descartado em 12/10) e escopo `inbox.view_*` (aguarda decisão do dono).
- Testes: a V3 tem 45 arquivos de teste neste recorte. Uma parte é espelho (`p0-regressions`) ou testa código morto (`scrollLoaderController`, `useInputValueStore`, `MessageReadStatus`, `prompt-kit`): não portar. Os comportamentos reais que a V2 não testa estão em U7.
- Acessibilidade transversal: achados novos e verificados no código atual da V2: ações que só aparecem em `hover` (21 pontos no inbox, inalcançáveis por teclado e toque, U1), documento/vídeo do balão sem teclado e `VideoFullscreen` sem `Esc`/diálogo (U2), figurinhas pessoais com botões aninhados (complemento de QS4).

---

## 1. Upload de arquivos — `useFileUploadLogic`, `useFileUploadLogicTypes`, Edge `secure-upload`

Arquivos lidos por inteiro: `V3:useFileUploadLogic.ts` (455 l.), `V3:useFileUploadLogicTypes.ts`, `supabase/functions/secure-upload/index.ts` (308 l.), `src/lib/scanResponse.ts`, `src/hooks/useScanResponseHandler.ts`, `src/utils/whatsappFileTypes.ts`, `src/utils/imageCompression.ts`, `V3:FileUploader.tsx`; V2 `useFileUploadLogic.ts` (318 l.), `FileUploader.tsx` (247 l.), `src/lib/storage_object_upload.ts`, `src/utils/whatsappFileTypes.ts`, `src/utils/imageCompression.ts` (idênticos aos da V3 exceto comentários e `getFileExtensionWithDefault`).

| # | Comportamento | Classe | Evidência V3 | Evidência V2 | Cartão |
|---|---|---|---|---|---|
| 1 | Fila multi-arquivo (máx. 10, ordem imagem>vídeo>áudio>documento>sticker, aviso "Limite de 10") | EQ | `useFileUploadLogicTypes.ts:26-35`, `useFileUploadLogic.ts:70-94,365-388` | `useFileUploadLogic.ts:43-44,113-123,275-287` | — |
| 2 | Input `multiple` aproveita todos os arquivos | MV2 | V3 só `files[0]` quando há diálogo (`:403`) | `:289-297` (R2-INB-011) | já feito |
| 3 | Compressão de imagem antes do upload (não-GIF), falha não bloqueia | EQ | `:96-111` | `:128-137` | — |
| 4 | Caminho do objeto | MV2 | `secure/<uuid>.<ext>` no servidor (`secure-upload/index.ts:247-250`) | `<contactId>/<uuid>-<nome saneado>` (`:138-142`; `storage_object_upload.ts:35-47`); `upsert:false` | — |
| 5 | URL guardada na mensagem | MV2 | URL assinada de 1 h (`secure-upload/index.ts:274-276`) vira `media_url`: expira | locator durável resolvido na leitura (`:147-152`) | — |
| 6 | Idempotência do reenvio e limpeza de objeto órfão | MV2 | inexistente | `outboundRowExists` + `pendingUploadsRef` (`:52-65,106-109,166-204`) | R2-INB-006 (feito) |
| 7 | Retry com `onRetry` na toast quando o varredor falha | DEC | `:235-262,291-303` + `useScanResponseHandler.ts:60-84` | n/a (sem varredor) | DE5 (VirusTotal não portar: regra "nada sai do sistema") |
| 8 | `ScanBlockedError`, `parseScanInvocation`, códigos MALWARE/SUSPICIOUS/TIMEOUT… | DEC | `scanResponse.ts` | n/a; quarentena manual existe (`QuarantinePanel`) | DE5 |
| 9 | Limite de 50 MB e tipos permitidos no servidor | LAC (parcial) | `secure-upload/index.ts:18,123-148` | nenhum limite nem `allowed_mime_types` em `whatsapp-media`/`audio-messages` (migrations: só `team-chat-files` tem) | **PK-26** (`t_4d6e43dc`) |
| 10 | Conferência de magic bytes contra MIME falso | LAC (opcional) | `secure-upload/index.ts:20-60,157-179` | só `validateFile` por MIME ou extensão (`whatsappFileTypes.ts:105-137`): extensão `.pdf` com MIME estranho passa | PK-26 cita "opcional P2 no message-delivery"; ver **U8** |
| 11 | Limite por usuário (10 uploads/min) | DEC | `secure-upload/index.ts:99-107` | upload direto ao Storage, sem throttle próprio | sem cartão; não recomendo (a fila já espaça 500 ms; infraestrutura de Storage limita) |
| 12 | Barra de progresso 15→70→100 e estágio | LAC | `useFileUploadLogic.ts:159-163,241` | `uploadProgress`/`uploadStage` declarados e nunca atualizados (`:103-104`); `FileUploader.tsx` desenha "Fazendo upload… 0%" | **PK-27** (`t_d50c6f5f`) |
| 13 | Diálogo/anexo só some após sucesso; falha mantém e permite tentar de novo; limpeza das prévias no desmonte | LAC | V3 também fecha antes (`:233`), então não é paridade, é correção | `handleClose()` antes do envio (`:216`), `setTimeout(handleClose,1000)` na fila (`:261`), sem cleanup de `revokeObjectURL` no desmonte | **AX1** (`t_f4ba22de`) |
| 14 | `showDialog=false` (anexo inline no compositor, `onFileSelect` por arquivo) | DEC/outro doc | `:44,349-362,367-375,394-402`; teste `FileUploader.attachClip.test.tsx` | V2 sempre abre o diálogo; compositor de anexo inline é assunto do doc 08 | PO1/PO2 (colar arquivo), PE-63 cita `attachClip` sem par |
| 15 | Categoria `sticker` | LAC pré-existente nos dois | `whatsappFileTypes.ts:60-66` (webp cai antes em "imagem") | idem | PE-25 (`t_32326ab7`) registra |
| 16 | Fila: motivo da falha / do arquivo inválido visível | LAC | V3 também não mostra (`FileUploader.tsx` só `.error` do modo único, :316) | `QueuedFile.error` é gravado (`useFileUploadLogic.ts:240`) e nunca renderizado; item inválido mostra só o selo "Inválido" (`FileUploader.tsx:70-78`) | PK-27 item 2 ("falhas ficam na lista") cobre parte; ver **U4** |
| 17 | Fechar o diálogo (Esc ou clique fora) durante o envio da fila | LAC (nos dois) | `FileUploader.tsx:225` `onOpenChange={logic.handleClose}` | `FileUploader.tsx:129` `onOpenChange={handleClose}`: botões Cancelar/X ficam `disabled` com `uploading`, mas Esc e clique fora chamam `handleClose`; o laço de `handleSendAllFiles` (`:245-262`) segue com cópia antiga da fila e o usuário perde a tela | **U4** |
| 18 | Formatos e tamanhos | EQ | imagem/vídeo/áudio 16 MB, documento 100 MB, sticker 0,5 MB | idem (`whatsappFileTypes.ts:12-70`) | — |
| 19 | Texto em inglês na interface do diálogo | LAC | `title="PDF Preview"` (`V3:FileUploader.tsx:259`) | `alt="Preview"` (`FileUploader.tsx:64,160`), `title="PDF Preview"` (`:153`) | **U5** |

Armadilhas da V3 que NÃO devem ser copiadas se o cartão PK-26/U8 criar verificação de conteúdo (tabela `MAGIC_SIGNATURES`, `secure-upload/index.ts:22-41,161`):
- `ftyp` no offset 4 é sempre devolvido como `video/mp4`: um `.m4a` (`audio/mp4`) ou `.3gp` (`video/3gpp`), formatos que o próprio `validateFile` aceita, seria bloqueado como "tipo não corresponde ao conteúdo". É preciso ler a marca (`M4A `, `3gp4/3gp5`, `isom/mp42`).
- `1A 45 DF A3` (EBML) vale tanto para `video/webm` quanto `audio/webm` (voz gravada no navegador).
- Formatos sem assinatura na tabela (docx/xlsx/pptx são ZIP; txt, csv, amr, aac) passam sem verificação; só detectado-e-diferente bloqueia, então a proteção é parcial por desenho.
- `RATE_LIMIT_EXCEEDED` não existe no `ScanCode` do cliente (`scanResponse.ts:21-32`), então vira `UNKNOWN` e a mensagem genérica.
- A Edge devolve URL assinada de 1 h, que a V3 grava em `messages.media_url` (expira).
- Formatos que o usuário de iPhone envia (HEIC, `video/quicktime`) são recusados na V2 e na V3 por `validateFile`; coerente com a API do WhatsApp (só `mp4/3gpp` e `jpeg/png/webp`), então NÃO é lacuna de paridade; registro como observação.

O que a V2 precisa que o Claude confira no banco (não tenho acesso): `storage.buckets` de `whatsapp-media` e `audio-messages` (`file_size_limit`, `allowed_mime_types`, público ou privado) e as políticas de `storage.objects` (PD-87 já trata `INSERT` por visibilidade de contato).

---

## 2. Inventário completo M–Z da V3 (`git ls-tree origin/main src/features/inbox/components` e subpastas)

Critério de inclusão: nome de arquivo começando de M a Z (maiúscula ou minúscula, por exemplo `useFileUploadLogic.ts`), incluindo subpastas, testes e mocks. Total: 186 arquivos (141 de código/mock + 45 de teste). O doc 11 de agosto lista 57; os outros 129 (marcados `*` quando não estão no doc) estão aqui.
Importadores contados por varredura em `src/` da V3 (sem testes e sem `index.ts`).

### 2.1 Raiz

| Arquivo V3 (M–Z) | Equivalente na V2 | Classe | Cartão / observação |
|---|---|---|---|
| MediaGallery.tsx | ausente por nome; `tabs/FilesTab.tsx` + `FilesListView/FilesTableView/FileCard/FilesToolbar…` | MV2 / DEC | V3 vivo em `contact-details/ContactAccordionSections.tsx`; a V2 trocou a galeria pela aba Arquivos (colunas, seleção, filtros); V3 permite baixar, regra "nada sai" |
| MediaPreview.tsx | `MediaPreview.tsx` | EQ + LAC a11y | **U2**; MR2, PE-53 |
| MessageBatcherIndicator.tsx | ausente (o hook `hooks/realtime/useMessageUpdateBatcher.ts` existe, sem chip) | DEC | chip de depuração; achados_3 |
| MessageContextActions.tsx | `MessageContextActions.tsx` | EQ | PE-60 (nome), PE-20/21; **U1** (botão `opacity-0 group-hover`, `:142-145`) |
| MessageContextMenu.tsx | ausente; `AdvancedMessageMenu.tsx` | MORTO na V3 (só barril) | descartar |
| MessagePreview.tsx | `MessagePreview.tsx` (179 l.) | EQ | PE-63 (sem teste) |
| MessageReactions.tsx | `MessageReactions.tsx` (284 l. vs 139) | MV2 | PE-60 (`:253`), PE-63 (telemetria), UK-04 (versão `ui/`); **U1** (`:131,225`) |
| MessageStatus.tsx | `MessageStatus.tsx` | EQ | VC1 (vocabulário), SL3; achados_1 |
| MessageTemplates.tsx | `MessageTemplates.tsx` | EQ | PE-60 (`:81`), PE-63, TM1; **U1** (`:119`) |
| NewConversationModal.tsx | `NewConversationModal.tsx` | EQ/MV2 | achados_1 L6 |
| NewMessageIndicator.tsx | `NewMessageIndicator.tsx` | EQ | achados_3 |
| NextBestActionEngine.tsx | `NextBestActionEngine.tsx` (64 l. vs 245) | EQ/DEC | NB1 (não integrar), PE-62, PH-43; achados_2 |
| ObjectionDetector.tsx | `ObjectionDetector.tsx` | EQ/MV2 | AY1; achados_2 |
| PrivateNotes.tsx | ausente por nome; `tabs/NotesTab.tsx` + `collaboration/InternalNotesPanel.tsx` | MV2 (categorias, pendências) + LAC erro de leitura | achados_1 L4/L10 |
| QueuePositionNotifier.tsx | `QueuePositionNotifier.tsx` | MORTO nos dois | achados_3 L4 |
| QuickRepliesManager.tsx | `QuickRepliesManager.tsx` | EQ | PD-43, QR1; r2-inb-063 |
| RealtimeCollaboration.tsx | `RealtimeCollaboration.tsx` | EQ + LAC (falso sucesso) | achados_1 L1 (sem cartão ainda) |
| RealtimeInboxView.tsx | `RealtimeInboxView.tsx` | EQ/MV2 | CL1, DL1, EB1, PH-xx; achados_3 |
| RealtimeTranscription.tsx | `RealtimeTranscription.tsx` | EQ | PE-63 (teste); achados_2 |
| RemindersPanel.tsx | ausente | DEC (fusão com Tarefas) | F2 (`t_f025e4be`) |
| ReplyQuote.tsx | `ReplyQuote.tsx` | MV2 | **U5** (`alt="Preview"`, `:68`) |
| SLAIndicator.tsx | `SLAIndicator.tsx` | MV2 | SL1/SL2/CQ1 |
| SLAIndicatorForContact.tsx | ausente; `hooks/sla/useApplicableSLA.ts` usado em `ChatPanelHeader` e na lista | EQ parcial | tooltip com a regra que casou = QC1 (`t_89bc66bd`) |
| ScheduleMessageDialog.tsx | `ScheduleMessageDialog.tsx` | MV2 | AG1/AG4/PH-23 |
| ScheduleMessageDialog.utils.ts | ausente por nome; `lib/localDay.ts` `localInstantFromDayAndTime` | EQ | sem teste direto (U7) |
| SentimentIndicator.tsx | `SentimentIndicator.tsx` (órfão) | EQ órfão | achados_1 L2/L3 |
| SlashCommands.tsx | `SlashCommands.tsx` | EQ | SC1; achados_3 L1/L8 |
| SpeedSelector.tsx | `SpeedSelector.tsx` | EQ | achados_2 |
| StickerPicker.tsx | `StickerPicker.tsx` | MV2 | DG1, SK1, QS3 |
| SwipeableListItem.tsx | `SwipeableListItem.tsx` | MORTO nos dois | achados_3 L5 |
| TeamFiles.tsx | ausente; `hooks/team-chat/useTeamFiles.ts` | DEC + cartão | TF1/TF2 (`t_20e4f4c4`) |
| TemplatesWithVariables.tsx | `TemplatesWithVariables.tsx` (não montado no chat) | EQ + LAC | TM1, PE-02; **U1** (`:101-103`) |
| TextToAudioButton.tsx | `TextToAudioButton.tsx` | MV2 | achados_2 |
| TextToSpeechButton.tsx | `TextToSpeechButton.tsx` | MV2 | **U1** (`:60`) |
| TicketHistorySheet.tsx | ausente; `tabs/JourneyTab.tsx` + `hooks/chat/useConversationHistoryTimeline.ts` | MV2 | TR1 |
| TicketTabs.tsx | `TicketTabs.tsx` (1 linha, reexporta `conversation-list/StatusChips`) | MV2 / DEC | achados_3 |
| TicketTabsFilters.tsx | ausente; `ContactTypeFilter.tsx` + `InboxFilters.tsx` | EQ parcial | escopo Meus/Departamento/Todos por `inbox.view_*`: sem cartão por falta de decisão do dono (plano PK, §3) |
| TranscriptionStatusBadge.tsx | ausente; embutido em `AudioMessagePlayer.tsx:100-184` (já tem "Tentar novamente") | EQ | achados_1 L7 (nome acessível) |
| TransferDialog.tsx | `TransferDialog.tsx` | MV2 | T1/T3/TR2/TR3 |
| TypingIndicator.tsx | `TypingIndicator.tsx` | EQ | achados_1 L8 |
| UniversityHelp.tsx | `UniversityHelp.tsx` | MV2 | AY1 |
| VideoFullscreen.tsx | `VideoFullscreen.tsx` | MV2 (volume global, portal) + LAC a11y | **U2** |
| VirtualMessageBubble.tsx | ausente | MORTO na V3 | descartar |
| VirtualizedRealtimeList.tsx | `VirtualizedRealtimeList.tsx` (681 l. vs 352) | MV2 | BK3, KN1, LS1-LS2, QL3-6, PB-40/41/53 |
| VisualValidationChecklist.tsx | ausente | DEC (ferramenta de QA, montada por diálogo de depuração) | achados_3 |
| VoiceChanger.tsx | `VoiceChanger.tsx` | EQ | VZ1, PE-60 (`:212`), PE-63, PE-66 |
| VoiceChangerPicker.tsx | `VoiceChangerPicker.tsx` | EQ | PE-60 (`:278,292`); achados_2 G7 |
| VoiceSelector.tsx | `VoiceSelector.tsx` | EQ | achados_2 G6 |
| WhisperAudioPlayer.tsx | ausente | DEC | achados_3; PE-65 |
| WhisperMode.tsx | `WhisperMode.tsx` (548 l. vs 261) | MV2 | PK-05/06, WM1, WH2 |
| useAudioMessagePlayer.ts | ausente por nome; embutido em `AudioMessagePlayer.tsx` | EQ (fila de conversão de voz = DEC) | achados_2 |
| useAudioRecorderUI.ts | ausente por nome; `AudioRecorder.tsx` | LAC (pausa, recuperar, reenvio com recuo) | PE-59; achados_2 |
| useFileUploadLogic.ts | `useFileUploadLogic.ts` | MV2 | ver seção 1 |
| useFileUploadLogicTypes.ts * | ausente; tipos e `MAX_FILES` inline no hook | EQ | — |
| useGlobalSearchData.ts | `useGlobalSearchData.ts` | MV2 | PE-99; achados_3 |
| useInboxKeyboardShortcuts.ts | ausente (a V3 usa `window.keydown` e ignora campos de texto) | LAC | QL4 (`t_2db51cf4`) |
| useInboxSidebarResize.ts | ausente | LAC | PE-61 |
| voiceChangerParts.tsx / objectionDetectorParts.tsx | ausentes; UI inline | DEC (separação de arquivo) | achados_2 |
| swipeActions.ts | `swipeActions.ts` | EQ (morto) | PE-04 (teste) |
| template-utils.ts | `template-utils.ts` | EQ | PE-04; achados_3 (variáveis falsas) |

### 2.2 `ai-tools/`, `summary/`, `templates/`, `quick-replies/`, `slash-commands/`, `stickers/`, `collaboration/`, `interactive-builder/`, `location-picker/`, `media-gallery/`

| Arquivo V3 | Equivalente V2 | Classe | Cartão / observação |
|---|---|---|---|
| ai-tools/PeriodFilterSelector.tsx, SentimentTab.tsx, SummaryTab.tsx, ToneSelector.tsx, ToolPanel.tsx, VisionIcon.tsx, useAnalysisTts.ts * | todos existem em `ai-tools/` | EQ | AY1, QA4-6, PE-03; SentimentTab tem `rgb()` literal (U6) |
| summary/SummaryResult.tsx *, useSummaryTts.ts * | `summary/` | EQ | PE-03 (nome nos botões de voz), PE-04 (teste) |
| templates/TemplateEditorDialog.tsx * | `templates/TemplateEditorDialog.tsx` | EQ | PE-02, PE-04 |
| quick-replies/QuickReplyCardList.tsx *, QuickReplyDialog.tsx * | `quick-replies/` | EQ | PD-43 (nome + confirmação), PE-04; **U1** (`:91`) |
| slash-commands/slashCommandsData.ts * | `slash-commands/slashCommandsData.ts` | EQ (sem `/note`, `/tag` de propósito) | SC1, QL8; achados_3 L8 |
| stickers/PersonalStickers.tsx, StickerCategoryBar.tsx, StickerGrid.tsx, StickerManager.tsx, StickerTypes.ts, StickerUploadPreview.tsx * | `stickers/` (+ `CategorySelector.tsx` só na V2) | EQ | QS1, QS4, SK1; ver "complemento a QS4" (seção 5) |
| stickers/stickerUpload.ts * | ausente (upload em `hooks/integrations/usePersonalStickers.ts`) | LAC | QS3 (`t_073c9671`), SK1 (validação PNG/WEBP/GIF ≤ 500 KB, rollback do objeto) |
| collaboration/MentionInput.tsx *, ViewersIndicator.tsx * | `collaboration/` | EQ | PK-17, PD-68/69; achados_1 L9 |
| interactive-builder/MessagePreview.tsx *, useInteractiveMessage.ts * | `interactive-builder/` | EQ | PE-63, RB2 |
| location-picker/useLocationPicker.ts * | `location-picker/useLocationPicker.ts` (351 l. vs 216) | MV2 | testes `LocationPicker.*` |
| media-gallery/MediaCard.tsx *, MediaGalleryListView.tsx * | ausentes (aba Arquivos) | MV2 / DEC | ver MediaGallery |
| media-gallery/MediaPreviewDialog.tsx *, mediaUtils.ts * | `media-gallery/` | MV2 (tipo da mensagem manda sobre a extensão, #309/R2-INB-012) | — |
| monitoring/QueueMetricsDashboard.tsx * | ausente (V2 tem `pages/queue-details/QueueMetricsCards.tsx`) | LAC já coberta | M1b, M6, A11Y1 (`ChatMonitoringDialog`) |

### 2.3 `chat/` e `chat/hooks/`

| Arquivo V3 | Equivalente V2 | Classe | Cartão / observação |
|---|---|---|---|
| chat/MarkdownPreview.tsx *, MentionAutocomplete.tsx *, RichTextToolbar.tsx *, SendErrorBanner.tsx *, MessageBubbleUnsupported.tsx *, MessageHoverToolbar.tsx *, MessageSendHistorySheet.tsx * | mesmo nome em `chat/` | EQ/MV2 | PO1, FM1, A11Y1, PK-23, C8b, M4/M5; **U1** (`MessageHoverToolbar.tsx:114`) |
| chat/MessageBubble.tsx * | `chat/MessageBubble.tsx` (421 l. vs 341) | MV2 + LAC (teclado) | BA1 (balão focável) |
| chat/messageBubbleParts.tsx * | inline no `MessageBubble.tsx` | EQ | — |
| chat/messageUtils.tsx * | `chat/messageUtils.tsx` | EQ + LAC | `MessageStatusIcon` sem nome acessível e sem `played`: complemento ao VC1; hex `#53bdeb` em `:52` (U6) |
| chat/messageStatusLanguage.ts * | ausente | LAC já coberta | VC1 (`t_b0bfb9af`) |
| chat/MessageReadStatus.tsx *, MessageStatusInline.tsx *, MessageStatusPanel.tsx *, MessageStatusTimestamps.tsx * | ausentes (V2 mostra só o ícone; `MessageSendHistorySheet` traz a linha do tempo de tentativas) | DEC (descartado em 12/10: "Parte 1 MessageReadStatus exige coluna inexistente"; "useDeliveryStats baixo valor") + SL3 (preferência de rótulo) | RECONCILIACAO_CARTOES (12/10), SL3 |
| chat/MessageDetailsDialog.tsx *, MessageAttemptsTimeline.tsx *, MessageStatusTimeline.tsx *, MessageStatusFilterBar.tsx * | ausentes | MORTO na V3 (só barril) | V2: `MessageSendHistorySheet` + `messageSendTimeline.ts` (MV2); filtro de falhas = FF1 |
| chat/TicketActionsBar.tsx * | `ChatHeaderToolbar.tsx` / `ChatPanelHeader.tsx` | EQ | T1, T3, A11Y1 |
| chat/hooks/useChatDialogs.ts * | `chat/dialogKeys.ts` + `ChatDialogs.tsx` + estado em `ChatPanel.tsx` | EQ | sem teste do estado (U7) |
| chat/hooks/useChatDragAndDrop.ts * | inline em `ChatPanel.tsx:407-420` (contador `dragCounterRef`) | EQ | sem teste (U7) |
| chat/hooks/useChatFilters.ts * | ausente | LAC já coberta | FF1 (`t_4ac2afcd`) |
| chat/hooks/useChatQuickReplyControl.ts * | ausente | LAC já coberta | QR1 (`t_12c4e41d`), PH-07 |
| chat/hooks/useChatScheduleMessage.ts * | inline em `ChatPanel.tsx` (anexo agendado por locator, sem limite de 7 dias) | MV2 | `ChatPanel.scheduled-media.test.tsx`; achados_3 ("mídia além de 7 dias" coberta) |
| chat/hooks/useChatSearchState.ts * | estado dentro de `ChatPanel.tsx`/`ChatSearchBar` | EQ | — |
| chat/hooks/useInitialHighlight.ts * | ausente | LAC já coberta | DL1 (`t_f89b8a0f`), DL2 |
| chat/hooks/useInputValueStore.ts * | ausente | MORTO na V3 (0 importadores) | IN1 (decisão de armazenamento do rascunho) |
| chat/hooks/useSLADelivery.ts * | ausente | LAC já coberta | PB-52, SD2, SD4 |
| chat/scrollLoaderController.ts * | ausente (`ChatMessagesArea` pagina) | MORTO na V3 | descartar |
| chat/snoozeDurations.ts * | `hooks/chat/snoozeDurations.ts` | MV2 | SN1 |
| chat/useAudioVoiceChange.ts * | embutido nos handlers de áudio | EQ | VZ1 |
| chat/useChatInputLogic.ts *, useChatPanelHandlers.ts * | mesmo nome em `chat/` | EQ/MV2 | muitos (ED1, EM1, IN1, JG1…) |
| chat/useInputHandlers.ts * | dentro de `useChatInputLogic.ts` + `SlashCommands` | EQ | SC1 |
| chat/useMessageReactionHandlers.ts * | dentro de `useChatPanelHandlers.ts` | EQ | FWD |
| chat/useProductHandlers.ts * | dentro de `useChatPanelHandlers.ts` (interativo e localização); produto vai pelo catálogo | EQ; clique em botão interativo é toast falso na V2 (`:644-646`) | IB1 (`t_c6abd763`) |

### 2.4 `contact-details/` e `conversation-list/`

| Arquivo V3 | Equivalente V2 | Classe | Cartão / observação |
|---|---|---|---|
| contact-details/SLAAndAITagsSection.tsx * | ausente | tags excluídas; parte SLA | QC* |
| contact-details/SLADeliveryConfigSection.tsx * | ausente | LAC já coberta | QC7 (`t_96594fbe`) |
| contact-details/SLATimelineSection.tsx *, sla-timeline/Milestone.tsx, SLATimelineFilters.tsx, types.ts * | ausentes; `lib/slaTimeline.ts` + `hooks/sla/useContactSlaTimeline.ts` | EQ parcial | QC2, SLT1 |
| contact-details/SharedMediaAccordionItem.tsx * | ausente (aba Arquivos) | MV2 | — |
| contact-details/StoryViewer.tsx *, WhatsAppStatusSection.tsx * | ausentes | LAC já coberta | WS1 (`t_20151931`), PS1 |
| conversation-list/RetryFailureBadge.tsx * | ausente | LAC já coberta | LS1 (`t_b69bb91b`) |
| conversation-list/TruncatedTooltip.tsx * | ausente | LAC já coberta | LS2 (`t_7b4012a1`) |
| conversation-list/useConversationDisplay.ts * | ausente (lógica dentro de `VirtualizedRealtimeList`) | EQ | digitando na lista = LS2/C2r |
| conversation-list/__mocks__/mockConversations.ts * | n/a | utilitário de teste | — |

### 2.5 Testes (45 arquivos) — ver seção 3.

---

## 3. Testes da V3 sobre esses componentes/hooks e o que a V2 não testa

Para cada arquivo: itens (`it`) | contrapartida na V2 | comportamento sem teste na V2 | decisão.

| Teste V3 | its | Contrapartida V2 | O que a V2 NÃO testa | Decisão / cartão |
|---|---|---|---|---|
| `__tests__/MessageReactions.telemetry` | 3 | `components/ui/__tests__/message-reactions.test.tsx` (outro componente) | dono único da telemetria ao reagir (sem duplicar o evento) | PE-63 |
| `__tests__/RealtimeCollaboration.handoff` | 6 | nenhuma (`HandoffDialog` sem teste, PE-04) | transferência com falha de RLS/0 linhas não pode virar sucesso; nota parcial | achados_1 L1 (cartão a criar, inclui o teste) |
| `__tests__/ScheduleMessageDialog.timezone` | 4 | `__tests__/ScheduleMessageDialog.test.tsx` (7) | rejeitar data inválida do calendário (`2026-02-31`, 25:00) direto em `localInstantFromDayAndTime`; `lib/__tests__/localDay.test.ts` não cobre essa função | U7 (P2) |
| `__tests__/TextToAudioButton.auth` | 2 | `__tests__/TextToAudioButton.preview-send.test.tsx` (4) + `edgeAuthHeaders` | cobertos | JÁ_COBERTO |
| `__tests__/TicketHistorySheet.audit-mapping` | 2 | `hooks/chat/__tests__/useConversationHistoryTimeline.*` (4 arquivos) | — | JÁ_COBERTO (V3 testa tabela migrada) |
| `__tests__/TicketTabs` | 3 | `__tests__/StatusChips.*` (3 arquivos) | escopo por permissão `inbox.view_*` | DEC (sem decisão do dono) |
| `__tests__/TransferDialog` | 6 | `__tests__/TransferDialog.test.tsx` (7) + `ChatTransferContract` | — | JÁ_COBERTO |
| `__tests__/swipeActions` | 39 | nenhuma | utilitário morto nos dois | PE-04 (ou apagar, achados_3 L5) |
| `__tests__/template-utils` | 35 | nenhuma | `replaceVariables`/`extractVariables` | PE-04 |
| `chat/__tests__/MessageReadStatus.strictmode` | 1 | n/a | componente descartado | IGNORAR |
| `chat/__tests__/media-retry` | 7 | nenhuma | 1 retry de avatar após ~800 ms, placeholder, StrictMode (V3 `MessageBubble.tsx:88-130`); o `AvatarFallback` do Radix já mostra iniciais, o retry é acabamento | P2, sem cartão; não recomendo criar |
| `chat/__tests__/messageStatusLanguage` | 31 | nenhuma (módulo não existe) | todos os estados e direções | VC1 (inclui testes) |
| `chat/__tests__/p0-regressions` | 66 | `groupWindow.test.ts`, `useChatPanelHandlers.sem-falso-sucesso`, outros | quase tudo é ESPELHO (reimplementa a lógica dentro do teste, com bloco "[REGRESSION] buggy" e "[FIXED]"); só o valor de `resolveContactRef` (JID de grupo) e `buildGroupInfo` com timestamp inválido são reais | JG1 (`resolveContactRef`); não portar o resto |
| `chat/__tests__/prompt-kit` | 17 | n/a (`PromptInput` não existe na V2) | — | IGNORAR |
| `chat/__tests__/scrollLoaderController` | 29 | n/a | código morto | IGNORAR |
| `chat/__tests__/snoozeDurations` | 5 | `hooks/chat/__tests__/snoozeDurations.test.ts` (8) | — | JÁ_COBERTO |
| `chat/__tests__/useChatDialogs.reducer` + `hooks/__tests__/useChatDialogs` | 4+19 | nenhuma | abrir/fechar/alternar/resetar chaves de diálogo; idempotência sem novo objeto de estado | U7 (P2, só se o estado virar hook) |
| `chat/__tests__/useChatFilters.identity` + `hooks/__tests__/useChatFilters` | 9+39 | nenhuma | estabilidade referencial e contagem por categoria | FF1 |
| `chat/__tests__/useChatInputLogic.memory` | 4 | `useChatInputLogic.rascunho-por-usuario.test.tsx` | `revokeObjectURL` do anexo ao enviar/desmontar (V2 não anexa inline) | n/a (AX1 cobre prévias do FileUploader) |
| `chat/__tests__/useChatPanelHandlers.burst` | 7 | nenhuma | "zero consultas ao banco" no caminho quente ao trocar de contato em rajada | P2, valor baixo; não recomendo |
| `chat/__tests__/useChatPanelHandlers.edit` | 4 | `useChatPanelHandlers.edicao-rejeitada.test.tsx` + `sem-falso-sucesso` | — | JÁ_COBERTO |
| `chat/__tests__/useChatPanelHandlers.retryLock` | 3 | `useChatPanelHandlers.assinatura-retry.test.tsx` (retry de texto) | retry de A não reenvia depois de trocar para B; estado residual não vaza | **U7 (P1 de teste)**: confirmar o comportamento no código antes |
| `chat/__tests__/useChatPanelHandlers.sendContract` | 5 | nenhuma | contrato `(content, attachments, onProgress)`, `sendProgress` real, não travar `isSending` quando `onProgress` nunca é chamado | P2; depende de a V2 ter `sendProgress` (não tem: `useChatPanelHandlers.ts` só usa `onProgress` no encaminhamento, `:390-447`) |
| `chat/__tests__/useChatPanelHandlers.whisper` | 4 | `useChatPanelHandlers.sussurro.test.tsx` | — | JÁ_COBERTO |
| `chat/__tests__/useInputHandlers.slash` | 19 | `slash-commands-r2-inb-021.test.tsx` (3) | navegação por teclado, sub-comando, Enter/Tab sem comando que case | SC1; achados_3 L1 |
| `chat/__tests__/useInputValueStore` | 3 | n/a | código morto | IGNORAR |
| `chat/__tests__/useMentionableProfiles` | 6 | nenhuma | erro do Supabase não pode virar lista vazia | PO1 (`t_32b9a4d7`) |
| `chat/__tests__/useMessageReactionHandlers.copy` | 2 | `sem-falso-sucesso` cobre "Copiado!" | — | JÁ_COBERTO |
| `chat/__tests__/useProductHandlers.interactive` / `.location` / `.product` | 6+4+3 | `useChatPanelHandlers.r2-inb-003.test.tsx` cobre interativo | localização: toast só após resolver, não persistir quando `contactId` não é UUID; falha com toast destrutivo; produto | **U7 (P2)**: localização na V2 (`useChatPanelHandlers.ts:648-665`) sem teste direto |
| `chat/hooks/__tests__/useChatDragAndDrop` | 23 | nenhuma (lógica inline em `ChatPanel.tsx:407-420`) | contador de `dragenter/leave` aninhados, só arquivos, `drop` zera o contador, sem arquivo não chama `handleExternalFiles` | **U7 (P2)** |
| `chat/hooks/__tests__/useChatQuickReplyControl` | 28 | nenhuma | — | QR1 |
| `chat/hooks/__tests__/useChatScheduleMessage` | 12 | `ChatPanel.scheduled-media.test.tsx` (5) | erro de RLS 403 com toast real, não chamar `onDone`; sem URL assinada | cobertos em parte; PH-23 |
| `chat/hooks/__tests__/useChatSearchState` | 18 | `ChatSearchBar*.test.tsx` | estado de busca é inline | IGNORAR |
| `chat/hooks/__tests__/useInitialHighlight` | 21 | nenhuma (feature não existe) | tentativas a 150 ms, 3,5 s de realce, toast se não achar, cleanup no desmonte | DL1/DL2 |
| `contact-details/sla-timeline/__tests__/types` | 79 | `lib/__tests__/slaTimeline.test.ts` (22) + `useContactSlaTimeline.test.tsx` | tipos/constantes de marcos | SLT1/QC2 |
| `media-gallery/__tests__/mediaUtils` | 24 | `media-gallery/__tests__/mediaUtils.test.ts` (7) | `getFilename` (URL completa, com query, relativa, vazia, malformada: 6 casos da V3) não tem teste na V2; `getMediaType` está melhor coberto | U7 (P2) |
| `slash-commands/__tests__/slashCommandsData` | 25 | `slash-commands-r2-inb-021.test.tsx` (3) | invariantes dos dados: ids e comandos únicos, atalhos únicos de 1 letra, sub-comandos de `transfer/priority/snooze`, categorias | U7 (P2) |
| `stickers/__tests__/StickerManager` | 25 | `StickerManager.recentes.r2-inb-062` (2) | — | QS1/QS4 |
| `stickers/__tests__/StickerTypes` | 40 | nenhuma | `StickerTypes.ts` (49 l.) sem teste | SK1 |
| `stickers/__tests__/stickerUpload` | 16 | n/a (módulo não existe) | validar tipo/tamanho antes do upload, rollback do objeto órfão | QS3/SK1 |
| `stickers/__tests__/usePersonalStickers.upload` | 14 | `usePersonalStickers.uso/identidade` (13) | caminho e `uploaded_by` | PD-88 |
| (fora de `components/`) `__tests__/FileUploader.attachClip` | 7 | `FileUploader.n-039`, `.r2-inb-011`, `.sl202-refs` | modo `showDialog=false` não existe na V2 | PE-63 cita |
| (fora) `utils/__tests__/whatsappFileTypes`, `imageCompression`, `lib/__tests__/scanResponse`, `hooks/__tests__/useScanResponseHandler` | — | V2 tem cópias espelho sem importar o código | `validateFile`, `getFileCategory`, `formatFileSize`, `compressImage` | PE-25 (`t_32326ab7`); scanResponse = DE5 |
| (fora) e2e `e2e/inbox/chat-drag-drop`, `chat-new-message-indicator`, `stickers.spec`, `a11y/inbox-axe` | 4 arquivos | V2 não tem; `e2e/files-tab.spec.ts` só usa `setInputFiles` na aba Arquivos | nenhum e2e do fluxo anexar→diálogo→enviar na conversa | U7 (e2e) |

Testes existentes na V2 que a V3 não tem (registro MV2): `FileUploader.n-039` (axe, nomes, progressbar), `useFileUploadLogic.test` (R2-INB-006: reconciliação de órfão, retry sem novo upload), `DocumentPreviewDownloadPermission.r2-inb-031`, `ImagePreviewVideoFullscreen.aria`, `MessageBubble.tentativas`, `ChatMessagesArea.movimento-reduzido`, `WhisperMode.a11y`, `ChatQuickRepliesPopover.a11y`.

---

## 4. Acessibilidade, mobile, i18n e tema transversais (M–Z, 64 pares V3×V2 comparados)

Contagem por regex nos 64 pares de componentes `.tsx` com mesmo nome (V3 / V2): `aria-*` 92/105; `role=` 26/27; `tabIndex` 5/5; `onKeyDown` 8/13; `focus-visible` 7/18; `useReducedMotion`/`reducedMotion` 0/7; `sr-only` 5/4; `aria-live`/`role=status|alert` 12/8; `alt=` 17/24; `useIsMobile` 21/12 (diferença só em `TicketTabs`, `RealtimeInboxView`). Alvos de toque pequenos (`h-5..7 w-5..7`): 203 na V3, 173 na V2. A V2 está melhor ou igual, com as exceções abaixo (verificadas no código atual):

| Tema | Achado V2 (evidência) | V3 | Classe | Cartão |
|---|---|---|---|---|
| Teclado: documento do balão | `MediaPreview.tsx:89` `onClick={handleOpen}` em `motion.div` sem `role`, `tabIndex` nem `onKeyDown`; só o botão de baixar é alcançável | `V3:MediaPreview.tsx:66-76` `role="button" tabIndex={0} aria-label="Abrir pré-visualização do arquivo"` + Enter/Espaço | LAC | **U2** |
| Teclado: vídeo do balão | `MediaPreview.tsx:138` contêiner clicável sem papel/teclado; o botão de tela cheia (`:162`) é `opacity-0 group-hover` | idem V2 (V3 melhor só no documento) | LAC | **U2** |
| `VideoFullscreen` | `VideoFullscreen.tsx:55-62`: sobreposição `fixed inset-0` sem `role="dialog"`/`aria-modal`, sem `Esc` (o `ImagePreview` fullscreen tem, `ImagePreview.tsx:26-29`), sem mover/devolver foco; botão de velocidade com nome "1x" (`:77`); botão Baixar `disabled` com `onClick` morto | igual (V3 `:31`, `aria-label` em mute/fechar) | LAC (nos dois) | **U2** |
| Ações reveladas só por hover | 21 pontos `opacity-0 group-hover:opacity-100` no inbox sem `focus-within`/`focus-visible`/`@media (hover:none)`: `MessageContextActions:145`, `MessageTemplates:119`, `TemplatesWithVariables:101`, `QuickRepliesManager:94`, `quick-replies/QuickReplyCardList:91`, `TextToSpeechButton:60`, `MessageReactions:131,225`, `SlashCommands:128` (dica de atalho), `MediaPreview:162`, `LinkPreview:45,55,76`, `GlobalSearch:280`, `AudioMemePicker:190`, `CustomEmojiPicker:194`, `AISuggestions:231`, `tabs/NotesTab:123,150,180`, `chat/MessageHoverToolbar:114` | 30 pontos iguais; a V3 compensa só o balão com `tabIndex`+teclas R/F/C (`MessageBubble.tsx:192-198`) | LAC (nos dois, afeta teclado e celular) | **U1**; parcial: UK-04 (`ui/message-reactions`), PE-85 (filas), PB-37, QL4, BA1 (balão) |
| Nome do ícone de status no balão | `chat/messageUtils.tsx:26-96` ícones de tique sem `aria-label`/`sr-only`; `animate-pulse` no relógio; `played` cai no relógio; `MessageBubble.tsx:380` só renderiza o ícone | V3 `MessageStatusInline` tem `aria-label` "Detalhes de entrega — …" e tooltip | LAC | complemento ao **VC1** (seção 5) |
| Nomes de botões só-ícone | `MessageContextActions:142`, `MessageReactions:125,253`, `VoiceChanger:212`, `VoiceChangerPicker:278,292`, `SummaryResult:28`, `TemplatesWithVariables:102-103`, `ObjectionDetector:85,90,242` (só `TooltipContent`, que não nomeia o gatilho), `StickerManager:140,146`, `PersonalStickers:81-82` | V3 tem rótulo em quase todos | LAC | PE-60, PE-03, PD-43, QS4, achados_2 L; **só `TemplatesWithVariables:102-103` e `ObjectionDetector:85,90,242` ficam sem dono** (U1) |
| Movimento reduzido | 81 de 101 arquivos do inbox que usam framer-motion não têm `useReducedMotion`/`MotionConfig`; só `ContactsView.tsx:122` tem `MotionConfig reducedMotion="user"`; a regra CSS (`styles/accessibility.css:75-82`) não alcança animações JS | V3: 0 `MotionConfig`, 0 `useReducedMotion` neste recorte | LAC (V2 ainda melhor que V3 em outros diretórios) | **UK-02** (paridade-ui2): não duplicar |
| Anúncio de estado | `TypingIndicator` sem `role=status`; mensagem nova sem `aria-live` | V3 anuncia nova mensagem (`RealtimeInboxView.tsx:109-120`) | LAC | achados_1 L8; achados_3 L6 |
| Fila de upload | itens sem `aria-live` para "Enviado/Erro" (as toasts do `sonner` anunciam, a lista não); botão remover `h-7 w-7` (`FileUploader.tsx:86`) | igual | LAC leve | U4 |
| i18n pt-BR | `alt="Preview"` em `ReplyQuote.tsx:68`, `CustomEmojiPicker.tsx:55`, `FileUploader.tsx:64,160`; `title="PDF Preview"` `FileUploader.tsx:153`; `alt="Sticker"` `MediaPreview.tsx:184` | V3 tem `title="PDF Preview"` e `aria-label="Voice Changer"` (marca) | LAC | **U5** |
| Tema | `chat/messageUtils.tsx:52` `text-[#53bdeb]` (tique lido); `fill-yellow-400` em `QuickReplyCardList.tsx:75,93` e `QuickRepliesManager.tsx:94`; `ai-tools/SentimentTab.tsx:120-122` `rgb()`; `VirtualizedRealtimeList.tsx:55-60` `hsl()` por canal | V3 usa os mesmos azuis literais | LAC (regra "só tokens") | **U6** |
| Mobile | `useIsMobile` em `RealtimeInboxView`, `ChatInputArea`, `NewConversationModal` (teste `mobile-nova-conversa`); diálogo de upload `sm:max-w-lg` ok; `touch-manipulation` 5 vs 3; `pointer: coarse` 4 vs 0 | — | V2 ≥ V3 | — |
| Foco visível | `focus-visible` 18 vs 7 | — | MV2 | — |

---

## 5. Lacunas reais SEM cartão (priorizadas)

Conferi cada uma com `buscar_corpo.py` e nos `ids.json`/`cards_*.py` de paridade-v3, -06, -07, -docs, -resto, -ui2, -hooks*. Nenhuma é P0 (sem segurança, dados ou LGPD novos neste recorte).

### P1

**U1. Ações que só aparecem no `hover` são inalcançáveis por teclado e por toque (21 pontos no inbox)**
- Fato (V2, conferido por varredura): lista na seção 4. Todos os botões estão no DOM mas com `opacity-0` até o `hover` do pai; no celular (sem hover) ou com Tab não há como ver nem acionar editar/copiar/excluir/favoritar. `TemplatesWithVariables.tsx:102-103` e `ObjectionDetector.tsx:85,90,242` ainda não têm nome acessível (os demais nomes estão em PE-60/PE-03/PD-43). Já existem cartões para `ui/message-reactions` (UK-04), filas (PE-85) e balão (BA1); estes pontos do inbox não têm dono.
- Implementar: um padrão único: `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100`, mais alvo de toque mínimo de 40 px em ponteiro grosso e `aria-label` em pt-BR nos botões só-ícone que faltam (`TemplatesWithVariables`, `ObjectionDetector`). Opcionalmente uma classe utilitária em `src/styles/` para não repetir.
- Perfil: iris (+ workertestes). Arquivos: os 21 pontos listados (todos em `src/components/inbox/`).
- Pronto: um teste por componente (ou um teste parametrizado) que navega com `userEvent.tab()`, confirma que o botão recebe foco com opacidade 1 e tem nome (`getByRole('button',{name})`); axe sem violação; captura em viewport de 390 px sem hover.

**U2. Documento e vídeo do balão não abrem pelo teclado; `VideoFullscreen` não é um diálogo (sem `Esc`, sem foco, sem papel)**
- Fato: ver seção 4 (`MediaPreview.tsx:89,138,162`; `VideoFullscreen.tsx:55-62,77-84`). A V3 já faz o documento certo (`role="button"`, Enter/Espaço, `aria-label`); a V2 tem o menu do documento só por clique. Nenhum cartão cita `VideoFullscreen` (o achados_1 o classifica MV2 pelo volume) nem teclado do `DocumentPreview`/`VideoPreview`.
- Implementar: (a) `DocumentPreview` e o contêiner do `VideoPreview` com `role="button"`, `tabIndex={0}`, `aria-label` ("Abrir documento {nome}", "Abrir vídeo em tela cheia"), Enter/Espaço, `focus-visible:ring`; (b) `VideoFullscreen` com `role="dialog" aria-modal="true" aria-label="Vídeo em tela cheia"`, foco inicial no botão Fechar, `Esc` fecha (`keydown` do próprio elemento, com cleanup), devolver o foco ao gatilho, `aria-label="Velocidade de reprodução: 1x"` no botão de velocidade; remover o `onClick` do Baixar desabilitado; (c) botão de tela cheia visível com `focus-visible` (U1).
- Perfil: iris. Arquivos: `src/components/inbox/MediaPreview.tsx`, `src/components/inbox/VideoFullscreen.tsx`, testes em `src/components/inbox/__tests__/`.
- Pronto: teste de Tab+Enter abre o documento (`window.open` espiado) e o vídeo; `Esc` fecha o vídeo e o foco volta; axe do `VideoFullscreen` sem violação; movimento reduzido respeitado.

### P2

**U4. `FileUploader`: fila mostra só "Erro/Inválido" sem motivo; Esc/clique fora durante o envio da fila fecha o diálogo e deixa o envio rodando sem tela; alvo de remover de 28 px; sem região viva** (complementa AX1 e PK-27; confirmar antes de criar cartão novo)
- Fato: `useFileUploadLogic.ts:240` grava `QueuedFile.error`; `FileUploader.tsx:70-84` nunca o renderiza; motivo do arquivo inválido (limite, tipo) só aparece no modo de arquivo único (`:180`); `onOpenChange={handleClose}` (`:129`) ignora `uploading`; remover `h-7 w-7` (`:86`).
- Implementar: mostrar `validation.error` / `error` abaixo do nome (texto, não só selo); `onOpenChange={(open) => !open && !uploading && handleClose()}` (ou `onEscapeKeyDown`/`onInteractOutside` com `preventDefault` enquanto `uploading`); alvo ≥ 40 px; `aria-live="polite"` num resumo ("2 de 3 enviados, 1 falhou").
- Perfil: iris. Arquivos: `FileUploader.tsx`, `useFileUploadLogic.ts` (só se necessário), `__tests__/FileUploader.*`. Pronto: testes de Esc bloqueado em envio, motivo visível, axe.

**U5. Textos em inglês em alt/title** — `alt="Preview"` (`ReplyQuote.tsx:68`, `CustomEmojiPicker.tsx:55`, `FileUploader.tsx:64,160`), `title="PDF Preview"` (`FileUploader.tsx:153`), `alt="Sticker"` (`MediaPreview.tsx:184`). Implementar: "Pré-visualização de {nome}", "Pré-visualização do PDF {nome}", "Figurinha". Perfil: iris. Pronto: grep sem ocorrência; testes de nome acessível dos componentes tocados.

**U6. Cores literais fora do sistema (regra "só tokens")** — `chat/messageUtils.tsx:52` `#53bdeb` (usar `text-info` ou token `whatsapp-read`), `QuickReplyCardList.tsx:75,93` e `QuickRepliesManager.tsx:94` `yellow-400` (usar `warning`), `SentimentTab.tsx:120-122` `rgb()` (tokens `success/destructive/muted`), `VirtualizedRealtimeList.tsx:55-60` `hsl()` por canal (tokens de canal ou comentário de marca). Perfil: iris. Pronto: grep sem literais nesses arquivos; temas claro, escuro, alto contraste e skins conferidos por captura.

**U7. Testes que a V2 não tem** (workertestes; nenhum toca produção)
 a. e2e do fluxo de anexo: Playwright `e2e/anexo-arquivos.spec.ts` (V2 não tem nenhum e2e de upload na conversa; `files-tab.spec.ts` só usa `setInputFiles` na aba Arquivos): anexar 2 arquivos (png + pdf), conferir fila ordenada (imagem antes de documento), enviar, conferir caminho `<contactId>/…` no bucket local e a mensagem na conversa; arquivo inválido recusa com motivo; precisa do banco local.
 b. Unidade de `useFileUploadLogic` (hoje 7 testes só de caminho/órfão): ordenação por categoria; corte em 10 com aviso; compressão que falha cai no original; GIF/sticker; `canSend` falso encaminha por `onFileSelect`; contagem "N enviados/N falharam" no lote parcial; `revokeObjectURL` ao remover item (parte de AX1: não duplicar o desmonte).
 c. Arrastar e soltar: extrair `dragCounterRef` de `ChatPanel.tsx:407-420` num hook testável ou testar pelo `ChatPanel` (contador aninhado, só `Files`, `drop` zera, sem arquivo não chama o uploader), 6 a 8 casos da V3 `useChatDragAndDrop.test.ts`.
 d. `slashCommandsData`: ids e comandos únicos, atalhos únicos de uma letra, sub-comandos de transfer/priority/snooze, categorias (22 dos 25 casos da V3 sem par).
 e. `getFilename` de `media-gallery/mediaUtils.ts` (6 casos).
 f. `localInstantFromDayAndTime` (`lib/localDay.ts:66-79`): `25:00`, `12:60`, dia inexistente, hora vazia.
 g. Retry preso à conversa (V3 `useChatPanelHandlers.retryLock.test.ts`): payload falho da conversa A não é reenviado depois de trocar para B; estado residual (sussurro, resposta, gravação) é limpo. Antes de escrever o teste, ler `useChatPanelHandlers.ts` para ver se a V2 tem `lastFailedSend`/equivalente; se não tiver, o comportamento em si é lacuna (reportar ao Claude).
 h. Localização: `handleSendLocation` (`useChatPanelHandlers.ts:648-665`) com sucesso, falha (toast destrutivo, sem toast de sucesso).
 Perfil: workertestes. Pronto: testes verdes 3 vezes seguidas, `zapp-verify . --rapido` verde.

**U8. Verificação de conteúdo (magic bytes) dos anexos — decisão e desenho** (sobre PK-26; não duplicar o cartão)
- O PK-26 limita tamanho e MIME declarado no bucket; o MIME do bucket vem do cabeçalho do upload (declarado pelo cliente), portanto continua falsificável. Opções, na ordem de custo: (1) `validateFile` ler 16 bytes (`file.slice(0,16)`) e comparar com a tabela de assinaturas corrigida (ver armadilhas na seção 1) antes de enviar; (2) a Edge `message-delivery` conferir os primeiros bytes do objeto antes de entregar ao provedor (PK-26 já cita como opcional). Sem VirusTotal (DE5).
- Perfil: hugo (1) / edgar (2). Pronto: testes com arquivo `.exe` renomeado `.pdf` recusado, `.m4a` e `.3gp` legítimos aceitos.

### Complementos a cartões existentes (conferir o cartão antes de criar algo)

- **QS4 (`t_8459ee16`)** — os "FATOS" do cartão citam linhas (`PersonalStickers.tsx:351,372-373`) que não existem mais no arquivo atual (109 linhas). No código atual: `stickers/PersonalStickers.tsx:75-86` tem `<button>` (favoritar e excluir) DENTRO de `motion.button` (botão aninhado: HTML inválido, aviso do React, leitor de tela confuso) e a camada com os botões só aparece por `onMouseEnter`/`hoveredId` (`:77,80`), então não aparece em teclado nem toque. Incluir no escopo do QS4: tirar o aninhamento (contêiner `div role="group"` com botão principal e botões irmãos) e revelar a camada também no foco e em `hover:none`.
- **VC1 (`t_b0bfb9af`)** — acrescentar nome acessível ao `MessageStatusIcon` (`chat/messageUtils.tsx:26-96`, usado em `MessageBubble.tsx:380`): `role="img"` com `aria-label` vindo do `messageStatusLanguage` ("Enviada", "Entregue", "Visualizada", "Falha no envio") e `played`/`retrying`; hoje o tique é mudo para leitor de tela.
- **PK-27 / AX1** — ver U4 (Esc durante o envio da fila e motivo visível).
- **PK-26 (`t_4d6e43dc`)** — a mensagem de erro do cliente: o `uploadFileToStorage` lança `Erro ao fazer upload: ${error.message}` (`useFileUploadLogic.ts:145`) com texto em inglês do Storage ("The object exceeded the maximum allowed size", "mime type … is not supported"); mapear para pt-BR junto com o limite novo (o cartão menciona a mensagem, não o idioma).

### Decisões que o dono pode querer rever (nenhuma é bug)
- Antivírus/VirusTotal: continua DE5 (não portar). Quarentena manual da V2 não varre.
- Anexo inline no compositor (`showDialog=false` da V3) vs diálogo da V2: assunto do doc 08/PO2.
- V3 bloqueia "abrir" e "baixar" documento; a V2 bloqueia só "baixar" quando `can_download=false` e deixa abrir (comentário em `media-gallery/MediaPreviewDialog.tsx:128-130`: "único caminho de leitura de um orçamento em planilha"). Não mexer.

---

## 6. O que NÃO consegui verificar

- Banco real: configuração de `storage.buckets` (`whatsapp-media`, `audio-messages`: limite, tipos, público/privado), políticas de `storage.objects` e se `contact_read_at`/`status_updated_at` existem em `messages` (descartado em 12/10 por não existir; reconferir se o painel de status voltar).
- Runtime: nenhum teste foi executado. As contagens de `aria`, `role`, `opacity-0 group-hover` e botões só-ícone são por regex; a lista de botões só-ícone tem falsos positivos (botões com texto fora de `{}`), por isso só listei os confirmados à mão no código. Teclado real, leitor de tela, comportamento em celular e contraste não foram observados em navegador.
- `git ls-tree` do doc 11 (agosto) vs código atual: o código atual da V3 manda; a V3 foi lida em `origin/main` na data de hoje (arquivos extraídos com `git archive` para a pasta temporária da sessão).
- Cartões `done` ainda não integrados na `.integrador` (AX1, PE-60 etc.) podem já ter resolvido parte do que aponto: antes de criar qualquer cartão a partir deste relatório, procurar em `~/hermes-workspaces/.v2-fila/*.json` e no quadro (`PK-*`, `PE-*` aparecem como `t_…` em `ids.json`).
- Se `useAudioRecorderUI` (reenvio com recuo) e `NextBestActionEngine` têm equivalente funcional completo: li só o resumo do achados_2 irmão; não reabri.
