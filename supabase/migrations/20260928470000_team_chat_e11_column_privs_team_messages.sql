-- Objetivo: Restringir UPDATE em team_messages apenas às colunas content/is_edited/updated_at
-- Estado ao vivo antes: authenticated podia UPDATE qualquer coluna
-- Rollback: GRANT UPDATE ON TABLE public.team_messages TO authenticated

REVOKE UPDATE ON TABLE public.team_messages FROM authenticated;
GRANT UPDATE (content, is_edited, updated_at) ON TABLE public.team_messages TO authenticated;
