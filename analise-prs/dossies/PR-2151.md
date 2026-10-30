# Dossiê PR #2151

**Título:** (ver via API — PR massiva, 325 arquivos)
**Branch:** verificar via API
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **mergeable_state:** dirty

---

## Veredito

**BLOQUEADO_WORKFLOWS**

PR massiva (325 arquivos) toca `.github/workflows/` — proibido por regra explícita de sessão. Além disso, PR está com conflitos ativos.

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 325 arquivos — PR de escopo massivo.

**Evidência de .github/workflows/:**
```
grep ".github/workflows" no diff → referências confirmadas
```
PR contém modificações em arquivos de workflow do GitHub Actions.

**mergeable_state:** `dirty` — conflitos ativos com main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **BLOQUEADA** — 325 arquivos + .github/workflows/ + conflitos ativos |
| 2 | Traz regressão? | **NÃO VERIFICÁVEL** — escopo massivo + FORBIDDEN |
| 3 | Já está em main? | **NÃO** — mergeable_state dirty; PR não mergeada |
| 4 | Regra de negócio correta? | **NÃO VERIFICÁVEL** — análise bloqueada |

## Bloqueio

1. Regra explícita: "Não tocar .github/workflows." — PR modifica workflows
2. `mergeable_state: dirty` — conflitos ativos
3. Escopo de 325 arquivos — PR excessivamente grande para análise automática segura

## Ação necessária

Requer decisão humana (Joaquim) para revisão manual completa desta PR massiva. Considerar dividir em PRs menores por tema.
