# Baseline do main — SHA: c4280ef4c0f60f2cdfb31bcdf56e26b1ee7e9b32
Data: 2026-11-02

## Build
- `bun run build` → exit 0 (20.96s, sem erros)
- Arquivo: `analise-prs/baseline/build.txt`

## TypeCheck
- `tsc --noEmit` → SIGABRT/OOM — falha pré-existente do container (sem RAM suficiente)
- NÃO é regressão de código; é limitação do container de CI
- Arquivo: `analise-prs/baseline/typecheck.txt`

## Lint
- `eslint src/` → 746 problemas: 533 erros + 213 warnings (todos pré-existentes)
- Arquivo: `analise-prs/baseline/lint.txt` (parcial — 6 linhas de sumário)

## Unit tests
- `vitest run` → 67 testes passando, 0 falhas (3 arquivos: contratosModulo, emailContactContext, useSupervisorQueue)
- Arquivo: `analise-prs/baseline/tests.txt`

## Merge-trees
- 21 PRs testadas contra main `630fb557` com `git merge-tree --write-tree`
- Arquivo: `analise-prs/baseline/merge-trees.txt` (311 linhas)
