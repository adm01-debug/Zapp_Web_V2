-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928450000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_conversations FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_conversation_members FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_messages FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_message_reactions FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_message_receipts FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.departments FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_invitations FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_invites FROM anon, authenticated;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_audit_logs FROM anon, authenticated;
