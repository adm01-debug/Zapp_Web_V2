# Dossiê: claude/fix-ci-mocks-framer-261025-1700

## Identificação

- **Branch**: `claude/fix-ci-mocks-framer-261025-1700`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: COBERTA (confiança 0.90)

Adiciona mocks do framer-motion para testes que falhavam no CI. Todos os mocks já foram aplicados em main por outros PRs de correção de CI que correram em paralelo.

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/claude/fix-ci-mocks-framer-261025-1700
→ exit 1 — 7 conflitos em arquivos de teste
```

### Estado em main

Os 7 arquivos de teste com conflito já têm as correções de mock em main, aplicadas por outros PRs do mesmo período.

## Decisão

**Branch apagada.** Mocks do framer-motion já em main.
