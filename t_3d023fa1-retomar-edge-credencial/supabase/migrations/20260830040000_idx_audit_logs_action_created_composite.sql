-- 20260830040000_idx_audit_logs_action_created_composite
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 6: Índice composto (action, created_at DESC)
-- CONCURRENTLY não pode rodar em transação; usando CREATE INDEX simples.
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at
ON public.audit_logs (action, created_at DESC);
