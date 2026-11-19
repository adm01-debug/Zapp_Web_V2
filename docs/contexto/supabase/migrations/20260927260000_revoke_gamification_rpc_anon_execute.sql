REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer) FROM anon

REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) FROM anon

REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) FROM anon

REVOKE EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid) FROM anon

REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean) FROM anon
