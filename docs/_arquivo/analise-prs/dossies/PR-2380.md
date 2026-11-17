# Dossiê PR #2380

**Título:** fix: deno check com --node-modules-dir=none para Edge Functions
**Branch:** `claude/fix-deno-check-node-modules`
**Head SHA:** (conflito — não lido)
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**DECISAO_HUMANA** — potencialmente toca `.github/workflows/` ou configuração de CI

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** configuração de `deno check` nas Edge Functions — `--node-modules-dir=none`.
**mergeable_state:** `dirty` — conflito com a main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Possivelmente — pode estar relacionada ao mesmo problema de #2409 |
| 2 | Traz regressão? | Risco médio — altera comportamento do `deno check` |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Requer verificação — pode conflitar com #2407/#2409 |

## Bloqueio atual

- Conflito de merge (`dirty`).
- Potencial sobreposição com PRs #2407, #2409 (mesma área de deno/Edge Functions).

## Ação necessária

Requer avaliação do Joaquim. Verificar sobreposição com #2407/#2409.
