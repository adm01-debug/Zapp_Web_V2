-- Objetivo: Revogar TRUNCATE/TRIGGER/REFERENCES das 9 tabelas team-chat de anon e authenticated
-- Estado ao vivo antes: privilégios DDL acessíveis — aplicado sem arquivo no branch
-- Rollback: GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLE public.<tabela> TO anon, authenticated

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_conversations FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_conversation_members FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_messages FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_message_reactions FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.team_message_receipts FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.departments FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_invitations FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_invites FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_audit_logs FROM anon, authenticated;
