# Dossiê PR #2409

**Título:** fix(ci): deno install com --frozen=false e @types/node no deploy-functions
**Branch:** `claude/fix-ci-deno-install-frozen`
**Head SHA:** `a9ec56bf4fd5c2b0bd6492bd22bef711515bd1de`
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**DECISAO_HUMANA** — toca `.github/workflows/`

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** `.github/workflows/deploy-functions.yml` — `deno install --frozen=false` e instalação de `@types/node`.
**mergeable_state:** `blocked` — CI em andamento.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Possivelmente — pode estar relacionada ao mesmo problema de #2407 e #2408 |
| 2 | Traz regressão? | Risco baixo — `--frozen=false` permite atualizar lockfile |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Plausível, mas toca `.github/workflows/` — fora do escopo automático |

## Bloqueio atual

- Toca `.github/workflows/` — proibido mergear automaticamente por regra da sessão.
- Potencial sobreposição com #2407 e #2408.

## Ação necessária

Requer aprovação humana (Joaquim). Coordenar com #2407 e #2408 para escolher a solução definitiva.
