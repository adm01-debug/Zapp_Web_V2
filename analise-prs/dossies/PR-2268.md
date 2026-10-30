# Dossiê PR #2268

**Título:** fix: supervisor volta a gerenciar templates WhatsApp e Base de Conhecimento não trava em erro de rede  
**Branch:** `claude/fix-templates-supervisor-knowledge-261025-2110`  
**Head SHA:** `101da096`  
**Base SHA:** `e1f2ee4d` (= branch da PR #2248, NÃO main)  
**Criado em:** 2026-10-25  
**Draft:** Não | **auto_merge:** squash  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 173 arquivos, 3607 adições, 2224 deleções  
*(diff enorme porque inclui todos os commits da PR #2248 + mudanças próprias)*

**Mudanças próprias (sobre a base #2248):**
- `WhatsAppTemplatesManager` — gate `isAdmin` → `isSupervisor` (supervisor voltou a ter acesso)
- `useKnowledgeBase` — try/catch/finally para estado de loading em erro de rede

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — corrige regressão de permissão (supervisor sem acesso a templates) e trava de UI |
| 2 | Traz regressão? | **NÃO** — restaura comportamento esperado e adiciona tratamento de erro |
| 3 | Já está em main? | **NÃO** — stacked sobre PR #2248 que ainda não mergeou |
| 4 | Regra de negócio correta? | **SIM** — supervisor deve gerenciar templates; UI não deve travar em erro de rede |

## Bloqueio atual

`mergeable_state: "dirty"` — PR tem base `e1f2ee4d` (merge da #2248 que já entrou em main em 2026-10-27), mas a main avançou depois criando novos conflitos.

**A PR #2248 já mergeou. Esta PR precisa de rebase na main atual.**

## Ação necessária

1. Rebase na main atual (eliminar os ~100 commits da base #2248, incorporar apenas as mudanças próprias)
2. Aguardar CI verde
3. Merge squash (auto_merge:squash já configurado)
