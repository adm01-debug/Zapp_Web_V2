# Dossiê PR #2144

**Título:** chore(ci): GA98 deploy automático de edge functions + docs coerência (2026-10-21)
**Branch:** `claude/chore-ci-ga98-deploy-auto-261021`
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **mergeable_state:** dirty

---

## Veredito

**BLOQUEADO_WORKFLOWS**

PR modifica diretamente 3 arquivos `.github/workflows/` — proibido por regra explícita de sessão.

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 9 arquivos

### Arquivos PROIBIDOS (modificam .github/workflows/):

1. **`.github/workflows/db-guard.yml`** — adiciona step GA98 para validação de coerência de deploy
2. **`.github/workflows/talkx-status-regen.yml`** — remove bloco de concurrency duplicado, adiciona filtro `paths:`
3. **`.github/workflows/notifica-falha-main.yml`** — atualiza comentário de documentação

### Outros arquivos (não-proibidos):

4. `CLAUDE.md` — atualiza informação de agendamentos + Retificação 2026-10-07 sobre deploy automático de edge functions
5. `docs/DEPLOYMENT.md` — atualização de documentação de deploy automático
6. `.github/CODEOWNERS` — atualiza comentário
7. `.github/PULL_REQUEST_TEMPLATE.md` — atualiza nota sobre deploy de edge functions
8. `scripts/ci/docs-deploy-coerencia.unit.mjs` — **NOVO** — script de teste de coerência de docs de deploy
9. `scripts/ci/render-workflow-docs.mjs` — fix de export + correção

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **BLOQUEADA** — modifica 3 arquivos de `.github/workflows/` diretamente |
| 2 | Traz regressão? | **NÃO VERIFICÁVEL** — análise de workflows é FORBIDDEN |
| 3 | Já está em main? | **NÃO** — mergeable_state dirty; PR não mergeada |
| 4 | Regra de negócio correta? | **N/A** — CI/docs only |

## Bloqueio

Regra explícita: "Não tocar .github/workflows." — esta PR modifica explicitamente:
- `.github/workflows/db-guard.yml`
- `.github/workflows/talkx-status-regen.yml`
- `.github/workflows/notifica-falha-main.yml`

## Ação necessária

Requer decisão humana (Joaquim) para revisar e aprovar as mudanças de workflow manualmente.
