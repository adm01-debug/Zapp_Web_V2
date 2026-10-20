# Inventário da superfície de IA no frontend — Zapp_Web_V2

- **Bloco:** 01 (preparação e evidências) — plano de 200 etapas de IA
- **Repo de leitura (somente leitura):** `/home/joaquim_ataides/projetos/Zapp_Web_V2`
- **Data da coleta:** 29/09/2026
- **Método:** leitura direta do código em `src/` (componentes, hooks, páginas, serviços de navegação, rotas e testes). Nenhuma chamada de rede, nenhum CLI do Supabase, nenhum `git`, nenhuma escrita no repo de leitura.
- **Regra de honestidade:** todo campo sem confirmação no código está marcado `não verificado`. Nenhum valor de secret é reproduzido (o código lê `SUPABASE_ANON_KEY`/token de sessão; os valores não aparecem aqui).
- **Escopo:** superfície de IA do **frontend**. O comportamento interno das edge functions (`supabase/functions/*`) não foi inspecionado neste bloco.

## Legenda do formato de cada ponto de UI

```
Ponto | UI (arquivo:linha) | rótulo visível | executa (arquivo:linha) | edge function
      | payload (campos + volume + quem escolhe o modelo)
      | resposta (persiste? só mostra? cacheia?) | efeito operacional colateral
      | gating de permissão no cliente (arquivo:linha) | teste
```

Total de pontos de UI/ação inventariados: **59** (P01–P59).

---

## 1. Inbox — cabeçalho do chat e painéis de ferramentas

### P01 — Botão "Monitoramento de Objeções" (barra do header)
- UI: `src/components/inbox/chat/ChatHeaderToolbar.tsx:65` | rótulo: "Monitoramento de Objeções" (tooltip)
- executa: `onSetActiveTool('objections')` → `src/components/inbox/chat/ChatToolPanels.tsx:39-45` → `src/components/inbox/ObjectionDetector.tsx:121`
- EF: **`ai-proxy`** (`src/hooks/inbox/useObjectionDetector.ts:70`)
- payload: `messages: [ {role:'system', content: prompt de objeções + tom + nome do contato}, {role:'user', content: mensagens do cliente concatenadas} ]`, `model: 'google/gemini-3-flash-preview'` (`:94`) — volume: **todas** as mensagens do cliente do período filtrado (default `'all'`, `:43`), sem truncamento; **o frontend escolhe o modelo**
- resposta: **só mostra** (estado local `objections`), sem persistência; parse do JSON feito no cliente com regex `/\[[\s\S]*\]/` (`:100`) e clamp de `confidence` no cliente (`:111`)
- colateral: nenhum (não envia mensagem, não muda fila/etiqueta/tarefa); "Usar resposta" só preenche o input (`useObjectionDetector.ts:148-151`)
- gating no cliente: **nenhum** (botão sempre ativo; qualquer agente autenticado no inbox)
- teste: **nenhum**

### P02 — Botão "Ajuda dos Universitários" (barra do header)
- UI: `src/components/inbox/chat/ChatHeaderToolbar.tsx:66` | rótulo: "Ajuda dos Universitários"
- executa: `onSetActiveTool('university')` → `ChatToolPanels.tsx:50-53` → `src/components/inbox/UniversityHelp.tsx:30` → `src/hooks/ui/useUniversityHelp.ts`
- EF: **`ai-proxy`** (`useUniversityHelp.ts:104`)
- payload: `messages: [ {system: prompt de comunicação empresarial + tom + nome}, {user: mensagens **selecionadas** pelo usuário, com prefixo [Atendente]/[Cliente]} ]`, `model: 'google/gemini-3-flash-preview'` (`:116`); listagem mostra no máx. 30 mensagens recentes (`:40`); **seleção das mensagens é do usuário** (checkbox em `UniversityHelp.tsx:107`); **o frontend escolhe o modelo**
- resposta: **só mostra** (`setResponse`, `:122`), sem persistência; "usar" (`UniversityHelp.tsx:153` → `AIResponseCard`) preenche o input
- colateral: nenhum
- gating no cliente: nenhum
- teste: **nenhum**

### P03 — Botão "Visão" (assistente de análise profunda)
- UI: `src/components/inbox/chat/ChatHeaderToolbar.tsx:67` | rótulo: "Visão"
- executa: `onToggleAIAssistant` → `ChatToolPanels.tsx:28-36` → `src/components/inbox/AIConversationAssistant.tsx:37`
- EF: **`ai-conversation-analysis`** (`AIConversationAssistant.tsx:89`)
- payload: `messages: filteredMessages.map(id, sender, content, type, created_at)`, `contactName`, `contactId`, `periodDays` (`:91-101`); mínimo 5 mensagens (`:65`); modelo **não** é informado pelo cliente (escolhido no backend — `não verificado`)
- resposta: mostra em `AnalysisTabs` (`:264-278`); o hook `useConversationAnalyses` **expõe** `saveAnalysis` (`src/hooks/chat/useConversationAnalyses.ts:68-103`) mas **não é chamado** por este fluxo — o componente apenas faz `refetch()` (`:122`). Se a linha em `conversation_analyses` é gravada pela edge function: **não verificado**
- colateral: **dispara alerta de sentimento** (`:127-133`) via `sentiment-alert`; `useConversationAnalyses` mantém histórico local dos últimos 20 (`:45`)
- gating: nenhum
- teste: **nenhum** para o componente; o hook tem `src/hooks/__tests__/useConversationAnalyses.test.tsx`

### P04 — Botão "Resumo da conversa" (header)
- UI: `src/components/inbox/chat/ChatHeaderToolbar.tsx:69-72` | rótulo: "Resumo da conversa"
- executa: `onGenerateSummary` (prop) → painel `ConversationSummary` (`ChatToolPanels.tsx:58-64`) → `src/components/inbox/ConversationSummary.tsx:30`
- EF: **`ai-conversation-summary`** (`ConversationSummary.tsx:63`)
- payload: `messages: filteredMessages.map({sender, content, created_at})`, `contactName`, `contactId` (`:64`); exige **≥ 10 mensagens** no período (`:37`, `:60`); modelo escolhido no backend — não verificado
- resposta: **só mostra** (`setSummary(data)`, `:67`); **não persiste** no frontend. `initialSummary` existe como prop (`:16`, usado em `:31/:41`) mas **nenhum caller do repo passa essa prop** (verificado por busca: só o próprio teste passa)
- colateral: TTS do resumo (`useSummaryTts`, `:35`)
- gating: nenhum
- teste: `src/components/inbox/__tests__/ConversationSummary.test.tsx` (cobre render + `initialSummary`; não cobre a chamada à EF)

### P05 — Botão "Detectar objeções" (painel Objeções)
- UI: `src/components/inbox/ObjectionDetector.tsx:146` | rótulo: "Detectar objeções" + contador
- executa: `detector.analyze()` → `src/hooks/inbox/useObjectionDetector.ts:60`
- EF: `ai-proxy` (`:70`); payload/modelo idem P01
- resposta: só mostra; **rate-limit de 3 s** aplicado no cliente (`:61-64`)
- colateral: nenhum
- gating: nenhum
- teste: **nenhum**

### P06 — Botão "Reescrever" (por objeção)
- UI: `src/components/inbox/ObjectionDetector.tsx:58` (ActionBar) / `:225` (`onRewrite`) | rótulo: ícone + tooltip "Reescrever"
- executa: `detector.rewriteSingle(idx)` → `useObjectionDetector.ts:126`
- EF: **`ai-proxy`** (`:130`), `model: 'google/gemini-3-flash-preview'` (`:136`); payload: `{system: "Reescreva o contra-argumento... tom + nome"}, {user: objections[idx].counterArgument}` — 1 item
- resposta: sobrescreve o `counterArgument` em memória (`:141`); sem persistência
- colateral: nenhum
- gating: nenhum
- teste: **nenhum**

### P07 — Botão "Usar resposta" (objeção)
- UI: `src/components/inbox/ObjectionDetector.tsx:63-65` | rótulo: "Usar resposta"
- executa: `handleSelect` → `useObjectionDetector.ts:148-151` → `onSelectSuggestion` (Inbox: `RealtimeInboxView.tsx:86-89` → `pendingDraft`)
- EF: **nenhuma** (só preenche o input e troca para a aba `chat`)
- resposta: n/a | colateral: rascunho no input do chat; nenhum envio automático
- gating: nenhum | teste: **nenhum**

