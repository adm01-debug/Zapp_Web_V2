# Multiplix — Canal de envio e voz (E008 / E009)

> Lido em 2026-09-26, `main` @ `b263550`: `supabase/functions/talkx-send/index.ts`, `_shared/evolution-go-routes.ts`, `_shared/evolution-send.ts` (assinaturas), `elevenlabs-tts/index.ts`, `docs/migration/GO_GAPS.md`. Medições ao vivo no banco do ZAPP.

## 1. Capacidades reais do canal (Evolution GO, instância `PRINCIPAL`)

| Tipo | Rota v2 usada pelo ZAPP | Tradução GO | Estado | Evidência |
|---|---|---|---|---|
| Texto | `/message/sendText/{inst}` | `POST /send/text` | ✅ produção | `talkx-send`, Chat |
| Imagem / vídeo / documento | `/message/sendMedia/{inst}` `{mediatype, media, caption, fileName}` | `POST /send/media {type, url, caption, filename}` | ✅ produção | `talkx-send` |
| **Áudio como nota de voz (PTT)** | `/message/sendWhatsAppAudio/{inst}` `{audio}` | `POST /send/media {type: 'ptt', url}` | ✅ produção com **OGG** | `messages`: 201 áudios enviados por agente, 41 com `delivered`/`read`, URLs `.ogg` |
| Vídeo redondo (PTV) | `/message/sendPtv` | `type: 'ptv'` | mapeado, não usado | `GO_GAPS.md` |
| Presença "digitando" | `/chat/updatePresence {presence: composing}` | `POST /message/presence {state}` | ✅ produção | `talkx-send` |
| Presença "gravando" | `{presence: recording}` | `{state: composing, isAudio: true}` | mapeado, não usado | `evolution-go-routes.ts` |
| Verificar número no WhatsApp | `/chat/whatsappNumbers {numbers[]}` | `POST /user/check` → `[{exists, jid, number}]` | ✅ disponível | `GO_GAPS.md` |
| Template / janela 24 h | — | **não existe** | n/a | canal não oficial |

**Formato de áudio para PTT:** OGG comprovado em produção. **MP3 → PTT não foi testado** (ver §3). Codec/contêiner exato aceito pelo GO não está documentado no repo — E091 continua bloqueante até um envio real com o arquivo do ElevenLabs.

**Mídia privada:** bucket `whatsapp-media` privado; o GO baixa por signed URL com TTL 300 s (`resolvePrivateBucketUrl`); `talkx-send` reassina após 240 s. O Multiplix herda o mesmo mecanismo.

## 2. Contrato de envio já existente (reaproveitar, não recriar)

`talkx-send` implementa, via RPCs no Postgres, exatamente o que o plano pedia para a fila do Multiplix (Fase 5):

| Necessidade do plano | Já existe em `talkx-send` | RPC / mecanismo |
|---|---|---|
| Claim seguro entre workers (E075) | ✅ | `claim_talkx_recipient(campaign, recipient, worker, lease 90 s)` → `claim_token` |
| Lease que expira (E076) | ✅ | lease de 90 s; `release_talkx_recipient_claim` |
| Snapshot do conteúdo antes do POST | ✅ | `persist_talkx_recipient_message_snapshot` |
| Marcar "POST iniciado" (idempotência) | ✅ | `mark_talkx_recipient_dispatch_started` |
| Timeout → estado ambíguo, sem reenvio (E081) | ✅ | 20 s `AbortController`; HTTP ≥ 500 / corpo inválido / sem `external_id` → `outcome_unknown`, nunca volta a `pending` |
| Backoff transitório (E079) | ✅ | 30 s → 2 min → 10 min; `reschedule_talkx_recipient` → `dead_lettered` |
| Supressão revalidada antes do POST (E065) | ✅ | `talkx_recipient_is_suppressed(contact_id, phone)` duas vezes (no claim e após o typing delay) |
| Conexão caiu → pausa (D2) | ✅ | `transition_talkx_campaign(pause, 'connection_lost')` |
| Janela de horário / timezone (E086) | ✅ | `deliveryWindowStatus` em `_shared/talkx-window.ts` |
| Ritmo humanizado | ✅ | `send_interval_min/max` (5–15 s), `typing_delay_min/max` (1,5–4 s), releitura a cada 20 envios |
| Registro do `external_id` (E082/E093) | ✅ | `record_talkx_recipient_sent(recipient, claim_token, external_id)`; `extractMessageId` normaliza a resposta do GO |
| Conclusão quando drenado | ✅ | `complete_talkx_campaign_if_drained` |

