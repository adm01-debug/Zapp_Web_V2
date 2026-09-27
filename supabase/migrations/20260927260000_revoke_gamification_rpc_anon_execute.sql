-- Funções RPC de gamificação (SECURITY DEFINER) tinham EXECUTE concedido
-- para anon com guard lógico defeituoso: `auth.uid() IS NOT NULL AND NOT (...)`
-- avalia como FALSE para anon (uid = NULL), deixando passar sem restrição.
-- REVOKE fecha o vetor imediatamente; authenticated continua com acesso.
-- TODO: corrigir o guard para `auth.uid() IS NULL OR NOT (...)` em migration futura.
REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean) FROM anon;
