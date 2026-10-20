# ADR-006: Cache de whatsapp_connections nas Edge Functions

## Status
**Proposto** — implementação pendente

## Contexto

### O problema

A tabela `whatsapp_connections` tem **2 linhas** e acumula **37,9 milhões de seq scans** desde o último restart do Postgres. O `idx_scan` é **zero** — nenhum index foi usado.

Isso é tecnicamente correto: o planner do PostgreSQL sempre escolhe seq scan em tabelas com 2 linhas, pois é mais rápido que usar um B-tree index. O problema real é a **frequência absurda de queries** — estimativa de ~40.000 queries/hora nessa tabela.

### Causa raiz identificada

As Edge Functions `evolution-webhook` e `evolution-api` consultam `whatsapp_connections` em **todo processamento de mensagem** para:
1. Verificar se a instância está ativa (`is_active = true`)
2. Obter configurações da conexão
3. Validar o `instance_name`

Com ~1.836.538 mensagens em `evolution_messages_wpp2`, cada mensagem provavelmente disparou pelo menos 1 query nessa tabela.

## Decisão

Implementar **cache em memória por instância** nas Edge Functions Deno, com TTL de 5 minutos.

### Implementação recomendada

```typescript
// supabase/functions/_shared/whatsapp-connections-cache.ts

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CachedConnection {
  data: WhatsAppConnection;
  expiresAt: number;
}

// Cache em memória — sobrevive entre invocações quentes da mesma isolate
const connectionCache = new Map<string, CachedConnection>();

export async function getConnection(
  supabase: SupabaseClient,
  instanceName: string,
): Promise<WhatsAppConnection | null> {
  const cached = connectionCache.get(instanceName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('*')
    .eq('instance_name', instanceName)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  connectionCache.set(instanceName, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return data;
}

export function invalidateConnectionCache(instanceName?: string) {
  if (instanceName) {
    connectionCache.delete(instanceName);
  } else {
    connectionCache.clear();
  }
}
```

### Pontos de invalidação obrigatórios

Invalidar o cache sempre que:
- Um webhook de `CONNECTION_UPDATE` for recebido
- A Edge Function `evolution-sync` atualizar uma conexão
- A tabela `whatsapp_connections` for atualizada diretamente

### Impacto esperado

| Métrica | Antes | Depois |
|---|---|---|
| Queries em `whatsapp_connections` | ~40K/hora | ~50/hora (apenas cold cache) |
| Redução de carga no Postgres | — | ~99,9% nessa tabela |
| Latência por webhook | +1-2ms (query) | +0,01ms (map lookup) |

## Alternativas consideradas

### 1. Adicionar mais índices em whatsapp_connections (descartado)
O planner usa seq scan corretamente em tabelas de 2 linhas. Mais índices não ajudariam.

### 2. Materializar em variável de ambiente (descartado)
Env vars não permitem refresh dinâmico sem redeploy.

### 3. Cache no Supabase KV / Redis (não disponível)
O projeto não usa Redis. Deno KV poderia funcionar mas adiciona dependência.

## Consequências

- Redução drástica de carga no Postgres
- Latência de propagação de até 5 minutos em mudanças de conexão (aceitável)
- Necessário garantir invalidação em `CONNECTION_UPDATE` webhooks