### P08 — Seletor de tom (reanalisa objeções)
- UI: `src/components/inbox/ObjectionDetector.tsx:213` | rótulo: "Formal/Amigável/Objetivo/Descontraído/Persuasivo" (`src/components/inbox/ai-tools/ToneSelector.tsx:4-10`)
- executa: `detector.analyze(tone)` → `useObjectionDetector.ts:60` com o prompt do tom
- EF: `ai-proxy`; o **frontend escolhe o tom** e injeta no prompt; modelo hardcoded
- resposta: substitui a lista de objeções | colateral: nenhum | gating: nenhum | teste: **nenhum**

### P09 — Botão "Gerar resposta" (Ajuda dos Universitários)
- UI: `src/components/inbox/UniversityHelp.tsx:126-130` (atalho Ctrl/Cmd+Enter em `:46-55`) | rótulo: "Gerar resposta (N msgs)"
- executa: `generateResponse()` → `useUniversityHelp.ts:87`
- EF: `ai-proxy` (`:104`); payload/modelo idem P02; rate-limit 3 s (`:94-98`)
- resposta: só mostra (`:122`) | colateral: nenhum | gating: nenhum | teste: **nenhum**

### P10 — Painel "Visão" — botão "Analisar (N msgs)" e "Reanalisar conversa" (duplicidade)
- UI: `src/components/inbox/AIConversationAssistant.tsx:172-180` e `:291-303`
- rótulo: "Analisar (N msgs)" / "Reanalisar conversa"
- executa: `analyzeConversation()` (`:78`) com `withRetry` (2 tentativas, `:107-116`)
- EF: `ai-conversation-analysis` | payload: idem P03
- resposta: só mostra; **dispara `sentiment-alert`** (`:127-133`) usando `result.sentimentScore || 50` — fallback local de 50 quando o backend não manda o campo (`:124`)
- colateral: possível alerta de sentimento + notificação/toast (`src/hooks/inbox/useSentimentAlerts.ts:59-86`)
- gating: nenhum | teste: **nenhum**

### P11 — Card "Sugestão de resposta" (aba IA) — botão Sparkles
- UI: `src/components/inbox/tabs/AiTab.tsx:83-86` → botão em `src/components/inbox/AISuggestions.tsx:107-120` | rótulo: ícone Sparkles, `title="Sugestões de IA"`; painel "Copilot IA" + badge "KB" (`:133-134`)
- executa: `fetchSuggestions()` → `AISuggestions.tsx:37`
- EF: **`ai-suggest-reply`** (`:51`)
- payload: `messages: messages.slice(-10).map({content, sender})`, `contactName`, `contactId` (`:52-59`) — **10 mensagens**; modelo escolhido no backend — não verificado
- resposta: só mostra em popover (`setSuggestions`, `:65`); "Usar" (`:81-85` → `:162`) preenche o input. Fonte KB exibida como `suggestion.source` (`:177-181`)
- colateral: nenhum | gating: nenhum
- teste: **nenhum** (o teste da aba mocka este componente: `src/components/inbox/tabs/__tests__/AiTab.test.tsx:24-28`)

### P12 — Botões "Adicionar" (Produtos recomendados, aba IA)
- UI: `src/components/inbox/tabs/AiTab.tsx:155-161` | rótulo: "Adicionar"
- executa: `useRecommendedProducts(contactId, interesses)` (`src/hooks/chat/useRecommendedProducts.ts:14`) — **consulta direta à tabela `products`** (`:18-23`), não é EF de IA
- EF: nenhuma; resposta: lista em cache React Query (`staleTime 60s`, `:33`); colateral: insere o texto no input
- gating: nenhum | teste: **nenhum**

### P13 — Card "Risco / sentimento" (aba IA)
- UI: `src/components/inbox/tabs/AiTab.tsx:168-184`
- executa: `conversation.contact.ai_sentiment` (`:59`) + `useContactLeadScore` (`src/hooks/crm/useContactCrm360.ts:224-239` → tabela `contacts.lead_score/risk_score`)
- EF: nenhuma nesta card (o valor vem de campo desnormalizado em `contacts`)
- **Conflito de fonte:** o mesmo produto de IA aparece no header via `useLatestAnalysis` (`AnalysisBadges`, `src/components/inbox/AnalysisBadges.tsx:28-33`, lê `conversation_analyses.sentiment`) e aqui via `contacts.ai_sentiment` — duas origens diferentes para a mesma UI (ver seção (d))
- gating: nenhum | teste: `AiTab.test.tsx:90-93` cobre o vazio; não cobre divergência

### P14 — Painel de próximas ações (aba IA e sidebar)
- UI: `AiTab.tsx:102-136` e `src/components/inbox/ChatPanel.tsx:271` → `src/components/inbox/NextBestActionEngine.tsx:11` | rótulo: "Próxima melhor ação"
- executa: `useNextBestAction` (`src/hooks/chat/useNextBestAction.ts:25`)
- EF: **nenhuma** — heurística 100% local sobre 4 consultas (`messages` `:36-42`, `conversation_tasks` `:68-72`, `conversation_sla` `:84-88`, `conversation_memory` `:100-104`); fallback fixo "Explorar oportunidade" (`:129-137`)
- resposta: só mostra; colateral: em `Crm360Tab` o botão "Criar tarefa →" cria uma tarefa real (`src/components/inbox/tabs/Crm360Tab.tsx:234-240`)
- gating: nenhum | teste: **nenhum**

### P15 — Card "Resumo da conversa" (aba IA)
- UI: `AiTab.tsx:88-90` → mesmo componente de P04; rótulo: "Gerar resumo (N msgs)"
- gating: nenhum | teste: `ConversationSummary.test.tsx`

### P16 — Card "Objeções detectadas" (aba IA)
- UI: `AiTab.tsx:92-100` → mesmo componente de P01 | teste: **nenhum**

### P17 — Aba IA do painel central
- UI: `src/components/inbox/chat/ConversationTabContent.tsx:84-92` (`activeTab === 'ia'`), banner de entrada em `:70-78` ("Assistente IA / Ver sugestões") | rótulo: aba/banner "Assistente IA"
- executa: `AiTab` (lazy, `:8-9`) | EF: as dos filhos | colateral: nenhum
- gating: nenhum (a aba existe para todos os agentes; nav global é outro caminho)
- teste: `AiTab.test.tsx`, `ConversationTabs` tem `src/components/inbox/chat/__tests__/ConversationTabs.test.tsx`

### P18 — Chip "Assistente IA" (atalho de ações rápidas)
- UI: `src/components/inbox/chat/QuickActionChips.tsx:76` | rótulo: "Assistente IA"
- executa: `onOpenAiAssistant` → `ChatPanel.tsx:302` → `onSwitchToAiTab` → `RealtimeInboxView.tsx:215` (`setActiveTab('ia')`)
- EF: nenhuma (navegação) | colateral: troca de aba | gating: nenhum | teste: **nenhum**

### P19 — Popover de ferramentas de IA do header (variante AIToolsPopover)
- UI: `src/components/inbox/AIToolsPopover.tsx:36-78` | rótulos: "Monitoramento de Objeções", "Ajuda dos Universitários"
- executa: mesmos componentes de P01/P02 | EF: `ai-proxy`
- **Caminho duplicado** em relação a `ChatToolPanels` (duas entradas para a mesma feature)
- gating: nenhum | teste: **nenhum**

---

## 2. Inbox — entrada de texto, áudio e voz

### P20 — Botão "Aprimorar mensagem com IA" (Sparkles no input)
- UI: `src/components/inbox/chat/ChatMessageInput.tsx:150` → `src/components/inbox/chat/AIEnhanceButton.tsx:128-143` | rótulo: aria "Aprimorar mensagem com IA"; popover "✨ Escolha o tom da mensagem" com 6 tons (`:25-32`, `:155-168`)
- executa: `handleEnhance(tone)` → `AIEnhanceButton.tsx:45`
- EF: **`ai-enhance-message`** (`:56`)
- payload: `{ message: inputValue, tone, contactName }` — **1 mensagem**; modelo escolhido no backend — não verificado
- resposta: substitui o texto do input (`onInputChange(data.enhanced)`, `:67`); guarda original para desfazer (`:53`, `:86-92`) — **sem persistência**
- colateral: nenhum (não envia)
- gating: renderizado só quando `!isMobile`? verificado: **não há gating por device para este botão** (`:150` fora do bloco `isMobile`; o botão de emoji em `:151` é que é condicionado)
- teste: **nenhum**

