# Dossiê PR #2267

**Título:** fix: fila de envio offline não entrega item sem dono e não ressuscita após logout  
**Branch:** `claude/fix-fila-offline-sem-dono-261025-2110`  
**Head SHA:** `e84afb82`  
**Base SHA:** `e1f2ee4d` (= branch da PR #2248, NÃO main)  
**Criado em:** 2026-10-25  
**Draft:** Não | **auto_merge:** squash  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 175 arquivos, 3712 adições, 2213 deleções  
*(diff enorme porque inclui todos os commits da PR #2248 + mudanças próprias)*

**Mudanças próprias (sobre a base #2248):**
- `pertenceAoUsuarioAtual` retorna `false` para item sem `userId`
- `clear()` incrementa contador de geração (evita ressurreição após logout)
- `remaining`/`snapshot` filtram por usuário correto
- `authenticatedUserId` lê token específico do projeto

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — corrige bug de segurança: fila offline não deve entregar mensagens de outro usuário |
| 2 | Traz regressão? | **NÃO** — narrowing de comportamento (rejeitar itens sem dono é mais seguro) |
| 3 | Já está em main? | **NÃO** — stacked sobre PR #2248 que ainda não mergeou |
| 4 | Regra de negócio correta? | **SIM** — item da fila sem dono nunca deve ser entregue; logout deve limpar fila |

## Bloqueio atual

`mergeable_state: "dirty"` — PR tem base `e1f2ee4d` (merge da #2248 que já entrou em main em 2026-10-27), mas a main avançou depois criando novos conflitos.

**A PR #2248 já mergeou. Esta PR precisa de rebase na main atual.**

## Ação necessária

1. Rebase na main atual (eliminar os ~100 commits da base #2248, incorporar apenas as mudanças próprias)
2. Aguardar CI verde
3. Merge squash (auto_merge:squash já configurado)
