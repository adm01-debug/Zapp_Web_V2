-- Rollback: DROP INDEX IF EXISTS public.idx_conversation_tasks_owner_status_position;
-- conversation_tasks_owner_status_position_idx
-- Índice composto para o kanban do dono: colunas por status ordenadas por position.
-- Origem da coluna position: migration 20260928140000_tasks_unify_reminders_kanban.sql
-- (ADD COLUMN position integer NOT NULL DEFAULT 0 + backfill 0); esta migration só
-- indexa, não cria nem altera a coluna.
-- Aditivo: nada em produção depende dele.
-- CREATE INDEX simples (sem CONCURRENTLY): o gateway envolve em transação.

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_owner_status_position
  ON public.conversation_tasks (created_by, status, position);