### P21 — Botão "Reescrever com IA" (tone picker no input — inbox)
- UI: `src/components/inbox/chat/ChatInputToolbars.tsx:57` e `src/components/inbox/chat/ChatInputArea.tsx:274` → `src/components/inbox/chat/AIRewriteButton.tsx:72-89` | rótulo: aria/tooltip "Reescrever com IA"; 6 tons (`:13-20`)
- executa: `handleRewrite(tone)` → `AIRewriteButton.tsx:33`
- EF: **`ai-enhance-message`** (`:43`) — payload `{message, tone, contactName}` (`:44`)
- resposta: `onRewrite(data.enhanced)` (`:50`) sobrescreve o input; sem persistência
- colateral: nenhum | gating: nenhum | teste: **nenhum** para o componente (há assertivas de fonte em `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts:763,784`)

### P22 — Botão "Voice Changer" (gravar → escolher voz → enviar)
- UI: `src/components/inbox/chat/ChatInputToolbars.tsx:60`, `src/components/team-chat/TeamChatInputArea.tsx:86` → `src/components/inbox/VoiceChangerPicker.tsx:188` | rótulo: "Voice Changer", "Powered by ElevenLabs" (`:199-200`); 25 presets (`:11-39`)
- executa: `transformVoice()` → `VoiceChangerPicker.tsx:105`; gravação local via `MediaRecorder` (`:74-96`)
- EF: **`voice-changer`** via `fetch` direto (`:117-127`), `FormData { audio: recording.webm, voice_preset }` (`:111-113`)
- resposta: preview em blob URL (`:135-136`); **ao enviar**, sobe o blob para o bucket `audio-memes` (`:166-168`) e chama `onSendAudio(publicUrl)` (`:172`) → **o áudio é enviado como mensagem** no chat
- colateral: envia mensagem (áudio) e grava arquivo em storage
- gating: prop `disabled` (nenhum caller do inbox passa `true` — não verificado se algum caller bloqueia)
- teste: **nenhum**

### P23 — Botão "Texto para Áudio (TTS)" (enviar mensagem como áudio)
- UI: `src/components/inbox/chat/ChatInputToolbars.tsx:79`, `src/components/team-chat/TeamChatInputArea.tsx:177` → `src/components/inbox/TextToAudioButton.tsx:131-144` | rótulo: "Texto para Áudio (TTS)", popover "Enviar como Áudio / ElevenLabs" (`:157-158`)
- executa: `handleConvert(voice)` → `TextToAudioButton.tsx:42`; vozes de `ELEVENLABS_VOICES` (`src/components/inbox/VoiceSelector.tsx`)
- EF: **`elevenlabs-tts`** via `fetch` direto (`:59-72`), body `{ text: inputValue.trim(), voiceId }` (`:67-70`)
- resposta: blob + auto-play (`:79-93`); "Enviar Áudio" (`:105-111`) chama `onAudioReady(blob)` → **mensagem de áudio enviada**
- colateral: envia mensagem de áudio ao contato
- gating: nenhum | teste: **nenhum**

### P24 — Botão "Alterar Voz" (audio recorder)
- UI: `src/components/inbox/AudioRecorder.tsx:254` → `src/components/inbox/VoiceChanger.tsx:119-127` | rótulo: "Alterar Voz", "ElevenLabs"
- executa: `handleConvert(voice)` → `VoiceChanger.tsx:42`
- EF: **`elevenlabs-sts`** via `fetch` (`:52-59`), `FormData { audio: audio.webm, voiceId }` (`:48-50`)
- resposta: blob convertido reproduzido (`:66-79`); "Usar esta voz" (`:219-225`) devolve o blob ao recorder
- colateral: altera o áudio que será enviado pelo fluxo normal do recorder
- gating: `disabled` (prop) | teste: **nenhum**

### P25 — Transcrição em tempo real (STT) no diálogo do chat
- UI: `src/components/inbox/chat/ChatDialogs.tsx:62-68` → `src/components/inbox/RealtimeTranscription.tsx:115-141` | rótulo: "STT em Tempo Real" / "Parar STT" / "Ouvindo..."
- executa: `handleStart` (`:54`) → `useScribe` do SDK `@elevenlabs/react` (`:25-39`, `modelId: 'scribe_v2_realtime'` `:26`)
- EF: **`elevenlabs-scribe-token`** (`:62`) para obter token; o áudio vai direto para a ElevenLabs (WebSocket), **não** por edge function
- resposta: transcrição parcial/commitada exibida (`:165-189`); o transcript final é **concatenado no input** do chat (`ChatDialogs.tsx:65`)
- colateral: nenhum envio automático | gating: nenhum | teste: **nenhum**

### P26 — Botão de transcrição de áudio recebido (AudioMessagePlayer)
- UI: `src/components/inbox/AudioMessagePlayer.tsx:136-141` (e retry `:171`) | rótulo: ícone `FileText`, `title="Transcrever áudio"` / "Falhou - Tentar novamente"
- executa: `handleTranscribe()` → `:52`
- EF: **`ai-transcribe-audio`** (`:57`), body `{ audioUrl: freshUrl (URL assinada/renovada), messageId }` (`:56-57`)
- resposta: mostra (`:66`) **e persiste** — `update messages.transcription/transcription_status` (`:67`); também escuta Realtime em `messages` (`:39-50`)
- colateral: grava `transcription`/`transcription_status` em `messages`; dispara notificação global de transcrição concluída (`useTranscriptionNotifications`, ver P53)
- gating: nenhum | teste: **nenhum**

### P27 — Dictado por voz no mobile (Web Speech API, sem backend de IA)
- UI: `src/components/mobile/VoiceDictationButton.tsx:15` → `src/hooks/communication/useSpeechToText.ts:65`
- rótulo: botão de ditado (ícone microfone)
- EF: **nenhuma** — usa `window.SpeechRecognition/webkitSpeechRecognition` (`:59-63`), reconhecimento do próprio browser
- resposta: transcript local → input | colateral: nenhum | gating: `isSupported` (feature-detect, `:77`)
- teste: `src/hooks/__tests__/useSpeechToText.test.ts`, `src/components/mobile/__tests__/VoiceDictationButton.test.tsx`

### P28 — Overlay de voz global (busca por voz + TTS da resposta)
- UI: `src/components/layout/AppShell.tsx:70` (`useVoiceAgent`), `:22` (`VoiceSearchOverlayConnected` lazy) → `src/components/voice/VoiceSearchOverlayConnected.tsx:12`
- rótulo: overlay de voz global (aberto por atalho/aba)
- executa: `src/hooks/communication/useVoiceAgent.ts:17`
- EFs: **`elevenlabs-scribe-token`** (`:172`) para STT; **`voice-agent`** para interpretar o comando (`src/hooks/voice/processTranscript.ts:12`, body `{transcript}` `:19`); **`elevenlabs-tts-stream`** para falar a resposta (`src/hooks/voice/playTtsAudio.ts:142`, body `{text}` `:149`, em chunks de 220 chars)
- resposta: mostra `agentResponse` + executa `onAction` (`:107`) → mudança de view; TTS com **fallback para `speechSynthesis` do browser** em caso de 401/403/erro (`playTtsAudio.ts:114-136`, `:244-254`)
- colateral: navegação de view e log de comando (`logVoiceCommand`, `useVoiceAgent.ts:98-105`)
- gating: nenhum | teste: **nenhum**

### P29 — Classificar figurinha recebida e salvar na biblioteca (ação automática no clique)
- UI: `src/components/inbox/chat/MessageBubble.tsx:205-225` | rótulo: botão ícone `Download`, `title="Salvar na biblioteca"` (hover)
- executa: handler inline → `MessageBubble.tsx:214`
- EF: **`classify-sticker`** (`:214`), body `{ image_url: message.mediaUrl }`
- resposta: usa `classifyData.category` como categoria (`:215`) e **persiste** inserindo em `stickers` (`:217`)
- colateral: cria registro na biblioteca de figurinhas | gating: só para `!isSent` (`:204`)
- teste: **nenhum**

### P30 — Confirmação de upload de figurinha (categoria sugerida por IA)
- UI: blocos de pending upload em `src/components/inbox/stickers/…` (diálogo) — trigger em `src/hooks/sticker-picker/useStickerPicker.ts:47-65`
- rótulo: "🔍 Classificando figurinha com IA..." (`:59`) e "✅ Figurinha ... salva como ..." (`:73`)
- EF: **`classify-sticker`** (`:60`), body `{ image_url }`
- resposta: `aiCategory` pré-seleciona a categoria (`:63`) e é persistida no `insert` (`:71`)
- colateral: cria item na biblioteca | gating: nenhum | teste: **nenhum**

