# ADR-001: Uso de React Query para Server State

## Status: Aceito
## Data: 2025-01-15

## Contexto
O projeto precisava gerenciar estado do servidor (cache, revalidação, loading/error states, optimistic updates) de forma escalável para múltiplas entidades (contacts, messages, queues, campaigns).

## Alternativas Consideradas
1. **Redux + Redux Toolkit Query** — Mais boilerplate, estado global centralizado.
2. **Zustand** — Leve, mas sem cache automático de server state.
3. **React Query (@tanstack/react-query)** — Cache automático, revalidação, deduplicação.

## Decisão
Adotamos React Query v5 como gerenciador de server state com configuração otimizada:
- `staleTime: 5min` para evitar refetches desnecessários
- `gcTime: 30min` para manter cache em navegação back/forward
- `refetchOnWindowFocus: false` para evitar refetches em alt-tab
- `refetchOnReconnect: 'always'` para garantir dados frescos após reconexão

## Consequências
- ✅ Cache automático com invalidação granular
- ✅ Deduplicação de requests simultâneos
- ✅ Loading/error states declarativos
- ✅ Suporte a optimistic updates
- ❌ Devs precisam entender query keys e invalidation patterns
- ❌ Não substitui client-only state (usar useState/useReducer para UI state)