**Consequência para o plano:** a Fase 3 (serviços compartilhados) deve extrair este contrato para `_shared/messaging/` e a Fase 5 deve **parametrizar** (tabela-alvo + política) em vez de reescrever. As RPCs `*_talkx_*` viram `*_delivery_*` ou ganham equivalentes `multiplix_*` com a mesma assinatura — decisão de nome na Fase 2, sem mudar comportamento.

**Auth do `talkx-send`:** service role (scheduler) **ou** JWT de usuário com `user_roles.role IN ('admin','supervisor')`. O Multiplix precisa de perfil de operador (Compras/Logística) — ajuste em E007/E020.

**Limites por dispatch já parametrizados em `talkx_campaigns`:** `send_interval_min/max`, `typing_delay_min/max`, `send_window_start/end`, `business_hours_only`, `speed_profile`, `schedule_timezone`. Globais em `talkx_settings`: `daily_limit_per_connection = 500`, `default_speed_profile = balanced`, `reply_window_hours = 72`, `optout_autoreply`.

## 3. Contrato do TTS (`elevenlabs-tts`)

| Item | Valor atual | Implicação para o Multiplix |
|---|---|---|
| Auth | `requireAuth` (JWT) — qualquer usuário autenticado | Sem noção de voz autorizada → E099/E100 (grants) são necessários |
| Rate limit | **20 req/min por usuário** | Confirma: preparar em fila no servidor, 1 chamada por roteiro distinto (E103), nunca 1 por destinatário no navegador |
| Saída | `output_format=mp3_44100_128` → `audio/mpeg` bruto, sem storage | Multiplix precisa gravar em bucket privado + hash (E102/E104) |
| Modelo padrão | `eleven_v3` | Custo estimado depende do modelo efetivo (E105) |
| Voz padrão | `TY3h8ANhQUsJaa0Bga5F` hard-coded | Substituir por voz vinda do grant |
| `voice_settings` | fixos: stability 0.5 · similarity 0.75 · style 0.3 · speaker_boost | Entram no hash do asset (E102); mudar parâmetro = novo asset |
| Log | grava os **primeiros 50 caracteres do roteiro** | Viola E048 (sem conteúdo no log) — corrigir ao reaproveitar |
| Erro | 401 chave inválida · 429 limite · 500 genérico | Mapear para `midia_pendente` (E114) |

**MP3 vs PTT (E091):** o ElevenLabs aceita `output_format=opus_48000_64` (Ogg Opus) na mesma rota. Hipótese a validar em E091: pedir Opus direto ao ElevenLabs elimina transcodificação e entrega o mesmo contêiner que o Chat já envia com sucesso. Se o GO rejeitar, plano B = enviar como `sendMedia type: audio` (áudio comum, não nota de voz) e dizer isso na UI.

## 4. Eventos de retorno (webhook)

- Ack de entrega/leitura chega como `Receipt {state: Delivered|Read|ReadSelf, MessageIDs[]}` → adapter traduz para `messages.update`; `talkx_recipients` recebe `delivered_at`/`read_at` por `external_id` (E87 do TalkX). O Multiplix estende o mesmo handler para `multiplix_delivery_items` (E093).
- Resposta do contato: `Message` → `messages.upsert`; atribuição a campanha por `talkx_reply.ts` dentro de `reply_window_hours` (72 h) — Multiplix reaproveita e marca como **inferida** quando só temporal (E094).
- `TemporaryBan` / `ConnectFailure` → `connection.update close` → gatilho de "conexão em risco" (ADR-007 D2).
- Retry do webhook GO: 5 tentativas, 30 s, exige 2xx.

## 5. O que fica pendente para E091 (bloqueante, Fase 6)

1. Gerar 1 áudio no ElevenLabs em `opus_48000_64` e 1 em `mp3_44100_128`.
2. Enviar ambos por `sendWhatsAppAudio` para um número interno.
3. Registrar no `CANAL.md`: qual chega como nota de voz (bolha com onda), qual chega como arquivo, qual falha.
4. Fixar o `output_format` do Multiplix a partir do resultado.
