# Dossiê PR #2354

**Título:** fix: corrige 3 workflows com falhas de CI
**Branch:** `claude/fix-3-workflows`
**Head SHA:** (conflito — não lido)
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**DECISAO_HUMANA** — toca `.github/workflows/`

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** múltiplos arquivos em `.github/workflows/` — correções em 3 workflows com falhas.
**mergeable_state:** `dirty` — conflito com a main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Possivelmente — corrige workflows; mas pode estar superada por PRs #2407/#2408/#2409 |
| 2 | Traz regressão? | Risco — múltiplas mudanças em workflows de CI |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Requer verificação — pode haver sobreposição com outras PRs de fix de CI |

## Bloqueio atual

- Toca `.github/workflows/` — proibido mergear automaticamente.
- Conflito de merge (`dirty`).
- Potencial sobreposição com PRs #2407, #2408, #2409.

## Ação necessária

Requer avaliação do Joaquim. Verificar se não conflita com #2407/#2408/#2409 antes de aprovar.
