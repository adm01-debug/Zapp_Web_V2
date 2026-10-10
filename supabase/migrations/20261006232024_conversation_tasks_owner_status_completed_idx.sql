-- conversation_tasks_owner_status_completed_idx
-- Rollback: DROP INDEX IF EXISTS public.idx_conversation_tasks_owner_status_completed;
-- Índice composto para a listagem de tarefas do dono por status, ordenada/filtrada
-- por data de conclusão (aba de concluídas). Aditivo: nada em produção depende dele.
-- CREATE INDEX simples (sem CONCURRENTLY): o gateway envolve em transação.

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_owner_status_completed
  ON public.conversation_tasks (created_by, status, completed_at);
