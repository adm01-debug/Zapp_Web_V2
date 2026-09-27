# Telefonia — Matriz de capacidades reais (por canal)

Medido em **26/09/2026** contra o código de `origin/main` (`001fd46`) e o banco oficial
(Supabase Cloud `tnnnlkbymytvtqngbbqh`, via gateway MCP). Este documento diz o que **existe** e o que
**não foi comprovado** — é o que a UI tem permissão de prometer.

## Matriz

| Capacidade | VoIP | WhatsApp | Evidência |
|---|---|---|---|
| **Discar (saída)** | ✅ sim | ❌ **não** | VoIP: SIP.js `Inviter` em `useSipClient.ts`. WhatsApp: nenhum endpoint de originação é chamado em nenhum lugar do código; o webhook Evolution só **recebe** eventos. |
| **Receber (entrada)** | ⚠️ código existe, **não homologado** | ⚠️ evento sim, **áudio não** | VoIP: `useSipConnection.ts:54` monta `delegate.onInvite` (PR #868) e `CallSessionProvider` está montado; chamada real nunca foi exercitada nesta análise. WhatsApp: `handleCallEvent` no webhook → RPC `record_incoming_call_event`. O áudio **não passa pelo app** (a linha toca no aparelho da conexão). |
| **Áudio ponta a ponta no navegador** | ⚠️ mídia de saída implementada (`getUserMedia`, tracks, DTMF); entrada sem prova | ❌ não | Nenhum teste de áudio foi executado. `setSinkId` não é usado. |
| **Recusar** | ✅ `inviter.cancel()` existe; recusa de chamada **recebida** não foi exercitada | ❌ não comprovado | Sem handler de reject para o WhatsApp (nenhum `reject` em `evolution-webhook-handlers.ts`). |
| **Gravar** | ❌ nenhuma fonte | ❌ não | Sem bucket de gravação no Storage (`audio-memes, audio-messages, avatars, custom-emojis, stickers, team-chat-files, whatsapp-media`); `BITRIX_WEBHOOK_URL` **não configurado** (só a linha comentada `# VITE_BITRIX_WEBHOOK_URL` no `.env.example`). `recording_url` nunca foi gravado em produção. |
| **Duração oficial do provedor** | ❌ não | ❌ não | `voximplant.statistic.get` do Bitrix **não testado** (sem webhook REST). `duration_seconds` no banco nunca foi preenchido (0 de 21 linhas com `answered_at`+`ended_at`). |

## Provedores

| O que | Valor | Onde está no código |
|---|---|---|
| SIP (VoIP) | **Bitrix24 SIP Connector** — `ip.b24-9441-1552764901.bitrixphone.com`, ramal `phone1`, WSS porta `8089` | `src/hooks/communication/useSipClient.ts:15-17` (hardcoded) |
| Senha SIP | segredo `SIP_PASSWORD` (Supabase), entregue por Edge Function `get-sip-password` (JWT + perfil ativo + rate limit) — **um único segredo** para todos os agentes | `supabase/functions/get-sip-password/index.ts` |
| Ramal por agente | ❌ inexistente (D1=a): dois agentes registrados ao mesmo tempo disputam a mesma linha | idem |
| WhatsApp | **Evolution GO** (`EVOLUTION_API_FLAVOR=go`, VPS Hostinger `srv1481814`, instância `evolution-go-rxj2`) | `supabase/functions/_shared/evolution-go-routes.ts` |
| Linha WhatsApp do projeto | **1** linha: `Promo Brindes WhatsApp` (`instance_id=PRINCIPAL`, `phone_number=551146375517`, `status=disconnected`, `is_default=true`). **Não existe** linha `wpp2` | tabela `whatsapp_connections` |
| Flavor Baileys × Cloud API | **indeterminável pelo banco**: a tabela não tem `integration`/`provider`. É Evolution GO (whatsmeow) | — |
| Eventos de chamada recebidos | `handleCallEvent` → `normalizeEvolutionCallStatus` → RPC; `provider_event_id` = `data.id`/`callId`/`call_id` | `_shared/evolution-webhook-handlers.ts:235-284` |

## Consequências para a UI (o que pode aparecer na tela)

- Chip "VoIP": verde só com `sipStatus === 'registered'` **e** microfone liberado; amarelo "Reconectando…" no backoff; vermelho "Telefone indisponível" sem provisionamento/403.
- Chip "WhatsApp": **"só recebidas"** — nunca oferecer discagem por WhatsApp nesta entrega.
- Botão de gravação: **não renderizar** enquanto `recording_status !== 'available'`. Hoje nenhuma chamada tem gravação, e não há fonte configurada.
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
Mais leitura do código em `useSipClient.ts`, `useSipConnection.ts`, `evolution-webhook-handlers.ts`,
`get-sip-password/index.ts` e `.env.example`. **Nenhuma chamada telefônica real foi feita.**
