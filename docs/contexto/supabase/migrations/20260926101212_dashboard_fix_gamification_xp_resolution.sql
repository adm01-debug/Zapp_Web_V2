CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_achievements_one_time
  ON public.agent_achievements (profile_id, achievement_type)
  WHERE achievement_type NOT IN ('daily_goal','streak','message_milestone','resolution');

CREATE OR REPLACE FUNCTION public.grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_stats WHERE profile_id = p_profile_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type) WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.agent_stats
  SET xp = xp + p_xp_reward,
      achievements_count = achievements_count + 1,
      updated_at = now()
  WHERE profile_id = p_profile_id;
END;
$function$;
