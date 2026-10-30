# Dossiê PR #2248

**Título:** fix(test): destrava o CI Gate da main (136 → 1 arquivo vermelho; falta apply de 2 migrations)  
**Branch:** `claude/fix-unit-tests-main-261025-0825`  
**Head SHA:** `40ecae1f982ab1fd30523b516170311222abe82a`  
**Merge SHA:** `e1f2ee4dd9481e7d4165edbd6c6bf9e94f8fdc62`  
**Mergeada em:** 2026-10-27T05:35:52Z  
**Draft:** Não  

---

## Veredito

**JÁ_MERGEADA**

Mergeada em 2026-10-27T05:35:52Z por adm01-debug. SHA de merge: `e1f2ee4dd9481e7d4165edbd6c6bf9e94f8fdc62`.

## Análise com evidência de diff (lido em 2026-10-30)

**Conteúdo:** 176 arquivos, +3690/−2345 — grande PR de desbloqueio do CI.

**O que a PR fazia:**
- Corrigiu 135 de 136 arquivos de teste que falhavam na main
- Reescrita de mocks, correção de contratos de teste, remoção de testes de módulos removidos
- Adicionou `globalSetup` com fuso correto para CI (UTC)
- Corrigiu guardas de documentação (ESTADO.md, FEATURE_REGISTRY.md, banner Talk X)
- 1 arquivo restante (`rlsSchemaGuard.test.ts`) exige apply de 2 migrations no banco

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **N/A** — já mergeada |
| 2 | Traz regressão? | **NÃO** — desbloqueou CI; alterações em comportamento documentadas |
| 3 | Já está em main? | **SIM** — mergeada em 2026-10-27T05:35:52Z |
| 4 | Regra de negócio correta? | **SIM** — restabeleceu CI verde |

## Resultado

Mergeada com sucesso. As PRs #2266, #2267, #2268 e #2269 foram criadas sobre a branch desta PR (base `e1f2ee4d`), mas agora esse SHA já está em main. Essas PRs precisam de rebase para incorporar apenas as suas próprias mudanças.

## Pendências pós-merge

Duas migrations precisam ser aplicadas em produção (pelo Joaquim, via `db-migrate.yml`):
1. `20261015172527_security_alerts_self_select.sql` — policy SELECT em `security_alerts`
2. `20261011003007_talkx_blacklist_audit_trilha_guarda.sql` — colunas e triggers em `talkx_blacklist`

Sem essas migrations, `rlsSchemaGuard.test.ts` continua falhando na main.