### P31 — Upload de emoji customizado (categoria por IA)
- UI: `src/hooks/integrations/useCustomEmojis.ts:50-98`; rótulo "🔍 Classificando emoji com IA..." (`:80`)
- EF: **`classify-emoji`** (`:81`), body `{ image_url, file_name }`
- resposta: `aiCategory` → categoria do `insert` (`:102-106`); colateral: cria emoji | gating: nenhum | teste: **nenhum**

### P32 — Upload de áudio meme (categoria por IA)
- UI: `src/hooks/communication/useAudioMemes.ts:80-153`; rótulo "🔍 Classificando com IA..." (`:135`)
- EF: **`classify-audio-meme`** (`:136`), body `{ audio_url, file_name }`
- resposta: `aiCategory` no pending (`:144`) → `insert` em `audio_memes` (`:157-161`); colateral: cria áudio na biblioteca
- gating: nenhum | teste: **nenhum**

---

## 3. Inbox — detalhes do contato e memória

### P33 — Widget "Insights da IA" (resumo compacto no painel de contato)
- UI: `src/components/inbox/contact-details/AIInsightsWidget.tsx:12`; render em `src/components/inbox/contact-details/ContactAccordionSections.tsx:87` | rótulo: "Insights da IA" (`:32`)
- executa: `useContactIntelligence` (`src/hooks/crm/useContactIntelligence.ts:91`)
- EF: **`crm-integration`** com `action: 'contactLookup'`, `lookup: 'intelligence'` (`:98`, via `src/lib/crmIntegration.ts:20`) — **não é uma função `ai-*`**; a IA roda no lado do CRM externo
- payload: `{ contactId, lookup: 'intelligence' }`; modelo: fora do frontend (**não verificado**)
- resposta: mostra só; cache React Query `staleTime 15 min` / `gcTime 30 min` (`:106-107`)
- colateral: nenhum | gating: **kill switch fail-closed** `useCRMIntegrationEnabled()` + `isExternalConfigured` (`AIInsightsWidget.tsx:13-16`, `ContactIntelligencePanel` depende do `enabled` do hook `:105`)
- teste: **nenhum**

### P34 — Painel "Inteligência comercial" completo (briefing, DISC, gatilhos, rapport, horários, churn)
- UI: `src/components/inbox/contact-details/ContactIntelligencePanel.tsx:257`; render em `ContactAccordionSections.tsx:109`
- rótulos: "Briefing pré-contato", "Perfil DISC — comunicação", "Gatilhos mentais sugeridos", "Rapport", "Melhores horários", "Risco de perda"
- executa: `useContactIntelligence(contactId)` (`:258`) — **mesma query de P33** (dedupe pelo React Query)
- EF: `crm-integration` / `contactLookup` / `intelligence` | resposta: **só mostra** (skeleton em `:260-268`, `null` se `!data.found` `:270`)
- colateral: nenhum | gating: `enabled: crmEnabled && !!contactId` (`useContactIntelligence.ts:105`)
- teste: **nenhum**

### P35 — Badge de briefing no cabeçalho do chat (hover)
- UI: `src/components/inbox/chat/ChatHeader.tsx:77-107` | rótulo: nome do contato com borda tracejada + tooltip (opening_tip, risk_alert, score, etapa, RFM, rapport)
- executa: `useContactIntelligence` (`ChatHeader.tsx:61`) | EF: `crm-integration` (idem P33)
- colateral: nenhum | gating: `crmIntegrationEnabled ? contactId : undefined` (`:61`)
- teste: `src/components/inbox/chat/__tests__/ChatPanelHeader.test.tsx` (cabeçalho do painel; cobertura do tooltip de inteligência **não verificado**)

### P36 — "Análise" (badges de sentimento/urgência/departamento)
- UI: `src/components/inbox/AnalysisBadges.tsx:27`; usos em `ChatHeader.tsx:136` (compact) e `ContactAccordionSections.tsx:133`
- executa: `useLatestAnalysis(contactId)` (`src/hooks/chat/useLatestAnalysis.ts:24`)
- EF: **nenhuma** — leitura direta de `conversation_analyses` (última linha, `:29-35`), cache 5 min (`:40`)
- resposta: só mostra | colateral: nenhum | gating: `enabled: !!contactId` (`:39`) | teste: **nenhum**

### P37 — Painel "Memória da Conversa" (fatos, objeções tratadas, promessas, pendências)
- UI: `src/components/inbox/ConversationMemoryPanel.tsx:119`; render em `ContactAccordionSections.tsx:116` | rótulo: "Memória da Conversa" + botão "Salvar" (`:121-124`)
- executa: `loadMemory()` (`:42`) e `saveMemory()` (`:84`)
- EF: **nenhuma** — leitura/escrita direta em `conversation_memory` (`:44-48`, `:97-99`). **Não há geração por IA**: os campos são digitados pelo agente (`:150-160`, `:166-184`)
- resposta: persiste em `conversation_memory` (`update`/`insert`, `:97-99`) | colateral: alimenta `useNextBestAction` (P14, `useNextBestAction.ts:100-104`)
- gating: nenhum | teste: **nenhum**

### P38 — Busca na Base de Conhecimento (painel do contato)
- UI: `src/components/inbox/KnowledgeBaseSearchPanel.tsx:17`; render em `ContactAccordionSections.tsx:131`
- executa: `useKnowledgeBaseSearch` (`src/hooks/integrations/useKnowledgeBaseSearch.ts:19`)
- EF: **nenhuma** — **RPC `search_knowledge_base`** (`:37-40`), debounce 300 ms (`:27`), mínimo 2 caracteres (`:44`)
- resposta: mostra até 5 artigos (`:39`) | colateral: inserir texto no input (via prop) | gating: nenhum | teste: **nenhum**

---

## 4. CRM / churn / tickets

### P39 — Botão "Análise IA" (Previsão de Churn)
- UI: `src/components/ai/ChurnPredictionDashboard.tsx:175-178` | rótulo: "Análise IA"
- executa: `runAIAnalysis()` → `:123`
- EF: **`ai-churn-analysis`** (`:126`), body `{ contactIds: risks.slice(0,20).map(contactId) }` (`:127`) — **até 20 contatos**
- resposta: **o resultado é descartado** — nenhuma leitura de `data`; apenas toast (`:130`) e re-execução da análise **local** (`:131`). No erro, toast "Análise local concluída" (`:134`)
- colateral: nenhum | gating: nav `churn` com `STAFF_ROLES` (`src/services/navigation.service.ts:76`); o componente em si não checa papel
- teste: `src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx` (render + lógica local; `functions.invoke` mockado para **falhar**)

### P40 — Botão "Atualizar" (Previsão de Churn) — cálculo local
- UI: `ChurnPredictionDashboard.tsx:171-174` | rótulo: "Atualizar"
- executa: `analyzeChurnRisk()` (`:32`) — consulta `contacts` (500 registros, `:36-40`) e **calcula o score no cliente** (`:45-98`)
- EF: nenhuma | resposta: estado local (`:102-110`) | colateral: nenhum | gating: STAFF_ROLES (nav)
- teste: `ChurnPredictionDashboard.test.tsx`

### P41 — Botão "Classificar em Lote" (Classificador de Tickets)
- UI: `src/components/ai/AutoTicketClassifier.tsx:157-160` (e vazio `:198`) | rótulo: "Classificar em Lote" / "Iniciar Classificação"
- executa: `runBatchClassification()` → `:118`
- EF: **`ai-classify-tickets`** (`:121`), body `{ limit: 50 }` (`:122`)
- resposta: **descartada** — só toast (`:125`) e recarga da tabela (`:126`); no erro, toast "Classificação local aplicada" (`:128`). As categorias/prioridades exibidas vêm de `classifyTag`/`derivePriority` **locais** (`:47-63`)
- colateral: nenhum | gating: nav `ticket-classifier` `STAFF_ROLES` (`navigation.service.ts:77`) | teste: `src/components/ai/__tests__/AutoTicketClassifier.test.tsx`

### P42 — Switch "Auto-classificar"
- UI: `AutoTicketClassifier.tsx:154` | rótulo: "Auto-classificar"
- executa: `setAutoClassify` (estado local, `:41`)
- EF: nenhuma; o estado **não é lido em nenhum outro ponto do arquivo** — verificado: só `:154` e `:41`. **Controle decorativo**
- gating: nenhum | teste: `AutoTicketClassifier.test.tsx:42-45` (só verifica o rótulo)

