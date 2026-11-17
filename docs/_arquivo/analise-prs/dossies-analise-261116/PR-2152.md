# Dossiê PR #2152

**Título:** (ver via API — depende de PR2148)
**Branch:** verificar via API
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **auto_merge:** não configurado | **mergeable_state:** dirty

---

## Veredito

**BLOQUEADO_CONFLITO**

PR está com conflitos ativos (mergeable_state: dirty), sem auto_merge, e declara dependência em PR2148 (que também está bloqueada).

## Análise com evidência de diff (lido em 2026-10-30)

**Sobreposição declarada:** PR2148 e PR2152 compartilham arquivos (`e2e/fixtures/mapa-mocks.ts` e outros do mesmo domínio). PR2152 declara que depende de PR2148 ser mergeada primeiro.

**mergeable_state:** `dirty` — conflitos ativos com main.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **CONDICIONALMENTE** — bloqueada por dependência em PR2148 e conflitos |
| 2 | Traz regressão? | **NÃO VERIFICÁVEL** — conflitos ativos impedem análise completa |
| 3 | Já está em main? | **NÃO** — mergeable_state dirty; PR não mergeada |
| 4 | Regra de negócio correta? | **NÃO VERIFICÁVEL** — análise bloqueada por conflitos e dependência |

## Dependência

PR2148 (a11y FAB e cabeçalho fixtures) também está bloqueada (dirty + PR2135 fechada sem merge). Esta PR não pode avançar enquanto PR2148 não for resolvida.

## Bloqueio

1. `mergeable_state: dirty` — conflitos ativos com main
2. Sem auto_merge configurado
3. Dependência declarada em PR2148 (também bloqueada)

## Ação necessária

1. Resolver PR2148 primeiro (verificar dependência em PR2135, resolver conflitos)
2. Então resolver conflitos desta PR
3. Merger manual após CI verde
