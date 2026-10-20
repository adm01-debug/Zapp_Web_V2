# Catálogo F3 — QA E40

Data: 2026-09-22
Branch: main @ dd210916

## Checklist de integração

| E | Descrição | Arquivo(s) | Status |
|---|---|---|---|
| E31 | Layout grid [1fr 300px] + scroll único | ExternalProductManagement.tsx:247 | ✅ |
| E32 | ModuleHeader com chip sincronização | ExternalProductManagement.tsx | ✅ |
| E33 | CatalogKpiStrip com useCatalogStats | catalogShared.tsx:KpiCard | ✅ |
| E34 | CategoryChips horizontal c/ overflow Mais | catalogShared.tsx:CategoryChips | ✅ |
| E35 | Persist sort/view localStorage/sessionStorage | ExternalProductManagement.tsx:109-114 | ✅ |
| E36 | Sheet filtros avançados (is_bestseller, price_min/max) | CatalogAdvancedFilters.tsx | ✅ |
| E37 | Sort by dropdown 7 opções + tabular-nums | ExternalProductManagement.tsx:113,137 | ✅ |
| E38 | Busca ⌘K produtos no CommandPalette | GlobalKeyboardProvider.tsx:36,122 | ✅ |
| E39 | Empty states com/sem filtros + AlertCard erro | ExternalProductManagement.tsx:285,428 | ✅ |

## Métricas (main @ dd210916)

- Typecheck: 0 erros
- Lint: 1112 (3 remoções desde a F3; 0 novas)
- Vitest: 3143/3143 tests passando (237 suites)
- Bundle inicial: 336.1 KB (budget 350 KB) — fix PR #443 efetivo

## Notas

- CategoryChips usa mapa curado de 70 ícones (catalogCategoryIcons.ts) sem importar lucide-react inteiro
- AdvancedFilterChips e countAdvancedFilters em catalogShared.tsx (eslint-disable react-refresh)
- CatalogAdvancedFilters.tsx inicializa local state de filters via key={String(advancedOpen)} — sem useEffect set-state
- useCatalogQuickSearch.ts (é .ts, sem JSX) — icon undefined (fallback de categoria)
