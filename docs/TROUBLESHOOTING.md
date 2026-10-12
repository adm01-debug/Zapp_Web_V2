# 🔧 Guia de Troubleshooting - ZAPP-WEB

Este documento contém soluções para problemas comuns do ZAPP-WEB.

---

## 📋 Índice

- [Problemas de Autenticação](#problemas-de-autenticação)
- [Problemas de WhatsApp](#problemas-de-whatsapp)
- [Webhooks da Evolution — cobertura por evento](#webhooks-da-evolution--cobertura-por-evento)
- [Problemas de Edge Functions](#problemas-de-edge-functions)
- [Problemas de Performance](#problemas-de-performance)
- [Problemas de Build](#problemas-de-build)
- [Problemas de Database](#problemas-de-database)
- [Problemas de Realtime](#problemas-de-realtime)
- [Logs e Debugging](#logs-e-debugging)

---

## Problemas de Autenticação

### Usuário não consegue fazer login

**Sintomas:**
- Tela de loading infinita
- Erro "Invalid credentials"
- Redirect loop

**Soluções:**
1. Verificar se o email está confirmado
2. Verificar se a senha está correta
3. Checar se o usuário não está bloqueado (rate limit)
4. Verificar Console do navegador para erros

**Comandos úteis:**
```sql
-- Verificar status do usuário
SELECT * FROM auth.users WHERE email = 'usuario@email.com';

-- Verificar rate limit
SELECT * FROM auth.rate_limits WHERE user_id = 'xxx';
```

### MFA não funciona

**Sintomas:**
- Código TOTP inválido
- QR Code não aparece

**Soluções:**
1. Verificar sincronização de hora do dispositivo
2. Limpar cache do navegador
3. Gerar novo secret MFA

---

## Problemas de WhatsApp

### QR Code não aparece

**Sintomas:**
- Loading infinito
- Erro "Instance not found"

**Soluções:**
1. Verificar se a Evolution API está online
2. Verificar credenciais no Supabase Secrets
3. Verificar logs da Edge Function

```bash
# Testar Evolution API
curl -X GET "https://evolution.atomicabr.com.br/instance/status" \
  -H "apikey: SUA_API_KEY"
```

### Mensagens não chegam

**Sintomas:**
- Mensagens enviadas não aparecem no chat
- Webhook não dispara

**Soluções:**
1. Verificar conexão da instância WhatsApp
2. Verificar webhook URL configurada
3. Verificar logs do webhook

```bash
# Verificar webhook
curl -X GET "https://evolution.atomicabr.com.br/webhook/find/instancia" \
  -H "apikey: SUA_API_KEY"
```

### Status de entrega não atualiza

**Sintomas:**
- Mensagens ficam "enviando" forever
- Não mostra "entregue" ou "lido"

**Soluções:**
1. Verificar se webhook de status está configurado
2. Verificar processamento no banco de dados
3. Verificar Realtime está ativo para a tabela `messages`

---

## 🔌 Webhooks da Evolution — cobertura por evento

Fonte da verdade desta tabela: `supabase/functions/_shared/__tests__/evolution-webhook-event-coverage.test.ts`.
A enumeração é 1:1 com os ramos `event === '...'` de
`supabase/functions/evolution-webhook/index.ts`: **ramo novo no roteador sem linha aqui deixa o teste vermelho**,
e o teste também confere que todo evento que a Evolution está configurada a enviar
(`WEBHOOK_EVENTS`, em `supabase/functions/_shared/evolution-sync-actions.ts`) normaliza para uma linha desta lista.
Os nomes abaixo já estão na forma canônica (minúsculo, com ponto) que o roteador compara — é o que
`normalizeEventName` produz a partir das maiúsculas do Evolution v2 e dos nomes da Evolution GO
(`message`, `calloffer`, ...).

| Evento | Onde é tratado | Prova | Estado |
|---|---|---|---|
| `connection.update` | `evolution-webhook-handlers.ts:handleConnectionUpdate` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `qrcode.updated` | `evolution-webhook/index.ts` (inline: grava `qr_code`/status na conexão) | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `messages.upsert` | `evolution-webhook-messages.ts`: `handleIncomingMessage` (`fromMe=false`) / `handleOutgoingWhatsAppMessage` (`fromMe=true`) | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `send.message` | `evolution-webhook-msg-handlers.ts:handleSendMessage` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `messages.update` | `evolution-webhook-msg-handlers.ts:handleMessagesUpdate` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `messages.delete` | `evolution-webhook-msg-handlers.ts:handleMessagesDelete` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `contacts.upsert` | `evolution-webhook-handlers.ts:handleContactsUpsert` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `contacts.update` | `evolution-webhook-handlers.ts:handleContactsUpsert` (mesmo ramo de `contacts.upsert`) | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `presence.update` | `evolution-webhook-handlers.ts:handlePresenceUpdate` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `chats.upsert` | `evolution-webhook-handlers.ts:handleChatsUpdate` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `chats.update` | `evolution-webhook-handlers.ts:handleChatsUpdate` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `groups.upsert` | `evolution-webhook/index.ts` — só log (`id` + `subject`) | evolution-webhook-event-coverage.test.ts (sem acesso ao banco) | coberto (despacho) |
| `group.update` | `evolution-webhook/index.ts` — só log (`id` + `subject`) | evolution-webhook-event-coverage.test.ts (sem acesso ao banco) | coberto (despacho) |
| `group.participants.update` | `evolution-webhook/index.ts` — só log (`id` + `action` + membros) | evolution-webhook-event-coverage.test.ts (sem acesso ao banco) | coberto (despacho) |
| `group-participants.update` | `evolution-webhook/index.ts` — só log (mesmo ramo de `group.participants.update`) | evolution-webhook-event-coverage.test.ts (sem acesso ao banco) | coberto (despacho) |
| `call` | `evolution-webhook-handlers.ts:handleCallEvent` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `typebot.start` | `evolution-webhook-handlers.ts:handleTypebotEvent` (sessão do bot; sem `status` vale como `opened`) | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `typebot.change.status` | `evolution-webhook-handlers.ts:handleTypebotEvent` (mesmo ramo de `typebot.start`) | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `chats.delete` | `evolution-webhook-handlers.ts:handleChatsDelete` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `application.startup` | `evolution-webhook-handlers.ts:handleApplicationStartup` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `messages.set` | `evolution-webhook-msg-handlers.ts:handleMessagesSet` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `contacts.set` | `evolution-webhook-handlers.ts:handleContactsSet` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `chats.set` | `evolution-webhook-handlers.ts:handleChatsSet` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `messages.edited` | `evolution-webhook-msg-handlers.ts:handleMessagesEdited` | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |
| `messages.edit` | `evolution-webhook-msg-handlers.ts:handleMessagesEdited` (mesmo ramo de `messages.edited`) | evolution-webhook-event-coverage.test.ts (toca o banco) | coberto (despacho) |

"coberto (despacho)" é o que este teste prova: o evento atravessa o gate, é reconhecido e chega ao ramo
declarado. **Não** é prova de que a regra de negócio dentro do handler está certa — isso é coberto (quando
existe) pelos testes específicos do evento, citados no topo de cada arquivo de handler.

### Um evento chegou e nada aconteceu na tela

1. Confira o log do webhook: o roteador imprime `Evolution webhook received: <nome-cru> -> <canônico> <instância>`.
2. Se o nome canônico **não** estiver na tabela acima, o roteador não tem ramo para ele — é evento novo do provedor,
   não um defeito de dados.
3. Se estiver, veja a coluna "Onde é tratado": eventos com "só log" (grupos) não gravam nada de propósito.
4. Ainda assim sem efeito: a instância pode não ter conexão resolvida (`whatsapp_connections.instance_id`) — os
   handlers de mensagem, contato, etiqueta e chamada falham fechado e retornam sem gravar quando não há conexão.
5. Recibo de 401 no provedor: é o gate de autenticidade (`x-evolution-signature` inválida, ou `instanceToken`
   ausente/divergente de `EVOLUTION_INSTANCE_TOKEN` e da credencial por instância). O modo de operação está em
   `EVOLUTION_WEBHOOK_ENFORCE` (`token` é o padrão; `shadow` só loga e é rollback de operação, não default).
6. Registrar/renovar o webhook no provedor reenvia sempre a mesma lista de eventos (`WEBHOOK_EVENTS`).

### Como rodar a prova local

```bash
deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
  supabase/functions/_shared/__tests__/evolution-webhook-event-coverage.test.ts
```

O teste sobe um Supabase **falso** em `127.0.0.1` (nenhum banco real, nenhuma instância de produção) e envia um
envelope mínimo por evento, com instância própria de teste.

---

## Problemas de Edge Functions

### Função retorna 500

**Sintomas:**
- Internal Server Error
- Timeout

**Soluções:**
1. Verificar logs da função no Dashboard
2. Verificar se secrets estão configurados
3. Verificar sintaxe do código

```bash
# Ver logs
supabase functions logs evolution-api --project-ref tnnnlkbymytvtqngbbqh
```

### Função não é encontrada

**Sintomas:**
- 404 Not Found
- "Function not found"

**Soluções:**
1. Verificar se a função foi deployada
2. Verificar nome correto na URL
3. Redeploy da função

```bash
# Deploy manual
supabase functions deploy evolution-api --project-ref tnnnlkbymytvtqngbbqh
```

### CORS Error

**Sintomas:**
- "Access-Control-Allow-Origin" error
- Request blocked

**Soluções:**
1. Verificar headers CORS na função
2. Verificar origem permitida

**Código correto:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // ou domínio específico
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

---

## Problemas de Performance

### App lento para carregar

**Soluções:**
1. Verificar bundle size: `bun run build --analyze`
2. Verificar lazy loading de rotas
3. Verificar queries pesadas

### Queries lentas

**Soluções:**
1. Verificar índices no banco
2. Verificar se RLS policies estão otimizadas
3. Usar `explain analyze` para identificar gargalos

```sql
EXPLAIN ANALYZE SELECT * FROM messages WHERE conversation_id = 'xxx';
```

### Muitas requisições

**Soluções:**
1. Verificar se React Query está com cache configurado
2. Verificar se há re-renders desnecessários
3. Usar React DevTools Profiler

---

## Problemas de Build

### Build falha com erro de tipos

**Soluções:**
```bash
# Verificar erros de tipo
bun run typecheck

# Limpar cache
rm -rf node_modules .vite dist
bun install
bun run build
```

### Módulo não encontrado

**Soluções:**
1. Verificar se dependência está no package.json
2. Verificar se import path está correto
3. Reinstalar dependências

```bash
rm -rf node_modules bun.lockb
bun install
```

### Out of memory

**Soluções:**
```bash
# Aumentar memória do Node
NODE_OPTIONS="--max-old-space-size=4096" bun run build
```

---

## Problemas de Database

### RLS Policy bloqueando

**Sintomas:**
- Dados não aparecem
- Erro "new row violates row-level security policy"

**Soluções:**
1. Verificar se usuário tem role correto
2. Verificar policy da tabela
3. Testar como admin

```sql
-- Verificar policies da tabela
SELECT * FROM pg_policies WHERE tablename = 'messages';

-- Verificar role do usuário
SELECT * FROM profiles WHERE user_id = 'xxx';
```

### Migration falha

**Soluções:**
1. Verificar sintaxe SQL
2. Verificar dependências (ordem das migrations)
3. Testar em staging primeiro

```bash
# Ver status
supabase migration list

# Reparar migrations
supabase migration repair --status reverted
```

---

## Problemas de Realtime

### Eventos não chegam

**Sintomas:**
- Mensagens não aparecem em tempo real
- Dashboard não atualiza

**Soluções:**
1. Verificar se Realtime está habilitado para a tabela
2. Verificar conexão WebSocket
3. Verificar subscription no código

```sql
-- Verificar publicação Realtime
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

### WebSocket desconecta

**Sintomas:**
- Conexão cai frequentemente
- Erro "WebSocket closed"

**Soluções:**
1. Verificar conectividade de rede
2. Implementar reconexão automática
3. Verificar limite de conexões

---

## Logs e Debugging

### Onde encontrar logs

| Componente | Localização |
|------------|-------------|
| Frontend | Console do navegador (F12) |
| Edge Functions | Supabase Dashboard > Functions > Logs |
| Database | Supabase Dashboard > Database > Query Performance |
| Auth | Supabase Dashboard > Auth > Logs |
| Realtime | Supabase Dashboard > Settings > Realtime |

### Como habilitar debug mode

```typescript
// No código
localStorage.setItem('debug', 'true');

// Ou via env
VITE_DEBUG=true
```

### Testar Edge Functions localmente

```bash
# Iniciar Supabase local
supabase start

# Servir funções
supabase functions serve

# Testar
curl -X POST http://localhost:54321/functions/v1/evolution-api \
  -H "Authorization: Bearer xxx" \
  -d '{"action": "test"}'
```

---

## Contatos de Emergência

- **TI**: ti@promobrindes.com.br
- **Supabase**: support@supabase.io
- **Evolution API**: Comunidade no Discord

---

*Última atualização: 2026-04-12*
