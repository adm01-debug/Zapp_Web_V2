# Telefonia — Matriz de capacidades reais (por canal)

**Revisão final (T92) de 08/10/2026, contra a cabeça do dia `dia/2026-10-08` — commit `c79b2e34c`.**
Cada afirmação abaixo traz o arquivo e a linha do código que a sustenta (a guarda
`scripts/db-audit/telefonia-docs-revisao.test.mjs` recusa citação de arquivo que não existe).
As medições de **banco** continuam sendo as de **26/09/2026** (código de `origin/main` `001fd46`),
marcadas como tais na coluna de evidência; o que andou desde então está com a prova nova.

## Matriz

| Capacidade | VoIP | WhatsApp | Evidência |
|---|---|---|---|
| **Discar (saída)** | ✅ sim | ❌ **não** | VoIP: o motor cria o `Inviter` do sip.js em `src/lib/calls/adapters/CallEngine.ts:227` (fronteira em `src/lib/calls/adapters/CallAdapter.ts:38`, implementação em `src/lib/calls/adapters/SipCallAdapter.ts`). WhatsApp: nenhum endpoint de originação é chamado em nenhum lugar do código; o webhook Evolution só **recebe** eventos (`supabase/functions/_shared/evolution-webhook-handlers.ts:270`). |
| **Receber (entrada)** | ⚠️ código existe, **não homologado** | ⚠️ evento sim, **áudio não** | VoIP: `src/hooks/sip/useSipConnection.ts:103` monta `delegate.onInvite` e o provider de sessão está montado; chamada real nunca foi exercitada (roteiro em `docs/telefonia/HOMOLOGACAO.md`). WhatsApp: `handleCallEvent` → RPC `record_incoming_call_event` (`supabase/functions/_shared/evolution-webhook-handlers.ts:314`). O áudio **não passa pelo app** (a linha toca no aparelho da conexão). |
| **Áudio ponta a ponta no navegador** | ⚠️ mídia de saída implementada; entrada sem prova | ❌ não | Saída: tracks, mute e DTMF em `src/lib/calls/adapters/SipCallAdapter.ts:133` (DTMF só com sessão estabelecida) e `src/lib/calls/adapters/CallEngine.ts:302`. Nenhum teste de áudio real foi executado. `setSinkId` não é usado (pendência ACH-2). |
| **Recusar** | ✅ código das duas pontas; **não exercitado** contra a operadora | ❌ não comprovado | Saída pendente: `cancel()` em `src/lib/calls/adapters/SipCallAdapter.ts:94`. Entrada: `reject(invitation, 486)` em `src/lib/calls/adapters/CallEngine.ts:136`. WhatsApp: sem handler de reject (nenhum `reject` em `supabase/functions/_shared/evolution-webhook-handlers.ts`). |
| **Gravar** | ⚠️ **código completo** (T67 player + T71–T74 Edge), **sem prova de gravação real** | ❌ não | `sync-call-records` lê `voximplant.statistic.get` do Bitrix24 e grava o par (`supabase/functions/sync-call-records/index.ts:121` para `recording_status`, `:125` para `recording_url`); `get-call-recording` entrega o áudio com o JWT de quem pede e responde fora de `available` (`supabase/functions/get-call-recording/index.ts:119`); o botão só existe com `recording_status='available'` (`src/components/calls/CallHistoryTable.tsx:99`, `src/components/calls/SelectedCallPanel.tsx:123`). O que falta é **medida de produção**, não código: `BITRIX_WEBHOOK_URL` não tem no repositório nenhuma configuração nem linha de valor (a única menção é `# VITE_BITRIX_WEBHOOK_URL=` em `.env.example:87`, comentada) — sem ela a Edge roda com `{reconciliados: 0}` e `recording_status` fica `none` em toda chamada. **Não** existe bucket de gravação no Storage (`audio-memes, audio-messages, avatars, custom-emojis, stickers, team-chat-files, whatsapp-media`): o áudio é servido do provedor, não guardado por nós. |
| **Duração oficial do provedor** | ⚠️ código entregue (`sync-call-records`), **sem credencial** | ❌ não | `voximplant.statistic.get` do Bitrix: a Edge existe (`supabase/functions/sync-call-records/index.ts`) e devolve `{reconciliados: 0}` sem `BITRIX_WEBHOOK_URL`. Medido em 26/09: `duration_seconds` nunca foi preenchido (0 de 21 linhas com `answered_at`+`ended_at`); sem prova nova depois disso. |

