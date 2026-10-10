# ADR-003: Lazy Loading Universal para Rotas e Módulos

## Status: Aceito
## Data: 2025-03-01

## Contexto
O bundle inicial do app estava crescendo significativamente com 14+ módulos (Inbox, CRM, Dashboard, Campanhas, etc.), impactando LCP e TTI em conexões lentas.

## Decisão
Todas as rotas são lazy-loaded via `React.lazy()` + `Suspense` com fallback skeleton unificado (`RouteLoadingFallback`). O `ViewRouter` interno utiliza um mapa declarativo (`VIEW_MAP`) para carregamento sob demanda de cada módulo.

## Consequências
- ✅ Bundle inicial reduzido em ~60%
- ✅ Cada módulo é um chunk independente carregado sob demanda
- ✅ ErrorBoundary por módulo isola falhas sem derrubar o app inteiro
- ❌ Primeira navegação a cada módulo tem breve flash de loading
- ❌ Prefetching manual necessário para rotas críticas (hover/intent)
