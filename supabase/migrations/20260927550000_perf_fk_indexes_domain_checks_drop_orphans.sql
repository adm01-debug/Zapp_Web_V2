-- perf: FK indexes, domain CHECKs, drop orphan indexes
-- Applied 2026-09-27 via MCP (prose ledger).
-- Ledger name: perf_fk_indexes_domain_checks_drop_orphans
-- Corrected version of 450000 (NOT VALID keyword fixed; CONCURRENTLY omitted since
-- MCP gateway wraps in transaction; constraint on contacts omitted as not confirmed in prod).

CREATE INDEX IF NOT EXISTS idx_team_conv_direct_member_b
  ON public.team_conversations (direct_member_b);

CREATE INDEX IF NOT EXISTS idx_team_msg_receipts_profile_id
  ON public.team_message_receipts (profile_id);

CREATE INDEX IF NOT EXISTS idx_dept_audit_logs_profile_id
  ON public.department_audit_logs (profile_id);

CREATE INDEX IF NOT EXISTS idx_dept_invites_created_by
  ON public.department_invites (created_by);

ALTER TABLE public.agent_stats
  ADD CONSTRAINT chk_xp_non_negative
  CHECK (xp >= 0)
  NOT VALID;

ALTER TABLE public.agent_stats
  VALIDATE CONSTRAINT chk_xp_non_negative;

ALTER TABLE public.agent_stats
  ADD CONSTRAINT chk_level_min_one
  CHECK (level >= 1)
  NOT VALID;

ALTER TABLE public.agent_stats
  VALIDATE CONSTRAINT chk_level_min_one;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_audit_logs_user_created') THEN
    DROP INDEX IF EXISTS public.idx_audit_logs_user_created;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_conversation_events_from_queue_id') THEN
    DROP INDEX IF EXISTS public.idx_conversation_events_from_queue_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_conversation_events_to_queue_id') THEN
    DROP INDEX IF EXISTS public.idx_conversation_events_to_queue_id;
  END IF;
END $$;
