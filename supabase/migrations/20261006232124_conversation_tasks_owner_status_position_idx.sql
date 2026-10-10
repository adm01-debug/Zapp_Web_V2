-- conversation_tasks_owner_status_position_idx
-- Rollback: DROP INDEX IF EXISTS public.idx_conversation_tasks_owner_status_position;
-- Índice composto para o kanban do dono: colunas por status ordenadas por position.
-- Aditivo: nada em produção depende dele.
-- CREATE INDEX simples (sem CONCURRENTLY): o gateway envolve em transação.

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_owner_status_position
  ON public.conversation_tasks (created_by, status, position);
