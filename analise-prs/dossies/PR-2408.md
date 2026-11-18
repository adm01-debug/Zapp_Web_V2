# Dossiê PR #2408

**Título:** fix(ci): corrige entrada duplicada no deploy-functions
**Branch:** `claude/fix-ci-deploy-functions-duplicate`
**Head SHA:** `f4a6203887938a6e667e85f7c1da8295d6886105`
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**BLOQUEADO_CI** (também DECISAO_HUMANA — toca `.github/workflows/` e tem conflito)

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** `.github/workflows/deploy-functions.yml` e possivelmente outros — remove entrada duplicada.
**mergeable_state:** `dirty` — conflito com a main.
**Tipo:** Fix de CI + toca workflows.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Possivelmente — mas conflita com #2407 e #2409 (mesma área) |
| 2 | Traz regressão? | Risco — altera workflow de deploy; duplicata removida pode ter efeito lateral |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Requer verificação — conflito e sobreposição com outras PRs |

## Bloqueio atual

- Conflito de merge (`dirty`).
- Toca `.github/workflows/` — proibido mergear automaticamente.
- Sobreposição com #2407 e #2409.

## Ação necessária

Requer avaliação do Joaquim. Coordenar com #2407 e #2409 — resolver qual das três é a definitiva.
