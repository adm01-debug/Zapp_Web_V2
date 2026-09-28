-- E09: Restringir UPDATE em team_messages apenas para colunas editaveis pelo usuario
-- Previne que um usuario altere sender_id, conversation_id, created_at, etc.

-- Remover permissao de UPDATE geral
REVOKE UPDATE ON TABLE public.team_messages FROM authenticated;

-- Conceder UPDATE apenas nas colunas seguras
GRANT UPDATE (content, is_edited, updated_at, status) ON TABLE public.team_messages TO authenticated;
