SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.update_agent_streak(
  p_profile_id uuid,
  p_increment boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_increment THEN
    UPDATE public.profiles
    SET
      current_streak = COALESCE(current_streak, 0) + 1,
      best_streak    = GREATEST(COALESCE(best_streak, 0), COALESCE(current_streak, 0) + 1),
      last_streak_at = now()
    WHERE id = p_profile_id;
  ELSE
    UPDATE public.profiles
    SET current_streak = 0
    WHERE id = p_profile_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agent_streak(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_agent_resolutions(
  p_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
  SET total_resolutions = COALESCE(total_resolutions, 0) + 1
  WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_agent_resolutions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid) TO service_role;
