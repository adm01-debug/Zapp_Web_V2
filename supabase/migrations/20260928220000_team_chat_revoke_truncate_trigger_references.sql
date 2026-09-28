-- E07: REVOKE TRUNCATE, TRIGGER e REFERENCES de anon+authenticated nas 9 tabelas team_*
-- Previne destruicao de dados via TRUNCATE (que bypassa RLS) e criacao de FKs/triggers externos

REVOKE TRUNCATE ON TABLE public.team_conversations FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.team_conversation_members FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.team_messages FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.team_message_reactions FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.team_message_receipts FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.departments FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.department_invitations FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.department_audit_logs FROM anon, authenticated;

REVOKE TRIGGER ON TABLE public.team_conversations FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.team_conversation_members FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.team_messages FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.team_message_reactions FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.team_message_receipts FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.departments FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.department_invitations FROM anon, authenticated;
REVOKE TRIGGER ON TABLE public.department_audit_logs FROM anon, authenticated;

REVOKE REFERENCES ON TABLE public.team_conversations FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.team_conversation_members FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.team_messages FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.team_message_reactions FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.team_message_receipts FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.departments FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.department_invitations FROM anon, authenticated;
REVOKE REFERENCES ON TABLE public.department_audit_logs FROM anon, authenticated;
