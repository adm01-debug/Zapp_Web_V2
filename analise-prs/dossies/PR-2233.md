# Dossiê PR #2233

**Título:** fix: corrige 3 falhas de Vitest SL-070, HZ5-09, a11y TTS  
**Branch:** `claude/fix-ci-tests-batch2-2610-1830`  
**Head SHA:** `af0bb57e`  
**Base SHA:** `2d97c44c` (BEHIND main@c4c7139e)  
**Criado em:** 2026-10-24  
**Draft:** Não | **auto_merge:** não configurado  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 8 arquivos, 101 adições, 707 deleções

**Correções incluídas:**
- `useAuth` — limpa fila offline no logout
- `useTeamChatNotifications` — referência UUID correta para canal
- `TtsButton` — aria-labels corrigidas para acessibilidade

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — corrige 3 falhas de Vitest (SL-070, HZ5-09, a11y TTS) |
| 2 | Traz regressão? | **NÃO** — apenas arquivos de teste e acessibilidade; código de produção não é alterado de forma destrutiva |
| 3 | Já está em main? | **NÃO** — diff mostra mudanças não presentes na main |
| 4 | Regra de negócio correta? | **SIM** — limpeza de fila no logout e UUID correto são comportamentos esperados |

## Bloqueio atual

`mergeable_state: "dirty"` — conflitos com main (base `2d97c44c`). Necessário rebase.

## Ação necessária

Rebase na main atual para resolver conflitos. Após CI verde, fazer merge squash.