### P43 — Copiloto do Supervisor (pergunta livre + perguntas rápidas)
- UI: `src/components/admin/SupervisorCopilot.tsx:112-114` (enviar) e `:88-100` (5 perguntas rápidas); render em `src/components/admin/AdminView.tsx:279` (aba `copilot`) | rótulos: "Copiloto do Supervisor", "Pergunte sobre a operação...", "Quais filas estão em risco de SLA?", etc.
- executa: `askQuestion(q)` → `SupervisorCopilot.tsx:29`
- EF: **`ai-proxy`** (`:54`)
- payload: `messages: [ {system: contexto com nº de filas/agentes/mensagens 24h + nomes}, {user: pergunta} ]`, `model: 'google/gemini-3-flash-preview'` (`:56-60`) — **o frontend escolhe o modelo**; contexto montado com 3 consultas (filas ≤20, perfis ativos ≤50, contagem de mensagens 24h, `:37-42`)
- resposta: **só mostra** em lista local (`:66`), sem persistência. `supabase.auth.getSession()` é chamado em `:53` e o resultado **não é usado**
- colateral: nenhum | gating: `AdminView.tsx:89` (`if (!isSupervisor) return ...`) — só supervisor/admin; aba dentro do admin
- teste: **nenhum**

### P44 — Cards "Próxima melhor ação" no CRM 360° + criar tarefa
- UI: `src/components/inbox/tabs/Crm360Tab.tsx:225-243` | rótulo: "Próxima melhor ação" / botão "Criar tarefa →" (`:239`)
- executa: `useNextBestAction` (`:47`) e `createTask` (`:48`) | EF: nenhuma (heurística local)
- colateral: **cria tarefa** em `conversation_tasks` | gating: nenhum | teste: `src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx`

---

## 5. Dashboard e analytics

### P45 — Card "Modelo de IA Ativo" + 6 cards de features de IA
- UI: `src/components/dashboard/AIQuickAccess.tsx:67-89` (modelo ativo), `:106-120` (alertas), `:125-147` (6 features de `src/components/dashboard/aiFeatures.ts:23-74`)
- rótulos: "Modelo de IA Ativo", "Análises Disponíveis", "Alertas de Sentimento", "Sugestões de Resposta", "Análise de Conversa", "Alertas de Sentimento", "Resumo Automático", "Transcrição de Áudio", "Tendências de Sentimento"
- executa: `useAIStats(30)` (`:54`), `useActiveAIProvider()` (`:55`), `useAIFeatureNavigation()` (`:53`)
- EF: **nenhuma** — leituras de `conversation_analyses`, `messages.transcription`, `audit_logs` (`src/hooks/analytics/useAIStats.ts:57-118`) e `ai_providers` (`src/hooks/analytics/useActiveAIProvider.ts:15-20`)
- resposta: só mostra (cache; `useAIStats` com `refetchInterval 60s`, `useAIStats.ts:134`)
- colateral: **navegação**; dois cards navegam para `/sentiment-alerts` (`aiFeatures.ts:46,71`) e "Ver todas" também (`AIQuickAccess.tsx:154`) — **essa rota não existe** em `src/routes/AppRoutes.tsx:50-114` (só `/`, `/auth`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, `/2fa`, `/install`, `/chat-popup/:contactId`, `/queue/:id`, `/queues/comparison`, `/sla`, `/sla/history`, `/admin/roles`, `/admin/rate-limit`, `*`→NotFound) → **cai no NotFound**
- gating: nenhum no componente (a view `sentiment` da nav usa `STAFF_ROLES`, `navigation.service.ts:88`)
- teste: `src/components/dashboard/__tests__/DashboardView.test.tsx` (mocka `AIQuickAccess`), `AIToolsCard.test.tsx`

### P46 — Card "Inteligência Artificial" com 4 mini-tiles (overview)
- UI: `src/components/dashboard/overview/AIToolsCard.tsx:17-46`; render em `src/components/dashboard/DashboardView.tsx:212`
- rótulos: "Inteligência Artificial" + tiles de `AI_FEATURES` filtrados (`:19`)
- executa: `useAIFeatureNavigation()` (`:18`) | EF: nenhuma | colateral: navegação (mesma rota `/sentiment-alerts` nos dois tiles correspondentes)
- gating: nenhum | teste: `src/components/dashboard/__tests__/AIToolsCard.test.tsx`

### P47 — Tela "Tendência de Sentimento" (charts + insights + alertas recentes)
- UI: `src/components/dashboard/SentimentTrendChart.tsx:32`; KPI "Alertas de Sentimento" `:133-140`
- rótulos: "Tendência de Sentimento", "% Positivo", "% Negativo", "Alertas de Sentimento", "Principais insights", "Alertas recentes de sentimento", "Distribuição de Sentimento"
- executa: `useRealSentimentData(days)` (`src/components/dashboard/SentimentHelpers.tsx:21`) e `useRecentSentimentAlerts(days)` (`src/hooks/analytics/useRecentSentimentAlerts.ts:26`)
- EF: **nenhuma** — leitura de `conversation_analyses` + `contacts(name)` (`useRecentSentimentAlerts.ts:31-36`)
- resposta: só mostra; **agregações e insights calculados no cliente** (`SentimentTrendChart.tsx:37-103`, `SentimentHelpers.tsx:35-54`)
- gating: nenhum no componente | teste: `src/components/dashboard/__tests__/SentimentTrendCard.test.tsx`

### P48 — Tela "Consumo de IA" (admin)
- UI: `src/components/admin/AIUsageDashboard.tsx:13`; view `src/pages/ViewRouter.tsx:96` (`'ai-usage'`)
- rótulos: "Consumo de IA", filtro de período, abas de logs/usuários
- executa: `useAIUsageDashboard()` (`src/hooks/analytics/useAIUsageDashboard.ts:59`) — lê `ai_usage_logs` (`:67-70`) e `profiles` (`:80`)
- EF: nenhuma (telemetria já gravada pelo backend) | resposta: só mostra; agregações locais (`:91-138`)
- gating: nav `ai-usage` **`ADMIN_ONLY`** (`navigation.service.ts:140`, `ADMIN_ONLY` definido em `:35`)
- teste: **nenhum**

### P49 — "Saúde dos Provedores" (dentro da Gestão de IA)
- UI: `src/components/admin/... AIProviderHealthPanel.tsx:26`; render em `src/components/settings/AIProvidersManager.tsx:93`
- rótulos: "Saúde dos Provedores", "Taxa de Sucesso", "Latência Média", "Fallbacks", "Tokens Usados", "Chamadas Recentes"
- executa: query inline em `ai_usage_logs` filtrando `function_name = 'ai-proxy'` (`AIProviderHealthPanel.tsx:29-38`), `refetchInterval 30s`
- EF: nenhuma | resposta: só mostra (KPIs calculados no cliente, `:42-53`)
- gating: aba "Gestão IA" só para `isStaff` (`src/components/settings/SettingsView.tsx:120`)
- teste: **nenhum**

---

## 6. Configurações / administração de IA

### P50 — "Classificar Recentes" (Tags Automáticas por IA)
- UI: `src/components/settings/AIAutoTagsConfig.tsx:99-110` | rótulo: "Classificar Recentes" / "Classificando..."
- executa: `retagMutation.mutate()` → `:40-73`
- EF: **`ai-auto-tag`** (`:54`), body `{ contactId }` (`:55`) — disparado em **loop sequencial** para os 20 contatos mais recentes (`:43-47`), com **delay fixo de 1 s** entre chamadas (`:62`)
- resposta: invalida `['ai-tag-stats']` (`:67`) e recarrega o gráfico de distribuição; o resultado por contato **não** é exibido
- colateral: **grava tags de IA por contato** (tabela `ai_conversation_tags`, lida em `:19-21`)
- gating: aba `ai-tags` só com `isStaff` (`SettingsView.tsx:203-207`; `isStaff = isAdmin || isSupervisor`, `:40-43`)
- teste: mockado em `src/components/settings/__tests__/SettingsView.test.tsx:45` (não é testado de verdade)