## Provedores

| O que | Valor | Onde está no código |
|---|---|---|
| SIP (VoIP) | **Bitrix24 SIP Connector** — `ip.b24-9441-1552764901.bitrixphone.com`, ramal `phone1`, WSS porta `8089` | `supabase/functions/get-sip-password/index.ts:13` (`SIP_SERVER`, com esse host como default) e `:15` (`SIP_WS_PORT`, default `8089`); o navegador monta `wss://${server}:${wsPort}/ws` em `src/hooks/sip/useSipConnection.ts:90-91` |
| Senha SIP | segredo `SIP_PASSWORD` (Supabase), entregue por Edge Function `get-sip-password` (rate limit + JWT + perfil ativo) — **um único segredo** para todos os agentes | `supabase/functions/get-sip-password/index.ts:28` (rate limit), `:48` (perfil) e `:49` (perfil ativo), `:53` (`SIP_PASSWORD`), `:61` (devolve `server`, `user`, `wsPort`, `password`, `profileId`) |
| Ramal por agente | ❌ inexistente (D1=a): dois agentes registrados ao mesmo tempo disputam a mesma linha | idem |
| WhatsApp | **Evolution GO** (`EVOLUTION_API_FLAVOR=go`, VPS Hostinger `srv1481814`, instância `evolution-go-rxj2`) | `supabase/functions/_shared/evolution-go-routes.ts` |
| Linha WhatsApp do projeto | **1** linha: `Promo Brindes WhatsApp` (`instance_id=PRINCIPAL`, `phone_number=551146375517`, `status=disconnected`, `is_default=true`). **Não existe** linha `wpp2` | tabela `whatsapp_connections` (medido em 26/09/2026) |
| Flavor Baileys × Cloud API | **indeterminável pelo banco**: a tabela não tem `integration`/`provider`. É Evolution GO (whatsmeow) | — |
| Eventos de chamada recebidos | `handleCallEvent` → `normalizeEvolutionCallStatus` → RPC; `provider_event_id` = `data.id`/`callId`/`call_id` | `supabase/functions/_shared/evolution-webhook-handlers.ts:270` (handler) e `:314` (RPC) |

## Consequências para a UI (o que pode aparecer na tela)

- Chip "VoIP": verde só com `sipStatus === 'registered'` **e** microfone liberado; amarelo "Reconectando…" no backoff; vermelho "Telefone indisponível" sem provisionamento/403. Os rótulos e motivos vivem em `src/lib/calls/capabilities.ts` e a leitura do estado real em `src/hooks/calls/useCallChannels.ts`.
- Chip "WhatsApp": **"só recebidas"** — nunca oferecer discagem por WhatsApp nesta entrega (`canDial` falso em todos os estados de WhatsApp).
- Botão de gravação: **não renderizar** enquanto `recording_status !== 'available'` (regra mantida; `src/components/calls/CallHistoryTable.tsx:99` e `src/components/calls/SelectedCallPanel.tsx:123`). A Edge `get-call-recording` responde 404 quando não há áudio e `canRecord` é `false` no hook (`src/hooks/calls/useCallChannels.ts:114`) — nenhuma chamada ganha áudio enquanto `BITRIX_WEBHOOK_URL` não for configurada na Edge `sync-call-records`.
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

Base: leitura de `src/hooks/sip/useSipConnection.ts`, `src/lib/calls/adapters/CallEngine.ts`,
`src/lib/calls/adapters/SipCallAdapter.ts`, `src/lib/calls/callStatus.ts`,
`supabase/functions/_shared/evolution-webhook-handlers.ts`,
`supabase/functions/get-sip-password/index.ts`,
`supabase/functions/get-call-recording/index.ts`, `supabase/functions/sync-call-records/index.ts`,
`src/components/calls/CallHistoryTable.tsx` e `.env.example` — além do snapshot de contrato
comentado em `docs/telefonia/CONTRATO.md`. **Nenhuma chamada telefônica real foi feita.**
