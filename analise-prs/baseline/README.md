# Baseline do main — 2026-10-30

**SHA do main:** `7275a0703a1fb515d5c5716158d0a8588b569bd4`
**Commit:** refactor(copilot): une os 5 pares de hooks duplicados do RADAR (#2379)

## Resultados

| Check | Status | Notas |
|---|---|---|
| typecheck (tsc -b) | FAIL | SIGABRT — crash do Node no contêiner cloud |
| lint (eslint) | FAIL | Cannot find package '@eslint/js' (deps locais incompletas) |
| build (vite) | PENDENTE | Rodando em background |
| unit tests | PENDENTE | Rodando em background |

## Observações

O ambiente de CI cloud não tem as dependências nativas completas (SIGABRT no tsc sugere crash de OOM/sandbox).
Referência de regressão: **CI do GitHub Actions** (checks na PR) é a fonte canônica.
Baseline local = útil para verificar se arquivos existem/têm conteúdo esperado, não para rodar tsc/vitest.
