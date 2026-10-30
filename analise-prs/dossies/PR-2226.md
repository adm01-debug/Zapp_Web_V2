# Dossiê PR #2226

**Título:** fix(db-guard): corrige assertion B.0c no TC-009 — backfill não deve disparar trigger de update  
**Branch:** `claude/fix-db-guard-b0c-261024-1527`  
**Head SHA:** `4aab75adfeeb4b7383d2b05f514c82700e3258b6`  
**Base SHA:** `b1fe88215b4861121c912140d7968581e26e9111` (BEHIND main@c4c7139e)  
**Criado em:** 2026-10-24  
**Draft:** Não | **auto_merge:** não configurado  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivo alterado:** `supabase/migrations/20261009193246_team_receipts_reactions_conversation_id_forced.sql` (1 arquivo, 7 adições, 0 deleções)

```sql
-- Adicionado antes dos dois UPDATEs de backfill:
SET LOCAL session_replication_role = replica;
-- ... UPDATE team_message_receipts SET conversation_id = ...
SET LOCAL session_replication_role = DEFAULT;
```

O trigger `team_message_receipts_update_guard_trig` (BEFORE UPDATE) preenchia `read_at=now()` como efeito colateral do backfill, fazendo a assertion B.0c do TC-009 retornar `0` em vez de `1`. `SET LOCAL session_replication_role = replica` é transaction-scoped (safe) e desabilita triggers de usuário apenas durante os dois DMLs de reconciliação.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — fix cirúrgico de migration existente que faz assertion de db-guard falhar |
| 2 | Traz regressão? | **NÃO** — `SET LOCAL` é transaction-scoped; só afeta os dois UPDATEs do backfill; coluna `read_at` preservada corretamente |
| 3 | Já está em main? | **NÃO** — diff mostra +SET LOCAL lines |
| 4 | Regra de negócio correta? | **SIM** — backfill de `conversation_id` não deve alterar `read_at`; `replica` é o mecanismo correto para suprimir triggers durante backfill |

## Bloqueio atual

`mergeable_state: "dirty"` — conflitos com main (base `b1fe8821`). Mudança é pequena (7 linhas em migration existente).

## Ação necessária

Rebase na main atual para resolver conflitos. Após CI verde, fazer merge squash.
