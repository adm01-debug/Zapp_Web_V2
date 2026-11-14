SET search_path = public, pg_temp

REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)
  FROM PUBLIC, anon, authenticated

REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated

REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)
  FROM PUBLIC, anon, authenticated

REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)
  FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)
  TO service_role

GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  TO service_role

GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)
  TO service_role

GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)
  TO service_role
