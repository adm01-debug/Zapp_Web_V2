-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929250000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

COMMENT ON TABLE public.team_conversations IS 'Chat conversations between team members (direct, group, department)';

COMMENT ON TABLE public.team_conversation_members IS 'Members of a team conversation with read/mute state';

COMMENT ON TABLE public.team_messages IS 'Messages within a team conversation';

COMMENT ON TABLE public.team_message_reactions IS 'Emoji reactions on team messages (one per user per emoji per message)';

COMMENT ON TABLE public.team_message_receipts IS 'Delivery and read receipts for team messages';

COMMENT ON TABLE public.departments IS 'Organizational departments; each may own a team_conversation of type=department';

COMMENT ON TABLE public.department_invitations IS 'Pending invitations to join a department (token-based)';

COMMENT ON TABLE public.department_audit_logs IS 'Immutable audit trail for department membership and config changes';

COMMENT ON COLUMN public.team_messages.sender_id IS 'References profiles.id (NOT auth.uid)';

COMMENT ON COLUMN public.team_conversations.created_by IS 'profiles.id of creator';

COMMENT ON COLUMN public.team_message_receipts.profile_id IS 'profiles.id of recipient — sender cannot have own receipt (enforced by trigger)';
