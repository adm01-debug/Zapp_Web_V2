# 🔧 Guia de Troubleshooting - ZAPP-WEB

Este documento contém soluções para problemas comuns do ZAPP-WEB.

---

## 📋 Índice

- [Problemas de Autenticação](#problemas-de-autenticação)
- [Problemas de WhatsApp](#problemas-de-whatsapp)
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
