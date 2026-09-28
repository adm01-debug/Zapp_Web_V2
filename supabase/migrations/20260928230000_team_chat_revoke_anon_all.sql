-- E08: REVOKE ALL de anon nas 9 tabelas team_* e departments
-- anon nao deve ter nenhum acesso direto a dados internos de equipe

REVOKE ALL ON TABLE public.team_conversations FROM anon;
REVOKE ALL ON TABLE public.team_conversation_members FROM anon;
REVOKE ALL ON TABLE public.team_messages FROM anon;
REVOKE ALL ON TABLE public.team_message_reactions FROM anon;
REVOKE ALL ON TABLE public.team_message_receipts FROM anon;
REVOKE ALL ON TABLE public.departments FROM anon;
REVOKE ALL ON TABLE public.department_invitations FROM anon;
REVOKE ALL ON TABLE public.department_audit_logs FROM anon;

-- Garantir que as sequences tambem estao protegidas
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
