# Dossiê PR #2147

**Título:** fix(db-guard): atualiza guard n011-storage-policies-dedup para canônico dinâmico
**Branch:** `claude/fix-db-guard-n011-dedup-261021`
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **auto_merge:** não configurado | **mergeable_state:** dirty

---

## Veredito

**BLOQUEADO_CONFLITO**

PR está com conflitos ativos (mergeable_state: dirty) e o próprio autor indicou "Não mergear: CI repo-wide vermelha".

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivo alterado:** 1 arquivo `scripts/db-audit/n011-storage-policies-dedup.test.mjs`

### Diff lido — resumo

O guard foi reescrito de:
- Antes: assertiva "par duplicado era 2→1" (verificação pontual e estática)
- Depois: "canonico atual + teto dinâmico por dominio" (verificação canônica com teto calculado dinamicamente)

A reescrita remove a asserção hardcoded sobre 2 políticas por domínio e substitui por lógica que:
1. Consulta o estado atual do banco para determinar o canônico
2. Define um teto dinâmico por domínio em vez de valor fixo
3. Falha se houver mais políticas do que o teto calculado

### Evidência de bloqueio

- `mergeable_state: dirty` — conflitos ativos com main
- Descrição da PR contém: "Não mergear: CI repo-wide vermelha" — sinalização explícita do autor

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **CONDICIONALMENTE** — a reescrita do guard parece válida tecnicamente; bloqueada por conflitos e sinalização explícita do autor |
| 2 | Traz regressão? | **RISCO** — reescreve guard de segurança de políticas RLS; não mergeada sem CI verde e resolução de conflitos |
| 3 | Já está em main? | **NÃO** — mergeable_state dirty; PR não mergeada |
| 4 | Regra de negócio correta? | **POSSIVELMENTE** — teto dinâmico é abordagem mais robusta que valor hardcoded; mas requer validação com CI verde |

## Bloqueio

1. `mergeable_state: dirty` — conflitos com main
2. Sinalização explícita do autor: "Não mergear: CI repo-wide vermelha"
3. Sem auto_merge configurado

## Ação necessária

Requer intervenção humana: resolver conflitos, aguardar CI verde, e remover a sinalização "Não mergear" antes de qualquer merge.
