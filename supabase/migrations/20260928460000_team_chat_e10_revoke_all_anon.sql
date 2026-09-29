-- Objetivo: Revogar ALL da role anon nas 9 tabelas team-chat
-- Estado ao vivo antes: anon tinha acesso — aplicado sem arquivo no branch
-- Rollback: GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<tabela> TO anon

REVOKE ALL ON TABLE public.team_conversations FROM anon;
REVOKE ALL ON TABLE public.team_conversation_members FROM anon;
REVOKE ALL ON TABLE public.team_messages FROM anon;
REVOKE ALL ON TABLE public.team_message_reactions FROM anon;
REVOKE ALL ON TABLE public.team_message_receipts FROM anon;
REVOKE ALL ON TABLE public.departments FROM anon;
REVOKE ALL ON TABLE public.department_invitations FROM anon;
REVOKE ALL ON TABLE public.department_invites FROM anon;
REVOKE ALL ON TABLE public.department_audit_logs FROM anon;
