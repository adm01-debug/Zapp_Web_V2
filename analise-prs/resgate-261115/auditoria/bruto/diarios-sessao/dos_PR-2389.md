# Dossiê PR #2389

**Título:** PR invertida — comparação adm01-debug:claude/dazzling-cannon contra main
**Branch:** base=`claude/dazzling-cannon-*`, head=`main`
**Head SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (SHA da main — PR invertida)
**Base SHA:** (branch feature — não é main)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** —

---

## Veredito

**BLOQUEADO_CI_E_BEHIND** (PR INVERTIDA)

## Análise com evidência de diff (lido em 2026-10-31)

**ANOMALIA CRÍTICA:** Esta PR tem `head=main` e `base=feature branch`. O sentido correto para mergear código em main seria `head=feature branch` e `base=main`. Esta PR está invertida.

**mergeable_state:** `behind` — a base (feature branch) está atrás da main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Não — PR invertida |
| 2 | Traz regressão? | N/A |
| 3 | Já está em main? | N/A — head é a própria main |
| 4 | Regra de negócio correta? | N/A — PR mal configurada |

## Bloqueio atual

- PR invertida: `head=main`, `base=feature branch`.
- `behind`: a base (feature branch) está atrás da main.

## Ação necessária

Requer decisão humana — fechar esta PR e criar nova com sentido correto se necessário.
