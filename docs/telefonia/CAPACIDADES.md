# Telefonia — Matriz de capacidades reais (por canal)

Medido em **26/09/2026** contra o código de `origin/main` (`001fd46`) e o banco oficial
(Supabase Cloud, via gateway MCP) e **Revisado em 08/10/2026** contra o código da ponta do dia
(`dia/2026-10-08`, commit `1a1bc3179`) — etapa T92. As medições de banco continuam datadas de
**26/09/2026**: nenhum agente acessa o banco de produção, então nada de banco foi remedido aqui — só a
correspondência com o código. Este documento diz o que **existe** e o que
**não foi comprovado** — é o que a UI tem permissão de prometer.

## Matriz

| Capacidade | VoIP | WhatsApp | Evidência |
|---|---|---|---|
| **Discar (saída)** | ✅ sim | ❌ **não** | VoIP: SIP.js `Inviter` no adapter `src/lib/calls/adapters/SipCallAdapter.ts:54` (T09 — saiu do hook). WhatsApp: nenhum endpoint de originação é chamado em nenhum lugar do código; o webhook Evolution só **recebe** eventos. |
| **Receber (entrada)** | ⚠️ código existe, **não homologado** | ⚠️ evento sim, **áudio não** | VoIP: `src/hooks/sip/useSipConnection.ts:103` monta `delegate.onInvite` (PR #868) e `CallSessionProvider` está montado; chamada real nunca foi exercitada nesta análise. WhatsApp: `handleCallEvent` (`supabase/functions/_shared/evolution-webhook-handlers.ts:270`) → RPC `record_incoming_call_event`, com a direção tirada do payload (`p_direction`, T26 — `:322`). O áudio **não passa pelo app** (a linha toca no aparelho da conexão). |
| **Áudio ponta a ponta no navegador** | ⚠️ mídia de saída implementada (`getUserMedia`, tracks, DTMF); entrada sem prova | ❌ não | Nenhum teste de áudio foi executado. `setSinkId` não é usado. |
| **Recusar** | ✅ `inviter.cancel()` existe; recusa de chamada **recebida** não foi exercitada | ❌ não comprovado | Sem handler de reject para o WhatsApp (nenhum `reject` em `evolution-webhook-handlers.ts`). D7 = (b): o botão é **"Ignorar"** e grava `declined` local, sem endpoint de recusa (`src/lib/calls/WhatsAppCallAdapter.ts:56`). |
| **Gravar** | ⚠️ **código entregue** (T67 player + T72/T73 Edges `sync-call-records` e `get-call-recording`), **sem fonte comprovada** | ❌ não | Player renderiza só com `recording_status = 'available'` (`src/hooks/calls/useCallRecording.ts:70`; `src/components/calls/RecordingPlayer.tsx:104`) e a Edge entrega o áudio pelo JWT do usuário, sem expor `recording_url` (`supabase/functions/get-call-recording/index.ts:118-135`). Fonte: `BITRIX_WEBHOOK_URL` **na Edge** — sem ela a `sync-call-records` devolve `{reconciliados: 0, motivo}` em vez de erro (`supabase/functions/sync-call-records/index.ts:162-165`); a config é segredo de produção e não foi remedida. Medições de 26/09: sem bucket de gravação no Storage (`audio-memes, audio-messages, avatars, custom-emojis, stickers, team-chat-files, whatsapp-media`) e `recording_url` nunca gravado em produção. |
| **Duração oficial do provedor** | ⚠️ **código entregue** (T72 Edge `sync-call-records`), **sem credencial comprovada** | ❌ não | `voximplant.statistic.get` do Bitrix (`supabase/functions/sync-call-records/index.ts:169`): a Edge existe, casa por `peer_number` + `started_at` em janela de ±90 s e **nunca cria chamada** (`:8-12`), e devolve `{reconciliados: 0, motivo}` sem `BITRIX_WEBHOOK_URL`. Medição de 26/09: `duration_seconds` no banco nunca foi preenchido (0 de 21 linhas com `answered_at`+`ended_at`). |

## Provedores

| O que | Valor | Onde está no código |
|---|---|---|
| SIP (VoIP) | **Bitrix24 SIP Connector** — `ip.b24-9441-1552764901.bitrixphone.com`, ramal `phone1`, WSS porta `8089` | defaults na Edge: `supabase/functions/get-sip-password/index.ts:13-15` (T15 — o front não tem `SIP_*`) |
| Senha SIP | segredo `SIP_PASSWORD` (Supabase), entregue por Edge Function `get-sip-password` (JWT + perfil ativo + rate limit) — **um único segredo** para todos os agentes | `supabase/functions/get-sip-password/index.ts` |
| Ramal por agente | ❌ inexistente (D1=a): dois agentes registrados ao mesmo tempo disputam a mesma linha | idem |
| WhatsApp | **Evolution GO** (`EVOLUTION_API_FLAVOR=go`, VPS Hostinger `srv1481814`, instância `evolution-go-rxj2`) | `supabase/functions/_shared/evolution-go-routes.ts` |
| Linha WhatsApp do projeto | **1** linha: `Promo Brindes WhatsApp` (`instance_id=PRINCIPAL`, `phone_number=551146375517`, `status=disconnected`, `is_default=true`). **Não existe** linha `wpp2` | tabela `whatsapp_connections` |
| Flavor Baileys × Cloud API | **indeterminável pelo banco**: a tabela não tem `integration`/`provider`. É Evolution GO (whatsmeow) | — |
| Eventos de chamada recebidos | `handleCallEvent` → `normalizeEvolutionCallStatus` → RPC; `provider_event_id` = `data.id`/`callId`/`call_id` | `supabase/functions/_shared/evolution-webhook-handlers.ts:270-322` |

## Consequências para a UI (o que pode aparecer na tela)

- Chip "VoIP": verde só com `sipStatus === 'registered'` **e** microfone liberado; amarelo "Reconectando…" no backoff; vermelho "Telefone indisponível" sem provisionamento/403.
- Chip "WhatsApp": **"só recebidas"** — nunca oferecer discagem por WhatsApp nesta entrega.
- Botão de gravação: **não renderizar** enquanto `recording_status !== 'available'` (regra mantida em `src/hooks/calls/useCallRecording.ts:70`). A Edge `get-call-recording` já existe e responde 404 quando não há áudio (`supabase/functions/get-call-recording/index.ts:118-120`); **falta a fonte** (`BITRIX_WEBHOOK_URL` na Edge), então na prática nenhuma chamada tem gravação comprovada.
- Espera, transferência, conferência, vídeo, transcrição e resumo por IA: **fora de escopo**, sem capacidade comprovada.
- O que **preservar** (já funciona e é usado em produção): discagem VoIP, DTMF, mute, encerrar, registro de eventos de chamada do WhatsApp, notificação `incoming_call` por usuário e a RLS de chamadas próprias/admin.

## Como esta matriz foi obtida (para reprodutibilidade)

```sql
-- via gateway MCP do projeto (db_query, service_role)
select id, name, instance_id, status, health_status, is_default
from public.whatsapp_connections order by created_at;
select column_name from information_schema.columns
where table_schema='public' and table_name='whatsapp_connections';
select name from storage.buckets order by name;
```
Mais leitura do código em `src/hooks/communication/useSipClient.ts`, `src/hooks/sip/useSipConnection.ts`,
`supabase/functions/_shared/evolution-webhook-handlers.ts`, `supabase/functions/get-sip-password/index.ts`,
`supabase/functions/sync-call-records/index.ts` e `.env.example`. **Nenhuma chamada telefônica real foi feita.**
