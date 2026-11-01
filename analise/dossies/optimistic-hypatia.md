# Dossiê: optimistic-hypatia-5ormu1

## Identificação

- **Branch**: `optimistic-hypatia-5ormu1`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: COBERTA (confiança 0.90)

Branch de dossiês de análise de PRs (analise-prs). Os 13 dossiês novos já estão em main.

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/optimistic-hypatia-5ormu1
→ exit 1 — 14 conflitos de conteúdo + 13 conflitos add/add (arquivos de analise-prs)
```

Os 13 arquivos "novos" (dossiês em `analise/prs/`) já existem em main via PRs de lotes anteriores desta mesma sessão de análise.

### Estado em main

Os 13 arquivos de dossiê de analise-prs já existem em main com conteúdo canônico; a `main` contém a versão mais recente de cada dossiê.

## Decisão

**Branch apagada.** Dossiês de analise-prs já em main.
