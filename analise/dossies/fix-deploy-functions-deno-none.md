# Dossiê: claude/fix-deploy-functions-deno-none

## Identificação

- **Branch**: `claude/fix-deploy-functions-deno-none`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: COBERTA (confiança 0.90)

Fix do deploy de edge functions com deno. As correções já estão em main.

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/claude/fix-deploy-functions-deno-none
→ exit 1 — 2 conflitos em arquivos de configuração
```

Nenhum arquivo novo — apenas conflitos de conteúdo em arquivos existentes.

### Estado em main

Os 2 arquivos com conflito já têm as correções aplicadas em main por outros PRs de deploy de edge functions.

## Decisão

**Branch apagada.** Fix de deploy de edge functions já em main.
