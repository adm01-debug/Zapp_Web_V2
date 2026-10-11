Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/components/reports/AutoExportManager.tsx: removido o componente (git rm) — regra do Joaquim (07/10): nenhuma informação sai do sistema; o Zapp não exporta.
- src/pages/lazyViews.ts: removido o lazy `AutoExportManager` (import dinâmico do componente).
- src/pages/ViewRouter.tsx: removida a entrada `'auto-export'` do VIEW_MAP.
- src/services/navigation.service.ts: removido o item `{ id: 'auto-export', label: 'Export Auto' }` do menu avançado e o ícone `ClipboardList` do import (ficou sem uso só por causa desse item).
- src/pages/__tests__/ViewRouter.autoExportRemovido.test.tsx: teste novo que prova a remoção.

Comportamento do link antigo: com o item fora da nav, `NavigationService.canAccess('auto-export', ...)` cai no `if (!item) return false` (linha ~197) → deep link `?view=auto-export` vira view desconhecida e é negado (RestrictedView "Acesso restrito"), o mesmo padrão de qualquer id não mapeado.

## Prova
- vermelho antes: `npx vitest run src/pages/__tests__/ViewRouter.autoExportRemovido.test.tsx` (sem a mudança) → `Tests 3 failed (3)`: `expected [ 'audit-logs', 'auto-export', …(8) ] to not include 'auto-export'` e `expected true to be false` em `canAccess('auto-export', ['admin'])`.
- verde depois: `npx vitest run src/pages/__tests__/ViewRouter.autoExportRemovido.test.tsx src/services/__tests__/navigation.service.test.ts src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx src/hooks/ui/__tests__/useNavShortcuts.test.tsx src/components/layout/__tests__/shellLayout.contrato.test.tsx` → `Test Files 5 passed (5); Tests 34 passed (34)`.
- critério de pronto: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (64s)` (tipos OK, lint OK).

## Varredura (O QUE FAZER item 1)
- `git grep -n "AutoExportManager\|auto-export" -- src` → só as 4 ocorrências removidas; nenhuma sobrou.
- Hooks/serviços usados SÓ por ele: nenhum. O componente importava apenas `Card/CardContent` e o ícone `ShieldAlert` (nada de hook/service).
- Edge Function/tabela usados só por ele: nenhum. `git grep -n "auto-export\|auto_export" -- supabase` → vazio (sem Edge `zapp-auto-export`, sem tabela `auto_export_jobs` no V2). Portanto NÃO há cartão de banco/edge pendente para este item.
- Referências restantes a "AutoExportManager"/"auto-export" estão só em documentos históricos (docs/audits, docs/plans, docs/reconciliation) — fora do escopo do cartão (ARQUIVOS QUE PODE TOCAR limita a src/pages, src/services, src/components/reports); não toquei.

## O que NÃO fiz e por quê
- Não mexi em docs/* (planos e auditorias históricas mencionam a view): escopo do cartão é remover a tela do app, não reescrever histórico.
- Não removi nada de banco/Edge: não existe Edge ou tabela exclusiva desta view no V2 (ver varredura).
