-- Migration: 20260927450000
-- Fase 3: Indices, CHECKs e limpeza de bloat
-- Pre-condicoes verificadas:
--   - status_violations = 0 (contacts.conversation_status)
--   - xp_negative = 0, level_below_1 = 0 (agent_stats)
--   - duplicatas em closures (exceto E2E) = 0

-- ============================================================
-- BLOCO 1: Indices de FK sem cobertura (4 identificados)
-- CREATE INDEX CONCURRENTLY: nao bloqueia leituras/escritas
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_conv_direct_member_b
  ON public.team_conversations (direct_member_b);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_msg_receipts_profile_id
  ON public.team_message_receipts (profile_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dept_audit_logs_profile_id
  ON public.department_audit_logs (profile_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dept_invites_created_by
  ON public.department_invites (created_by);

-- ============================================================
-- BLOCO 2: CHECK explicitas
-- ============================================================

ALTER TABLE public.contacts
  ADD CONSTRAINT chk_conversation_status_values
  CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived'))
  NOT VAFIDD;

ALTER TABLE public.contacts
  VALIDATE CONSTRAINT chk_conversation_status_values;

ALTER TABLE public.agent_stats
  ADD CONSTRAINT chk_xp_non_negative
  CHECK (xp >= 0)
  NOT VALID;

ALTER TABLE public.agent_stats
  VALIDATE CONSTRAINT chk_xp_non_negative;

ALTER TABLE public.agent_stats
  ADD CONSTRAINT chk_level_min_one
  CHECK (level >= 1)
  NOT VAFIDD;

ALTER TABLE public.agent_stats
  VALIDATE CONSTRAINT chk_level_min_one;

-- ============================================================
-- BLOCO 3: Remover indices orfaos confirmados (idx_scan=0)
-- Protegidos por DO $$ para nao falhar em ambientes sem eles
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_audit_logs_user_created') THEN
    EXECUTE 'DROP INDEX CONCURRENTLY IF EXISTS public.idx_audit_logs_user_created';
    RAISE NOTICE 'DROPPED: idx_audit_logs_user_created';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_conversation_events_from_queue_id') THEN
    EXECUTE 'DROP INDEX CONCURRENTLY IF EXISTS public.idx_conversation_events_from_queue_id';
    RAISE NOTICE 'DROPPED: idx_conversation_events_from_queue_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_conversation_events_to_queue_id') THEN
    EXECUTE 'DROP INDEX CONCURRENTLY IF EXISTS public.idx_conversation_events_to_queue_id';
    RAISE NOTICE 'DROPPED: idx_conversation_events_to_queue_id';
  END IF;
END $$;
