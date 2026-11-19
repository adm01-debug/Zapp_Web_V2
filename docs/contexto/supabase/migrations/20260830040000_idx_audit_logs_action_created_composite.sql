-- STEP 6: Índice composto (action, created_at DESC)
-- CONCURRENTLY não pode rodar em transação; usando CREATE INDEX simples.
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at
ON public.audit_logs (action, created_at DESC);
