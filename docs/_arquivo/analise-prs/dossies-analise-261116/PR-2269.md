# Dossiê PR #2269

**Título:** fix: Talk X segmentos sem estimativa enganosa  
**Branch:** `claude/fix-talkx-segmentos-estimativa-261025-2110`  
**Head SHA:** `ccd09beb`  
**Base SHA:** `e1f2ee4d` (= branch da PR #2248, NÃO main)  
**Criado em:** 2026-10-25  
**Draft:** Não | **auto_merge:** squash  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 173 arquivos, 3760 adições, 2222 deleções  
*(diff enorme porque inclui todos os commits da PR #2248 + mudanças próprias)*

**Mudanças próprias (sobre a base #2248):**
- `real_sector`/`real_uf` marcados como `comingSoon` (sem estimativa enganosa)
- `Promise.allSettled` para `refreshEstimates` (não aborta em erro parcial)
- Estimativa `null` para grupos só com segmentos `comingSoon`
- Cleanup de segmentos fantasma

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — evita exibir estimativas falsas para segmentos não suportados |
| 2 | Traz regressão? | **NÃO** — torna a UI mais honesta (null em vez de número falso) |
| 3 | Já está em main? | **NÃO** — stacked sobre PR #2248 que ainda não mergeou |
| 4 | Regra de negócio correta? | **SIM** — segmento "em breve" não deve ter estimativa de alcance exibida |

## Bloqueio atual

`mergeable_state: "dirty"` — PR tem base `e1f2ee4d` (merge da #2248 que já entrou em main em 2026-10-27), mas a main avançou depois criando novos conflitos.

**A PR #2248 já mergeou. Esta PR precisa de rebase na main atual.**

## Ação necessária

1. Rebase na main atual (eliminar os ~100 commits da base #2248, incorporar apenas as mudanças próprias)
2. Aguardar CI verde
3. Merge squash (auto_merge:squash já configurado)
