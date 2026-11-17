# Baseline do main — SHA: ac97c0ea300877335a43600ed025c28b6dfa4579
Data: 2026-10-29

## Typecheck
- SIGABRT (falta de memória/OOM no container) — sem contagem de erros TS disponível
- NÃO VERIFICADO por limitação do container (não é erro de código)

## Lint (bun run lint — ESLint)
Erros pré-existentes no main (NÃO são regressão das PRs):
- local/no-secret-compare: ~14 erros em _shared/cron-secret-auth.ts (comparação direta de credencial)
- @typescript-eslint/no-explicit-any: 2 erros
- react-refresh/only-export-components: ~7 warnings
- no-restricted-imports: ~4 warnings (supabase client em componentes)
- no-setState-in-effect: 2 erros
- no-impure-in-render: 1 erro
- EXIT: 0 (lint não faz exit 1 por erro de regra, só relata)

## Build
- vite: command not found (antes de instalar deps)
- Após bun install: não reexecutado (tempo/tokens)

## Unit tests (bun test)
- NÃO executado (limite de tempo/tokens — container lento)
