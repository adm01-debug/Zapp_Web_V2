CREATE OR REPLACE FUNCTION public.grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text DEFAULT NULL::text, p_xp_reward integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
  v_row         agent_stats%ROWTYPE;
  v_new_xp      bigint;
  v_new_level   int;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_xp_reward < 0 THEN
    RAISE EXCEPTION 'p_xp_reward cannot be negative, got %', p_xp_reward;
  END IF;

  IF p_xp_reward > 500 THEN
    RAISE EXCEPTION 'p_xp_reward exceeds single-call maximum of 500, got %', p_xp_reward;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('alreadyHad', false); END IF;

  IF p_type = 'daily_goal' AND EXISTS (
    SELECT 1 FROM agent_achievements
    WHERE profile_id = p_profile_id
      AND achievement_type = 'daily_goal'
      AND (earned_at AT TIME ZONE 'America/Sao_Paulo')::date
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ) THEN
    RETURN json_build_object('alreadyHad', true);
  END IF;

  INSERT INTO agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type)
    WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN json_build_object('alreadyHad', true);
  END IF;

  v_new_xp    := v_row.xp + p_xp_reward;
  v_new_level := GREATEST(1, FLOOR(SQRT(GREATEST(0, v_new_xp) / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp                 = v_new_xp,
      level              = v_new_level,
      achievements_count = achievements_count + 1,
      updated_at         = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'alreadyHad', false,
    'newXp',      v_new_xp,
    'newLevel',   v_new_level,
    'leveledUp',  v_new_level > v_row.level
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) TO authenticated, service_role