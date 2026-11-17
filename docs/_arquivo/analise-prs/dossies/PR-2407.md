# Dossiê PR #2407

**Título:** fix(deploy-functions): W100 — instala @types/node via npm no workflow
**Branch:** `claude/fix-deploy-functions-types-node`
**Head SHA:** `d8426a2d5d4130bd4e46f92e41bfafd5756621a3`
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**DECISAO_HUMANA** — toca `.github/workflows/`

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** `.github/workflows/deploy-functions.yml` — adiciona instalação de `@types/node` via npm.
**mergeable_state:** `blocked` — CI em andamento.
**Tipo:** Fix de CI para deploy de Edge Functions.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Possivelmente — mas pode conflitar com #2408 e #2409 (mesma área) |
| 2 | Traz regressão? | Risco baixo — adiciona dependência ao workflow |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Plausível, mas toca `.github/workflows/` — fora do escopo automático |

## Bloqueio atual

- Toca `.github/workflows/` — proibido mergear automaticamente por regra da sessão.
- Potencial sobreposição com #2408 e #2409.

## Ação necessária

Requer aprovação humana (Joaquim). Coordenar com #2408 e #2409 para evitar conflitos.