### P51 — "Gestão IA": Novo Provedor / Testar conexão / Remover
- UI: `src/components/settings/AIProvidersManager.tsx:29-31` ("Novo Provedor"), `AIProviderCard.tsx:86-91` ("Testar conexão"), `:141-144` ("Remover Provedor")
- executa: `src/components/settings/ai-providers/useAIProviders.ts` — save/delete (`:29-71`), `handleTest` (`:73-95`)
- EF: **`ai-proxy`** no teste (`:76`) com `messages: [{system:"Responda apenas: TESTE OK"},{user:"Olá, teste de conexão."}]`, **`use_for: provider.use_for[0] || 'copilot'`** e **`provider_id: provider.id`** (`:77-84`) — **único ponto do frontend que escolhe o provedor por id**; cria/edita/remove linhas de `ai_providers` (`:31-51`, `:63`)
- resposta: toast com o conteúdo (`:87-88`); persistência em `ai_providers`
- colateral: altera configuração global de IA (afeta `useActiveAIProvider` → dashboard) | gating: `isStaff` (`SettingsView.tsx:227-231`)
- teste: mockado em `SettingsView.test.tsx:46`

### P52 — Testar Conexão / Salvar Configuração do Chatbot IA L1
- UI: `src/components/settings/ChatbotL1Config.tsx:232-244` ("Testar Conexão"), `:227-228` ("Salvar Configuração"), switch "Ativar Chatbot IA L1" (`:172`, estado `:44`, gravado em `:79` e `:87`)
- executa: `saveMutation` (`:68-105`) e handler inline de teste (`:232-242`)
- EF: **`chatbot-l1`** no teste (`:234`), body `{ contactId: 'test', message: 'Olá, teste de conexão', connectionId: 'test' }` (`:235`)
- resposta: teste só valida acessibilidade (toast, `:238`); salvar persiste em `chatbot_flows` (`:77-96`) com `trigger_type: 'ai_l1'` (`:88`)
- colateral: **habilita/desabilita o atendimento automático por IA L1** e o limiar de confiança que transfere para humano (badge `:186`, slider `:189`, default 60 em `:46`; a regra está descrita em `:221-222`) — efeito operacional direto na fila
- gating: aba `chatbot-l1` só com `isStaff` (`SettingsView.tsx:215-219`)
- teste: **nenhum**

### P53 — "Gerar Diálogo" (ElevenLabs multi-personagem) — aba Sons
- UI: `src/components/voice/ElevenLabsDialogue.tsx:148-151`; render em `SettingsView.tsx:168`
- rótulo: "Diálogo Multi-Personagem" / "Gerar Diálogo"
- executa: `generateDialogue()` → `:52`
- EF: **`elevenlabs-dialogue`** via `fetch` (`:62-76`), body `{ script: [{voice_id, text}], languageCode: 'pt' }` (`:71-74`) — exige ≥ 2 falas (`:54`); **vozes escolhidas manualmente** em `VOICES` (`:13-23`)
- resposta: blob de áudio com player (`:154-159`); **sem persistência**
- colateral: nenhum | **gating: NENHUM** — a aba "Sons" (`SettingsView.tsx:165-171`) **não** está sob `isStaff`, então agentes comuns veem/executam geração de áudio
- teste: mockado em `SettingsView.test.tsx:52`; **nenhum teste real**

### P54 — "Gerar Voz" (voice design ElevenLabs) — aba Sons
- UI: `src/components/voice/ElevenLabsVoiceDesign.tsx:140-143`; render em `SettingsView.tsx:169`
- rótulo: "Criar Voz Personalizada" / "Gerar Voz"
- executa: `generateVoice()` → `:22`
- EF: **`elevenlabs-voice-design`** via `fetch` (`:31-50`), body `{ action: 'generate', name, description, text, gender, age, accent }` (`:40-48`)
- resposta: preview em data URL (`:57-62`); **sem persistência**
- colateral: nenhum | gating: **nenhum** (mesma aba não restrita de P53)
- teste: mockado em `SettingsView.test.tsx:53`; **nenhum teste real**

### P55 — "Gerar com IA" (efeito sonoro/música) na Biblioteca de Mídia
- UI: `src/components/settings/MediaLibraryAdmin.tsx:58` (botão "Gerar com IA", só `type === 'audio_memes'`) → `src/components/settings/media-library/AIGenerateDialog.tsx:78` ("Gerar Preview") / `:80` ("Salvar na Biblioteca")
- EF: **`elevenlabs-sfx`** (`AIGenerateDialog.tsx:26`), body `{ prompt, duration, mode }` (`:26`); na gravação, **`classify-audio-meme`** (`:47`) com `{ audio_url, file_name: genPrompt }`
- resposta: preview local + upload para o bucket `audio-memes` (`:42-44`) e **insert em `audio_memes`** com a categoria sugerida (`:48`)
- colateral: cria ativo na biblioteca de áudio; **torna-se disponível para envio nos chats**
- gating: aba `media` só com `isStaff` (`SettingsView.tsx:188-195`)
- teste: `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx` cobre a tela (o diálogo de geração **não verificado**)

### P56 — "Reclassificar IA" e "Upload em massa" na Biblioteca de Mídia
- UI: `MediaLibraryAdmin.tsx:69` ("Reclassificar IA" sobre a seleção) e `:55-57` ("Upload em massa")
- executa: `useMediaLibrary.handleBulkReclassify` (`src/components/settings/media-library/useMediaLibrary.ts:166-187`) e `useMediaUpload.handleBulkUpload` (`src/components/settings/media-library/useMediaUpload.ts:46-89`)
- EF: **`classify-audio-meme` / `classify-sticker` / `classify-emoji`**, escolhida por tipo (`useMediaLibrary.ts:171`, `useMediaUpload.ts:66`); body `{ audio_url, file_name }` ou `{ image_url }` (`:174`, `:67-69`)
- resposta: atualiza a categoria no banco (`useMediaLibrary.ts:177`) / define a categoria do novo item (`useMediaUpload.ts:71,74`). **Só grava se `data.category !== item.category`** (`:176`)
- colateral: altera categorias de mídia em massa (afeta filtros/envio) | gating: `isStaff` (aba `media`)
- teste: `MediaLibraryAdmin.test.tsx`

---

## 7. Efeitos automáticos (sem clique do usuário)

### P57 — Alerta de sentimento disparado pela análise
- UI: sem UI própria — efeito de P03/P10 (`AIConversationAssistant.tsx:127-133`)
- executa: `useSentimentAlerts.checkAndTriggerAlert` (`src/hooks/inbox/useSentimentAlerts.ts:26`)
- EF: **`sentiment-alert`** (`:38`), body `{ contactId, contactName, sentimentScore, previousScore, analysisId, threshold, consecutiveRequired }` (`:40-47`); `threshold` default 30 (`:22`), `consecutiveRequired` default 2 (`:23`)
- resposta: se `alerted` e `notifyCaller !== false` → toast + som + notificação de browser (`:56-86`), com dedupe por `analysisId` (`:59`)
- colateral: notificação; **não** muda fila/prioridade no cliente | gating: `sentimentAlertEnabled` nas settings (`:24`) — e o comentário no código (`:29-33`) diz explicitamente que o cliente **não** deve usar suas próprias preferências para bloquear a requisição
- teste: `src/hooks/__tests__/useSentimentAlerts.test.ts`

### P58 — Alerta de sentimento por Realtime (provider global)
- UI: sem UI própria; montado em `src/App.tsx:61` → `src/components/notifications/RealtimeSentimentAlertProvider.tsx:7`
- executa: `useRealtimeSentimentAlerts` (`src/hooks/inbox/useRealtimeSentimentAlerts.ts:31`) — subscription `INSERT` em `notifications` (`:89-103`)
- EF: nenhuma | resposta: toast + som + ordenação para a aba `ai` via clique em `[value="ai"]` (`:57-61`)
- colateral: notificação | gating: `settings.sentimentAlertEnabled === false` bloqueia (`:36`) | teste: `src/hooks/__tests__/useRealtimeSentimentAlerts.test.ts`

### P59 — Notificação "Áudio transcrito"
- UI: sem UI própria; montado em `src/pages/Index.tsx:82` → `src/hooks/communication/useTranscriptionNotifications.ts:14`
- executa: subscription Realtime em `messages` (`:33-104`) detectando `transcription_status: completed`
- EF: nenhuma | resposta: toast + som + notificação de browser (`:81-100`), com dedupe por id (`:51-54`)
- colateral: notificação | gating: `settings.transcriptionNotificationEnabled` (`:31`) | teste: `src/hooks/__tests__/useTranscriptionNotifications.test.ts`

---

## Seção (a) — Recursos de IA visíveis na UI cujo resultado do backend não é aplicado (recomputação local conflitante)

