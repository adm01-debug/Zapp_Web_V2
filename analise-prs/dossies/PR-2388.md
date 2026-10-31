# Dossiê PR #2388

**Título:** PR invertida — tenta mergear main na branch feature
**Branch:** base=`claude/fix-unit-tests-src-261024-1630`, head=`main`
**Head SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (SHA da main — PR invertida)
**Base SHA:** (branch feature — não é main)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** —

---

## Veredito

**BLOQUEADO_CI** (PR INVERTIDA — unmergeable no sentido correto)

## Análise com evidência de diff (lido em 2026-10-31)

**ANOMALIA CRÍTICA:** Esta PR tem `head=main` e `base=feature branch`. O sentido correto para mergear código em main seria `head=feature branch` e `base=main`. Esta PR está invertida — ela tentaria mergear a main NA branch feature, não o contrário.

**mergeable_state:** `dirty` — conflito (impossível mergear main na feature branch que divergiu).

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Não — PR invertida, não pode mergear código em main |
| 2 | Traz regressão? | N/A — não é possível mergear |
| 3 | Já está em main? | N/A — head é a própria main |
| 4 | Regra de negócio correta? | N/A — PR mal configurada |

## Bloqueio atual

- PR invertida: `head=main`, `base=feature branch`. Não é possível usar esta PR para mergear código em main.

## Ação necessária

Requer decisão humana — fechar esta PR ou criar nova PR com sentido correto (`head=feature`, `base=main`).
