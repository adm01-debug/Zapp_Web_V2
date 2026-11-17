# Dossiê PR #2155

**Título:** (ver via API — PR grande, 46 arquivos)
**Branch:** verificar via API
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **mergeable_state:** dirty

---

## Veredito

**BLOQUEADO_WORKFLOWS**

PR toca `.github/workflows/` — proibido por regra explícita de sessão. Além disso, 46 arquivos com conflitos.

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 46 arquivos.

**Evidência de .github/workflows/:**
```
grep ".github/workflows" no diff → referências confirmadas
```
Confirmado: PR contém modificações em arquivos de workflow do GitHub Actions.

**mergeable_state:** `dirty` — conflitos ativos com main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **BLOQUEADA** — toca `.github/workflows/` (regra proibida) + conflitos ativos |
| 2 | Traz regressão? | **NÃO VERIFICÁVEL** — não analisado por ser FORBIDDEN |
| 3 | Já está em main? | **NÃO** — mergeable_state dirty; PR não mergeada |
| 4 | Regra de negócio correta? | **NÃO VERIFICÁVEL** — análise bloqueada |

## Bloqueio

Regra explícita: "Não tocar .github/workflows." — PR modifica arquivos de workflow do GitHub Actions. Merge por agente é proibido.

## Ação necessária

Requer decisão humana (Joaquim) para revisar as mudanças de workflow e aprovar manualmente.
