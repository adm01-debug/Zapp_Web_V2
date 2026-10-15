# Paridade doc 11 (2ª passada) — IA e voz: NextBestAction, Objeções, TTS/STT, Voice Changer — 13/10/2026

Recorte: NextBestActionEngine, ObjectionDetector(+Parts), RealtimeTranscription, VoiceChanger, VoiceChangerPicker(+Parts), VoiceSelector, TextToAudioButton, TextToSpeechButton, SpeedSelector, useAudioMessagePlayer, useAudioRecorderUI, audioMemeConstants, Edges `elevenlabs-tts`, `elevenlabs-scribe-token`, `voice-changer`, `ai-transcribe-audio`. Achados A1, A2, A3, A7 do doc 11.

Fontes lidas: V3 `origin/main` (`src/features/inbox/components/*`, `src/hooks/useObjectionDetector.ts`, `supabase/functions/<edge>/index.ts`); V2 `.integrador` (HEAD 96dd72dc5f, 12/10 20:09). SOMENTE LEITURA.

AVISO IMPORTANTE (cartões "done" que ainda não estão na `.integrador`): o código V2 lido é o de 12/10 20:09. Cartões já `done` no quadro mas ainda NÃO presentes nesse HEAD (confirmei pelo código): PE-55/PE-56 (`AudioMessagePlayer.tsx:71` ainda faz o UPDATE no navegador), VZ1 (`VoiceChanger.tsx:99-107` ainda sem catch), PE-59 (gravador sem pausa), PE-60 (botões sem nome), PE-62 (`NextAction.action` ainda nunca preenchido), PE-24, PE-63, AY1. CP1 já está no HEAD em parte (`copiarTexto`). Onde eu disser "coberto por X (done)", o Claude deve conferir que X já está na branch viva antes de dar o assunto por encerrado.

## 0. ATENÇÃO sobre a Edge `voice-changer`

A Edge `voice-changer` TEM chamador na V2: `src/components/inbox/VoiceChangerPicker.tsx:158` (usado em `chat/ChatInputToolbars.tsx:62` e `team-chat/TeamChatInputArea.tsx:86`). NÃO remover. O cartão PE-66 (`t_252730d5`, "remover a Edge voice-changer sem chamador") partia de premissa falsa (só olhou `VoiceChanger.tsx`, que usa `elevenlabs-sts`); ele já está `archived`: manter arquivado. O caminho certo é ENDURECER a função (lacuna G3). Há também o cartão SL-010b-2 (`t_65fedb4a`, todo, workeria: kill switch em tts, tts-stream, sfx, voice-changer): coordenar para não conflitar com G3/G5.

## 1. Achados do doc 11 pedidos (A1, A2, A3, A7)

| Achado | Veredito | Evidência V3 | Evidência V2 | Cartão |
|---|---|---|---|---|
| A1 anon key na Edge paga (TextToAudioButton) | MELHOR_NA_V2 (o achado era exagerado até na V3) | `TextToAudioButton.tsx:81-82`: usa `session?.access_token ?? anon` (anon só de fallback); a Edge V3 faz `requireUser` (`elevenlabs-tts/index.ts:18`) e rejeita anon. Pior: `VoiceSelector.tsx:190-191` (V3) manda SÓ a anon key (a prévia daria 401) | `TextToAudioButton.tsx:70` `...(await edgeAuthHeaders())`; `lib/edgeAuthHeaders.ts` (sessão; anon só de fallback, a Edge responde 401). Edge `elevenlabs-tts/index.ts:12-15` `requireAuth` + `enforceRateLimit(userId, 20/min)` persistente + ledger + allowlist de voz/modelo + `text` máx 5000 | nada a fazer |
| A2 auth inconsistente em voice-changer | MELHOR_NA_V2 | `VoiceChanger.tsx:166-167` (V3) também usa `session ?? anon` (o doc exagerou) | `VoiceChanger.tsx:53-58` (V2) NÃO chama `voice-changer`: usa `elevenlabs-sts` com `edgeAuthHeaders()` (Edge endurecida). `VoiceChangerPicker.tsx:157-166` usa `session?.access_token \|\| anon`; Edge `voice-changer/index.ts:41-44` `requireAuth` + 10/min por usuário | nada a fazer quanto à auth. Lacuna na Edge: G3 |
| A3 NextBestAction sem handler | LACUNA (idêntica na V3) | `NextBestActionEngine.tsx:30` `action?` nunca preenchido; `:218` `cursor-pointer` | `hooks/chat/useNextBestAction.ts:21` `action?` nunca preenchido; `NextBestActionEngine.tsx:44` `cursor-pointer hover:shadow` num `div` sem `onClick`, sem `role`, sem teclado | PE-62 `t_c52df76b` (done, não integrado). Resto em G12 |
| A7 `isLocked` sempre falso / `_voiceChanged` | LACUNA_PARCIAL (a V2 trocou o defeito por outro) | `useAudioRecorderUI.ts:33-34` `isLocked` sem setter, `_voiceChanged` nunca lido | `AudioRecorder.tsx:29-30,100,109,235`: `isLocked` tem setter e só esconde o botão "Travar gravação" (mobile); travar não faz nada (a gravação é por toque), o arrastar para cancelar (`:118-129`) continua ativo travado e `isLocked` nunca volta a `false`. `voiceChanged` (`:29,100`) nunca é lido. `handleVoiceChanged` (`:97-104`) cria `URL.createObjectURL` sem revogar (a V3 revoga: `useAudioRecorderUI.ts:68-75,219-232`) | PE-59 NÃO cobre. Novo: G8 |

