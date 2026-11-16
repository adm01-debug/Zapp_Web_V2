# Dossiê PR #2295

**Título:** feat(ci): E71 — pular PRs draft no auto-update-pr-branch
**Branch:** `claude/feat-ci-skip-drafts-e71`
**Head SHA:** (conflito — não lido)
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**DECISAO_HUMANA** — toca `.github/workflows/`

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** `.github/workflows/auto-update-pr-branch.yml` — adiciona condição para pular PRs draft.
**mergeable_state:** `dirty` — conflito com a main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Possivelmente — otimização de CI para não atualizar drafts |
| 2 | Traz regressão? | Risco baixo — lógica condicional adicional em workflow |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Plausível, mas toca `.github/workflows/` — fora do escopo automático |

## Bloqueio atual

- Toca `.github/workflows/` — proibido mergear automaticamente por regra da sessão.
- Conflito de merge (`dirty`).

## Ação necessária

Requer aprovação humana (Joaquim) para verificar mudança no workflow. Resolver conflito antes.