1. **Previsão de Churn — "Análise IA" descarta a resposta e mostra cálculo local.** `ChurnPredictionDashboard.tsx:126-131` invoca `ai-churn-analysis` mas nunca lê `data`; o que aparece na tela (score %, nível, motivos) vem de `:45-98`. No erro, o toast diz "Análise local concluída com sucesso!" (`:134`), mascarando a falha. O botão "Análise IA" não altera nenhum número.
2. **Classificador de Tickets — categoria e prioridade são locais, não da IA.** `AutoTicketClassifier.tsx:121-126` invoca `ai-classify-tickets` e ignora o retorno; categoria/prioridade/confiança exibidas vêm de `classifyTag` (`:47-55`) e `derivePriority` (`:57-63`) sobre `ai_conversation_tags.tag_name`, com `confidence * 100` calculado no cliente (`:86`).
3. **Switch "Auto-classificar" sem efeito.** `AutoTicketClassifier.tsx:154` só grava estado local (`:41`); nenhum outro trecho do arquivo o lê.
4. **Resumo de conversa nunca é reidratado.** `ConversationSummary.tsx:31/41` suportam `initialSummary`, mas nenhum caller passa a prop (verificado por busca em `src/`); o resumo de P04/P15 existe apenas durante a vida do componente e é descartado ao fechar o painel.
5. **Análise profunda não é persistida pelo frontend.** `useConversationAnalyses.saveAnalysis` (`:68-103`) existe e tem teste de existência, mas `AIConversationAssistant.tsx:122` só faz `refetch()`. Se a edge function não gravar, o histórico (`AnalysisTabs`) fica vazio — **não verificado** se a EF grava.
6. **`SupervisorCopilot` busca a sessão e não usa.** `SupervisorCopilot.tsx:53` (`supabase.auth.getSession()`), resultado nunca referenciado.
7. **Cards de feature navegam para rota inexistente.** `aiFeatures.ts:46,71` e `AIQuickAccess.tsx:154` apontam para `/sentiment-alerts`; `src/routes/AppRoutes.tsx:50-114` não define essa rota → `NotFound` (`:114`). As features "Alertas de Sentimento" e "Tendências de Sentimento" (2 dos 6 cards) não levam a lugar nenhum.
8. **Enum de sentimento inconsistente em `useAIStats`.** `useAIStats.ts:72-74,78,89-91` compara `a.sentiment === 'positive' / 'negative'` (inglês), enquanto o resto do frontend usa `'positivo'/'negativo'/'neutro'/'critico'` (`AnalysisBadges.tsx:8-11`, `useRecentSentimentAlerts.ts:45`, `SentimentHelpers.tsx:42-44`). Com o vocabulário PT, as contagens/trends de positivos e negativos do dashboard de IA tendem a zero.

## Seção (b) — Estado/cache que não é limpo ao trocar de contato / usuário / fila

1. **Painel de Memória da Conversa mantém os dados do contato anterior.** `ConversationMemoryPanel.tsx:42-61`: `loadMemory` só escreve estado **se** houver linha (`if (data) {`, `:49`) e **não há `else`** de reset. Ao trocar para um contato **sem** registro em `conversation_memory`, fatos/objeções/promessas/pendências e os resumos do contato anterior continuam na tela. `newItems` (`:40`) também não é resetado. Risco direto de vazamento de contexto comercial entre contatos.
2. **Sugestões de IA não são invalidadas na troca de contato.** `AISuggestions.tsx:31-85`: não existe efeito dependente de `contactId` (o hook recebe `contactId`, `:51-58`). Se o popover estiver aberto (`isOpen`, `:32`) e o contato mudar (ex.: inbox em modo lista), as sugestões do contato anterior seguem visíveis até o usuário clicar em uma delas (`handleSelect` só limpa em `:83-84`).
3. **`AIEnhanceButton` guarda o texto original do aprimoramento entre renders.** `AIEnhanceButton.tsx:43,53,86-92`: `originalMessage` só é limpo no undo, em erro ou novo aprimoramento — não em troca de conversa. Se o componente não for remontado na troca (não verificado), o "desfazer" pode restaurar o texto de outro contato.
4. **Limpo corretamente (referência de contraste):** `useObjectionDetector.ts:52-58`, `useUniversityHelp.ts:55-68`, `ConversationSummary.tsx:39-40`, `AIConversationAssistant.tsx:67-71`, `ConversationTabContent.tsx` (abas não-chat são montadas/desmontadas, `:84-134`), `RealtimeInboxView.tsx:70-78` (aba volta a `chat` na troca de contato).
5. **Cache de 15 min de inteligência do contato:** `useContactIntelligence.ts:106-107` (`staleTime 15 min`, `gcTime 30 min`) chaveado por `contactId` — não vaza entre contatos, mas atrasa a atualização do briefing em até 15 min; `useLatestAnalysis.ts:40` idem (5 min).

## Seção (c) — Onde o frontend escolhe modelo/provedor

1. **Modelo hardcoded em 3 arquivos (mesma string `'google/gemini-3-flash-preview'`):**
   - `src/components/admin/SupervisorCopilot.tsx:60`
   - `src/hooks/inbox/useObjectionDetector.ts:94` (análise) e `:136` (reescrita)
   - `src/hooks/ui/useUniversityHelp.ts:116`
2. **Provedor escolhido por id (único caso):** `src/components/settings/ai-providers/useAIProviders.ts:76-85` envia `use_for` + `provider_id` ao `ai-proxy` (teste de conexão). O catálogo é a tabela `ai_providers` (`:19-23`), cujo campo `model` é editável na UI (`:39`).
3. **Modelo resolvido no backend (cliente não envia `model`):** `ai-suggest-reply` (`AISuggestions.tsx:51-60`), `ai-conversation-summary` (`ConversationSummary.tsx:63-65`), `ai-conversation-analysis` (`AIConversationAssistant.tsx:89-102`), `ai-enhance-message` (`AIEnhanceButton.tsx:56-58`, `AIRewriteButton.tsx:43-45`), `ai-auto-tag` (`AIAutoTagsConfig.tsx:54-56`), `ai-classify-tickets` (`AutoTicketClassifier.tsx:121-123`), `ai-churn-analysis` (`ChurnPredictionDashboard.tsx:126-128`), `ai-transcribe-audio` (`AudioMessagePlayer.tsx:57`), `sentiment-alert` (`useSentimentAlerts.ts:38-48`), `chatbot-l1` (`ChatbotL1Config.tsx:234-236`), `classify-*`, `elevenlabs-*`, `voice-agent`. Qual modelo cada uma usa: **não verificado** (fora do escopo do frontend).
4. **Inconsistência:** o modelo hardcoded de (1) ignora o provedor ativo do dashboard (`useActiveAIProvider.ts:15-20`) e o campo `model` de `ai_providers`. Trocar o provedor em Configurações **não** muda o modelo usado por Supervisor Copilot, Detector de Objeções e Ajuda dos Universitários.

## Seção (d) — Onde o frontend calcula localmente algo que o backend já devolve

| Cálculo local | Arquivo:linha | O backend devolve equivalente? |
|---|---|---|
| Score/nível/motivos de churn | `ChurnPredictionDashboard.tsx:45-98` | Sim — `ai-churn-analysis` é invocado em `:126` e ignorado |
| Categoria e prioridade de ticket | `AutoTicketClassifier.tsx:47-63`, `:85-86` | Sim — `ai-classify-tickets` (`:121`) e `ai_conversation_tags.confidence` |
| Tendência de sentimento (`improving/declining/stable`) | `useConversationAnalyses.ts:109-125` | Não confirmado — a EF pode devolver tendência; **não verificado** |
| Score de sentimento default 50 | `AIConversationAssistant.tsx:124,153` | Sim (`result.sentimentScore`) — o `|| 50` mascara ausência de campo |
| Percentuais/score médio de sentimento | `SentimentHelpers.tsx:35-54` | Não aplicável (agregação de várias análises) |
| Contagens e trends de positivos/negativos | `useAIStats.ts:72-74,126-131` | Não aplicável, mas ver bug de enum na seção (a) |
| Insights textuais de sentimento | `SentimentTrendChart.tsx:77-103` | Não — texto gerado no cliente (não é IA) |
| Vários KPIs de uso de IA (tokens, latência, uniques) | `useAIUsageDashboard.ts:91-138`, `AIProviderHealthPanel.tsx:42-53` | Não aplicável |
| "Próxima melhor ação" | `useNextBestAction.ts:32-145` | Não — não existe EF de IA para isso |
| Fallback de TTS para `speechSynthesis` do browser | `playTtsAudio.ts:114-136,244-254` | Sim — é fallback quando a ElevenLabs falha/401 |
| Categoria sugerida com default `'outros'` | `AIGenerateDialog.tsx:46-47`, `useMediaUpload.ts:64-72` | Sim (`classify-*`) — mantém default se a EF falhar |
| Sentimento exibido na aba IA | `AiTab.tsx:59` (`contacts.ai_sentiment`) | Conflita com `conversation_analyses.sentiment` usado em `AnalysisBadges.tsx:28-33` |

