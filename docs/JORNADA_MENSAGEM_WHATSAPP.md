# Jornada da mensagem de WhatsApp — Zapp Web V2

Estado do código da base `dia/2026-10-13`. Cada passo abaixo cita o `arquivo:linha` que o executa.
Companheiros: `docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md` (fonte única) e
`docs/REALTIME-CHANNELS-INVENTORY.md` (canais).

Regra que vale em todo o documento: **a mensagem visível mora em `public.messages`** do banco do
projeto, e o Realtime é o canal de atualização dessa tabela. Não há fanout/mirror no V2 nem caminho
de banco externo ligado (ver ADR-009).

Atalhos usados abaixo (o verificador expande): `index.ts` = `supabase/functions/evolution-webhook/index.ts`;
`evolution-webhook-messages.ts` = `supabase/functions/_shared/evolution-webhook-messages.ts`.

## 1. Entrada: provedor → webhook

1. A Evolution GO entrega o evento em `handleEvolutionWebhook`
   (`supabase/functions/evolution-webhook/index.ts:96`); método diferente de POST é 405 (`:102`).
2. Antes de qualquer efeito: limite de requisições (`:109`), HMAC/segredo **fail-closed** — ausência
   de configuração não vira "liberado" (`:125-136`) — e, por último, o gate por `instanceToken`
   do corpo (`:158-182`).
3. O evento é despachado por tipo (`:213-310`). O caminho de mensagem recebida é
   `messages.upsert` (`:230`): com `fromMe === false` chama `handleIncomingMessage` (`:283`); com
   `fromMe === true` chama `handleOutgoingWhatsAppMessage` (`:286`), que é o eco do que saiu do
   próprio app.
4. A resposta de sucesso é 200 `{ success: true }` (`index.ts:325-326`); o erro sai como
   `{ error }` (`:331-333`).

## 2. Webhook → banco (uma transação)

- `handleIncomingMessage` grava pela RPC `ingest_inbound_message`
  (`supabase/functions/_shared/evolution-webhook-messages.ts:460`), definida em
  `supabase/migrations/20260905050000_ingest_inbound_message_tx.sql:41`.
  Ela faz o **find-or-create do contato** (variantes do nono dígito e relink para a conexão atual)
  e o **upsert idempotente da mensagem** numa única transação, com `outcome` =
  `inserted | updated | duplicate` (comentário da própria função, `:125` do mesmo SQL).
- Antes de gravar, o edge checa duplicidade por `external_id`
  (`evolution-webhook-messages.ts:302`) e faz o relink da mensagem pendente do envio otimista para o
  id do provedor (`:357-363`), evitando bolha duplicada.
- Mídia e transcrição ficam na mesma linha, por `update` em `messages`
  (`evolution-webhook-messages.ts:731-746`).
- Enviado pelo app (`fromMe === true`): o edge alinha a linha existente por `upsert`
  (`evolution-webhook-messages.ts:373`) e toca `contacts.updated_at` (`:380`).

## 3. Banco → tela (Realtime)

- `public.messages` é a tabela publicada (prova no inventário, seção 5).
- A lista lateral assina `messages` em `global-messages-realtime`
  (`src/hooks/chat/useRealtimeMessages.ts:215`) e `contacts` em `global-contacts-realtime` (`:224`);
  o painel da conversa assina `messages` filtrado por contato em `messages:{contactId}`
  (`src/hooks/chat/useMessages.ts:336`).
- Reconexão com refetch só nessas três assinaturas (`useRealtimeMessages.ts:220` e `:228`,
  `useMessages.ts:343`); o núcleo revalida no máximo a cada 5 s após queda
  (`src/hooks/realtime/useSupabaseRealtime.ts:49` e `:146-154`).

## 4. Saída: tela → fila → edge → provedor

1. `sendOutboundMessage` (`src/services/outbound-message.service.ts:191`):
   sem rede, a mensagem vai para a fila offline (`enqueueOffline`, `:162` e `:196`).
2. Com rede, há deduplicação entre abas: só a aba que ganha a reivindicação envia
   (`crossTabSendDedupe.claim`, `:199`), sempre passando pelo limitador de vazão
   (`sendThrottle`, `:207`).
3. Enfileiramento no banco: RPC `enqueue_outbound_message`
   (`outbound-message.service.ts:111`), definida em
   `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:162`.
   Ela insere a linha em `public.messages` com `status = 'sending'` e
   `ON CONFLICT (contact_id, client_message_id) DO NOTHING` (`:225-236`): **a fila é a própria
   tabela de mensagens** — não existe tabela de fila separada.
4. Disparo: `dispatchQueuedMessage` chama a edge `message-delivery`
   (`outbound-message.service.ts:223`). A edge reivindica a pendente com
   `claim_outbound_message` (`supabase/functions/message-delivery/index.ts:346`), chama a Evolution
   (`/message/sendMedia/...` `:79`, `/message/sendText/...` `:108`, URL e chave por variável de
   ambiente `:326-327`) e fecha com `complete_outbound_message` (`:420`) ou
   `fail_outbound_message` (`:266`).
5. Recibo: o webhook recebe `messages.update` (`evolution-webhook/index.ts:292`),
   `handleMessagesUpdate` (`supabase/functions/_shared/evolution-webhook-msg-handlers.ts:92`)
   grava status/`external_id` na mesma linha (`evolution-webhook-messages.ts:363`) — e esse `update`
   volta para a tela pelo Realtime.

## 5. Conexão caiu

`connection.update` (`evolution-webhook/index.ts:215`) chama `handleConnectionUpdate`
(`supabase/functions/_shared/evolution-webhook-handlers.ts:30`), que atualiza
`whatsapp_connections`. A tela reage pelos canais `monitoring-status`, `disconnect-banner` e
`whatsapp-connections-changes` (inventário, seção 2).

## 6. O que esta jornada NÃO tem (para não inventar caminho)

- Sem `fanout`/`mirror` de mensagem: a tela lê a própria tabela.
- Sem leitura do banco externo `evolution_messages`: a flag está `false`
  (`src/hooks/inbox/useRealtimeInbox.ts:20`, ver ADR-009).
- Sem tabela de fila de envio dedicada: a fila é `public.messages` com `status = 'sending'`.