## 2. Tabela comportamento a comportamento

Legenda: EQ = equivalente; MV2 = MELHOR_NA_V2 (não devolver); LAC = lacuna; DEC = decisão/não aplicável.

| # | Item | Classe | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|---|
| 1 | NBA: fontes de dados | MV2 | `NextBestActionEngine.tsx:64-81` `rpc_get_contact_summary_batch` + `conversation_memory`; cache compartilhado SLA/mensagens | `useNextBestAction.ts:32,83-98` usa `OPEN_TASK_STATUSES` (estados reais), erros de leitura viram "Pendências não verificadas" (`:158-168`), SLA diz qual prazo venceu (`:108-125`). RLS de `conversation_memory`: `is_contact_visible_to_user OR is_admin_or_supervisor` (migration `20260409222809:131-137`) | nenhum |
| 2 | NBA: SLA com várias linhas | LAC | cache compartilhado | `useNextBestAction.ts:100-104` `.maybeSingle()` falha com 2+ linhas | PK-07 (`paridade-06/cards_1.py:57`) |
| 3 | NBA: refetch quando chega mensagem; cache | LAC | cache 30 s | `useEffect` sem cache, 3 consumidores | `paridade-hooks06/cards_4_realtime.py:14` |
| 4 | NBA: id não-UUID | LAC (baixa) | `:55` `isValidUUID` antes de consultar | sem validação; id inválido vira "Pendências não verificadas" | nenhum (G12) |
| 5 | NBA: isolar erro do painel | LAC | `SectionErrorBoundary` (`ChatPanelOverlays.tsx:36-40`) | só Suspense (`ChatPanel.tsx:36,452`) | `paridade-v3/faixa_k.py:105` |
| 6 | NBA: cartão clicável sem ação | LAC | idem | idem | PE-62 |
| 7 | Objeções: erro/formato/troca de contato | MV2 | V3 zera a lista no erro e trata resposta vazia como "sem objeção" | `hooks/inbox/useObjectionDetector.ts:48-58,67-77,120-154` geração IA-048, N-169, `confidence` limitada | testes `useObjectionDetector.n169/ia048` |
| 8 | Objeções: copiar | MV2 | `navigator.clipboard.writeText` + "Copiado!" sempre | `useObjectionDetector.ts:201-205` `copiarTexto`/`avisarCopia` | CP1 (já no HEAD em parte) |
| 9 | Objeções: severidade Baixo/Médio/Alto | MV2 | só `ConfidenceBadge` | `ObjectionDetector.tsx:44-74` `SeverityChip` | teste `ObjectionDetector.severidade` |
| 10 | Objeções: nomes acessíveis, `aria-live`, trava de 3 s, timers, "Usar" apaga rascunho, janela de mensagens | LAC | V3 tem `role=status`/`alert` | `ObjectionDetector.tsx:85-93,242` botões só com ícone; `useObjectionDetector.ts:82,206` | AY1, QA1, QA2, QA4 |
| 11 | objectionDetectorParts / voiceChangerParts (UI pura separada) | DEC | arquivos de apoio | V2 mantém no próprio componente (`ObjectionDetector.tsx:35-153`) | n/a (organização, sem comportamento) |
| 12 | RealtimeTranscription: token, VAD, desmontagem | MV2 | `RealtimeTranscription.tsx:52-100` | V2 `:54-98` acrescenta trava de clique duplo (`connectingRef`) e `isMountedRef`; `useScribe` já desconecta ao desmontar (`node_modules/@elevenlabs/react/dist/scribe.js:27-29,326`) | nenhum |
| 13 | RealtimeTranscription: 401 vira "Chave da ElevenLabs inválida" | LAC | idem | `:64-70`: qualquer erro com '401' ou 'invalid' mostra "chave inválida", inclusive sessão do usuário expirada (a Edge devolve 401 também para JWT ruim) | nenhum (G12) |
| 14 | RealtimeTranscription: leitor de tela, espaço inicial | LAC | idem | `:151-186` "Ouvindo…"/parcial sem `aria-live`; `chat/ChatDialogs.tsx:81` `prev + ' ' + text` deixa espaço no começo | nenhum (G12) |
| 15 | RealtimeTranscription: log de fala | MV2 | `log.debug(text)` | idem, mas `lib/logger.ts:51` suprime debug/info fora de dev | nenhum |
| 16 | RealtimeTranscription sem teste | LAC | n/a | nenhum teste achado | PE-63 (done) |
| 17 | Edge `elevenlabs-scribe-token`: auth/limite/ledger | MV2 | `requireUser`, limite em memória | `index.ts:12-15` `requireAuth` + `enforceRateLimit` 30/min persistente; `:32-47` ledger | `paridade-07/achados_2_voz_sip_midia.md` item 20 |
| 18 | scribe-token: timeout 10 s, 500 sem detalhe | LAC | `fetchWithRetry` timeout 10 s; 500 genérico | `index.ts:23` `fetch` sem timeout; `:61-63` devolve `error.message` | PH-06 `t_22a7d503` (ready) |
| 19 | Edge `elevenlabs-tts`: auth, voz/modelo, tamanho, log | MV2 | texto até 10000; `voiceId` livre; log com 50 caracteres do texto (`:36`) | `index.ts:12-15`; `schemas.ts:220-226` `text` máx 5000, voz e modelo em allowlist fechada (as 11 vozes da UI estão na lista: conferido por script); `:27-29` log só com tamanho; `:59-74` ledger por caractere | nenhum |
| 20 | elevenlabs-tts: timeout e repetição no provedor | LAC | `fetchWithRetry` timeout 30 s (`:38-63`) | `index.ts:32-53` sem timeout; `:93` 500 com `error.message` interno | PH-06 não cobre `elevenlabs-tts` nem `elevenlabs-sts`. Novo: G5 |
| 21 | elevenlabs-tts: teste | LAC | contrato V3 só para `tts-stream` e `voice-changer` | sem `index.test.ts` (existe para `sts`, `tts-stream`, `dialogue`) | novo (G5) |
| 22 | Edge `voice-changer`: auth e limite | MV2 | `requireUser` + 5/min em memória; ramo de serviço | `index.ts:41-44` `requireAuth` + 10/min persistente | nenhum |
| 23 | voice-changer: fila `voice_conversion_queue`, `claim_next_voice_task`, `sts_telemetry`, `record_voice_telemetry`, vozes "clonadas" com `authorized` | DEC | `voice-changer/index.ts:99-136,148-150,159-197,249-267` | V2 só tem o fluxo direto (grave, transforme, ouça, envie); não há `voice_conversion_queue` nas migrations; na V3 nada além da própria Edge insere na fila (git grep: só leituras em `useAudioMessagePlayer.ts:122` e `VoiceChanger.tsx:122`), ou seja, consumidor sem produtor | PE-66 registra a decisão (STS direto, VZ1 cobre). Decisão: NÃO portar a fila |
| 24 | voice-changer: teto de tamanho, magic bytes, content-length antes do `formData` | LAC (V2 pior que a Edge irmã) | V3 não tinha | `voice-changer/index.ts:49-59` lê o corpo todo (`req.formData()`) antes de checar 10 MB e não confere o conteúdo; `elevenlabs-sts/index.ts:21-90,106-120` já faz as duas coisas | novo: G3 |
| 25 | voice-changer: ledger de custo | LAC | sem ledger na V3 | não importa `logAiUsageDetached`; está em `PENDENTES_DECLARADAS` (`_shared/__tests__/consumo-pago-no-ledger.test.ts:60`): dívida declarada e SEM cartão | novo: G3 |
| 26 | voice-changer: timeout | EQ | 60 s | `index.ts:86` 30 s (áudio de até 10 MB pode estourar) | G3 |
| 27 | voice-changer: teste | LAC | `__tests__/contract.test.ts` na V3 | nenhum teste na pasta | G3 |
| 28 | Edge `ai-transcribe-audio`: auth e autorização do objeto | MV2 (muito) | proxy que só confere que existe `authorization` e limita por IP (`:14-23`) | `index.ts:199-210` `requireAiIdentityOrService`; `:241-260` prova visibilidade da mensagem ANTES do download e usa só a `media_url` do registro; `ssrf.ts` com buckets aprovados; magic bytes (SL-195a); teto 25 MB | `index.test.ts` |
| 29 | ai-transcribe-audio: ledger de custo | LAC | n/a | sem `logAiUsageDetached` (`PENDENTES_DECLARADAS`) | novo: G4 |
| 30 | ai-transcribe-audio: timeout no download e no STT | LAC | proxy com `AbortSignal.timeout(60 s)` | `index.ts:60,310-317` sem timeout; tamanho só conferido depois de baixar tudo | novo: G4 |
| 31 | ai-transcribe-audio: limite por IP em memória (10/min) além do por usuário | LAC | n/a | `index.ts:215-224` `transcribe:${ip}`; no caminho de serviço (webhook) todas as transcrições automáticas dividem o mesmo IP (`validation.ts:350-358`) e a 11ª do minuto leva 429 | novo: G1 |
| 32 | ai-transcribe-audio: o chamador automático lê o campo errado | LAC (BUG) | n/a | `_shared/evolution-webhook-messages.ts:741` grava `transcription: result.text`, mas a Edge responde `{ transcription, ... }` (`ai-transcribe-audio/index.ts:355-363`): fica NULL com status `completed`; a chamada paga é feita e perdida | novo: G1 (P1) |
| 33 | useAudioMessagePlayer: transcrição sob demanda, canal realtime | EQ | `useAudioMessagePlayer.ts:49-82,141-181` | `AudioMessagePlayer.tsx:43-81` (mesmo UPDATE pelo cliente) | PE-55/PE-56 (done, não integrado) |
| 34 | useAudioMessagePlayer: status de conversão de voz via fila | DEC | `:84-139` | n/a (ver 23) | decisão |
| 35 | TextToAudioButton: envio assíncrono, só descarta a prévia após sucesso | MV2 | `handleSendAudio` fecha e limpa sempre | `TextToAudioButton.tsx:113-131` (#350) | teste `TextToAudioButton.preview-send` |
| 36 | TextToAudioButton: cancelar conversão em voo | LAC | `:27-33,55-58,119` `AbortController` | V2 não tem: fechar o popover ou desmontar durante a conversão não cancela; o áudio chega depois, toca sozinho (`:100`) e o `URL` vaza | novo: G6 |
| 37 | TextToAudioButton: nome acessível | EQ | `aria-label` | `:161` `aria-label` + Tooltip | nenhum |
| 38 | TextToSpeechButton | MV2 | `TextToSpeechButton.tsx` | V2 cancela a geração em curso e muda o rótulo (R2-INB-040) | nenhum |
| 39 | SpeedSelector | EQ | `SpeedSelector.tsx` | idêntico (diff só no comentário) | `t_a8b2a47f` é da velocidade do player, não deste seletor |
| 40 | VoiceSelector: cancelar prévia em voo | LAC | `VoiceSelector.tsx:145-154,175` `previewAbortRef` | V2 `:56-66,68-120` `stopPreview` não aborta o `fetch`: trocar de voz rápido toca duas ao mesmo tempo; fechar o menu não cancela | novo: G6 |
| 41 | VoiceSelector: custo das prévias | LAC (V2 e V3) | cada clique em ▶ chama a TTS paga | `:82-93` sem cache de blob por voz; gasta o limite de 20/min | novo: G6 |
| 42 | VoiceSelector: nome do botão ▶ | LAC | n/a | `:152-171` botão sem `aria-label`, aninhado em `DropdownMenuItem` | PE-60 não lista `VoiceSelector`. G6 |
| 43 | VoiceChangerPicker: reprodução recusada | LAC | `:196-198` | `VoiceChangerPicker.tsx:196-198` `void audio.play()` e `isPlaying=true` mesmo se recusado | VZ1 (done) |
| 44 | VoiceChangerPicker: cancelar transformação em voo | LAC | `:66,79,132-154` `transformAbortRef` | V2 `:145-183` sem abort; fechar o popover durante `transformVoice` e a resposta chega: `setTransformedUrl` cria `URL` órfão e a prévia reaparece | novo: G7 |
| 45 | VoiceChangerPicker: duração máxima da gravação | LAC | n/a | `:105-131` grava sem teto; só a Edge recusa > 10 MB, depois do upload inteiro | PE-24 cobre `handleSendAudio`/`useAudioRecorder`, não este picker. G7 |
| 46 | VoiceChangerPicker: onde o áudio enviado é guardado | LAC (LGPD/funcional) | `:201-207` mesmo caminho | `VoiceChangerPicker.tsx:207-213` sobe em `audio-memes/voice-changer/<ts>_<uuid>.mp3` com `getPublicUrl` e cache de 1 ano. `audio-memes` é `public=true` (migrations `20260319004136:45`, `20260511233306:4`); a `20260905030000` fechou `whatsapp-media`, `audio-messages`, `team-chat-files`, não este. E a policy de INSERT (`20260511233306:32-34`) só deixa subir em pasta `<uid>/…` ou para admin/supervisor, e o caminho usado começa por `voice-changer/` | novo: G2 |
| 47 | mimeType do gravador fixo em webm/opus | LAC (V2 e V3) | `useAudioManagement.ts:926` | `useAudioRecorder.ts:93` e `VoiceChangerPicker.tsx:116` fixos, sem `isTypeSupported`; sem webm cai no `catch` genérico "Não foi possível acessar o microfone" | SL-072 `t_6fea9efc` (done) cobre só o chat interno. Novo: G9 |
| 48 | useAudioRecorderUI: pausa, recuperar, desfazer descarte, reenvio com recuo, atalhos | LAC | `useAudioRecorderUI.ts:100-163,188-236` | `AudioRecorder.tsx` sem nada disso | PE-59 (done, não integrado) |
| 49 | useAudioRecorderUI: volume | MV2 | `localStorage` próprio | `useMediaElementVolume(audioRef)` + `lib/mediaVolumeElement` (E36, volume global) | nenhum |
| 50 | audioMemeConstants | LAC (P2) | `audioMemeConstants.ts` 21 categorias em 14 arquivos | V2 tem DUAS listas que não conversam: `AudioMemePicker.tsx:17-30` (21, as da IA `classify-audio-meme`) e `settings/media-library/useMediaLibrary.ts:40-43` `AUDIO_CATEGORIES` (8: risadas, bordões, efeitos, músicas, memes, narração, animais, outros). Categoria criada no admin aparece no seletor com emoji "📦" e rótulo cru; "risadas" difere de "risada" | novo: G10 |
| 51 | TTS/STT: operador de dados (LGPD) | LAC (documentação) | n/a | `docs/LGPD-RETENTION-POLICY.md` não cita ElevenLabs (texto da conversa na TTS, áudio de cliente no STT) | novo: G11 |

## 3. Lacunas reais sem cartão (priorizadas)

### P1

**G1. [edgar + workertestes] Transcrição automática perde o texto (campo errado) e é estrangulada por limite em memória**
- Evidência: `supabase/functions/_shared/evolution-webhook-messages.ts:741` grava `transcription: result.text`; a Edge devolve `transcription` (`ai-transcribe-audio/index.ts:355`). Todo áudio recebido, com `auto_transcription_enabled` ligado, dispara uma transcrição PAGA e grava `transcription = NULL` com `transcription_status = 'completed'` (o player só mostra o selo "Transcrito" se houver texto, `AudioMessagePlayer.tsx:95`, então ninguém percebe). Além disso `ai-transcribe-audio/index.ts:217` aplica `checkRateLimit("transcribe:"+ip, 10/min)` em memória também no caminho de serviço, e `getClientIP` devolve o mesmo valor para todas as chamadas do webhook: a 11ª transcrição do minuto é recusada e o webhook marca `failed`.
- O que implementar: o caminho de serviço passa a ler `result.transcription` (ou, melhor, a Edge grava `transcription`/`transcription_status` de forma idempotente, como pede o PE-55, e o webhook só dispara); remover o limite por IP no caminho de serviço (já existe `servicePerMinute` em `_shared/ai-auth.ts:105-107`); se a Edge gravar, não duplicar o UPDATE no webhook. Antes de abrir cartão, conferir se a branch do PE-55 (`t_dfe3e171`) já cobre o caminho de serviço; se cobre, vira só teste.
- Perfil: edgar. Arquivos: `supabase/functions/_shared/evolution-webhook-messages.ts`, `supabase/functions/ai-transcribe-audio/index.ts`, `supabase/functions/ai-transcribe-audio/index.test.ts`, teste do webhook.
- Critério de pronto: teste Deno com resposta falsa `{transcription:"oi"}` prova que a linha fica com texto; 15 transcrições de serviço em 1 minuto não recebem 429; `deno test` verde; `zapp-verify . --rapido` verde.
- Conferir no banco (Claude): `select count(*) from messages where message_type='audio' and transcription_status='completed' and (transcription is null or transcription='')`.

**G2. [iris, com workersql só se a policy mudar] Áudio do Voice Changer vai para bucket público e a policy de INSERT o bloqueia para atendentes comuns**
- Evidência: item 46. O áudio da conversa vira URL pública permanente (cache 1 ano) em `audio-memes`, contrariando a decisão de 05/09 de fechar os buckets com dado de cliente; e, pelas migrations, o upload em `voice-changer/<…>.mp3` só passa para admin/supervisor (pasta diferente de `auth.uid()`), então atendente comum receberia "Erro ao enviar áudio". `useAudioMemes.ts:170` e `AIGenerateDialog.tsx:51` também sobem na raiz do bucket (fluxos de admin).
- O que implementar: o Voice Changer entrega o `Blob` ao mesmo caminho do áudio gravado (`uploadAudio` para o bucket privado `audio-messages`, locator assinado na leitura) em vez de `onSendAudio(url pública)`; `handleSendAudioMeme` continua só para memes. No time interno, mesmo caminho do áudio do chat interno.
- Critério de pronto: nenhuma chamada `getPublicUrl('audio-memes', 'voice-changer/…')` no `src`; teste do picker prova que o envio usa o caminho privado e que a falha mantém a prévia (#350); prova no banco local com papel `authenticated` não admin: upload ok no caminho novo.
- Conferir no banco real (Claude): `select public from storage.buckets where id='audio-memes'`; `select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid='storage.objects'::regclass and pg_get_expr(polwithcheck, polrelid) like '%audio-memes%'`; `select count(*) from storage.objects where bucket_id='audio-memes' and name like 'voice-changer/%'` (se > 0, quem subiu e como: pode haver policy que as migrations não mostram).

**G3. [edgar] Endurecer a Edge `voice-changer` no nível da `elevenlabs-sts` (NÃO remover)**
- Evidência: itens 24 a 27. `voice-changer/index.ts:49-59` lê o corpo inteiro antes de qualquer recusa, não confere o conteúdo, não registra consumo (`PENDENTES_DECLARADAS`), 30 s de timeout, sem teste.
- O que implementar: reaproveitar `validateStsUpload` e a checagem de `content-length` de `elevenlabs-sts/index.ts` (exportar para `_shared/` ou importar), teto único (decidir 10 ou 25 MiB e registrar), `logAiUsageDetached` com `billing_unit: "second"` e `usage_unknown: true`, timeout 60 s com 504 claro, tirar `voice-changer` de `PENDENTES_DECLARADAS`, mensagens 4xx em português, `index.test.ts` (sem token 401; vazio 400; não-áudio 415; grande 413; preset inválido 400; ledger gravado). Coordenar com SL-010b-2 (`t_65fedb4a`).
- Perfil: edgar. Arquivos: `supabase/functions/voice-changer/index.ts` (+ `index.test.ts`), `supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts`.
- Critério de pronto: os casos acima passam; `PENDENTES_DECLARADAS` perde `voice-changer`; `zapp-verify . --rapido` verde.

**G4. [edgar] `ai-transcribe-audio`: ledger, timeouts e tamanho antes de baixar**
- Evidência: itens 29 e 30. `index.ts:60` baixa o objeto inteiro e só depois confere 25 MB (`:66`); `:310` chama o STT sem `AbortSignal`; nenhuma linha em `ai_usage_logs`; `:369` devolve `error.message` interno.
- O que implementar: `logAiUsageDetached` (função `ai-transcribe-audio`, unidade segundo, `usage_unknown`), `AbortSignal.timeout` (download 20 s, STT 60 s) com 504, conferir `metadata.size` antes de baixar, 500 sem detalhe interno, retirar da lista `PENDENTES_DECLARADAS`. (G1 trata o limite por IP.)
- Perfil: edgar. Arquivos: `supabase/functions/ai-transcribe-audio/index.ts`, `index.test.ts`, `_shared/__tests__/consumo-pago-no-ledger.test.ts`.
- Critério de pronto: teste prova linha no ledger por chamada e 504 com `fetch` pendurado; guarda de consumo verde; `zapp-verify . --rapido` verde.

### P2

**G5. [edgar] `elevenlabs-tts` e `elevenlabs-sts`: timeout, 500 sem detalhe e teste do `elevenlabs-tts`**
- Evidência: itens 20 e 21. PH-06 só cobre `scribe-token`, `tts-stream` e `voice-agent`.
- Implementar: `AbortSignal.timeout(30 s)` em `elevenlabs-tts/index.ts:32` e `elevenlabs-sts/index.ts` (60 s), 504 claro; `errorResponse("Erro interno", 500)` em vez de `error.message` (`elevenlabs-tts:93`, `elevenlabs-sts`, `scribe-token:63`); `elevenlabs-tts/index.test.ts` (sem token 401, voz fora da lista 400, texto > 5000 400, limite 429, ledger).
- Perfil: edgar (coordenar com PH-06 `t_22a7d503` para não editar `scribe-token` duas vezes). Critério: testes verdes + `zapp-verify . --rapido`.

**G6. [iris] Pré-visualizações de voz: cancelar em voo, cache e nomes (TextToAudioButton + VoiceSelector)**
- Evidência: itens 36, 40, 41, 42. Implementar: `AbortController` em `TextToAudioButton` (aborta ao fechar o popover e ao desmontar, não toca áudio de resposta tardia, revoga o `URL`) e em `VoiceSelector.playPreview` (aborta ao trocar de voz e ao fechar o menu); guardar em memória o blob da prévia de cada voz na sessão (11 vozes, texto fixo) para não gastar a cota paga e o limite de 20/min a cada clique; `aria-label="Ouvir prévia da voz <nome>"` e `type="button"` no ▶.
- Arquivos: `src/components/inbox/TextToAudioButton.tsx`, `VoiceSelector.tsx`, testes (`TextToAudioButton.preview-send.test.tsx` e novo `VoiceSelector.test.tsx`).
- Critério: teste com `fetch` pendente + fechar popover: `Audio.play` nunca é chamado; duas prévias seguidas da mesma voz: um só `fetch`; `getByRole('button',{name:/Ouvir prévia/})`.

**G7. [iris] VoiceChangerPicker: cancelar transformação, teto de gravação e erro de microfone verdadeiro**
- Evidência: itens 44, 45, 47. Implementar: `AbortController` na transformação (aborta no `cleanup`/fechar), resultado ignorado se o popover fechou; parar a gravação em 60 s (a Edge recusa > 10 MB) com aviso; separar "permissão negada" de "formato não suportado" no `catch` (`:133-135`); o `play()` recusado é do VZ1 (não duplicar).
- Arquivos: `src/components/inbox/VoiceChangerPicker.tsx`, `__tests__/VoiceChangerPicker.preview-send.test.tsx`. Critério: teste com timers falsos prova o corte em 60 s; fechar durante a transformação não deixa `transformedUrl`; `zapp-verify . --rapido` verde.

**G8. [iris] A7: "travar gravação" não faz nada e vaza URL (AudioRecorder)**
- Evidência: linha A7. Implementar: ou tirar o botão "Travar" (a gravação já é por toque), ou fazer o travamento valer (travado desliga o arrastar-para-cancelar e mostra "Gravação travada" com `aria-live`; volta a `false` ao parar/cancelar); remover `voiceChanged` que ninguém lê; revogar o `URL` criado em `handleVoiceChanged` e no desmontar. Executar depois do PE-59 (mesmo arquivo `AudioRecorder.tsx`).
- Critério: teste: travado + arrastar mais de 100 px não cancela; depois de parar, o travamento volta a falso; `URL.revokeObjectURL` chamado.

**G9. [hugo] Gravador escolhe um formato que o navegador sabe gravar**
- Evidência: item 47 (V2 e V3 iguais, mas é defeito real fora de Chrome/Firefox/Edge). Implementar: `escolherMimeGravacao()` com `MediaRecorder.isTypeSupported` (`audio/webm;codecs=opus`, depois `audio/mp4`, depois padrão), usada em `useAudioRecorder.ts:93` e `VoiceChangerPicker.tsx:116`; `uploadAudio` usa extensão e Content-Type reais (hoje `.webm`/`audio/webm` fixos); erro distingue permissão negada de formato. Confirmar antes a matriz de navegadores aceita pelo produto (se só desktop Chrome/Edge, rebaixar para P3). A Edge `elevenlabs-sts` já reconhece mp4/m4a.
- Critério: teste com `isTypeSupported` simulado devolvendo só `audio/mp4`; o blob e o upload saem com o tipo certo.

**G10. [iris] Uma só lista de categorias de áudio-meme**
- Evidência: item 50. Implementar: `src/lib/audioMemeCategories.ts` (as 21 categorias da IA `classify-audio-meme`, com emoji e rótulo), usado em `AudioMemePicker.tsx`, no admin (`useMediaLibrary.ts` `AUDIO_CATEGORIES`) e no preview de upload; migração de dados só se o admin gravou valores fora da lista.
- Perfil: iris (+ workersql se precisar mapear categorias antigas). Critério: grep prova uma só definição; teste de que categoria desconhecida cai em "Outros" com rótulo legível.
- Conferir no banco (Claude): `select category, count(*) from audio_memes group by 1`.

**G11. [worker] Registrar a ElevenLabs como operador de dados no documento de LGPD**
- Evidência: item 51. Implementar: seção em `docs/LGPD-RETENTION-POLICY.md` (ou ADR em `docs/adr/`) listando o que sai para a ElevenLabs (texto da mensagem em `elevenlabs-tts`; áudio de cliente em `ai-transcribe-audio`; áudio do atendente em `voice-changer`/`elevenlabs-sts`), finalidade, base legal, retenção do lado do provedor e transferência internacional; tabela das Edges de voz com o que registram (tamanho, nunca texto/áudio) e o ledger.
- Critério: documento citado em `docs/LGPD-RETENTION-POLICY.md`; nenhuma Edge de voz loga texto (grep). O contrato/plano da ElevenLabs (retenção zero) o Joaquim precisa confirmar: não consigo ver daqui.

**G12. [iris] NBA e transcrição em tempo real: restos de acabamento**
- NBA: depois do PE-62, o cartão sem ação não pode parecer botão (tirar `cursor-pointer`/`hover:shadow` quando `action` é indefinido), `role="status"` no carregando (`NextBestActionEngine.tsx:26-28`), `isValidUUID(contactId)` antes de consultar (V3 `:55`); cartão com ação é `<button>`.
- RealtimeTranscription: `aria-live="polite"` para "Ouvindo…" e parcial; erro específico quando a sessão expirou, em vez de "Chave da ElevenLabs inválida" (`RealtimeTranscription.tsx:64-70`; distinguir pela mensagem da Edge `Invalid ElevenLabs API key` x `Missing Authorization`); `chat/ChatDialogs.tsx:81` sem espaço inicial.
- Arquivos: `NextBestActionEngine.tsx`, `hooks/chat/useNextBestAction.ts`, `RealtimeTranscription.tsx`, `chat/ChatDialogs.tsx`, testes (o PE-63 já escreveu teste de RealtimeTranscription: estender, não duplicar). Critério: `getByRole('status')` e teste do 401 de sessão.

## 4. Onde a V2 já é melhor (não devolver)

- Autenticação e cota das quatro Edges de voz: `requireAuth` + `enforceRateLimit` por usuário (persistente), a V3 usava IP em memória; `ai-transcribe-audio` prova a visibilidade da mensagem e só baixa o objeto do registro (V3: proxy sem validar JWT).
- Allowlist fechada de voz e modelo (`schemas.ts:150-240`) e teto de 5000 caracteres no TTS; a V3 aceitava qualquer `voiceId` (acionava voz clonada da conta).
- Log sem roteiro (`elevenlabs-tts:27-29`), ledger de consumo no TTS, no token de transcrição e no STS.
- `elevenlabs-sts`: `content-length` antes do `formData`, magic bytes, 25 MiB; magic bytes também no STT (SL-195a).
- `edgeAuthHeaders` em um só lugar; envio assíncrono que só descarta a prévia após sucesso (#350); `TextToSpeechButton` que cancela a geração; volume global (E36) em todas as prévias; `useNextBestAction` que não esconde erro de leitura e usa os estados reais de tarefa; `useObjectionDetector` com geração de requisição (IA-048), N-169 e `copiarTexto`.
- Fila `voice_conversion_queue`/telemetria da V3: sem produtor na V3 e sem tabela na V2; manter fora (decisão do PE-66, que NÃO justifica remover a Edge).

## 5. O que NÃO consegui verificar (o Claude confere)

1. Banco real: `storage.buckets.public` e todas as policies de `storage.objects` para `audio-memes` (G2); contagem de `messages` com `transcription_status='completed'` e texto nulo (G1); `audio_memes.category` fora das 21 categorias (G10); `global_settings.auto_transcription_enabled` (o webhook trata ausência de linha como ligado).
2. Se os cartões `done` (PE-55, PE-56, PE-59, PE-60, PE-62, PE-24, PE-63, VZ1, AY1) já estão na branch viva; li o HEAD `96dd72dc5f` (12/10 20:09).
3. Se `ai-transcribe-audio` está com `verify_jwt` ligado em produção (a V2 não declara nada em `config.toml`, vale o padrão da plataforma) e o valor real de `x-forwarded-for` no webhook (G1).
4. Estado dos kill switches (SL-010b-2) e o que eles mudam em `voice-changer`.
5. Contrato da ElevenLabs (retenção, uso de dados para treino, região): fora do repositório (G11).
6. Matriz de navegadores aceita (G9) e comportamento real de `getUserMedia`/`MediaRecorder` no Safari/iOS: só leitura de código, nada executado.
7. Nenhum teste foi executado; nada foi editado, nenhum cartão criado, nenhum commit.
