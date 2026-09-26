# Multiplix — Capacidades reais do canal (E008/E009/E091)

Lido diretamente de `supabase/functions/talkx-send/index.ts`,
`supabase/functions/_shared/evolution-go-routes.ts` e `supabase/functions/elevenlabs-tts/index.ts`
nesta sessão (26/09/2026). Nada aqui é suposição.

## Evolution GO — envio (`talkx-send`)

- **Auth**: service-role (scheduler) OU JWT de usuário com role `admin`/`supervisor` em
  `user_roles`. **Não há granularidade de departamento hoje** — qualquer admin/supervisor passa.
- **Tipos suportados**: texto (`sendText` → GO `/send/text`); mídia genérica (`sendMedia` →
  `/send/media` com `type`=mimetype); **PTT nativo confirmado**: `sendWhatsAppAudio` → GO
  `/send/media` com `type:'ptt'` (`evolution-go-routes.ts:80-86`) — bolha de nota de voz de
  verdade, não arquivo de áudio genérico. PTV (vídeo redondo) também nativo.
- **Codec** (E091/E113): o tradutor não valida o codec do áudio enviado como `ptt` — só repassa a
  URL. O padrão do WhatsApp para nota de voz nativa é OGG/Opus. O ElevenLabs devolve MP3 puro (ver
  abaixo). **Conclusão: a conversão de codec (E113) é necessária de fato**, não hipotética — sem
  ela, o áudio de IA chega como arquivo comum, não como nota de voz.
- **Fila/idempotência**: `claim_talkx_recipient` (lease com token, SKIP LOCKED-style),
  `complete_talkx_recipient`, `reschedule_talkx_recipient`, `release_talkx_recipient_claim`,
  `mark_talkx_recipient_dispatch_started` — reutilizável tal qual para `multiplix_delivery_items`.
- **Timeout/ambiguidade**: 20s de abort por envio. 5xx ou corpo inválido nunca reenvia sozinho —
  vai para status `outcome_unknown` (quarentena para reconciliação por `external_id`). É
  exatamente o comportamento que E081/E082 pedem, já em produção.
- **Backoff pré-despacho**: fixo `[30s, 120s, 600s]` por `attempt_count`.
- **Ritmo hoje** (`talkx_campaigns`, migration `20260409000457`): `send_interval_min` = 5000ms,
  `send_interval_max` = 15000ms (mesma conexão/instância usada por Campanhas). Reload de
  parâmetros a cada 20 envios. Referência direta para a política numérica do E004.
- **Supressão**: RPC `talkx_recipient_is_suppressed(contact_id, phone)`, checada 2× (antes do
  claim e imediatamente antes do POST ao provedor) — molde pronto para E065.
- **Variáveis suportadas hoje**: `{{nome}}`, `{{nome_completo}}`, `{{apelido}}`, `{{empresa}}`,
  `{{saudacao}}`, `{{link}}` + custom vars mascaradas. **Gap real para E043**: um placeholder
  desconhecido não listado **passa intacto no texto** (sem erro, sem substituição) — o produto
  pede erro nomeado, não passagem silenciosa; o Multiplix precisa endurecer isso na extração.
- **`whatsapp_connections`**: sem coluna de capacidades hoje. Colunas confirmadas nas migrations:
  `status`, `instance_id`, `battery_level`, `is_plugged`, `retry_count`, `max_retries`. E051
  precisa de coluna nova — não há reuso possível aqui.

## ElevenLabs TTS (`elevenlabs-tts`)

- **Auth**: JWT de usuário obrigatório (`requireAuth`). Rate limit **20 req/60s por usuário**
  (chave `elevenlabs-tts:${userId}`), não por IP nem global.
- **Parâmetros**: `text`, `voiceId` (default fixo `TY3h8ANhQUsJaa0Bga5F`), `modelId` (default
  `eleven_v3`), `languageCode`, `applyTextNormalization`.
- **Sem checagem de autorização de voz nesta function** — qualquer `voiceId` enviado pelo cliente
  é aceito e repassado à ElevenLabs sem validar posse/grant. Confirma que `voice_grants` (E099–
  E101) é conceito **inteiramente novo**, não existe em nenhuma camada hoje.
- **Retorno**: MP3 puro (`mp3_44100_128`), sem cache, sem hash — 1 chamada = 1 síntese paga, sem
  reuso. Confirma que o cache por `hash(roteiro+voz+modelo+parâmetros)` (E102) também é 100% novo.
