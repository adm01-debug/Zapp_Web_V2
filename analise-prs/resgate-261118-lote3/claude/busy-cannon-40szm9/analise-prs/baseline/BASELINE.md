# Baseline do main — c4280ef4 (2026-11-02)

## Build
- `bun run build`: ✅ exit 0, 20.96s, sem erros
- Detalhes: `analise-prs/baseline/build.txt`

## TypeCheck
- `tsc --noEmit`: ❌ OOM/SIGABRT — falha pré-existente (sem RAM no container)
- NÃO é erro de código TypeScript
- Detalhes: `analise-prs/baseline/typecheck.txt`

## Lint
- `eslint src/`: ⚠️ 746 problemas (533 erros, 213 warnings) — todos pré-existentes
- EXIT=0 (lint não faz exit 1 por regras)
- Detalhes: `analise-prs/baseline/lint.txt`

## Testes
- Suíte completa: NÃO VERIFICADO (container OOM/timeout)
- 67 testes verificados em 3 arquivos: PASS
- Detalhes: `analise-prs/baseline/tests.txt`

## Critério de regressão
Uma PR só introduz regressão se adiciona NOVOS erros/falhas não presentes neste baseline.
- Build novo quebrando = regressão
- Novo erro TS que antes não existia = regressão
- Novo lint error = regressão  
- Novo teste falhando = regressão
- TypeCheck OOM, lint 746 erros e testes OOM = PRÉ-EXISTENTES, não contam
