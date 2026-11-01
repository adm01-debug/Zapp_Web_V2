# Dossiê: claude/feat-copiloto-cv111-120-guardrails-261016-0810

## Identificação

- **Branch**: `claude/feat-copiloto-cv111-120-guardrails-261016-0810`
- **Tip SHA**: `6d65e42d6`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: COBERTA (confiança 0.82)

Fase 12 do plano RADAR (versão matinal). Apenas conflitos de barrel. 10 novos arquivos; PR #2361 escolheu quais incluir na versão final.

O sistema Copiloto RADAR completo (fases 8–15) foi mergeado via PR #2361 com 80+ hooks
e 21 componentes. As versões nesta branch são iterações anteriores não selecionadas para
a versão final.

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/claude/feat-copiloto-cv111-120-guardrails-261016-0810
→ exit 1 (conflitos)
Conflitos: index.ts barrel x2 (content only)
```

### Arquivos novos não em main

`10 arquivos novos (guardrails, biasChecker, dataMasking, honestUrgency, lgpdFilter, piiDetector, negotiationGuard, vendorAuthorization, promptVersioning, aiJudge)`

### PR #2361 (mergeado 2026-10-30)

`feat: Copiloto RADAR Fases 8–15 (CV-071–150) — 80 hooks, 21 componentes, 2 migrations,
edge copilot-live` — cobre todo o conteúdo funcional desta fase.

## Decisão

**Branch apagada.** Conteúdo coberto pela versão final do Copiloto RADAR (PR #2361).
Os arquivos novos são variantes experimentais não incluídas na versão final.