## Seção (e) — Cobertura de teste automatizado

**Fluxos COM teste automatizado:**
- `src/components/inbox/tabs/__tests__/AiTab.test.tsx` — render, empty states, "Usar resposta" (todos os filhos de IA mockados)
- `src/components/inbox/__tests__/ConversationSummary.test.tsx` — render + `initialSummary` (chamada à EF não é coberta)
- `src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx` — render + lógica local (EF mockada para falhar) — `// @ts-nocheck`
- `src/components/ai/__tests__/AutoTicketClassifier.test.tsx` — render + `classifyTag` local — `// @ts-nocheck`
- `src/hooks/__tests__/useSentimentAlerts.test.ts`
- `src/hooks/__tests__/useRealtimeSentimentAlerts.test.ts`
- `src/hooks/__tests__/useConversationAnalyses.test.tsx` (só verifica que `saveAnalysis` existe, `:98-101`)
- `src/hooks/__tests__/useSpeechToText.test.ts`, `src/hooks/__tests__/useTranscriptionNotifications.test.ts`
- `src/components/mobile/__tests__/VoiceDictationButton.test.tsx`
- `src/components/dashboard/__tests__/AIToolsCard.test.tsx`, `SentimentTrendCard.test.tsx`, `DashboardView.test.tsx` (mocka IA)
- `src/components/settings/__tests__/SettingsView.test.tsx` (mocka `AIAutoTagsConfig`, `AIProvidersManager`, `ElevenLabsDialogue`, `ElevenLabsVoiceDesign` — `:45-53`), `MediaLibraryAdmin.test.tsx`
- `src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx`, `src/components/inbox/chat/__tests__/ConversationTabs.test.tsx`, `ChatPanelHeader.test.tsx`
- `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts` / `team-chat-exhaustive-audit.test.ts` (assertivas **de código-fonte** sobre `AIRewriteButton`/`TextToAudioButton`, não de comportamento)

**Fluxos SEM nenhum teste automatizado (todos os pontos abaixo têm `teste: nenhum`):**
`AISuggestions`, `ObjectionDetector`, `UniversityHelp`, `AIConversationAssistant`, `useObjectionDetector`, `useUniversityHelp`, `AIRewriteButton`, `AIEnhanceButton`, `TextToAudioButton`, `useTextToSpeech`, `VoiceChanger`, `VoiceChangerPicker`, `RealtimeTranscription`, `AudioMessagePlayer` (transcrição), `useVoiceAgent`, `processTranscript`, `playTtsAudio`, `ElevenLabsDialogue`, `ElevenLabsVoiceDesign`, `AIToolsPopover`, `InputExtraTools`, `ContactIntelligencePanel`, `AIInsightsWidget`, `ChatHeader` (briefing IA), `AnalysisBadges`, `useLatestAnalysis`, `useContactIntelligence`, `ConversationMemoryPanel`, `NextBestActionEngine`/`useNextBestAction`, `SupervisorCopilot`, `AIAutoTagsConfig`, `AIProvidersManager`/`useAIProviders`, `AIProviderHealthPanel`, `ChatbotL1Config`, `AIUsageDashboard`/`useAIUsageDashboard`, `useAIStats`, `useRecentSentimentAlerts`, `useRealSentimentData`, `AIGenerateDialog`, `useStickerPicker`, `useCustomEmojis`, `useAudioMemes` (classificação), `useMediaLibrary.handleBulkReclassify`, `useMediaUpload`, `KnowledgeBaseSearchPanel`/`useKnowledgeBaseSearch`, `QuickActionChips`, `aiFeatures`/`useAIFeatureNavigation`, `AIQuickAccess`.

---

## Seção (f) — Resumo das rotas/hooks por edge function (visão consolidada)

| Edge function | Chamada em (arquivo:linha) | Contexto |
|---|---|---|
| `ai-proxy` | `SupervisorCopilot.tsx:54`, `useObjectionDetector.ts:70,130`, `useUniversityHelp.ts:104`, `useAIProviders.ts:76` | copiloto gerencial, objeções, ajuda universitários, teste de provedor |
| `ai-suggest-reply` | `AISuggestions.tsx:51` | sugestões de resposta (inbox / aba IA / toolbar) |
| `ai-conversation-summary` | `ConversationSummary.tsx:63` | resumo de conversa |
| `ai-conversation-analysis` | `AIConversationAssistant.tsx:89` | análise profunda + gatilho de alerta |
| `ai-enhance-message` | `AIEnhanceButton.tsx:56`, `AIRewriteButton.tsx:43` | reescrita por tom |
| `ai-churn-analysis` | `ChurnPredictionDashboard.tsx:126` | lote de até 20 contatos (resultado descartado) |
| `ai-classify-tickets` | `AutoTicketClassifier.tsx:121` | lote de 50 (resultado descartado) |
| `ai-auto-tag` | `AIAutoTagsConfig.tsx:54` | 20 contatos em loop, 1 s de intervalo |
| `ai-transcribe-audio` | `AudioMessagePlayer.tsx:57` | transcrição sob demanda de áudio recebido |
| `sentiment-alert` | `useSentimentAlerts.ts:38` | alerta após análise |
| `chatbot-l1` | `ChatbotL1Config.tsx:234` | teste de conexão (produção roda no backend) |
| `classify-sticker` | `useStickerPicker.ts:60`, `MessageBubble.tsx:214`, `useMediaLibrary.ts:175`, `useMediaUpload.ts:70` | categorização de imagem |
| `classify-emoji` | `useCustomEmojis.ts:81`, `useMediaLibrary.ts:175`, `useMediaUpload.ts:70` | categorização de emoji |
| `classify-audio-meme` | `useAudioMemes.ts:136`, `AIGenerateDialog.tsx:47`, `useMediaLibrary.ts:175`, `useMediaUpload.ts:70` | categorização de áudio |
| `crm-integration` (`contactLookup`/`intelligence`) | `useContactIntelligence.ts:98` → `lib/crmIntegration.ts:20` | briefing/DISC/gatilhos/churn do CRM externo |
| `elevenlabs-scribe-token` | `RealtimeTranscription.tsx:62`, `useVoiceAgent.ts:172` | token para STT (áudio vai direto à ElevenLabs) |
| `voice-agent` | `processTranscript.ts:12` | interpretação do comando de voz |
| `elevenlabs-tts` | `TextToAudioButton.tsx:59`, `useTextToSpeech.ts:99-103` | TTS sob demanda |
| `elevenlabs-tts-stream` | `playTtsAudio.ts:142`, `useTextToSpeech.ts:99-103` | TTS em streaming (voz global/análises) |
| `elevenlabs-sts` | `VoiceChanger.tsx:52` | speech-to-speech |
| `voice-changer` | `VoiceChangerPicker.tsx:117` | troca de voz por preset (25 presets) |
| `elevenlabs-dialogue` | `ElevenLabsDialogue.tsx:62` | diálogo multi-voz |
| `elevenlabs-voice-design` | `ElevenLabsVoiceDesign.tsx:31` | criação de voz |
| `elevenlabs-sfx` | `AIGenerateDialog.tsx:26` | geração de SFX/música |

## Lacunas explicitamente não verificadas

1. Se cada edge function grava em tabela (ex.: `ai-conversation-analysis` → `conversation_analyses`; `ai-suggest-reply` → nada). O frontend **não** persiste nesses fluxos.
2. Qual modelo/provedor cada edge function usa quando o cliente não envia `model`.
3. Se existe algum caller do repo passando `initialSummary` para `ConversationSummary` fora dos testes.
4. Se as RPCs/policies (`search_knowledge_base`, `ai_conversation_tags`, `conversation_memory`) restringem leitura por papel.
5. Se o `disabled` de `VoiceChangerPicker`/`VoiceChanger` é acionado por algum caller do inbox (apenas os usos listados foram vistos).
6. Se há feature flag/tier comercial gate-ando IA no inbox (`useFeatureFlag`/`usePermissions` **não** aparecem nos componentes de IA lidos).
